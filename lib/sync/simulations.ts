import { randomUUID } from 'crypto';
import * as fs from 'fs';
import { promises as fsAsync } from 'fs';
import * as path from 'path';
import vm from 'vm';
import { syncConfig } from './config';
import { resolvePvpokeSourcePath } from './source';
import { SyncRunOptions, SimulationData, SimulationsCsv } from './types';
import { logError } from './utils';
import { logValidationErrors, validateSimulationsCsv } from './validation';
import {
  moveNameToMoveId,
  normalizeToChoosableSpeciesId,
} from '@/lib/data/aliases';
import {
  BattleFormat,
  BattleFormatId,
  getBattleFormats,
} from '@/lib/data/battleFormats';
import { createMoveAvailabilityResolver } from '@/lib/data/moveAvailability';
import {
  MAX_MOVESET_CANDIDATES,
  MOVESET_VARIANT_SCENARIOS,
} from '@/lib/data/movesetVariantManifest';
import { getMovesetVariantId } from '@/lib/data/movesetVariants';
import { extractSpeciesNameFromSimulationCell } from '@/lib/data/simulations';
import type { DerivedMovesetCandidateSet } from '@/lib/sync/movesetCandidates';
import {
  selectActiveMovesetVariants,
  type ActiveMovesetVariantSelection,
  type MovesetVariantSimulationEvidence,
  type MovesetVariantSimulationMatchup,
} from '@/lib/sync/movesetVariantManifest';
import type {
  MovesetVariant,
  MovesetVariantId,
  ShieldScenarioKey,
} from '@/lib/types';

interface RankingsCsvEntry {
  Pokemon: string;
  'Fast Move': string;
  'Charged Move 1': string;
  'Charged Move 2': string;
}

interface RecommendedMoveIds {
  fastMove: string;
  chargedMove1: string;
  chargedMove2: string | null;
}

type RecommendedMovesBySpeciesId = Readonly<Record<string, RecommendedMoveIds>>;

/** Sync options that can invalidate cached outputs for changed ranking pools. */
export interface SimulationSyncOptions extends SyncRunOptions {
  readonly forceRegenerateFormatIds?: ReadonlySet<BattleFormat['id']>;
  readonly candidateSets?: readonly DerivedMovesetCandidateSet[];
  readonly simulationSpeciesIdsByFormatId?: ReadonlyMap<
    BattleFormatId,
    readonly string[]
  >;
  readonly deferPublication?: boolean;
}

interface SimulationPokemonData {
  speciesId: string;
  speciesName: string;
  fastMoves: string[];
  chargedMoves: string[];
  eliteMoves?: string[];
  legacyMoves?: string[];
  released: boolean;
}

interface SimulationMoveData {
  moveId: string;
  name: string;
  energyGain: number;
}

interface PvpokeVmRuntime {
  context: vm.Context & Record<string, unknown>;
}

interface AjaxOptions {
  dataType?: string;
  url: string;
  success?: (data: unknown) => void;
  error?: (request: unknown, error: unknown) => void;
}

const runtimeBySourcePath = new Map<string, PvpokeVmRuntime>();
const CANONICAL_SPECIES_ID_PATTERN = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const CANONICAL_MOVE_ID_PATTERN = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;
const CANONICAL_VARIANT_ID_PATTERN =
  /^[a-z0-9]+(?:_[a-z0-9]+)*(?:--[a-z0-9]+(?:_[a-z0-9]+)*){2}$/;
const TOP_META_OPPONENT_LIMIT = 50;
const FULL_META_OPPONENT_LIMIT = 100;

const SIMULATION_SCENARIOS = MOVESET_VARIANT_SCENARIOS.map((scenario) => ({
  scenario,
  shields: Number.parseInt(scenario, 10),
}));

/** Active variant selection for one format and canonical species. */
export interface SimulationVariantSelection extends ActiveMovesetVariantSelection {
  readonly formatId: BattleFormatId;
  readonly speciesId: string;
}

/** Generated flat simulation rows plus manifest-ready variant selections. */
export interface SimulationSyncResult {
  readonly simulations: SimulationsCsv;
  readonly variantSelections: readonly SimulationVariantSelection[];
  readonly preparedCsvFiles: readonly PreparedSimulationCsv[];
}

/** One validated simulation CSV ready for transactional publication. */
export interface PreparedSimulationCsv {
  readonly formatId: BattleFormatId;
  readonly targetPath: string;
  readonly contents: string;
}

function getCandidateSetKey(
  formatId: BattleFormatId,
  speciesId: string,
): string {
  return `${formatId}|${speciesId}`;
}

