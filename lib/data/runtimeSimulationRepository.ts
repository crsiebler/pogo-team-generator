import path from 'node:path';
import { normalizeToChoosableSpeciesId } from './aliases';
import { getBattleFormatById, type BattleFormatId } from './battleFormats';
import {
  MAX_ACTIVE_MOVESET_VARIANTS,
  MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
  MOVESET_VARIANT_MEGA_LEVEL,
  MOVESET_VARIANT_POLICY_VERSION,
} from './movesetVariantManifest';
import {
  RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
  RUNTIME_SIMULATION_SNAPSHOT_MAX_JSON_BYTES,
  RuntimeSimulationSnapshotValidationError,
  getRuntimeSimulationSnapshotPath,
  parseRuntimeSimulationSnapshotJson,
} from './runtimeSimulationSnapshot';
import type { MovesetVariant, MovesetVariantId } from '@/lib/types';

/** Stable categories for actionable runtime simulation snapshot failures. */
export type MovesetVariantSimulationDataErrorCode =
  | 'manifest-missing'
  | 'manifest-malformed'
  | 'manifest-incompatible'
  | 'manifest-incomplete'
  | 'snapshot-not-prepared'
  | 'variant-unavailable';

/** Typed failure raised when authoritative runtime simulation data is unusable. */
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
      `Runtime simulation data ${code.replaceAll('-', ' ')} for ${formatId}${target ? ` (${target})` : ''} at ${resourcePath}. Run simulation sync to regenerate the compact format snapshot.`,
      cause === undefined ? undefined : { cause },
    );
    this.name = 'MovesetVariantSimulationDataError';
  }
}

/** Battle Rating retained for one opponent and shield scenario. */
export interface RuntimeMatchupResult {
  readonly battleRating: number;
}

/** Complete default Battle Ratings for one opponent. */
export interface RuntimeMatchupData {
  readonly shields0: RuntimeMatchupResult;
  readonly shields1: RuntimeMatchupResult;
  readonly shields2: RuntimeMatchupResult;
}

/** Prepared default matchup matrix keyed by species and opponent ids. */
export type RuntimeMatchupMatrix = ReadonlyMap<
  string,
  ReadonlyMap<string, RuntimeMatchupData>
>;

/** Filesystem boundary used to prepare repository-owned runtime snapshots. */
export interface RuntimeSimulationRepositoryDependencies {
  readonly rootPath: string;
  readonly readText: (filePath: string, maxBytes: number) => string;
}

/** Explicitly prepared, format-scoped synchronous simulation repository. */
export interface RuntimeSimulationRepository {
  prepare(formatId: BattleFormatId): void;
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

interface PreparedVariant {
  readonly variantIndex: number;
  readonly moveset: MovesetVariant;
}

interface PreparedSpecies {
  readonly defaultVariant: PreparedVariant;
  readonly variants: readonly PreparedVariant[];
  readonly variantsById: ReadonlyMap<MovesetVariantId, PreparedVariant>;
}

interface PreparedFormat {
  readonly ratings: Uint16Array;
  readonly opponents: readonly string[];
  readonly opponentIndexes: ReadonlyMap<string, number>;
  readonly species: ReadonlyMap<string, PreparedSpecies>;
  readonly additionalChargedMovesBySpecies: ReadonlyMap<string, string | null>;
  readonly defaultMatrix: RuntimeMatchupMatrix;
  readonly policyIdentity: Readonly<{
    schemaVersion: number;
    policyVersion: string;
  }>;
}

function isMissingFileError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    error.code === 'ENOENT'
  );
}

function getResourcePath(formatId: BattleFormatId): string {
  const format = getBattleFormatById(formatId);
  if (!format) {
    throw new MovesetVariantSimulationDataError(
      'manifest-incompatible',
      formatId,
      'unsupported-format',
    );
  }
  return getRuntimeSimulationSnapshotPath(format);
}

