import type { RankedPokemon } from '../types';

export type CandidateQualityBandId =
  | 'eliteAnchors'
  | 'preferredAnchors'
  | 'normalCompanions'
  | 'flexibleCompanions'
  | 'specialists';

export interface CandidateRankingBandAssignment {
  pokemon: string;
  ranking: RankedPokemon;
  rank: number;
  rankPercentile: number;
  score: number;
  band: CandidateQualityBandId;
}

export interface CandidateRankingBandSummary {
  id: CandidateQualityBandId;
  label: string;
  minRank: number | null;
  maxRank: number | null;
  minScore: number | null;
  maxScore: number | null;
  count: number;
}

export interface CandidateRankingBands {
  eliteAnchors: CandidateRankingBandAssignment[];
  preferredAnchors: CandidateRankingBandAssignment[];
  normalCompanions: CandidateRankingBandAssignment[];
  flexibleCompanions: CandidateRankingBandAssignment[];
  specialists: CandidateRankingBandAssignment[];
}

export interface CandidateRankingBandOptions {
  minCandidates?: number;
  maxCandidates?: number;
  minBandSize?: number;
}

export interface CandidateRankingBandsResult {
  totalRanked: number;
  candidateCount: number;
  assignments: CandidateRankingBandAssignment[];
  bands: CandidateRankingBands;
  summaries: CandidateRankingBandSummary[];
  scoreCutoffs: number[];
}

const BAND_ORDER: CandidateQualityBandId[] = [
  'eliteAnchors',
  'preferredAnchors',
  'normalCompanions',
  'flexibleCompanions',
  'specialists',
];

const BAND_LABELS: Record<CandidateQualityBandId, string> = {
  eliteAnchors: 'Elite Anchors',
  preferredAnchors: 'Preferred Anchors',
  normalCompanions: 'Normal Companions',
  flexibleCompanions: 'Flexible Companions',
  specialists: 'Specialists',
};

interface ScoreGap {
  afterRank: number;
  delta: number;
}

/**
 * Derive format-specific candidate quality bands from an already-loaded overall
 * ranking export without using fixed global PvPoke score cutoffs.
 */
export function deriveCandidateRankingBands(
  rankings: RankedPokemon[],
  options: CandidateRankingBandOptions = {},
): CandidateRankingBandsResult {
  const totalRanked = rankings.length;
  const minCandidates = options.minCandidates ?? 20;
  const maxCandidates = options.maxCandidates ?? 80;
  const minBandSize = options.minBandSize ?? 3;

  if (minCandidates > maxCandidates) {
    throw new Error(
      'minCandidates must be less than or equal to maxCandidates',
    );
  }

  if (totalRanked === 0) {
    return buildResult([], totalRanked, []);
  }

  const sortedRankings = rankings
    .map((ranking, index) => ({ ranking, index }))
    .filter(({ ranking }) => Number.isFinite(ranking.Score))
    .sort((a, b) => {
      if (b.ranking.Score !== a.ranking.Score) {
        return b.ranking.Score - a.ranking.Score;
      }

      return a.index - b.index;
    })
    .map(({ ranking }) => ranking);

  const boundedMinCandidates = Math.min(minCandidates, sortedRankings.length);
  const boundedMaxCandidates = Math.min(maxCandidates, sortedRankings.length);
  const gaps = getScoreGaps(sortedRankings);
  const densityCandidateCount = Math.ceil(sortedRankings.length * 0.35);
  const baseCandidateCount = clamp(
    densityCandidateCount,
    boundedMinCandidates,
    boundedMaxCandidates,
  );
  const candidateDropoff = findMeaningfulDropoff(
    gaps,
    boundedMinCandidates,
    boundedMaxCandidates,
  );
  const candidateCount = Math.max(
    boundedMinCandidates,
    Math.min(baseCandidateCount, candidateDropoff ?? boundedMaxCandidates),
  );
  const candidateRankings = sortedRankings.slice(0, candidateCount);
  const boundaries = deriveBoundaries(candidateRankings, gaps, minBandSize);
  const assignments = candidateRankings.map((ranking, index) => {
    const rank = index + 1;
    const band = getBandForRank(rank, boundaries);

    return {
      pokemon: ranking.Pokemon,
      ranking,
      rank,
      rankPercentile: rank / sortedRankings.length,
      score: ranking.Score,
      band,
    } satisfies CandidateRankingBandAssignment;
  });

  return buildResult(
    assignments,
    totalRanked,
    boundaries.map((rank) => {
      return candidateRankings[rank - 1]?.Score ?? 0;
    }),
  );
}

function getScoreGaps(rankings: RankedPokemon[]): ScoreGap[] {
  const gaps: ScoreGap[] = [];

  for (let index = 0; index < rankings.length - 1; index++) {
    gaps.push({
      afterRank: index + 1,
      delta: Math.max(0, rankings[index].Score - rankings[index + 1].Score),
    });
  }

  return gaps;
}

