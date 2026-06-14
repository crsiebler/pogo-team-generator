import type { RankedPokemon } from '../types';
import { buildCandidateProfiles } from './candidateProfiles';
import { deriveCandidateRankingBands } from './candidateRankingBands';

function makeRanking(
  pokemon: string,
  score: number,
  overrides: Partial<RankedPokemon> = {},
): RankedPokemon {
  return {
    Pokemon: pokemon,
    Score: score,
    Dex: 1,
    'Type 1': 'Water',
    'Type 2': 'Flying',
    Attack: 120,
    Defense: 130,
    Stamina: 140,
    'Stat Product': 1800,
    Level: 20,
    CP: 1500,
    'Fast Move': 'Water Gun',
    'Charged Move 1': 'Sky Attack',
    'Charged Move 2': 'Hydro Pump',
    'Charged Move 1 Count': 5,
    'Charged Move 2 Count': 8,
    'Buddy Distance': 3,
    'Charged Move Cost': 50000,
    ...overrides,
  };
}

function makeOpenGreatLeagueCurve(): RankedPokemon[] {
  return Array.from({ length: 48 }, (_, index) => {
    return makeRanking(`Open ${index + 1}`, 94 - index * 0.22);
  });
}

function makeNaicStyleCurve(): RankedPokemon[] {
  const scores = [
    97.2, 95.8, 94.1, 91.7, 87.4, 83.6, 81.1, 79.5, 78.4, 77.6, 77.0, 76.5,
    76.0, 75.6, 75.2, 74.8, 74.4, 74.0, 73.6, 73.2, 72.8, 72.4, 72.0, 71.6,
  ];

  return scores.map((score, index) => {
    return makeRanking(`NAIC ${index + 1}`, score, {
      'Type 1': index % 2 === 0 ? 'Steel' : 'Dragon',
      'Type 2': index % 3 === 0 ? 'Fairy' : '',
      'Fast Move': index % 2 === 0 ? 'Dragon Breath' : 'Counter',
      'Charged Move 1': index % 2 === 0 ? 'Iron Head' : 'Body Slam',
      'Charged Move 2': index % 2 === 0 ? 'Play Rough' : 'Earthquake',
    });
  });
}

function expectFiniteProfileNumbers(value: unknown): void {
  if (typeof value === 'number') {
    expect(Number.isFinite(value)).toBe(true);
    return;
  }

  if (Array.isArray(value)) {
    for (const item of value) {
      expectFiniteProfileNumbers(item);
    }
    return;
  }

  if (value && typeof value === 'object') {
    for (const nestedValue of Object.values(value)) {
      expectFiniteProfileNumbers(nestedValue);
    }
  }
}

