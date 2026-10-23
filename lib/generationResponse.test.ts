import { describe, expect, it } from 'vitest';
import { parseGenerationResponse } from './generationResponse';
import type {
  GenerationResponse,
  PokemonWithMoves,
  RosterMovesetAssignment,
  TournamentMode,
} from '@/lib/types';

function makeResponse(
  formatId: RosterMovesetAssignment['formatId'],
  mode: TournamentMode,
): GenerationResponse {
  const team =
    mode === 'GBL'
      ? ['azumarill', 'skarmory', 'registeel']
      : [
          'azumarill',
          'skarmory',
          'registeel',
          'garchomp',
          'lanturn',
          'decidueye',
        ];
  const authority = {
    source: 'manifest' as const,
    schemaVersion: 1,
    policyVersion: 'ranking-evidence-v1',
  };
  const variant = {
    id: 'bubble--ice_beam--play_rough' as const,
    fastMove: 'BUBBLE',
    chargedMove1: 'ICE_BEAM',
    chargedMove2: 'PLAY_ROUGH',
    isDefault: true,
  };
  const movesetAssignment: RosterMovesetAssignment = {
    formatId,
    authorityBySpeciesId: Object.fromEntries(
      team.map((speciesId) => [speciesId, authority]),
    ),
    variantsBySpeciesId: Object.fromEntries(
      team.map((speciesId) => [speciesId, variant]),
    ),
    fingerprint: 'response-validator-test',
  };
  const pokemon: PokemonWithMoves[] = team.map((speciesId, index) => ({
    dex: index + 1,
    speciesName: speciesId,
    speciesId,
    baseStats: { atk: 100, def: 100, hp: 100 },
    types: ['water'],
    fastMoves: ['BUBBLE'],
    chargedMoves: ['ICE_BEAM', 'PLAY_ROUGH'],
    tags: [],
    defaultIVs: {},
    buddyDistance: 3,
    thirdMoveCost: 10000,
    released: true,
    recommendedMoveset: {
      ...variant,
      authority,
      acquisitionRequirements: {
        fastMove: { kind: 'regular' },
        chargedMove1: { kind: 'elite' },
        chargedMove2: { kind: 'eventExclusive' },
      },
    },
  }));

  return {
    team,
    fitness: 0.75,
    movesetAssignment,
    analysis: {
      mode,
      teamSize: team.length,
      generatedAt: '2026-10-21T00:00:00.000Z',
      threats: { evaluatedCount: 0, entries: [] },
      coreBreakers: { threshold: 0, entries: [] },
      shieldScenarios: {
        '0-0': { coveredThreats: 0, evaluatedThreats: 0, coverageRate: 0 },
        '1-1': { coveredThreats: 0, evaluatedThreats: 0, coverageRate: 0 },
        '2-2': { coveredThreats: 0, evaluatedThreats: 0, coverageRate: 0 },
      },
      pokemonContributions: { entries: [] },
    },
    pokemon,
  };
}

function omitProperty<T extends object, Key extends keyof T>(
  value: T,
  key: Key,
): Omit<T, Key> {
  const copy = { ...value };
  Reflect.deleteProperty(copy, key);
  return copy;
}

