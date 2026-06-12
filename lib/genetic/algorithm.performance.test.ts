import { describe, expect, it } from 'vitest';
import { generateTeam } from './algorithm';

describe('generateTeam performance safeguards', () => {
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
    expect(elapsedMs).toBeLessThan(60_000);
  }, 70_000);
});
