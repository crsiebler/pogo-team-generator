import {
  hasOneMegaLimitForFormat,
  type BattleFormatId,
} from '@lib/data/battleFormats';
import { getBattleFrontierMasterTeamLegality } from '@lib/data/battleFrontierMasterRules';
import { getMegaMasterTeamLegality } from '@lib/data/megaMasterRules';

/**
 * Check the team-level legality rules for a supported battle format.
 */
export function isTeamLegalForFormat(
  team: readonly string[],
  formatId: BattleFormatId | undefined,
): boolean {
  if (formatId === 'battle-frontier-master') {
    return getBattleFrontierMasterTeamLegality([...team]).isLegal;
  }

  if (hasOneMegaLimitForFormat(formatId)) {
    return getMegaMasterTeamLegality([...team]).isLegal;
  }

  return true;
}
