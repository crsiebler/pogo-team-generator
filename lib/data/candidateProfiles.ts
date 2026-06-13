import type {
  CandidateQualityBandId,
  CandidateRankingBandsResult,
} from './candidateRankingBands';

/** Injected role or consistency ranking signal for one candidate. */
export interface CandidateRankingSignalInput {
  rank: number;
  score: number;
}

/** Availability-aware role or consistency ranking signal. */
export type CandidateRankingSignal =
  | {
      available: true;
      rank: number;
      score: number;
    }
  | {
      available: false;
    };

/** Precomputed matchup coverage inputs for one candidate profile. */
export interface CandidateSimulationCoverage {
  winsAgainst: string[];
  lossesAgainst: string[];
  checks: string[];
}

/** Inputs for pure candidate profile construction. */
export interface CandidateProfileBuilderInput {
  rankingBands: CandidateRankingBandsResult;
  speciesIdsByPokemon?: ReadonlyMap<string, string>;
  safetyRankings?: ReadonlyMap<string, CandidateRankingSignalInput>;
  switchRankings?: ReadonlyMap<string, CandidateRankingSignalInput>;
  consistencyRankings?: ReadonlyMap<string, CandidateRankingSignalInput>;
  moveTypesByName?: ReadonlyMap<string, string>;
  simulationCoverageByPokemon?: ReadonlyMap<
    string,
    CandidateSimulationCoverage
  >;
}

/** Format-scoped candidate profile consumed by later generation stages. */
export interface CandidateProfile {
  pokemon: string;
  speciesId: string | null;
  rank: number;
  rankPercentile: number;
  score: number;
  band: CandidateQualityBandId;
  safety: CandidateRankingSignal;
  switch: CandidateRankingSignal;
  consistency: CandidateRankingSignal;
  statProduct: number | null;
  bulk: number;
  offensiveTyping: string[];
  defensiveTyping: string[];
  simulationCoverage: CandidateSimulationCoverage;
  missingInputs: string[];
}

/**
 * Build pure candidate profiles from preloaded ranking bands and injected
 * optional role, type, species, and matchup coverage inputs.
 */
export function buildCandidateProfiles(
  input: CandidateProfileBuilderInput,
): CandidateProfile[] {
  return input.rankingBands.assignments.map((assignment) => {
    const ranking = assignment.ranking;
    const missingInputs: string[] = [];
    const pokemon = assignment.pokemon;
    const speciesId = input.speciesIdsByPokemon?.get(pokemon) ?? null;
    const safety = buildSignal(input.safetyRankings?.get(pokemon));
    const switchSignal = buildSignal(input.switchRankings?.get(pokemon));
    const consistency = buildSignal(input.consistencyRankings?.get(pokemon));
    const statProduct = finitePositiveOrNull(ranking['Stat Product']);
    const bulk = calculateBulk(ranking);
    const defensiveTyping = uniqueNonEmptyValues([
      ranking['Type 1'],
      ranking['Type 2'],
    ]);
    const selectedMoves = uniqueNonEmptyValues([
      ranking['Fast Move'],
      ranking['Charged Move 1'],
      ranking['Charged Move 2'],
    ]);
    const resolvedMoveTypes = selectedMoves
      .map((moveName) => input.moveTypesByName?.get(moveName))
      .filter((type): type is string => Boolean(type));
    const offensiveTyping = uniqueNonEmptyValues(resolvedMoveTypes);
    const simulationCoverage = cloneSimulationCoverage(
      input.simulationCoverageByPokemon?.get(pokemon),
    );

    if (!speciesId) missingInputs.push('speciesId');
    if (!safety.available) missingInputs.push('safety');
    if (!switchSignal.available) missingInputs.push('switch');
    if (!consistency.available) missingInputs.push('consistency');
    if (statProduct === null) missingInputs.push('statProduct');
    if (bulk === 0) missingInputs.push('bulk');
    if (offensiveTyping.length === 0) missingInputs.push('offensiveTyping');
    if (resolvedMoveTypes.length < selectedMoves.length) {
      missingInputs.push('moveTypes');
    }
    if (!input.simulationCoverageByPokemon?.has(pokemon)) {
      missingInputs.push('simulationCoverage');
    }

    return {
      pokemon,
      speciesId,
      rank: assignment.rank,
      rankPercentile: assignment.rankPercentile,
      score: assignment.score,
      band: assignment.band,
      safety,
      switch: switchSignal,
      consistency,
      statProduct,
      bulk,
      offensiveTyping,
      defensiveTyping,
      simulationCoverage,
      missingInputs,
    } satisfies CandidateProfile;
  });
}

function buildSignal(
  signal: CandidateRankingSignalInput | undefined,
): CandidateRankingSignal {
  if (
    !signal ||
    !Number.isFinite(signal.rank) ||
    !Number.isFinite(signal.score)
  ) {
    return { available: false };
  }

  return {
    available: true,
    rank: signal.rank,
    score: signal.score,
  };
}

function finitePositiveOrNull(value: number): number | null {
  return Number.isFinite(value) && value > 0 ? value : null;
}

function calculateBulk(ranking: {
  Attack: number;
  Defense: number;
  Stamina: number;
}): number {
  if (
    !Number.isFinite(ranking.Attack) ||
    !Number.isFinite(ranking.Defense) ||
    !Number.isFinite(ranking.Stamina) ||
    ranking.Attack <= 0
  ) {
    return 0;
  }

  return ranking.Defense * (ranking.Stamina / ranking.Attack);
}

function uniqueNonEmptyValues(values: string[]): string[] {
  return Array.from(
    new Set(
      values.map((value) => value.trim()).filter((value) => value.length > 0),
    ),
  );
}

function cloneSimulationCoverage(
  coverage: CandidateSimulationCoverage | undefined,
): CandidateSimulationCoverage {
  if (!coverage) {
    return {
      winsAgainst: [],
      lossesAgainst: [],
      checks: [],
    };
  }

  return {
    winsAgainst: [...coverage.winsAgainst],
    lossesAgainst: [...coverage.lossesAgainst],
    checks: [...coverage.checks],
  };
}
