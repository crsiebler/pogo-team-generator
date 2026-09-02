import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import type { PreparedMovesetVariantManifest } from './movesetVariantManifest';
import { getBattleFormats } from '@/lib/data/battleFormats';
import {
  getMovesetVariantManifestPath,
  MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
  MOVESET_VARIANT_MEGA_LEVEL,
  serializeMovesetVariantManifest,
  type MovesetVariantManifest,
  type MovesetVariantManifestCandidate,
} from '@/lib/data/movesetVariantManifest';
import {
  RUNTIME_SIMULATION_ASSET_INDEX_PATH,
  parseRuntimeSimulationAssetIndexJson,
} from '@/lib/data/runtimeSimulationAssetIndex';
import {
  prepareRuntimeSimulationAssetIndex,
  type PreparedRuntimeSimulationAssetIndex,
} from '@/lib/sync/runtimeSimulationAssetIndex';

function createCandidate(
  fastMove: string,
  isDefault: boolean,
  active: boolean,
): MovesetVariantManifestCandidate {
  const id = `${fastMove.toLowerCase()}--sludge_bomb--power_whip` as const;
  const prefix = isDefault ? 'bulbasaur' : `bulbasaur--${id}`;
  return {
    id,
    fastMove,
    chargedMove1: 'POWER_WHIP',
    chargedMove2: 'SLUDGE_BOMB',
    isDefault,
    evidence: {
      kind: isDefault ? 'preferred' : 'substitution',
      sourceCategories: ['overall'],
      sourceVariantIds: ['vine_whip--sludge_bomb--power_whip'],
    },
    acquisitionRequirements: {
      fastMove: { kind: 'regular' },
      chargedMove1: { kind: 'regular' },
      chargedMove2: { kind: 'regular' },
    },
    storageKeys: {
      '0-0': `${prefix}_0-0.csv`,
      '1-1': `${prefix}_1-1.csv`,
      '2-2': `${prefix}_2-2.csv`,
    },
    completeness: { '0-0': true, '1-1': true, '2-2': true },
    evaluationCounts: { '0-0': 100, '1-1': 100, '2-2': 100 },
    active,
  };
}

function createPreparedManifests(): readonly PreparedMovesetVariantManifest[] {
  return getBattleFormats().map((format) => {
    const defaultCandidate = createCandidate('VINE_WHIP', true, true);
    const candidates =
      format.id === 'great-league'
        ? [
            defaultCandidate,
            createCandidate('TACKLE', false, true),
            createCandidate('ZEN_HEADBUTT', false, false),
          ]
        : [defaultCandidate];
    const manifest: MovesetVariantManifest = {
      metadata: {
        schemaVersion: MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
        megaLevel: MOVESET_VARIANT_MEGA_LEVEL,
        policyVersion: 'ranking-evidence-v1',
        formatId: format.id,
        cup: format.cup,
        cp: format.cp,
        sourceDigests: [
          {
            key: 'fixture',
            algorithm: 'sha256',
            digest:
              '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef',
          },
        ],
        derivationSettings: {
          maxCandidatesPerSpecies: 8,
          maxActiveVariantsPerSpecies: 3,
          maxExpansionFastMoves: 2,
          maxExpansionChargedMoves: 4,
          requiredScenarios: ['0-0', '1-1', '2-2'],
          categoryWeights: {
            overall: 3,
            leads: 2,
            switches: 2,
            closers: 2,
            chargers: 1,
            attackers: 1,
            consistency: 1,
          },
        },
      },
      species: [
        {
          speciesId: 'bulbasaur',
          defaultVariantId: defaultCandidate.id,
          evidence: {
            pvpokeScorePrior: 90,
            retainedFastMoves: candidates.map(({ fastMove }) => fastMove),
            retainedChargedMoves: ['POWER_WHIP', 'SLUDGE_BOMB'],
            rejections: [],
          },
          candidates,
        },
      ],
    };
    return {
      formatId: format.id,
      targetPath: getMovesetVariantManifestPath(format),
      contents: serializeMovesetVariantManifest(manifest),
    };
  });
}

