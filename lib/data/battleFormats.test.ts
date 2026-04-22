import {
  BATTLE_FORMATS,
  DEFAULT_BATTLE_FORMAT_ID,
  getBattleFormatById,
  getBattleFormats,
  isBattleFrontierFormatId,
  isBattleFormatId,
  type BattleFormatId,
} from './battleFormats';

describe('battle format catalog', () => {
  it('contains the supported formats in priority order', () => {
    expect(BATTLE_FORMATS.map((format) => format.label)).toEqual([
      'Great League',
      'Ultra League',
      'Master League',
      'Battle Frontier (Bayou Cup)',
      'Battle Frontier (Spellcraft Cup)',
      'Battle Frontier (UL Retro)',
      'Battle Frontier (Master)',
      'Kanto Cup',
      'Jungle Cup',
      'Spring Cup',
    ]);
  });

  it('defaults to Great League', () => {
    expect(DEFAULT_BATTLE_FORMAT_ID).toBe<BattleFormatId>('great-league');
  });

  it('validates known format ids', () => {
    expect(isBattleFormatId('great-league')).toBe(true);
    expect(isBattleFormatId('ultra-league')).toBe(true);
    expect(isBattleFormatId('master-league')).toBe(true);
    expect(isBattleFormatId('battle-frontier-bayou-cup')).toBe(true);
    expect(isBattleFormatId('battle-frontier-spellcraft-cup')).toBe(true);
    expect(isBattleFormatId('battle-frontier-ul-retro')).toBe(true);
    expect(isBattleFormatId('battle-frontier-master')).toBe(true);
    expect(isBattleFormatId('kanto-cup')).toBe(true);
    expect(isBattleFormatId('jungle-cup')).toBe(true);
    expect(isBattleFormatId('spring-cup')).toBe(true);
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

    expect(getBattleFormatById('jungle-cup')).toEqual({
      id: 'jungle-cup',
      label: 'Jungle Cup',
      cup: 'jungle',
      cp: 1500,
    });

    expect(getBattleFormatById('battle-frontier-bayou-cup')).toEqual({
      id: 'battle-frontier-bayou-cup',
      label: 'Battle Frontier (Bayou Cup)',
      cup: 'bayou',
      cp: 1500,
    });

    expect(getBattleFormatById('battle-frontier-spellcraft-cup')).toEqual({
      id: 'battle-frontier-spellcraft-cup',
      label: 'Battle Frontier (Spellcraft Cup)',
      cup: 'spellcraft',
      cp: 1500,
    });

    expect(getBattleFormatById('battle-frontier-ul-retro')).toEqual({
      id: 'battle-frontier-ul-retro',
      label: 'Battle Frontier (UL Retro)',
      cup: 'bfretro',
      cp: 2500,
    });

    expect(getBattleFormatById('battle-frontier-master')).toEqual({
      id: 'battle-frontier-master',
      label: 'Battle Frontier (Master)',
      cup: 'battlefrontiermaster',
      cp: 10000,
    });

    expect(getBattleFormatById('spring-cup')).toEqual({
      id: 'spring-cup',
      label: 'Spring Cup',
      cup: 'spring',
      cp: 1500,
    });

    expect(getBattleFormatById('little-cup')).toBeUndefined();
  });

  it('returns a read-only format list via helper', () => {
    expect(getBattleFormats()).toEqual(BATTLE_FORMATS);
  });

  it('identifies Battle Frontier formats', () => {
    expect(isBattleFrontierFormatId('battle-frontier-bayou-cup')).toBe(true);
    expect(isBattleFrontierFormatId('battle-frontier-spellcraft-cup')).toBe(
      true,
    );
    expect(isBattleFrontierFormatId('battle-frontier-ul-retro')).toBe(true);
    expect(isBattleFrontierFormatId('battle-frontier-master')).toBe(true);
    expect(isBattleFrontierFormatId('great-league')).toBe(false);
    expect(isBattleFrontierFormatId('kanto-cup')).toBe(false);
  });
});
