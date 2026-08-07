import { describe, expect, it, vi } from 'vitest';
import {
  MAX_ASSIGNMENTS_PER_FINALIST,
  MAX_FULLY_SCORED_ASSIGNMENTS_PER_FINALIST,
  rerankRosterFinalists,
  scoreLightweightRosterAssignment,
} from './finalistReranking';
import { createRosterMovesetAssignment } from '@/lib/genetic/moveset';
import type {
  Chromosome,
  MovesetVariant,
  OptimizerScoreBreakdown,
  RosterMovesetAssignment,
} from '@/lib/types';

const roster = ['a', 'b', 'c', 'd', 'e', 'f'];

function createManifestAuthorities(
  speciesIds: readonly string[],
): RosterMovesetAssignment['authorityBySpeciesId'] {
  return Object.fromEntries(
    speciesIds.map((speciesId) => [
      speciesId,
      {
        source: 'manifest' as const,
        schemaVersion: 1,
        policyVersion: 'ranking-evidence-v1',
      },
    ]),
  );
}

function createVariant(index: number, isDefault = false): MovesetVariant {
  return {
    id: `fast_${index}--charged_b--charged_a`,
    fastMove: `FAST_${index}`,
    chargedMove1: 'CHARGED_B',
    chargedMove2: 'CHARGED_A',
    isDefault,
  };
}

function createAssignment(index: number): RosterMovesetAssignment {
  return createRosterMovesetAssignment({
    formatId: 'great-league',
    authorityBySpeciesId: createManifestAuthorities(roster),
    variantsBySpeciesId: Object.fromEntries(
      roster.map((speciesId) => [speciesId, createVariant(index, index === 0)]),
    ),
  });
}

function createCombinationAssignment(index: number): RosterMovesetAssignment {
  return createRosterMovesetAssignment({
    formatId: 'great-league',
    authorityBySpeciesId: createManifestAuthorities(roster),
    variantsBySpeciesId: Object.fromEntries(
      roster.map((speciesId, speciesIndex) => {
        const variantIndex = Math.floor(index / 3 ** speciesIndex) % 3;
        return [speciesId, createVariant(variantIndex, variantIndex === 0)];
      }),
    ),
  });
}

function createScoreBreakdown(score: number): OptimizerScoreBreakdown {
  return {
    components: {
      synergy: score,
      coverage: score,
      safety: score,
      consistency: score,
      bulk: score,
      defensiveRatio: score,
      offensiveRatio: score,
      role: score,
    },
    weights: {
      synergy: 0.24,
      coverage: 0.21,
      safety: 0.17,
      consistency: 0.13,
      bulk: 0.1,
      defensiveRatio: 0.07,
      offensiveRatio: 0.05,
      role: 0.03,
    },
    score,
  };
}

