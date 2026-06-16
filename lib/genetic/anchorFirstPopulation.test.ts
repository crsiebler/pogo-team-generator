import type { CandidateProfile } from '@lib/data/candidateProfiles';
import type { RankedAnchorCompanionPair } from '@lib/data/companionPairRanking';
import { describe, expect, it } from 'vitest';
import type { Chromosome } from '../types';
import { initializeAnchorFirstPopulation } from './chromosome';

function profile(
  speciesId: string,
  band: CandidateProfile['band'] = 'normalCompanions',
  options: Partial<CandidateProfile> = {},
): CandidateProfile {
  return {
    pokemon: speciesId,
    speciesId,
    rank: options.rank ?? 1,
    rankPercentile: options.rankPercentile ?? 0.1,
    score: options.score ?? 90,
    band,
    safety: options.safety ?? { available: true, rank: 1, score: 90 },
    switch: options.switch ?? { available: true, rank: 1, score: 90 },
    consistency: options.consistency ?? { available: true, rank: 1, score: 90 },
    statProduct: options.statProduct ?? 2000,
    bulk: options.bulk ?? 100,
    offensiveTyping: options.offensiveTyping ?? ['Normal'],
    defensiveTyping: options.defensiveTyping ?? ['Normal'],
    simulationCoverage: options.simulationCoverage ?? {
      winsAgainst: [],
      lossesAgainst: [],
      checks: [],
    },
    missingInputs: options.missingInputs ?? [],
  };
}

function pair(
  anchor: CandidateProfile,
  companion: CandidateProfile,
  score: number,
): RankedAnchorCompanionPair {
  return {
    anchor,
    companion,
    scoreBreakdown: {
      rankingPrior: 1,
      simulationCoverageScore: 1,
      uniqueCoverageBonus: 1,
      safetyScore: 1,
      consistencyScore: 1,
      bulkScore: 1,
      offensiveTypingScore: 1,
      defensiveTypingScore: 1,
      sharedWeaknessPenalty: 0,
      missingInputPenalty: 0,
      totalScore: score,
      coveredAnchorLosses: [],
      sharedWeaknesses: [],
      flags: [],
    },
  };
}

function randomTeam(team: string[]): Chromosome {
  return { team, anchors: [], fitness: 0 };
}