function getRatingOffset(
  variantIndex: number,
  opponentIndex: number,
  shieldIndex: 0 | 1 | 2,
  opponentCount: number,
): number {
  return (variantIndex * opponentCount + opponentIndex) * 3 + shieldIndex;
}

function getRating(
  format: Pick<PreparedFormat, 'ratings' | 'opponents'>,
  variantIndex: number,
  opponentIndex: number,
  shields: 0 | 1 | 2,
): number | null {
  const rating =
    format.ratings[
      getRatingOffset(
        variantIndex,
        opponentIndex,
        shields,
        format.opponents.length,
      )
    ];
  return rating === RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING
    ? null
    : (rating ?? null);
}

class SnapshotOpponentMap implements ReadonlyMap<string, RuntimeMatchupData> {
  readonly size: number;

  constructor(
    private readonly format: Pick<
      PreparedFormat,
      'ratings' | 'opponents' | 'opponentIndexes'
    > & { readonly opponentIterationOrder: readonly number[] },
    private readonly variantIndex: number,
  ) {
    this.size = format.opponents.reduce(
      (count, _opponent, opponentIndex) =>
        getRating(format, variantIndex, opponentIndex, 0) === null
          ? count
          : count + 1,
      0,
    );
  }

  get(opponentSpeciesId: string): RuntimeMatchupData | undefined {
    const opponentIndex = this.format.opponentIndexes.get(opponentSpeciesId);
    if (opponentIndex === undefined) {
      return undefined;
    }
    const shields0 = getRating(
      this.format,
      this.variantIndex,
      opponentIndex,
      0,
    );
    const shields1 = getRating(
      this.format,
      this.variantIndex,
      opponentIndex,
      1,
    );
    const shields2 = getRating(
      this.format,
      this.variantIndex,
      opponentIndex,
      2,
    );
    if (shields0 === null || shields1 === null || shields2 === null) {
      return undefined;
    }
    return {
      shields0: { battleRating: shields0 },
      shields1: { battleRating: shields1 },
      shields2: { battleRating: shields2 },
    };
  }

  has(opponentSpeciesId: string): boolean {
    return this.get(opponentSpeciesId) !== undefined;
  }

  *entries(): MapIterator<[string, RuntimeMatchupData]> {
    for (const opponentIndex of this.format.opponentIterationOrder) {
      const opponentSpeciesId = this.format.opponents[opponentIndex]!;
      const matchup = this.get(opponentSpeciesId);
      if (matchup) {
        yield [opponentSpeciesId, matchup];
      }
    }
  }

  *keys(): MapIterator<string> {
    for (const [opponentSpeciesId] of this.entries()) {
      yield opponentSpeciesId;
    }
  }

  *values(): MapIterator<RuntimeMatchupData> {
    for (const [, matchup] of this.entries()) {
      yield matchup;
    }
  }

  forEach(
    callbackfn: (
      value: RuntimeMatchupData,
      key: string,
      map: ReadonlyMap<string, RuntimeMatchupData>,
    ) => void,
    thisArg?: unknown,
  ): void {
    for (const [opponentSpeciesId, matchup] of this.entries()) {
      callbackfn.call(thisArg, matchup, opponentSpeciesId, this);
    }
  }

  [Symbol.iterator](): MapIterator<[string, RuntimeMatchupData]> {
    return this.entries();
  }
}

