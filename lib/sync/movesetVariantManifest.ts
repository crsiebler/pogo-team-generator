import { createHash } from 'crypto';
import type { BattleFormat } from '@/lib/data/battleFormats';
import {
  MAX_ACTIVE_MOVESET_VARIANTS,
  MAX_MOVESET_CANDIDATES,
  MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
  MOVESET_VARIANT_SCENARIOS,
  parseMovesetVariantManifestJson,
  serializeMovesetVariantManifest,
  type MovesetVariantDerivationSettings,
  type MovesetVariantManifest,
  type MovesetVariantManifestSpecies,
  type MovesetVariantScenarioRecord,
  type MovesetVariantSourceDigest,
} from '@/lib/data/movesetVariantManifest';
import { scoreMatchupRating } from '@/lib/genetic/fitness/matchupScoring';
import type { MovesetVariantId, ShieldScenarioKey } from '@/lib/types';

const TOP_META_WEIGHT = 0.7;
const FULL_META_WEIGHT = 0.3;
const IMPROVEMENT_EPSILON = 1e-12;

/** One finite battle rating for a canonical opponent. */
export interface MovesetVariantSimulationMatchup {
  readonly opponentId: string;
  readonly rating: number;
}

/** Scenario simulation evidence for one bounded moveset candidate. */
export interface MovesetVariantSimulationEvidence {
  readonly id: MovesetVariantId;
  readonly isDefault: boolean;
  readonly scenarios: MovesetVariantScenarioRecord<
    readonly MovesetVariantSimulationMatchup[] | null
  >;
}

/** Inputs for deterministic active moveset variant selection. */
export interface SelectActiveMovesetVariantsInput {
  readonly candidates: readonly MovesetVariantSimulationEvidence[];
  readonly topMetaOpponentIds: readonly string[];
  readonly fullMetaOpponentIds: readonly string[];
}

/** Selection diagnostics for one simulation-backed candidate. */
export interface MovesetVariantSelectionCandidate {
  readonly id: MovesetVariantId;
  readonly isDefault: boolean;
  readonly completeness: MovesetVariantScenarioRecord<boolean>;
  readonly evaluationCounts: MovesetVariantScenarioRecord<number>;
  readonly eligible: boolean;
  readonly weightedImprovement: number | null;
  readonly topMetaImprovement: number | null;
  readonly fullMetaImprovement: number | null;
  readonly marginalImprovement: number | null;
  readonly active: boolean;
}

/** Default-first active variants and candidate selection diagnostics. */
export interface ActiveMovesetVariantSelection {
  readonly activeVariantIds: readonly MovesetVariantId[];
  readonly candidates: readonly MovesetVariantSelectionCandidate[];
}

interface CandidateEvaluation {
  readonly evidence: MovesetVariantSimulationEvidence;
  readonly ratings: MovesetVariantScenarioRecord<ReadonlyMap<string, number>>;
  readonly completeness: MovesetVariantScenarioRecord<boolean>;
  readonly evaluationCounts: MovesetVariantScenarioRecord<number>;
  readonly eligible: boolean;
  readonly weightedImprovement: number | null;
  readonly topMetaImprovement: number | null;
  readonly fullMetaImprovement: number | null;
}

interface Improvement {
  readonly weighted: number;
  readonly topMeta: number;
  readonly fullMeta: number;
}

