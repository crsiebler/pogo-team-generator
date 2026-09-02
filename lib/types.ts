import type { BattleFormatId } from '@/lib/data/battleFormats';

/** One complete battle moveset in preferred simulation and display order. */
export interface Moveset {
  readonly fastMove: string;
  readonly chargedMove1: string;
  readonly chargedMove2: string;
}

/** Canonical identity for a fast move and order-independent charged-move pair. */
export type MovesetVariantId = `${string}--${string}--${string}`;

/** Acquisition category for one move in a moveset. */
export type MoveAvailability =
  | { readonly kind: 'regular' }
  | { readonly kind: 'elite' }
  | { readonly kind: 'eventExclusive' }
  | { readonly kind: 'purified' }
  | { readonly kind: 'excluded'; readonly reason: string };

/** Acquisition category for a move that is eligible for recommendation. */
export type EligibleMoveAvailability = Exclude<
  MoveAvailability,
  { readonly kind: 'excluded' }
>;

/** Acquisition requirements for every move slot in one recommended moveset. */
export type MovesetAcquisitionRequirements = Readonly<{
  [Slot in keyof Moveset]: EligibleMoveAvailability;
}>;

/** One legal moveset variant with canonical identity and preferred move order. */
export interface MovesetVariant extends Moveset {
  readonly id: MovesetVariantId;
  readonly isDefault: boolean;
  /** Fixed species-specific Mega move, excluded from variant identity. */
  readonly additionalChargedMove?: string;
  /** Fixed Mega level used when the additional move is active. */
  readonly megaLevel?: 4;
}

/** Policy authority used to resolve one species in a fixed roster assignment. */
export interface MovesetAssignmentPolicyIdentity {
  readonly source: 'manifest' | 'ranked-default-fallback';
  readonly schemaVersion: number;
  readonly policyVersion: string;
}

/** Fixed moveset variants and deterministic identity for one roster. */
export interface RosterMovesetAssignment {
  readonly formatId: BattleFormatId;
  readonly authorityBySpeciesId: Readonly<
    Record<string, MovesetAssignmentPolicyIdentity>
  >;
  readonly variantsBySpeciesId: Readonly<Record<string, MovesetVariant>>;
  readonly fingerprint: string;
}

/** Attack and defense stage changes applied by a move. */
export type MoveStatStages = readonly [attack: number, defense: number];

/** Battler or battlers affected by a move's status effect. */
export type MoveEffectTarget = 'self' | 'opponent' | 'both';

export interface Pokemon {
  dex: number;
  speciesName: string;
  speciesId: string;
  baseStats: {
    atk: number;
    def: number;
    hp: number;
  };
  types: string[];
  fastMoves: string[];
  chargedMoves: string[];
  eliteMoves?: string[];
  legacyMoves?: string[];
  extraChargedMoves?: string[];
  level25CP?: number;
  tags: string[];
  defaultIVs: {
    cp1500?: number[];
    cp2500?: number[];
  };
  buddyDistance: number;
  thirdMoveCost: number;
  released: boolean;
  family?: {
    id: string;
    evolutions?: string[];
  };
  recommendedMoveset?: {
    id?: MovesetVariantId;
    fastMove: string | null;
    chargedMove1: string | null;
    chargedMove2: string | null;
    additionalChargedMove?: string;
    megaLevel?: 4;
    isDefault?: boolean;
    authority?: MovesetAssignmentPolicyIdentity;
    acquisitionRequirements?: MovesetAcquisitionRequirements;
  };
}

export interface Move {
  moveId: string;
  name: string;
  type: string;
  power: number;
  energy: number;
  energyGain: number;
  cooldown: number;
  archetype: string;
  turns?: number;
  buffs?: MoveStatStages;
  buffsSelf?: MoveStatStages;
  buffsOpponent?: MoveStatStages;
  buffTarget?: MoveEffectTarget;
  buffApplyChance?: string;
  isMegaMove?: boolean;
}

export interface RankedPokemon {
  Pokemon: string;
  Score: number;
  Dex: number;
  'Type 1': string;
  'Type 2': string;
  Attack: number;
  Defense: number;
  Stamina: number;
  'Stat Product': number;
  Level: number;
  CP: number;
  'Fast Move': string;
  'Charged Move 1': string;
  'Charged Move 2': string;
  'Charged Move 1 Count': number;
  'Charged Move 2 Count': number;
  'Buddy Distance': number;
  'Charged Move Cost': number;
}