describe('initializeAnchorFirstPopulation', () => {
  it('expands ranked anchor companion pairs into deterministic GBL seed teams before random diversity fill', () => {
    const lickilicky = profile('lickilicky', 'eliteAnchors', {
      rank: 1,
      score: 98,
      simulationCoverage: {
        winsAgainst: [],
        lossesAgainst: ['annihilape'],
        checks: [],
      },
    });
    const altaria = profile('altaria', 'preferredAnchors', {
      rank: 2,
      score: 96,
      simulationCoverage: {
        winsAgainst: ['annihilape', 'lanturn'],
        lossesAgainst: ['bastiodon'],
        checks: [],
      },
    });
    const empoleon = profile('empoleon', 'normalCompanions', {
      rank: 3,
      score: 94,
      simulationCoverage: {
        winsAgainst: ['bastiodon'],
        lossesAgainst: [],
        checks: [],
      },
    });
    const feraligatr = profile('feraligatr', 'eliteAnchors', {
      rank: 4,
      score: 93,
      simulationCoverage: {
        winsAgainst: [],
        lossesAgainst: ['lanturn'],
        checks: [],
      },
    });
    const quagsire = profile('quagsire', 'normalCompanions', {
      rank: 5,
      score: 92,
      simulationCoverage: {
        winsAgainst: ['lanturn'],
        lossesAgainst: [],
        checks: [],
      },
    });
    const spicePick = profile('spice_pick', 'specialists', {
      rank: 50,
      score: 99,
    });
    const profiles = [
      lickilicky,
      altaria,
      empoleon,
      feraligatr,
      quagsire,
      spicePick,
    ];

    const population = initializeAnchorFirstPopulation(
      4,
      profiles.map((candidate) => candidate.speciesId ?? candidate.pokemon),
      3,
      {
        candidateProfiles: profiles,
        randomPopulation: [randomTeam(['random_a', 'random_b', 'random_c'])],
        rankPairs: (anchor, candidates) => {
          if (anchor.speciesId === 'lickilicky') {
            return [pair(anchor, altaria, 0.95), pair(anchor, empoleon, 0.8)];
          }
          if (anchor.speciesId === 'feraligatr') {
            return [pair(anchor, quagsire, 0.93)];
          }
          return candidates.map((candidate, index) =>
            pair(anchor, candidate, 0.5 - index * 0.01),
          );
        },
      },
    );

    expect(population.map((chromosome) => chromosome.team)).toEqual([
      ['lickilicky', 'altaria', 'empoleon'],
      ['feraligatr', 'quagsire', 'altaria'],
      ['altaria', 'feraligatr', 'empoleon'],
      ['random_a', 'random_b', 'random_c'],
    ]);
    expect(population.flatMap((chromosome) => chromosome.team)).not.toContain(
      'spice_pick',
    );
  });

  it('preserves one anchor-first seed for single-member populations', () => {
    const anchor = profile('lickilicky', 'eliteAnchors', {
      rank: 1,
      score: 98,
    });
    const companion = profile('altaria', 'normalCompanions', {
      rank: 2,
      score: 96,
    });
    const closer = profile('empoleon', 'normalCompanions', {
      rank: 3,
      score: 94,
    });

    const population = initializeAnchorFirstPopulation(
      1,
      ['lickilicky', 'altaria', 'empoleon'],
      3,
      {
        candidateProfiles: [anchor, companion, closer],
        randomPopulation: [randomTeam(['venusaur', 'charizard', 'blastoise'])],
        rankPairs: () => [pair(anchor, companion, 0.9)],
      },
    );

    expect(population.map((chromosome) => chromosome.team)).toEqual([
      ['lickilicky', 'altaria', 'empoleon'],
    ]);
  });

  it('expands anchor-first pairs to bring-six rosters and preserves a bounded random slice', () => {
    const profiles = [
      profile('lickilicky', 'eliteAnchors', { rank: 1, score: 98 }),
      profile('altaria', 'preferredAnchors', { rank: 2, score: 97 }),
      profile('empoleon', 'normalCompanions', { rank: 3, score: 96 }),
      profile('feraligatr', 'preferredAnchors', { rank: 4, score: 95 }),
      profile('quagsire', 'flexibleCompanions', { rank: 5, score: 94 }),
      profile('charjabug', 'flexibleCompanions', { rank: 6, score: 93 }),
      profile('random_only', 'flexibleCompanions', { rank: 7, score: 92 }),
    ];

    const population = initializeAnchorFirstPopulation(
      5,
      profiles.map((candidate) => candidate.speciesId ?? candidate.pokemon),
      6,
      {
        candidateProfiles: profiles,
        randomPopulation: [
          randomTeam([
            'random_1',
            'random_2',
            'random_3',
            'random_4',
            'random_5',
            'random_6',
          ]),
          randomTeam([
            'random_7',
            'random_8',
            'random_9',
            'random_10',
            'random_11',
            'random_12',
          ]),
          randomTeam([
            'random_13',
            'random_14',
            'random_15',
            'random_16',
            'random_17',
            'random_18',
          ]),
          randomTeam([
            'random_19',
            'random_20',
            'random_21',
            'random_22',
            'random_23',
            'random_24',
          ]),
        ],
        rankPairs: (anchor) => [pair(anchor, profiles[1], 0.9)],
      },
    );

    expect(population).toHaveLength(5);
    expect(population.every((chromosome) => chromosome.team.length === 6)).toBe(
      true,
    );
    expect(population[0].team).toEqual([
      'lickilicky',
      'altaria',
      'empoleon',
      'feraligatr',
      'quagsire',
      'charjabug',
    ]);
    expect(population[1].team).toEqual([
      'random_1',
      'random_2',
      'random_3',
      'random_4',
      'random_5',
      'random_6',
    ]);
  });

  it('keeps explicit anchors fixed before expanding anchor-first seeds', () => {
    const profiles = [
      profile('specialist_anchor', 'specialists', { rank: 50, score: 75 }),
      profile('altaria', 'preferredAnchors', { rank: 2, score: 97 }),
      profile('empoleon', 'normalCompanions', { rank: 3, score: 96 }),
      profile('lickilicky', 'eliteAnchors', { rank: 1, score: 98 }),
    ];

    const population = initializeAnchorFirstPopulation(
      2,
      profiles.map((candidate) => candidate.speciesId ?? candidate.pokemon),
      3,
      {
        anchorPokemon: ['specialist_anchor'],
        candidateProfiles: profiles,
        randomPopulation: [
          randomTeam(['specialist_anchor', 'random_a', 'random_b']),
        ],
        rankPairs: (anchor) => [pair(anchor, profiles[1], 0.9)],
      },
    );

    expect(population[0]).toEqual({
      team: ['specialist_anchor', 'altaria', 'lickilicky'],
      anchors: [0],
      fitness: 0,
    });
  });

  it('uses the default pair ranker for explicit specialist anchors', () => {
    const specialistAnchor = profile('lapras', 'specialists', {
      rank: 50,
      score: 75,
      defensiveTyping: ['Water'],
      simulationCoverage: {
        winsAgainst: [],
        lossesAgainst: ['grass_threat'],
        checks: [],
      },
    });
    const grassAnswer = profile('charizard', 'normalCompanions', {
      rank: 3,
      score: 94,
      defensiveTyping: ['Fire'],
      simulationCoverage: {
        winsAgainst: ['grass_threat'],
        lossesAgainst: [],
        checks: [],
      },
    });
    const neutralCompanion = profile('snorlax', 'normalCompanions', {
      rank: 4,
      score: 92,
      defensiveTyping: ['Normal'],
    });

    const population = initializeAnchorFirstPopulation(
      2,
      ['charizard', 'snorlax'],
      3,
      {
        anchorPokemon: ['lapras'],
        candidateProfiles: [specialistAnchor, grassAnswer, neutralCompanion],
        randomPopulation: [randomTeam(['lapras', 'venusaur', 'blastoise'])],
      },
    );

    expect(population[0]).toEqual({
      team: ['lapras', 'charizard', 'snorlax'],
      anchors: [0],
      fitness: 0,
    });
  });

  it('recomputes remaining anchor-pair weaknesses after each expansion pick', () => {
    const anchor = profile('lickilicky', 'eliteAnchors', {
      rank: 1,
      score: 98,
      simulationCoverage: {
        winsAgainst: [],
        lossesAgainst: ['threat_a', 'threat_b'],
        checks: [],
      },
    });
    const companion = profile('altaria', 'normalCompanions', {
      rank: 2,
      score: 96,
      simulationCoverage: {
        winsAgainst: ['threat_a'],
        lossesAgainst: [],
        checks: [],
      },
    });
    const duplicateAnswer = profile('empoleon', 'normalCompanions', {
      rank: 3,
      score: 99,
      simulationCoverage: {
        winsAgainst: ['threat_a'],
        lossesAgainst: [],
        checks: [],
      },
    });
    const remainingAnswer = profile('quagsire', 'normalCompanions', {
      rank: 4,
      score: 80,
      simulationCoverage: {
        winsAgainst: ['threat_b'],
        lossesAgainst: [],
        checks: [],
      },
    });

    const population = initializeAnchorFirstPopulation(
      2,
      ['lickilicky', 'altaria', 'empoleon', 'quagsire'],
      3,
      {
        candidateProfiles: [
          anchor,
          companion,
          duplicateAnswer,
          remainingAnswer,
        ],
        randomPopulation: [randomTeam(['venusaur', 'charizard', 'blastoise'])],
        rankPairs: () => [pair(anchor, companion, 0.9)],
      },
    );

    expect(population[0].team).toEqual(['lickilicky', 'altaria', 'quagsire']);
  });

  it('uses lineup quality and broad meta coverage when expanding equivalent remaining weaknesses', () => {
    const anchor = profile('lickilicky', 'eliteAnchors', {
      rank: 1,
      score: 98,
      simulationCoverage: {
        winsAgainst: [],
        lossesAgainst: ['bastiodon'],
        checks: [],
      },
    });
    const companion = profile('altaria', 'normalCompanions', {
      rank: 2,
      score: 96,
      simulationCoverage: {
        winsAgainst: [],
        lossesAgainst: [],
        checks: [],
      },
    });
    const narrowAnswer = profile('empoleon', 'normalCompanions', {
      rank: 3,
      score: 99,
      safety: { available: true, rank: 80, score: 20 },
      switch: { available: true, rank: 80, score: 20 },
      consistency: { available: true, rank: 80, score: 20 },
      bulk: 60,
      simulationCoverage: {
        winsAgainst: ['bastiodon'],
        lossesAgainst: [],
        checks: [],
      },
    });
    const playableBroadAnswer = profile('quagsire', 'normalCompanions', {
      rank: 4,
      score: 80,
      safety: { available: true, rank: 1, score: 100 },
      switch: { available: true, rank: 1, score: 100 },
      consistency: { available: true, rank: 1, score: 100 },
      bulk: 120,
      simulationCoverage: {
        winsAgainst: ['bastiodon', 'lanturn', 'registeel'],
        lossesAgainst: [],
        checks: ['azumarill'],
      },
    });

    const population = initializeAnchorFirstPopulation(
      2,
      ['lickilicky', 'altaria', 'empoleon', 'quagsire'],
      3,
      {
        candidateProfiles: [
          anchor,
          companion,
          narrowAnswer,
          playableBroadAnswer,
        ],
        randomPopulation: [randomTeam(['venusaur', 'charizard', 'blastoise'])],
        rankPairs: () => [pair(anchor, companion, 0.9)],
      },
    );

    expect(population[0].team).toEqual(['lickilicky', 'altaria', 'quagsire']);
  });

  it('rejects non-explicit specialist companions returned by injected pair ranking', () => {
    const anchor = profile('lickilicky', 'eliteAnchors', {
      rank: 1,
      score: 98,
    });
    const specialistCompanion = profile('spice_pick', 'specialists', {
      rank: 80,
      score: 99,
    });
    const generalistCompanion = profile('altaria', 'normalCompanions', {
      rank: 2,
      score: 96,
    });
    const closer = profile('empoleon', 'normalCompanions', {
      rank: 3,
      score: 94,
    });

    const population = initializeAnchorFirstPopulation(
      2,
      ['lickilicky', 'spice_pick', 'altaria', 'empoleon'],
      3,
      {
        candidateProfiles: [
          anchor,
          specialistCompanion,
          generalistCompanion,
          closer,
        ],
        randomPopulation: [randomTeam(['venusaur', 'charizard', 'blastoise'])],
        rankPairs: () => [
          pair(anchor, specialistCompanion, 1),
          pair(anchor, generalistCompanion, 0.9),
        ],
      },
    );

    expect(population[0].team).toEqual(['lickilicky', 'altaria', 'empoleon']);
  });

  it('rejects anchor-first seeds with duplicate base species before random fill', () => {
    const scizor = profile('scizor', 'eliteAnchors', { rank: 1, score: 98 });
    const shadowScizor = profile('scizor_shadow', 'normalCompanions', {
      rank: 2,
      score: 96,
    });

    const population = initializeAnchorFirstPopulation(
      1,
      ['scizor', 'scizor_shadow'],
      2,
      {
        candidateProfiles: [scizor, shadowScizor],
        randomPopulation: [randomTeam(['random_a', 'random_b'])],
        rankPairs: (anchor) => [pair(anchor, shadowScizor, 0.9)],
      },
    );

    expect(population.map((chromosome) => chromosome.team)).toEqual([
      ['random_a', 'random_b'],
    ]);
  });

  it('rejects illegal Battle Frontier Master anchor-first seeds before random fill', () => {
    const palkia = profile('palkia_origin', 'eliteAnchors', {
      rank: 1,
      score: 98,
    });
    const eternatus = profile('eternatus', 'normalCompanions', {
      rank: 2,
      score: 96,
    });
    const swampertMega = profile('swampert_mega', 'normalCompanions', {
      rank: 3,
      score: 95,
    });

    const population = initializeAnchorFirstPopulation(
      1,
      ['palkia_origin', 'eternatus', 'swampert_mega'],
      3,
      {
        candidateProfiles: [palkia, eternatus, swampertMega],
        formatId: 'battle-frontier-master',
        randomPopulation: [
          randomTeam(['mewtwo', 'dragonite', 'swampert_mega']),
        ],
        rankPairs: (anchor) => [pair(anchor, eternatus, 0.9)],
      },
    );

    expect(population.map((chromosome) => chromosome.team)).toEqual([
      ['mewtwo', 'dragonite', 'swampert_mega'],
    ]);
  });

  it('rejects illegal Mega Master anchor-first seeds before random fill', () => {
    const swampertMega = profile('swampert_mega', 'eliteAnchors', {
      rank: 1,
      score: 98,
    });
    const galladeMega = profile('gallade_mega', 'normalCompanions', {
      rank: 2,
      score: 96,
    });
    const dragonite = profile('dragonite', 'normalCompanions', {
      rank: 3,
      score: 95,
    });

    const population = initializeAnchorFirstPopulation(
      1,
      ['swampert_mega', 'gallade_mega', 'dragonite'],
      3,
      {
        candidateProfiles: [swampertMega, galladeMega, dragonite],
        formatId: 'mega-master-league',
        randomPopulation: [
          randomTeam(['swampert_mega', 'mewtwo', 'dragonite']),
        ],
        rankPairs: (anchor) => [pair(anchor, galladeMega, 0.9)],
      },
    );

    expect(population.map((chromosome) => chromosome.team)).toEqual([
      ['swampert_mega', 'mewtwo', 'dragonite'],
    ]);
  });
});
