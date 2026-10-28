import { describe, expect, it, vi } from 'vitest';
import {
  createDefaultLineupScoringContext,
  type LineupScoringContext,
} from './lineupScoring';
import { evaluateTournamentCoverage } from './tournamentCoverage';
import { getRankedSpeciesIds } from '@/lib/data/rankings';

function context(
  threats: string[],
  rating: (
    member: string,
    enemy: string,
    shield: number,
    variant?: string,
  ) => number | null,
): LineupScoringContext {
  return {
    threats,
    tournamentThreats: threats,
    getPokemon: () => undefined,
    getRankingScore: () => 90,
    getRoleScore: () => 90,
    getMatchupRating: (member, enemy) => rating(member, enemy, 1),
    getShieldScenarioMatchupRating: rating,
  };
}

describe('direct tournament coverage', () => {
  it('audits the full Play! field and distinguishes the reported shared-counter roster from complementary answers', () => {
    const source = createDefaultLineupScoringContext('play-pokemon');
    const exposed = evaluateTournamentCoverage(
      [
        'corsola_galarian',
        'corviknight',
        'doublade',
        'melmetal',
        'tinkaton',
        'umbreon',
      ],
      undefined,
      source,
    );
    const protectedTeam = evaluateTournamentCoverage(
      [
        'araquanid',
        'carbink',
        'clodsire',
        'corviknight',
        'medicham',
        'umbreon',
      ],
      undefined,
      source,
    );
    expect(exposed.audit.threatCount).toBe(
      getRankedSpeciesIds('play-pokemon').size,
    );
    expect(exposed.audit.threatCount).toBeGreaterThan(120);
    expect(exposed.missingCells).toBe(0);
    expect(protectedTeam.missingCells).toBe(0);
    expect(protectedTeam.coverage).toBeGreaterThan(exposed.coverage);
    expect(protectedTeam.redundancy).toBeGreaterThan(exposed.redundancy);
    expect(protectedTeam.audit.uncoveredCount).toBeLessThan(
      exposed.audit.uncoveredCount,
    );
    expect(protectedTeam.audit.singleAnswerCount).toBeLessThan(
      exposed.audit.singleAnswerCount,
    );
    expect(protectedTeam.audit.pairProtection).toBeGreaterThan(
      exposed.audit.pairProtection,
    );
  });
  it('requires the same backup to survive all three equal-shield scenarios; ties are not answers', () => {
    const result = evaluateTournamentCoverage(
      ['a', 'b', 'c'],
      undefined,
      context(['counter'], (member, _, shield) =>
        member === 'a'
          ? 800
          : member === 'b'
            ? shield === 2
              ? 100
              : 800
            : 500,
      ),
    );
    expect(result.audit.singleAnswerCount).toBe(1);
    expect(result.audit.gaps[0].primaryAnswer).toBe('a');
    expect(result.coverage).toBe(1);
    expect(result.redundancy).toBeLessThan(1);
  });
  it('checks distinct answers against shared counters without any shared-type rule', () => {
    const score = (backup: boolean) =>
      evaluateTournamentCoverage(
        ['a', 'b', 'c'],
        undefined,
        context(['counter-a', 'counter-b'], (member) =>
          member === 'a' || (backup && member === 'b') ? 800 : 100,
        ),
      );
    expect(score(false).audit.evaluatedPairs).toBe(1);
    expect(score(false).audit.pairProtection).toBeCloseTo(0.1);
    expect(score(true).audit.pairProtection).toBe(1);
    expect(score(true).redundancy).toBeGreaterThan(score(false).redundancy);
  });
  it('does not dilute an existing gap with many easy opponents', () => {
    const run = (count: number) =>
      evaluateTournamentCoverage(
        ['a', 'b'],
        undefined,
        context(
          ['counter', ...Array.from({ length: count }, (_, i) => `easy-${i}`)],
          (_, enemy) => (enemy === 'counter' ? 100 : 800),
        ),
      );
    expect(run(6).coverage).toBe(run(100).coverage);
    expect(run(6).redundancy).toBe(run(100).redundancy);
  });
  it('reuses member profiles only within a context and preserves missing evidence', () => {
    const rating = vi.fn(() => 800);
    const source = context(['counter'], rating);
    evaluateTournamentCoverage(['a', 'b'], undefined, source);
    evaluateTournamentCoverage(['b', 'a'], undefined, source);
    expect(rating).toHaveBeenCalledTimes(6);
    const missing = evaluateTournamentCoverage(
      ['a', 'b'],
      undefined,
      context(['counter'], () => null),
    );
    expect(missing.missingCells).toBe(6);
    expect(missing.coverage).toBe(0);
    expect(missing.redundancy).toBe(0);
  });
  it('separates threat-universe identities and rejects malformed ranking scores', () => {
    const first = evaluateTournamentCoverage(
      ['a'],
      undefined,
      context(['counter-a'], () => 800),
    );
    const second = evaluateTournamentCoverage(
      ['a'],
      undefined,
      context(['counter-b'], () => 800),
    );
    expect(first.fingerprint).not.toBe(second.fingerprint);
    expect(() =>
      evaluateTournamentCoverage(['a'], undefined, {
        ...context(['counter-a'], () => 800),
        getRankingScore: () => NaN,
      }),
    ).toThrow('0..100');
  });
});
