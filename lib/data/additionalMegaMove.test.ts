import { describe, expect, it } from 'vitest';
import {
  getAdditionalChargedMove,
  isEligibleForAdditionalChargedMove,
  resolveAdditionalChargedMove,
} from './additionalMegaMove';
import { getMoveByMoveId } from './moves';
import { filterPokemon } from './pokemon';
import type { Move } from '@/lib/types';

const eligibleMegaMoves = {
  chesnaught_mega: 'SEED_BOMB_PLUS',
  delphox_mega: 'MYSTICAL_FIRE_PLUS',
  dragonite_mega: 'OUTRAGE_PLUS',
  falinks_mega: 'BRICK_BREAK_PLUS',
  greninja_mega: 'SURF_PLUS',
  malamar_mega: 'PSYBEAM_PLUS',
  mewtwo_mega_x: 'DYNAMIC_PUNCH_PLUS',
  mewtwo_mega_y: 'FUTURE_SIGHT_PLUS',
  raichu_mega_x: 'VOLT_TACKLE_PLUS',
  raichu_mega_y: 'ZAP_CANNON_PLUS',
  skarmory_mega: 'DRILL_PECK_PLUS',
  starmie_mega: 'LIQUIDATION_PLUS',
  victreebel_mega: 'ACID_SPRAY_PLUS',
} as const;

describe('additional Mega charged move resolution', () => {
  it.each(Object.entries(eligibleMegaMoves))(
    'resolves the synchronized move for %s',
    (speciesId, moveId) => {
      expect(getAdditionalChargedMove(speciesId)).toBe(moveId);
    },
  );

  it('covers every currently synchronized eligible Mega form', () => {
    const synchronizedEligibleSpecies = filterPokemon(
      (pokemon) => getAdditionalChargedMove(pokemon.speciesId) !== undefined,
    ).map((pokemon) => pokemon.speciesId);

    expect(synchronizedEligibleSpecies.sort()).toEqual(
      Object.keys(eligibleMegaMoves).sort(),
    );
  });

  it('rejects an ordinary Mega without an additional move', () => {
    expect(
      resolveAdditionalChargedMove(
        { tags: ['mega'], extraChargedMoves: [] },
        getMoveByMoveId,
      ),
    ).toBeUndefined();
  });

  it('rejects multiple additional moves instead of choosing one', () => {
    expect(
      resolveAdditionalChargedMove(
        {
          tags: ['mega'],
          extraChargedMoves: ['FIRST_PLUS', 'SECOND_PLUS'],
        },
        () => undefined,
      ),
    ).toBeUndefined();
  });

  it('rejects an additional move that is missing or not a Mega move', () => {
    const regularMove: Move = {
      moveId: 'REGULAR_MOVE',
      name: 'Regular Move',
      type: 'normal',
      power: 1,
      energy: 1,
      energyGain: 1,
      cooldown: 1,
      archetype: 'Charged',
    };
    const getMove = (moveId: string): Move | undefined =>
      moveId === regularMove.moveId ? regularMove : undefined;

    expect(
      resolveAdditionalChargedMove(
        { tags: ['mega'], extraChargedMoves: ['MISSING_MOVE'] },
        getMove,
      ),
    ).toBeUndefined();
    expect(
      resolveAdditionalChargedMove(
        { tags: ['mega'], extraChargedMoves: [regularMove.moveId] },
        getMove,
      ),
    ).toBeUndefined();
  });

  it('excludes extra moves on non-Mega forms such as Cramorant', () => {
    expect(getAdditionalChargedMove('cramorant')).toBeUndefined();
    expect(getAdditionalChargedMove('cramorant_gulping')).toBeUndefined();
    expect(getAdditionalChargedMove('cramorant_gorging')).toBeUndefined();
  });

  it('exposes eligibility separately from the resolved move', () => {
    expect(
      isEligibleForAdditionalChargedMove(
        {
          tags: ['mega'],
          extraChargedMoves: ['ACID_SPRAY_PLUS'],
        },
        getMoveByMoveId,
      ),
    ).toBe(true);
    expect(
      isEligibleForAdditionalChargedMove(
        {
          tags: ['mega'],
          extraChargedMoves: ['ACID_SPRAY_PLUS', 'OUTRAGE_PLUS'],
        },
        getMoveByMoveId,
      ),
    ).toBe(false);
  });
});
