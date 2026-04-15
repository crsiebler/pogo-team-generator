import { getDexNumber } from '@lib/data/pokemon';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { crossover, mutate } from './operators';
import {
  getBattleFrontierMasterTeamLegality,
  type BattleFrontierMasterLegalityViolation,
} from '@/lib/data/battleFrontierMasterRules';

vi.mock('@lib/data/pokemon', () => ({
  getDexNumber: vi.fn(),
  validateTeamUniqueness: vi.fn(
    (team: string[]) => new Set(team).size === team.length,
  ),
}));

vi.mock('@/lib/data/battleFrontierMasterRules', () => ({
  getBattleFrontierMasterTeamLegality: vi.fn(),
}));

const mockDexNumber = vi.mocked(getDexNumber);

const pointsBySpeciesId: Record<string, number> = {
  palkia_origin: 5,
  eternatus: 5,
  mewtwo: 2,
  swampert_mega: 4,
  dragonite: 0,
  giratina_altered: 2,
};

const megaSpeciesIds = new Set(['swampert_mega']);

describe('Battle Frontier Master genetic operators', () => {
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

    vi.mocked(getBattleFrontierMasterTeamLegality).mockImplementation(
      (team: string[]) => {
        const totalPoints = team.reduce(
          (sum, speciesId) => sum + (pointsBySpeciesId[speciesId] ?? 0),
          0,
        );
        const fivePointPokemonCount = team.filter(
          (speciesId) => (pointsBySpeciesId[speciesId] ?? 0) === 5,
        ).length;
        const megaCount = team.filter((speciesId) =>
          megaSpeciesIds.has(speciesId),
        ).length;
        const violations: BattleFrontierMasterLegalityViolation[] = [];

        if (totalPoints > 11) {
          violations.push('points-cap');
        }

        if (fivePointPokemonCount > 1) {
          violations.push('five-point-limit');
        }

        if (megaCount > 1) {
          violations.push('mega-limit');
        }

        return {
          isLegal: violations.length === 0,
          totalPoints,
          fivePointPokemonCount,
          megaCount,
          violations,
        };
      },
    );
  });

  it('rejects illegal Battle Frontier Master crossover children', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.1);

    const parent1 = {
      team: ['palkia_origin', 'mewtwo', 'dragonite'],
      anchors: [0],
      fitness: 1,
    };
    const parent2 = {
      team: ['palkia_origin', 'eternatus', 'swampert_mega'],
      anchors: [0],
      fitness: 1,
    };

    const child = crossover(parent1, parent2, 'GBL', 'battle-frontier-master');

    expect(child).toEqual(parent1);
    expect(getBattleFrontierMasterTeamLegality).toHaveBeenCalledWith([
      'palkia_origin',
      'eternatus',
      'swampert_mega',
    ]);
  });

  it('rejects illegal Battle Frontier Master mutations', () => {
    vi.spyOn(Math, 'random')
      .mockReturnValueOnce(0)
      .mockReturnValueOnce(0.6)
      .mockReturnValue(0.1);

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
      'battle-frontier-master',
    );

    expect(mutated).toEqual(chromosome);
    expect(getBattleFrontierMasterTeamLegality).toHaveBeenCalledWith([
      'palkia_origin',
      'mewtwo',
      'eternatus',
    ]);
  });

  it('keeps existing operator behavior for non-Battle Frontier formats', () => {
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
    expect(getBattleFrontierMasterTeamLegality).not.toHaveBeenCalled();
  });
});
