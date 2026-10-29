import type { BattleFormatId } from '@/lib/data/battleFormats';
import type {
  CoreBreakerSeverityTier,
  GenerationResponse,
  LineupPatternLabel,
  MovesetAcquisitionRequirements,
  OptimizerScoreComponent,
  OptimizerScoreBreakdown,
  OptimizerThreatScoreEntry,
  PokemonContributionRiskTier,
  PokemonWithMoves,
  RecommendedLineup,
  RosterMovesetAssignment,
  ThreatSeverityTier,
  TournamentSelection,
  TournamentMode,
} from '@/lib/types';

const optimizerScoreComponents: OptimizerScoreComponent[] = [
  'synergy',
  'coverage',
  'safety',
  'consistency',
  'bulk',
  'defensiveRatio',
  'offensiveRatio',
  'role',
];

const threatSeverityTiers: ThreatSeverityTier[] = [
  'low',
  'medium',
  'high',
  'critical',
];

const coreBreakerSeverityTiers: CoreBreakerSeverityTier[] = ['medium', 'high'];
const contributionRiskTiers: PokemonContributionRiskTier[] = [
  'low',
  'moderate',
  'high',
];
const lineupPatternLabels: LineupPatternLabel[] = [
  'ABC',
  'ABB',
  'ABA',
  'unknown',
];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isNonNegativeInteger(value: unknown): value is number {
  return Number.isInteger(value) && (value as number) >= 0;
}

function isStringArray(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isNonEmptyString);
}

function hasNumericProperties(
  value: unknown,
  properties: readonly string[],
): value is Record<string, number> {
  return (
    isRecord(value) &&
    properties.every((property) => isFiniteNumber(value[property]))
  );
}

function isThreatScoreEntry(
  value: unknown,
): value is OptimizerThreatScoreEntry {
  return (
    isRecord(value) &&
    isNonEmptyString(value.speciesId) &&
    isNonEmptyString(value.pokemon) &&
    isFiniteNumber(value.rank) &&
    isFiniteNumber(value.teamAnswers) &&
    isFiniteNumber(value.threatValue) &&
    threatSeverityTiers.includes(value.severityTier as ThreatSeverityTier)
  );
}

function isThreatScorePool(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.score === null || isFiniteNumber(value.score)) &&
    isNonNegativeInteger(value.evaluatedCount) &&
    isFiniteNumber(value.weight)
  );
}

function isThreatScore(value: unknown): boolean {
  return (
    isRecord(value) &&
    isFiniteNumber(value.score) &&
    isNonNegativeInteger(value.evaluatedCount) &&
    Array.isArray(value.topMetaThreats) &&
    value.topMetaThreats.every(isThreatScoreEntry) &&
    Array.isArray(value.overallTeamThreats) &&
    value.overallTeamThreats.every(isThreatScoreEntry) &&
    isRecord(value.pools) &&
    isThreatScorePool(value.pools.topMeta) &&
    isThreatScorePool(value.pools.fullMeta)
  );
}

function isOptimizerScoreBreakdown(
  value: unknown,
): value is OptimizerScoreBreakdown {
  if (!isRecord(value)) return false;

  const numericComponents = hasNumericProperties(
    value.components,
    optimizerScoreComponents,
  );
  const numericWeights = hasNumericProperties(
    value.weights,
    optimizerScoreComponents,
  );

  return (
    (value.scoreBasis === undefined ||
      value.scoreBasis === 'weighted' ||
      value.scoreBasis === 'tournament-typical') &&
    numericComponents &&
    numericWeights &&
    isFiniteNumber(value.score) &&
    (value.threatScore === undefined || isThreatScore(value.threatScore)) &&
    (value.threatContribution === undefined ||
      isFiniteNumber(value.threatContribution))
  );
}

function isThreatAnalysisEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.speciesId) &&
    isNonEmptyString(value.pokemon) &&
    isFiniteNumber(value.rank) &&
    isFiniteNumber(value.teamAnswers) &&
    threatSeverityTiers.includes(value.severityTier as ThreatSeverityTier)
  );
}

function isCoreBreakerEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.pokemon) &&
    isFiniteNumber(value.rank) &&
    isFiniteNumber(value.teamAnswers) &&
    coreBreakerSeverityTiers.includes(
      value.severityTier as CoreBreakerSeverityTier,
    )
  );
}