function validatePresence(
  formatId: BattleFormatId,
  resourcePath: string,
  ratings: Uint16Array,
  opponentCount: number,
  variantsBySpecies: ReadonlyMap<string, readonly PreparedVariant[]>,
  defaultsBySpecies: ReadonlyMap<string, PreparedVariant>,
): void {
  for (const [speciesId, variants] of variantsBySpecies) {
    if (
      variants.length === 0 ||
      variants.length > MAX_ACTIVE_MOVESET_VARIANTS
    ) {
      throw new MovesetVariantSimulationDataError(
        'manifest-incomplete',
        formatId,
        resourcePath,
        speciesId,
      );
    }
    const defaultVariant = defaultsBySpecies.get(speciesId);
    if (!defaultVariant) {
      throw new MovesetVariantSimulationDataError(
        'manifest-incomplete',
        formatId,
        resourcePath,
        speciesId,
      );
    }
    let evaluated = false;
    for (
      let opponentIndex = 0;
      opponentIndex < opponentCount;
      opponentIndex += 1
    ) {
      const defaultPresent =
        ratings[
          getRatingOffset(
            defaultVariant.variantIndex,
            opponentIndex,
            0,
            opponentCount,
          )
        ] !== RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING;
      for (const variant of variants) {
        const presence = ([0, 1, 2] as const).map(
          (shieldIndex) =>
            ratings[
              getRatingOffset(
                variant.variantIndex,
                opponentIndex,
                shieldIndex,
                opponentCount,
              )
            ] !== RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
        );
        if (presence.some((present) => present !== presence[0])) {
          throw new MovesetVariantSimulationDataError(
            'manifest-incomplete',
            formatId,
            resourcePath,
            speciesId,
            variant.moveset.id,
          );
        }
        if (presence[0] !== defaultPresent) {
          throw new MovesetVariantSimulationDataError(
            'manifest-incomplete',
            formatId,
            resourcePath,
            speciesId,
            variant.moveset.id,
          );
        }
        evaluated ||= presence[0]!;
      }
    }
    if (!evaluated) {
      throw new MovesetVariantSimulationDataError(
        'manifest-incomplete',
        formatId,
        resourcePath,
        speciesId,
      );
    }
  }
}

function classifySnapshotValidationError(
  formatId: BattleFormatId,
  resourcePath: string,
  error: RuntimeSimulationSnapshotValidationError,
): MovesetVariantSimulationDataError {
  const incompatible =
    /^snapshot\.(schemaVersion|format|manifest\.(schemaVersion|megaLevel))/.test(
      error.path,
    );
  const malformed = error.message.includes('must be valid JSON');
  return new MovesetVariantSimulationDataError(
    incompatible
      ? 'manifest-incompatible'
      : malformed
        ? 'manifest-malformed'
        : 'manifest-incomplete',
    formatId,
    resourcePath,
    undefined,
    undefined,
    error,
  );
}

