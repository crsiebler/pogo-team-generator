export interface BattleFormat {
  id: BattleFormatId;
  label: string;
  cup:
    | 'all'
    | 'kanto'
    | 'jungle'
    | 'spring'
    | 'bayou'
    | 'spellcraft'
    | 'bfretro'
    | 'battlefrontiermaster';
  cp: 1500 | 2500 | 10000;
}

/**
 * Supported battle format identifiers.
 */
export type BattleFormatId =
  | 'great-league'
  | 'ultra-league'
  | 'master-league'
  | 'battle-frontier-bayou-cup'
  | 'battle-frontier-spellcraft-cup'
  | 'battle-frontier-ul-retro'
  | 'battle-frontier-master'
  | 'kanto-cup'
  | 'jungle-cup'
  | 'spring-cup';

/**
 * Catalog of supported battle formats.
 */
export const BATTLE_FORMATS: readonly BattleFormat[] = [
  {
    id: 'great-league',
    label: 'Great League',
    cup: 'all',
    cp: 1500,
  },
  {
    id: 'ultra-league',
    label: 'Ultra League',
    cup: 'all',
    cp: 2500,
  },
  {
    id: 'master-league',
    label: 'Master League',
    cup: 'all',
    cp: 10000,
  },
  {
    id: 'battle-frontier-bayou-cup',
    label: 'Battle Frontier (Bayou Cup)',
    cup: 'bayou',
    cp: 1500,
  },
  {
    id: 'battle-frontier-spellcraft-cup',
    label: 'Battle Frontier (Spellcraft Cup)',
    cup: 'spellcraft',
    cp: 1500,
  },
  {
    id: 'battle-frontier-ul-retro',
    label: 'Battle Frontier (UL Retro)',
    cup: 'bfretro',
    cp: 2500,
  },
  {
    id: 'battle-frontier-master',
    label: 'Battle Frontier (Master)',
    cup: 'battlefrontiermaster',
    cp: 10000,
  },
  {
    id: 'kanto-cup',
    label: 'Kanto Cup',
    cup: 'kanto',
    cp: 1500,
  },
  {
    id: 'jungle-cup',
    label: 'Jungle Cup',
    cup: 'jungle',
    cp: 1500,
  },
  {
    id: 'spring-cup',
    label: 'Spring Cup',
    cup: 'spring',
    cp: 1500,
  },
];

/**
 * Default battle format id for team generation flows.
 */
export const DEFAULT_BATTLE_FORMAT_ID: BattleFormatId = 'great-league';

const battleFormatLookup: ReadonlyMap<BattleFormatId, BattleFormat> = new Map(
  BATTLE_FORMATS.map((format) => [format.id, format]),
);

/**
 * Returns the complete supported battle format catalog.
 */
export function getBattleFormats(): readonly BattleFormat[] {
  return BATTLE_FORMATS;
}

/**
 * Validates a format id against the supported battle format catalog.
 */
export function isBattleFormatId(value: string): value is BattleFormatId {
  return battleFormatLookup.has(value as BattleFormatId);
}

/**
 * Looks up battle format metadata for a supported format id.
 */
export function getBattleFormatById(
  formatId: string,
): BattleFormat | undefined {
  if (!isBattleFormatId(formatId)) {
    return undefined;
  }

  return battleFormatLookup.get(formatId);
}