describe('parseGenerationResponse', () => {
  it('accepts populated threat and core-breaker diagnostics', () => {
    const response = makeResponse('great-league', 'GBL');
    response.analysis.threats = {
      evaluatedCount: 1,
      entries: [
        {
          speciesId: 'jellicent',
          pokemon: 'Jellicent',
          rank: 1,
          teamAnswers: 1,
          severityTier: 'high',
        },
      ],
    };
    response.analysis.coreBreakers = {
      threshold: 2,
      entries: [
        { pokemon: 'Jellicent', rank: 1, teamAnswers: 1, severityTier: 'high' },
      ],
    };
    expect(parseGenerationResponse(response, 'great-league', 'GBL')).toBe(
      response,
    );
  });

  it.each(['threats', 'coreBreakers'] as const)(
    'rejects malformed populated %s entries',
    (section) => {
      const response = makeResponse('great-league', 'GBL');
      const malformed = {
        ...response,
        analysis: {
          ...response.analysis,
          [section]: {
            evaluatedCount: 1,
            threshold: 2,
            entries: [
              {
                speciesId: 'jellicent',
                pokemon: 'Jellicent',
                rank: 'first',
                teamAnswers: 1,
                severityTier: 'high',
              },
            ],
          },
        },
      };
      expect(() =>
        parseGenerationResponse(malformed, 'great-league', 'GBL'),
      ).toThrow('Generation response is invalid. Please try again.');
    },
  );

  it.each([
    ['PlayPokemon Pick 6', 'play-pokemon', 'PlayPokemon', 6],
    ['GBL Pick 3', 'great-league', 'GBL', 3],
  ] as const)(
    'accepts an ordered %s payload without optional diagnostics',
    (_label, formatId, mode, teamSize) => {
      const response = makeResponse(formatId, mode);

      expect(parseGenerationResponse(response, formatId, mode)).toMatchObject({
        team: expect.arrayContaining([expect.any(String)]),
        pokemon: expect.arrayContaining([expect.any(Object)]),
      });
      expect(response.team).toHaveLength(teamSize);
    },
  );

  it('accepts a dataset Pokémon whose optional tags field is omitted', () => {
    const baseResponse = makeResponse('play-pokemon', 'PlayPokemon');
    const replacedSpeciesId = 'skarmory';
    const { [replacedSpeciesId]: variant, ...otherVariants } =
      baseResponse.movesetAssignment.variantsBySpeciesId;
    const { [replacedSpeciesId]: authority, ...otherAuthorities } =
      baseResponse.movesetAssignment.authorityBySpeciesId;
    const responseWithoutOptionalTags = {
      ...baseResponse,
      team: baseResponse.team.map((speciesId) =>
        speciesId === replacedSpeciesId ? 'carbink' : speciesId,
      ),
      movesetAssignment: {
        ...baseResponse.movesetAssignment,
        variantsBySpeciesId: { ...otherVariants, carbink: variant! },
        authorityBySpeciesId: { ...otherAuthorities, carbink: authority! },
      },
      pokemon: baseResponse.pokemon.map((pokemon) => {
        if (pokemon.speciesId !== replacedSpeciesId) return pokemon;

        const carbink = {
          ...pokemon,
          speciesId: 'carbink',
          speciesName: 'Carbink',
        };
        return Object.fromEntries(
          Object.entries(carbink).filter(([key]) => key !== 'tags'),
        );
      }),
    };

    const parsed = parseGenerationResponse(
      responseWithoutOptionalTags,
      'play-pokemon',
      'PlayPokemon',
    );

    expect(parsed.pokemon[1]?.speciesId).toBe('carbink');
    expect(parsed.pokemon[1]).not.toHaveProperty('tags');
  });

  it('accepts complete optional diagnostics used by the analysis UI', () => {
    const response = makeResponse('play-pokemon', 'PlayPokemon');
    const components = {
      synergy: 0.8,
      coverage: 0.7,
      safety: 0.6,
      consistency: 0.5,
      bulk: 0.4,
      defensiveRatio: 0.3,
      offensiveRatio: 0.2,
      role: 0.1,
    };
    const scoreBreakdown = {
      scoreBasis: 'weighted',
      components,
      weights: components,
      score: 0.6,
      threatScore: {
        score: 0.4,
        evaluatedCount: 1,
        topMetaThreats: [
          {
            speciesId: 'azumarill',
            pokemon: 'Azumarill',
            rank: 1,
            teamAnswers: 2,
            threatValue: 0.4,
            severityTier: 'medium',
          },
        ],
        overallTeamThreats: [],
        pools: {
          topMeta: { score: 0.4, evaluatedCount: 1, weight: 0.7 },
          fullMeta: { score: null, evaluatedCount: 0, weight: 0.3 },
        },
      },
      threatContribution: 0.2,
    };
    const coverageMetrics = {
      coverageRate: 0.8,
      dominatingMatchupCount: 2,
      overwhelmingLossCount: 1,
      singleAnswerThreatCount: 3,
      topThreatCoverage: {
        softCoverageRate: 0.75,
        coverageRate: 0.8,
        evaluatedThreatCount: 5,
        noAnswerThreatCount: 1,
        singleAnswerThreatCount: 3,
        dominatingMatchupCount: 2,
        overwhelmingLossCount: 1,
      },
    };

    const responseWithDiagnostics = {
      ...response,
      scoreBreakdown,
      recommendedLineups: [
        {
          lineup: {
            lead: 'Azumarill',
            switch: 'Skarmory',
            closer: 'Registeel',
          },
          score: 0.7,
          scoreBreakdown,
          coverageMetrics,
          coveredThreats: ['azumarill'],
          weaknesses: ['Stunfisk'],
          diagnosticLabel: 'ABC',
        },
      ],
      tournamentSelection: {
        policyVersion: 'selection-v1',
        datasetFingerprint: 'rankings-v1',
        stage: 'selection',
        source: 'curated',
        objectives: {
          coverage: 0.8,
          redundancy: 0.7,
          typical: 0.6,
          lowerTail: 0.5,
          flexibility: 0.4,
          independence: 0.3,
        },
        coverageAudit: {
          threatCount: 3,
          uncoveredCount: 1,
          singleAnswerCount: 1,
          evaluatedPairs: 6,
          backupCoverage: 0.5,
          pairProtection: 0.4,
          gaps: [
            {
              speciesId: 'stunfisk',
              answers: 1,
              primaryAnswer: 'azumarill',
              risk: 0.3,
            },
          ],
        },
        evaluatedRosters: 10,
        missingCells: 0,
        status: 'complete',
        limitations: ['No held-out data was available.'],
      },
    };

    expect(
      parseGenerationResponse(
        responseWithDiagnostics,
        'play-pokemon',
        'PlayPokemon',
      ),
    ).toMatchObject({
      scoreBreakdown,
      recommendedLineups: responseWithDiagnostics.recommendedLineups,
    });
  });

  it.each([
    [
      'missing Pokémon contribution analysis',
      (response: GenerationResponse): unknown => {
        const analysis = omitProperty(
          response.analysis,
          'pokemonContributions',
        );
        return { ...response, analysis };
      },
    ],
    [
      'malformed Pokémon contribution entries',
      (response: GenerationResponse): unknown => ({
        ...response,
        analysis: {
          ...response.analysis,
          pokemonContributions: {
            entries: [
              {
                speciesId: 'azumarill',
                pokemon: 42,
                threatsHandled: 'many',
                coverageAdded: null,
                highSeverityRelief: 1,
                fragilityRiskTier: 'extreme',
              },
            ],
          },
        },
      }),
    ],
    [
      'an incomplete optimizer score breakdown',
      (response: GenerationResponse): unknown => ({
        ...response,
        scoreBreakdown: {},
      }),
    ],
    [
      'malformed recommended lineups',
      (response: GenerationResponse): unknown => ({
        ...response,
        recommendedLineups: [{}],
      }),
    ],
    [
      'malformed optimizer threat entries',
      (response: GenerationResponse): unknown => ({
        ...response,
        scoreBreakdown: {
          components: {},
          weights: {},
          score: 0.5,
          threatScore: {
            score: 0.5,
            evaluatedCount: 1,
            topMetaThreats: [null],
            overallTeamThreats: [],
            pools: {
              topMeta: { score: 0.5, evaluatedCount: 1, weight: 0.7 },
              fullMeta: { score: null, evaluatedCount: 0, weight: 0.3 },
            },
          },
        },
      }),
    ],
    [
      'malformed tournament selection details',
      (response: GenerationResponse): unknown => ({
        ...response,
        tournamentSelection: {
          policyVersion: 'selection-v1',
          datasetFingerprint: 'rankings-v1',
          stage: 'selection',
          source: 'curated',
          objectives: {
            coverage: 0.8,
            redundancy: 0.7,
            typical: 0.6,
            lowerTail: 0.5,
            flexibility: 0.4,
            independence: 0.3,
          },
          coverageAudit: { gaps: [null] },
          evaluatedRosters: 10,
          missingCells: 0,
          status: 'complete',
          limitations: [],
        },
      }),
    ],
  ])('rejects %s before returning a result', (_label, alterResponse) => {
    const response = makeResponse('play-pokemon', 'PlayPokemon');

    expect(() =>
      parseGenerationResponse(
        alterResponse(response),
        'play-pokemon',
        'PlayPokemon',
      ),
    ).toThrow('Generation response is invalid. Please try again.');
  });

  it.each([
    [
      'a missing Pokémon record',
      (response: GenerationResponse) => {
        response.pokemon.pop();
      },
    ],
    [
      'an out-of-order Pokémon record',
      (response: GenerationResponse) => {
        response.pokemon.reverse();
      },
    ],
    [
      'a duplicate team member',
      (response: GenerationResponse) => {
        response.team[1] = response.team[0]!;
      },
    ],
    [
      'a mismatched assigned move slot',
      (response: GenerationResponse) => {
        Object.assign(response.pokemon[0]!.recommendedMoveset, {
          fastMove: 'WATER_GUN',
        });
      },
    ],
    [
      'a mismatched assignment authority',
      (response: GenerationResponse) => {
        Object.assign(response.pokemon[0]!.recommendedMoveset, {
          authority: {
            source: 'ranked-default-fallback',
            schemaVersion: 2,
            policyVersion: 'other-policy',
          },
        });
      },
    ],
    [
      'mismatched Mega variant properties',
      (response: GenerationResponse) => {
        const speciesId = response.team[0]!;
        const variant =
          response.movesetAssignment.variantsBySpeciesId[speciesId]!;
        const megaVariant = {
          ...variant,
          additionalChargedMove: 'DRAGON_CLAW',
          megaLevel: 4 as const,
        };
        Object.assign(
          response.movesetAssignment.variantsBySpeciesId[speciesId]!,
          megaVariant,
        );
        Object.assign(response.pokemon[0]!.recommendedMoveset, {
          additionalChargedMove: 'BLAST_BURN',
          megaLevel: 4,
        });
      },
    ],
    [
      'a malformed required display field',
      (response: GenerationResponse) => {
        response.pokemon[0]!.speciesName = '';
      },
    ],
    [
      'a malformed tags field when present',
      (response: GenerationResponse) => {
        Object.assign(response.pokemon[0]!, { tags: ['shadow', 42] });
      },
    ],
    [
      'an ineligible acquisition requirement',
      (response: GenerationResponse) => {
        Object.assign(
          response.pokemon[0]!.recommendedMoveset.acquisitionRequirements
            .fastMove,
          { kind: 'excluded', reason: 'excluded move' },
        );
      },
    ],
  ])('rejects %s', (_label, mutate) => {
    const response = makeResponse('play-pokemon', 'PlayPokemon');
    mutate(response);

    expect(() =>
      parseGenerationResponse(response, 'play-pokemon', 'PlayPokemon'),
    ).toThrow('Generation response is invalid. Please try again.');
  });

  it.each([
    ['the requested format', 'great-league' as const, 'PlayPokemon' as const],
    ['the requested mode', 'play-pokemon' as const, 'GBL' as const],
  ])('rejects a response inconsistent with %s', (_label, formatId, mode) => {
    const response = makeResponse('play-pokemon', 'PlayPokemon');

    expect(() => parseGenerationResponse(response, formatId, mode)).toThrow(
      'Generation response is invalid. Please try again.',
    );
  });
});