/** Pure inputs required to construct one generated manifest. */
export interface BuildMovesetVariantManifestInput {
  readonly format: BattleFormat;
  readonly policyVersion: string;
  readonly sourceDigests: readonly MovesetVariantSourceDigest[];
  readonly derivationSettings: MovesetVariantDerivationSettings;
  readonly species: readonly MovesetVariantManifestSpecies[];
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareImprovementDescending(left: number, right: number): number {
  const leftRank = Math.round(left / IMPROVEMENT_EPSILON);
  const rightRank = Math.round(right / IMPROVEMENT_EPSILON);
  return leftRank > rightRank ? -1 : leftRank < rightRank ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): readonly string[] {
  return [...new Set(values)].sort(compareAscii);
}

function createScenarioRecord<Value>(
  createValue: (scenario: ShieldScenarioKey) => Value,
): MovesetVariantScenarioRecord<Value> {
  return {
    '0-0': createValue('0-0'),
    '1-1': createValue('1-1'),
    '2-2': createValue('2-2'),
  };
}

function getScenarioRatings(
  matchups: readonly MovesetVariantSimulationMatchup[] | null,
): ReadonlyMap<string, number> {
  const ratings = new Map<string, number>();
  if (!matchups) {
    return ratings;
  }

  for (const matchup of matchups) {
    if (
      !matchup.opponentId ||
      !Number.isFinite(matchup.rating) ||
      ratings.has(matchup.opponentId)
    ) {
      continue;
    }
    ratings.set(matchup.opponentId, matchup.rating);
  }
  return ratings;
}

function getPoolImprovement(
  candidate: CandidateEvaluation,
  baseline: CandidateEvaluation,
  opponentIds: readonly string[],
): number {
  let total = 0;
  let count = 0;
  for (const scenario of MOVESET_VARIANT_SCENARIOS) {
    const candidateRatings = candidate.ratings[scenario];
    const baselineRatings = baseline.ratings[scenario];
    for (const opponentId of opponentIds) {
      const candidateRating = candidateRatings.get(opponentId);
      const baselineRating = baselineRatings.get(opponentId);
      if (candidateRating === undefined || baselineRating === undefined) {
        continue;
      }
      total +=
        scoreMatchupRating(candidateRating) -
        scoreMatchupRating(baselineRating);
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

function getImprovement(
  candidate: CandidateEvaluation,
  baseline: CandidateEvaluation,
  topMetaOpponentIds: readonly string[],
  fullMetaOpponentIds: readonly string[],
): Improvement {
  const topMeta = getPoolImprovement(candidate, baseline, topMetaOpponentIds);
  const fullMeta = getPoolImprovement(candidate, baseline, fullMetaOpponentIds);
  return {
    weighted: topMeta * TOP_META_WEIGHT + fullMeta * FULL_META_WEIGHT,
    topMeta,
    fullMeta,
  };
}

function getPoolMarginalImprovement(
  candidate: CandidateEvaluation,
  defaultCandidate: CandidateEvaluation,
  primaryCandidate: CandidateEvaluation,
  opponentIds: readonly string[],
): number {
  let total = 0;
  let count = 0;
  for (const scenario of MOVESET_VARIANT_SCENARIOS) {
    for (const opponentId of opponentIds) {
      const candidateRating = candidate.ratings[scenario].get(opponentId);
      const defaultRating = defaultCandidate.ratings[scenario].get(opponentId);
      const primaryRating = primaryCandidate.ratings[scenario].get(opponentId);
      if (
        candidateRating === undefined ||
        defaultRating === undefined ||
        primaryRating === undefined
      ) {
        continue;
      }
      total += Math.max(
        0,
        scoreMatchupRating(candidateRating) -
          Math.max(
            scoreMatchupRating(defaultRating),
            scoreMatchupRating(primaryRating),
          ),
      );
      count += 1;
    }
  }
  return count === 0 ? 0 : total / count;
}

function getMarginalImprovement(
  candidate: CandidateEvaluation,
  defaultCandidate: CandidateEvaluation,
  primaryCandidate: CandidateEvaluation,
  topMetaOpponentIds: readonly string[],
  fullMetaOpponentIds: readonly string[],
): Improvement {
  const topMeta = getPoolMarginalImprovement(
    candidate,
    defaultCandidate,
    primaryCandidate,
    topMetaOpponentIds,
  );
  const fullMeta = getPoolMarginalImprovement(
    candidate,
    defaultCandidate,
    primaryCandidate,
    fullMetaOpponentIds,
  );
  return {
    weighted: topMeta * TOP_META_WEIGHT + fullMeta * FULL_META_WEIGHT,
    topMeta,
    fullMeta,
  };
}

function comparePrimaryCandidates(
  left: CandidateEvaluation,
  right: CandidateEvaluation,
): number {
  return (
    compareImprovementDescending(
      left.weightedImprovement ?? 0,
      right.weightedImprovement ?? 0,
    ) ||
    compareImprovementDescending(
      left.topMetaImprovement ?? 0,
      right.topMetaImprovement ?? 0,
    ) ||
    compareImprovementDescending(
      left.fullMetaImprovement ?? 0,
      right.fullMetaImprovement ?? 0,
    ) ||
    compareAscii(left.evidence.id, right.evidence.id)
  );
}

/**
 * Select the default and at most two complete, beneficial alternatives.
 * Missing or non-finite matchup rows are unevaluated and cannot activate an
 * alternate; comparisons use identical explicit opponent pools and scenarios.
 */
export function selectActiveMovesetVariants(
  input: SelectActiveMovesetVariantsInput,
): ActiveMovesetVariantSelection {
  if (
    input.candidates.length === 0 ||
    input.candidates.length > MAX_MOVESET_CANDIDATES
  ) {
    throw new Error(
      `Moveset variant selection requires between 1 and ${MAX_MOVESET_CANDIDATES} candidates`,
    );
  }
  const candidateIds = new Set<MovesetVariantId>();
  for (const candidate of input.candidates) {
    if (candidateIds.has(candidate.id)) {
      throw new Error(`Duplicate moveset variant candidate '${candidate.id}'`);
    }
    candidateIds.add(candidate.id);
  }
  const defaults = input.candidates.filter(({ isDefault }) => isDefault);
  if (defaults.length !== 1) {
    throw new Error('Moveset variant selection requires exactly one default');
  }

  const topMetaOpponentIds = uniqueSorted(input.topMetaOpponentIds);
  const fullMetaOpponentIds = uniqueSorted(input.fullMetaOpponentIds);
  const expectedOpponentIds = uniqueSorted([
    ...topMetaOpponentIds,
    ...fullMetaOpponentIds,
  ]);
  const hasSufficientPools =
    topMetaOpponentIds.length > 0 && fullMetaOpponentIds.length > 0;
  const baseEvaluations = input.candidates.map((evidence) => {
    const ratings = createScenarioRecord((scenario) =>
      getScenarioRatings(evidence.scenarios[scenario]),
    );
    const evaluationCounts = createScenarioRecord(
      (scenario) =>
        expectedOpponentIds.filter((opponentId) =>
          ratings[scenario].has(opponentId),
        ).length,
    );
    const completeness = createScenarioRecord(
      (scenario) =>
        evidence.scenarios[scenario] !== null &&
        evaluationCounts[scenario] === expectedOpponentIds.length &&
        expectedOpponentIds.length > 0,
    );
    return {
      evidence,
      ratings,
      completeness,
      evaluationCounts,
      eligible:
        hasSufficientPools &&
        MOVESET_VARIANT_SCENARIOS.every((scenario) => completeness[scenario]),
      weightedImprovement: null,
      topMetaImprovement: null,
      fullMetaImprovement: null,
    } satisfies CandidateEvaluation;
  });
  const defaultCandidate = baseEvaluations.find(
    ({ evidence }) => evidence.isDefault,
  )!;
  const evaluations = baseEvaluations.map((candidate): CandidateEvaluation => {
    if (candidate.evidence.isDefault || !candidate.eligible) {
      return candidate;
    }
    const improvement = getImprovement(
      candidate,
      defaultCandidate,
      topMetaOpponentIds,
      fullMetaOpponentIds,
    );
    return {
      ...candidate,
      eligible: candidate.eligible && defaultCandidate.eligible,
      weightedImprovement: improvement.weighted,
      topMetaImprovement: improvement.topMeta,
      fullMetaImprovement: improvement.fullMeta,
    };
  });
  const evaluatedDefault = evaluations.find(
    ({ evidence }) => evidence.isDefault,
  )!;
  const primaryCandidates = evaluations
    .filter(
      (candidate) =>
        !candidate.evidence.isDefault &&
        candidate.eligible &&
        (candidate.weightedImprovement ?? 0) > IMPROVEMENT_EPSILON,
    )
    .sort(comparePrimaryCandidates);
  const primary = primaryCandidates[0];
  const marginalById = new Map<MovesetVariantId, Improvement>();
  const secondary = primary
    ? evaluations
        .filter(
          (candidate) =>
            !candidate.evidence.isDefault &&
            candidate.eligible &&
            candidate.evidence.id !== primary.evidence.id,
        )
        .map((candidate) => {
          const marginal = getMarginalImprovement(
            candidate,
            evaluatedDefault,
            primary,
            topMetaOpponentIds,
            fullMetaOpponentIds,
          );
          marginalById.set(candidate.evidence.id, marginal);
          return { candidate, marginal };
        })
        .filter(({ marginal }) => marginal.weighted > IMPROVEMENT_EPSILON)
        .sort(
          (left, right) =>
            compareImprovementDescending(
              left.marginal.weighted,
              right.marginal.weighted,
            ) ||
            compareImprovementDescending(
              left.marginal.topMeta,
              right.marginal.topMeta,
            ) ||
            comparePrimaryCandidates(left.candidate, right.candidate),
        )[0]?.candidate
    : undefined;
  const activeVariantIds = [
    evaluatedDefault.evidence.id,
    ...(primary ? [primary.evidence.id] : []),
    ...(secondary ? [secondary.evidence.id] : []),
  ].slice(0, MAX_ACTIVE_MOVESET_VARIANTS);
  const activeIds = new Set(activeVariantIds);

  return {
    activeVariantIds,
    candidates: evaluations.map((candidate) => ({
      id: candidate.evidence.id,
      isDefault: candidate.evidence.isDefault,
      completeness: candidate.completeness,
      evaluationCounts: candidate.evaluationCounts,
      eligible: candidate.eligible,
      weightedImprovement: candidate.weightedImprovement,
      topMetaImprovement: candidate.topMetaImprovement,
      fullMetaImprovement: candidate.fullMetaImprovement,
      marginalImprovement:
        marginalById.get(candidate.evidence.id)?.weighted ?? null,
      active: activeIds.has(candidate.evidence.id),
    })),
  };
}

/** Hash exact source bytes under a stable logical key for reproducibility. */
export function createMovesetVariantSourceDigest(
  key: string,
  contents: string | Uint8Array,
): MovesetVariantSourceDigest {
  return {
    key,
    algorithm: 'sha256',
    digest: createHash('sha256').update(contents).digest('hex'),
  };
}

/** Construct and validate a canonical manifest without publishing it. */
export function buildMovesetVariantManifest(
  input: BuildMovesetVariantManifestInput,
): MovesetVariantManifest {
  const manifest: MovesetVariantManifest = {
    metadata: {
      schemaVersion: MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
      policyVersion: input.policyVersion,
      formatId: input.format.id,
      cup: input.format.cup,
      cp: input.format.cp,
      sourceDigests: input.sourceDigests,
      derivationSettings: input.derivationSettings,
    },
    species: input.species,
  };

  return parseMovesetVariantManifestJson(
    serializeMovesetVariantManifest(manifest),
  );
}

/** Serialize a built manifest using the authoritative data-layer validator. */
export function serializeBuiltMovesetVariantManifest(
  manifest: MovesetVariantManifest,
): string {
  return serializeMovesetVariantManifest(manifest);
}
