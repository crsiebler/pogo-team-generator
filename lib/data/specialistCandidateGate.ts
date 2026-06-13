import type { CandidateProfile } from './candidateProfiles';
import { calculateEffectiveness } from '@/lib/coverage/typeChart';

/** Threat context used to decide whether a specialist solves a real gap. */
export interface SpecialistGateThreat {
  pokemon: string;
  weight?: number;
  source?: 'topMeta' | 'coreWeakness' | 'anchorLoss';
  defensiveTypes?: readonly string[];
}

/** Optional pure context for bounded specialist admission. */
export interface SpecialistGateContext {
  unresolvedThreats: readonly SpecialistGateThreat[];
  generalistCandidates?: readonly CandidateProfile[];
  anchor?: CandidateProfile;
  existingTeam?: readonly CandidateProfile[];
  minUniqueCoverageWeight?: number;
  maxSharedWeaknesses?: number;
  minViableLineupCount?: number;
  baselineViableLineupCount?: number;
  candidateViableLineupCount?: number;
}

/** Explainable specialist gate decision for pair or team expansion. */
export interface SpecialistAdmissionDecision {
  admitted: boolean;
  isSpecialist: boolean;
  reasons: string[];
  coveredThreats: string[];
  uniqueCoveredThreats: string[];
}

const AUTOMATIC_ANCHOR_BANDS = new Set<CandidateProfile['band']>([
  'eliteAnchors',
  'preferredAnchors',
]);

const ATTACK_TYPES = [
  'Normal',
  'Fire',
  'Water',
  'Electric',
  'Grass',
  'Ice',
  'Fighting',
  'Poison',
  'Ground',
  'Flying',
  'Psychic',
  'Bug',
  'Rock',
  'Ghost',
  'Dragon',
  'Dark',
  'Steel',
  'Fairy',
] as const;

/** Return true when a dynamic ranking band marks a candidate as a specialist. */
export function isSpecialistCandidate(candidate: CandidateProfile): boolean {
  return candidate.band === 'specialists';
}

/** Select automatic anchors without allowing specialist candidates to anchor. */
export function selectAutomaticAnchorCandidates(
  candidates: readonly CandidateProfile[],
): CandidateProfile[] {
  return [...candidates]
    .filter((candidate) => AUTOMATIC_ANCHOR_BANDS.has(candidate.band))
    .sort(compareCandidateQuality);
}

/**
 * Decide whether a specialist may enter companion or team expansion. Simulation
 * wins are required for admission; type-only coverage is explanatory only.
 */
export function evaluateSpecialistAdmission(
  candidate: CandidateProfile,
  context: SpecialistGateContext,
): SpecialistAdmissionDecision {
  if (!isSpecialistCandidate(candidate)) {
    return {
      admitted: true,
      isSpecialist: false,
      reasons: ['not-specialist'],
      coveredThreats: [],
      uniqueCoveredThreats: [],
    };
  }

  const reasons: string[] = [];
  const threats = normalizeThreats(context.unresolvedThreats);
  const coveredThreats = threats
    .filter((threat) =>
      candidate.simulationCoverage.winsAgainst.includes(threat.pokemon),
    )
    .map((threat) => threat.pokemon);
  const typeOnlyThreats = threats.filter((threat) => {
    return (
      !coveredThreats.includes(threat.pokemon) &&
      threat.defensiveTypes.length > 0 &&
      candidate.offensiveTyping.some((type) => {
        return calculateEffectiveness([...threat.defensiveTypes], type) > 1;
      })
    );
  });
  const uniqueCoveredThreats = threats
    .filter((threat) => {
      return (
        coveredThreats.includes(threat.pokemon) &&
        !isCoveredByStrongerGeneralist(
          threat.pokemon,
          candidate,
          context.generalistCandidates ?? [],
        )
      );
    })
    .map((threat) => threat.pokemon);
  const uniqueCoverageWeight = sumThreatWeights(
    threats.filter((threat) => uniqueCoveredThreats.includes(threat.pokemon)),
  );
  const minUniqueCoverageWeight = context.minUniqueCoverageWeight ?? 1;

  if (candidate.missingInputs.includes('simulationCoverage')) {
    reasons.push('missing-simulation-coverage');
  }

  if (coveredThreats.length === 0 && typeOnlyThreats.length > 0) {
    reasons.push('type-only-coverage-not-sufficient');
  }

  if (coveredThreats.length > 0 && uniqueCoveredThreats.length === 0) {
    reasons.push('duplicates-stronger-generalist');
  }

  if (uniqueCoverageWeight < minUniqueCoverageWeight) {
    reasons.push('insufficient-unique-coverage');
  }

  if (hasSevereSharedWeakness(candidate, context)) {
    reasons.push('severe-shared-weakness');
  }

  if (reducesViableLineups(context)) {
    reasons.push('reduces-viable-lineups');
  }

  if (reasons.length === 0) {
    reasons.push('unique-simulation-coverage');
  }

  return {
    admitted:
      reasons.length === 1 && reasons[0] === 'unique-simulation-coverage',
    isSpecialist: true,
    reasons,
    coveredThreats,
    uniqueCoveredThreats,
  };
}

