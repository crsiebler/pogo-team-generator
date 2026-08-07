import { describe, expect, it } from 'vitest';
import { getBattleFormatById } from './battleFormats';
import {
  RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
  RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
  createRuntimeSimulationSnapshotActiveRatingsDigest,
  decodeRuntimeSimulationSnapshotRatings,
  getRuntimeSimulationSnapshotPath,
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
  const encodedRatings = Buffer.from(ratings.buffer).toString('base64');
  return {
    schemaVersion: RUNTIME_SIMULATION_SNAPSHOT_SCHEMA_VERSION,
    format: { id: 'great-league', cup: 'all', cp: 1500 },
    manifest: {
      schemaVersion: 1,
      policyVersion: 'ranking-evidence-v1',
      digest,
      sourceDigests: [{ key: 'fixture', algorithm: 'sha256', digest }],
    },
    activeRatingsDigest: createRuntimeSimulationSnapshotActiveRatingsDigest({
      dictionaries,
      variants,
      ratings: encodedRatings,
    }),
    encoding: {
      kind: 'uint16-le-base64',
      widthBytes: 2,
      byteOrder: 'little-endian',
      minimum: 0,
      maximum: 1000,
      missing: RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
      scenarios: ['0-0', '1-1', '2-2'],
      layout: 'variant-opponent-scenario',
    },
    dictionaries,
    variants,
    defaultVariantBySpecies: [0],
    shape: [1, 2, 3],
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

  it('derives one fixed snapshot path from the battle-format catalog', () => {
    const format = getBattleFormatById('great-league');
    expect(format).toBeDefined();
    expect(getRuntimeSimulationSnapshotPath(format!)).toBe(
      'data/simulations/cp1500/all/runtime-snapshot.json',
    );
  });
});
