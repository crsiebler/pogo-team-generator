import {
  assertBattleFormatAvailable,
  hasOneMegaLimitForFormat,
  type BattleFormatId,
} from '@lib/data/battleFormats';
import { getMegaMasterTeamLegality } from '@lib/data/megaMasterRules';

/**
 * Check the team-level legality rules for a supported battle format.
 */
export function isTeamLegalForFormat(
  team: readonly string[],
  formatId: BattleFormatId | undefined,
): boolean {
  if (formatId !== undefined) {
    assertBattleFormatAvailable(formatId);
  }
  if (hasOneMegaLimitForFormat(formatId)) {
    return getMegaMasterTeamLegality([...team]).isLegal;
  }

  return true;
}
