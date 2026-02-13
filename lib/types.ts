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

export interface Chromosome {
  team: string[];
  anchors?: number[];
  fitness: number;
}

export interface GenerationOptions {
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

export interface TypeChart {
  [attackType: string]: {
    [defenseType: string]: number;
  };
}
