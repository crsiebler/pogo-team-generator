import type { CandidateProfile } from './candidateProfiles';
import type { SpecialistGateContext } from './specialistCandidateGate';
import {
  evaluateSpecialistAdmission,
  isSpecialistCandidate,
} from './specialistCandidateGate';
import { calculateEffectiveness } from '@/lib/coverage/typeChart';

/** Weighted meta loss that an anchor needs companions to solve. */
export interface AnchorCompanionPairThreat {
  pokemon: string;
  weight?: number;
  defensiveTypes?: readonly string[];
}

/** Tunable component weights for anchor plus companion pair ranking. */
export interface AnchorCompanionPairWeights {
  rankingPrior: number;
  simulationCoverage: number;
  uniqueCoverage: number;
  safety: number;
  consistency: number;
  bulk: number;
  offensiveTyping: number;
  defensiveTyping: number;
  sharedWeaknessPenalty: number;
  missingInputPenalty: number;
}

/** Optional injected context for pure pair ranking. */
export interface AnchorCompanionPairRankingContext {
  importantLosses?: readonly AnchorCompanionPairThreat[];
  maxBulk?: number;
  weights?: Partial<AnchorCompanionPairWeights>;
  specialistGate?: Partial<SpecialistGateContext>;
}

/** Explainable score components for one anchor plus companion pair. */
export interface AnchorCompanionPairScoreBreakdown {
  rankingPrior: number;
  simulationCoverageScore: number;
  uniqueCoverageBonus: number;
  safetyScore: number;
  consistencyScore: number;
  bulkScore: number;
  offensiveTypingScore: number;
  defensiveTypingScore: number;
  sharedWeaknessPenalty: number;
  missingInputPenalty: number;
  totalScore: number;
  coveredAnchorLosses: string[];
  sharedWeaknesses: string[];
  flags: string[];
}

/** Ranked companion result for a fixed anchor. */
export interface RankedAnchorCompanionPair {
  anchor: CandidateProfile;
  companion: CandidateProfile;
  scoreBreakdown: AnchorCompanionPairScoreBreakdown;
}

const DEFAULT_WEIGHTS: AnchorCompanionPairWeights = {
  rankingPrior: 0.1,
  simulationCoverage: 0.35,
  uniqueCoverage: 0.45,
  safety: 0.08,
  consistency: 0.07,
  bulk: 0.06,
  offensiveTyping: 0.02,
  defensiveTyping: 0.06,
  sharedWeaknessPenalty: 0.24,
  missingInputPenalty: 0.03,
};

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

/**
 * Rank companion candidates for a fixed anchor using already-built candidate
 * profiles. Ranking and PvPoke score act as priors while coverage and synergy
 * drive the pair score.
 */
export function rankAnchorCompanionPairs(
  anchor: CandidateProfile,
  candidates: readonly CandidateProfile[],
  context: AnchorCompanionPairRankingContext = {},
): RankedAnchorCompanionPair[] {
  if (isSpecialistCandidate(anchor)) {
    return [];
  }

  const ungatedCandidateList = candidates.filter(
    (candidate) => candidate.pokemon !== anchor.pokemon,
  );
  const importantLosses = buildImportantLosses(anchor, context.importantLosses);
  const candidateList = gateSpecialistCandidates(
    anchor,
    ungatedCandidateList,
    importantLosses,
    context.specialistGate,
    Boolean(context.importantLosses && context.importantLosses.length > 0),
  );
  const maxBulk =
    context.maxBulk ??
    Math.max(
      anchor.bulk,
      ...candidateList.map((candidate) => candidate.bulk),
      1,
    );
  const strongerCoverageByCandidate = buildStrongerCoverageByCandidate(
    candidateList,
    importantLosses,
  );

  return candidateList
    .map((companion) => {
      return scoreAnchorCompanionPair(anchor, companion, {
        importantLosses,
        maxBulk,
        weights: context.weights,
        strongerCoverage:
          strongerCoverageByCandidate.get(candidateKey(companion)) ?? new Set(),
      });
    })
    .sort(compareRankedPairs);
}

function gateSpecialistCandidates(
  anchor: CandidateProfile,
  candidates: readonly CandidateProfile[],
  importantLosses: readonly NormalizedAnchorCompanionPairThreat[],
  specialistGate: Partial<SpecialistGateContext> | undefined,
  hasPrioritizedLosses: boolean,
): CandidateProfile[] {
  const generalistCandidates = candidates.filter(
    (candidate) => !isSpecialistCandidate(candidate),
  );
  const hasPrioritizedThreatContext =
    hasPrioritizedLosses || Boolean(specialistGate?.unresolvedThreats);

  if (!hasPrioritizedThreatContext) {
    return generalistCandidates;
  }

  const unresolvedThreats =
    specialistGate?.unresolvedThreats ??
    importantLosses.map((loss) => ({
      pokemon: loss.pokemon,
      weight: loss.weight,
      source: 'anchorLoss' as const,
      defensiveTypes: loss.defensiveTypes,
    }));

  return candidates.filter((candidate) => {
    return evaluateSpecialistAdmission(candidate, {
      ...specialistGate,
      anchor,
      generalistCandidates:
        specialistGate?.generalistCandidates ?? generalistCandidates,
      unresolvedThreats,
    }).admitted;
  });
}

