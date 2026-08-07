import type { BattleFormat } from '../data/battleFormats';
import { getBattleFormats } from '../data/battleFormats';

const RANKING_CATEGORIES = [
  'overall',
  'leads',
  'switches',
  'closers',
  'chargers',
  'attackers',
  'consistency',
] as const;
const GENERATE_TEAM_STATIC_DATA_ASSETS = [
  'data/moves.json',
  'data/pokemon.json',
  'data/type-effectiveness.json',
] as const;
const GENERATE_TEAM_SIMULATION_EXCLUDES = [
  'data/simulations/**/*.csv',
  'data/simulations/**/moveset-variants.json',
  'data/simulations/runtime-asset-index.json',
] as const;

/** Maximum uncompressed generate-team function trace size with compact snapshots. */
export const GENERATE_TEAM_TRACE_MAX_BYTES = 100 * 1024 * 1024;

/** Maximum aggregate uncompressed size of traced runtime simulation snapshots. */
export const RUNTIME_SIMULATION_SNAPSHOTS_MAX_BYTES = 50 * 1024 * 1024;

/** Exact repository data assets required by traced runtime API functions. */
export interface RuntimeFunctionAssetPlan {
  readonly generateTeam: readonly string[];
  readonly generateTeamExcludes: readonly string[];
  readonly pokemonList: readonly string[];
  readonly pokemonListExcludes: readonly string[];
}

/** Inputs used to validate route traces against their exact data asset plans. */
export interface RuntimeFunctionTraceValidationInput {
  readonly plan: RuntimeFunctionAssetPlan;
  readonly generateTeamTracedFiles: readonly string[];
  readonly pokemonListTracedFiles: readonly string[];
  readonly generateTeamUncompressedBytes: number;
  readonly generateTeamSnapshotUncompressedBytes: number;
}

function compareText(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function uniqueSorted(values: readonly string[]): string[] {
  return [...new Set(values)].sort(compareText);
}

function getRankingAsset(
  format: BattleFormat,
  category: (typeof RANKING_CATEGORIES)[number],
): string {
  return `data/rankings/cp${format.cp}/${format.cup}/${category}_rankings.csv`;
}

function getRuntimeSnapshotAsset(format: BattleFormat): string {
  return `data/simulations/cp${format.cp}/${format.cup}/runtime-snapshot.json`;
}

function getTracedDataAssets(files: readonly string[]): string[] {
  return uniqueSorted(
    files
      .map((file) => file.replaceAll('\\', '/'))
      .filter((file) => file.startsWith('data/')),
  );
}

function validateRouteDataAssets(
  routeName: string,
  expected: readonly string[],
  tracedFiles: readonly string[],
): void {
  const expectedSet = new Set(expected);
  const tracedDataAssets = getTracedDataAssets(tracedFiles);
  const tracedSet = new Set(tracedDataAssets);
  const missing = expected.filter((asset) => !tracedSet.has(asset));
  if (missing.length > 0) {
    throw new Error(
      `${routeName} trace is missing required runtime data assets: ${missing.join(', ')}`,
    );
  }

  const unauthorized = tracedDataAssets.filter(
    (asset) => !expectedSet.has(asset),
  );
  if (unauthorized.length > 0) {
    throw new Error(
      `${routeName} trace contains unauthorized data assets: ${unauthorized.join(', ')}`,
    );
  }
}

/** Derive deterministic exact runtime function assets from catalog authority. */
export function createRuntimeFunctionAssetPlan(
  formats: readonly BattleFormat[],
): RuntimeFunctionAssetPlan {
  const generateTeamRankings = formats.flatMap((format) =>
    RANKING_CATEGORIES.map((category) => getRankingAsset(format, category)),
  );
  const pokemonListRankings = formats.map((format) =>
    getRankingAsset(format, 'overall'),
  );
  const pokemonListExcludes = formats.flatMap((format) =>
    RANKING_CATEGORIES.filter((category) => category !== 'overall').map(
      (category) => getRankingAsset(format, category),
    ),
  );

  return {
    generateTeam: uniqueSorted([
      ...formats.map(getRuntimeSnapshotAsset),
      ...generateTeamRankings,
      ...GENERATE_TEAM_STATIC_DATA_ASSETS,
    ]),
    generateTeamExcludes: [...GENERATE_TEAM_SIMULATION_EXCLUDES],
    pokemonList: uniqueSorted(['data/pokemon.json', ...pokemonListRankings]),
    pokemonListExcludes: uniqueSorted(pokemonListExcludes),
  };
}

/** Derive the build asset plan from the checked-in battle-format catalog. */
export function loadRuntimeFunctionAssetPlan(): RuntimeFunctionAssetPlan {
  return createRuntimeFunctionAssetPlan(getBattleFormats());
}

/** Validate generated route traces against exact data authority and size limits. */
export function validateRuntimeFunctionTraceAssets(
  input: RuntimeFunctionTraceValidationInput,
): void {
  validateRouteDataAssets(
    'generate-team',
    input.plan.generateTeam,
    input.generateTeamTracedFiles,
  );
  validateRouteDataAssets(
    'pokemon-list',
    input.plan.pokemonList,
    input.pokemonListTracedFiles,
  );

  if (
    !Number.isSafeInteger(input.generateTeamUncompressedBytes) ||
    input.generateTeamUncompressedBytes < 0
  ) {
    throw new Error(
      'generate-team trace byte total must be a non-negative safe integer.',
    );
  }
  if (input.generateTeamUncompressedBytes > GENERATE_TEAM_TRACE_MAX_BYTES) {
    throw new Error(
      `generate-team trace is ${input.generateTeamUncompressedBytes} bytes; maximum is ${GENERATE_TEAM_TRACE_MAX_BYTES} bytes.`,
    );
  }
  if (
    !Number.isSafeInteger(input.generateTeamSnapshotUncompressedBytes) ||
    input.generateTeamSnapshotUncompressedBytes < 0
  ) {
    throw new Error(
      'generate-team snapshot byte total must be a non-negative safe integer.',
    );
  }
  if (
    input.generateTeamSnapshotUncompressedBytes >
    RUNTIME_SIMULATION_SNAPSHOTS_MAX_BYTES
  ) {
    throw new Error(
      `generate-team snapshots total ${input.generateTeamSnapshotUncompressedBytes} bytes; maximum is ${RUNTIME_SIMULATION_SNAPSHOTS_MAX_BYTES} bytes.`,
    );
  }
}
