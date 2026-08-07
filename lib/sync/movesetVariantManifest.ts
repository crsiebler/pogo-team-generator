import { createHash, randomUUID } from 'crypto';
import { promises as fs } from 'fs';
import path from 'path';
import {
  getBattleFormatById,
  getBattleFormats,
  type BattleFormat,
  type BattleFormatId,
} from '@/lib/data/battleFormats';
import type { MoveAvailabilityLookup } from '@/lib/data/moveAvailability';
import {
  getMovesetVariantManifestPath,
  MAX_ACTIVE_MOVESET_VARIANTS,
  MAX_MOVESET_CANDIDATES,
  MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
  MOVESET_VARIANT_SCENARIOS,
  parseMovesetVariantManifestJson,
  serializeMovesetVariantManifest,
  type MovesetVariantDerivationSettings,
  type MovesetVariantManifest,
  type MovesetVariantManifestCandidate,
  type MovesetVariantManifestSpecies,
  type MovesetVariantScenarioRecord,
  type MovesetVariantSourceDigest,
} from '@/lib/data/movesetVariantManifest';
import {
  RUNTIME_SIMULATION_ASSET_INDEX_PATH,
  parseRuntimeSimulationAssetIndexJson,
} from '@/lib/data/runtimeSimulationAssetIndex';
import { scoreMatchupRating } from '@/lib/genetic/fitness/matchupScoring';
import {
  MAX_EXPANSION_CHARGED_MOVES,
  MAX_EXPANSION_FAST_MOVES,
  type DerivedMovesetCandidateSet,
} from '@/lib/sync/movesetCandidates';
import { RANKING_CATEGORY_WEIGHTS } from '@/lib/sync/rankings';
import type { PreparedRuntimeSimulationAssetIndex } from '@/lib/sync/runtimeSimulationAssetIndex';
import type { PreparedSimulationCsv } from '@/lib/sync/simulations';
import type { MovesetVariantId, ShieldScenarioKey } from '@/lib/types';

const TOP_META_WEIGHT = 0.7;
const FULL_META_WEIGHT = 0.3;
const IMPROVEMENT_EPSILON = 1e-12;
const MOVESET_VARIANT_POLICY_VERSION = 'ranking-evidence-v1';

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

/** Manifest-ready selection emitted after complete simulation validation. */
export interface MovesetVariantManifestSelection extends ActiveMovesetVariantSelection {
  readonly formatId: BattleFormatId;
  readonly speciesId: string;
}

/** Inputs required to prepare every supported format manifest in memory. */
export interface PrepareMovesetVariantManifestsInput {
  readonly pokemonSource: string | Uint8Array;
  readonly movesSource: string | Uint8Array;
  readonly candidateSets: readonly DerivedMovesetCandidateSet[];
  readonly variantSelections: readonly MovesetVariantManifestSelection[];
  readonly getMoveAvailability: MoveAvailabilityLookup;
}

/** Canonical bytes and final target for one prepared format manifest. */
export interface PreparedMovesetVariantManifest {
  readonly formatId: BattleFormatId;
  readonly targetPath: string;
  readonly contents: string;
}

interface ManifestPublicationDependencies {
  readonly mkdir: (directoryPath: string) => Promise<void>;
  readonly writeFile: (filePath: string, contents: string) => Promise<void>;
  readonly rename: (sourcePath: string, targetPath: string) => Promise<void>;
  readonly unlink: (filePath: string) => Promise<void>;
  readonly createTemporaryPath: (targetPath: string) => string;
}

interface SimulationGenerationPublicationDependencies extends ManifestPublicationDependencies {
  readonly fileExists: (filePath: string) => Promise<boolean>;
  readonly createBackupPath: (targetPath: string) => string;
}

const defaultPublicationDependencies: ManifestPublicationDependencies = {
  mkdir: async (directoryPath) => {
    await fs.mkdir(directoryPath, { recursive: true });
  },
  writeFile: async (filePath, contents) => {
    await fs.writeFile(filePath, contents, { encoding: 'utf8', flag: 'wx' });
  },
  rename: async (sourcePath, targetPath) => {
    await fs.rename(sourcePath, targetPath);
  },
  unlink: async (filePath) => {
    await fs.unlink(filePath);
  },
  createTemporaryPath: (targetPath) =>
    `${targetPath}.tmp-${process.pid}-${randomUUID()}`,
};

