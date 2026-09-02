import { createHash } from 'crypto';
import { readFileSync } from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';
import type { PreparedMovesetVariantManifest } from './movesetVariantManifest';
import type { PreparedSimulationCsv } from './simulations';
import {
  normalizeToChoosableSpeciesId,
  normalizeToChoosableSpeciesName,
} from '@/lib/data/aliases';
import {
  getBattleFormats,
  type BattleFormatId,
} from '@/lib/data/battleFormats';
import {
  getMovesetVariantManifestPath,
  MOVESET_VARIANT_SCENARIOS,
  parseMovesetVariantManifestJson,
  serializeMovesetVariantManifest,
  type MovesetVariantManifestCandidate,
  type MovesetVariantScenarioRecord,
} from '@/lib/data/movesetVariantManifest';
import {
  createRuntimeSimulationSnapshotActiveRatingsDigest,
  getRuntimeSimulationSnapshotPath,
  RUNTIME_SIMULATION_SNAPSHOT_MAX_RATING,
  RUNTIME_SIMULATION_SNAPSHOT_MIN_RATING,
  RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
  RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
  serializeRuntimeSimulationSnapshot,
  type RuntimeSimulationSnapshot,
  type RuntimeSimulationSnapshotVariant,
} from '@/lib/data/runtimeSimulationSnapshot';
import { extractSpeciesNameFromSimulationCell } from '@/lib/data/simulations';
import type { PokemonData } from '@/lib/sync/types';
import type { MovesetVariantId } from '@/lib/types';

/** Canonical bytes and final target for one prepared format snapshot. */
export interface PreparedRuntimeSimulationSnapshot {
  readonly formatId: BattleFormatId;
  readonly targetPath: string;
  readonly contents: string;
}

/** Filesystem and species boundaries used while preparing compact snapshots. */
export interface RuntimeSimulationSnapshotPreparationDependencies {
  readonly readText: (filePath: string) => string;
  readonly resolveOpponentSpeciesId: (name: string) => string | undefined;
}

interface SimulationCsvRecord {
  readonly Pokemon?: unknown;
  readonly 'Battle Rating'?: unknown;
  readonly 'Energy Remaining'?: unknown;
  readonly 'HP Remaining'?: unknown;
}

interface ActiveVariantRatings {
  readonly speciesId: string;
  readonly candidate: MovesetVariantManifestCandidate;
  readonly scenarios: MovesetVariantScenarioRecord<ReadonlyMap<string, number>>;
}

const expectedCsvColumns = [
  'Pokemon',
  'Battle Rating',
  'Energy Remaining',
  'HP Remaining',
] as const;
const canonicalSpeciesIdPattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const strictIntegerPattern = /^(?:0|[1-9][0-9]*)$/;
const strictFiniteNumberPattern = /^-?(?:0|[1-9][0-9]*)(?:\.[0-9]+)?$/;

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function readStrictFiniteNumber(value: unknown): number | undefined {
  if (
    (typeof value !== 'string' && typeof value !== 'number') ||
    !strictFiniteNumberPattern.test(String(value).trim())
  ) {
    return undefined;
  }
  const number = Number(value);
  return Number.isFinite(number) ? number : undefined;
}

function readBattleRating(value: unknown, resourcePath: string): number {
  const source = String(value ?? '').trim();
  if (!strictIntegerPattern.test(source)) {
    throw new Error(
      `[sync-runtime-snapshot] Battle Rating must be an integer in ${resourcePath}`,
    );
  }
  const rating = Number(source);
  if (
    rating < RUNTIME_SIMULATION_SNAPSHOT_MIN_RATING ||
    rating > RUNTIME_SIMULATION_SNAPSHOT_MAX_RATING
  ) {
    throw new Error(
      `[sync-runtime-snapshot] Battle Rating must be between ${RUNTIME_SIMULATION_SNAPSHOT_MIN_RATING} and ${RUNTIME_SIMULATION_SNAPSHOT_MAX_RATING} in ${resourcePath}`,
    );
  }
  return rating;
}

