import { createHash } from 'crypto';
import { normalizeMoveId, normalizeToChoosableSpeciesId } from './aliases';
import {
  getBattleFormatById,
  type BattleFormat,
  type BattleFormatId,
} from './battleFormats';
import {
  MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
  MOVESET_VARIANT_SCENARIOS,
  type MovesetVariantSourceDigest,
} from './movesetVariantManifest';
import { getMovesetVariantId } from './movesetVariants';
import type { MovesetVariantId } from '@/lib/types';

/** Current repository-owned compact simulation snapshot schema version. */
export const RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION = 2 as const;

/** Sentinel used when an explicit variant/opponent/scenario row is unavailable. */
export const RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING = 0xffff;

/** Minimum Battle Rating accepted by the compact snapshot encoding. */
export const RUNTIME_SIMULATION_SNAPSHOT_MIN_RATING = 0;

/** Maximum Battle Rating accepted by the compact snapshot encoding. */
export const RUNTIME_SIMULATION_SNAPSHOT_MAX_RATING = 1000;

/** Maximum decoded ratings payload accepted for one format snapshot. */
export const RUNTIME_SIMULATION_SNAPSHOT_MAX_RATING_BYTES = 50 * 1024 * 1024;

/** Maximum serialized snapshot bytes accepted before JSON parsing. */
export const RUNTIME_SIMULATION_SNAPSHOT_MAX_JSON_BYTES = 64 * 1024 * 1024;

/** Return the repository-relative compact snapshot path for one format. */
export function getRuntimeSimulationSnapshotPath(format: BattleFormat): string {
  return `data/simulations/cp${format.cp}/${format.cup}/runtime-snapshot.json`;
}

/** Manifest identity retained by one compact runtime simulation snapshot. */
export interface RuntimeSimulationSnapshotManifestIdentity {
  readonly schemaVersion: typeof MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION;
  readonly policyVersion: string;
  readonly digest: string;
  readonly sourceDigests: readonly MovesetVariantSourceDigest[];
}

/** Self-describing fixed-width Battle Rating encoding contract. */
export interface RuntimeSimulationSnapshotEncoding {
  readonly kind: 'uint16-le-base64';
  readonly widthBytes: 2;
  readonly byteOrder: 'little-endian';
  readonly minimum: typeof RUNTIME_SIMULATION_SNAPSHOT_MIN_RATING;
  readonly maximum: typeof RUNTIME_SIMULATION_SNAPSHOT_MAX_RATING;
  readonly missing: typeof RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING;
  readonly scenarios: typeof MOVESET_VARIANT_SCENARIOS;
  readonly layout: 'variant-opponent-scenario';
}

/** Canonical string dictionaries referenced by compact snapshot indexes. */
export interface RuntimeSimulationSnapshotDictionaries {
  readonly species: readonly string[];
  readonly opponents: readonly string[];
  readonly moves: readonly string[];
  readonly variantIds: readonly MovesetVariantId[];
}

/**
 * Indexed active moveset tuple: species, variant id, fast move, charged move 1,
 * and charged move 2.
 */
export type RuntimeSimulationSnapshotVariant = readonly [
  speciesIndex: number,
  variantIdIndex: number,
  fastMoveIndex: number,
  chargedMove1Index: number,
  chargedMove2Index: number,
];

/** Versioned compact active simulation data for one supported format. */
export interface RuntimeSimulationSnapshot {
  readonly schemaVersion: typeof RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION;
  readonly format: Readonly<{
    id: BattleFormatId;
    cup: BattleFormat['cup'];
    cp: BattleFormat['cp'];
  }>;
  readonly manifest: RuntimeSimulationSnapshotManifestIdentity;
  readonly activeRatingsDigest: string;
  readonly encoding: RuntimeSimulationSnapshotEncoding;
  readonly dictionaries: RuntimeSimulationSnapshotDictionaries;
  readonly variants: readonly RuntimeSimulationSnapshotVariant[];
  readonly defaultVariantBySpecies: readonly number[];
  readonly opponentIterationOrderBySpecies: readonly (readonly number[])[];
  readonly shape: readonly [
    variantCount: number,
    opponentCount: number,
    scenarioCount: 3,
  ];
  readonly ratings: string;
}