const defaultSimulationGenerationPublicationDependencies: SimulationGenerationPublicationDependencies =
  {
    ...defaultPublicationDependencies,
    fileExists: async (filePath) => {
      try {
        await fs.access(filePath);
        return true;
      } catch {
        return false;
      }
    },
    createBackupPath: (targetPath) =>
      `${targetPath}.backup-${process.pid}-${randomUUID()}`,
  };

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

function getFormatSpeciesKey(
  formatId: BattleFormatId,
  speciesId: string,
): string {
  return `${formatId}|${speciesId}`;
}

function getStorageKeys(
  speciesId: string,
  variantId: MovesetVariantId,
  isDefault: boolean,
): MovesetVariantScenarioRecord<string> {
  return createScenarioRecord((scenario) =>
    isDefault
      ? `${speciesId}_${scenario}.csv`
      : `${speciesId}--${variantId}_${scenario}.csv`,
  );
}

function buildManifestSpecies(
  candidateSet: DerivedMovesetCandidateSet,
  selection: MovesetVariantManifestSelection,
  getMoveAvailability: MoveAvailabilityLookup,
): MovesetVariantManifestSpecies {
  const selectionById = new Map(
    selection.candidates.map((candidate) => [candidate.id, candidate]),
  );
  if (
    selectionById.size !== selection.candidates.length ||
    selection.candidates.length !== candidateSet.candidates.length
  ) {
    throw new Error(
      `[sync-manifest] Candidate selection does not match ${selection.formatId}/${selection.speciesId}`,
    );
  }
  const activeCandidateIds = selection.candidates
    .filter(({ active }) => active)
    .map(({ id }) => id)
    .sort(compareAscii);
  const declaredActiveIds = [...selection.activeVariantIds].sort(compareAscii);
  if (
    JSON.stringify(activeCandidateIds) !== JSON.stringify(declaredActiveIds)
  ) {
    throw new Error(
      `[sync-manifest] Active candidate ids do not match ${selection.formatId}/${selection.speciesId}`,
    );
  }

  const candidates = candidateSet.candidates.map(
    (candidate): MovesetVariantManifestCandidate => {
      const selected = selectionById.get(candidate.id);
      if (
        !selected ||
        selected.isDefault !== candidate.isDefault ||
        !candidate.evidence
      ) {
        throw new Error(
          `[sync-manifest] Missing candidate metadata for ${selection.formatId}/${selection.speciesId}/${candidate.id}`,
        );
      }
      const fastMove = getMoveAvailability(
        candidateSet.speciesId,
        candidate.fastMove,
        candidateSet.formatId,
      );
      const chargedMove1 = getMoveAvailability(
        candidateSet.speciesId,
        candidate.chargedMove1,
        candidateSet.formatId,
      );
      const chargedMove2 = getMoveAvailability(
        candidateSet.speciesId,
        candidate.chargedMove2,
        candidateSet.formatId,
      );
      if (
        fastMove.kind === 'excluded' ||
        chargedMove1.kind === 'excluded' ||
        chargedMove2.kind === 'excluded'
      ) {
        throw new Error(
          `[sync-manifest] Candidate '${candidate.id}' is no longer eligible for ${selection.formatId}/${selection.speciesId}`,
        );
      }

      return {
        id: candidate.id,
        fastMove: candidate.fastMove,
        chargedMove1: candidate.chargedMove1,
        chargedMove2: candidate.chargedMove2,
        isDefault: candidate.isDefault,
        evidence: candidate.evidence,
        acquisitionRequirements: {
          fastMove,
          chargedMove1,
          chargedMove2,
        },
        storageKeys: getStorageKeys(
          candidateSet.speciesId,
          candidate.id,
          candidate.isDefault,
        ),
        completeness: selected.completeness,
        evaluationCounts: selected.evaluationCounts,
        active: selected.active,
      };
    },
  );
  const defaultCandidate = candidates.find(({ isDefault }) => isDefault);
  if (!defaultCandidate) {
    throw new Error(
      `[sync-manifest] Missing default candidate for ${selection.formatId}/${selection.speciesId}`,
    );
  }

  return {
    speciesId: candidateSet.speciesId,
    defaultVariantId: defaultCandidate.id,
    evidence: {
      pvpokeScorePrior: candidateSet.pvpokeScorePrior,
      retainedFastMoves: candidateSet.retainedFastMoves,
      retainedChargedMoves: candidateSet.retainedChargedMoves,
      rejections: candidateSet.rejections,
    },
    candidates,
  };
}

