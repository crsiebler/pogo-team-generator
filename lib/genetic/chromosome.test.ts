import { getDexNumber, getPokemonBySpeciesId } from '@lib/data/pokemon';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createRandomChromosome } from './chromosome';
import {
  getBattleFrontierMasterTeamLegality,
  type BattleFrontierMasterLegalityViolation,
} from '@/lib/data/battleFrontierMasterRules';
import { getMegaMasterTeamLegality } from '@/lib/data/megaMasterRules';

vi.mock('@lib/data/pokemon', () => ({
  getPokemonBySpeciesId: vi.fn(),
  getDexNumber: vi.fn(),
  validateTeamUniqueness: vi.fn(
    (team: string[]) => new Set(team).size === team.length,
  ),
}));

vi.mock('@lib/data/rankings', () => ({
  getAllRankingsForPokemon: vi.fn(() => ({ overall: 0 })),
  speciesIdToRankingName: vi.fn((speciesId: string) => speciesId),
}));

vi.mock('@lib/data/simulations', () => ({
  getWorstMatchups: vi.fn(() => []),
  countersThreats: vi.fn(() => 0),
  getMatchupQualityScore: vi.fn(() => 0.5),
}));

vi.mock('../coverage/typeChart', () => ({
  calculateEffectiveness: vi.fn(() => 1),
}));

vi.mock('@/lib/data/battleFrontierMasterRules', () => ({
  getBattleFrontierMasterTeamLegality: vi.fn(),
}));

vi.mock('@/lib/data/megaMasterRules', () => ({
  getMegaMasterTeamLegality: vi.fn(),
}));

const mockPokemonBySpeciesId = vi.mocked(getPokemonBySpeciesId);
const mockDexNumber = vi.mocked(getDexNumber);

const pointsBySpeciesId: Record<string, number> = {
  charizard_mega_y: 4,
  palkia_origin: 5,
  eternatus: 5,
  mewtwo: 2,
  swampert_mega: 4,
  dragonite: 0,
};

const megaSpeciesIds = new Set(['charizard_mega_y', 'swampert_mega']);

function mockRandomSequence(values: number[]): void {
  const randomSpy = vi.spyOn(Math, 'random');

  for (const value of values) {
    randomSpy.mockReturnValueOnce(value);
  }

  randomSpy.mockReturnValue(0.76);
}

