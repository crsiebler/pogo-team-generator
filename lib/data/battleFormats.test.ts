import {
  BATTLE_FORMATS,
  DEFAULT_BATTLE_FORMAT_ID,
  getBattleFormatById,
  getBattleFormats,
  isBattleFormatId,
  type BattleFormatId,
} from './battleFormats';

describe('battle format catalog', () => {
  it('contains the supported formats in priority order', () => {
    expect(BATTLE_FORMATS.map((format) => format.label)).toEqual([
      'Great League',
      'Ultra League',
      'Master League',
      'Kanto Cup',
    ]);
  });

  it('defaults to Great League', () => {
    expect(DEFAULT_BATTLE_FORMAT_ID).toBe<BattleFormatId>('great-league');
  });

  it('validates known format ids', () => {
    expect(isBattleFormatId('great-league')).toBe(true);
    expect(isBattleFormatId('ultra-league')).toBe(true);
    expect(isBattleFormatId('master-league')).toBe(true);
    expect(isBattleFormatId('kanto-cup')).toBe(true);
  });

  it('rejects unknown format ids', () => {
    expect(isBattleFormatId('little-cup')).toBe(false);
    expect(isBattleFormatId('')).toBe(false);
  });

  it('looks up format metadata by id', () => {
    expect(getBattleFormatById('great-league')).toEqual({
      id: 'great-league',
      label: 'Great League',
      cup: 'all',
      cp: 1500,
    });

    expect(getBattleFormatById('kanto-cup')).toEqual({
      id: 'kanto-cup',
      label: 'Kanto Cup',
      cup: 'kanto',
      cp: 1500,
    });

    expect(getBattleFormatById('little-cup')).toBeUndefined();
  });

  it('returns a read-only format list via helper', () => {
    expect(getBattleFormats()).toEqual(BATTLE_FORMATS);
  });
});
