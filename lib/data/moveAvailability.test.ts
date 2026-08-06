import { describe, expect, it } from 'vitest';
import {
  getMoveAvailability,
  getMovesetAvailability,
  isApprovedLegacyMove,
} from './moveAvailability';
import { filterPokemon } from './pokemon';

const LEGACY_MOVE_EXPECTATIONS = [
  ['grimer', 'ACID', 'excluded'],
  ['muk', 'ACID', 'excluded'],
  ['koffing', 'ACID', 'excluded'],
  ['weezing', 'ACID', 'excluded'],
  ['chansey', 'PSYBEAM', 'excluded'],
  ['staryu', 'QUICK_ATTACK', 'excluded'],
  ['starmie', 'QUICK_ATTACK', 'excluded'],
  ['porygon', 'QUICK_ATTACK', 'excluded'],
  ['mewtwo', 'COUNTER', 'eventExclusive'],
  ['mewtwo_mega_x', 'COUNTER', 'eventExclusive'],
  ['mewtwo_mega_y', 'COUNTER', 'eventExclusive'],
  ['pichu', 'QUICK_ATTACK', 'excluded'],
  ['delibird', 'QUICK_ATTACK', 'excluded'],
  ['kirlia', 'DRAINING_KISS', 'excluded'],
  ['dialga_origin', 'ROAR_OF_TIME', 'eventExclusive'],
  ['palkia_origin', 'SPACIAL_REND', 'eventExclusive'],
  ['kyurem_black', 'FREEZE_SHOCK', 'eventExclusive'],
  ['kyurem_white', 'ICE_BURN', 'eventExclusive'],
  ['zacian_crowned_sword', 'BEHEMOTH_BLADE', 'eventExclusive'],
  ['zamazenta_crowned_shield', 'BEHEMOTH_BASH', 'eventExclusive'],
] as const;

describe('getMoveAvailability', () => {
  it('allows regular moves without an acquisition requirement', () => {
    expect(
      getMoveAvailability('cradily', 'BULLET_SEED', 'great-league'),
    ).toEqual({ kind: 'regular' });
  });

  it('classifies Elite moves before their ordinary movepool entries', () => {
    expect(
      getMoveAvailability('venusaur', 'FRENZY_PLANT', 'great-league'),
    ).toEqual({ kind: 'elite' });
  });

  it('rejects Frustration unconditionally', () => {
    expect(
      getMoveAvailability('unknown_species', 'FRUSTRATION', 'great-league'),
    ).toEqual({
      kind: 'excluded',
      reason: 'Frustration is not an eligible moveset move.',
    });
  });

  it('allows Return when an exact checked-in shadow variation can be purified under the cap', () => {
    expect(getMoveAvailability('cradily', 'RETURN', 'great-league')).toEqual({
      kind: 'purified',
    });
  });

  it('uses the canonical species when checking alias Return eligibility', () => {
    expect(getMoveAvailability('cradily_b', 'RETURN', 'great-league')).toEqual({
      kind: 'purified',
    });
  });

  it('rejects Return for shadow Pokemon', () => {
    expect(
      getMoveAvailability('cradily_shadow', 'RETURN', 'great-league'),
    ).toEqual({
      kind: 'excluded',
      reason: 'Return requires a purified non-shadow Pokemon.',
    });
  });

  it('does not infer Return eligibility from another form shadow', () => {
    expect(
      getMoveAvailability('slowbro_galarian', 'RETURN', 'ultra-league'),
    ).toEqual({
      kind: 'excluded',
      reason:
        'Return requires a checked-in shadow variation for slowbro_galarian.',
    });
  });

  it('rejects Return when the purified level-25 CP floor exceeds the cap', () => {
    expect(getMoveAvailability('venusaur', 'RETURN', 'great-league')).toEqual({
      kind: 'excluded',
      reason: 'Purified venusaur has a level-25 CP floor above 1500.',
    });
    expect(getMoveAvailability('venusaur', 'RETURN', 'ultra-league')).toEqual({
      kind: 'purified',
    });
  });

  it('allows Return when the purified level-25 CP floor equals the cap', () => {
    expect(getMoveAvailability('rapidash', 'RETURN', 'great-league')).toEqual({
      kind: 'purified',
    });
  });

  it.each(LEGACY_MOVE_EXPECTATIONS)(
    'classifies checked-in legacy pair %s/%s as %s',
    (speciesId, moveId, expectedKind) => {
      const availability = getMoveAvailability(
        speciesId,
        moveId,
        'master-league',
      );

      expect(availability.kind).toBe(expectedKind);
      if (expectedKind === 'excluded') {
        expect(availability).toEqual({
          kind: 'excluded',
          reason: `${moveId} does not have an approved legacy policy for ${speciesId}.`,
        });
      } else {
        expect(availability).toEqual({ kind: 'eventExclusive' });
      }
    },
  );

  it('requires an explicit expectation for every checked-in legacy pair', () => {
    const checkedInPairs = filterPokemon(
      (pokemon) => pokemon.legacyMoves !== undefined,
    )
      .flatMap((pokemon) =>
        (pokemon.legacyMoves ?? []).map(
          (moveId) => `${pokemon.speciesId}/${moveId}`,
        ),
      )
      .sort();
    const expectedPairs = LEGACY_MOVE_EXPECTATIONS.map(
      ([speciesId, moveId]) => `${speciesId}/${moveId}`,
    ).sort();

    expect(expectedPairs).toEqual(checkedInPairs);
    expect(new Set(expectedPairs).size).toBe(expectedPairs.length);
  });

  it('does not approve a legacy move for another form of its species', () => {
    expect(
      getMoveAvailability('mewtwo_armored', 'COUNTER', 'master-league'),
    ).toEqual({
      kind: 'excluded',
      reason: 'COUNTER is unavailable for mewtwo_armored.',
    });
    expect(
      getMoveAvailability('dialga', 'ROAR_OF_TIME', 'master-league'),
    ).toEqual({
      kind: 'excluded',
      reason: 'ROAR_OF_TIME is unavailable for dialga.',
    });
  });

  it('does not approve a legacy move ID without its species pair', () => {
    expect(isApprovedLegacyMove('mewtwo', 'COUNTER')).toBe(true);
    expect(isApprovedLegacyMove('mewtwo_armored', 'COUNTER')).toBe(false);
    expect(isApprovedLegacyMove('dialga', 'ROAR_OF_TIME')).toBe(false);
  });
});

describe('getMovesetAvailability', () => {
  it('carries the purified requirement on the Return move slot', () => {
    expect(
      getMovesetAvailability(
        'cradily',
        {
          fastMove: 'BULLET_SEED',
          chargedMove1: 'ROCK_SLIDE',
          chargedMove2: 'RETURN',
        },
        'great-league',
      ),
    ).toEqual({
      fastMove: { kind: 'regular' },
      chargedMove1: { kind: 'regular' },
      chargedMove2: { kind: 'purified' },
    });
  });
});
