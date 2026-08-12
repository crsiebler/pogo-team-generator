import { execFile } from 'child_process';
import { promisify } from 'util';
import { describe, expect, it, vi } from 'vitest';
import {
  buildSimulationProjection,
  formatSimulationProjection,
  parseVariantSimulationFilename,
  projectSimulationVariants,
} from './simulationProjection';
import { getBattleFormats, type BattleFormat } from '@/lib/data/battleFormats';
import { getMovesetVariantId } from '@/lib/data/movesetVariants';
import type { DerivedMovesetCandidateSet } from '@/lib/sync/movesetCandidates';
import type { MovesetVariant } from '@/lib/types';

const formats: readonly BattleFormat[] = [
  {
    id: 'great-league',
    label: 'Great League',
    cup: 'all',
    cp: 1500,
  },
  {
    id: 'weather-cup',
    label: 'Weather Cup',
    cup: 'weather',
    cp: 1500,
  },
];
const execFileAsync = promisify(execFile);

function createVariant(
  fastMove: string,
  chargedMove1: string,
  chargedMove2: string,
  isDefault: boolean,
): MovesetVariant {
  return {
    id: getMovesetVariantId({ fastMove, chargedMove1, chargedMove2 }),
    fastMove,
    chargedMove1,
    chargedMove2,
    isDefault,
  };
}

function createCandidateSet(
  speciesId: string,
  candidates: readonly MovesetVariant[],
  formatId: DerivedMovesetCandidateSet['formatId'] = 'great-league',
): DerivedMovesetCandidateSet {
  return {
    formatId,
    cup: formatId === 'weather-cup' ? 'weather' : 'all',
    cp: 1500,
    speciesId,
    pvpokeScorePrior: 90,
    retainedFastMoves: [],
    retainedChargedMoves: [],
    rejections: [],
    candidates,
  };
}

