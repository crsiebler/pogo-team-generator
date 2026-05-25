import type { BattleFormatId } from '@/lib/data/battleFormats';

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
    fastMove: string | null;
    chargedMove1: string | null;
    chargedMove2: string | null;
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
  buffs?: number[];
  buffTarget?: string;
  buffApplyChance?: string;
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

export type FitnessAlgorithm = 'individual' | 'teamSynergy';

/** Ordered battle roles for a pick-3 lineup. */
export type LineupRole = 'lead' | 'switch' | 'closer';

/** Diagnostic label for common PvP lineup structures. */
export type LineupPatternLabel = 'ABC' | 'ABB' | 'ABA' | 'unknown';

/** Ordered pick-3 lineup keyed by battle role. */
export type OrderedLineup = Record<LineupRole, string>;

/** Coverage metrics shared by fast scoring and recommendation output. */
export interface LineupCoverageMetrics {
  coverageRate: number;
  dominatingMatchupCount: number;
  overwhelmingLossCount: number;
  singleAnswerThreatCount: number;
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
  coverageMetrics: LineupCoverageMetrics;
  coveredThreats: string[];
  weaknesses: string[];
  diagnosticLabel: LineupPatternLabel;
  resourcePathMetrics?: LineupResourcePathMetrics;
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
      includeDiagnostics: true;
      recommendationLimit: number;
    };

export interface Chromosome {
  team: string[];
  anchors?: number[];
  fitness: number;
}

export interface GenerationOptions {
  formatId?: BattleFormatId;
  mode: TournamentMode;
  anchorPokemon?: string[];
  excludedPokemon?: string[];
  populationSize?: number;
  generations?: number;
  algorithm?: FitnessAlgorithm;
}

export interface GenerationAnalysis {
  mode: TournamentMode;
  algorithm: FitnessAlgorithm;
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
  rationale: string;
}

export interface PokemonContributionAnalysis {
  entries: PokemonContributionAnalysisEntry[];
}

export interface TypeChart {
  [attackType: string]: {
    [defenseType: string]: number;
  };
}