interface NormalizedPairContext {
  importantLosses: readonly NormalizedAnchorCompanionPairThreat[];
  maxBulk: number;
  weights?: Partial<AnchorCompanionPairWeights>;
  strongerCoverage: ReadonlySet<string>;
}

interface NormalizedAnchorCompanionPairThreat {
  pokemon: string;
  weight: number;
  defensiveTypes: readonly string[];
}

function scoreAnchorCompanionPair(
  anchor: CandidateProfile,
  companion: CandidateProfile,
  context: NormalizedPairContext,
): RankedAnchorCompanionPair {
  const weights = { ...DEFAULT_WEIGHTS, ...context.weights };
  const coveredAnchorLosses = getCoveredAnchorLosses(
    companion,
    context.importantLosses,
  );
  const coverageWeight = sumThreatWeights(context.importantLosses);
  const coveredWeight = sumThreatWeights(
    context.importantLosses.filter((loss) =>
      coveredAnchorLosses.includes(loss.pokemon),
    ),
  );
  const simulationCoverageScore = safeDivide(coveredWeight, coverageWeight);
  const uniqueCoverageWeight = sumThreatWeights(
    context.importantLosses.filter((loss) => {
      return (
        coveredAnchorLosses.includes(loss.pokemon) &&
        !context.strongerCoverage.has(loss.pokemon) &&
        companion.simulationCoverage.winsAgainst.includes(loss.pokemon)
      );
    }),
  );
  const uniqueCoverageBonus = safeDivide(uniqueCoverageWeight, coverageWeight);
  const rankingPrior = calculateRankingPrior(companion);
  const safetyScore = calculateSignalScore(companion.safety);
  const consistencyScore = calculateSignalScore(companion.consistency);
  const bulkScore = clamp01(safeDivide(companion.bulk, context.maxBulk));
  const offensiveTypingScore = calculateOffensiveTypingScore(
    companion,
    context.importantLosses,
  );
  const sharedWeaknesses = getSharedWeaknesses(anchor, companion);
  const hasDefensiveTyping =
    anchor.defensiveTyping.length > 0 && companion.defensiveTyping.length > 0;
  const sharedWeaknessPenalty = hasDefensiveTyping
    ? clamp01(sharedWeaknesses.length / 3)
    : 0;
  const defensiveTypingScore = hasDefensiveTyping
    ? clamp01(1 - sharedWeaknessPenalty)
    : 0.5;
  const missingInputPenalty = clamp01(companion.missingInputs.length / 8);
  const totalScore =
    rankingPrior * weights.rankingPrior +
    simulationCoverageScore * weights.simulationCoverage +
    uniqueCoverageBonus * weights.uniqueCoverage +
    safetyScore * weights.safety +
    consistencyScore * weights.consistency +
    bulkScore * weights.bulk +
    offensiveTypingScore * weights.offensiveTyping +
    defensiveTypingScore * weights.defensiveTyping -
    sharedWeaknessPenalty * weights.sharedWeaknessPenalty -
    missingInputPenalty * weights.missingInputPenalty;
  const flags = sharedWeaknessPenalty >= 0.67 ? ['severe-shared-weakness'] : [];

  return {
    anchor,
    companion,
    scoreBreakdown: {
      rankingPrior,
      simulationCoverageScore,
      uniqueCoverageBonus,
      safetyScore,
      consistencyScore,
      bulkScore,
      offensiveTypingScore,
      defensiveTypingScore,
      sharedWeaknessPenalty,
      missingInputPenalty,
      totalScore,
      coveredAnchorLosses,
      sharedWeaknesses,
      flags,
    },
  };
}

function buildImportantLosses(
  anchor: CandidateProfile,
  importantLosses: readonly AnchorCompanionPairThreat[] | undefined,
): NormalizedAnchorCompanionPairThreat[] {
  const source: readonly AnchorCompanionPairThreat[] =
    importantLosses && importantLosses.length > 0
      ? importantLosses
      : anchor.simulationCoverage.lossesAgainst.map((pokemon) => ({ pokemon }));

  return source.map((loss, index) => ({
    pokemon: loss.pokemon,
    weight: finitePositiveOrDefault(
      loss.weight,
      Math.max(0.5, 1 - index * 0.2),
    ),
    defensiveTypes: loss.defensiveTypes ?? [],
  }));
}