describe('buildCandidateProfiles', () => {
  it('builds open Great League-style profiles from dynamic band assignments and injected signals', () => {
    const bands = deriveCandidateRankingBands(makeOpenGreatLeagueCurve(), {
      minCandidates: 18,
      maxCandidates: 30,
      minBandSize: 3,
    });

    const profiles = buildCandidateProfiles({
      rankingBands: bands,
      speciesIdsByPokemon: new Map([
        ['Open 1', 'open_1'],
        ['Open 4', 'open_4'],
      ]),
      safetyRankings: new Map([['Open 1', { rank: 2, score: 96.2 }]]),
      switchRankings: new Map([['Open 1', { rank: 4, score: 93.8 }]]),
      consistencyRankings: new Map([['Open 1', { rank: 8, score: 90.5 }]]),
      moveTypesByName: new Map([
        ['Water Gun', 'Water'],
        ['Sky Attack', 'Flying'],
        ['Hydro Pump', 'Water'],
      ]),
      simulationCoverageByPokemon: new Map([
        [
          'Open 1',
          {
            winsAgainst: ['azumarill'],
            lossesAgainst: ['lanturn'],
            checks: ['talonflame'],
          },
        ],
      ]),
    });

    const profile = profiles[0];

    expect(profile).toEqual(
      expect.objectContaining({
        pokemon: 'Open 1',
        speciesId: 'open_1',
        rank: 1,
        score: 94,
        band: 'eliteAnchors',
        rankPercentile: expect.any(Number),
        statProduct: 1800,
        defensiveTyping: ['Water', 'Flying'],
        offensiveTyping: ['Water', 'Flying'],
        missingInputs: [],
      }),
    );
    expect(profile.bulk).toBeCloseTo(151.67, 2);
    expect(profile.safety).toEqual({ available: true, rank: 2, score: 96.2 });
    expect(profile.switch).toEqual({ available: true, rank: 4, score: 93.8 });
    expect(profile.consistency).toEqual({
      available: true,
      rank: 8,
      score: 90.5,
    });
    expect(profile.simulationCoverage).toEqual({
      winsAgainst: ['azumarill'],
      lossesAgainst: ['lanturn'],
      checks: ['talonflame'],
    });
    expect(profiles.map((candidate) => candidate.band)).toEqual(
      bands.assignments.map((assignment) => assignment.band),
    );
  });

  it('builds NAIC-style companion profiles with format-specific bands and typing inputs', () => {
    const bands = deriveCandidateRankingBands(makeNaicStyleCurve(), {
      minCandidates: 12,
      maxCandidates: 20,
      minBandSize: 2,
    });

    const profiles = buildCandidateProfiles({
      rankingBands: bands,
      speciesIdsByPokemon: new Map([['NAIC 6', 'naic_6']]),
      moveTypesByName: new Map([
        ['Dragon Breath', 'Dragon'],
        ['Counter', 'Fighting'],
        ['Iron Head', 'Steel'],
        ['Play Rough', 'Fairy'],
        ['Body Slam', 'Normal'],
        ['Earthquake', 'Ground'],
      ]),
      simulationCoverageByPokemon: new Map([
        [
          'NAIC 6',
          {
            winsAgainst: ['incineroar'],
            lossesAgainst: [],
            checks: ['empoleon'],
          },
        ],
      ]),
    });

    const companion = profiles.find((profile) => profile.pokemon === 'NAIC 6');

    expect(companion).toEqual(
      expect.objectContaining({
        pokemon: 'NAIC 6',
        speciesId: 'naic_6',
        rank: 6,
        score: 83.6,
        band: bands.assignments[5]?.band,
        defensiveTyping: ['Dragon'],
        offensiveTyping: ['Fighting', 'Normal', 'Ground'],
      }),
    );
    expect(companion?.band).not.toBe('eliteAnchors');
    expect(companion?.simulationCoverage.winsAgainst).toContain('incineroar');
  });

  it('marks missing optional role and consistency data explicitly without invalid numeric output', () => {
    const rankings = [
      makeRanking('Missing Signals', 84.2, {
        'Type 1': 'Poison',
        'Type 2': '',
        'Stat Product': 0,
        Attack: 100,
        Defense: 150,
        Stamina: 120,
        'Fast Move': 'Poison Jab',
        'Charged Move 1': 'Unknown Charge',
        'Charged Move 2': '',
      }),
    ];
    const bands = deriveCandidateRankingBands(rankings, {
      minCandidates: 1,
      maxCandidates: 1,
      minBandSize: 1,
    });

    const profiles = buildCandidateProfiles({
      rankingBands: bands,
      speciesIdsByPokemon: new Map([['Missing Signals', 'missing_signals']]),
      moveTypesByName: new Map([['Poison Jab', 'Poison']]),
    });

    expect(profiles).toHaveLength(1);
    expect(profiles[0]).toEqual(
      expect.objectContaining({
        safety: { available: false },
        switch: { available: false },
        consistency: { available: false },
        statProduct: null,
        bulk: 180,
        offensiveTyping: ['Poison'],
        defensiveTyping: ['Poison'],
        simulationCoverage: {
          winsAgainst: [],
          lossesAgainst: [],
          checks: [],
        },
        missingInputs: [
          'safety',
          'switch',
          'consistency',
          'statProduct',
          'moveTypes',
          'simulationCoverage',
        ],
      }),
    );
    expectFiniteProfileNumbers(profiles[0]);
  });

  it('uses independent empty simulation coverage arrays for profiles without coverage inputs', () => {
    const bands = deriveCandidateRankingBands(
      [makeRanking('No Coverage 1', 91), makeRanking('No Coverage 2', 90)],
      {
        minCandidates: 2,
        maxCandidates: 2,
        minBandSize: 1,
      },
    );

    const profiles = buildCandidateProfiles({
      rankingBands: bands,
      moveTypesByName: new Map([
        ['Water Gun', 'Water'],
        ['Sky Attack', 'Flying'],
        ['Hydro Pump', 'Water'],
      ]),
    });

    profiles[0]?.simulationCoverage.winsAgainst.push('mutated-threat');

    expect(profiles[1]?.simulationCoverage.winsAgainst).toEqual([]);
  });
});
