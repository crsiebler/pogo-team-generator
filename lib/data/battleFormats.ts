export interface BattleFormat {
  id: BattleFormatId;
  label: string;
  cup: 'all' | 'kanto';
  cp: 1500 | 2500 | 10000;
}

/**
 * Supported battle format identifiers.
 */
export type BattleFormatId =
  | 'great-league'
  | 'ultra-league'
  | 'master-league'
  | 'kanto-cup';

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
    id: 'kanto-cup',
    label: 'Kanto Cup',
    cup: 'kanto',
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