function prepareFormat(
  formatId: BattleFormatId,
  resourcePath: string,
  json: string,
): PreparedFormat {
  let snapshot;
  try {
    snapshot = parseRuntimeSimulationSnapshotJson(json);
  } catch (error) {
    if (error instanceof RuntimeSimulationSnapshotValidationError) {
      throw classifySnapshotValidationError(formatId, resourcePath, error);
    }
    throw error;
  }
  if (snapshot.format.id !== formatId) {
    throw new MovesetVariantSimulationDataError(
      'manifest-incompatible',
      formatId,
      resourcePath,
    );
  }
  if (
    snapshot.manifest.schemaVersion !==
      MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION ||
    snapshot.manifest.megaLevel !== MOVESET_VARIANT_MEGA_LEVEL ||
    snapshot.manifest.policyVersion !== MOVESET_VARIANT_POLICY_VERSION
  ) {
    throw new MovesetVariantSimulationDataError(
      'manifest-incompatible',
      formatId,
      resourcePath,
    );
  }

  const bytes = Buffer.from(snapshot.ratings, 'base64');
  const ratings = new Uint16Array(bytes.length / 2);
  for (let index = 0; index < ratings.length; index += 1) {
    ratings[index] = bytes.readUInt16LE(index * 2);
  }
  const variantsBySpecies = new Map<string, PreparedVariant[]>();
  const additionalChargedMovesBySpecies = new Map(
    snapshot.dictionaries.species.map((speciesId, speciesIndex) => {
      const moveIndex = snapshot.additionalChargedMoveBySpecies[speciesIndex];
      return [
        speciesId,
        moveIndex === null ? null : snapshot.dictionaries.moves[moveIndex]!,
      ] as const;
    }),
  );
  snapshot.variants.forEach((variant, variantIndex) => {
    const [
      speciesIndex,
      variantIdIndex,
      fastMoveIndex,
      charge1Index,
      charge2Index,
    ] = variant;
    const speciesId = snapshot.dictionaries.species[speciesIndex]!;
    const preparedVariant: PreparedVariant = {
      variantIndex,
      moveset: Object.freeze({
        id: snapshot.dictionaries.variantIds[variantIdIndex]!,
        fastMove: snapshot.dictionaries.moves[fastMoveIndex]!,
        chargedMove1: snapshot.dictionaries.moves[charge1Index]!,
        chargedMove2: snapshot.dictionaries.moves[charge2Index]!,
        ...(additionalChargedMovesBySpecies.get(speciesId)
          ? {
              additionalChargedMove:
                additionalChargedMovesBySpecies.get(speciesId)!,
              megaLevel: MOVESET_VARIANT_MEGA_LEVEL,
            }
          : {}),
        isDefault:
          snapshot.defaultVariantBySpecies[speciesIndex] === variantIndex,
      }),
    };
    const speciesVariants = variantsBySpecies.get(speciesId) ?? [];
    speciesVariants.push(preparedVariant);
    variantsBySpecies.set(speciesId, speciesVariants);
  });
  const defaultsBySpecies = new Map<string, PreparedVariant>();
  snapshot.dictionaries.species.forEach((speciesId, speciesIndex) => {
    const defaultVariantIndex = snapshot.defaultVariantBySpecies[speciesIndex]!;
    const defaultVariant = variantsBySpecies
      .get(speciesId)
      ?.find(({ variantIndex }) => variantIndex === defaultVariantIndex);
    if (!defaultVariant) {
      throw new MovesetVariantSimulationDataError(
        'manifest-incomplete',
        formatId,
        resourcePath,
        speciesId,
      );
    }
    defaultsBySpecies.set(speciesId, defaultVariant);
  });
  validatePresence(
    formatId,
    resourcePath,
    ratings,
    snapshot.dictionaries.opponents.length,
    variantsBySpecies,
    defaultsBySpecies,
  );

  const species = new Map<string, PreparedSpecies>();
  const opponentIndexes = new Map(
    snapshot.dictionaries.opponents.map((opponentId, index) => [
      opponentId,
      index,
    ]),
  );
  const defaultMatrix = new Map<
    string,
    ReadonlyMap<string, RuntimeMatchupData>
  >();
  for (const [speciesId, variants] of variantsBySpecies) {
    const defaultVariant = defaultsBySpecies.get(speciesId)!;
    const orderedVariants = [
      defaultVariant,
      ...variants.filter(
        ({ variantIndex }) => variantIndex !== defaultVariant.variantIndex,
      ),
    ];
    species.set(speciesId, {
      defaultVariant,
      variants: orderedVariants,
      variantsById: new Map(
        orderedVariants.map((variant) => [variant.moveset.id, variant]),
      ),
    });
    defaultMatrix.set(
      speciesId,
      new SnapshotOpponentMap(
        {
          ratings,
          opponents: snapshot.dictionaries.opponents,
          opponentIndexes,
          opponentIterationOrder:
            snapshot.opponentIterationOrderBySpecies[
              snapshot.variants[defaultVariant.variantIndex]![0]
            ]!,
        },
        defaultVariant.variantIndex,
      ),
    );
  }
  return {
    ratings,
    opponents: snapshot.dictionaries.opponents,
    opponentIndexes,
    species,
    additionalChargedMovesBySpecies,
    defaultMatrix,
    policyIdentity: Object.freeze({
      schemaVersion: snapshot.manifest.schemaVersion,
      policyVersion: snapshot.manifest.policyVersion,
    }),
  };
}