export type TournamentMode = 'PlayPokemon' | 'GBL';

/** Ordered battle roles for a pick-3 lineup. */
export type LineupRole = 'lead' | 'switch' | 'closer';

/** Diagnostic label for common PvP lineup structures. */
export type LineupPatternLabel = 'ABC' | 'ABB' | 'ABA' | 'unknown';

/** Canonical optimizer score components shown in priority order. */
export type OptimizerScoreComponent =
  | 'synergy'
  | 'coverage'
  | 'safety'
  | 'consistency'
  | 'bulk'
  | 'defensiveRatio'
  | 'offensiveRatio'
  | 'role';

/** Normalized optimizer component scores. */
export type OptimizerScoreComponents = Record<OptimizerScoreComponent, number>;

/** Weight table used to aggregate optimizer score components. */
export type OptimizerScoreWeights = Readonly<OptimizerScoreComponents>;

/** UI/API-ready normalized optimizer score breakdown. */
export interface OptimizerScoreBreakdown {
  components: OptimizerScoreComponents;
  weights: OptimizerScoreWeights;
  score: number;
  threatScore?: OptimizerThreatScore;
}

/** Ranked optimizer threat score entry, where higher threatValue is worse. */
export interface OptimizerThreatScoreEntry {
  speciesId: string;
  pokemon: string;
  rank: number;
  teamAnswers: number;
  /** Higher-is-worse normalized risk contribution for ranked display. */
  threatValue: number;
  severityTier: ThreatSeverityTier;
}

/** Lower-is-better aggregate diagnostics for one threat pool. */
export interface OptimizerThreatScorePool {
  /** Normalized 0..1 pool score, or null when no threats were evaluated. */
  score: number | null;
  /** Count of threats in this pool with at least one matchup row. */
  evaluatedCount: number;
  /** Normalized active aggregate weight used for the final threat score. */
  weight: number;
}

/** Split top-meta and full-meta threat pool diagnostics. */
export interface OptimizerThreatScorePools {
  topMeta: OptimizerThreatScorePool;
  fullMeta: OptimizerThreatScorePool;
}

/** Lower-is-better optimizer threat score diagnostics for a team or lineup. */
export interface OptimizerThreatScore {
  /** Normalized 0..1 aggregate score where lower means fewer severe threats. */
  score: number;
  /** Count of unique top/full-meta threats with at least one matchup row. */
  evaluatedCount: number;
  /** Worst top-meta threats first; threats without matchup rows are excluded. */
  topMetaThreats: OptimizerThreatScoreEntry[];
  /** Worst unique top/full-meta threats first; missing rows are excluded. */
  overallTeamThreats: OptimizerThreatScoreEntry[];
  /** Per-pool lower-is-better diagnostics and active aggregate weights. */
  pools: OptimizerThreatScorePools;
}

/** Ordered pick-3 lineup keyed by battle role. */
export type OrderedLineup = Record<LineupRole, string>;

/** Coverage metrics for one bounded threat pool. */
export interface ThreatPoolCoverageMetrics {
  coverageRate: number;
  evaluatedThreatCount: number;
  noAnswerThreatCount: number;
  singleAnswerThreatCount: number;
  dominatingMatchupCount: number;
  overwhelmingLossCount: number;
}

/** Coverage metrics shared by fast scoring and recommendation output. */
export interface LineupCoverageMetrics {
  coverageRate: number;
  dominatingMatchupCount: number;
  overwhelmingLossCount: number;
  singleAnswerThreatCount: number;
  topThreatCoverage?: ThreatPoolCoverageMetrics;
  fullMetaCoverage?: ThreatPoolCoverageMetrics;
}

/** Availability and score for one shield or resource path. */
export type LineupResourcePathMetric =
  | { available: true; score: number }
  | { available: false; score?: never };

/** Shield/resource path metrics for an ordered lineup. */
export interface LineupResourcePathMetrics {
  balanced: LineupResourcePathMetric;
  shieldSpend: LineupResourcePathMetric;
  shieldSave: LineupResourcePathMetric;
}

/** UI-ready recommended lineup with diagnostics. */
export interface RecommendedLineup {
  lineup: OrderedLineup;
  score: number;
  scoreBreakdown?: OptimizerScoreBreakdown;
  coverageMetrics: LineupCoverageMetrics;
  coveredThreats: string[];
  weaknesses: string[];
  diagnosticLabel: LineupPatternLabel;
}