function isContributionEntry(value: unknown): boolean {
  return (
    isRecord(value) &&
    isNonEmptyString(value.speciesId) &&
    isNonEmptyString(value.pokemon) &&
    isFiniteNumber(value.threatsHandled) &&
    isFiniteNumber(value.coverageAdded) &&
    isFiniteNumber(value.highSeverityRelief) &&
    contributionRiskTiers.includes(
      value.fragilityRiskTier as PokemonContributionRiskTier,
    )
  );
}

function isGenerationAnalysis(value: unknown): boolean {
  if (!isRecord(value)) return false;

  const shieldScenarios = value.shieldScenarios;
  const shieldKeys = ['0-0', '1-1', '2-2'];
  return (
    isNonEmptyString(value.generatedAt) &&
    isRecord(value.threats) &&
    isNonNegativeInteger(value.threats.evaluatedCount) &&
    Array.isArray(value.threats.entries) &&
    value.threats.entries.every(isThreatAnalysisEntry) &&
    isRecord(value.coreBreakers) &&
    isFiniteNumber(value.coreBreakers.threshold) &&
    Array.isArray(value.coreBreakers.entries) &&
    value.coreBreakers.entries.every(isCoreBreakerEntry) &&
    isRecord(shieldScenarios) &&
    shieldKeys.every(
      (key) =>
        isRecord(shieldScenarios[key]) &&
        isFiniteNumber(shieldScenarios[key].coveredThreats) &&
        isFiniteNumber(shieldScenarios[key].evaluatedThreats) &&
        isFiniteNumber(shieldScenarios[key].coverageRate),
    ) &&
    isRecord(value.pokemonContributions) &&
    Array.isArray(value.pokemonContributions.entries) &&
    value.pokemonContributions.entries.every(isContributionEntry)
  );
}

function isThreatPoolCoverageMetrics(value: unknown): boolean {
  return (
    isRecord(value) &&
    (value.softCoverageRate === undefined ||
      isFiniteNumber(value.softCoverageRate)) &&
    isFiniteNumber(value.coverageRate) &&
    isFiniteNumber(value.evaluatedThreatCount) &&
    isFiniteNumber(value.noAnswerThreatCount) &&
    isFiniteNumber(value.singleAnswerThreatCount) &&
    isFiniteNumber(value.dominatingMatchupCount) &&
    isFiniteNumber(value.overwhelmingLossCount)
  );
}

function isRecommendedLineup(value: unknown): value is RecommendedLineup {
  if (!isRecord(value) || !isRecord(value.lineup)) return false;
  const lineup = value.lineup;
  const metrics = value.coverageMetrics;
  return (
    isNonEmptyString(lineup.lead) &&
    isNonEmptyString(lineup.switch) &&
    isNonEmptyString(lineup.closer) &&
    isFiniteNumber(value.score) &&
    (value.scoreBreakdown === undefined ||
      isOptimizerScoreBreakdown(value.scoreBreakdown)) &&
    isRecord(metrics) &&
    isFiniteNumber(metrics.coverageRate) &&
    isFiniteNumber(metrics.dominatingMatchupCount) &&
    isFiniteNumber(metrics.overwhelmingLossCount) &&
    isFiniteNumber(metrics.singleAnswerThreatCount) &&
    (metrics.topThreatCoverage === undefined ||
      isThreatPoolCoverageMetrics(metrics.topThreatCoverage)) &&
    (metrics.fullMetaCoverage === undefined ||
      isThreatPoolCoverageMetrics(metrics.fullMetaCoverage)) &&
    isStringArray(value.coveredThreats) &&
    isStringArray(value.weaknesses) &&
    lineupPatternLabels.includes(value.diagnosticLabel as LineupPatternLabel)
  );
}

