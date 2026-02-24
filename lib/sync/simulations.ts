import * as fs from 'fs';
import { promises as fsAsync } from 'fs';
import * as path from 'path';
import vm from 'vm';
import { syncConfig } from './config';
import { resolvePvpokeSourcePath } from './source';
import { SyncRunOptions, SimulationData, SimulationsCsv } from './types';
import { logError } from './utils';
import { logValidationErrors, validateSimulationsCsv } from './validation';

interface RankingsCsvEntry {
  Pokemon: string;
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

const SIMULATION_SCENARIOS = [
  { scenario: '1-1', shields: 1 },
  { scenario: '0-0', shields: 0 },
  { scenario: '2-2', shields: 2 },
] as const;

const NON_CHOOSABLE_FORM_ALIASES: Record<string, string> = {
  morpeko_hangry: 'morpeko_full_belly',
  aegislash_blade: 'aegislash_shield',
  lanturnw: 'lanturn',
  cradily_b: 'cradily',
  golisopodsh: 'golisopod',
};

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
    });
  }

  return entries;
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
 * Resolve a speciesId to choosable form speciesId.
 */
function normalizeToChoosableSpeciesId(speciesId: string): string {
  return NON_CHOOSABLE_FORM_ALIASES[speciesId] ?? speciesId;
}

/**
 * Build output CSV path for one Pokemon + shield scenario.
 */
function getSimulationOutputPath(speciesId: string, scenario: string): string {
  const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
  return path.join(
    syncConfig.outputDir,
    'simulations',
    `cp1500_${canonicalSpeciesId}_${scenario}.csv`,
  );
}

/**
 * Normalize species names for matching between ranking and gamemaster outputs.
 */
function normalizeSpeciesName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, '');
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
    setTimeout(() => {
      success(data);
    }, 0);
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
      const firstArg = args[0];
      if (
        typeof firstArg === 'string' &&
        firstArg.includes('Ranking data not loaded yet')
      ) {
        return;
      }

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
function generateScenarioCsvFromEngine(
  runtime: PvpokeVmRuntime,
  speciesId: string,
  shields: number,
): string {
  runtime.context.__speciesId = speciesId;
  runtime.context.__shields = shields;

  const script = new vm.Script(
    `(() => {
      const gm = GameMaster.getInstance();
      globalThis.__flushPvpokeAjax();
      const cup = gm.getCupById('all');
      const battle = new Battle();
      const ranker = RankerMaster.getInstance();

      const settingsA = getDefaultMultiBattleSettings();
      const settingsB = getDefaultMultiBattleSettings();
      settingsA.shields = globalThis.__shields;
      settingsB.shields = globalThis.__shields;

      ranker.applySettings(settingsA, 0);
      ranker.applySettings(settingsB, 1);
      ranker.setShieldMode('single');
      ranker.setTargets([]);

      const selectedPokemon = new Pokemon(globalThis.__speciesId, 0, battle);
      selectedPokemon.initialize(1500);

      const result = ranker.rank([selectedPokemon], 1500, cup, [], 'battle');
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

/**
 * Generate simulation data using local PvPoke engine logic (no browser automation).
 */
export async function generateSimulations(
  options: SyncRunOptions = {},
): Promise<SimulationsCsv> {
  try {
    console.log('[sync-simulations] Starting simulation generation');

    const resolvedSourcePath =
      options.sourcePath ?? resolvePvpokeSourcePath().sourcePath;
    const runtime = getPvpokeVmRuntime(resolvedSourcePath);

    const overallCsvPath = path.join(
      syncConfig.outputDir,
      'cp1500_all_overall_rankings.csv',
    );

    if (!fs.existsSync(overallCsvPath)) {
      throw new Error(
        '[sync-simulations] Overall rankings CSV not found. Run rankings sync first.',
      );
    }

    const [overallCsvText, pokemonJsonText] = await Promise.all([
      fsAsync.readFile(overallCsvPath, 'utf8'),
      fsAsync.readFile(path.join(syncConfig.outputDir, 'pokemon.json'), 'utf8'),
    ]);

    const allRankings = parseRankingsCsv(overallCsvText);
    const topPokemonNames = allRankings
      .slice(0, 150)
      .map((ranking) => ranking.Pokemon)
      .filter((name): name is string => typeof name === 'string' && !!name);

    const pokemonData = JSON.parse(pokemonJsonText) as Array<{
      speciesId: string;
      speciesName: string;
      released: boolean;
    }>;

    const speciesByNormalizedName = new Map<string, string>();
    const speciesNameById = new Map<string, string>();

    pokemonData.forEach((pokemon) => {
      const canonicalSpeciesId = normalizeToChoosableSpeciesId(
        pokemon.speciesId,
      );
      speciesByNormalizedName.set(
        normalizeSpeciesName(pokemon.speciesName),
        canonicalSpeciesId,
      );

      if (!speciesNameById.has(canonicalSpeciesId) && pokemon.released) {
        speciesNameById.set(canonicalSpeciesId, pokemon.speciesName);
      }
    });

    const allSimulations: SimulationsCsv = [];

    for (let i = 0; i < topPokemonNames.length; i++) {
      const pokemonName = topPokemonNames[i];
      const normalizedName = normalizeSpeciesName(pokemonName);
      const resolvedSpeciesId = speciesByNormalizedName.get(normalizedName);
      const speciesId = resolvedSpeciesId
        ? normalizeToChoosableSpeciesId(resolvedSpeciesId)
        : undefined;

      if (!speciesId) {
        console.warn(
          `[sync-simulations] Skipping ${pokemonName}: no matching speciesId in pokemon.json`,
        );
        continue;
      }

      const displayName = speciesNameById.get(speciesId) ?? pokemonName;
      console.log(
        `[sync-simulations] Processing ${displayName} (${i + 1}/${topPokemonNames.length})`,
      );

      for (const scenario of SIMULATION_SCENARIOS) {
        const outputPath = getSimulationOutputPath(
          speciesId,
          scenario.scenario,
        );

        if (options.resume && fs.existsSync(outputPath)) {
          const existingCsv = await fsAsync.readFile(outputPath, 'utf8');
          const existingValidation = validateSimulationsCsv(existingCsv);
          if (existingValidation.valid) {
            logValidationErrors(
              `${displayName} ${scenario.scenario} simulations CSV`,
              existingValidation.errors,
            );
            allSimulations.push(
              ...parseSimulationsCsv(
                existingCsv,
                displayName,
                scenario.scenario,
              ),
            );
            console.log(
              `[sync-simulations] Reused ${displayName} ${scenario.scenario} from existing CSV`,
            );
            continue;
          }
        }

        const csvText = generateScenarioCsvFromEngine(
          runtime,
          speciesId,
          scenario.shields,
        );
        const validation = validateSimulationsCsv(csvText);
        logValidationErrors(
          `${displayName} ${scenario.scenario} simulations CSV`,
          validation.errors,
        );

        if (!validation.valid) {
          throw new Error(
            `[sync-simulations] ${displayName} ${scenario.scenario} validation failed: ${validation.errors.join(', ')}`,
          );
        }

        await fsAsync.mkdir(path.dirname(outputPath), { recursive: true });
        await fsAsync.writeFile(outputPath, csvText, 'utf8');

        allSimulations.push(
          ...parseSimulationsCsv(csvText, displayName, scenario.scenario),
        );
      }
    }

    console.log(
      `[sync-simulations] Successfully generated and validated ${allSimulations.length} total simulation entries`,
    );
    return allSimulations;
  } catch (error) {
    logError(error as Error, 'sync-simulations');
    throw error;
  }
}
