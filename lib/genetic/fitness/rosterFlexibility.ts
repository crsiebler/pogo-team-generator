import type { TournamentPlan } from './opponentRosterEvaluation';
import { TOURNAMENT_POLICY } from '@/lib/genetic/paretoSelection';

/** Core/pivot summaries retain counter profiles rather than counting orders. */
export interface RosterFlexibility {
  readonly independence: number;
  readonly protectedCoreCount: number;
  readonly independentPivotCount: number;
  readonly marginalValue: Readonly<Record<string, number>>;
}

/** Measures protected pairs, counter-profile diversity, and removal effects. */
export function evaluateRosterFlexibility(
  roster: readonly string[],
  plans: readonly TournamentPlan[],
  bestByRoster: readonly number[],
  // One row per member, one column per enemy in the shared corpus.
  matchupProfiles: readonly (readonly number[])[],
): RosterFlexibility {
  const threshold = TOURNAMENT_POLICY.viablePlanQuality;
  const viable = plans.filter((plan) =>
    plan.qualityByRoster.some((value) => value >= threshold),
  );
  const coreProfiles: boolean[][] = [];
  for (let a = 0; a < roster.length; a++)
    for (let b = a + 1; b < roster.length; b++) {
      const containing = viable.filter(
        (plan) =>
          members(plan).includes(roster[a]) &&
          members(plan).includes(roster[b]),
      );
      if (!containing.length) continue;
      const supported = matchupProfiles[a].map((_, i) => {
        const scenario = Math.floor(i / 6);
        // One coexisting third member must cover this core's shared counters
        // within a usable plan against THIS opposing roster.
        return containing.some((plan) => {
          if (plan.qualityByRoster[scenario] < threshold) return false;
          const third = roster.indexOf(
            members(plan).find((id) => id !== roster[a] && id !== roster[b])!,
          );
          for (let j = scenario * 6; j < scenario * 6 + 6; j++) {
            if (
              Math.max(matchupProfiles[a][j], matchupProfiles[b][j]) <
                threshold &&
              matchupProfiles[third][j] < threshold
            )
              return false;
          }
          return true;
        });
      });
      if (supported.some(Boolean)) coreProfiles.push(supported);
    }
  const pivotIds = [...new Set(viable.map((plan) => plan.lineup.switch))];
  const pivotProfiles = pivotIds.map((id) =>
    matchupProfiles[roster.indexOf(id)].map(
      (value, index) =>
        value >= threshold &&
        viable.some(
          (plan) =>
            plan.lineup.switch === id &&
            plan.qualityByRoster[Math.floor(index / 6)] >= threshold,
        ),
    ),
  );
  const complementarity = (profiles: boolean[][]): number => {
    if (!profiles.length || !profiles[0].length) return 0;
    if (profiles.length === 1) return 0;
    let best = 0;
    for (let a = 0; a < profiles.length; a++)
      for (let b = a + 1; b < profiles.length; b++) {
        const coverage =
          profiles[a].filter((value, i) => value || profiles[b][i]).length /
          profiles[a].length;
        best = Math.max(best, coverage);
      }
    return best;
  };
  const marginalValue = Object.fromEntries(
    roster.map((id) => {
      const without = plans.filter((plan) => !members(plan).includes(id));
      const lost = bestByRoster.map((best, index) =>
        Math.max(
          0,
          best -
            Math.max(0, ...without.map((plan) => plan.qualityByRoster[index])),
        ),
      );
      const member = roster.indexOf(id);
      const useful = viable.some((plan) => members(plan).includes(id));
      const protectionLoss =
        useful && matchupProfiles[member].length
          ? matchupProfiles[member].reduce(
              (sum, value, index) =>
                sum +
                Math.max(
                  0,
                  value -
                    Math.max(
                      0,
                      ...matchupProfiles
                        .filter((_, i) => i !== member)
                        .map((profile) => profile[index]),
                    ),
                ),
              0,
            ) / matchupProfiles[member].length
          : 0;
      return [
        id,
        Math.max(
          protectionLoss,
          lost.length
            ? lost.reduce((sum, value) => sum + value, 0) / lost.length
            : 0,
        ),
      ];
    }),
  );
  return {
    independence: Math.min(
      complementarity(coreProfiles),
      complementarity(pivotProfiles),
    ),
    protectedCoreCount: coreProfiles.length,
    independentPivotCount: new Set(
      pivotProfiles.map((profile) => profile.map(Number).join('')),
    ).size,
    marginalValue,
  };
}

function members(plan: TournamentPlan): string[] {
  return [plan.lineup.lead, plan.lineup.switch, plan.lineup.closer];
}