function getValidatedCandidates(
  format: BattleFormat,
  speciesId: string,
  candidateSet: DerivedMovesetCandidateSet | undefined,
  pokemon: SimulationPokemonData,
  moveById: ReadonlyMap<string, SimulationMoveData>,
  getMoveAvailability: ReturnType<typeof createMoveAvailabilityResolver>,
  recommendedMoves: RecommendedMoveIds | undefined,
): readonly MovesetVariant[] {
  if (!candidateSet) {
    return [];
  }
  if (
    candidateSet.formatId !== format.id ||
    candidateSet.cup !== format.cup ||
    candidateSet.cp !== format.cp ||
    candidateSet.speciesId !== speciesId
  ) {
    throw new Error(
      `[sync-simulations] Candidate set metadata does not match ${format.id}/${speciesId}`,
    );
  }
  if (candidateSet.candidates.length > MAX_MOVESET_CANDIDATES) {
    throw new Error(
      `[sync-simulations] ${format.id}/${speciesId} has ${candidateSet.candidates.length} candidates; maximum is ${MAX_MOVESET_CANDIDATES}`,
    );
  }

  const defaultCandidates = candidateSet.candidates.filter(
    ({ isDefault }) => isDefault,
  );
  if (defaultCandidates.length !== 1) {
    throw new Error(
      `[sync-simulations] ${format.id}/${speciesId} must have exactly one default candidate`,
    );
  }
  const defaultCandidate = defaultCandidates[0];
  if (
    !recommendedMoves?.chargedMove2 ||
    defaultCandidate.fastMove !== recommendedMoves.fastMove ||
    defaultCandidate.chargedMove1 !== recommendedMoves.chargedMove1 ||
    defaultCandidate.chargedMove2 !== recommendedMoves.chargedMove2
  ) {
    throw new Error(
      `[sync-simulations] Derived default does not match emitted Overall moves for ${format.id}/${speciesId}`,
    );
  }

  const candidateIds = new Set<string>();
  for (const candidate of candidateSet.candidates) {
    if (candidateIds.has(candidate.id)) {
      throw new Error(
        `[sync-simulations] Duplicate candidate variant '${candidate.id}' for ${format.id}/${speciesId}`,
      );
    }
    candidateIds.add(candidate.id);
    if (candidate.id !== getMovesetVariantId(candidate)) {
      throw new Error(
        `[sync-simulations] Candidate '${candidate.id}' has an inconsistent variant identity for ${format.id}/${speciesId}`,
      );
    }
    if (candidate.chargedMove1 === candidate.chargedMove2) {
      throw new Error(
        `[sync-simulations] Candidate '${candidate.id}' repeats its charged move for ${format.id}/${speciesId}`,
      );
    }

    const moveSlots = [
      ['fast', candidate.fastMove],
      ['charged', candidate.chargedMove1],
      ['charged', candidate.chargedMove2],
    ] as const;
    for (const [slot, moveId] of moveSlots) {
      if (!CANONICAL_MOVE_ID_PATTERN.test(moveId)) {
        throw new Error(
          `[sync-simulations] Candidate '${candidate.id}' has path-unsafe move '${moveId}'`,
        );
      }
      const move = moveById.get(moveId);
      const isCorrectSlot =
        move && (slot === 'fast' ? move.energyGain > 0 : move.energyGain <= 0);
      const availability = getMoveAvailability(speciesId, moveId, format.id);
      if (!isCorrectSlot || availability.kind === 'excluded') {
        throw new Error(
          `[sync-simulations] Candidate '${candidate.id}' has invalid ${slot} move '${moveId}' for ${format.id}/${pokemon.speciesId}`,
        );
      }
    }
  }

  return candidateSet.candidates;
}

/**
 * Parse rankings CSV text into key/value objects.
 */
function parseRankingsCsv(csvText: string): RankingsCsvEntry[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(',');
  const entries: RankingsCsvEntry[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const entry: Record<string, string> = {};

    headers.forEach((header, index) => {
      entry[header.trim()] = values[index]?.trim() ?? '';
    });

    entries.push({
      Pokemon: entry.Pokemon,
      'Fast Move': entry['Fast Move'],
      'Charged Move 1': entry['Charged Move 1'],
      'Charged Move 2': entry['Charged Move 2'],
    });
  }

  return entries;
}

function resolveMoveId(
  moveName: string,
  slot: 'fast' | 'charged',
  pokemon: SimulationPokemonData,
  moveById: ReadonlyMap<string, SimulationMoveData>,
): string {
  const supplementalMoveIds = [
    ...(pokemon.eliteMoves ?? []),
    ...(pokemon.legacyMoves ?? []),
  ].filter((moveId) => {
    const move = moveById.get(moveId);
    return (
      move && (slot === 'fast' ? move.energyGain > 0 : move.energyGain <= 0)
    );
  });
  const moveIds = [
    ...(slot === 'fast' ? pokemon.fastMoves : pokemon.chargedMoves),
    ...supplementalMoveIds,
  ];
  const matchingMoveIds = [...new Set(moveIds)].filter(
    (moveId) => moveById.get(moveId)?.name === moveName,
  );

  if (matchingMoveIds.length === 1) {
    return matchingMoveIds[0];
  }

  if (matchingMoveIds.length > 1) {
    throw new Error(
      `[sync-simulations] Ambiguous ${slot} move '${moveName}' for '${pokemon.speciesId}': ${matchingMoveIds.join(', ')}`,
    );
  }

  const normalizedMoveId = moveNameToMoveId(moveName);
  const normalizedMove = moveById.get(normalizedMoveId);
  if (
    normalizedMove &&
    (slot === 'fast'
      ? normalizedMove.energyGain > 0
      : normalizedMove.energyGain <= 0)
  ) {
    return normalizedMoveId;
  }

  throw new Error(
    `[sync-simulations] ${slot} move '${moveName}' does not resolve for '${pokemon.speciesId}'`,
  );
}

/**
 * Derive a selected Pokemon move override from ranking CSV data.
 */
function getRecommendedMoveIds(
  ranking: RankingsCsvEntry,
  pokemon: SimulationPokemonData,
  moveById: ReadonlyMap<string, SimulationMoveData>,
): RecommendedMoveIds | undefined {
  if (!ranking['Fast Move'] || !ranking['Charged Move 1']) {
    return undefined;
  }

  return {
    fastMove: resolveMoveId(ranking['Fast Move'], 'fast', pokemon, moveById),
    chargedMove1: resolveMoveId(
      ranking['Charged Move 1'],
      'charged',
      pokemon,
      moveById,
    ),
    chargedMove2: ranking['Charged Move 2']
      ? resolveMoveId(ranking['Charged Move 2'], 'charged', pokemon, moveById)
      : null,
  };
}

/**
 * Parse simulation CSV text into simulation rows.
 */
