import { describe, expect, it, vi } from 'vitest';
import { generateTeam } from './algorithm';
import {
  getAssignedMovesetVariantId,
  getRecommendedMovesetForPokemon,
} from './moveset';
import { getPokemonBySpeciesId } from '@/lib/data/pokemon';
import { getOverallRankings, getRankedPokemonNames } from '@/lib/data/rankings';

function createSeededRandom(seed: number): () => number {
  let state = seed >>> 0;

  return () => {
    state = (Math.imul(1664525, state) + 1013904223) >>> 0;
    return state / 0x100000000;
  };
}

describe('generateTeam performance safeguards', () => {
  it('generates with an unsupported explicit anchor and manifest-backed teammates', async () => {
    const result = await generateTeam({
      mode: 'GBL',
      formatId: 'great-league',
      anchorPokemon: ['gyarados'],
      simulateMovesetVariants: true,
      populationSize: 2,
      generations: 1,
    });
    const assignment = result.movesetAssignment;
    const gyarados = getPokemonBySpeciesId('gyarados');

    expect(getRankedPokemonNames('great-league').has('Gyarados')).toBe(true);
    expect(
      getOverallRankings('great-league').findIndex(
        ({ Pokemon }) => Pokemon === 'Gyarados',
      ),
    ).toBeGreaterThanOrEqual(150);
    expect(gyarados).toBeDefined();
    expect(result.team[0]).toBe('gyarados');
    expect(assignment).toBeDefined();
    expect(assignment?.authorityBySpeciesId.gyarados.source).toBe(
      'ranked-default-fallback',
    );
    expect(
      Object.entries(assignment?.authorityBySpeciesId ?? {}).some(
        ([speciesId, authority]) =>
          speciesId !== 'gyarados' && authority.source === 'manifest',
      ),
    ).toBe(true);
    expect(getAssignedMovesetVariantId(assignment, 'gyarados')).toBeUndefined();
    expect(assignment?.variantsBySpeciesId.gyarados).toMatchObject({
      ...getRecommendedMovesetForPokemon(gyarados!, 'great-league'),
      isDefault: true,
    });
    expect(
      result.team
        .slice(1)
        .some(
          (speciesId) =>
            getAssignedMovesetVariantId(assignment, speciesId) !== undefined,
        ),
    ).toBe(true);
  }, 70_000);

  it('completes a representative PlayPokemon generation under one minute', async () => {
    const startedAt = performance.now();

    const result = await generateTeam({
      mode: 'PlayPokemon',
      formatId: 'great-league',
      populationSize: 2,
      generations: 1,
    });
    const elapsedMs = performance.now() - startedAt;

    expect(result.team).toHaveLength(6);
    expect(result.fitness).toBeGreaterThan(0);
    expect(result.scoreBreakdown?.score).toBe(result.fitness);
    expect(result.finalistRerankingStats).toBeDefined();
    const stats = result.finalistRerankingStats!;
    expect(stats.assignmentEvaluationCount).toBeLessThanOrEqual(
      stats.finalistCount * 729,
    );
    expect(stats.fullScoreCount).toBeLessThanOrEqual(stats.finalistCount * 12);
    expect(stats.lineupCache.misses).toBe(stats.fullScoreCount * 120);
    expect(stats.lineupCache.size).toBe(stats.lineupCache.misses);
    expect(stats.lineupCache.hits).toBe(120);
    expect(elapsedMs).toBeLessThan(60_000);
  }, 70_000);

  it('retains identical finalist ordering for a fixed random seed', async () => {
    const random = vi.spyOn(Math, 'random');
    const options = {
      mode: 'PlayPokemon' as const,
      formatId: 'great-league' as const,
      populationSize: 3,
      generations: 2,
    };

    try {
      random.mockImplementation(createSeededRandom(20));
      const first = await generateTeam(options);
      random.mockImplementation(createSeededRandom(20));
      const second = await generateTeam(options);

      expect(first.defaultScoredFinalists?.length).toBeGreaterThan(0);
      expect(first.defaultScoredFinalists?.length).toBeLessThanOrEqual(10);
      expect(
        second.defaultScoredFinalists?.map(({ team, fitness }) => ({
          team,
          fitness,
        })),
      ).toEqual(
        first.defaultScoredFinalists?.map(({ team, fitness }) => ({
          team,
          fitness,
        })),
      );
      expect(second.team).toEqual(first.team);
      expect(second.movesetAssignment?.fingerprint).toBe(
        first.movesetAssignment?.fingerprint,
      );
      expect(second.fitness).toBe(first.fitness);
      expect(second.finalistRerankingStats).toEqual(
        first.finalistRerankingStats,
      );
    } finally {
      random.mockRestore();
    }
  }, 70_000);
});