function getCanonicalSpeciesSource(
  species: readonly MovesetVariantManifestSpecies[],
): string {
  return JSON.stringify(
    [...species]
      .sort((left, right) => compareAscii(left.speciesId, right.speciesId))
      .map((entry) => ({
        ...entry,
        evidence: {
          ...entry.evidence,
          rejections: [...entry.evidence.rejections].sort((left, right) =>
            compareAscii(JSON.stringify(left), JSON.stringify(right)),
          ),
        },
        candidates: [...entry.candidates]
          .sort(
            (left, right) =>
              Number(right.isDefault) - Number(left.isDefault) ||
              compareAscii(left.id, right.id),
          )
          .map((candidate) => ({
            ...candidate,
            evidence: {
              ...candidate.evidence,
              sourceCategories: [...candidate.evidence.sourceCategories].sort(
                compareAscii,
              ),
              sourceVariantIds: [...candidate.evidence.sourceVariantIds].sort(
                compareAscii,
              ),
            },
          })),
      })),
  );
}

/**
 * Construct and validate canonical manifest bytes for every supported format.
 * No filesystem writes occur until every format has prepared successfully.
 */
export function prepareMovesetVariantManifests(
  input: PrepareMovesetVariantManifestsInput,
): readonly PreparedMovesetVariantManifest[] {
  const candidateSetsByKey = new Map<string, DerivedMovesetCandidateSet>();
  for (const candidateSet of input.candidateSets) {
    const key = getFormatSpeciesKey(
      candidateSet.formatId,
      candidateSet.speciesId,
    );
    if (candidateSetsByKey.has(key)) {
      throw new Error(`[sync-manifest] Duplicate candidate set for ${key}`);
    }
    candidateSetsByKey.set(key, candidateSet);
  }
  const selectionsByKey = new Map<string, MovesetVariantManifestSelection>();
  for (const selection of input.variantSelections) {
    const key = getFormatSpeciesKey(selection.formatId, selection.speciesId);
    if (selectionsByKey.has(key)) {
      throw new Error(`[sync-manifest] Duplicate variant selection for ${key}`);
    }
    selectionsByKey.set(key, selection);
  }

  return getBattleFormats().map((format) => {
    const formatSelections = [...selectionsByKey.values()]
      .filter(({ formatId }) => formatId === format.id)
      .sort((left, right) => compareAscii(left.speciesId, right.speciesId));
    const species = formatSelections.map((selection) => {
      const candidateSet = candidateSetsByKey.get(
        getFormatSpeciesKey(selection.formatId, selection.speciesId),
      );
      if (!candidateSet) {
        throw new Error(
          `[sync-manifest] Missing candidate set for ${selection.formatId}/${selection.speciesId}`,
        );
      }
      return buildManifestSpecies(
        candidateSet,
        selection,
        input.getMoveAvailability,
      );
    });
    const formatSource = getCanonicalSpeciesSource(species);
    const manifest = buildMovesetVariantManifest({
      format,
      policyVersion: MOVESET_VARIANT_POLICY_VERSION,
      sourceDigests: [
        createMovesetVariantSourceDigest('pokemon.json', input.pokemonSource),
        createMovesetVariantSourceDigest('moves.json', input.movesSource),
        createMovesetVariantSourceDigest(
          `formats/${format.id}.json`,
          formatSource,
        ),
      ],
      derivationSettings: {
        maxCandidatesPerSpecies: MAX_MOVESET_CANDIDATES,
        maxActiveVariantsPerSpecies: MAX_ACTIVE_MOVESET_VARIANTS,
        maxExpansionFastMoves: MAX_EXPANSION_FAST_MOVES,
        maxExpansionChargedMoves: MAX_EXPANSION_CHARGED_MOVES,
        requiredScenarios: MOVESET_VARIANT_SCENARIOS,
        categoryWeights: RANKING_CATEGORY_WEIGHTS,
      },
      species,
    });
    return {
      formatId: format.id,
      targetPath: getMovesetVariantManifestPath(format),
      contents: serializeBuiltMovesetVariantManifest(manifest),
    };
  });
}

