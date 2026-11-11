import {
  getBattleFormatById,
  getBattleFormats,
  type BattleFormat,
  type BattleFormatId,
} from '@/lib/data/battleFormats';

/** Resolve an explicit sync scope without applying runtime availability gates. */
export function getSyncBattleFormats(
  formatIds?: readonly BattleFormatId[],
): readonly BattleFormat[] {
  if (formatIds === undefined) return getBattleFormats();
  if (formatIds.length === 0) {
    throw new Error('A scoped sync requires at least one format.');
  }
  return [...new Set(formatIds)].map((id) => {
    const format = getBattleFormatById(id);
    if (!format) throw new Error(`Unknown sync format: ${id}`);
    return format;
  });
}
