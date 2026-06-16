import { describe, expect, it } from 'vitest';
import {
  getMegaMasterTeamLegality,
  isMegaMasterMegaSpecies,
  MEGA_MASTER_MAX_MEGAS,
} from './megaMasterRules';

describe('Mega Master League rules helper', () => {
  it('detects Mega species from structured Pokemon tags', () => {
    expect(isMegaMasterMegaSpecies('swampert_mega')).toBe(true);
    expect(isMegaMasterMegaSpecies('charizard_mega_x')).toBe(true);
    expect(isMegaMasterMegaSpecies('palkia_origin')).toBe(false);
    expect(isMegaMasterMegaSpecies('not_a_pokemon')).toBe(false);
  });

  it('reports legal teams with no more than one Mega Pokemon', () => {
    expect(MEGA_MASTER_MAX_MEGAS).toBe(1);

    expect(
      getMegaMasterTeamLegality(['swampert_mega', 'mewtwo', 'dragonite']),
    ).toEqual({
      isLegal: true,
      megaCount: 1,
      violations: [],
    });

    expect(
      getMegaMasterTeamLegality(['palkia_origin', 'mewtwo', 'dragonite']),
    ).toEqual({
      isLegal: true,
      megaCount: 0,
      violations: [],
    });
  });

  it('reports the Mega limit violation for teams with multiple Mega Pokemon', () => {
    expect(
      getMegaMasterTeamLegality(['swampert_mega', 'gallade_mega', 'dragonite']),
    ).toEqual({
      isLegal: false,
      megaCount: 2,
      violations: ['mega-limit'],
    });
  });
});