describe('createRandomChromosome Battle Frontier Master legality', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    mockPokemonBySpeciesId.mockImplementation((speciesId: string) => ({
      dex:
        pointsBySpeciesId[speciesId] === undefined
          ? 999
          : Object.keys(pointsBySpeciesId).indexOf(speciesId) + 1,
      speciesId,
      speciesName: speciesId,
      baseStats: { atk: 100, def: 100, hp: 100 },
      types: ['dragon'],
      fastMoves: [],
      chargedMoves: [],
      tags: megaSpeciesIds.has(speciesId) ? ['mega'] : [],
      defaultIVs: { cp1500: [1, 1, 1, 1], cp2500: [1, 1, 1, 1] },
      buddyDistance: 1,
      thirdMoveCost: 10000,
      released: true,
    }));

    mockDexNumber.mockImplementation(
      (speciesId: string) =>
        ({
          palkia_origin: 484,
          eternatus: 890,
          mewtwo: 150,
          swampert_mega: 260,
          dragonite: 149,
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

    vi.mocked(getMegaMasterTeamLegality).mockImplementation(
      (team: readonly string[]) => {
        const megaCount = team.filter((speciesId) =>
          megaSpeciesIds.has(speciesId),
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

  it('keeps random Battle Frontier Master teams legal during initialization', () => {
    mockRandomSequence([0, 0.26, 0.26, 0.26, 0, 0.51, 0.51, 0.51]);

    const chromosome = createRandomChromosome(
      ['eternatus', 'mewtwo', 'swampert_mega', 'dragonite'],
      3,
      ['palkia_origin'],
      'battle-frontier-master',
    );

    expect(chromosome.team).toEqual([
      'palkia_origin',
      'mewtwo',
      'swampert_mega',
    ]);
    expect(getBattleFrontierMasterTeamLegality(chromosome.team)).toMatchObject({
      isLegal: true,
      totalPoints: 11,
      fivePointPokemonCount: 1,
      megaCount: 1,
    });
  });

  it('keeps existing initialization behavior for non-Battle Frontier formats', () => {
    mockRandomSequence([0, 0.26, 0.26, 0.26, 0, 0.51, 0.51, 0.51]);

    const chromosome = createRandomChromosome(
      ['eternatus', 'mewtwo', 'swampert_mega', 'dragonite'],
      3,
      ['palkia_origin'],
      'great-league',
    );

    expect(chromosome.team).toEqual([
      'palkia_origin',
      'eternatus',
      'swampert_mega',
    ]);
  });

  it('keeps random Mega Master League teams to one Mega Pokemon', () => {
    mockRandomSequence([0, 0.26, 0.26, 0.26, 0, 0.51, 0.51, 0.51]);

    const chromosome = createRandomChromosome(
      ['eternatus', 'mewtwo', 'swampert_mega', 'dragonite'],
      3,
      ['charizard_mega_y'],
      'mega-master-league',
    );

    expect(chromosome.team).toEqual([
      'charizard_mega_y',
      'eternatus',
      'dragonite',
    ]);
    expect(getMegaMasterTeamLegality(chromosome.team)).toMatchObject({
      isLegal: true,
      megaCount: 1,
    });
  });

  it('keeps existing initialization behavior for non-Mega Master formats', () => {
    mockRandomSequence([0, 0.26, 0.26, 0.26, 0, 0.51, 0.51, 0.51]);

    const chromosome = createRandomChromosome(
      ['eternatus', 'mewtwo', 'swampert_mega', 'dragonite'],
      3,
      ['charizard_mega_y'],
      'great-league',
    );

    expect(chromosome.team).toEqual([
      'charizard_mega_y',
      'eternatus',
      'swampert_mega',
    ]);
  });

  it('keeps searching fallback candidates until it finds a legal Battle Frontier team member', () => {
    mockDexNumber.mockImplementation(
      (speciesId: string) =>
        ({
          charizard_mega_y: 6,
          swampert_mega: 260,
          dragonite: 149,
        })[speciesId],
    );

    mockRandomSequence([
      0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.1,
      0.1, 0.1, 0.1, 0.1, 0.1, 0.1, 0.9,
    ]);

    const chromosome = createRandomChromosome(
      ['swampert_mega', 'dragonite'],
      2,
      ['charizard_mega_y'],
      'battle-frontier-master',
    );

    expect(chromosome.team).toEqual(['charizard_mega_y', 'dragonite']);
    expect(getBattleFrontierMasterTeamLegality(chromosome.team)).toMatchObject({
      isLegal: true,
      megaCount: 1,
      fivePointPokemonCount: 0,
      totalPoints: 4,
    });
  });

  it('uses eligible fallback candidates when Mega Master random sampling keeps hitting illegal Megas', () => {
    const megaMasterPool = [
      'swampert_mega',
      'charizard_mega_y',
      'venusaur_mega',
      'blastoise_mega',
      'gyarados_mega',
      'gengar_mega',
      'sableye_mega',
      'mawile_mega',
      'manectric_mega',
      'abomasnow_mega',
      'altaria_mega',
      'latios_mega',
      'latias_mega',
      'rayquaza_mega',
      'mewtwo',
      'dragonite',
    ];
    const megaMasterDexNumbers = new Map(
      megaMasterPool.map((speciesId, index) => [speciesId, index + 1]),
    );

    mockPokemonBySpeciesId.mockImplementation((speciesId: string) => ({
      dex: megaMasterDexNumbers.get(speciesId) ?? 999,
      speciesId,
      speciesName: speciesId,
      baseStats: { atk: 100, def: 100, hp: 100 },
      types: ['dragon'],
      fastMoves: [],
      chargedMoves: [],
      tags: speciesId.includes('_mega') ? ['mega'] : [],
      defaultIVs: { cp1500: [1, 1, 1, 1], cp2500: [1, 1, 1, 1] },
      buddyDistance: 1,
      thirdMoveCost: 10000,
      released: true,
    }));
    mockDexNumber.mockImplementation((speciesId: string) =>
      megaMasterDexNumbers.get(speciesId),
    );
    vi.mocked(getMegaMasterTeamLegality).mockImplementation(
      (team: readonly string[]) => {
        const megaCount = team.filter((speciesId) =>
          speciesId.includes('_mega'),
        ).length;
        const violations = megaCount > 1 ? ['mega-limit' as const] : [];

        return {
          isLegal: violations.length === 0,
          megaCount,
          violations,
        };
      },
    );
    vi.spyOn(Math, 'random').mockReturnValue(0.01);

    const chromosome = createRandomChromosome(
      megaMasterPool,
      3,
      ['swampert_mega', 'mewtwo'],
      'mega-master-league',
    );

    expect(chromosome.team).toEqual(['swampert_mega', 'mewtwo', 'dragonite']);
    expect(getMegaMasterTeamLegality(chromosome.team)).toMatchObject({
      isLegal: true,
      megaCount: 1,
    });
  });
});