function isTournamentSelection(value: unknown): value is TournamentSelection {
  if (!isRecord(value) || !isRecord(value.objectives)) return false;
  const objectives = value.objectives;
  const coverageAudit = value.coverageAudit;
  return (
    isNonEmptyString(value.policyVersion) &&
    isNonEmptyString(value.datasetFingerprint) &&
    (value.stage === 'search' ||
      value.stage === 'selection' ||
      value.stage === 'held-out') &&
    (value.source === 'synthetic' ||
      value.source === 'curated' ||
      value.source === 'mixed') &&
    hasNumericProperties(objectives, [
      'coverage',
      'redundancy',
      'typical',
      'lowerTail',
      'flexibility',
      'independence',
    ]) &&
    (coverageAudit === undefined ||
      (isRecord(coverageAudit) &&
        isNonNegativeInteger(coverageAudit.threatCount) &&
        isNonNegativeInteger(coverageAudit.uncoveredCount) &&
        isNonNegativeInteger(coverageAudit.singleAnswerCount) &&
        isNonNegativeInteger(coverageAudit.evaluatedPairs) &&
        isFiniteNumber(coverageAudit.backupCoverage) &&
        isFiniteNumber(coverageAudit.pairProtection) &&
        Array.isArray(coverageAudit.gaps) &&
        coverageAudit.gaps.every(
          (gap) =>
            isRecord(gap) &&
            isNonEmptyString(gap.speciesId) &&
            isFiniteNumber(gap.answers) &&
            isNonEmptyString(gap.primaryAnswer) &&
            isFiniteNumber(gap.risk),
        ))) &&
    isNonNegativeInteger(value.evaluatedRosters) &&
    isNonNegativeInteger(value.missingCells) &&
    (value.status === 'complete' || value.status === 'insufficient') &&
    isStringArray(value.limitations)
  );
}

function isAcquisitionRequirements(
  value: unknown,
): value is MovesetAcquisitionRequirements {
  if (!isRecord(value)) return false;

  return ['fastMove', 'chargedMove1', 'chargedMove2'].every((slot) => {
    const requirement = value[slot];
    return (
      isRecord(requirement) &&
      (requirement.kind === 'regular' ||
        requirement.kind === 'elite' ||
        requirement.kind === 'eventExclusive' ||
        requirement.kind === 'purified')
    );
  });
}

/** The Pokémon dataset omits tags for some records; cards handle that case. */
type DisplayPokemonResponse = Omit<PokemonWithMoves, 'tags'> & {
  tags?: string[];
};

function hasDisplayFields(pokemon: unknown): pokemon is DisplayPokemonResponse {
  if (!isRecord(pokemon) || !isRecord(pokemon.baseStats)) return false;
  if (!isRecord(pokemon.defaultIVs)) return false;

  const recommendedMoveset = pokemon.recommendedMoveset;
  if (
    !isRecord(recommendedMoveset) ||
    !isRecord(recommendedMoveset.authority)
  ) {
    return false;
  }

  const authority = recommendedMoveset.authority;
  const requirements = recommendedMoveset.acquisitionRequirements;

  return (
    Number.isFinite(pokemon.dex) &&
    isNonEmptyString(pokemon.speciesId) &&
    isNonEmptyString(pokemon.speciesName) &&
    Number.isFinite(pokemon.baseStats.atk) &&
    Number.isFinite(pokemon.baseStats.def) &&
    Number.isFinite(pokemon.baseStats.hp) &&
    isStringArray(pokemon.types) &&
    isStringArray(pokemon.fastMoves) &&
    isStringArray(pokemon.chargedMoves) &&
    (pokemon.tags === undefined || isStringArray(pokemon.tags)) &&
    Number.isFinite(pokemon.buddyDistance) &&
    Number.isFinite(pokemon.thirdMoveCost) &&
    typeof pokemon.released === 'boolean' &&
    (pokemon.eliteMoves === undefined || isStringArray(pokemon.eliteMoves)) &&
    (pokemon.legacyMoves === undefined || isStringArray(pokemon.legacyMoves)) &&
    (pokemon.extraChargedMoves === undefined ||
      isStringArray(pokemon.extraChargedMoves)) &&
    isNonEmptyString(recommendedMoveset.id) &&
    isNonEmptyString(recommendedMoveset.fastMove) &&
    isNonEmptyString(recommendedMoveset.chargedMove1) &&
    isNonEmptyString(recommendedMoveset.chargedMove2) &&
    typeof recommendedMoveset.isDefault === 'boolean' &&
    (recommendedMoveset.additionalChargedMove === undefined ||
      isNonEmptyString(recommendedMoveset.additionalChargedMove)) &&
    (recommendedMoveset.megaLevel === undefined ||
      recommendedMoveset.megaLevel === 4) &&
    (authority.source === 'manifest' ||
      authority.source === 'ranked-default-fallback') &&
    Number.isInteger(authority.schemaVersion) &&
    isNonEmptyString(authority.policyVersion) &&
    isAcquisitionRequirements(requirements)
  );
}

