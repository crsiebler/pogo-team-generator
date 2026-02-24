// TypeScript types for the sync module

export interface SyncConfig {
  githubBaseUrl: string;
  pvpokeBaseUrl: string;
  outputDir: string;
  timeout: number;
  retryAttempts: number;
  localMode?: boolean;
}

export interface SyncRunOptions {
  resume?: boolean;
  sourcePath?: string;
}

export interface PokemonData {
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
  tags?: string[];
  defaultIVs: {
    cp500: number[];
    cp1500: number[];
    cp2500: number[];
  };
  level25CP: number;
  buddyDistance: number;
  thirdMoveCost: number;
  released: boolean;
  family: {
    id: string;
    evolutions?: string[];
  };
}

export interface MovesData {
  moveId: string;
  name: string;
  abbreviation: string;
  type: string;
  power: number;
  energy: number;
  energyGain: number;
  cooldown: number;
  archetype: string;
  turns: number;
}

export interface RankingEntry {
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

export interface SimulationData {
  Pokemon: string;
  Opponent: string;
  'Battle Rating': number;
  'Shield Scenario': string;
}

export type PokemonJson = PokemonData[];
export type MovesJson = MovesData[];
export type RankingsCsv = RankingEntry[];
export type SimulationsCsv = SimulationData[];

export interface RetryOptions {
  maxAttempts: number;
  baseDelay: number;
  maxDelay: number;
  backoffFactor: number;
}

export interface RateLimitOptions {
  minDelay: number;
}

export class SyncError extends Error {
  constructor(
    message: string,
    public readonly context?: string,
    public readonly cause?: Error,
    public readonly recoverable: boolean = true,
  ) {
    super(message);
    this.name = 'SyncError';
  }
}