/** Inputs whose canonical bytes define active compact-rating identity. */
export type RuntimeSimulationSnapshotActiveRatingsIdentity = Pick<
  RuntimeSimulationSnapshot,
  | 'schemaVersion'
  | 'format'
  | 'manifest'
  | 'encoding'
  | 'dictionaries'
  | 'variants'
  | 'defaultVariantBySpecies'
  | 'opponentIterationOrderBySpecies'
  | 'shape'
  | 'ratings'
>;

/** Typed failure raised for malformed compact simulation snapshot data. */
export class RuntimeSimulationSnapshotValidationError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'RuntimeSimulationSnapshotValidationError';
  }
}

const canonicalSpeciesIdPattern = /^[a-z0-9]+(?:_[a-z0-9]+)*$/;
const canonicalMoveIdPattern = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;
const canonicalVariantIdPattern =
  /^[a-z0-9]+(?:_[a-z0-9]+)*(?:--[a-z0-9]+(?:_[a-z0-9]+)*){2}$/;
const sha256Pattern = /^[a-f0-9]{64}$/;
const maxDictionaryEntries = 10_000;
const maxVariants = 5_000;

function fail(path: string, message: string): never {
  throw new RuntimeSimulationSnapshotValidationError(path, message);
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'must be an object');
  }
  return value as Record<string, unknown>;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value) {
    fail(path, 'must be a non-empty string');
  }
  return value;
}

function readInteger(value: unknown, path: string): number {
  if (!Number.isSafeInteger(value) || Number(value) < 0) {
    fail(path, 'must be a non-negative safe integer');
  }
  return Number(value);
}

function readDigest(value: unknown, path: string): string {
  const digest = readString(value, path);
  if (!sha256Pattern.test(digest)) {
    fail(path, 'must be a lowercase SHA-256 digest');
  }
  return digest;
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

/** Create the canonical SHA-256 identity for active snapshot rating bytes. */
export function createRuntimeSimulationSnapshotActiveRatingsDigest(
  identity: RuntimeSimulationSnapshotActiveRatingsIdentity,
): string {
  return createHash('sha256')
    .update(
      JSON.stringify({
        schemaVersion: identity.schemaVersion,
        format: identity.format,
        manifest: identity.manifest,
        encoding: identity.encoding,
        dictionaries: identity.dictionaries,
        variants: identity.variants,
        defaultVariantBySpecies: identity.defaultVariantBySpecies,
        opponentIterationOrderBySpecies:
          identity.opponentIterationOrderBySpecies,
        shape: identity.shape,
        ratings: identity.ratings,
      }),
    )
    .digest('hex');
}

function readSortedUniqueStrings(
  value: unknown,
  path: string,
  pattern: RegExp,
  description: string,
): string[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(path, 'must be a non-empty array');
  }
  if (value.length > maxDictionaryEntries) {
    fail(path, `must contain at most ${maxDictionaryEntries} values`);
  }
  const entries = value.map((entry, index) => {
    const parsed = readString(entry, `${path}[${index}]`);
    if (!pattern.test(parsed)) {
      fail(`${path}[${index}]`, `must be ${description}`);
    }
    return parsed;
  });
  for (let index = 1; index < entries.length; index += 1) {
    if (compareAscii(entries[index - 1]!, entries[index]!) >= 0) {
      fail(path, 'must contain unique values in ASCII order');
    }
  }
  return entries;
}