function parseSimulationsCsv(
  csvText: string,
  pokemon: string,
  shieldScenario: string,
): SimulationData[] {
  const lines = csvText.trim().split('\n');
  if (lines.length < 2) {
    return [];
  }

  const headers = lines[0].split(',');
  const entries: SimulationData[] = [];

  for (let i = 1; i < lines.length; i++) {
    const values = lines[i].split(',');
    const entry: Record<string, unknown> = {};

    headers.forEach((header, index) => {
      const key = header.trim();
      const value = values[index]?.trim();
      const numeric = value ? Number(value) : Number.NaN;
      entry[key] = Number.isNaN(numeric) ? value : numeric;
    });

    entries.push({
      Pokemon: pokemon,
      Opponent: (entry.Pokemon as string) || (entry.Opponent as string),
      'Battle Rating': Number(entry['Battle Rating']) || 0,
      'Shield Scenario': shieldScenario,
    });
  }

  return entries;
}

/**
 * Build output CSV path for one Pokemon + shield scenario.
 */
function getSimulationOutputPath(
  format: BattleFormat,
  speciesId: string,
  scenario: string,
  movesetVariantId?: string,
): string {
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  if (!CANONICAL_SPECIES_ID_PATTERN.test(canonicalSpeciesId)) {
    throw new Error(
      `[sync-simulations] Species '${speciesId}' is not safe for simulation storage`,
    );
  }
  if (
    movesetVariantId !== undefined &&
    !CANONICAL_VARIANT_ID_PATTERN.test(movesetVariantId)
  ) {
    throw new Error(
      `[sync-simulations] Variant '${movesetVariantId}' is not safe for simulation storage`,
    );
  }
  const filenamePrefix = movesetVariantId
    ? `${canonicalSpeciesId}--${movesetVariantId}`
    : canonicalSpeciesId;
  const formatDirectory = path.join(
    syncConfig.outputDir,
    'simulations',
    `cp${format.cp}`,
    format.cup,
  );
  const outputPath = path.join(
    formatDirectory,
    `${filenamePrefix}_${scenario}.csv`,
  );
  if (
    !path
      .resolve(outputPath)
      .startsWith(`${path.resolve(formatDirectory)}${path.sep}`)
  ) {
    throw new Error(
      `[sync-simulations] Output path escapes the ${format.id} simulation directory`,
    );
  }
  return outputPath;
}

/**
 * Build output path for one format's overall rankings CSV.
 */
function getOverallRankingsPath(format: BattleFormat): string {
  return path.join(
    syncConfig.outputDir,
    'rankings',
    `cp${format.cp}`,
    format.cup,
    'overall_rankings.csv',
  );
}

/**
 * Normalize species names for matching between ranking and gamemaster outputs.
 */
function normalizeSpeciesName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function getSimulationOpponentKeys(csvText: string): readonly string[] {
  return csvText
    .trim()
    .split('\n')
    .slice(1)
    .map((line) =>
      normalizeSpeciesName(
        extractSpeciesNameFromSimulationCell(line.split(',')[0]?.trim() ?? ''),
      ),
    )
    .sort((left, right) => left.localeCompare(right));
}

function hasMatchingOpponentSet(
  csvText: string,
  expectedOpponentKeys: readonly string[],
): boolean {
  const opponentKeys = getSimulationOpponentKeys(csvText);
  return (
    opponentKeys.length === expectedOpponentKeys.length &&
    opponentKeys.every(
      (opponentKey, index) => opponentKey === expectedOpponentKeys[index],
    )
  );
}

function getOrderedOpponentIds(
  rankings: readonly RankingsCsvEntry[],
  speciesByNormalizedName: ReadonlyMap<string, string>,
  limit: number,
): readonly string[] {
  const opponentIds: string[] = [];
  const seen = new Set<string>();
  for (const ranking of rankings) {
    const speciesId = speciesByNormalizedName.get(
      normalizeSpeciesName(ranking.Pokemon),
    );
    if (!speciesId || seen.has(speciesId)) {
      continue;
    }
    seen.add(speciesId);
    opponentIds.push(speciesId);
    if (opponentIds.length === limit) {
      break;
    }
  }
  return opponentIds;
}

function parseSimulationEvidence(
  csvText: string,
  speciesByNormalizedName: ReadonlyMap<string, string>,
): readonly MovesetVariantSimulationMatchup[] {
  const lines = csvText.trim().split('\n');
  const headers = lines[0]?.split(',').map((header) => header.trim()) ?? [];
  const opponentIndex = headers.findIndex(
    (header) => header === 'Pokemon' || header === 'Opponent',
  );
  const ratingIndex = headers.indexOf('Battle Rating');
  if (opponentIndex < 0 || ratingIndex < 0) {
    return [];
  }

  return lines.slice(1).flatMap((line): MovesetVariantSimulationMatchup[] => {
    const values = line.split(',');
    const opponentId = speciesByNormalizedName.get(
      normalizeSpeciesName(
        extractSpeciesNameFromSimulationCell(
          values[opponentIndex]?.trim() ?? '',
        ),
      ),
    );
    if (!opponentId) {
      return [];
    }
    return [
      {
        opponentId,
        rating: Number(values[ratingIndex]?.trim()),
      },
    ];
  });
}

/**
 * Create a no-op chainable jQuery-like object for PvPoke scripts that expect DOM calls.
 */
function createJqueryChainStub(): Record<string, unknown> {
  const chain: Record<string, unknown> = {
    eq: (): Record<string, unknown> => chain,
    first: (): Record<string, unknown> => chain,
    insertAfter: (): Record<string, unknown> => chain,
    on: (): Record<string, unknown> => chain,
    append: (): Record<string, unknown> => chain,
    remove: (): Record<string, unknown> => chain,
    html: (): Record<string, unknown> => chain,
    text: (): Record<string, unknown> => chain,
    val: (): string => '',
    attr: (name: unknown, value?: unknown): unknown => {
      if (typeof name === 'string' && value === undefined) {
        return '';
      }

      return chain;
    },
  };

  return chain;
}

/**
 * Resolve local filesystem path for a PvPoke data URL.
 */
