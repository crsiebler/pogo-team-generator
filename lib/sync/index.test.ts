import * as fs from 'fs';
import path from 'path';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  completeSimulationManifestSync,
  createSyncOutputFingerprint,
  resolveCompletedSyncMetadata,
  resolveSuccessfulSyncMetadata,
  type CompleteSimulationManifestSyncInput,
} from './index';
import type { DerivedMovesetCandidateSet } from '@/lib/sync/movesetCandidates';

const input: CompleteSimulationManifestSyncInput = {
  options: { resume: true },
  sourcePath: '/source/pvpoke',
  rankingSyncResult: {
    rankings: [],
    candidateSets: [],
    simulationSpeciesIdsByFormatId: new Map(),
    formatsWithChangedOverallRankings: [],
  },
  pokemonData: [],
  pokemonSource: 'pokemon bytes',
  movesSource: 'move bytes',
};

describe('completeSimulationManifestSync', () => {
  const candidateSet: DerivedMovesetCandidateSet = {
    formatId: 'great-league',
    cup: 'all',
    cp: 1500,
    speciesId: 'bulbasaur',
    pvpokeScorePrior: 90,
    retainedFastMoves: ['VINE_WHIP', 'TACKLE'],
    retainedChargedMoves: ['POWER_WHIP', 'SLUDGE_BOMB'],
    rejections: [],
    candidates: [
      {
        id: 'vine_whip--sludge_bomb--power_whip',
        fastMove: 'VINE_WHIP',
        chargedMove1: 'POWER_WHIP',
        chargedMove2: 'SLUDGE_BOMB',
        isDefault: true,
      },
      {
        id: 'tackle--sludge_bomb--power_whip',
        fastMove: 'TACKLE',
        chargedMove1: 'POWER_WHIP',
        chargedMove2: 'SLUDGE_BOMB',
        isDefault: false,
      },
    ],
  };

  it('normalizes moveset variant simulation to opt-in', async () => {
    const generate = vi
      .fn()
      .mockRejectedValueOnce(new Error('default options captured'))
      .mockRejectedValueOnce(new Error('variant options captured'));
    const dependencies = {
      crossValidate: () => ({ valid: true, errors: [] }),
      generate,
    };

    await expect(
      completeSimulationManifestSync(input, dependencies),
    ).rejects.toThrow('default options captured');
    await expect(
      completeSimulationManifestSync(
        {
          ...input,
          options: { resume: true, includeMovesetVariants: true },
        },
        dependencies,
      ),
    ).rejects.toThrow('variant options captured');

    expect(generate).toHaveBeenNthCalledWith(
      1,
      expect.objectContaining({
        resume: true,
        includeMovesetVariants: false,
      }),
    );
    expect(generate).toHaveBeenNthCalledWith(
      2,
      expect.objectContaining({
        resume: true,
        includeMovesetVariants: true,
      }),
    );
  });

  it('does not simulate or publish after cross-validation failure', async () => {
    const generate = vi.fn();
    const prepare = vi.fn();
    const publish = vi.fn();
    const cleanup = vi.fn();

    await expect(
      completeSimulationManifestSync(input, {
        crossValidate: () => ({ valid: false, errors: ['invalid ranking'] }),
        generate,
        prepare,
        publish,
        cleanup,
      }),
    ).rejects.toThrow('Cross-validation failed: invalid ranking');

    expect(generate).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('does not prepare or publish manifests after simulation failure', async () => {
    const prepare = vi.fn();
    const publish = vi.fn();
    const cleanup = vi.fn();

    await expect(
      completeSimulationManifestSync(input, {
        crossValidate: () => ({ valid: true, errors: [] }),
        generate: vi.fn().mockRejectedValue(new Error('simulation failed')),
        prepare,
        publish,
        cleanup,
      }),
    ).rejects.toThrow('simulation failed');

    expect(prepare).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('does not publish prepared CSVs when manifest preparation fails', async () => {
    const publish = vi.fn();
    const cleanup = vi.fn();
    const preparedCsvFiles = [
      {
        formatId: 'great-league' as const,
        targetPath: 'data/simulations/cp1500/all/bulbasaur_1-1.csv',
        contents: 'new simulation bytes',
      },
    ];

    await expect(
      completeSimulationManifestSync(input, {
        crossValidate: () => ({ valid: true, errors: [] }),
        generate: vi.fn().mockResolvedValue({
          simulations: [],
          variantSelections: [],
          preparedCsvFiles,
        }),
        prepare: vi.fn(() => {
          throw new Error('manifest preparation failed');
        }),
        publish,
        cleanup,
      }),
    ).rejects.toThrow('manifest preparation failed');

    expect(publish).not.toHaveBeenCalled();
    expect(cleanup).not.toHaveBeenCalled();
  });

  it('does not clean stale files when publication fails', async () => {
    const cleanup = vi.fn();

    await expect(
      completeSimulationManifestSync(input, {
        crossValidate: () => ({ valid: true, errors: [] }),
        generate: vi.fn().mockResolvedValue({
          simulations: [],
          variantSelections: [],
          preparedCsvFiles: [],
        }),
        prepare: vi.fn(() => []),
        prepareRuntimeSnapshots: vi.fn(() => []),
        prepareRuntimeAssetIndex: vi.fn(() => ({
          targetPath: 'data/simulations/runtime-asset-index.json' as const,
          contents: '{}\n',
        })),
        publish: vi.fn().mockRejectedValue(new Error('publication failed')),
        cleanup,
      }),
    ).rejects.toThrow('publication failed');

    expect(cleanup).not.toHaveBeenCalled();
  });

  it('publishes prepared CSVs and manifests through one transaction', async () => {
    const preparedCsvFiles = [
      {
        formatId: 'great-league' as const,
        targetPath: 'data/simulations/cp1500/all/bulbasaur_1-1.csv',
        contents: 'new simulation bytes',
      },
    ];
    const preparedManifests = [
      {
        formatId: 'great-league' as const,
        targetPath: 'data/simulations/cp1500/all/moveset-variants.json',
        contents: '{}\n',
      },
    ];
    const preparedRuntimeAssetIndex = {
      targetPath: 'data/simulations/runtime-asset-index.json' as const,
      contents: '{"schemaVersion":1,"assets":[]}\n',
    };
    const preparedRuntimeSnapshots = [
      {
        formatId: 'great-league' as const,
        targetPath: 'data/simulations/cp1500/all/runtime-snapshot.json',
        contents: '{"schemaVersion":1}\n',
      },
    ];
    const publish = vi.fn().mockResolvedValue(undefined);
    const deletedPath =
      'data/simulations/cp1500/all/stale--fast--charged_a--charged_b_1-1.csv';
    const cleanup = vi.fn(async (_manifests, dependencies) => {
      dependencies?.reportDeleted?.(deletedPath);
      return [deletedPath];
    });
    const log = vi.fn();
    const generate = vi.fn().mockResolvedValue({
      simulations: [],
      variantSelections: [],
      preparedCsvFiles,
    });

    await completeSimulationManifestSync(input, {
      crossValidate: () => ({ valid: true, errors: [] }),
      generate,
      prepare: vi.fn(() => preparedManifests),
      prepareRuntimeSnapshots: vi.fn(() => preparedRuntimeSnapshots),
      prepareRuntimeAssetIndex: vi.fn(() => preparedRuntimeAssetIndex),
      publish,
      cleanup,
      log,
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ deferPublication: true }),
    );
    expect(publish).toHaveBeenCalledWith(
      preparedCsvFiles,
      preparedManifests,
      preparedRuntimeSnapshots,
      preparedRuntimeAssetIndex,
    );
    expect(cleanup).toHaveBeenCalledWith(
      preparedManifests,
      expect.objectContaining({ reportDeleted: expect.any(Function) }),
    );
    expect(publish.mock.invocationCallOrder[0]).toBeLessThan(
      cleanup.mock.invocationCallOrder[0]!,
    );
    expect(log).toHaveBeenCalledWith(
      '[sync] Deleted stale moveset variant data/simulations/cp1500/all/stale--fast--charged_a--charged_b_1-1.csv',
    );
  });

  it.each([
    { includeMovesetVariants: false, expectedCandidateCount: 1 },
    { includeMovesetVariants: true, expectedCandidateCount: 2 },
  ])(
    'uses one candidate authority across generation and manifests when includeMovesetVariants is $includeMovesetVariants',
    async ({ includeMovesetVariants, expectedCandidateCount }) => {
      let generatedCandidateSets: readonly DerivedMovesetCandidateSet[] = [];
      let preparedCandidateSets: readonly DerivedMovesetCandidateSet[] = [];
      const generate = vi.fn(async (options) => {
        generatedCandidateSets = options.candidateSets ?? [];
        return {
          simulations: [],
          variantSelections: [],
          preparedCsvFiles: [],
        };
      });
      const prepare = vi.fn((prepareInput) => {
        preparedCandidateSets = prepareInput.candidateSets;
        return [];
      });

      await completeSimulationManifestSync(
        {
          ...input,
          options: { includeMovesetVariants },
          rankingSyncResult: {
            ...input.rankingSyncResult,
            candidateSets: [candidateSet],
            simulationSpeciesIdsByFormatId: new Map([
              ['great-league', ['bulbasaur']],
            ]),
          },
        },
        {
          crossValidate: () => ({ valid: true, errors: [] }),
          generate,
          prepare,
          prepareRuntimeSnapshots: vi.fn(() => []),
          prepareRuntimeAssetIndex: vi.fn(() => ({
            targetPath: 'data/simulations/runtime-asset-index.json' as const,
            contents: '{"schemaVersion":1,"assets":[]}\n',
          })),
          publish: vi.fn().mockResolvedValue(undefined),
          cleanup: vi.fn().mockResolvedValue([]),
        },
      );

      expect(generatedCandidateSets).toEqual(preparedCandidateSets);
      expect(generatedCandidateSets).toEqual([
        expect.objectContaining({
          speciesId: 'bulbasaur',
          candidates: expect.any(Array),
        }),
      ]);
      expect(generatedCandidateSets[0]!.candidates).toHaveLength(
        expectedCandidateCount,
      );
      expect(
        generatedCandidateSets[0]!.candidates.filter(({ isDefault }) =>
          Boolean(isDefault),
        ),
      ).toHaveLength(1);
    },
  );

  it('rejects a synchronized species without a ranking-derived default', async () => {
    const generate = vi.fn();

    await expect(
      completeSimulationManifestSync(
        {
          ...input,
          rankingSyncResult: {
            ...input.rankingSyncResult,
            simulationSpeciesIdsByFormatId: new Map([
              ['great-league', ['bulbasaur']],
            ]),
          },
        },
        {
          crossValidate: () => ({ valid: true, errors: [] }),
          generate,
        },
      ),
    ).rejects.toThrow(
      'Missing simulation candidate set for great-league/bulbasaur',
    );

    expect(generate).not.toHaveBeenCalled();
  });

  it('ignores evidence-only candidate sets outside the synchronized species pool', async () => {
    let generatedCandidateSets: readonly DerivedMovesetCandidateSet[] = [];
    const generate = vi.fn(async (options) => {
      generatedCandidateSets = options.candidateSets ?? [];
      return {
        simulations: [],
        variantSelections: [],
        preparedCsvFiles: [],
      };
    });
    const evidenceOnlyCandidateSet: DerivedMovesetCandidateSet = {
      ...candidateSet,
      speciesId: 'wobbuffet_shadow',
      retainedFastMoves: [],
      retainedChargedMoves: [],
      candidates: [],
    };

    await completeSimulationManifestSync(
      {
        ...input,
        rankingSyncResult: {
          ...input.rankingSyncResult,
          candidateSets: [candidateSet, evidenceOnlyCandidateSet],
          simulationSpeciesIdsByFormatId: new Map([
            ['great-league', ['bulbasaur']],
          ]),
        },
      },
      {
        crossValidate: () => ({ valid: true, errors: [] }),
        generate,
        prepare: vi.fn(() => []),
        prepareRuntimeSnapshots: vi.fn(() => []),
        prepareRuntimeAssetIndex: vi.fn(() => ({
          targetPath: 'data/simulations/runtime-asset-index.json' as const,
          contents: '{"schemaVersion":1,"assets":[]}\n',
        })),
        publish: vi.fn().mockResolvedValue(undefined),
        cleanup: vi.fn().mockResolvedValue([]),
      },
    );

    expect(generatedCandidateSets).toEqual([
      expect.objectContaining({ speciesId: 'bulbasaur' }),
    ]);
  });
});

describe('resolveSuccessfulSyncMetadata', () => {
  it('preserves identical successful sync metadata when generated data is unchanged', () => {
    const previousMetadata =
      '{\n  "lastSuccessfulSyncAt": "2026-08-07T10:19:54.674Z"\n}';

    expect(
      resolveSuccessfulSyncMetadata(
        previousMetadata,
        'same-output-fingerprint',
        'same-output-fingerprint',
        new Date('2026-08-11T20:00:00.000Z'),
      ),
    ).toBe(previousMetadata);
  });

  it('records completion time when generated data changes', () => {
    expect(
      resolveSuccessfulSyncMetadata(
        '{\n  "lastSuccessfulSyncAt": "2026-08-07T10:19:54.674Z"\n}',
        'old-output-fingerprint',
        'new-output-fingerprint',
        new Date('2026-08-11T20:00:00.000Z'),
      ),
    ).toBe('{\n  "lastSuccessfulSyncAt": "2026-08-11T20:00:00.000Z"\n}');
  });
});

describe('createSyncOutputFingerprint', () => {
  const fixtureRoot = path.join(process.cwd(), '.sync-output-fingerprint-test');

  afterEach(() => {
    fs.rmSync(fixtureRoot, { force: true, recursive: true });
  });

  it('hashes every generated output path and file contents deterministically', () => {
    fs.mkdirSync(path.join(fixtureRoot, 'rankings', 'nested'), {
      recursive: true,
    });
    fs.mkdirSync(path.join(fixtureRoot, 'simulations'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'pokemon.json'), 'pokemon');
    fs.writeFileSync(path.join(fixtureRoot, 'moves.json'), 'moves');
    fs.writeFileSync(
      path.join(fixtureRoot, 'rankings', 'nested', 'overall.csv'),
      'ranking',
    );
    fs.writeFileSync(
      path.join(fixtureRoot, 'simulations', 'snapshot.json'),
      'snapshot',
    );

    const first = createSyncOutputFingerprint(fixtureRoot);
    expect(createSyncOutputFingerprint(fixtureRoot)).toBe(first);

    fs.writeFileSync(path.join(fixtureRoot, 'pokemon.json'), 'changed pokemon');
    expect(createSyncOutputFingerprint(fixtureRoot)).not.toBe(first);
  });

  it('preserves completed-run metadata only while real generated output is unchanged', () => {
    fs.mkdirSync(path.join(fixtureRoot, 'rankings'), { recursive: true });
    fs.writeFileSync(path.join(fixtureRoot, 'pokemon.json'), 'pokemon');
    const previousMetadata =
      '{\n  "lastSuccessfulSyncAt": "2026-08-07T10:19:54.674Z"\n}';
    const previousFingerprint = createSyncOutputFingerprint(fixtureRoot);

    expect(
      resolveCompletedSyncMetadata(
        previousMetadata,
        previousFingerprint,
        fixtureRoot,
        new Date('2026-08-11T20:00:00.000Z'),
      ),
    ).toBe(previousMetadata);

    fs.writeFileSync(path.join(fixtureRoot, 'pokemon.json'), 'changed pokemon');
    expect(
      resolveCompletedSyncMetadata(
        previousMetadata,
        previousFingerprint,
        fixtureRoot,
        new Date('2026-08-11T20:00:00.000Z'),
      ),
    ).toBe(`{
  "lastSuccessfulSyncAt": "2026-08-11T20:00:00.000Z"
}`);
  });
});
