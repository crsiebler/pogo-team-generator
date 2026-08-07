import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { normalizeToChoosableSpeciesId } from './aliases';
import { getBattleFormatById, type BattleFormatId } from './battleFormats';
import {
  MOVESET_VARIANT_SCENARIOS,
  MovesetVariantManifestValidationError,
  getMovesetVariantManifestPath,
  parseMovesetVariantManifestJson,
  type MovesetVariantManifest,
  type MovesetVariantManifestCandidate,
  type MovesetVariantManifestSpecies,
} from './movesetVariantManifest';
import type {
  MovesetVariant,
  MovesetVariantId,
  ShieldScenarioKey,
} from '@/lib/types';

/** Stable categories for actionable runtime variant-data failures. */
export type MovesetVariantSimulationDataErrorCode =
  | 'manifest-missing'
  | 'manifest-malformed'
  | 'manifest-incompatible'
  | 'manifest-incomplete'
  | 'variant-unavailable';

/** Typed failure raised when authoritative runtime variant data cannot be used. */
export class MovesetVariantSimulationDataError extends Error {
  constructor(
    public readonly code: MovesetVariantSimulationDataErrorCode,
    public readonly formatId: BattleFormatId,
    public readonly resourcePath: string,
    public readonly speciesId?: string,
    public readonly variantId?: MovesetVariantId,
    cause?: unknown,
  ) {
    const target = [speciesId, variantId].filter(Boolean).join(' / ');
    super(
      `Moveset variant data ${code.replaceAll('-', ' ')} for ${formatId}${target ? ` (${target})` : ''} at ${resourcePath}. Run simulation sync to regenerate the format manifest and declared CSV files.`,
      cause === undefined ? undefined : { cause },
    );
    this.name = 'MovesetVariantSimulationDataError';
  }
}

/** Filesystem and species-resolution boundaries used by the runtime loader. */
export interface MovesetVariantSimulationLoaderDependencies {
  readonly rootPath: string;
  readonly readText: (filePath: string) => string;
  readonly resolveOpponentSpeciesId: (value: string) => string | undefined;
}

/** Manifest-authoritative runtime moveset and simulation lookups. */
export interface MovesetVariantSimulationLoader {
  getDefaultMatchupMatrix(formatId: BattleFormatId): RuntimeMatchupMatrix;
  getManifestPolicyIdentity(formatId: BattleFormatId): Readonly<{
    schemaVersion: number;
    policyVersion: string;
  }>;
  getActiveVariants(
    speciesId: string,
    formatId: BattleFormatId,
  ): readonly MovesetVariant[];
  getMatchupResult(
    speciesId: string,
    variantId: MovesetVariantId,
    opponentSpeciesId: string,
    formatId: BattleFormatId,
  ): number | null;
  getShieldScenarioMatchupResult(
    speciesId: string,
    variantId: MovesetVariantId,
    opponentSpeciesId: string,
    shields: 0 | 1 | 2,
    formatId: BattleFormatId,
  ): number | null;
}

/** Parsed simulation result for one opponent and shield scenario. */
export interface RuntimeMatchupResult {
  readonly battleRating: number;
  readonly energyRemaining: number;
  readonly hpRemaining: number;
}

/** Complete default matchup data for one opponent. */
export interface RuntimeMatchupData {
  readonly shields0: RuntimeMatchupResult;
  readonly shields1: RuntimeMatchupResult;
  readonly shields2: RuntimeMatchupResult;
}

/** Manifest-backed default matchup matrix keyed by species and opponent ids. */
export type RuntimeMatchupMatrix = ReadonlyMap<
  string,
  ReadonlyMap<string, RuntimeMatchupData>
>;

type ScenarioMatchups = Readonly<
  Record<ShieldScenarioKey, ReadonlyMap<string, RuntimeMatchupResult>>
>;

