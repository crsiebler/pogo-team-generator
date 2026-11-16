import {
  getBattleFormatById,
  isPickSixOnlyFormat,
  type BattleFormatId,
} from '@/lib/data/battleFormats';
import type { TournamentMode } from '@/lib/types';

/** Returns the required generation mode, leaving open formats configurable. */
export function getRequiredTournamentMode(
  formatId: BattleFormatId,
): TournamentMode | undefined {
  if (formatId === 'laic-2027-gbl-cup') return 'GBL';
  if (
    isPickSixOnlyFormat(formatId) ||
    formatId.startsWith('play-pokemon-') ||
    formatId.startsWith('devon-') ||
    formatId.startsWith('gymbreakers-') ||
    getBattleFormatById(formatId)?.label.includes('Championship Series')
  ) {
    return 'PlayPokemon';
  }
  return undefined;
}