/** Create an isolated repository that hydrates each requested snapshot once. */
export function createRuntimeSimulationRepository(
  dependencies: RuntimeSimulationRepositoryDependencies,
): RuntimeSimulationRepository {
  const formats = new Map<BattleFormatId, PreparedFormat>();

  function getPreparedFormat(formatId: BattleFormatId): PreparedFormat {
    const prepared = formats.get(formatId);
    if (!prepared) {
      throw new MovesetVariantSimulationDataError(
        'snapshot-not-prepared',
        formatId,
        getResourcePath(formatId),
      );
    }
    return prepared;
  }

  function getPreparedVariant(
    speciesId: string,
    variantId: MovesetVariantId,
    formatId: BattleFormatId,
  ): Readonly<{ format: PreparedFormat; variant: PreparedVariant }> {
    const format = getPreparedFormat(formatId);
    const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
    const variant = format.species
      .get(canonicalSpeciesId)
      ?.variantsById.get(variantId);
    if (!variant) {
      throw new MovesetVariantSimulationDataError(
        'variant-unavailable',
        formatId,
        getResourcePath(formatId),
        canonicalSpeciesId,
        variantId,
      );
    }
    return { format, variant };
  }

  return {
    prepare: (formatId: BattleFormatId): void => {
      if (formats.has(formatId)) {
        return;
      }
      const resourcePath = getResourcePath(formatId);
      let json: string;
      try {
        json = dependencies.readText(
          path.resolve(dependencies.rootPath, resourcePath),
          RUNTIME_SIMULATION_SNAPSHOT_MAX_JSON_BYTES,
        );
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
      const prepared = prepareFormat(formatId, resourcePath, json);
      formats.set(formatId, prepared);
    },
    getDefaultMatchupMatrix: (formatId: BattleFormatId): RuntimeMatchupMatrix =>
      getPreparedFormat(formatId).defaultMatrix,
    getManifestPolicyIdentity: (
      formatId: BattleFormatId,
    ): Readonly<{ schemaVersion: number; policyVersion: string }> =>
      getPreparedFormat(formatId).policyIdentity,
    getActiveVariants: (
      speciesId: string,
      formatId: BattleFormatId,
    ): readonly MovesetVariant[] => {
      const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
      const preparedSpecies =
        getPreparedFormat(formatId).species.get(canonicalSpeciesId);
      if (!preparedSpecies) {
        throw new MovesetVariantSimulationDataError(
          'variant-unavailable',
          formatId,
          getResourcePath(formatId),
          canonicalSpeciesId,
        );
      }
      return preparedSpecies.variants.map(({ moveset }) => moveset);
    },
    getMatchupResult: (
      speciesId: string,
      variantId: MovesetVariantId,
      opponentSpeciesId: string,
      formatId: BattleFormatId,
    ): number | null => {
      const { format, variant } = getPreparedVariant(
        speciesId,
        variantId,
        formatId,
      );
      const opponentIndex = format.opponentIndexes.get(
        normalizeToChoosableSpeciesId(opponentSpeciesId),
      );
      if (opponentIndex === undefined) {
        return null;
      }
      const weightedScenarios = [
        { shields: 0 as const, weight: 0.3 },
        { shields: 1 as const, weight: 0.5 },
        { shields: 2 as const, weight: 0.2 },
      ];
      const evaluated = weightedScenarios
        .map(({ shields, weight }) => ({
          rating: getRating(
            format,
            variant.variantIndex,
            opponentIndex,
            shields,
          ),
          weight,
        }))
        .filter(
          (entry): entry is { rating: number; weight: number } =>
            entry.rating !== null,
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
      const { format, variant } = getPreparedVariant(
        speciesId,
        variantId,
        formatId,
      );
      const opponentIndex = format.opponentIndexes.get(
        normalizeToChoosableSpeciesId(opponentSpeciesId),
      );
      return opponentIndex === undefined
        ? null
        : getRating(format, variant.variantIndex, opponentIndex, shields);
    },
  };
}
