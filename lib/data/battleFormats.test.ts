import {
  BATTLE_FORMATS,
  DEFAULT_BATTLE_FORMAT_ID,
  getBattleFormatById,
  getBattleFormats,
  hasOneMegaLimitForFormat,
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
      'Mega Master League',
      'Summer Cup',
      'Battle Frontier (Copa Diluvio)',
      'Battle Frontier (Tsuki Cup)',
      'Battle Frontier (Liga Ultra)',
      'Battle Frontier (Coupe du Sillage)',
    ]);
  });

  it('defaults to Great League', () => {
    expect(DEFAULT_BATTLE_FORMAT_ID).toBe<BattleFormatId>('great-league');
  });

  it('validates known format ids', () => {
    expect(isBattleFormatId('great-league')).toBe(true);
    expect(isBattleFormatId('ultra-league')).toBe(true);
    expect(isBattleFormatId('master-league')).toBe(true);
    expect(isBattleFormatId('mega-master-league')).toBe(true);
    expect(isBattleFormatId('summer-cup')).toBe(true);
    expect(isBattleFormatId('battle-frontier-copa-diluvio')).toBe(true);
    expect(isBattleFormatId('battle-frontier-tsuki-cup')).toBe(true);
    expect(isBattleFormatId('battle-frontier-liga-ultra')).toBe(true);
    expect(isBattleFormatId('battle-frontier-coupe-du-sillage')).toBe(true);
  });

  it('rejects unknown format ids', () => {
    expect(isBattleFormatId('little-cup')).toBe(false);
    expect(isBattleFormatId('kanto-cup')).toBe(false);
    expect(isBattleFormatId('spring-cup')).toBe(false);
    expect(isBattleFormatId('fantasy-cup')).toBe(false);
    expect(isBattleFormatId('jungle-cup')).toBe(false);
    expect(isBattleFormatId('')).toBe(false);
  });

  it('looks up format metadata by id', () => {
    expect(getBattleFormatById('great-league')).toEqual({
      id: 'great-league',
      label: 'Great League',
      cup: 'all',
      cp: 1500,
    });

    expect(getBattleFormatById('mega-master-league')).toEqual({
      id: 'mega-master-league',
      label: 'Mega Master League',
      cup: 'mega',
      cp: 10000,
    });

    expect(getBattleFormatById('summer-cup')).toEqual({
      id: 'summer-cup',
      label: 'Summer Cup',
      cup: 'summer',
      cp: 1500,
    });

    expect(getBattleFormatById('battle-frontier-copa-diluvio')).toEqual({
      id: 'battle-frontier-copa-diluvio',
      label: 'Battle Frontier (Copa Diluvio)',
      cup: 'copadiluvio',
      cp: 1500,
    });

    expect(getBattleFormatById('battle-frontier-tsuki-cup')).toEqual({
      id: 'battle-frontier-tsuki-cup',
      label: 'Battle Frontier (Tsuki Cup)',
      cup: 'tsuki',
      cp: 1500,
    });

    expect(getBattleFormatById('battle-frontier-liga-ultra')).toEqual({
      id: 'battle-frontier-liga-ultra',
      label: 'Battle Frontier (Liga Ultra)',
      cup: 'ligaultra',
      cp: 2500,
    });

    expect(getBattleFormatById('battle-frontier-coupe-du-sillage')).toEqual({
      id: 'battle-frontier-coupe-du-sillage',
      label: 'Battle Frontier (Coupe du Sillage)',
      cup: 'coupedusillage',
      cp: 10000,
    });

    expect(getBattleFormatById('little-cup')).toBeUndefined();
    expect(getBattleFormatById('kanto-cup')).toBeUndefined();
    expect(getBattleFormatById('spring-cup')).toBeUndefined();
    expect(getBattleFormatById('fantasy-cup')).toBeUndefined();
    expect(getBattleFormatById('jungle-cup')).toBeUndefined();
    expect(getBattleFormatById('naic-2026-championship-cup')).toBeUndefined();
    expect(getBattleFormatById('battle-frontier-bayou-cup')).toBeUndefined();
    expect(
      getBattleFormatById('battle-frontier-spellcraft-cup'),
    ).toBeUndefined();
    expect(getBattleFormatById('battle-frontier-ul-retro')).toBeUndefined();
    expect(getBattleFormatById('battle-frontier-master')).toBeUndefined();
  });

  it('returns a read-only format list via helper', () => {
    expect(getBattleFormats()).toEqual(BATTLE_FORMATS);
  });

  it('identifies Battle Frontier formats', () => {
    expect(isBattleFrontierFormatId('battle-frontier-copa-diluvio')).toBe(true);
    expect(isBattleFrontierFormatId('battle-frontier-tsuki-cup')).toBe(true);
    expect(isBattleFrontierFormatId('battle-frontier-liga-ultra')).toBe(true);
    expect(isBattleFrontierFormatId('battle-frontier-coupe-du-sillage')).toBe(
      true,
    );
    expect(isBattleFrontierFormatId('great-league')).toBe(false);
    expect(isBattleFrontierFormatId('mega-master-league')).toBe(false);
    expect(isBattleFrontierFormatId('summer-cup')).toBe(false);
  });

  it('identifies formats with a one-Mega team limit', () => {
    expect(hasOneMegaLimitForFormat('mega-master-league')).toBe(true);
    expect(hasOneMegaLimitForFormat('battle-frontier-coupe-du-sillage')).toBe(
      true,
    );
    expect(hasOneMegaLimitForFormat('master-league')).toBe(false);
    expect(hasOneMegaLimitForFormat('battle-frontier-tsuki-cup')).toBe(false);
    expect(hasOneMegaLimitForFormat(undefined)).toBe(false);
  });
});