function parseSimulationCsv(
  contents: string,
  resourcePath: string,
  expectedCount: number,
  dependencies: RuntimeSimulationSnapshotPreparationDependencies,
): ReadonlyMap<string, number> {
  let records: readonly SimulationCsvRecord[];
  try {
    records = parse(contents, {
      columns: (columns: string[]) => {
        if (
          columns.length !== expectedCsvColumns.length ||
          columns.some((column, index) => column !== expectedCsvColumns[index])
        ) {
          throw new Error('unexpected simulation CSV columns');
        }
        return columns;
      },
      skip_empty_lines: true,
    }) as SimulationCsvRecord[];
  } catch (error) {
    throw new Error(
      `[sync-runtime-snapshot] Malformed active simulation CSV ${resourcePath}`,
      { cause: error },
    );
  }
  if (records.length < expectedCount) {
    throw new Error(
      `[sync-runtime-snapshot] Active simulation CSV ${resourcePath} has ${records.length} rows; expected at least ${expectedCount}`,
    );
  }
  const ratings = new Map<string, number>();
  for (const record of records) {
    const pokemon = record.Pokemon;
    const energy = readStrictFiniteNumber(record['Energy Remaining']);
    const hp = readStrictFiniteNumber(record['HP Remaining']);
    const speciesId =
      typeof pokemon === 'string'
        ? dependencies.resolveOpponentSpeciesId(
            extractSpeciesNameFromSimulationCell(pokemon),
          )
        : undefined;
    if (
      !speciesId ||
      !canonicalSpeciesIdPattern.test(speciesId) ||
      energy === undefined ||
      hp === undefined ||
      ratings.has(speciesId)
    ) {
      throw new Error(
        `[sync-runtime-snapshot] Invalid or duplicate opponent row in ${resourcePath}`,
      );
    }
    ratings.set(
      speciesId,
      readBattleRating(record['Battle Rating'], resourcePath),
    );
  }
  return ratings;
}

function haveSameKeys(
  left: ReadonlyMap<string, unknown>,
  right: ReadonlyMap<string, unknown>,
): boolean {
  return (
    left.size === right.size &&
    [...left.keys()].every((opponentId) => right.has(opponentId))
  );
}

function getIndexMap(values: readonly string[]): ReadonlyMap<string, number> {
  return new Map(values.map((value, index) => [value, index]));
}

function getRequiredIndex(
  indexes: ReadonlyMap<string, number>,
  value: string,
): number {
  const index = indexes.get(value);
  if (index === undefined) {
    throw new Error(
      `[sync-runtime-snapshot] Missing dictionary value ${value}`,
    );
  }
  return index;
}

function encodeRatings(ratings: readonly number[]): string {
  const bytes = Buffer.allocUnsafe(ratings.length * 2);
  ratings.forEach((rating, index) => bytes.writeUInt16LE(rating, index * 2));
  return bytes.toString('base64');
}