function resolvePvpokeDataFilePath(sourcePath: string, url: string): string {
  const urlWithoutQuery = url.split('?')[0].trim();
  const withoutProtocol = urlWithoutQuery.replace(/^https?:\/\/[^/]+\/?/, '');
  const normalizedUrl = withoutProtocol.startsWith('/')
    ? withoutProtocol.slice(1)
    : withoutProtocol;

  if (!normalizedUrl.startsWith('data/')) {
    throw new Error(
      `[sync-simulations] Unsupported PvPoke URL outside data/: ${url}`,
    );
  }

  return path.join(sourcePath, 'src', normalizedUrl);
}

/**
 * Build a tiny jQuery-compatible interface for PvPoke script execution.
 */
function createJqueryRuntime(sourcePath: string): {
  $: ((selector?: unknown) => Record<string, unknown>) & {
    ajax: (options: AjaxOptions) => void;
    getJSON: (url: string, success: (data: unknown) => void) => void;
    each: (
      collection: unknown,
      callback: (indexOrKey: number | string, value: unknown) => unknown,
    ) => void;
  };
  flushAjaxCallbacks: () => void;
} {
  const chainStub = createJqueryChainStub();
  const pendingAjaxCallbacks: Array<() => void> = [];

  const readJsonFromUrl = (url: string): unknown => {
    const filePath = resolvePvpokeDataFilePath(sourcePath, url);
    const content = fs.readFileSync(filePath, 'utf8');
    return JSON.parse(content) as unknown;
  };

  const jquery = ((selector: unknown = undefined): Record<string, unknown> => {
    void selector;
    return chainStub;
  }) as ((selector?: unknown) => Record<string, unknown>) & {
    ajax: (options: AjaxOptions) => void;
    getJSON: (url: string, success: (data: unknown) => void) => void;
    each: (
      collection: unknown,
      callback: (indexOrKey: number | string, value: unknown) => unknown,
    ) => void;
  };

  jquery.ajax = (options: AjaxOptions): void => {
    try {
      const data = readJsonFromUrl(options.url);
      const handleSuccess = (): void => {
        options.success?.(data);
      };

      try {
        handleSuccess();
      } catch {
        pendingAjaxCallbacks.push(handleSuccess);
      }
    } catch (error) {
      pendingAjaxCallbacks.push(() => {
        options.error?.({ url: options.url }, error);
      });
    }
  };

  jquery.getJSON = (url: string, success: (data: unknown) => void): void => {
    const data = readJsonFromUrl(url);
    success(data);
  };

  jquery.each = (
    collection: unknown,
    callback: (indexOrKey: number | string, value: unknown) => unknown,
  ): void => {
    if (Array.isArray(collection)) {
      for (let i = 0; i < collection.length; i++) {
        const shouldContinue = callback(i, collection[i]);
        if (shouldContinue === false) {
          break;
        }
      }
      return;
    }

    if (typeof collection === 'object' && collection !== null) {
      const recordCollection = collection as Record<string, unknown>;
      for (const key of Object.keys(recordCollection)) {
        const shouldContinue = callback(key, recordCollection[key]);
        if (shouldContinue === false) {
          break;
        }
      }
    }
  };

  const flushAjaxCallbacks = (): void => {
    while (pendingAjaxCallbacks.length > 0) {
      const callback = pendingAjaxCallbacks.shift();
      callback?.();
    }
  };

  return { $: jquery, flushAjaxCallbacks };
}

/**
 * Load a vendor PvPoke script into a runtime context.
 */
function loadPvpokeScript(
  context: vm.Context,
  sourcePath: string,
  relativeScriptPath: string,
): void {
  const scriptPath = path.join(sourcePath, 'src/js', relativeScriptPath);
  const scriptContent = fs.readFileSync(scriptPath, 'utf8');
  const script = new vm.Script(scriptContent, {
    filename: scriptPath,
  });
  script.runInContext(context);
}

/**
 * Create a VM runtime that executes PvPoke battle engine scripts locally.
 */
function createPvpokeVmRuntime(sourcePath: string): PvpokeVmRuntime {
  const jqueryRuntime = createJqueryRuntime(sourcePath);
  const localStorage = new Map<string, string>();
  const vmConsole = {
    ...console,
    log: (...args: unknown[]): void => {
      console.log(...args);
    },
  };

  const context = vm.createContext({
    console: vmConsole,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    host: 'localhost',
    webRoot: '',
    siteVersion: 'local',
    settings: {
      gamemaster: 'gamemaster',
      matrixDirection: 'row',
    },
    window: {
      localStorage: {
        getItem: (key: string): string | null => {
          return localStorage.get(key) ?? null;
        },
        setItem: (key: string, value: string): void => {
          localStorage.set(key, value);
        },
      },
      location: {
        href: 'http://localhost/',
      },
    },
    document: {},
    updateFormatSelect: undefined,
    updateCupSelect: undefined,
    InterfaceMaster: undefined,
    customRankingInterface: undefined,
    RSS: {
      getInstance: (): Record<string, unknown> => {
        return {};
      },
    },
    ...jqueryRuntime,
  }) as vm.Context & Record<string, unknown>;

  context.getDefaultMultiBattleSettings = (): Record<string, unknown> => {
    return {
      shields: 1,
      ivs: 'original',
      bait: 1,
      levelCap: 50,
      startHp: 1,
      startEnergy: 0,
      startCooldown: 0,
      optimizeMoveTiming: true,
      startStatBuffs: [0, 0],
    };
  };

  context.__flushPvpokeAjax = (): void => {
    jqueryRuntime.flushAjaxCallbacks();
  };

  const scriptOrder = [
    'battle/DamageCalculator.js',
    'battle/actions/ActionLogic.js',
    'battle/timeline/TimelineAction.js',
    'battle/timeline/TimelineEvent.js',
    'GameMaster.js',
    'pokemon/Pokemon.js',
    'battle/Battle.js',
    'battle/rankers/TeamRanker.js',
  ];

  scriptOrder.forEach((relativeScriptPath) => {
    loadPvpokeScript(context, sourcePath, relativeScriptPath);
  });

  return { context };
}