interface SimulationCsvRecord {
  readonly Pokemon?: unknown;
  readonly 'Battle Rating'?: unknown;
  readonly 'Energy Remaining'?: unknown;
  readonly 'HP Remaining'?: unknown;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function haveSameKeys(
  left: ReadonlyMap<string, unknown>,
  right: ReadonlyMap<string, unknown>,
): boolean {
  return (
    left.size === right.size &&
    Array.from(left.keys()).every((key) => right.has(key))
  );
}

function readFiniteCsvNumber(value: unknown): number | undefined {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    String(value).trim() === ''
  ) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function toMovesetVariant(
  candidate: MovesetVariantManifestCandidate,
): MovesetVariant {
  return {
    id: candidate.id,
    fastMove: candidate.fastMove,
    chargedMove1: candidate.chargedMove1,
    chargedMove2: candidate.chargedMove2,
    isDefault: candidate.isDefault,
  };
}

/** Create an isolated manifest-backed moveset variant simulation loader. */
export function createMovesetVariantSimulationLoader(
  dependencies: MovesetVariantSimulationLoaderDependencies,
): MovesetVariantSimulationLoader {
  const manifestCache = new Map<BattleFormatId, MovesetVariantManifest>();
  const matchupCache = new Map<string, ScenarioMatchups>();
  const defaultMatchupMatrixCache = new Map<
    BattleFormatId,
    RuntimeMatchupMatrix
  >();

  function getManifestResourcePath(formatId: BattleFormatId): string {
    const format = getBattleFormatById(formatId);
    if (!format) {
      throw new MovesetVariantSimulationDataError(
        'manifest-incompatible',
        formatId,
        'unsupported-format',
      );
    }
    return getMovesetVariantManifestPath(format);
  }

  function loadManifest(formatId: BattleFormatId): MovesetVariantManifest {
    const cached = manifestCache.get(formatId);
    if (cached) {
      return cached;
    }

    const resourcePath = getManifestResourcePath(formatId);
    const filePath = path.resolve(dependencies.rootPath, resourcePath);
    let json: string;
    try {
      json = dependencies.readText(filePath);
    } catch (error) {
      throw new MovesetVariantSimulationDataError(
        isMissingFileError(error) ? 'manifest-missing' : 'manifest-malformed',
        formatId,
        resourcePath,
        undefined,
        undefined,
        error,
      );
    }

    let manifest: MovesetVariantManifest;
    try {
      manifest = parseMovesetVariantManifestJson(json);
    } catch (error) {
      const incompatible =
        error instanceof MovesetVariantManifestValidationError &&
        /^manifest\.metadata\.(schemaVersion|formatId|cup|cp)$/.test(
          error.path,
        );
      throw new MovesetVariantSimulationDataError(
        incompatible ? 'manifest-incompatible' : 'manifest-malformed',
        formatId,
        resourcePath,
        undefined,
        undefined,
        error,
      );
    }

    if (manifest.metadata.formatId !== formatId) {
      throw new MovesetVariantSimulationDataError(
        'manifest-incompatible',
        formatId,
        resourcePath,
      );
    }

    for (const species of manifest.species) {
      for (const candidate of species.candidates.filter(
        ({ active }) => active,
      )) {
        const complete = MOVESET_VARIANT_SCENARIOS.every(
          (scenario) =>
            candidate.completeness[scenario] &&
            candidate.evaluationCounts[scenario] > 0,
        );
        if (!complete) {
          throw new MovesetVariantSimulationDataError(
            'manifest-incomplete',
            formatId,
            resourcePath,
            species.speciesId,
            candidate.id,
          );
        }
      }
    }

    manifestCache.set(formatId, manifest);
    return manifest;
  }

  function getSpecies(
    speciesId: string,
    formatId: BattleFormatId,
  ): MovesetVariantManifestSpecies | undefined {
    const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
    return loadManifest(formatId).species.find(
      (species) => species.speciesId === canonicalSpeciesId,
    );
  }

  function getActiveCandidate(
    speciesId: string,
    variantId: MovesetVariantId,
    formatId: BattleFormatId,
  ): MovesetVariantManifestCandidate {
    const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
    const species = getSpecies(canonicalSpeciesId, formatId);
    const candidate = species?.candidates.find(
      ({ id, active }) => id === variantId && active,
    );
    if (!candidate) {
      throw new MovesetVariantSimulationDataError(
        'variant-unavailable',
        formatId,
        getManifestResourcePath(formatId),
        canonicalSpeciesId,
        variantId,
      );
    }
    return candidate;
  }

  function parseScenarioCsv(
    csv: string,
    formatId: BattleFormatId,
    resourcePath: string,
    speciesId: string,
    variantId: MovesetVariantId,
  ): ReadonlyMap<string, RuntimeMatchupResult> {
    let records: readonly SimulationCsvRecord[];
    try {
      records = parse(csv, {
        columns: true,
        skip_empty_lines: true,
      }) as SimulationCsvRecord[];
    } catch (error) {
      throw new MovesetVariantSimulationDataError(
        'manifest-incomplete',
        formatId,
        resourcePath,
        speciesId,
        variantId,
        error,
      );
    }

    const matchups = new Map<string, RuntimeMatchupResult>();
    for (const record of records) {
      const pokemonCell = record.Pokemon;
      const battleRating = readFiniteCsvNumber(record['Battle Rating']);
      const energyRemaining = readFiniteCsvNumber(record['Energy Remaining']);
      const hpRemaining = readFiniteCsvNumber(record['HP Remaining']);
      const opponentSpeciesId =
        typeof pokemonCell === 'string'
          ? dependencies.resolveOpponentSpeciesId(pokemonCell)
          : undefined;
      if (
        !opponentSpeciesId ||
        battleRating === undefined ||
        energyRemaining === undefined ||
        hpRemaining === undefined ||
        matchups.has(opponentSpeciesId)
      ) {
        throw new MovesetVariantSimulationDataError(
          'manifest-incomplete',
          formatId,
          resourcePath,
          speciesId,
          variantId,
        );
      }
      matchups.set(opponentSpeciesId, {
        battleRating,
        energyRemaining,
        hpRemaining,
      });
    }
    return matchups;
  }

  function loadRawCandidateMatchups(
    speciesId: string,
    candidate: MovesetVariantManifestCandidate,
    formatId: BattleFormatId,
  ): ScenarioMatchups {
    const cacheKey = `${formatId}:${speciesId}:${candidate.id}`;
    const cached = matchupCache.get(cacheKey);
    if (cached) {
      return cached;
    }

    const manifestResourcePath = getManifestResourcePath(formatId);
    const formatDirectory = path.dirname(manifestResourcePath);
    const scenarios = Object.fromEntries(
      MOVESET_VARIANT_SCENARIOS.map((scenario) => {
        const resourcePath = path.join(
          formatDirectory,
          candidate.storageKeys[scenario],
        );
        let csv: string;
        try {
          csv = dependencies.readText(
            path.resolve(dependencies.rootPath, resourcePath),
          );
        } catch (error) {
          throw new MovesetVariantSimulationDataError(
            'manifest-incomplete',
            formatId,
            resourcePath,
            speciesId,
            candidate.id,
            error,
          );
        }
        const matchups = parseScenarioCsv(
          csv,
          formatId,
          resourcePath,
          speciesId,
          candidate.id,
        );
        if (matchups.size < candidate.evaluationCounts[scenario]) {
          throw new MovesetVariantSimulationDataError(
            'manifest-incomplete',
            formatId,
            resourcePath,
            speciesId,
            candidate.id,
          );
        }
        return [scenario, matchups];
      }),
    ) as Record<ShieldScenarioKey, ReadonlyMap<string, RuntimeMatchupResult>>;

    if (
      !haveSameKeys(scenarios['0-0'], scenarios['1-1']) ||
      !haveSameKeys(scenarios['0-0'], scenarios['2-2'])
    ) {
      throw new MovesetVariantSimulationDataError(
        'manifest-incomplete',
        formatId,
        manifestResourcePath,
        speciesId,
        candidate.id,
      );
    }

    matchupCache.set(cacheKey, scenarios);
    return scenarios;
  }

  function loadCandidateMatchups(
    speciesId: string,
    variantId: MovesetVariantId,
    formatId: BattleFormatId,
  ): ScenarioMatchups {
    const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
    const species = getSpecies(canonicalSpeciesId, formatId);
    const candidate = getActiveCandidate(
      canonicalSpeciesId,
      variantId,
      formatId,
    );
    const candidateMatchups = loadRawCandidateMatchups(
      canonicalSpeciesId,
      candidate,
      formatId,
    );

    if (!candidate.isDefault && species) {
      const defaultCandidate = species.candidates.find(
        ({ id, active }) => id === species.defaultVariantId && active,
      );
      if (!defaultCandidate) {
        throw new MovesetVariantSimulationDataError(
          'manifest-incomplete',
          formatId,
          getManifestResourcePath(formatId),
          canonicalSpeciesId,
          variantId,
        );
      }
      const defaultMatchups = loadRawCandidateMatchups(
        canonicalSpeciesId,
        defaultCandidate,
        formatId,
      );
      if (
        MOVESET_VARIANT_SCENARIOS.some(
          (scenario) =>
            !haveSameKeys(
              candidateMatchups[scenario],
              defaultMatchups[scenario],
            ),
        )
      ) {
        throw new MovesetVariantSimulationDataError(
          'manifest-incomplete',
          formatId,
          getManifestResourcePath(formatId),
          canonicalSpeciesId,
          variantId,
        );
      }
    }

    return candidateMatchups;
  }

  function loadDefaultMatchupMatrix(
    formatId: BattleFormatId,
  ): RuntimeMatchupMatrix {
    const cached = defaultMatchupMatrixCache.get(formatId);
    if (cached) {
      return cached;
    }

    const manifest = loadManifest(formatId);
    const matrix = new Map<string, ReadonlyMap<string, RuntimeMatchupData>>();
    for (const species of manifest.species) {
      const defaultCandidate = species.candidates.find(
        ({ id, active, isDefault }) =>
          id === species.defaultVariantId && active && isDefault,
      );
      if (!defaultCandidate) {
        throw new MovesetVariantSimulationDataError(
          'manifest-incomplete',
          formatId,
          getManifestResourcePath(formatId),
          species.speciesId,
          species.defaultVariantId,
        );
      }

      const scenarios = loadRawCandidateMatchups(
        species.speciesId,
        defaultCandidate,
        formatId,
      );
      const speciesMatchups = new Map<string, RuntimeMatchupData>();
      for (const [opponentSpeciesId, shields0] of scenarios['0-0']) {
        const shields1 = scenarios['1-1'].get(opponentSpeciesId);
        const shields2 = scenarios['2-2'].get(opponentSpeciesId);
        if (!shields1 || !shields2) {
          throw new MovesetVariantSimulationDataError(
            'manifest-incomplete',
            formatId,
            getManifestResourcePath(formatId),
            species.speciesId,
            defaultCandidate.id,
          );
        }
        speciesMatchups.set(opponentSpeciesId, {
          shields0,
          shields1,
          shields2,
        });
      }
      matrix.set(species.speciesId, speciesMatchups);
    }

    defaultMatchupMatrixCache.set(formatId, matrix);
    return matrix;
  }

  return {
    getDefaultMatchupMatrix: loadDefaultMatchupMatrix,
    getManifestPolicyIdentity: (
      formatId: BattleFormatId,
    ): Readonly<{ schemaVersion: number; policyVersion: string }> => {
      const { schemaVersion, policyVersion } = loadManifest(formatId).metadata;
      return Object.freeze({ schemaVersion, policyVersion });
    },
    getActiveVariants: (
      speciesId: string,
      formatId: BattleFormatId,
    ): readonly MovesetVariant[] => {
      const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
      const species = getSpecies(canonicalSpeciesId, formatId);
      if (!species) {
        throw new MovesetVariantSimulationDataError(
          'variant-unavailable',
          formatId,
          getManifestResourcePath(formatId),
          canonicalSpeciesId,
        );
      }
      const activeCandidates = species.candidates.filter(
        ({ active }) => active,
      );
      for (const candidate of activeCandidates) {
        loadCandidateMatchups(canonicalSpeciesId, candidate.id, formatId);
      }
      return activeCandidates.map(toMovesetVariant);
    },
    getMatchupResult: (
      speciesId: string,
      variantId: MovesetVariantId,
      opponentSpeciesId: string,
      formatId: BattleFormatId,
    ): number | null => {
      const canonicalOpponentSpeciesId =
        normalizeToChoosableSpeciesId(opponentSpeciesId);
      const matchups = loadCandidateMatchups(speciesId, variantId, formatId);
      const weightedScenarios = [
        { scenario: '0-0' as const, weight: 0.3 },
        { scenario: '1-1' as const, weight: 0.5 },
        { scenario: '2-2' as const, weight: 0.2 },
      ];
      const evaluated = weightedScenarios
        .map(({ scenario, weight }) => ({
          rating: matchups[scenario].get(canonicalOpponentSpeciesId)
            ?.battleRating,
          weight,
        }))
        .filter(
          (entry): entry is { rating: number; weight: number } =>
            entry.rating !== undefined,
        );
      if (evaluated.length === 0) {
        return null;
      }
      const totalWeight = evaluated.reduce(
        (sum, { weight }) => sum + weight,
        0,
      );
      return (
        evaluated.reduce(
          (sum, { rating, weight }) => sum + rating * weight,
          0,
        ) / totalWeight
      );
    },
    getShieldScenarioMatchupResult: (
      speciesId: string,
      variantId: MovesetVariantId,
      opponentSpeciesId: string,
      shields: 0 | 1 | 2,
      formatId: BattleFormatId,
    ): number | null => {
      const scenario = `${shields}-${shields}` as ShieldScenarioKey;
      return (
        loadCandidateMatchups(speciesId, variantId, formatId)[scenario].get(
          normalizeToChoosableSpeciesId(opponentSpeciesId),
        )?.battleRating ?? null
      );
    },
  };
}