function readSourceDigests(
  value: unknown,
  path: string,
): MovesetVariantSourceDigest[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail(path, 'must be a non-empty array');
  }
  const keys = new Set<string>();
  const entries = value.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = readRecord(entry, entryPath);
    const key = readString(record.key, `${entryPath}.key`);
    if (keys.has(key)) {
      fail(entryPath, `duplicate source key ${key}`);
    }
    keys.add(key);
    if (record.algorithm !== 'sha256') {
      fail(`${entryPath}.algorithm`, 'must be sha256');
    }
    return {
      key,
      algorithm: 'sha256' as const,
      digest: readDigest(record.digest, `${entryPath}.digest`),
    };
  });
  for (let index = 1; index < entries.length; index += 1) {
    if (compareAscii(entries[index - 1]!.key, entries[index]!.key) >= 0) {
      fail(path, 'must be in ASCII key order');
    }
  }
  return entries;
}

function readFormat(value: unknown): RuntimeSimulationSnapshot['format'] {
  const record = readRecord(value, 'snapshot.format');
  const id = readString(record.id, 'snapshot.format.id');
  const format = getBattleFormatById(id);
  if (!format || record.cup !== format.cup || record.cp !== format.cp) {
    fail('snapshot.format', 'must match a supported battle format');
  }
  return { id: format.id, cup: format.cup, cp: format.cp };
}

function readManifestIdentity(
  value: unknown,
): RuntimeSimulationSnapshotManifestIdentity {
  const record = readRecord(value, 'snapshot.manifest');
  if (record.schemaVersion !== MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION) {
    fail(
      'snapshot.manifest.schemaVersion',
      `must be ${MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION}`,
    );
  }
  return {
    schemaVersion: MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
    policyVersion: readString(
      record.policyVersion,
      'snapshot.manifest.policyVersion',
    ),
    digest: readDigest(record.digest, 'snapshot.manifest.digest'),
    sourceDigests: readSourceDigests(
      record.sourceDigests,
      'snapshot.manifest.sourceDigests',
    ),
  };
}

function readEncoding(value: unknown): RuntimeSimulationSnapshotEncoding {
  const record = readRecord(value, 'snapshot.encoding');
  const expected: RuntimeSimulationSnapshotEncoding = {
    kind: 'uint16-le-base64',
    widthBytes: 2,
    byteOrder: 'little-endian',
    minimum: RUNTIME_SIMULATION_SNAPSHOT_MIN_RATING,
    maximum: RUNTIME_SIMULATION_SNAPSHOT_MAX_RATING,
    missing: RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
    scenarios: MOVESET_VARIANT_SCENARIOS,
    layout: 'variant-opponent-scenario',
  };
  if (
    record.kind !== expected.kind ||
    record.widthBytes !== expected.widthBytes ||
    record.byteOrder !== expected.byteOrder ||
    record.minimum !== expected.minimum ||
    record.maximum !== expected.maximum ||
    record.missing !== expected.missing ||
    record.layout !== expected.layout ||
    !Array.isArray(record.scenarios) ||
    record.scenarios.length !== expected.scenarios.length ||
    record.scenarios.some(
      (scenario, index) => scenario !== expected.scenarios[index],
    )
  ) {
    fail('snapshot.encoding', 'must match the uint16 snapshot contract');
  }
  return expected;
}

function readDictionaries(
  value: unknown,
): RuntimeSimulationSnapshotDictionaries {
  const record = readRecord(value, 'snapshot.dictionaries');
  const species = readSortedUniqueStrings(
    record.species,
    'snapshot.dictionaries.species',
    canonicalSpeciesIdPattern,
    'a canonical species id',
  );
  const opponents = readSortedUniqueStrings(
    record.opponents,
    'snapshot.dictionaries.opponents',
    canonicalSpeciesIdPattern,
    'a canonical species id',
  );
  [...species, ...opponents].forEach((speciesId) => {
    if (normalizeToChoosableSpeciesId(speciesId) !== speciesId) {
      fail(
        'snapshot.dictionaries',
        `${speciesId} must be a canonical species id`,
      );
    }
  });
  const moves = readSortedUniqueStrings(
    record.moves,
    'snapshot.dictionaries.moves',
    canonicalMoveIdPattern,
    'a canonical move id',
  );
  moves.forEach((moveId) => {
    if (normalizeMoveId(moveId) !== moveId) {
      fail('snapshot.dictionaries.moves', `${moveId} must be canonical`);
    }
  });
  const variantIds = readSortedUniqueStrings(
    record.variantIds,
    'snapshot.dictionaries.variantIds',
    canonicalVariantIdPattern,
    'a canonical variant id',
  ) as MovesetVariantId[];
  return {
    species,
    opponents,
    moves,
    variantIds,
  };
}