function isAssignment(value: unknown): value is RosterMovesetAssignment {
  if (!isRecord(value)) return false;
  const authorities = value.authorityBySpeciesId;
  const variants = value.variantsBySpeciesId;
  if (
    !isNonEmptyString(value.formatId) ||
    !isRecord(authorities) ||
    !isRecord(variants) ||
    !isNonEmptyString(value.fingerprint)
  ) {
    return false;
  }

  return Object.entries(variants).every(([speciesId, variant]) => {
    const authority = authorities[speciesId];
    return (
      isRecord(variant) &&
      isNonEmptyString(variant.id) &&
      isNonEmptyString(variant.fastMove) &&
      isNonEmptyString(variant.chargedMove1) &&
      isNonEmptyString(variant.chargedMove2) &&
      typeof variant.isDefault === 'boolean' &&
      (variant.additionalChargedMove === undefined ||
        isNonEmptyString(variant.additionalChargedMove)) &&
      (variant.megaLevel === undefined || variant.megaLevel === 4) &&
      isRecord(authority) &&
      (authority.source === 'manifest' ||
        authority.source === 'ranked-default-fallback') &&
      Number.isInteger(authority.schemaVersion) &&
      isNonEmptyString(authority.policyVersion)
    );
  });
}

function matchesAssignment(
  pokemon: DisplayPokemonResponse,
  speciesId: string,
  assignment: RosterMovesetAssignment,
): boolean {
  const variant = assignment.variantsBySpeciesId[speciesId];
  const authority = assignment.authorityBySpeciesId[speciesId];
  const moveset = pokemon.recommendedMoveset;
  if (!variant || !authority) return false;

  return (
    moveset.id === variant.id &&
    moveset.fastMove === variant.fastMove &&
    moveset.chargedMove1 === variant.chargedMove1 &&
    moveset.chargedMove2 === variant.chargedMove2 &&
    moveset.additionalChargedMove === variant.additionalChargedMove &&
    moveset.megaLevel === variant.megaLevel &&
    moveset.isDefault === variant.isDefault &&
    moveset.authority.source === authority.source &&
    moveset.authority.schemaVersion === authority.schemaVersion &&
    moveset.authority.policyVersion === authority.policyVersion
  );
}

/** Validate a generation payload before exposing it as a complete result. */
export function parseGenerationResponse(
  value: unknown,
  expectedFormatId: BattleFormatId,
  expectedMode: TournamentMode,
): GenerationResponse {
  if (!isRecord(value) || !Array.isArray(value.team)) {
    throw new Error('Generation response is invalid. Please try again.');
  }

  const expectedSize = expectedMode === 'GBL' ? 3 : 6;
  const team = value.team;
  const assignment = value.movesetAssignment;
  const analysis = value.analysis;
  const pokemon = value.pokemon;

  if (
    team.length !== expectedSize ||
    !team.every(isNonEmptyString) ||
    new Set(team).size !== team.length ||
    !Number.isFinite(value.fitness) ||
    !isAssignment(assignment) ||
    assignment.formatId !== expectedFormatId ||
    !isRecord(analysis) ||
    analysis.mode !== expectedMode ||
    analysis.teamSize !== expectedSize ||
    !isGenerationAnalysis(analysis) ||
    !Array.isArray(pokemon) ||
    pokemon.length !== expectedSize ||
    (value.scoreBreakdown !== undefined &&
      !isOptimizerScoreBreakdown(value.scoreBreakdown)) ||
    (value.recommendedLineups !== undefined &&
      (!Array.isArray(value.recommendedLineups) ||
        !value.recommendedLineups.every(isRecommendedLineup))) ||
    (value.tournamentSelection !== undefined &&
      !isTournamentSelection(value.tournamentSelection)) ||
    Object.keys(assignment.variantsBySpeciesId).length !== expectedSize ||
    Object.keys(assignment.authorityBySpeciesId).length !== expectedSize
  ) {
    throw new Error('Generation response is invalid. Please try again.');
  }

  for (let index = 0; index < expectedSize; index += 1) {
    const speciesId = team[index];
    const entry = pokemon[index];
    if (
      typeof speciesId !== 'string' ||
      !hasDisplayFields(entry) ||
      entry.speciesId !== speciesId ||
      !matchesAssignment(entry, speciesId, assignment)
    ) {
      throw new Error('Generation response is invalid. Please try again.');
    }
  }

  return value as unknown as GenerationResponse;
}
