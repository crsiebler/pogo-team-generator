import { describe, expect, it } from 'vitest';
import {
  BATTLE_FRONTIER_MASTER_MAX_MEGAS,
  BATTLE_FRONTIER_MASTER_MAX_POINTS,
  BATTLE_FRONTIER_MASTER_MAX_FIVE_POINT_POKEMON,
  getBattleFrontierMasterPointsForSpecies,
  getBattleFrontierMasterTeamLegality,
  isBattleFrontierMasterMegaSpecies,
} from '@/lib/data/battleFrontierMasterRules';

describe('Battle Frontier Master rules helper', () => {
  it('returns listed point values for exact species ids', () => {
    expect(getBattleFrontierMasterPointsForSpecies('palkia_origin')).toBe(5);
    expect(getBattleFrontierMasterPointsForSpecies('mewtwo')).toBe(2);
  });

  it('inherits listed point values for ranked shadow variants', () => {
    expect(getBattleFrontierMasterPointsForSpecies('palkia_shadow')).toBe(2);
    expect(
      getBattleFrontierMasterPointsForSpecies('giratina_altered_shadow'),
    ).toBe(1);
  });

  it('does not assign inherited points to unrelated or unlisted species', () => {
    expect(getBattleFrontierMasterPointsForSpecies('hydreigon_shadow')).toBe(0);
    expect(getBattleFrontierMasterPointsForSpecies('not_a_pokemon')).toBe(0);
  });

  it('detects Mega species from structured Pokemon tags', () => {
    expect(isBattleFrontierMasterMegaSpecies('swampert_mega')).toBe(true);
    expect(isBattleFrontierMasterMegaSpecies('charizard_mega_x')).toBe(true);
    expect(isBattleFrontierMasterMegaSpecies('palkia_origin')).toBe(false);
    expect(isBattleFrontierMasterMegaSpecies('not_a_pokemon')).toBe(false);
  });

  it('reports legal team summaries for valid teams', () => {
    expect(BATTLE_FRONTIER_MASTER_MAX_POINTS).toBe(11);
    expect(BATTLE_FRONTIER_MASTER_MAX_FIVE_POINT_POKEMON).toBe(1);
    expect(BATTLE_FRONTIER_MASTER_MAX_MEGAS).toBe(1);

    expect(
      getBattleFrontierMasterTeamLegality([
        'palkia_origin',
        'mewtwo',
        'gallade_mega',
      ]),
    ).toEqual({
      isLegal: true,
      totalPoints: 11,
      fivePointPokemonCount: 1,
      megaCount: 1,
      violations: [],
    });
  });

  it('reports all team-level legality violations', () => {
    expect(
      getBattleFrontierMasterTeamLegality([
        'palkia_origin',
        'eternatus',
        'swampert_mega',
      ]),
    ).toEqual({
      isLegal: false,
      totalPoints: 15,
      fivePointPokemonCount: 3,
      megaCount: 1,
      violations: ['points-cap', 'five-point-limit'],
    });

    expect(
      getBattleFrontierMasterTeamLegality([
        'swampert_mega',
        'gallade_mega',
        'mewtwo',
      ]),
    ).toEqual({
      isLegal: false,
      totalPoints: 11,
      fivePointPokemonCount: 1,
      megaCount: 2,
      violations: ['mega-limit'],
    });
  });
});
