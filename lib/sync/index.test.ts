import { describe, expect, it, vi } from 'vitest';
import {
  completeSimulationManifestSync,
  type CompleteSimulationManifestSyncInput,
} from './index';

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
});