describe('runtime simulation asset index preparation', () => {
  it('includes every manifest and only active candidate scenario assets', () => {
    const prepared = prepareRuntimeSimulationAssetIndex(
      createPreparedManifests(),
    );
    const index = parseRuntimeSimulationAssetIndexJson(prepared.contents);

    expect(prepared.targetPath).toBe(RUNTIME_SIMULATION_ASSET_INDEX_PATH);
    expect(
      index.assets.filter((asset) => asset.endsWith('moveset-variants.json')),
    ).toHaveLength(getBattleFormats().length);
    expect(
      index.assets.filter((asset) =>
        asset.startsWith('data/simulations/cp1500/all/bulbasaur_'),
      ),
    ).toEqual([
      'data/simulations/cp1500/all/bulbasaur_0-0.csv',
      'data/simulations/cp1500/all/bulbasaur_1-1.csv',
      'data/simulations/cp1500/all/bulbasaur_2-2.csv',
    ]);
    expect(
      index.assets.filter((asset) =>
        asset.includes('bulbasaur--tackle--sludge_bomb--power_whip_'),
      ),
    ).toEqual([
      'data/simulations/cp1500/all/bulbasaur--tackle--sludge_bomb--power_whip_0-0.csv',
      'data/simulations/cp1500/all/bulbasaur--tackle--sludge_bomb--power_whip_1-1.csv',
      'data/simulations/cp1500/all/bulbasaur--tackle--sludge_bomb--power_whip_2-2.csv',
    ]);
    expect(
      index.assets.filter((asset) => asset.includes('zen_headbutt')),
    ).toEqual([]);
  });

  it('produces byte-identical output for shuffled manifests', () => {
    const manifests = createPreparedManifests();
    const before = structuredClone(manifests);
    const shuffled = [...manifests].reverse().map((manifest) => {
      const value = JSON.parse(manifest.contents) as {
        species: Array<{ candidates: unknown[] }>;
      };
      value.species.reverse();
      value.species.forEach((species) => species.candidates.reverse());
      return { ...manifest, contents: JSON.stringify(value) };
    });

    expect(prepareRuntimeSimulationAssetIndex(shuffled).contents).toBe(
      prepareRuntimeSimulationAssetIndex(manifests).contents,
    );
    expect(manifests).toEqual(before);
  });

  it('rejects missing, duplicate, and mismatched prepared manifests', () => {
    const manifests = createPreparedManifests();
    const first = manifests[0]!;
    const missing = manifests.slice(1);
    const duplicate = [...manifests, first];
    const mismatched = [
      { ...first, targetPath: 'data/simulations/cp1500/all/other.json' },
      ...manifests.slice(1),
    ];
    const contentMismatch = [
      { ...first, contents: manifests[1]!.contents },
      ...manifests.slice(1),
    ];
    const malformed = [{ ...first, contents: '{' }, ...manifests.slice(1)];

    expect(() => prepareRuntimeSimulationAssetIndex(missing)).toThrow(
      /missing manifest/i,
    );
    expect(() => prepareRuntimeSimulationAssetIndex(duplicate)).toThrow(
      /duplicate manifest/i,
    );
    expect(() => prepareRuntimeSimulationAssetIndex(mismatched)).toThrow(
      /target must match/i,
    );
    expect(() => prepareRuntimeSimulationAssetIndex(contentMismatch)).toThrow(
      /contents must match/i,
    );
    expect(() => prepareRuntimeSimulationAssetIndex(malformed)).toThrow(
      /valid JSON/i,
    );
  });

  it('returns a fixed prepared publication target', () => {
    const prepared: PreparedRuntimeSimulationAssetIndex =
      prepareRuntimeSimulationAssetIndex(createPreparedManifests());

    expect(prepared).toEqual(
      expect.objectContaining({
        targetPath: 'data/simulations/runtime-asset-index.json',
        contents: expect.stringMatching(/"schemaVersion": 1/),
      }),
    );
  });

  it('keeps the checked-in index synchronized with every checked-in manifest', () => {
    const manifests = getBattleFormats().map((format) => ({
      formatId: format.id,
      targetPath: getMovesetVariantManifestPath(format),
      contents: readFileSync(getMovesetVariantManifestPath(format), 'utf8'),
    }));
    const expected = prepareRuntimeSimulationAssetIndex(manifests);

    expect(readFileSync(expected.targetPath, 'utf8')).toBe(expected.contents);
  });
});