/** Per-Pokemon utility in recommended PlayPokemon lineups. */
export interface BenchUtility {
  speciesId: string;
  utilityScore: number;
  totalAppearances: number;
  leadAppearances: number;
  switchAppearances: number;
  closerAppearances: number;
  warnings: string[];
}

/** Bring-6 roster-level metrics derived from lineup-aware scoring. */
export interface PlayPokemonRosterMetrics {
  viableLineupCount: number;
  topLineupQuality: number;
  topNLineupDepth: number;
  dominatingMatchupRate: number;
  overwhelmingLossRate: number;
  singleAnswerRisks: string[];
  viableLeadDiversity: number;
  benchUtilitySummary: BenchUtility[];
}

/** Configuration for fast GA scoring versus full diagnostics. */
export type LineupAwareFitnessConfig =
  | {
      mode: 'fast';
      includeDiagnostics: false;
      recommendationLimit: 0;
    }
  | {
      mode: 'full';
      includeDiagnostics: false;
      recommendationLimit: 0;
    }
  | {
      mode: 'full';
      includeDiagnostics: true;
      recommendationLimit: number;
    };

/** Bounded work and lineup-cache counters from finalist assignment reranking. */
export interface FinalistRerankingStats {
  readonly finalistCount: number;
  readonly assignmentEvaluationCount: number;
  readonly fullScoreCount: number;
  readonly lineupCache: {
    readonly hits: number;
    readonly misses: number;
    readonly size: number;
  };
}

export interface Chromosome {
  team: string[];
  anchors?: number[];
  fitness: number;
  /** Canonical top GA rosters scored with ranked-default movesets. */
  defaultScoredFinalists?: readonly Chromosome[];
  finalistRerankingStats?: FinalistRerankingStats;
  movesetAssignment?: RosterMovesetAssignment;
  scoreBreakdown?: OptimizerScoreBreakdown;
  recommendedLineups?: RecommendedLineup[];
}

export interface GenerationOptions {
  formatId?: BattleFormatId;
  mode: TournamentMode;
  /** Enables simulation-backed alternatives instead of ranked default movesets. */
  simulateMovesetVariants?: boolean;
  anchorPokemon?: string[];
  excludedPokemon?: string[];
  populationSize?: number;
  generations?: number;
}

export interface GenerationAnalysis {
  mode: TournamentMode;
  teamSize: number;
  generatedAt: string;
  threats: ThreatAnalysis;
  coreBreakers: CoreBreakerAnalysis;
  shieldScenarios: ShieldScenarioAnalysis;
  pokemonContributions: PokemonContributionAnalysis;
}

export type ShieldScenarioKey = '0-0' | '1-1' | '2-2';

export interface ShieldScenarioStats {
  coveredThreats: number;
  evaluatedThreats: number;
  coverageRate: number;
}

export type ShieldScenarioAnalysis = Record<
  ShieldScenarioKey,
  ShieldScenarioStats
>;

export type ThreatSeverityTier = 'low' | 'medium' | 'high' | 'critical';

export interface ThreatAnalysisEntry {
  speciesId: string;
  pokemon: string;
  rank: number;
  teamAnswers: number;
  severityTier: ThreatSeverityTier;
}

export interface ThreatAnalysis {
  evaluatedCount: number;
  entries: ThreatAnalysisEntry[];
}

export type CoreBreakerSeverityTier = 'medium' | 'high';

export interface CoreBreakerAnalysisEntry {
  pokemon: string;
  rank: number;
  teamAnswers: number;
  severityTier: CoreBreakerSeverityTier;
}

export interface CoreBreakerAnalysis {
  threshold: number;
  entries: CoreBreakerAnalysisEntry[];
}

export type PokemonContributionRiskTier = 'low' | 'moderate' | 'high';

export interface PokemonContributionAnalysisEntry {
  speciesId: string;
  pokemon: string;
  threatsHandled: number;
  coverageAdded: number;
  highSeverityRelief: number;
  fragilityRiskTier: PokemonContributionRiskTier;
}

export interface PokemonContributionAnalysis {
  entries: PokemonContributionAnalysisEntry[];
}

export interface TypeChart {
  [attackType: string]: {
    [defenseType: string]: number;
  };
}
