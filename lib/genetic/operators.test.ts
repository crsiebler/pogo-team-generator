import { getDexNumber } from '@lib/data/pokemon';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crossover, mutate } from './operators';
import { getMegaMasterTeamLegality } from '@/lib/data/megaMasterRules';

vi.mock('@lib/data/pokemon', () => ({
  getDexNumber: vi.fn(),
  validateTeamUniqueness: vi.fn(
    (team: string[]) => new Set(team).size === team.length,
  ),
}));

vi.mock('@/lib/data/megaMasterRules', () => ({
  getMegaMasterTeamLegality: vi.fn(),
}));

const mockDexNumber = vi.mocked(getDexNumber);

const megaMasterSpeciesIds = new Set(['swampert_mega', 'giratina_altered']);

describe('genetic operators legality checks', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockDexNumber.mockImplementation(
      (speciesId: string) =>
        ({
          palkia_origin: 484,
          eternatus: 890,
          mewtwo: 150,
          swampert_mega: 260,
          dragonite: 149,
          giratina_altered: 487,
        })[speciesId],
    );

    vi.mocked(getMegaMasterTeamLegality).mockImplementation(
      (team: readonly string[]) => {
        const megaCount = team.filter((speciesId) =>
          megaMasterSpeciesIds.has(speciesId),
        ).length;
        const violations = megaCount > 1 ? ['mega-limit' as const] : [];

        return {
          isLegal: violations.length === 0,
          megaCount,
          violations,
        };
      },
    );
  });

  it('keeps existing operator behavior for non-Mega Master formats', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.6)
      .mockReturnValue(0.6);

    const chromosome = {
      team: ['palkia_origin', 'mewtwo', 'dragonite'],
      anchors: [0],
      fitness: 1,
    };

    const mutated = mutate(
      chromosome,
      ['eternatus', 'swampert_mega', 'giratina_altered'],
      1,
      'GBL',
      'great-league',
    );

    expect(mutated.team).toEqual(['palkia_origin', 'mewtwo', 'swampert_mega']);
    expect(getMegaMasterTeamLegality).not.toHaveBeenCalled();
  });

  it('rejects illegal Mega Master crossover children', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);

    const parent1 = {
      team: ['swampert_mega', 'mewtwo', 'dragonite'],
      anchors: [0],
      fitness: 1,
    };
    const parent2 = {
      team: ['swampert_mega', 'giratina_altered', 'palkia_origin'],
      anchors: [0],
      fitness: 1,
    };

    const child = crossover(parent1, parent2, 'GBL', 'mega-master-league');

    expect(child).toEqual(parent1);
    expect(getMegaMasterTeamLegality).toHaveBeenCalledWith([
      'swampert_mega',
      'giratina_altered',
      'palkia_origin',
    ]);
  });

  it('rejects illegal Mega Master mutations', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.8)
      .mockReturnValue(0.4);

    const chromosome = {
      team: ['swampert_mega', 'mewtwo', 'dragonite'],
      anchors: [0],
      fitness: 1,
    };

    const mutated = mutate(
      chromosome,
      ['eternatus', 'giratina_altered', 'palkia_origin'],
      1,
      'GBL',
      'mega-master-league',
    );

    expect(mutated).toEqual(chromosome);
    expect(getMegaMasterTeamLegality).toHaveBeenCalledWith([
      'swampert_mega',
      'mewtwo',
      'giratina_altered',
    ]);
  });
});