/**
 * Get or create a cached PvPoke VM runtime by source path.
 */
function getPvpokeVmRuntime(sourcePath: string): PvpokeVmRuntime {
  const cacheKey = path.resolve(sourcePath);
  const existing = runtimeBySourcePath.get(cacheKey);
  if (existing) {
    return existing;
  }

  const runtime = createPvpokeVmRuntime(cacheKey);
  runtimeBySourcePath.set(cacheKey, runtime);
  return runtime;
}

/**
 * Generate one simulation CSV via PvPoke TeamRanker engine logic.
 */
export function generateScenarioCsvFromEngine(
  runtime: PvpokeVmRuntime,
  format: BattleFormat,
  speciesId: string,
  shields: number,
  recommendedMoves?: RecommendedMoveIds,
  recommendedMovesBySpeciesId: RecommendedMovesBySpeciesId = {},
): string {
  const rankingKey = `${format.cup}overall${format.cp}`;
  runtime.context.__speciesId = speciesId;
  runtime.context.__shields = shields;
  runtime.context.__leagueCp = format.cp;
  runtime.context.__cup = format.cup;
  runtime.context.__rankingKey = rankingKey;
  runtime.context.__selectedFastMove = recommendedMoves?.fastMove ?? null;
  runtime.context.__selectedChargedMove1 =
    recommendedMoves?.chargedMove1 ?? null;
  runtime.context.__selectedChargedMove2 =
    recommendedMoves?.chargedMove2 ?? null;
  runtime.context.__recommendedMovesBySpeciesId = recommendedMovesBySpeciesId;
  runtime.context.__normalizeToChoosableSpeciesId =
    normalizeToChoosableSpeciesId;

  const script = new vm.Script(
    `(() => {
      const gm = GameMaster.getInstance();
      globalThis.__flushPvpokeAjax();

      // Ensure recommended movesets are available for both selected Pokemon
      // and opponents in TeamRanker.
      const rankingKey = globalThis.__rankingKey;
      if (!gm.rankings[rankingKey]) {
        gm.loadRankingData({}, 'overall', globalThis.__leagueCp, globalThis.__cup);
      }

      const sanitizedRankingsBySpeciesId = new Map();
      for (const ranking of gm.rankings[rankingKey] || []) {
        const canonicalSpeciesId =
          globalThis.__normalizeToChoosableSpeciesId(ranking.speciesId);
        const recommendedMoves =
          globalThis.__recommendedMovesBySpeciesId[canonicalSpeciesId];
        if (!recommendedMoves) {
          continue;
        }

        ranking.moveset = [
          recommendedMoves.fastMove,
          recommendedMoves.chargedMove1,
          recommendedMoves.chargedMove2,
        ];
        const existing = sanitizedRankingsBySpeciesId.get(canonicalSpeciesId);
        if (!existing || ranking.speciesId === canonicalSpeciesId) {
          sanitizedRankingsBySpeciesId.set(canonicalSpeciesId, ranking);
        }
      }
      gm.rankings[rankingKey] = Array.from(
        sanitizedRankingsBySpeciesId.values()
      );

      const cup = gm.getCupById(globalThis.__cup);
      const battle = new Battle();
      battle.setCP(globalThis.__leagueCp);

      if (cup.name != "custom") {
        battle.setCup(cup.name);
      } else {
        battle.setCustomCup(cup);
      }

      const ranker = RankerMaster.getInstance();

      const settingsA = getDefaultMultiBattleSettings();
      const settingsB = getDefaultMultiBattleSettings();
      settingsA.shields = globalThis.__shields;
      settingsB.shields = globalThis.__shields;

      ranker.applySettings(settingsA, 0);
      ranker.applySettings(settingsB, 1);
      ranker.setShieldMode('single');
      ranker.setRecommendMoveUsage(true);

      const eligiblePokemon = gm.generateFilteredPokemonList(
        battle,
        cup.include,
        cup.exclude
      );
      const sanitizedTargetsBySpeciesId = new Map();
      for (const ranking of gm.rankings[rankingKey]) {
        const canonicalSpeciesId =
          globalThis.__normalizeToChoosableSpeciesId(ranking.speciesId);
        const recommendedMoves =
          globalThis.__recommendedMovesBySpeciesId[canonicalSpeciesId];
        if (!recommendedMoves) {
          continue;
        }

        const pokemon = new Pokemon(canonicalSpeciesId, 0, battle);
        pokemon.initialize(globalThis.__leagueCp);
        pokemon.selectMove('fast', recommendedMoves.fastMove);
        pokemon.selectMove('charged', recommendedMoves.chargedMove1, 0);
        pokemon.selectMove('charged', recommendedMoves.chargedMove2, 1);
        pokemon.resetMoves();
        sanitizedTargetsBySpeciesId.set(canonicalSpeciesId, pokemon);
      }
      ranker.setTargets(Array.from(sanitizedTargetsBySpeciesId.values()));
      const selectedPokemon =
        eligiblePokemon.find((pokemon) => pokemon.speciesId === globalThis.__speciesId) ||
        new Pokemon(globalThis.__speciesId, 0, battle);
      selectedPokemon.initialize(globalThis.__leagueCp);
      selectedPokemon.selectRecommendedMoveset('overall');

      if (globalThis.__selectedFastMove) {
        selectedPokemon.selectMove('fast', globalThis.__selectedFastMove);
      }

      if (globalThis.__selectedChargedMove1) {
        selectedPokemon.selectMove('charged', globalThis.__selectedChargedMove1, 0);
      }

      if (globalThis.__selectedChargedMove2) {
        selectedPokemon.selectMove('charged', globalThis.__selectedChargedMove2, 1);
      }

      selectedPokemon.resetMoves();

      const result = ranker.rank(
        [selectedPokemon],
        globalThis.__leagueCp,
        cup,
        [],
        'battle'
      );
      return result.csv;
    })()`,
  );

  const result = script.runInContext(runtime.context);
  if (typeof result !== 'string' || result.trim().length === 0) {
    throw new Error(
      `[sync-simulations] PvPoke engine returned invalid CSV for ${speciesId} with ${shields}-${shields} shields`,
    );
  }

  return result;
}

