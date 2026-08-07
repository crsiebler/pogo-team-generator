import { readFileSync } from 'fs';
import { describe, expect, it } from 'vitest';
import { getBattleFormats } from '@/lib/data/battleFormats';
import {
  getMovesetVariantManifestPath,
  MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
  serializeMovesetVariantManifest,
  type MovesetVariantManifest,
  type MovesetVariantManifestCandidate,
} from '@/lib/data/movesetVariantManifest';
import {
  decodeRuntimeSimulationSnapshotRatings,
  parseRuntimeSimulationSnapshotJson,
  RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
} from '@/lib/data/runtimeSimulationSnapshot';
import type { PreparedMovesetVariantManifest } from '@/lib/sync/movesetVariantManifest';
import {
  createRuntimeSimulationSnapshotOpponentResolver,
  prepareRuntimeSimulationSnapshots,
  type RuntimeSimulationSnapshotPreparationDependencies,
} from '@/lib/sync/runtimeSimulationSnapshots';
import type { PreparedSimulationCsv } from '@/lib/sync/simulations';
import type { PokemonData } from '@/lib/sync/types';

const sourceDigest =
  '0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef';

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
    evaluationCounts: { '0-0': 2, '1-1': 2, '2-2': 2 },
    active,
  };
}

function createPreparedInput(): {
  readonly manifests: readonly PreparedMovesetVariantManifest[];
  readonly csvFiles: readonly PreparedSimulationCsv[];
} {
  const csvFiles: PreparedSimulationCsv[] = [];
  const manifests = getBattleFormats().map((format) => {
    const defaultCandidate = createCandidate('VINE_WHIP', true, true);
    const activeAlternate = createCandidate('TACKLE', false, true);
    const inactiveAlternate = createCandidate('ZEN_HEADBUTT', false, false);
    const candidates =
      format.id === 'great-league'
        ? [defaultCandidate, activeAlternate, inactiveAlternate]
        : [defaultCandidate];
    const manifest: MovesetVariantManifest = {
      metadata: {
        schemaVersion: MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
        policyVersion: 'ranking-evidence-v1',
        formatId: format.id,
        cup: format.cup,
        cp: format.cp,
        sourceDigests: [
          { key: 'fixture', algorithm: 'sha256', digest: sourceDigest },
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
    const directory = `data/simulations/cp${format.cp}/${format.cup}`;
    for (const candidate of candidates.filter(({ active }) => active)) {
      for (const [scenarioIndex, scenario] of ['0-0', '1-1', '2-2'].entries()) {
        csvFiles.push({
          formatId: format.id,
          targetPath: `${directory}/${candidate.storageKeys[scenario as '0-0' | '1-1' | '2-2']}`,
          contents: [
            'Pokemon,Battle Rating,Energy Remaining,HP Remaining',
            `Venusaur VW+FP/SB,${500 + scenarioIndex},10,20`,
            `Ivysaur VW+PW/SB,${candidate.isDefault ? 400 : 600},11,21`,
          ].join('\n'),
        });
      }
    }
    return {
      formatId: format.id,
      targetPath: getMovesetVariantManifestPath(format),
      contents: serializeMovesetVariantManifest(manifest),
    };
  });
  return { manifests, csvFiles };
}

const dependencies: RuntimeSimulationSnapshotPreparationDependencies = {
  readText: () => {
    throw new Error('unexpected filesystem read');
  },
  resolveOpponentSpeciesId: (name) =>
    ({
      Charmander: 'charmander',
      Venusaur: 'venusaur',
      Ivysaur: 'ivysaur',
    })[name],
};

describe('runtime simulation snapshot preparation', () => {
  it('encodes active manifest CSV ratings with deterministic dictionaries', () => {
    const input = createPreparedInput();
    const snapshots = prepareRuntimeSimulationSnapshots(
      input.manifests,
      input.csvFiles,
      dependencies,
    );
    const greatLeague = snapshots.find(
      ({ formatId }) => formatId === 'great-league',
    );
    const snapshot = parseRuntimeSimulationSnapshotJson(
      greatLeague?.contents ?? '',
    );

    expect(snapshots).toHaveLength(getBattleFormats().length);
    expect(greatLeague?.targetPath).toBe(
      'data/simulations/cp1500/all/runtime-snapshot.json',
    );
    expect(snapshot.dictionaries).toEqual({
      species: ['bulbasaur'],
      opponents: ['ivysaur', 'venusaur'],
      moves: ['POWER_WHIP', 'SLUDGE_BOMB', 'TACKLE', 'VINE_WHIP'],
      variantIds: [
        'tackle--sludge_bomb--power_whip',
        'vine_whip--sludge_bomb--power_whip',
      ],
    });
    expect(snapshot.variants).toEqual([
      [0, 0, 2, 0, 1],
      [0, 1, 3, 0, 1],
    ]);
    expect(snapshot.defaultVariantBySpecies).toEqual([1]);
    expect([...decodeRuntimeSimulationSnapshotRatings(snapshot)]).toEqual([
      600, 600, 600, 500, 501, 502, 400, 400, 400, 500, 501, 502,
    ]);
    expect(snapshot.ratings).not.toContain(
      String(RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING),
    );
  });

  it('ignores inactive CSVs and produces byte-identical shuffled input', () => {
    const input = createPreparedInput();
    const inactiveRead = `${input.manifests[0]!.targetPath}/zen_headbutt`;
    const readText = (filePath: string): string => {
      if (filePath.includes(inactiveRead)) {
        throw new Error('inactive CSV was read');
      }
      return dependencies.readText(filePath);
    };

    const ordered = prepareRuntimeSimulationSnapshots(
      input.manifests,
      input.csvFiles,
      { ...dependencies, readText },
    );
    const reversedManifestContents = input.manifests.map((manifest) => {
      const value = JSON.parse(manifest.contents) as {
        species: Array<{ candidates: unknown[] }>;
      };
      value.species.forEach(({ candidates }) => candidates.reverse());
      return { ...manifest, contents: JSON.stringify(value) };
    });
    const shuffled = prepareRuntimeSimulationSnapshots(
      reversedManifestContents.reverse(),
      [...input.csvFiles].reverse(),
      { ...dependencies, readText },
    );

    expect(shuffled).toEqual(ordered);
  });

  it('overlays prepared CSVs while reading reused resume files', () => {
    const input = createPreparedInput();
    const fallbackFile = input.csvFiles[0]!;
    const reads: string[] = [];
    const expected = prepareRuntimeSimulationSnapshots(
      input.manifests,
      input.csvFiles,
      dependencies,
    );

    const actual = prepareRuntimeSimulationSnapshots(
      input.manifests,
      input.csvFiles.slice(1),
      {
        ...dependencies,
        readText: (filePath) => {
          reads.push(filePath);
          if (filePath === fallbackFile.targetPath) {
            return fallbackFile.contents;
          }
          throw new Error(`prepared overlay was not used for ${filePath}`);
        },
      },
    );

    expect(actual).toEqual(expected);
    expect(reads).toEqual([fallbackFile.targetPath]);
  });

  it('encodes missing opponent rows without substituting a default rating', () => {
    const input = createPreparedInput();
    const charmanderId = 'ember--flamethrower--flame_charge' as const;
    const charmanderCandidate: MovesetVariantManifestCandidate = {
      id: charmanderId,
      fastMove: 'EMBER',
      chargedMove1: 'FLAME_CHARGE',
      chargedMove2: 'FLAMETHROWER',
      isDefault: true,
      evidence: {
        kind: 'preferred',
        sourceCategories: ['overall'],
        sourceVariantIds: [charmanderId],
      },
      acquisitionRequirements: {
        fastMove: { kind: 'regular' },
        chargedMove1: { kind: 'regular' },
        chargedMove2: { kind: 'regular' },
      },
      storageKeys: {
        '0-0': 'charmander_0-0.csv',
        '1-1': 'charmander_1-1.csv',
        '2-2': 'charmander_2-2.csv',
      },
      completeness: { '0-0': true, '1-1': true, '2-2': true },
      evaluationCounts: { '0-0': 1, '1-1': 1, '2-2': 1 },
      active: true,
    };
    const manifests = input.manifests.map((manifest) => {
      if (manifest.formatId !== 'great-league') {
        return manifest;
      }
      const value = JSON.parse(manifest.contents) as MovesetVariantManifest;
      return {
        ...manifest,
        contents: serializeMovesetVariantManifest({
          ...value,
          species: [
            ...value.species,
            {
              speciesId: 'charmander',
              defaultVariantId: charmanderId,
              evidence: {
                pvpokeScorePrior: 80,
                retainedFastMoves: ['EMBER'],
                retainedChargedMoves: ['FLAME_CHARGE', 'FLAMETHROWER'],
                rejections: [],
              },
              candidates: [charmanderCandidate],
            },
          ],
        }),
      };
    });
    const csvFiles = [
      ...input.csvFiles,
      ...(['0-0', '1-1', '2-2'] as const).map((scenario, index) => ({
        formatId: 'great-league' as const,
        targetPath: `data/simulations/cp1500/all/charmander_${scenario}.csv`,
        contents: [
          'Pokemon,Battle Rating,Energy Remaining,HP Remaining',
          `Venusaur VW+FP/SB,${700 + index},10,20`,
        ].join('\n'),
      })),
    ];
    const prepared = prepareRuntimeSimulationSnapshots(
      manifests,
      csvFiles,
      dependencies,
    ).find(({ formatId }) => formatId === 'great-league')!;
    const snapshot = parseRuntimeSimulationSnapshotJson(prepared.contents);
    const ratings = decodeRuntimeSimulationSnapshotRatings(snapshot);
    const charmanderSpeciesIndex =
      snapshot.dictionaries.species.indexOf('charmander');
    const charmanderVariantIndex = snapshot.variants.findIndex(
      ([speciesIndex]) => speciesIndex === charmanderSpeciesIndex,
    );
    const ivysaurIndex = snapshot.dictionaries.opponents.indexOf('ivysaur');
    const offset =
      (charmanderVariantIndex * snapshot.shape[1] + ivysaurIndex) * 3;

    expect(snapshot.defaultVariantBySpecies[charmanderSpeciesIndex]).toBe(
      charmanderVariantIndex,
    );
    expect([...ratings.slice(offset, offset + 3)]).toEqual([
      RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
      RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
      RUNTIME_SIMULATION_SNAPSHOT_MISSING_RATING,
    ]);
  });

  it('fails when an active CSV is missing or contains an invalid rating', () => {
    const input = createPreparedInput();
    const missing = input.csvFiles.slice(1);
    const malformed = input.csvFiles.map((file, index) =>
      index === 0
        ? { ...file, contents: file.contents.replace(',400,', ',1001,') }
        : file,
    );
    const mismatchedFormat = input.csvFiles.map((file, index) =>
      index === 0 ? { ...file, formatId: 'ultra-league' as const } : file,
    );

    expect(() =>
      prepareRuntimeSimulationSnapshots(input.manifests, missing, dependencies),
    ).toThrow(/unexpected filesystem read|missing/i);
    expect(() =>
      prepareRuntimeSimulationSnapshots(
        input.manifests,
        malformed,
        dependencies,
      ),
    ).toThrow(/battle rating/i);
    expect(() =>
      prepareRuntimeSimulationSnapshots(
        input.manifests,
        mismatchedFormat,
        dependencies,
      ),
    ).toThrow(/format/i);
  });

  it('validates alternate opponents when the manifest lists it first', () => {
    const input = createPreparedInput();
    const manifests = input.manifests.map((manifest) => {
      if (manifest.formatId !== 'great-league') {
        return manifest;
      }
      const value = JSON.parse(manifest.contents) as {
        species: Array<{ candidates: unknown[] }>;
      };
      value.species[0]!.candidates.reverse();
      return { ...manifest, contents: JSON.stringify(value) };
    });
    const csvFiles = input.csvFiles.map((file) =>
      file.targetPath.includes('bulbasaur--tackle')
        ? {
            ...file,
            contents: file.contents.replace(
              'Venusaur VW+FP/SB',
              'Charmander SC+F/BB',
            ),
          }
        : file,
    );

    expect(() =>
      prepareRuntimeSimulationSnapshots(manifests, csvFiles, dependencies),
    ).toThrow(/alternate opponents must match the default/i);
  });

  it('keeps every checked-in format snapshot synchronized with active CSVs', () => {
    const pokemonData = JSON.parse(
      readFileSync('data/pokemon.json', 'utf8'),
    ) as PokemonData[];
    const manifests = getBattleFormats().map((format) => ({
      formatId: format.id,
      targetPath: getMovesetVariantManifestPath(format),
      contents: readFileSync(getMovesetVariantManifestPath(format), 'utf8'),
    }));
    const snapshots = prepareRuntimeSimulationSnapshots(manifests, [], {
      readText: (filePath) => readFileSync(filePath, 'utf8'),
      resolveOpponentSpeciesId:
        createRuntimeSimulationSnapshotOpponentResolver(pokemonData),
    });

    for (const snapshot of snapshots) {
      expect(readFileSync(snapshot.targetPath, 'utf8')).toBe(snapshot.contents);
    }
  });
});
