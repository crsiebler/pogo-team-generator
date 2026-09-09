export interface BattleFormat {
  id: BattleFormatId;
  label: string;
  cup:
    | 'all'
    | 'copadiluvio'
    | 'tsuki'
    | 'ligaultra'
    | 'coupedusillage'
    | 'mega';
  cp: 1500 | 2500 | 10000;
}

/**
 * Supported battle format identifiers.
 */
export type BattleFormatId =
  | 'great-league'
  | 'mega-great-league'
  | 'ultra-league'
  | 'mega-ultra-league'
  | 'master-league'
  | 'mega-master-league'
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
    id: 'mega-great-league',
    label: 'Great League: Mega Edition',
    cup: 'mega',
    cp: 1500,
  },
  {
    id: 'ultra-league',
    label: 'Ultra League',
    cup: 'all',
    cp: 2500,
  },
  {
    id: 'mega-ultra-league',
    label: 'Ultra League: Mega Edition',
    cup: 'mega',
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
    label: 'Master League: Mega Edition',
    cup: 'mega',
    cp: 10000,
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

const oneMegaLimitFormatIds: ReadonlySet<BattleFormatId> = new Set([
  'mega-great-league',
  'mega-ultra-league',
  'mega-master-league',
  'battle-frontier-coupe-du-sillage',
]);

const selectableBattleFormatIds: readonly BattleFormatId[] = [
  'great-league',
  'ultra-league',
  'master-league',
  'mega-great-league',
  'mega-ultra-league',
  'mega-master-league',
  'battle-frontier-copa-diluvio',
  'battle-frontier-tsuki-cup',
  'battle-frontier-liga-ultra',
  'battle-frontier-coupe-du-sillage',
];

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
 * Returns battle formats exposed in the team configuration selector.
 */
export function getSelectableBattleFormats(): readonly BattleFormat[] {
  return selectableBattleFormatIds.map((formatId) => {
    const format = battleFormatLookup.get(formatId);
    if (!format) {
      throw new Error(`Selectable battle format '${formatId}' is unsupported`);
    }

    return format;
  });
}

/**
 * Validates a format id against the supported battle format catalog.
 */
export function isBattleFormatId(value: string): value is BattleFormatId {
  return battleFormatLookup.has(value as BattleFormatId);
}

/**
 * Returns whether teams in this format are limited to one active Mega Pokemon.
 */
export function hasOneMegaLimitForFormat(
  formatId: BattleFormatId | undefined,
): boolean {
  return formatId !== undefined && oneMegaLimitFormatIds.has(formatId);
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