function buildSnapshot(
  preparedManifest: PreparedMovesetVariantManifest,
  preparedCsvByTarget: ReadonlyMap<string, PreparedSimulationCsv>,
  dependencies: RuntimeSimulationSnapshotPreparationDependencies,
): RuntimeSimulationSnapshot {
  const manifest = parseMovesetVariantManifestJson(preparedManifest.contents);
  const format = getBattleFormats().find(
    ({ id }) => id === preparedManifest.formatId,
  );
  if (!format || manifest.metadata.formatId !== format.id) {
    throw new Error(
      `[sync-runtime-snapshot] Manifest contents must match ${preparedManifest.formatId}`,
    );
  }
  const expectedManifestPath = getMovesetVariantManifestPath(format);
  if (preparedManifest.targetPath !== expectedManifestPath) {
    throw new Error(
      `[sync-runtime-snapshot] Manifest target must match ${format.id}: ${expectedManifestPath}`,
    );
  }
  const directory = path.posix.dirname(expectedManifestPath);
  const activeVariants: ActiveVariantRatings[] = [];
  for (const species of manifest.species) {
    const speciesActiveVariants: ActiveVariantRatings[] = [];
    for (const candidate of species.candidates.filter(({ active }) => active)) {
      const scenarios = Object.fromEntries(
        MOVESET_VARIANT_SCENARIOS.map((scenario) => {
          const resourcePath = path.posix.join(
            directory,
            candidate.storageKeys[scenario],
          );
          const preparedCsv = preparedCsvByTarget.get(resourcePath);
          if (preparedCsv && preparedCsv.formatId !== format.id) {
            throw new Error(
              `[sync-runtime-snapshot] Prepared CSV format must match ${format.id}: ${resourcePath}`,
            );
          }
          const contents =
            preparedCsv?.contents ?? dependencies.readText(resourcePath);
          return [
            scenario,
            parseSimulationCsv(
              contents,
              resourcePath,
              candidate.evaluationCounts[scenario],
              dependencies,
            ),
          ];
        }),
      ) as MovesetVariantScenarioRecord<ReadonlyMap<string, number>>;
      if (
        !haveSameKeys(scenarios['0-0'], scenarios['1-1']) ||
        !haveSameKeys(scenarios['0-0'], scenarios['2-2'])
      ) {
        throw new Error(
          `[sync-runtime-snapshot] Scenario opponents must match for ${format.id}/${species.speciesId}/${candidate.id}`,
        );
      }
      speciesActiveVariants.push({
        speciesId: species.speciesId,
        candidate,
        scenarios,
      });
    }
    const defaultVariant = speciesActiveVariants.find(
      ({ candidate }) => candidate.isDefault,
    );
    if (!defaultVariant) {
      throw new Error(
        `[sync-runtime-snapshot] Missing active default for ${format.id}/${species.speciesId}`,
      );
    }
    for (const alternate of speciesActiveVariants.filter(
      ({ candidate }) => !candidate.isDefault,
    )) {
      if (
        !haveSameKeys(
          defaultVariant.scenarios['0-0'],
          alternate.scenarios['0-0'],
        )
      ) {
        throw new Error(
          `[sync-runtime-snapshot] Active alternate opponents must match the default for ${format.id}/${species.speciesId}`,
        );
      }
    }
    activeVariants.push(...speciesActiveVariants);
  }
  activeVariants.sort(
    (left, right) =>
      compareAscii(left.speciesId, right.speciesId) ||
      compareAscii(left.candidate.id, right.candidate.id),
  );
  const species = [
    ...new Set(activeVariants.map(({ speciesId }) => speciesId)),
  ];
  const opponents = [
    ...new Set(
      activeVariants.flatMap((variant) => [...variant.scenarios['0-0'].keys()]),
    ),
  ].sort(compareAscii);
  const moves = [
    ...new Set([
      ...activeVariants.flatMap(({ candidate }) => [
        candidate.fastMove,
        candidate.chargedMove1,
        candidate.chargedMove2,
      ]),
      ...manifest.species.flatMap(({ additionalChargedMove }) =>
        additionalChargedMove ? [additionalChargedMove] : [],
      ),
    ]),
  ].sort(compareAscii);
  const variantIds = [
    ...new Set(activeVariants.map(({ candidate }) => candidate.id)),
  ].sort(compareAscii) as MovesetVariantId[];
  const speciesIndexes = getIndexMap(species);
  const opponentIndexes = getIndexMap(opponents);
  const moveIndexes = getIndexMap(moves);
  const variantIdIndexes = getIndexMap(variantIds);
  const additionalChargedMoveBySpecies = species.map((speciesId) => {
    const additionalChargedMove = manifest.species.find(
      (entry) => entry.speciesId === speciesId,
    )?.additionalChargedMove;
    return additionalChargedMove === undefined
      ? null
      : getRequiredIndex(moveIndexes, additionalChargedMove);
  });
  const variants: RuntimeSimulationSnapshotVariant[] = activeVariants.map(
    ({ speciesId, candidate }) => [
      getRequiredIndex(speciesIndexes, speciesId),
      getRequiredIndex(variantIdIndexes, candidate.id),
      getRequiredIndex(moveIndexes, candidate.fastMove),
      getRequiredIndex(moveIndexes, candidate.chargedMove1),
      getRequiredIndex(moveIndexes, candidate.chargedMove2),
    ],
  );
  const defaultVariantBySpecies = species.map((speciesId) => {
    const index = activeVariants.findIndex(
      (variant) =>
        variant.speciesId === speciesId && variant.candidate.isDefault,
    );
    if (index === -1) {
      throw new Error(
        `[sync-runtime-snapshot] Missing active default for ${format.id}/${speciesId}`,
      );
    }
    return index;
  });
  const opponentIterationOrderBySpecies = defaultVariantBySpecies.map(
    (variantIndex) =>
      [...activeVariants[variantIndex]!.scenarios['0-0'].keys()].map(
        (opponentId) => getRequiredIndex(opponentIndexes, opponentId),
      ),
  );
  const ratings = new Array<number>(
    variants.length * opponents.length * MOVESET_VARIANT_SCENARIOS.length,
  ).fill(RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING);
  activeVariants.forEach((variant, variantIndex) => {
    for (const [
      scenarioIndex,
      scenario,
    ] of MOVESET_VARIANT_SCENARIOS.entries()) {
      for (const [opponentId, rating] of variant.scenarios[scenario]) {
        const opponentIndex = getRequiredIndex(opponentIndexes, opponentId);
        const offset =
          (variantIndex * opponents.length + opponentIndex) *
            MOVESET_VARIANT_SCENARIOS.length +
          scenarioIndex;
        ratings[offset] = rating;
      }
    }
  });
  const dictionaries = { species, opponents, moves, variantIds };
  const encodedRatings = encodeRatings(ratings);
  const snapshotFormat = { id: format.id, cup: format.cup, cp: format.cp };
  const snapshotManifest = {
    schemaVersion: manifest.metadata.schemaVersion,
    megaLevel: manifest.metadata.megaLevel,
    policyVersion: manifest.metadata.policyVersion,
    digest: sha256(serializeMovesetVariantManifest(manifest)),
    sourceDigests: [...manifest.metadata.sourceDigests].sort((left, right) =>
      compareAscii(left.key, right.key),
    ),
  };
  const encoding = {
    kind: 'uint16-le-base64',
    widthBytes: 2,
    byteOrder: 'little-endian',
    minimum: RUNTIME_SIMULATION_SNAPSHOT_MIN_RATING,
    maximum: RUNTIME_SIMULATION_SNAPSHOT_MAX_RATING,
    missing: RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
    scenarios: MOVESET_VARIANT_SCENARIOS,
    layout: 'variant-opponent-scenario',
  } as const;
  const shape = [variants.length, opponents.length, 3] as const;
  return {
    schemaVersion: RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
    format: snapshotFormat,
    manifest: snapshotManifest,
    activeRatingsDigest: createRuntimeSimulationSnapshotActiveRatingsDigest({
      schemaVersion: RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
      format: snapshotFormat,
      manifest: snapshotManifest,
      encoding,
      dictionaries,
      variants,
      defaultVariantBySpecies,
      additionalChargedMoveBySpecies,
      opponentIterationOrderBySpecies,
      shape,
      ratings: encodedRatings,
    }),
    encoding,
    dictionaries,
    variants,
    defaultVariantBySpecies,
    additionalChargedMoveBySpecies,
    opponentIterationOrderBySpecies,
    shape,
    ratings: encodedRatings,
  };
}

