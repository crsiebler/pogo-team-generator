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
  it('does not simulate or publish after cross-validation failure', async () => {
    const generate = vi.fn();
    const prepare = vi.fn();
    const publish = vi.fn();

    await expect(
      completeSimulationManifestSync(input, {
        crossValidate: () => ({ valid: false, errors: ['invalid ranking'] }),
        generate,
        prepare,
        publish,
      }),
    ).rejects.toThrow('Cross-validation failed: invalid ranking');

    expect(generate).not.toHaveBeenCalled();
    expect(prepare).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not prepare or publish manifests after simulation failure', async () => {
    const prepare = vi.fn();
    const publish = vi.fn();

    await expect(
      completeSimulationManifestSync(input, {
        crossValidate: () => ({ valid: true, errors: [] }),
        generate: vi.fn().mockRejectedValue(new Error('simulation failed')),
        prepare,
        publish,
      }),
    ).rejects.toThrow('simulation failed');

    expect(prepare).not.toHaveBeenCalled();
    expect(publish).not.toHaveBeenCalled();
  });

  it('does not publish prepared CSVs when manifest preparation fails', async () => {
    const publish = vi.fn();
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
      }),
    ).rejects.toThrow('manifest preparation failed');

    expect(publish).not.toHaveBeenCalled();
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
    const publish = vi.fn().mockResolvedValue(undefined);
    const generate = vi.fn().mockResolvedValue({
      simulations: [],
      variantSelections: [],
      preparedCsvFiles,
    });

    await completeSimulationManifestSync(input, {
      crossValidate: () => ({ valid: true, errors: [] }),
      generate,
      prepare: vi.fn(() => preparedManifests),
      publish,
    });

    expect(generate).toHaveBeenCalledWith(
      expect.objectContaining({ deferPublication: true }),
    );
    expect(publish).toHaveBeenCalledWith(preparedCsvFiles, preparedManifests);
  });
});
