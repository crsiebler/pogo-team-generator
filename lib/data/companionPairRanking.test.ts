import type { CandidateProfile } from './candidateProfiles';
import { rankAnchorCompanionPairs } from './companionPairRanking';

function makeProfile(
  pokemon: string,
  overrides: Partial<CandidateProfile> = {},
): CandidateProfile {
  return {
    pokemon,
    speciesId: pokemon.toLowerCase().replaceAll(' ', '_'),
    rank: 20,
    rankPercentile: 0.2,
    score: 88,
    band: 'normalCompanions',
    safety: { available: true, rank: 20, score: 88 },
    switch: { available: true, rank: 20, score: 88 },
    consistency: { available: true, rank: 20, score: 88 },
    statProduct: 1800,
    bulk: 150,
    offensiveTyping: ['Water'],
    defensiveTyping: ['Water'],
    simulationCoverage: {
      winsAgainst: [],
      lossesAgainst: [],
      checks: [],
    },
    missingInputs: [],
    ...overrides,
  };
}

function expectFiniteNumbers(value: unknown): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value)).toBe(true);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      expectFiniteNumbers(item);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const nestedValue of Object.values(value)) {
      expectFiniteNumbers(nestedValue);
    }
  }
}

describe('rankAnchorCompanionPairs', () => {
  it('prefers a high-ranked synergistic companion over a low-ranked niche pick without unique coverage', () => {
    const anchor = makeProfile('Anchor', {
      defensiveTyping: ['Flying'],
      simulationCoverage: {
        winsAgainst: ['venusaur'],
        lossesAgainst: ['registeel', 'lanturn', 'bastiodon'],
        checks: [],
      },
    });
    const synergisticGeneralist = makeProfile('Synergistic Generalist', {
      rank: 4,
      rankPercentile: 0.04,
      score: 95,
      safety: { available: true, rank: 5, score: 94 },
      consistency: { available: true, rank: 7, score: 92 },
      bulk: 180,
      offensiveTyping: ['Fighting', 'Ground'],
      defensiveTyping: ['Water', 'Ground'],
      simulationCoverage: {
        winsAgainst: ['registeel', 'bastiodon'],
        lossesAgainst: ['venusaur'],
        checks: ['lanturn'],
      },
    });
    const lowRankedNiche = makeProfile('Low Ranked Niche', {
      rank: 95,
      rankPercentile: 0.95,
      score: 72,
      safety: { available: true, rank: 80, score: 70 },
      consistency: { available: true, rank: 90, score: 68 },
      bulk: 115,
      offensiveTyping: ['Fighting'],
      defensiveTyping: ['Rock'],
      simulationCoverage: {
        winsAgainst: ['registeel'],
        lossesAgainst: ['lanturn'],
        checks: ['bastiodon'],
      },
    });

    const results = rankAnchorCompanionPairs(anchor, [
      lowRankedNiche,
      synergisticGeneralist,
    ]);

    expect(results.map((result) => result.companion.pokemon)).toEqual([
      'Synergistic Generalist',
      'Low Ranked Niche',
    ]);
    expect(results[0]?.scoreBreakdown.rankingPrior).toBeGreaterThan(
      results[1]?.scoreBreakdown.rankingPrior ?? 0,
    );
    expect(results[1]?.scoreBreakdown.uniqueCoverageBonus).toBe(0);
  });

  it('allows a lower-ranked specialist to outrank a generalist with unique measurable anchor-loss coverage', () => {
    const anchor = makeProfile('Anchor', {
      simulationCoverage: {
        winsAgainst: ['venusaur'],
        lossesAgainst: ['bastiodon', 'lanturn', 'registeel'],
        checks: [],
      },
    });
    const highRankedGeneralist = makeProfile('High Ranked Generalist', {
      rank: 3,
      rankPercentile: 0.03,
      score: 96,
      offensiveTyping: ['Grass'],
      defensiveTyping: ['Grass'],
      simulationCoverage: {
        winsAgainst: ['lanturn'],
        lossesAgainst: ['bastiodon'],
        checks: ['registeel'],
      },
    });
    const specialist = makeProfile('Specialist', {
      rank: 72,
      rankPercentile: 0.72,
      score: 78,
      offensiveTyping: ['Fighting', 'Ground'],
      defensiveTyping: ['Ghost'],
      simulationCoverage: {
        winsAgainst: ['bastiodon', 'registeel'],
        lossesAgainst: [],
        checks: [],
      },
    });

    const results = rankAnchorCompanionPairs(anchor, [
      highRankedGeneralist,
      specialist,
    ]);

    expect(results[0]?.companion.pokemon).toBe('Specialist');
    expect(results[0]?.scoreBreakdown.uniqueCoverageBonus).toBeGreaterThan(0);
    expect(results[0]?.scoreBreakdown.coveredAnchorLosses).toEqual([
      'bastiodon',
      'registeel',
    ]);
    expect(results[0]?.scoreBreakdown.rankingPrior).toBeLessThan(
      results[1]?.scoreBreakdown.rankingPrior ?? 0,
    );
  });

  it('penalizes severe shared defensive weaknesses', () => {
    const anchor = makeProfile('Anchor', {
      defensiveTyping: ['Normal', 'Ice'],
      simulationCoverage: {
        winsAgainst: [],
        lossesAgainst: ['annihilape', 'medicham'],
        checks: [],
      },
    });
    const riskyCompanion = makeProfile('Risky Companion', {
      rank: 5,
      rankPercentile: 0.05,
      score: 94,
      defensiveTyping: ['Dark', 'Ice'],
      simulationCoverage: {
        winsAgainst: ['medicham'],
        lossesAgainst: ['annihilape'],
        checks: [],
      },
    });
    const saferCompanion = makeProfile('Safer Companion', {
      rank: 15,
      rankPercentile: 0.15,
      score: 90,
      defensiveTyping: ['Ghost', 'Flying'],
      simulationCoverage: {
        winsAgainst: ['annihilape'],
        lossesAgainst: [],
        checks: ['medicham'],
      },
    });

    const results = rankAnchorCompanionPairs(anchor, [
      riskyCompanion,
      saferCompanion,
    ]);

    expect(results[0]?.companion.pokemon).toBe('Safer Companion');
    expect(results[1]?.scoreBreakdown.sharedWeaknessPenalty).toBeGreaterThan(
      results[0]?.scoreBreakdown.sharedWeaknessPenalty ?? 0,
    );
    expect(results[1]?.scoreBreakdown.flags).toContain(
      'severe-shared-weakness',
    );
  });

  it('uses dual-type resistance cancellation for shared weakness penalties', () => {
    const anchor = makeProfile('Anchor', {
      defensiveTyping: ['Water', 'Flying'],
      simulationCoverage: {
        winsAgainst: [],
        lossesAgainst: ['lanturn'],
        checks: [],
      },
    });
    const companion = makeProfile('Companion', {
      defensiveTyping: ['Water', 'Ground'],
      simulationCoverage: {
        winsAgainst: ['lanturn'],
        lossesAgainst: [],
        checks: [],
      },
    });

    const results = rankAnchorCompanionPairs(anchor, [companion]);

    expect(results[0]?.scoreBreakdown.sharedWeaknesses).not.toContain('Grass');
    expect(results[0]?.scoreBreakdown.sharedWeaknessPenalty).toBe(0);
  });

  it('returns finite breakdowns for empty candidates and missing optional inputs', () => {
    const anchor = makeProfile('Anchor', {
      simulationCoverage: {
        winsAgainst: [],
        lossesAgainst: ['lanturn'],
        checks: [],
      },
    });
    const incompleteCompanion = makeProfile('Incomplete Companion', {
      safety: { available: false },
      consistency: { available: false },
      bulk: 0,
      offensiveTyping: [],
      defensiveTyping: [],
      simulationCoverage: {
        winsAgainst: [],
        lossesAgainst: [],
        checks: [],
      },
      missingInputs: [
        'safety',
        'consistency',
        'bulk',
        'offensiveTyping',
        'defensiveTyping',
        'simulationCoverage',
      ],
    });

    expect(rankAnchorCompanionPairs(anchor, [])).toEqual([]);

    const results = rankAnchorCompanionPairs(anchor, [incompleteCompanion]);

    expect(results).toHaveLength(1);
    expect(results[0]?.scoreBreakdown.missingInputPenalty).toBeGreaterThan(0);
    expect(results[0]?.scoreBreakdown.defensiveTypingScore).toBe(0.5);
    expectFiniteNumbers(results[0]?.scoreBreakdown);
  });

  it('scores offensive typing against injected anchor-loss threat typings', () => {
    const anchor = makeProfile('Anchor', {
      defensiveTyping: ['Steel'],
      simulationCoverage: {
        winsAgainst: [],
        lossesAgainst: ['bastiodon'],
        checks: [],
      },
    });
    const antiAnchorCompanion = makeProfile('Anti Anchor Companion', {
      offensiveTyping: ['Ground'],
      simulationCoverage: {
        winsAgainst: ['bastiodon'],
        lossesAgainst: [],
        checks: [],
      },
    });

    const withoutThreatTyping = rankAnchorCompanionPairs(anchor, [
      antiAnchorCompanion,
    ]);
    const withThreatTyping = rankAnchorCompanionPairs(
      anchor,
      [antiAnchorCompanion],
      {
        importantLosses: [
          {
            pokemon: 'bastiodon',
            defensiveTypes: ['Rock', 'Steel'],
          },
        ],
      },
    );

    expect(withoutThreatTyping[0]?.scoreBreakdown.offensiveTypingScore).toBe(
      0.5,
    );
    expect(
      withThreatTyping[0]?.scoreBreakdown.offensiveTypingScore,
    ).toBeGreaterThan(0.5);
  });

  it('keeps deterministic ordering for equal pair scores', () => {
    const anchor = makeProfile('Anchor');
    const candidateB = makeProfile('Candidate B', {
      speciesId: 'candidate_b',
    });
    const candidateA = makeProfile('Candidate A', {
      speciesId: 'candidate_a',
    });

    const results = rankAnchorCompanionPairs(anchor, [candidateB, candidateA]);

    expect(results.map((result) => result.companion.pokemon)).toEqual([
      'Candidate A',
      'Candidate B',
    ]);
  });

  it('keeps unique coverage deterministic for candidates tied on rank and score', () => {
    const anchor = makeProfile('Anchor', {
      simulationCoverage: {
        winsAgainst: [],
        lossesAgainst: ['bastiodon'],
        checks: [],
      },
    });
    const candidateA = makeProfile('Candidate A', {
      speciesId: 'candidate_a',
      rank: 10,
      score: 90,
      simulationCoverage: {
        winsAgainst: ['bastiodon'],
        lossesAgainst: [],
        checks: [],
      },
    });
    const candidateB = makeProfile('Candidate B', {
      speciesId: 'candidate_b',
      rank: 10,
      score: 90,
      simulationCoverage: {
        winsAgainst: ['bastiodon'],
        lossesAgainst: [],
        checks: [],
      },
    });

    const firstOrder = rankAnchorCompanionPairs(anchor, [
      candidateA,
      candidateB,
    ]);
    const secondOrder = rankAnchorCompanionPairs(anchor, [
      candidateB,
      candidateA,
    ]);

    expect(firstOrder.map((result) => result.companion.pokemon)).toEqual([
      'Candidate A',
      'Candidate B',
    ]);
    expect(secondOrder.map((result) => result.companion.pokemon)).toEqual([
      'Candidate A',
      'Candidate B',
    ]);
    expect(secondOrder[0]?.scoreBreakdown.uniqueCoverageBonus).toBe(
      firstOrder[0]?.scoreBreakdown.uniqueCoverageBonus,
    );
    expect(secondOrder[0]?.scoreBreakdown.uniqueCoverageBonus).toBe(
      secondOrder[1]?.scoreBreakdown.uniqueCoverageBonus,
    );
  });
});
