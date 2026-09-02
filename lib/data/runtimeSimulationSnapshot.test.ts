import { describe, expect, it } from 'vitest';
import { getBattleFormatById } from './battleFormats';
import { MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION } from './movesetVariantManifest';
import {
  RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
  RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
  createRuntimeSimulationSnapshotActiveRatingsDigest,
  decodeRuntimeSimulationSnapshotRatings,
  getRuntimeSimulationSnapshotPath,
  parseRuntimeSimulationSnapshot,
  parseRuntimeSimulationSnapshotJson,
  serializeRuntimeSimulationSnapshot,
  type RuntimeSimulationSnapshot,
} from './runtimeSimulationSnapshot';

const digest =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

function createSnapshot(): RuntimeSimulationSnapshot {
  const ratings = new Uint16Array([
    0,
    500,
    1000,
    RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
    400,
    600,
  ]);
  const dictionaries = {
    species: ['bulbasaur'],
    opponents: ['ivysaur', 'venusaur'],
    moves: ['POWER_WHIP', 'SLUDGE_BOMB', 'VINE_WHIP'],
    variantIds: ['vine_whip--sludge_bomb--power_whip'] as const,
  };
  const variants = [[0, 0, 2, 0, 1]] as const;
  const format = { id: 'great-league', cup: 'all', cp: 1500 } as const;
  const manifest = {
    schemaVersion: MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
    megaLevel: 4 as const,
    policyVersion: 'ranking-evidence-v1',
    digest,
    sourceDigests: [{ key: 'fixture', algorithm: 'sha256' as const, digest }],
  };
  const defaultVariantBySpecies = [0] as const;
  const additionalChargedMoveBySpecies = [null] as const;
  const opponentIterationOrderBySpecies = [[0]] as const;
  const encoding = {
    kind: 'uint16-le-base64',
    widthBytes: 2,
    byteOrder: 'little-endian',
    minimum: 0,
    maximum: 1000,
    missing: RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
    scenarios: ['0-0', '1-1', '2-2'],
    layout: 'variant-opponent-scenario',
  } as const;
  const shape = [1, 2, 3] as const;
  const encodedRatings = Buffer.from(ratings.buffer).toString('base64');
  return {
    schemaVersion: RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
    format,
    manifest,
    activeRatingsDigest: createRuntimeSimulationSnapshotActiveRatingsDigest({
      schemaVersion: RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
      format,
      manifest,
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

describe('runtime simulation snapshot contract', () => {
  it('round-trips fixed-width ratings including the missing sentinel', () => {
    const serialized = serializeRuntimeSimulationSnapshot(createSnapshot());
    const parsed = parseRuntimeSimulationSnapshotJson(serialized);

    expect(serialized).toBe(serializeRuntimeSimulationSnapshot(parsed));
    expect([...decodeRuntimeSimulationSnapshotRatings(parsed)]).toEqual([
      0,
      500,
      1000,
      RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
      400,
      600,
    ]);
  });

  it('rejects reserved ratings, malformed dimensions, and invalid defaults', () => {
    const reservedRating = createSnapshot();
    const bytes = Buffer.from(reservedRating.ratings, 'base64');
    bytes.writeUInt16LE(1001, 0);

    expect(() =>
      parseRuntimeSimulationSnapshotJson(
        JSON.stringify({
          ...reservedRating,
          ratings: bytes.toString('base64'),
        }),
      ),
    ).toThrow(/rating.*reserved/i);
    const changedRating = createSnapshot();
    const changedBytes = Buffer.from(changedRating.ratings, 'base64');
    changedBytes.writeUInt16LE(501, 0);
    expect(() =>
      parseRuntimeSimulationSnapshotJson(
        JSON.stringify({
          ...changedRating,
          ratings: changedBytes.toString('base64'),
        }),
      ),
    ).toThrow(/activeRatingsDigest/i);
    expect(() =>
      parseRuntimeSimulationSnapshotJson(
        JSON.stringify({ ...createSnapshot(), shape: [1, 3, 2] }),
      ),
    ).toThrow(/shape/i);
    expect(() =>
      parseRuntimeSimulationSnapshotJson(
        JSON.stringify({
          ...createSnapshot(),
          defaultVariantBySpecies: [1],
        }),
      ),
    ).toThrow(/defaultVariantBySpecies/i);
    expect(() =>
      parseRuntimeSimulationSnapshotJson(
        JSON.stringify({
          ...createSnapshot(),
          dictionaries: {
            ...createSnapshot().dictionaries,
            opponents: ['aegislash_blade', 'venusaur'],
          },
        }),
      ),
    ).toThrow(/canonical species id/i);
  });

  it('binds the schema and encoding contract into active rating identity', () => {
    const snapshot = createSnapshot();
    const changedEncoding = {
      ...snapshot,
      encoding: { ...snapshot.encoding, layout: 'scenario-variant-opponent' },
    } as unknown as RuntimeSimulationSnapshot;
    const changedSchema = {
      ...snapshot,
      schemaVersion: 4,
    } as unknown as RuntimeSimulationSnapshot;

    expect(
      createRuntimeSimulationSnapshotActiveRatingsDigest(changedEncoding),
    ).not.toBe(snapshot.activeRatingsDigest);
    expect(
      createRuntimeSimulationSnapshotActiveRatingsDigest(changedSchema),
    ).not.toBe(snapshot.activeRatingsDigest);
  });

  it('binds additional-move metadata into active rating identity', () => {
    const snapshot = createSnapshot();
    const dictionaries = {
      ...snapshot.dictionaries,
      moves: [...snapshot.dictionaries.moves, 'MEGA_PLUS'].sort(),
    };
    const withAdditional = {
      ...snapshot,
      dictionaries,
      additionalChargedMoveBySpecies: [dictionaries.moves.indexOf('MEGA_PLUS')],
    } as unknown as RuntimeSimulationSnapshot;

    expect(
      createRuntimeSimulationSnapshotActiveRatingsDigest(withAdditional),
    ).not.toBe(snapshot.activeRatingsDigest);
  });

  it('rejects missing, invalid, and selectable additional-move references', () => {
    const snapshot = createSnapshot();
    expect(() =>
      parseRuntimeSimulationSnapshotJson(
        JSON.stringify({ ...snapshot, additionalChargedMoveBySpecies: [] }),
      ),
    ).toThrow(/additionalChargedMoveBySpecies/i);

    const invalidReference = {
      ...snapshot,
      additionalChargedMoveBySpecies: [99],
    } as unknown as RuntimeSimulationSnapshot;
    expect(() => parseRuntimeSimulationSnapshot(invalidReference)).toThrow(
      /additionalChargedMoveBySpecies/i,
    );

    const selectableReference = {
      ...snapshot,
      additionalChargedMoveBySpecies: [0],
    } as unknown as RuntimeSimulationSnapshot;
    expect(() => parseRuntimeSimulationSnapshot(selectableReference)).toThrow(
      /selectable charged moves/i,
    );
  });

  it('derives one fixed snapshot path from the battle-format catalog', () => {
    const format = getBattleFormatById('great-league');
    expect(format).toBeDefined();
    expect(getRuntimeSimulationSnapshotPath(format!)).toBe(
      'data/simulations/cp1500/all/runtime-snapshot.json',
    );
  });
});