/** Atomically replace prepared manifests using same-directory temporary files. */
export async function publishMovesetVariantManifests(
  manifests: readonly PreparedMovesetVariantManifest[],
  dependencies: Partial<ManifestPublicationDependencies> = {},
): Promise<void> {
  const resolvedDependencies = {
    ...defaultPublicationDependencies,
    ...dependencies,
  };
  const staged: Array<{
    readonly temporaryPath: string;
    readonly targetPath: string;
  }> = [];

  try {
    for (const manifest of manifests) {
      validatePreparedManifestTarget(manifest);
      const temporaryPath = resolvedDependencies.createTemporaryPath(
        manifest.targetPath,
      );
      if (path.dirname(temporaryPath) !== path.dirname(manifest.targetPath)) {
        throw new Error(
          `[sync-manifest] Temporary manifest must share the target directory for ${manifest.formatId}`,
        );
      }
      await resolvedDependencies.mkdir(path.dirname(manifest.targetPath));
      staged.push({ temporaryPath, targetPath: manifest.targetPath });
      await resolvedDependencies.writeFile(temporaryPath, manifest.contents);
    }

    while (staged.length > 0) {
      const manifest = staged[0]!;
      await resolvedDependencies.rename(
        manifest.temporaryPath,
        manifest.targetPath,
      );
      staged.shift();
    }
  } catch (error) {
    await Promise.allSettled(
      staged.map(({ temporaryPath }) =>
        resolvedDependencies.unlink(temporaryPath),
      ),
    );
    throw error;
  }
}

function validatePreparedManifestTarget(
  manifest: PreparedMovesetVariantManifest,
): void {
  const format = getBattleFormatById(manifest.formatId);
  const expectedTargetPath = format
    ? getMovesetVariantManifestPath(format)
    : null;
  if (!expectedTargetPath || manifest.targetPath !== expectedTargetPath) {
    throw new Error(
      `[sync-manifest] Manifest target must match ${manifest.formatId}: ${expectedTargetPath ?? 'unsupported format'}`,
    );
  }
}

function validatePreparedSimulationCsvTarget(
  csvFile: PreparedSimulationCsv,
): void {
  const format = getBattleFormatById(csvFile.formatId);
  const expectedDirectory = format
    ? path.dirname(getMovesetVariantManifestPath(format))
    : null;
  const canonicalPart = '[a-z0-9]+(?:_[a-z0-9]+)*';
  const canonicalFilenamePattern = new RegExp(
    `^${canonicalPart}(?:(?:--${canonicalPart}){3})?_(?:0-0|1-1|2-2)\\.csv$`,
  );
  if (
    !expectedDirectory ||
    path.dirname(csvFile.targetPath) !== expectedDirectory ||
    !canonicalFilenamePattern.test(path.basename(csvFile.targetPath))
  ) {
    throw new Error(
      `[sync-manifest] Simulation target must match ${csvFile.formatId}: ${csvFile.targetPath}`,
    );
  }
}

function validatePreparedRuntimeAssetIndexTarget(
  index: PreparedRuntimeSimulationAssetIndex,
): void {
  if (index.targetPath !== RUNTIME_SIMULATION_ASSET_INDEX_PATH) {
    throw new Error(
      `[sync-manifest] Runtime asset index target must match ${RUNTIME_SIMULATION_ASSET_INDEX_PATH}`,
    );
  }
  parseRuntimeSimulationAssetIndexJson(index.contents);
}

