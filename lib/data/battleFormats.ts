export interface BattleFormat {
  id: BattleFormatId;
  label: string;
  cup:
    | 'all'
    | 'sunshine'
    | 'copadiluvio'
    | 'tsuki'
    | 'ligaultra'
    | 'mega'
    | 'coupedusillage';
  cp: 1500 | 2500 | 10000;
}

/**
 * Supported battle format identifiers.
 */
export type BattleFormatId =
  | 'great-league'
  | 'ultra-league'
  | 'master-league'
  | 'mega-master-league'
  | 'sunshine-cup'
  | 'battle-frontier-copa-diluvio'
  | 'battle-frontier-tsuki-cup'
  | 'battle-frontier-liga-ultra'
  | 'battle-frontier-coupe-du-sillage';

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
    id: 'mega-master-league',
    label: 'Mega Master League',
    cup: 'mega',
    cp: 10000,
  },
  {
    id: 'sunshine-cup',
    label: 'Sunshine Cup',
    cup: 'sunshine',
    cp: 1500,
  },
  {
    id: 'battle-frontier-copa-diluvio',
    label: 'Battle Frontier (Copa Diluvio)',
    cup: 'copadiluvio',
    cp: 1500,
  },
  {
    id: 'battle-frontier-tsuki-cup',
    label: 'Battle Frontier (Tsuki Cup)',
    cup: 'tsuki',
    cp: 1500,
  },
  {
    id: 'battle-frontier-liga-ultra',
    label: 'Battle Frontier (Liga Ultra)',
    cup: 'ligaultra',
    cp: 2500,
  },
  {
    id: 'battle-frontier-coupe-du-sillage',
    label: 'Battle Frontier (Coupe du Sillage)',
    cup: 'coupedusillage',
    cp: 10000,
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

/**
 * Returns whether a supported format is part of the Battle Frontier series.
 */
export function isBattleFrontierFormatId(formatId: BattleFormatId): boolean {
  return formatId.startsWith('battle-frontier-');
}