function buildStrongerCoverageByCandidate(
  candidates: readonly CandidateProfile[],
  importantLosses: readonly NormalizedAnchorCompanionPairThreat[],
): Map<string, Set<string>> {
  const sortedCandidates = [...candidates].sort((first, second) => {
    return (
      first.rank - second.rank ||
      second.score - first.score ||
      candidateKey(first).localeCompare(candidateKey(second))
    );
  });
  const coveredByStrongerCandidates = new Set<string>();
  const result = new Map<string, Set<string>>();

  for (let index = 0; index < sortedCandidates.length; ) {
    const peerGroup = sortedCandidates.slice(index).filter((candidate) => {
      const firstPeer = sortedCandidates[index];

      return (
        firstPeer !== undefined &&
        candidate.rank === firstPeer.rank &&
        candidate.score === firstPeer.score
      );
    });

    for (const candidate of peerGroup) {
      result.set(candidateKey(candidate), new Set(coveredByStrongerCandidates));
    }

    for (const candidate of peerGroup) {
      for (const threat of getCoveredAnchorLosses(candidate, importantLosses)) {
        coveredByStrongerCandidates.add(threat);
      }
    }

    index += peerGroup.length;
  }

  return result;
}

function getCoveredAnchorLosses(
  companion: CandidateProfile,
  importantLosses: readonly NormalizedAnchorCompanionPairThreat[],
): string[] {
  return importantLosses
    .filter((loss) => {
      return (
        companion.simulationCoverage.winsAgainst.includes(loss.pokemon) ||
        companion.simulationCoverage.checks.includes(loss.pokemon)
      );
    })
    .map((loss) => loss.pokemon);
}

function calculateRankingPrior(companion: CandidateProfile): number {
  const scoreQuality = clamp01(companion.score / 100);
  const rankQuality = clamp01(1 - companion.rankPercentile);

  return scoreQuality * 0.7 + rankQuality * 0.3;
}

function calculateSignalScore(
  signal: CandidateProfile['safety'] | CandidateProfile['consistency'],
): number {
  return signal.available ? clamp01(signal.score / 100) : 0.5;
}

function calculateOffensiveTypingScore(
  companion: CandidateProfile,
  importantLosses: readonly NormalizedAnchorCompanionPairThreat[],
): number {
  const typedLosses = importantLosses.filter(
    (loss) => loss.defensiveTypes.length > 0,
  );

  if (companion.offensiveTyping.length === 0 || typedLosses.length === 0) {
    return 0.5;
  }

  const usefulTypes = companion.offensiveTyping.filter((type) => {
    return typedLosses.some((loss) => {
      return calculateEffectiveness([...loss.defensiveTypes], type) > 1;
    });
  });

  return clamp01(
    usefulTypes.length / Math.max(companion.offensiveTyping.length, 1),
  );
}

function getSharedWeaknesses(
  anchor: CandidateProfile,
  companion: CandidateProfile,
): string[] {
  const anchorWeaknesses = getDefensiveWeaknesses(anchor.defensiveTyping);
  const companionWeaknesses = getDefensiveWeaknesses(companion.defensiveTyping);

  return ATTACK_TYPES.filter((type) => {
    return anchorWeaknesses.has(type) && companionWeaknesses.has(type);
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

function compareRankedPairs(
  first: RankedAnchorCompanionPair,
  second: RankedAnchorCompanionPair,
): number {
  return (
    second.scoreBreakdown.totalScore - first.scoreBreakdown.totalScore ||
    second.scoreBreakdown.uniqueCoverageBonus -
      first.scoreBreakdown.uniqueCoverageBonus ||
    first.scoreBreakdown.sharedWeaknessPenalty -
      second.scoreBreakdown.sharedWeaknessPenalty ||
    second.companion.score - first.companion.score ||
    first.companion.rank - second.companion.rank ||
    candidateKey(first.companion).localeCompare(candidateKey(second.companion))
  );
}

function candidateKey(candidate: CandidateProfile): string {
  return candidate.speciesId ?? candidate.pokemon;
}

function sumThreatWeights(
  threats: readonly NormalizedAnchorCompanionPairThreat[],
): number {
  return threats.reduce((total, threat) => total + threat.weight, 0);
}

function finitePositiveOrDefault(
  value: number | undefined,
  fallback: number,
): number {
  return Number.isFinite(value) && value !== undefined && value > 0
    ? value
    : fallback;
}

function safeDivide(numerator: number, denominator: number): number {
  return denominator > 0 ? numerator / denominator : 0;
}

function clamp01(value: number): number {
  if (!Number.isFinite(value)) return 0;
  return Math.min(1, Math.max(0, value));
}