function readBoundedIndex(value: unknown, path: string, bound: number): number {
  const index = readInteger(value, path);
  if (index >= bound) {
    fail(path, `must be less than ${bound}`);
  }
  return index;
}

function readVariants(
  value: unknown,
  dictionaries: RuntimeSimulationSnapshotDictionaries,
): RuntimeSimulationSnapshotVariant[] {
  if (!Array.isArray(value) || value.length === 0) {
    fail('snapshot.variants', 'must be a non-empty array');
  }
  if (value.length > maxVariants) {
    fail('snapshot.variants', `must contain at most ${maxVariants} variants`);
  }
  const keys = new Set<string>();
  let previousSpeciesId: string | undefined;
  let previousVariantId: string | undefined;
  return value.map((entry, index) => {
    const path = `snapshot.variants[${index}]`;
    if (!Array.isArray(entry) || entry.length !== 5) {
      fail(path, 'must contain exactly five indexes');
    }
    const variant: RuntimeSimulationSnapshotVariant = [
      readBoundedIndex(entry[0], `${path}[0]`, dictionaries.species.length),
      readBoundedIndex(entry[1], `${path}[1]`, dictionaries.variantIds.length),
      readBoundedIndex(entry[2], `${path}[2]`, dictionaries.moves.length),
      readBoundedIndex(entry[3], `${path}[3]`, dictionaries.moves.length),
      readBoundedIndex(entry[4], `${path}[4]`, dictionaries.moves.length),
    ];
    const speciesId = dictionaries.species[variant[0]]!;
    const variantId = dictionaries.variantIds[variant[1]]!;
    const key = `${speciesId}|${variantId}`;
    const outOfOrder =
      previousSpeciesId !== undefined &&
      (compareAscii(previousSpeciesId, speciesId) > 0 ||
        (previousSpeciesId === speciesId &&
          compareAscii(previousVariantId!, variantId) >= 0));
    if (keys.has(key) || outOfOrder) {
      fail('snapshot.variants', 'must be unique and in ASCII identity order');
    }
    keys.add(key);
    previousSpeciesId = speciesId;
    previousVariantId = variantId;
    const identity = getMovesetVariantId({
      fastMove: dictionaries.moves[variant[2]]!,
      chargedMove1: dictionaries.moves[variant[3]]!,
      chargedMove2: dictionaries.moves[variant[4]]!,
    });
    if (identity !== dictionaries.variantIds[variant[1]]) {
      fail(path, 'move indexes must match the variant identity');
    }
    return variant;
  });
}

function readDefaults(
  value: unknown,
  speciesCount: number,
  variants: readonly RuntimeSimulationSnapshotVariant[],
): number[] {
  if (!Array.isArray(value) || value.length !== speciesCount) {
    fail(
      'snapshot.defaultVariantBySpecies',
      'must contain one variant index per species',
    );
  }
  return value.map((entry, speciesIndex) => {
    const path = `snapshot.defaultVariantBySpecies[${speciesIndex}]`;
    const variantIndex = readBoundedIndex(entry, path, variants.length);
    if (variants[variantIndex]![0] !== speciesIndex) {
      fail(path, 'must reference a variant for the same species');
    }
    return variantIndex;
  });
}