/**
 * Build a canonical opponent-name resolver from the current sync Pokemon
 * snapshot instead of module-cached checked-in data.
 */
export function createRuntimeSimulationSnapshotOpponentResolver(
  pokemonData: readonly PokemonData[],
): (name: string) => string | undefined {
  const byName = new Map<string, string>();
  for (const pokemon of pokemonData) {
    const speciesId = normalizeToChoosableSpeciesId(pokemon.speciesId);
    const speciesName = normalizeToChoosableSpeciesName(pokemon.speciesName);
    byName.set(speciesName, speciesId);
    byName.set(speciesName.toLowerCase().replace(/[^a-z0-9]/g, ''), speciesId);
  }
  return (name: string): string | undefined => {
    const canonicalName = normalizeToChoosableSpeciesName(name);
    return (
      byName.get(canonicalName) ??
      byName.get(canonicalName.toLowerCase().replace(/[^a-z0-9]/g, ''))
    );
  };
}

/** Prepare one deterministic active-only runtime snapshot for every format. */
export function prepareRuntimeSimulationSnapshots(
  manifests: readonly PreparedMovesetVariantManifest[],
  csvFiles: readonly PreparedSimulationCsv[],
  dependencies: RuntimeSimulationSnapshotPreparationDependencies,
): readonly PreparedRuntimeSimulationSnapshot[] {
  const preparedCsvByTarget = new Map<string, PreparedSimulationCsv>();
  for (const csvFile of csvFiles) {
    if (preparedCsvByTarget.has(csvFile.targetPath)) {
      throw new Error(
        `[sync-runtime-snapshot] Duplicate prepared CSV ${csvFile.targetPath}`,
      );
    }
    preparedCsvByTarget.set(csvFile.targetPath, csvFile);
  }
  const manifestByFormatId = new Map<
    BattleFormatId,
    PreparedMovesetVariantManifest
  >();
  for (const manifest of manifests) {
    if (manifestByFormatId.has(manifest.formatId)) {
      throw new Error(
        `[sync-runtime-snapshot] Duplicate manifest for ${manifest.formatId}`,
      );
    }
    manifestByFormatId.set(manifest.formatId, manifest);
  }
  const supportedIds = new Set(getBattleFormats().map(({ id }) => id));
  for (const formatId of manifestByFormatId.keys()) {
    if (!supportedIds.has(formatId)) {
      throw new Error(
        `[sync-runtime-snapshot] Unsupported manifest format ${formatId}`,
      );
    }
  }
  return getBattleFormats().map((format) => {
    const manifest = manifestByFormatId.get(format.id);
    if (!manifest) {
      throw new Error(
        `[sync-runtime-snapshot] Missing manifest for ${format.id}`,
      );
    }
    const snapshot = buildSnapshot(manifest, preparedCsvByTarget, dependencies);
    return {
      formatId: format.id,
      targetPath: getRuntimeSimulationSnapshotPath(format),
      contents: serializeRuntimeSimulationSnapshot(snapshot),
    };
  });
}

/** Default filesystem reader for production snapshot preparation. */
export function readRuntimeSimulationSnapshotSource(filePath: string): string {
  return readFileSync(filePath, 'utf8');
}