interface SimulationSyncDependencies {
  getRuntime: (sourcePath: string) => PvpokeVmRuntime;
  fileExists: (filePath: string) => boolean;
  readFile: (filePath: string) => Promise<string>;
  mkdir: (directoryPath: string) => Promise<void>;
  removeDirectory: (directoryPath: string) => Promise<void>;
  writeFile: (filePath: string, content: string) => Promise<void>;
  generateScenarioCsv: (
    runtime: PvpokeVmRuntime,
    format: BattleFormat,
    speciesId: string,
    shields: number,
    recommendedMoves?: RecommendedMoveIds,
    recommendedMovesBySpeciesId?: RecommendedMovesBySpeciesId,
  ) => string;
}

async function writeFileAtomically(
  filePath: string,
  content: string,
): Promise<void> {
  const temporaryPath = `${filePath}.tmp-${process.pid}-${randomUUID()}`;
  try {
    await fsAsync.writeFile(temporaryPath, content, {
      encoding: 'utf8',
      flag: 'wx',
    });
    await fsAsync.rename(temporaryPath, filePath);
  } catch (error) {
    await fsAsync.unlink(temporaryPath).catch(() => undefined);
    throw error;
  }
}

const defaultDependencies: SimulationSyncDependencies = {
  getRuntime: (sourcePath: string) => getPvpokeVmRuntime(sourcePath),
  fileExists: (filePath: string) => fs.existsSync(filePath),
  readFile: async (filePath: string) => fsAsync.readFile(filePath, 'utf8'),
  mkdir: async (directoryPath: string) => {
    await fsAsync.mkdir(directoryPath, { recursive: true });
  },
  removeDirectory: async (directoryPath: string) => {
    await fsAsync.rm(directoryPath, { recursive: true, force: true });
  },
  writeFile: async (filePath: string, content: string) => {
    await writeFileAtomically(filePath, content);
  },
  generateScenarioCsv: (
    runtime: PvpokeVmRuntime,
    format: BattleFormat,
    speciesId: string,
    shields: number,
    recommendedMoves?: RecommendedMoveIds,
    recommendedMovesBySpeciesId?: RecommendedMovesBySpeciesId,
  ) =>
    generateScenarioCsvFromEngine(
      runtime,
      format,
      speciesId,
      shields,
      recommendedMoves,
      recommendedMovesBySpeciesId,
    ),
};

/**
 * Generate simulation data using local PvPoke engine logic (no browser automation).
 */