describe('finalist assignment reranking', () => {
  it('weights top-meta answer depth above full-meta breadth', () => {
    const assignment = createAssignment(1);
    const score = scoreLightweightRosterAssignment(
      assignment,
      ['top_threat'],
      ['full_threat'],
      (speciesId, threat) => {
        if (threat === 'top_threat') {
          return speciesId === 'a' ? 700 : speciesId === 'b' ? 600 : null;
        }
        return speciesId === 'a' ? 300 : null;
      },
    );

    expect(score).toBeGreaterThan(0.5);
    expect(score).toBeLessThan(1);
  });

  it('qualifies manifest defaults and leaves ranked fallbacks unqualified', () => {
    const manifestAssignment = createAssignment(0);
    const assignment = createRosterMovesetAssignment({
      formatId: 'great-league',
      authorityBySpeciesId: {
        ...manifestAssignment.authorityBySpeciesId,
        b: {
          source: 'ranked-default-fallback',
          schemaVersion: 0,
          policyVersion: 'ranked-default-v1',
        },
      },
      variantsBySpeciesId: manifestAssignment.variantsBySpeciesId,
    });
    const qualifiers = new Map<string, string | undefined>();

    scoreLightweightRosterAssignment(
      assignment,
      ['top_threat'],
      [],
      (speciesId, _threat, variantId) => {
        qualifiers.set(speciesId, variantId);
        return 500;
      },
    );

    expect(qualifiers.get('a')).toBe(assignment.variantsBySpeciesId.a.id);
    expect(qualifiers.get('b')).toBeUndefined();
  });

  it('prefilters every bounded assignment but fully scores only the top twelve', () => {
    const assignments = Array.from(
      { length: MAX_ASSIGNMENTS_PER_FINALIST },
      (_, index) => createCombinationAssignment(index),
    );
    const scoreAssignment = vi.fn((_finalist, assignment, lightweightScore) => {
      expect(Number.isFinite(lightweightScore)).toBe(true);
      const score =
        assignment.fingerprint === assignments[0].fingerprint ? 1 : 0.5;
      return {
        roster,
        fitness: score,
        scoreBreakdown: createScoreBreakdown(score),
        evaluatedLineupCount: 120,
        metrics: {
          viableLineupCount: 1,
          topLineupQuality: score,
          topNLineupDepth: score,
          dominatingMatchupRate: 0,
          overwhelmingLossRate: 0,
          singleAnswerRisks: [],
          viableLeadDiversity: 1,
          benchUtilitySummary: [],
        },
      };
    });
    const getMatchupRating = vi.fn(() => 500);

    const result = rerankRosterFinalists([{ team: roster, fitness: 0.9 }], {
      getAssignments: () => assignments,
      getMatchupRating,
      scoreAssignment,
      topThreats: ['top_threat'],
      fullMetaThreats: ['full_threat'],
      getCanonicalRosterKey: (team) => JSON.stringify(team),
    });

    expect(result.stats.assignmentEvaluationCount).toBe(
      MAX_ASSIGNMENTS_PER_FINALIST,
    );
    expect(result.stats.fullScoreCount).toBe(
      MAX_FULLY_SCORED_ASSIGNMENTS_PER_FINALIST,
    );
    expect(scoreAssignment).toHaveBeenCalledTimes(
      MAX_FULLY_SCORED_ASSIGNMENTS_PER_FINALIST,
    );
    expect(getMatchupRating).toHaveBeenCalledTimes(36);
  });

  it('allows a lower default-scored finalist to win with variant-aware fitness', () => {
    const higherDefault: Chromosome = { team: roster, fitness: 0.9 };
    const lowerDefault: Chromosome = {
      team: ['g', 'h', 'i', 'j', 'k', 'l'],
      fitness: 0.8,
    };
    const assignments = new Map([
      [JSON.stringify(higherDefault.team), createAssignment(0)],
      [
        JSON.stringify(lowerDefault.team),
        createRosterMovesetAssignment({
          formatId: 'great-league',
          authorityBySpeciesId: createManifestAuthorities(lowerDefault.team),
          variantsBySpeciesId: Object.fromEntries(
            lowerDefault.team.map((speciesId) => [speciesId, createVariant(1)]),
          ),
        }),
      ],
    ]);

    const result = rerankRosterFinalists([higherDefault, lowerDefault], {
      getAssignments: (team) => [assignments.get(JSON.stringify(team))!],
      getMatchupRating: () => 500,
      scoreAssignment: (finalist) => {
        const score = finalist === lowerDefault ? 0.95 : 0.7;
        return {
          roster: finalist.team,
          fitness: score,
          scoreBreakdown: createScoreBreakdown(score),
          evaluatedLineupCount: 120,
          metrics: {
            viableLineupCount: 1,
            topLineupQuality: score,
            topNLineupDepth: score,
            dominatingMatchupRate: 0,
            overwhelmingLossRate: 0,
            singleAnswerRisks: [],
            viableLeadDiversity: 1,
            benchUtilitySummary: [],
          },
        };
      },
      topThreats: [],
      fullMetaThreats: [],
      getCanonicalRosterKey: (team) => JSON.stringify(team),
    });

    expect(result.finalist).toBe(lowerDefault);
    expect(result.score.fitness).toBe(0.95);
    expect(result.score.fitness).toBe(result.score.scoreBreakdown.score);
  });

  it('rejects a finalist score that does not evaluate all 120 lineups', () => {
    expect(() =>
      rerankRosterFinalists([{ team: roster, fitness: 0.9 }], {
        getAssignments: () => [createAssignment(0)],
        getMatchupRating: () => 500,
        scoreAssignment: (finalist) => ({
          roster: finalist.team,
          fitness: 0.75,
          scoreBreakdown: createScoreBreakdown(0.75),
          evaluatedLineupCount: 119,
          metrics: {
            viableLineupCount: 1,
            topLineupQuality: 0.75,
            topNLineupDepth: 0.75,
            dominatingMatchupRate: 0,
            overwhelmingLossRate: 0,
            singleAnswerRisks: [],
            viableLeadDiversity: 1,
            benchUtilitySummary: [],
          },
        }),
        topThreats: [],
        fullMetaThreats: [],
        getCanonicalRosterKey: (team) => JSON.stringify(team),
      }),
    ).toThrow('must evaluate all 120 ordered lineups');
  });

  it('breaks equal variant-aware scores by default score then canonical roster key', () => {
    const finalists: Chromosome[] = [
      { team: ['z', 'b', 'c', 'd', 'e', 'f'], fitness: 0.8 },
      { team: ['a', 'b', 'c', 'd', 'e', 'f'], fitness: 0.8 },
      { team: ['m', 'b', 'c', 'd', 'e', 'f'], fitness: 0.9 },
    ];

    const result = rerankRosterFinalists([...finalists].reverse(), {
      getAssignments: (team) => [
        createRosterMovesetAssignment({
          formatId: 'great-league',
          authorityBySpeciesId: createManifestAuthorities(team),
          variantsBySpeciesId: Object.fromEntries(
            team.map((speciesId) => [speciesId, createVariant(0, true)]),
          ),
        }),
      ],
      getMatchupRating: () => 500,
      scoreAssignment: (finalist) => ({
        roster: finalist.team,
        fitness: 0.75,
        scoreBreakdown: createScoreBreakdown(0.75),
        evaluatedLineupCount: 120,
        metrics: {
          viableLineupCount: 1,
          topLineupQuality: 0.75,
          topNLineupDepth: 0.75,
          dominatingMatchupRate: 0,
          overwhelmingLossRate: 0,
          singleAnswerRisks: [],
          viableLeadDiversity: 1,
          benchUtilitySummary: [],
        },
      }),
      topThreats: [],
      fullMetaThreats: [],
      getCanonicalRosterKey: (team) => JSON.stringify(team),
    });

    expect(result.finalist).toBe(finalists[2]);

    const lexicalResult = rerankRosterFinalists(finalists.slice(0, 2), {
      getAssignments: (team) => [
        createRosterMovesetAssignment({
          formatId: 'great-league',
          authorityBySpeciesId: createManifestAuthorities(team),
          variantsBySpeciesId: Object.fromEntries(
            team.map((speciesId) => [speciesId, createVariant(0, true)]),
          ),
        }),
      ],
      getMatchupRating: () => 500,
      scoreAssignment: (finalist) => ({
        roster: finalist.team,
        fitness: 0.75,
        scoreBreakdown: createScoreBreakdown(0.75),
        evaluatedLineupCount: 120,
        metrics: {
          viableLineupCount: 1,
          topLineupQuality: 0.75,
          topNLineupDepth: 0.75,
          dominatingMatchupRate: 0,
          overwhelmingLossRate: 0,
          singleAnswerRisks: [],
          viableLeadDiversity: 1,
          benchUtilitySummary: [],
        },
      }),
      topThreats: [],
      fullMetaThreats: [],
      getCanonicalRosterKey: (team) => JSON.stringify(team),
    });

    expect(lexicalResult.finalist).toBe(finalists[1]);
  });
});