function readOpponentIterationOrderBySpecies(
  value: unknown,
  speciesCount: number,
  opponentCount: number,
): number[][] {
  if (!Array.isArray(value) || value.length !== speciesCount) {
    fail(
      'snapshot.opponentIterationOrderBySpecies',
      'must contain one order per species',
    );
  }
  return value.map((order, speciesIndex) => {
    const path = `snapshot.opponentIterationOrderBySpecies[${speciesIndex}]`;
    if (!Array.isArray(order) || order.length > opponentCount) {
      fail(path, 'must be an opponent index array');
    }
    const indexes = order.map((entry, index) =>
      readBoundedIndex(entry, `${path}[${index}]`, opponentCount),
    );
    if (new Set(indexes).size !== indexes.length) {
      fail(path, 'must contain unique opponent indexes');
    }
    return indexes;
  });
}

function validateOpponentIterationOrderPresence(
  orders: readonly (readonly number[])[],
  defaults: readonly number[],
  ratings: string,
  opponentCount: number,
): void {
  const bytes = Buffer.from(ratings, 'base64');
  orders.forEach((order, speciesIndex) => {
    const orderedIndexes = new Set(order);
    const defaultVariantIndex = defaults[speciesIndex]!;
    for (
      let opponentIndex = 0;
      opponentIndex < opponentCount;
      opponentIndex += 1
    ) {
      const offset = (defaultVariantIndex * opponentCount + opponentIndex) * 6;
      const present =
        bytes.readUInt16LE(offset) !==
        RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING;
      if (orderedIndexes.has(opponentIndex) !== present) {
        fail(
          `snapshot.opponentIterationOrderBySpecies[${speciesIndex}]`,
          'must contain exactly the default variant opponents',
        );
      }
    }
  });
}

function readShape(
  value: unknown,
  variantCount: number,
  opponentCount: number,
): RuntimeSimulationSnapshot['shape'] {
  if (
    !Array.isArray(value) ||
    value.length !== 3 ||
    value[0] !== variantCount ||
    value[1] !== opponentCount ||
    value[2] !== MOVESET_VARIANT_SCENARIOS.length
  ) {
    fail(
      'snapshot.shape',
      'must match variant, opponent, and scenario dictionary dimensions',
    );
  }
  return [variantCount, opponentCount, 3];
}

function readRatings(value: unknown, expectedValues: number): string {
  const ratings = readString(value, 'snapshot.ratings');
  const expectedBytes = expectedValues * 2;
  if (!Number.isSafeInteger(expectedBytes)) {
    fail('snapshot.shape', 'rating dimensions exceed safe integer bounds');
  }
  if (expectedBytes > RUNTIME_SIMULATION_SNAPSHOT_MAX_RATING_BYTES) {
    fail(
      'snapshot.shape',
      `decoded ratings must not exceed ${RUNTIME_SIMULATION_SNAPSHOT_MAX_RATING_BYTES} bytes`,
    );
  }
  const expectedBase64Length = Math.ceil(expectedBytes / 3) * 4;
  if (ratings.length !== expectedBase64Length) {
    fail('snapshot.ratings', 'encoded length must match snapshot shape');
  }
  const bytes = Buffer.from(ratings, 'base64');
  if (bytes.toString('base64') !== ratings) {
    fail('snapshot.ratings', 'must use canonical padded base64');
  }
  if (bytes.length !== expectedBytes) {
    fail('snapshot.ratings', 'decoded byte length must match snapshot shape');
  }
  for (let offset = 0; offset < bytes.length; offset += 2) {
    const rating = bytes.readUInt16LE(offset);
    if (
      rating > RUNTIME_SIMULATION_SNAPSHOT_MAX_RATING &&
      rating !== RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING
    ) {
      fail(
        `snapshot.ratings[${offset / 2}]`,
        'rating is in the reserved range',
      );
    }
  }
  return ratings;
}