/**
 * Publish validated simulation CSVs, authoritative manifests, and the runtime
 * asset index as one recoverable batch. The index is replaced last and every
 * prior target is restored when any replacement fails.
 */
export async function publishSimulationGeneration(
  csvFiles: readonly PreparedSimulationCsv[],
  manifests: readonly PreparedMovesetVariantManifest[],
  runtimeAssetIndex: PreparedRuntimeSimulationAssetIndex,
  dependencies: Partial<SimulationGenerationPublicationDependencies> = {},
): Promise<void> {
  const resolvedDependencies = {
    ...defaultSimulationGenerationPublicationDependencies,
    ...dependencies,
  };
  const targets = [
    ...csvFiles.map((file) => ({ ...file, kind: 'simulation' as const })),
    ...manifests.map((file) => ({ ...file, kind: 'manifest' as const })),
    { ...runtimeAssetIndex, kind: 'runtime-asset-index' as const },
  ];
  const targetPaths = new Set<string>();
  const staged: Array<{
    readonly temporaryPath: string;
    readonly backupPath: string;
    readonly targetPath: string;
    hadOriginal: boolean;
    backupCreated: boolean;
    installed: boolean;
  }> = [];

  try {
    for (const target of targets) {
      if (target.kind === 'simulation') {
        validatePreparedSimulationCsvTarget(target);
      } else if (target.kind === 'manifest') {
        validatePreparedManifestTarget(target);
      } else {
        validatePreparedRuntimeAssetIndexTarget(target);
      }
      if (targetPaths.has(target.targetPath)) {
        throw new Error(
          `[sync-manifest] Duplicate publication target: ${target.targetPath}`,
        );
      }
      targetPaths.add(target.targetPath);

      const temporaryPath = resolvedDependencies.createTemporaryPath(
        target.targetPath,
      );
      const backupPath = resolvedDependencies.createBackupPath(
        target.targetPath,
      );
      const targetDirectory = path.dirname(target.targetPath);
      if (
        path.dirname(temporaryPath) !== targetDirectory ||
        path.dirname(backupPath) !== targetDirectory
      ) {
        throw new Error(
          `[sync-manifest] Publication files must share the target directory: ${target.targetPath}`,
        );
      }
      await resolvedDependencies.mkdir(targetDirectory);
      staged.push({
        temporaryPath,
        backupPath,
        targetPath: target.targetPath,
        hadOriginal: false,
        backupCreated: false,
        installed: false,
      });
      await resolvedDependencies.writeFile(temporaryPath, target.contents);
    }

    for (const target of staged) {
      target.hadOriginal = await resolvedDependencies.fileExists(
        target.targetPath,
      );
      if (target.hadOriginal) {
        await resolvedDependencies.rename(target.targetPath, target.backupPath);
        target.backupCreated = true;
      }
      await resolvedDependencies.rename(
        target.temporaryPath,
        target.targetPath,
      );
      target.installed = true;
    }
  } catch (error) {
    const rollbackErrors: unknown[] = [];
    for (const target of staged) {
      try {
        if (target.backupCreated) {
          await resolvedDependencies.rename(
            target.backupPath,
            target.targetPath,
          );
        } else if (target.installed) {
          await resolvedDependencies.unlink(target.targetPath);
        }
      } catch (rollbackError) {
        rollbackErrors.push(rollbackError);
      }
    }
    await Promise.allSettled(
      staged.map(({ temporaryPath }) =>
        resolvedDependencies.unlink(temporaryPath),
      ),
    );
    if (rollbackErrors.length > 0) {
      throw new AggregateError(
        [error, ...rollbackErrors],
        `Publication failed and rollback was incomplete: ${error instanceof Error ? error.message : String(error)}`,
      );
    }
    throw error;
  }

  await Promise.allSettled(
    staged
      .filter(({ backupCreated }) => backupCreated)
      .map(({ backupPath }) => resolvedDependencies.unlink(backupPath)),
  );
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