function findMeaningfulDropoff(
  gaps: ScoreGap[],
  minRank: number,
  maxRank: number,
): number | null {
  const boundedGaps = gaps.filter((gap) => {
    return gap.afterRank >= minRank && gap.afterRank <= maxRank;
  });

  if (boundedGaps.length === 0) {
    return null;
  }

  const averageGap =
    boundedGaps.reduce((sum, gap) => sum + gap.delta, 0) / boundedGaps.length;
  const variance =
    boundedGaps.reduce((sum, gap) => {
      return sum + (gap.delta - averageGap) ** 2;
    }, 0) / boundedGaps.length;
  const threshold = Math.max(
    averageGap + Math.sqrt(variance) * 0.75,
    averageGap * 2.5,
  );
  const meaningfulGap = boundedGaps.find((gap) => gap.delta >= threshold);

  return meaningfulGap?.afterRank ?? null;
}

function deriveBoundaries(
  candidateRankings: RankedPokemon[],
  allGaps: ScoreGap[],
  minBandSize: number,
): number[] {
  const candidateCount = candidateRankings.length;

  if (candidateCount < minBandSize * BAND_ORDER.length) {
    return deriveSmallPoolBoundaries(candidateCount);
  }

  const defaultBoundaries = [0.08, 0.2, 0.45, 0.7].map((percentile) => {
    return clamp(
      Math.round(candidateCount * percentile),
      minBandSize,
      candidateCount,
    );
  });

  const boundaries = defaultBoundaries.map((boundary, index) => {
    if (index === 0) {
      return boundary;
    }

    const lowerBound =
      index === 0 ? minBandSize : defaultBoundaries[index - 1] + minBandSize;
    const upperBound = candidateCount - minBandSize * (4 - index);
    const nearbyGap = findNearestLargeGap(
      allGaps,
      boundary,
      lowerBound,
      upperBound,
    );

    return nearbyGap ?? clamp(boundary, lowerBound, upperBound);
  });

  return boundaries.reduce<number[]>((uniqueBoundaries, boundary, index) => {
    const previousBoundary = uniqueBoundaries[index - 1] ?? 0;
    const maxBoundary = candidateCount - minBandSize * (4 - index);
    uniqueBoundaries.push(
      clamp(boundary, previousBoundary + minBandSize, maxBoundary),
    );
    return uniqueBoundaries;
  }, []);
}

function deriveSmallPoolBoundaries(candidateCount: number): number[] {
  return [0.2, 0.4, 0.6, 0.8].map((percentile) => {
    return clamp(Math.ceil(candidateCount * percentile), 1, candidateCount);
  });
}

function findNearestLargeGap(
  gaps: ScoreGap[],
  targetRank: number,
  lowerBound: number,
  upperBound: number,
): number | null {
  const nearbyGaps = gaps.filter((gap) => {
    return gap.afterRank >= lowerBound && gap.afterRank <= upperBound;
  });

  if (nearbyGaps.length === 0) {
    return null;
  }

  const averageGap =
    nearbyGaps.reduce((sum, gap) => sum + gap.delta, 0) / nearbyGaps.length;
  const largeGaps = nearbyGaps.filter((gap) => gap.delta > averageGap);

  if (largeGaps.length === 0) {
    return null;
  }

  largeGaps.sort((a, b) => {
    const distanceDelta =
      Math.abs(a.afterRank - targetRank) - Math.abs(b.afterRank - targetRank);

    if (distanceDelta !== 0) {
      return distanceDelta;
    }

    return b.delta - a.delta;
  });

  return largeGaps[0].afterRank;
}

function getBandForRank(
  rank: number,
  boundaries: number[],
): CandidateQualityBandId {
  if (rank <= boundaries[0]) return 'eliteAnchors';
  if (rank <= boundaries[1]) return 'preferredAnchors';
  if (rank <= boundaries[2]) return 'normalCompanions';
  if (rank <= boundaries[3]) return 'flexibleCompanions';
  return 'specialists';
}

function buildResult(
  assignments: CandidateRankingBandAssignment[],
  totalRanked: number,
  scoreCutoffs: number[],
): CandidateRankingBandsResult {
  const bands = BAND_ORDER.reduce<CandidateRankingBands>(
    (accumulator, band) => {
      accumulator[band] = assignments.filter(
        (assignment) => assignment.band === band,
      );
      return accumulator;
    },
    {
      eliteAnchors: [],
      preferredAnchors: [],
      normalCompanions: [],
      flexibleCompanions: [],
      specialists: [],
    },
  );

  return {
    totalRanked,
    candidateCount: assignments.length,
    assignments,
    bands,
    summaries: BAND_ORDER.map((band) => buildSummary(band, bands[band])),
    scoreCutoffs,
  };
}

function buildSummary(
  id: CandidateQualityBandId,
  assignments: CandidateRankingBandAssignment[],
): CandidateRankingBandSummary {
  return {
    id,
    label: BAND_LABELS[id],
    minRank: assignments[0]?.rank ?? null,
    maxRank: assignments.at(-1)?.rank ?? null,
    minScore: assignments.at(-1)?.score ?? null,
    maxScore: assignments[0]?.score ?? null,
    count: assignments.length,
  };
}

function clamp(value: number, min: number, max: number): number {
  return Math.min(Math.max(value, min), max);
}