/** Parse and validate an unknown compact runtime simulation snapshot. */
export function parseRuntimeSimulationSnapshot(
  value: unknown,
): RuntimeSimulationSnapshot {
  const record = readRecord(value, 'snapshot');
  if (record.schemaVersion !== RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION) {
    fail(
      'snapshot.schemaVersion',
      `must be ${RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION}`,
    );
  }
  const format = readFormat(record.format);
  const manifest = readManifestIdentity(record.manifest);
  const encoding = readEncoding(record.encoding);
  const dictionaries = readDictionaries(record.dictionaries);
  const variants = readVariants(record.variants, dictionaries);
  const defaultVariantBySpecies = readDefaults(
    record.defaultVariantBySpecies,
    dictionaries.species.length,
    variants,
  );
  const opponentIterationOrderBySpecies = readOpponentIterationOrderBySpecies(
    record.opponentIterationOrderBySpecies,
    dictionaries.species.length,
    dictionaries.opponents.length,
  );
  const shape = readShape(
    record.shape,
    variants.length,
    dictionaries.opponents.length,
  );
  const ratings = readRatings(record.ratings, shape[0] * shape[1] * shape[2]);
  validateOpponentIterationOrderPresence(
    opponentIterationOrderBySpecies,
    defaultVariantBySpecies,
    ratings,
    dictionaries.opponents.length,
  );
  const activeRatingsDigest = readDigest(
    record.activeRatingsDigest,
    'snapshot.activeRatingsDigest',
  );
  if (
    activeRatingsDigest !==
    createRuntimeSimulationSnapshotActiveRatingsDigest({
      schemaVersion: RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
      format,
      manifest,
      encoding,
      dictionaries,
      variants,
      defaultVariantBySpecies,
      opponentIterationOrderBySpecies,
      shape,
      ratings,
    })
  ) {
    fail(
      'snapshot.activeRatingsDigest',
      'must match the canonical active rating payload',
    );
  }
  return {
    schemaVersion: RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
    format,
    manifest,
    activeRatingsDigest,
    encoding,
    dictionaries,
    variants,
    defaultVariantBySpecies,
    opponentIterationOrderBySpecies,
    shape,
    ratings,
  };
}

/** Parse and validate serialized compact runtime simulation snapshot JSON. */
export function parseRuntimeSimulationSnapshotJson(
  json: string,
): RuntimeSimulationSnapshot {
  if (Buffer.byteLength(json) > RUNTIME_SIMULATION_SNAPSHOT_MAX_JSON_BYTES) {
    throw new RuntimeSimulationSnapshotValidationError(
      'snapshot',
      `must not exceed ${RUNTIME_SIMULATION_SNAPSHOT_MAX_JSON_BYTES} bytes`,
    );
  }
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch (error) {
    throw new RuntimeSimulationSnapshotValidationError(
      'snapshot',
      `must be valid JSON: ${error instanceof Error ? error.message : 'unknown parse error'}`,
    );
  }
  return parseRuntimeSimulationSnapshot(value);
}

/** Validate and deterministically serialize a compact simulation snapshot. */
export function serializeRuntimeSimulationSnapshot(
  snapshot: RuntimeSimulationSnapshot,
): string {
  return `${JSON.stringify(parseRuntimeSimulationSnapshot(snapshot))}\n`;
}

/** Decode validated little-endian snapshot ratings into host-order values. */
export function decodeRuntimeSimulationSnapshotRatings(
  snapshot: RuntimeSimulationSnapshot,
): Uint16Array {
  const parsed = parseRuntimeSimulationSnapshot(snapshot);
  const bytes = Buffer.from(parsed.ratings, 'base64');
  const ratings = new Uint16Array(bytes.length / 2);
  for (let index = 0; index < ratings.length; index += 1) {
    ratings[index] = bytes.readUInt16LE(index * 2);
  }
  return ratings;
}
