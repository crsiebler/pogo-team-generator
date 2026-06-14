import type { CandidateProfile } from './candidateProfiles';
import {
  evaluateSpecialistAdmission,
  selectAutomaticAnchorCandidates,
} from './specialistCandidateGate';

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

describe('specialist candidate gate', () => {
  it('excludes specialists from automatic anchor candidates', () => {
    const eliteAnchor = makeProfile('Elite Anchor', {
      band: 'eliteAnchors',
      rank: 1,
      rankPercentile: 0.01,
      score: 98,
    });
    const preferredAnchor = makeProfile('Preferred Anchor', {
      band: 'preferredAnchors',
      rank: 6,
      rankPercentile: 0.06,
      score: 94,
    });
    const specialist = makeProfile('Specialist', {
      band: 'specialists',
      rank: 70,
      rankPercentile: 0.7,
      score: 76,
    });

    const anchors = selectAutomaticAnchorCandidates([
      specialist,
      preferredAnchor,
      eliteAnchor,
    ]);

    expect(anchors.map((candidate) => candidate.pokemon)).toEqual([
      'Elite Anchor',
      'Preferred Anchor',
    ]);
  });

  it('rejects a specialist when it only beats an isolated low-priority threat', () => {
    const specialist = makeProfile('Low Ranked Specialist', {
      band: 'specialists',
      rank: 80,
      rankPercentile: 0.8,
      score: 72,
      simulationCoverage: {
        winsAgainst: ['isolated-threat'],
        lossesAgainst: ['top-threat'],
        checks: [],
      },
    });

    const decision = evaluateSpecialistAdmission(specialist, {
      unresolvedThreats: [
        { pokemon: 'isolated-threat', weight: 0.4, source: 'topMeta' },
        { pokemon: 'top-threat', weight: 2, source: 'topMeta' },
      ],
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons).toContain('insufficient-unique-coverage');
    expect(decision.uniqueCoveredThreats).toEqual(['isolated-threat']);
  });

  it('deduplicates duplicate unresolved threat rows before unique coverage admission', () => {
    const specialist = makeProfile('Duplicate Row Specialist', {
      band: 'specialists',
      rank: 82,
      rankPercentile: 0.82,
      score: 71,
      simulationCoverage: {
        winsAgainst: ['isolated-threat'],
        lossesAgainst: ['core-breaker'],
        checks: [],
      },
    });

    const decision = evaluateSpecialistAdmission(specialist, {
      unresolvedThreats: [
        { pokemon: 'isolated-threat', weight: 0.6, source: 'topMeta' },
        { pokemon: 'isolated-threat', weight: 0.6, source: 'topMeta' },
        { pokemon: 'core-breaker', weight: 2, source: 'coreWeakness' },
      ],
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons).toContain('insufficient-unique-coverage');
    expect(decision.uniqueCoveredThreats).toEqual(['isolated-threat']);
  });

  it('admits a specialist that uniquely patches an unresolved high-priority weakness with simulation coverage', () => {
    const generalist = makeProfile('Generalist', {
      rank: 8,
      rankPercentile: 0.08,
      score: 93,
      simulationCoverage: {
        winsAgainst: ['covered-threat'],
        lossesAgainst: ['core-breaker'],
        checks: [],
      },
    });
    const specialist = makeProfile('Specialist Patch', {
      band: 'specialists',
      rank: 75,
      rankPercentile: 0.75,
      score: 77,
      defensiveTyping: ['Ghost'],
      simulationCoverage: {
        winsAgainst: ['core-breaker'],
        lossesAgainst: [],
        checks: [],
      },
    });

    const decision = evaluateSpecialistAdmission(specialist, {
      generalistCandidates: [generalist],
      unresolvedThreats: [
        { pokemon: 'core-breaker', weight: 2, source: 'coreWeakness' },
        { pokemon: 'covered-threat', weight: 1, source: 'topMeta' },
      ],
    });

    expect(decision.admitted).toBe(true);
    expect(decision.reasons).toContain('unique-simulation-coverage');
    expect(decision.uniqueCoveredThreats).toEqual(['core-breaker']);
  });

  it('rejects type-only specialist coverage when simulation does not back it', () => {
    const specialist = makeProfile('Paper Counter', {
      band: 'specialists',
      rank: 85,
      rankPercentile: 0.85,
      score: 70,
      offensiveTyping: ['Ground'],
      simulationCoverage: {
        winsAgainst: [],
        lossesAgainst: ['bastiodon'],
        checks: [],
      },
    });

    const decision = evaluateSpecialistAdmission(specialist, {
      unresolvedThreats: [
        {
          pokemon: 'bastiodon',
          weight: 2,
          source: 'topMeta',
          defensiveTypes: ['Rock', 'Steel'],
        },
      ],
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons).toContain('type-only-coverage-not-sufficient');
    expect(decision.uniqueCoveredThreats).toEqual([]);
  });

  it('rejects a specialist that duplicates stronger generalist coverage', () => {
    const generalist = makeProfile('Stronger Generalist', {
      rank: 4,
      rankPercentile: 0.04,
      score: 95,
      simulationCoverage: {
        winsAgainst: ['core-breaker'],
        lossesAgainst: [],
        checks: [],
      },
    });
    const specialist = makeProfile('Duplicate Specialist', {
      band: 'specialists',
      rank: 90,
      rankPercentile: 0.9,
      score: 68,
      simulationCoverage: {
        winsAgainst: ['core-breaker'],
        lossesAgainst: [],
        checks: [],
      },
    });

    const decision = evaluateSpecialistAdmission(specialist, {
      generalistCandidates: [generalist],
      unresolvedThreats: [
        { pokemon: 'core-breaker', weight: 2, source: 'coreWeakness' },
      ],
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons).toContain('duplicates-stronger-generalist');
  });

  it('rejects a specialist that creates severe shared weakness or reduces viable lineups', () => {
    const anchor = makeProfile('Anchor', {
      defensiveTyping: ['Normal', 'Ice'],
    });
    const specialist = makeProfile('Fragile Patch', {
      band: 'specialists',
      rank: 78,
      rankPercentile: 0.78,
      score: 74,
      defensiveTyping: ['Dark', 'Ice'],
      simulationCoverage: {
        winsAgainst: ['core-breaker'],
        lossesAgainst: [],
        checks: [],
      },
    });

    const decision = evaluateSpecialistAdmission(specialist, {
      anchor,
      baselineViableLineupCount: 4,
      candidateViableLineupCount: 2,
      minViableLineupCount: 3,
      unresolvedThreats: [
        { pokemon: 'core-breaker', weight: 2, source: 'coreWeakness' },
      ],
    });

    expect(decision.admitted).toBe(false);
    expect(decision.reasons).toContain('severe-shared-weakness');
    expect(decision.reasons).toContain('reduces-viable-lineups');
  });
});