export async function generateSimulations(
  options: SimulationSyncOptions = {},
  dependencies: Partial<SimulationSyncDependencies> = {},
): Promise<SimulationSyncResult> {
  const resolvedDependencies: SimulationSyncDependencies = {
    ...defaultDependencies,
    ...dependencies,
  };

  try {
    console.log('[sync-simulations] Starting simulation generation');

    const resolvedSourcePath =
      options.sourcePath ?? resolvePvpokeSourcePath().sourcePath;
    const runtime = resolvedDependencies.getRuntime(resolvedSourcePath);

    const battleFormats = getBattleFormats();

    const missingOverallRankings = battleFormats.filter((format) => {
      return !resolvedDependencies.fileExists(getOverallRankingsPath(format));
    });

    if (missingOverallRankings.length > 0) {
      const missingFormats = missingOverallRankings
        .map((format) => `${format.label} (cp${format.cp} ${format.cup})`)
        .join(', ');
      throw new Error(
        `[sync-simulations] Overall rankings CSV not found for formats: ${missingFormats}. Run rankings sync first.`,
      );
    }

    const [pokemonJsonText, movesJsonText] = await Promise.all([
      resolvedDependencies.readFile(
        path.join(syncConfig.outputDir, 'pokemon.json'),
      ),
      resolvedDependencies.readFile(
        path.join(syncConfig.outputDir, 'moves.json'),
      ),
    ]);

    const pokemonData = JSON.parse(pokemonJsonText) as SimulationPokemonData[];
    const movesData = JSON.parse(movesJsonText) as SimulationMoveData[];

    const speciesByNormalizedName = new Map<string, string>();
    const speciesNameById = new Map<string, string>();
    const pokemonBySpeciesId = new Map<string, SimulationPokemonData>();
    const moveById = new Map(
      movesData.map((move): [string, SimulationMoveData] => [
        move.moveId,
        move,
      ]),
    );
    const getMoveAvailability = createMoveAvailabilityResolver(pokemonData);
    const candidateSetsByFormatAndSpecies = new Map<
      string,
      DerivedMovesetCandidateSet
    >();
    for (const candidateSet of options.candidateSets ?? []) {
      if (
        normalizeToChoosableSpeciesId(candidateSet.speciesId) !==
          candidateSet.speciesId ||
        !CANONICAL_SPECIES_ID_PATTERN.test(candidateSet.speciesId)
      ) {
        throw new Error(
          `[sync-simulations] Candidate set species '${candidateSet.speciesId}' is not canonical`,
        );
      }
      const key = getCandidateSetKey(
        candidateSet.formatId,
        candidateSet.speciesId,
      );
      if (candidateSetsByFormatAndSpecies.has(key)) {
        throw new Error(
          `[sync-simulations] Duplicate candidate set for ${candidateSet.formatId}/${candidateSet.speciesId}`,
        );
      }
      candidateSetsByFormatAndSpecies.set(key, candidateSet);
    }

    pokemonData.forEach((pokemon) => {
      const canonicalSpeciesId = normalizeToChoosableSpeciesId(
        pokemon.speciesId,
      );
      speciesByNormalizedName.set(
        normalizeSpeciesName(pokemon.speciesName),
        canonicalSpeciesId,
      );

      if (
        !pokemonBySpeciesId.has(canonicalSpeciesId) ||
        pokemon.speciesId === canonicalSpeciesId
      ) {
        pokemonBySpeciesId.set(canonicalSpeciesId, pokemon);
      }

      if (!speciesNameById.has(canonicalSpeciesId) && pokemon.released) {
        speciesNameById.set(canonicalSpeciesId, pokemon.speciesName);
      }
    });

    const allSimulations: SimulationsCsv = [];
    const variantSelections: SimulationVariantSelection[] = [];
    const pendingWrites: Array<{
      readonly formatId: BattleFormatId;
      readonly outputPath: string;
      readonly csvText: string;
    }> = [];

    for (const format of battleFormats) {
      const overallCsvPath = getOverallRankingsPath(format);
      const overallCsvText =
        await resolvedDependencies.readFile(overallCsvPath);
      const allRankings = parseRankingsCsv(overallCsvText);
      const recommendedMovesBySpeciesId: Record<string, RecommendedMoveIds> =
        {};
      const rankingBySpeciesId = new Map<string, RankingsCsvEntry>();
      for (const ranking of allRankings) {
        const speciesId = speciesByNormalizedName.get(
          normalizeSpeciesName(ranking.Pokemon),
        );
        const pokemon = speciesId
          ? pokemonBySpeciesId.get(normalizeToChoosableSpeciesId(speciesId))
          : undefined;
        const recommendedMoves = pokemon
          ? getRecommendedMoveIds(ranking, pokemon, moveById)
          : undefined;
        if (speciesId) {
          const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
          rankingBySpeciesId.set(canonicalSpeciesId, ranking);
          if (recommendedMoves?.chargedMove2) {
            recommendedMovesBySpeciesId[canonicalSpeciesId] = recommendedMoves;
          }
        }
      }
      const simulationSpeciesIds =
        options.simulationSpeciesIdsByFormatId?.get(format.id) ??
        allRankings.slice(0, 150).flatMap((ranking): string[] => {
          const speciesId = speciesByNormalizedName.get(
            normalizeSpeciesName(ranking.Pokemon),
          );
          return speciesId ? [normalizeToChoosableSpeciesId(speciesId)] : [];
        });
      const topMetaOpponentIds = getOrderedOpponentIds(
        allRankings,
        speciesByNormalizedName,
        TOP_META_OPPONENT_LIMIT,
      );
      const fullMetaOpponentIds = getOrderedOpponentIds(
        allRankings,
        speciesByNormalizedName,
        FULL_META_OPPONENT_LIMIT,
      );

      console.log(
        `[sync-simulations] Generating ${format.label} simulations from ${overallCsvPath}`,
      );

      for (let i = 0; i < simulationSpeciesIds.length; i++) {
        const speciesId = simulationSpeciesIds[i];
        const ranking = rankingBySpeciesId.get(speciesId);
        if (!ranking) {
          throw new Error(
            `[sync-simulations] Missing emitted Overall ranking for '${format.id}/${speciesId}'`,
          );
        }

        const displayName = speciesNameById.get(speciesId) ?? ranking.Pokemon;
        console.log(
          `[sync-simulations] Processing ${displayName} for ${format.label} (${i + 1}/${simulationSpeciesIds.length})`,
        );

        const pokemon = pokemonBySpeciesId.get(speciesId);
        if (!pokemon) {
          throw new Error(
            `[sync-simulations] Missing canonical Pokemon data for '${speciesId}'`,
          );
        }
        const recommendedMoves = getRecommendedMoveIds(
          ranking,
          pokemon,
          moveById,
        );
        const candidates = getValidatedCandidates(
          format,
          speciesId,
          candidateSetsByFormatAndSpecies.get(
            getCandidateSetKey(format.id, speciesId),
          ),
          pokemon,
          moveById,
          getMoveAvailability,
          recommendedMoves,
        );
        const defaultOpponentKeysByScenario = new Map<
          string,
          readonly string[]
        >();
        const simulationEvidenceByVariantId = new Map<
          MovesetVariantId,
          Partial<
            Record<
              ShieldScenarioKey,
              readonly MovesetVariantSimulationMatchup[]
            >
          >
        >();
        const defaultCandidate = candidates.find(({ isDefault }) => isDefault);

        for (const scenario of SIMULATION_SCENARIOS) {
          const outputPath = getSimulationOutputPath(
            format,
            speciesId,
            scenario.scenario,
          );

          if (
            options.resume &&
            !options.forceRegenerateFormatIds?.has(format.id) &&
            resolvedDependencies.fileExists(outputPath)
          ) {
            const existingCsv = await resolvedDependencies.readFile(outputPath);
            const existingValidation = validateSimulationsCsv(existingCsv);
            if (existingValidation.valid) {
              defaultOpponentKeysByScenario.set(
                scenario.scenario,
                getSimulationOpponentKeys(existingCsv),
              );
              logValidationErrors(
                `${displayName} ${scenario.scenario} ${format.label} simulations CSV`,
                existingValidation.errors,
              );
              allSimulations.push(
                ...parseSimulationsCsv(
                  existingCsv,
                  displayName,
                  scenario.scenario,
                ),
              );
              if (defaultCandidate) {
                const evidence =
                  simulationEvidenceByVariantId.get(defaultCandidate.id) ?? {};
                evidence[scenario.scenario] = parseSimulationEvidence(
                  existingCsv,
                  speciesByNormalizedName,
                );
                simulationEvidenceByVariantId.set(
                  defaultCandidate.id,
                  evidence,
                );
              }
              console.log(
                `[sync-simulations] Reused ${displayName} ${scenario.scenario} ${format.label} from existing CSV`,
              );
              continue;
            }
          }

          const csvText = resolvedDependencies.generateScenarioCsv(
            runtime,
            format,
            speciesId,
            scenario.shields,
            recommendedMoves,
            recommendedMovesBySpeciesId,
          );
          const validation = validateSimulationsCsv(csvText);
          logValidationErrors(
            `${displayName} ${scenario.scenario} ${format.label} simulations CSV`,
            validation.errors,
          );

          if (!validation.valid) {
            throw new Error(
              `[sync-simulations] ${displayName} ${scenario.scenario} ${format.label} validation failed: ${validation.errors.join(', ')}`,
            );
          }
          defaultOpponentKeysByScenario.set(
            scenario.scenario,
            getSimulationOpponentKeys(csvText),
          );

          pendingWrites.push({ formatId: format.id, outputPath, csvText });

          allSimulations.push(
            ...parseSimulationsCsv(csvText, displayName, scenario.scenario),
          );
          if (defaultCandidate) {
            const evidence =
              simulationEvidenceByVariantId.get(defaultCandidate.id) ?? {};
            evidence[scenario.scenario] = parseSimulationEvidence(
              csvText,
              speciesByNormalizedName,
            );
            simulationEvidenceByVariantId.set(defaultCandidate.id, evidence);
          }
        }

        const alternateVariants = candidates.filter(
          (variant) => !variant.isDefault,
        );

        for (const variant of alternateVariants) {
          for (const scenario of SIMULATION_SCENARIOS) {
            const outputPath = getSimulationOutputPath(
              format,
              speciesId,
              scenario.scenario,
              variant.id,
            );

            if (
              options.resume &&
              !options.forceRegenerateFormatIds?.has(format.id) &&
              resolvedDependencies.fileExists(outputPath)
            ) {
              const existingCsv =
                await resolvedDependencies.readFile(outputPath);
              const existingValidation = validateSimulationsCsv(existingCsv);
              const defaultOpponentKeys =
                defaultOpponentKeysByScenario.get(scenario.scenario) ?? [];
              if (
                existingValidation.valid &&
                hasMatchingOpponentSet(existingCsv, defaultOpponentKeys)
              ) {
                allSimulations.push(
                  ...parseSimulationsCsv(
                    existingCsv,
                    displayName,
                    scenario.scenario,
                  ),
                );
                const evidence =
                  simulationEvidenceByVariantId.get(variant.id) ?? {};
                evidence[scenario.scenario] = parseSimulationEvidence(
                  existingCsv,
                  speciesByNormalizedName,
                );
                simulationEvidenceByVariantId.set(variant.id, evidence);
                continue;
              }
            }

            const csvText = resolvedDependencies.generateScenarioCsv(
              runtime,
              format,
              speciesId,
              scenario.shields,
              {
                fastMove: variant.fastMove,
                chargedMove1: variant.chargedMove1,
                chargedMove2: variant.chargedMove2,
              },
              recommendedMovesBySpeciesId,
            );
            const validation = validateSimulationsCsv(csvText);
            logValidationErrors(
              `${displayName} ${variant.id} ${scenario.scenario} ${format.label} simulations CSV`,
              validation.errors,
            );

            if (!validation.valid) {
              throw new Error(
                `[sync-simulations] ${displayName} ${variant.id} ${scenario.scenario} ${format.label} validation failed: ${validation.errors.join(', ')}`,
              );
            }
            const defaultOpponentKeys =
              defaultOpponentKeysByScenario.get(scenario.scenario) ?? [];
            if (!hasMatchingOpponentSet(csvText, defaultOpponentKeys)) {
              throw new Error(
                `[sync-simulations] ${displayName} ${variant.id} ${scenario.scenario} ${format.label} opponent set does not match the default matrix`,
              );
            }

            pendingWrites.push({ formatId: format.id, outputPath, csvText });
            allSimulations.push(
              ...parseSimulationsCsv(csvText, displayName, scenario.scenario),
            );
            const evidence =
              simulationEvidenceByVariantId.get(variant.id) ?? {};
            evidence[scenario.scenario] = parseSimulationEvidence(
              csvText,
              speciesByNormalizedName,
            );
            simulationEvidenceByVariantId.set(variant.id, evidence);
          }
        }

        if (defaultCandidate) {
          const selection = selectActiveMovesetVariants({
            candidates: candidates.map(
              (candidate): MovesetVariantSimulationEvidence => {
                const evidence = simulationEvidenceByVariantId.get(
                  candidate.id,
                );
                return {
                  id: candidate.id,
                  isDefault: candidate.isDefault,
                  scenarios: {
                    '0-0': evidence?.['0-0'] ?? null,
                    '1-1': evidence?.['1-1'] ?? null,
                    '2-2': evidence?.['2-2'] ?? null,
                  },
                };
              },
            ),
            topMetaOpponentIds,
            fullMetaOpponentIds,
          });
          variantSelections.push({
            formatId: format.id,
            speciesId,
            ...selection,
          });
        }
      }
    }

    if (!options.deferPublication) {
      for (const { outputPath, csvText } of pendingWrites) {
        await resolvedDependencies.mkdir(path.dirname(outputPath));
        await resolvedDependencies.writeFile(outputPath, csvText);
      }
    }

    console.log(
      `[sync-simulations] Successfully generated and validated ${allSimulations.length} total simulation entries`,
    );
    return {
      simulations: allSimulations,
      variantSelections,
      preparedCsvFiles: pendingWrites.map(
        ({ formatId, outputPath, csvText }): PreparedSimulationCsv => ({
          formatId,
          targetPath: outputPath,
          contents: csvText,
        }),
      ),
    };
  } catch (error) {
    logError(error as Error, 'sync-simulations');
    throw error;
  }
}
