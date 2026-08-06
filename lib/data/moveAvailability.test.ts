import { describe, expect, it } from 'vitest';
import {
  getMoveAvailability,
  getMovesetAvailability,
} from './moveAvailability';

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

  it('keeps legacy policy excluded until a species-move pair is approved', () => {
    expect(getMoveAvailability('grimer', 'ACID', 'great-league')).toEqual({
      kind: 'excluded',
      reason: 'ACID does not have an approved legacy policy for grimer.',
    });
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