describe('simulation projection', () => {
  it('projects alternate CSVs only for simulation targets with multiple candidates', () => {
    const projection = buildSimulationProjection({
      includeMovesetVariants: true,
      formats,
      candidateSets: [
        createCandidateSet('quagsire', [
          createVariant('MUD_SHOT', 'AQUA_TAIL', 'STONE_EDGE', true),
        ]),
        createCandidateSet('golisopod', [
          createVariant('FURY_CUTTER', 'X_SCISSOR', 'AQUA_JET', true),
          createVariant('SHADOW_CLAW', 'X_SCISSOR', 'AQUA_JET', false),
        ]),
        createCandidateSet('off_meta', [
          createVariant('TACKLE', 'BODY_SLAM', 'DIG', true),
          createVariant('QUICK_ATTACK', 'BODY_SLAM', 'DIG', false),
        ]),
      ],
      simulationSpeciesIdsByFormatId: new Map([
        ['great-league', ['quagsire', 'golisopod']],
        ['weather-cup', []],
      ]),
      existingFilenamesByFormatId: new Map([
        [
          'great-league',
          [
            'golisopod--shadow_claw--x_scissor--aqua_jet_1-1.csv',
            'golisopod--waterfall--liquidation--aerial_ace_0-0.csv',
            'golisopod_1-1.csv',
            'golisopod--bad_3-3.csv',
            '../outside--tackle--body_slam--dig_1-1.csv',
          ],
        ],
      ]),
    });

    expect(projection).toMatchObject({ includesMovesetVariants: true });
    expect(projection.formats).toEqual([
      {
        formatId: 'great-league',
        label: 'Great League',
        cup: 'all',
        cp: 1500,
        candidateSpecies: 1,
        candidateVariants: 2,
        alternateVariants: 1,
        shieldScenarioCsvs: 3,
        species: [
          {
            speciesId: 'golisopod',
            candidateCount: 2,
            alternateVariantCount: 1,
            candidateCap: 8,
            shieldScenarioCsvs: 3,
          },
        ],
        staleVariantFiles: [
          'data/simulations/cp1500/all/golisopod--waterfall--liquidation--aerial_ace_0-0.csv',
        ],
      },
      {
        formatId: 'weather-cup',
        label: 'Weather Cup',
        cup: 'weather',
        cp: 1500,
        candidateSpecies: 0,
        candidateVariants: 0,
        alternateVariants: 0,
        shieldScenarioCsvs: 0,
        species: [],
        staleVariantFiles: [],
      },
    ]);
    expect(projection.totals).toEqual({
      candidateSpecies: 1,
      candidateVariants: 2,
      alternateVariants: 1,
      shieldScenarioCsvs: 3,
      staleVariantFiles: 1,
    });
  });

  it('reports the eight-candidate cap and produces byte-identical output for shuffled inputs', () => {
    const candidates = [
      createVariant('FAST_0', 'CHARGED_A', 'CHARGED_B', true),
      ...Array.from({ length: 7 }, (_, index) =>
        createVariant(`FAST_${index + 1}`, 'CHARGED_A', 'CHARGED_B', false),
      ),
    ];
    const baseInput = {
      includeMovesetVariants: true,
      formats,
      candidateSets: [createCandidateSet('bounded', candidates)],
      simulationSpeciesIdsByFormatId: new Map([
        ['great-league' as const, ['bounded']],
      ]),
      existingFilenamesByFormatId: new Map([
        [
          'great-league' as const,
          [
            'bounded--fast_7--charged_a--charged_b_2-2.csv',
            'bounded--obsolete--charged_a--charged_b_1-1.csv',
          ],
        ],
      ]),
    };
    const shuffledInput = {
      ...baseInput,
      candidateSets: [createCandidateSet('bounded', [...candidates].reverse())],
      existingFilenamesByFormatId: new Map([
        [
          'great-league' as const,
          [
            ...(baseInput.existingFilenamesByFormatId.get('great-league') ??
              []),
          ].reverse(),
        ],
      ]),
    };

    const projection = buildSimulationProjection(baseInput);

    expect(projection.formats[0]?.species[0]).toMatchObject({
      candidateCount: 8,
      alternateVariantCount: 7,
      candidateCap: 8,
      shieldScenarioCsvs: 21,
    });
    expect(formatSimulationProjection(projection)).toBe(
      formatSimulationProjection(buildSimulationProjection(shuffledInput)),
    );
  });

  it('recognizes only canonical alternate variant scenario filenames', () => {
    expect(
      parseVariantSimulationFilename(
        'golisopod--shadow_claw--x_scissor--aqua_jet_2-2.csv',
      ),
    ).toEqual({
      speciesId: 'golisopod',
      variantId: 'shadow_claw--x_scissor--aqua_jet',
      scenario: '2-2',
    });
    expect(parseVariantSimulationFilename('golisopod_2-2.csv')).toBeNull();
    expect(
      parseVariantSimulationFilename(
        'golisopod--shadow_claw--x_scissor--aqua_jet_2-1.csv',
      ),
    ).toBeNull();
    expect(
      parseVariantSimulationFilename(
        'golisopod--shadow_claw--aqua_jet--x_scissor_1-1.csv',
      ),
    ).toBeNull();
    expect(
      parseVariantSimulationFilename('../golisopod--a--b--c_1-1.csv'),
    ).toBeNull();
  });

  it('reports a default-only estimate when moveset variants are omitted', () => {
    const projection = buildSimulationProjection({
      includeMovesetVariants: false,
      formats: [formats[0]!],
      candidateSets: [
        createCandidateSet('golisopod', [
          createVariant('FURY_CUTTER', 'X_SCISSOR', 'AQUA_JET', true),
          createVariant('SHADOW_CLAW', 'X_SCISSOR', 'AQUA_JET', false),
        ]),
      ],
      simulationSpeciesIdsByFormatId: new Map([
        ['great-league', ['golisopod']],
      ]),
      existingFilenamesByFormatId: new Map([
        [
          'great-league',
          ['golisopod--shadow_claw--x_scissor--aqua_jet_1-1.csv'],
        ],
      ]),
    });

    expect(projection).toEqual({
      includesMovesetVariants: false,
      formats: [
        expect.objectContaining({
          candidateSpecies: 0,
          candidateVariants: 0,
          alternateVariants: 0,
          shieldScenarioCsvs: 0,
          species: [],
          staleVariantFiles: [
            'data/simulations/cp1500/all/golisopod--shadow_claw--x_scissor--aqua_jet_1-1.csv',
          ],
        }),
      ],
      totals: {
        candidateSpecies: 0,
        candidateVariants: 0,
        alternateVariants: 0,
        shieldScenarioCsvs: 0,
        staleVariantFiles: 1,
      },
    });
  });

  it('orchestrates projection exclusively through read-only dependencies', async () => {
    const validateSource = vi.fn();
    const loadRankingData = vi.fn().mockResolvedValue({
      candidateSets: [],
      simulationSpeciesIdsByFormatId: new Map(),
    });
    const readSimulationDirectory = vi.fn().mockResolvedValue([]);

    const projection = await projectSimulationVariants(
      { sourcePath: '/source/pvpoke' },
      {
        resolveSourcePath: vi.fn(() => '/unused'),
        validateSource,
        loadRankingData,
        readSimulationDirectory,
      },
    );

    expect(validateSource).toHaveBeenCalledWith('/source/pvpoke');
    expect(loadRankingData).toHaveBeenCalledWith('/source/pvpoke');
    expect(readSimulationDirectory).toHaveBeenCalledTimes(
      getBattleFormats().length,
    );
    expect(projection.includesMovesetVariants).toBe(false);
    expect(projection.formats).toHaveLength(getBattleFormats().length);
  });

  it('prints the real projection command as standalone JSON', async () => {
    const { stdout } = await execFileAsync(
      'bun',
      [
        'run',
        'lib/scripts/sync.ts',
        '--project-simulations',
        '--moveset-variants',
      ],
      {
        cwd: process.cwd(),
        encoding: 'utf8',
        maxBuffer: 20 * 1024 * 1024,
      },
    );

    const projection = JSON.parse(stdout) as {
      includesMovesetVariants: boolean;
      formats: unknown[];
      totals: { shieldScenarioCsvs: number };
    };
    expect(projection.includesMovesetVariants).toBe(true);
    expect(projection.formats).toHaveLength(getBattleFormats().length);
    expect(projection.totals.shieldScenarioCsvs).toBeGreaterThan(0);
  }, 20_000);
});