interface NormalizedSpecialistGateThreat {
  pokemon: string;
  weight: number;
  source: 'topMeta' | 'coreWeakness' | 'anchorLoss';
  defensiveTypes: readonly string[];
}

function normalizeThreats(
  threats: readonly SpecialistGateThreat[],
): NormalizedSpecialistGateThreat[] {
  const normalizedThreats = new Map<string, NormalizedSpecialistGateThreat>();

  for (const threat of threats) {
    const normalizedThreat = {
      pokemon: threat.pokemon,
      weight:
        Number.isFinite(threat.weight) &&
        threat.weight !== undefined &&
        threat.weight > 0
          ? threat.weight
          : 1,
      source: threat.source ?? 'topMeta',
      defensiveTypes: threat.defensiveTypes ?? [],
    } satisfies NormalizedSpecialistGateThreat;
    const existingThreat = normalizedThreats.get(threat.pokemon);

    if (existingThreat === undefined) {
      normalizedThreats.set(threat.pokemon, normalizedThreat);
      continue;
    }

    normalizedThreats.set(threat.pokemon, {
      pokemon: threat.pokemon,
      weight: Math.max(existingThreat.weight, normalizedThreat.weight),
      source: chooseThreatSource(
        existingThreat.source,
        normalizedThreat.source,
      ),
      defensiveTypes: [
        ...new Set([
          ...existingThreat.defensiveTypes,
          ...normalizedThreat.defensiveTypes,
        ]),
      ],
    });
  }

  return [...normalizedThreats.values()];
}

function chooseThreatSource(
  first: NormalizedSpecialistGateThreat['source'],
  second: NormalizedSpecialistGateThreat['source'],
): NormalizedSpecialistGateThreat['source'] {
  if (first === 'coreWeakness' || second === 'coreWeakness') {
    return 'coreWeakness';
  }

  if (first === 'topMeta' || second === 'topMeta') {
    return 'topMeta';
  }

  return 'anchorLoss';
}

function isCoveredByStrongerGeneralist(
  threat: string,
  candidate: CandidateProfile,
  generalistCandidates: readonly CandidateProfile[],
): boolean {
  return generalistCandidates.some((generalist) => {
    return (
      !isSpecialistCandidate(generalist) &&
      compareCandidateQuality(generalist, candidate) < 0 &&
      (generalist.simulationCoverage.winsAgainst.includes(threat) ||
        generalist.simulationCoverage.checks.includes(threat))
    );
  });
}

function hasSevereSharedWeakness(
  candidate: CandidateProfile,
  context: SpecialistGateContext,
): boolean {
  const peers = [context.anchor, ...(context.existingTeam ?? [])].filter(
    (profile): profile is CandidateProfile => Boolean(profile),
  );
  const maxSharedWeaknesses = context.maxSharedWeaknesses ?? 2;

  return peers.some((peer) => {
    const sharedWeaknesses = getSharedWeaknesses(peer, candidate);

    return sharedWeaknesses.length >= maxSharedWeaknesses;
  });
}

function reducesViableLineups(context: SpecialistGateContext): boolean {
  if (context.candidateViableLineupCount === undefined) {
    return false;
  }

  if (
    context.minViableLineupCount !== undefined &&
    context.candidateViableLineupCount < context.minViableLineupCount
  ) {
    return true;
  }

  return (
    context.baselineViableLineupCount !== undefined &&
    context.candidateViableLineupCount < context.baselineViableLineupCount
  );
}

function getSharedWeaknesses(
  first: CandidateProfile,
  second: CandidateProfile,
): string[] {
  const firstWeaknesses = getDefensiveWeaknesses(first.defensiveTyping);
  const secondWeaknesses = getDefensiveWeaknesses(second.defensiveTyping);

  return ATTACK_TYPES.filter((type) => {
    return firstWeaknesses.has(type) && secondWeaknesses.has(type);
  });
}

function getDefensiveWeaknesses(
  defensiveTypes: readonly string[],
): Set<string> {
  return new Set(
    ATTACK_TYPES.filter((attackType) => {
      return calculateEffectiveness([...defensiveTypes], attackType) > 1;
    }),
  );
}

function compareCandidateQuality(
  first: CandidateProfile,
  second: CandidateProfile,
): number {
  return (
    first.rank - second.rank ||
    second.score - first.score ||
    candidateKey(first).localeCompare(candidateKey(second))
  );
}

function candidateKey(candidate: CandidateProfile): string {
  return candidate.speciesId ?? candidate.pokemon;
}

function sumThreatWeights(
  threats: readonly NormalizedSpecialistGateThreat[],
): number {
  return threats.reduce((total, threat) => total + threat.weight, 0);
}
