import { describe, expect, it } from 'vitest';
import type { LineupScoringContext } from './lineupScoring';
import { evaluateTournamentRoster } from './opponentRosterEvaluation';
import type { OpponentRosterDataset } from '@/lib/data/opponentRosters';
import { resolveRankedDefaultRosterMovesetAssignment } from '@/lib/genetic/moveset';

const team = [
  'clodsire',
  'lanturn',
  'azumarill',
  'umbreon',
  'altaria',
  'skarmory',
];
const enemies = [
  'bastiodon',
  'talonflame',
  'venusaur',
  'dewgong',
  'medicham',
  'sableye',
];
const dataset: OpponentRosterDataset = {
  formatId: 'great-league',
  fingerprint: 'fixture',
  excluded: [],
  rosters: [
    {
      id: 'one',
      species: enemies,
      assignment: resolveRankedDefaultRosterMovesetAssignment(
        enemies,
        'great-league',
      ),
      family: 'one',
      source: 'synthetic',
      partition: 'selection',
      provenance: 'Controlled test',
      verifiedOn: null,
      adapted: false,
    },
  ],
};
function context(
  rating: (species: string, enemy: string, shields: number) => number | null,
): LineupScoringContext {
  return {
    formatId: 'great-league',
    threats: enemies,
    getPokemon: () => undefined,
    getRankingScore: () => 0.9,
    getRoleScore: () => 0.9,
    getMatchupRating: (s, e) => rating(s, e, 1),
    getShieldScenarioMatchupRating: rating,
  };
}

describe('opponent roster evaluation', () => {
  it('audits unsampled threats and prefers a second answer over redundant wins', () => {
    const audit = (answers: readonly string[]) =>
      evaluateTournamentRoster(
        team,
        undefined,
        dataset,
        {
          ...context((s, e) =>
            e === 'electrode_hisuian' && !answers.includes(s) ? 100 : 800,
          ),
          getRankingScore: () => 90,
          tournamentThreats: [...enemies, 'electrode_hisuian'],
        },
        'selection',
      );
    const exposed = audit([]);
    const single = audit([team[0]]);
    const protectedTeam = audit([team[0], team[1]]);
    expect(single.selection.coverageAudit?.threatCount).toBe(7);
    expect(single.selection.objectives.coverage).toBeGreaterThan(
      exposed.selection.objectives.coverage,
    );
    expect(protectedTeam.selection.objectives.redundancy).toBeGreaterThan(
      single.selection.objectives.redundancy,
    );
    expect(single.selection.coverageAudit?.singleAnswerCount).toBe(1);
  });
  it('does not silently omit missing evidence outside the sampled rosters', () => {
    const result = evaluateTournamentRoster(team, undefined, dataset, {
      ...context((_, enemy) => (enemy === 'electrode_hisuian' ? null : 800)),
      tournamentThreats: [...enemies, 'electrode_hisuian'],
    });
    expect(result.selection.status).toBe('insufficient');
    expect(result.selection.missingCells).toBeGreaterThan(0);
  });
  it('does not reuse one answer to protect against two coexisting shared counters', () => {
    const score = (
      answers: readonly string[],
    ): ReturnType<typeof evaluateTournamentRoster> =>
      evaluateTournamentRoster(
        team,
        undefined,
        dataset,
        context((species, enemy) =>
          enemies.slice(0, 2).includes(enemy) && !answers.includes(species)
            ? 100
            : 800,
        ),
        'selection',
      );
    const bottleneck = score([team[0]]);
    const protectedRoster = score([team[0], team[1]]);
    expect(bottleneck.selection.objectives.typical).toBeLessThan(0.5);
    expect(bottleneck.selection.objectives.flexibility).toBe(0);
    expect(protectedRoster.selection.objectives.typical).toBeGreaterThan(0.5);
    expect(protectedRoster.selection.objectives.flexibility).toBeGreaterThan(0);
  });
  it('does not call a trio viable when every member loses hard to one opposing member', () => {
    const result = evaluateTournamentRoster(
      team,
      undefined,
      dataset,
      context((_, enemy) => (enemy === enemies[0] ? 100 : 800)),
      'selection',
    );
    expect(result.selection.objectives.typical).toBeLessThan(0.5);
    expect(result.selection.objectives.flexibility).toBe(0);
    const repaired = evaluateTournamentRoster(
      team,
      undefined,
      dataset,
      context((species, enemy) =>
        enemy === enemies[0] && species !== team[0] ? 100 : 800,
      ),
      'selection',
    );
    expect(repaired.selection.objectives.typical).toBeGreaterThan(
      result.selection.objectives.typical,
    );
  });
  it('caps each common scenario sample and prefers curated evidence', () => {
    const expanded: OpponentRosterDataset = {
      ...dataset,
      rosters: Array.from({ length: 40 }, (_, i) => ({
        ...dataset.rosters[0],
        id: String(i).padStart(2, '0'),
        source: i >= 30 ? 'curated' : 'synthetic',
        partition: i % 2 === 0 ? 'selection' : 'held-out',
        adapted: i >= 30,
      })),
    };
    for (const [stage, count] of [
      ['search', 8],
      ['selection', 16],
      ['held-out', 8],
    ] as const) {
      const result = evaluateTournamentRoster(
        team,
        undefined,
        expanded,
        context(() => 650),
        stage,
      );
      expect(result.selection.evaluatedRosters).toBe(count);
      expect(result.selection.source).toBe('mixed');
      expect(result.selection.limitations.join(' ')).toMatch(/adapted/i);
    }
  });
  it('evaluates 120 orders but counts only 20 distinct useful trios', () => {
    const result = evaluateTournamentRoster(
      team,
      undefined,
      dataset,
      context(() => 650),
    );
    expect(result.plans).toHaveLength(120);
    expect(new Set(result.plans.map((plan) => plan.trioId)).size).toBe(20);
    expect(result.selection.objectives.flexibility).toBe(1);
    expect(result.selection.objectives.typical).toBeGreaterThan(0.5);
  });
  it('does not let one specialist per threat become an oracle choosing after the hidden trio', () => {
    const result = evaluateTournamentRoster(
      team,
      undefined,
      dataset,
      context((s, e) => (team.indexOf(s) === enemies.indexOf(e) ? 950 : 100)),
    );
    expect(result.selection.objectives.typical).toBeLessThan(0.5);
    expect(result.selection.objectives.flexibility).toBe(0);
  });
  it('rejects partial evidence without inventing losses or a perfect score', () => {
    const result = evaluateTournamentRoster(
      team,
      undefined,
      dataset,
      context((s) => (s === team[0] ? null : 800)),
    );
    expect(result.selection.status).toBe('insufficient');
    expect(result.selection.missingCells).toBeGreaterThan(0);
    expect(result.selection.evaluatedRosters).toBe(0);
  });
  it('is invariant to roster and scenario order and reports marginal specialist value', () => {
    const injected = context((s, e) =>
      s === team[5] && e === enemies[0] ? 900 : e === enemies[0] ? 100 : 650,
    );
    const a = evaluateTournamentRoster(team, undefined, dataset, injected);
    const b = evaluateTournamentRoster(
      [...team].reverse(),
      undefined,
      {
        ...dataset,
        rosters: dataset.rosters.map((r) => ({
          ...r,
          species: [...r.species].reverse(),
        })),
      },
      injected,
    );
    expect(a.selection).toEqual(b.selection);
    expect(a.marginalValue[team[5]]).toBeGreaterThan(a.marginalValue[team[1]]);
  });
});
