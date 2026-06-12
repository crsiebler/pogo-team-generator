import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { buildCoreBreakerAnalysis } from '@/lib/analysis/coreBreakerAnalysis';
import { buildPokemonContributionAnalysis } from '@/lib/analysis/pokemonContributionAnalysis';
import { buildShieldScenarioAnalysis } from '@/lib/analysis/shieldScenarioAnalysis';
import { buildThreatAnalysis } from '@/lib/analysis/threatAnalysis';
import {
  DEFAULT_BATTLE_FORMAT_ID,
  isBattleFrontierFormatId,
} from '@/lib/data/battleFormats';
import { getBattleFrontierMasterTeamLegality } from '@/lib/data/battleFrontierMasterRules';
import {
  isBattleFrontierBannedSpeciesId,
  speciesIdToSpeciesName,
  speciesNameToId,
  validateTeamUniqueness,
} from '@/lib/data/pokemon';
import {
  getRankedSpeciesIds,
  MissingRankingDataError,
} from '@/lib/data/rankings';
import { MissingSimulationDataError } from '@/lib/data/simulations';
import { generateTeam } from '@/lib/genetic/algorithm';

vi.mock('@/lib/data/battleFormats', async () => {
  const actual = await vi.importActual('@/lib/data/battleFormats');

  return {
    ...actual,
    isBattleFrontierFormatId: vi.fn(),
  };
});

vi.mock('@/lib/data/pokemon', async () => {
  const actual = await vi.importActual('@/lib/data/pokemon');

  return {
    ...actual,
    isBattleFrontierBannedSpeciesId: vi.fn(),
    speciesIdToSpeciesName: vi.fn(),
    speciesNameToId: vi.fn(),
    validateTeamUniqueness: vi.fn(),
  };
});

vi.mock('@/lib/genetic/algorithm', () => ({
  generateTeam: vi.fn(),
}));

vi.mock('@/lib/data/rankings', async () => {
  const actual = await vi.importActual('@/lib/data/rankings');

  return {
    ...actual,
    getRankedSpeciesIds: vi.fn(),
  };
});

vi.mock('@/lib/analysis/threatAnalysis', () => ({
  buildThreatAnalysis: vi.fn(),
}));

vi.mock('@/lib/analysis/coreBreakerAnalysis', () => ({
  buildCoreBreakerAnalysis: vi.fn(),
}));

vi.mock('@/lib/analysis/shieldScenarioAnalysis', () => ({
  buildShieldScenarioAnalysis: vi.fn(),
}));

vi.mock('@/lib/analysis/pokemonContributionAnalysis', () => ({
  buildPokemonContributionAnalysis: vi.fn(),
}));

vi.mock('@/lib/data/battleFrontierMasterRules', () => ({
  getBattleFrontierMasterTeamLegality: vi.fn(),
}));

describe('POST /api/generate-team', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.mocked(speciesNameToId).mockImplementation((name: string) =>
      name.toLowerCase().replace(/\s+/g, '-'),
    );
    vi.mocked(speciesIdToSpeciesName).mockImplementation(
      (speciesId: string) => {
        const namesById: Record<string, string> = {
          annihilape: 'Annihilape',
          azumarill: 'Azumarill',
          dewgong: 'Dewgong',
          feraligatr: 'Feraligatr',
          lanturn: 'Lanturn',
          marowak: 'Marowak',
          'marowak-shadow': 'Marowak (Shadow)',
          morpeko_full_belly: 'Morpeko (Full Belly)',
          venusaur: 'Venusaur',
        };

        return namesById[speciesId] ?? speciesId;
      },
    );
    vi.mocked(isBattleFrontierFormatId).mockImplementation((formatId) =>
      formatId.startsWith('battle-frontier-'),
    );
    vi.mocked(isBattleFrontierBannedSpeciesId).mockReturnValue(false);
    vi.mocked(validateTeamUniqueness).mockReturnValue(true);
    vi.mocked(getRankedSpeciesIds).mockReturnValue(
      new Set(['azumarill', 'marowak', 'marowak-shadow']),
    );
    vi.mocked(getBattleFrontierMasterTeamLegality).mockReturnValue({
      isLegal: true,
      totalPoints: 0,
      fivePointPokemonCount: 0,
      megaCount: 0,
      violations: [],
    });
    vi.mocked(generateTeam).mockResolvedValue({
      team: ['azumarill'],
      fitness: 1,
      anchors: [],
      recommendedLineups: [
        {
          lineup: {
            lead: 'azumarill',
            switch: 'marowak',
            closer: 'marowak-shadow',
          },
          score: 0.82,
          coverageMetrics: {
            coverageRate: 0.7,
            dominatingMatchupCount: 4,
            overwhelmingLossCount: 1,
            singleAnswerThreatCount: 1,
          },
          coveredThreats: ['feraligatr'],
          weaknesses: ['morpeko_full_belly'],
          diagnosticLabel: 'ABC',
        },
      ],
      scoreBreakdown: {
        components: {
          synergy: 0.91,
          coverage: 0.82,
          safety: 0.68,
          consistency: 0.57,
          bulk: 0.44,
          defensiveRatio: 0.72,
          offensiveRatio: 0.61,
          role: 0.38,
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
        score: 0.74,
      },
    });
    vi.mocked(buildThreatAnalysis).mockReturnValue({
      evaluatedCount: 50,
      entries: [
        {
          speciesId: 'feraligatr',
          pokemon: 'Feraligatr',
          rank: 1,
          teamAnswers: 2,
          severityTier: 'high',
        },
      ],
    });
    vi.mocked(buildCoreBreakerAnalysis).mockReturnValue({
      threshold: 1,
      entries: [
        {
          pokemon: 'Feraligatr',
          rank: 1,
          teamAnswers: 1,
          severityTier: 'medium',
        },
      ],
    });
    vi.mocked(buildShieldScenarioAnalysis).mockReturnValue({
      '0-0': {
        coveredThreats: 12,
        evaluatedThreats: 40,
        coverageRate: 0.3,
      },
      '1-1': {
        coveredThreats: 18,
        evaluatedThreats: 42,
        coverageRate: 0.4286,
      },
      '2-2': {
        coveredThreats: 15,
        evaluatedThreats: 38,
        coverageRate: 0.3947,
      },
    });
    vi.mocked(buildPokemonContributionAnalysis).mockReturnValue({
      entries: [
        {
          speciesId: 'lanturn',
          pokemon: 'Lanturn',
          threatsHandled: 12,
          coverageAdded: 3,
          highSeverityRelief: 4,
          fragilityRiskTier: 'moderate',
        },
      ],
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('passes validated formatId to team generation', async () => {
    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'ultra-league',
        anchorPokemon: ['Azumarill'],
      }),
    });

    const response = await POST(request as NextRequest);

    expect(response.status).toBe(200);
    expect(generateTeam).toHaveBeenCalledWith(
      expect.objectContaining({ formatId: 'ultra-league' }),
    );
  });

  it.each([
    ['great-league'],
    ['ultra-league'],
    ['master-league'],
    ['naic-2026-championship-cup'],
    ['battle-frontier-bayou-cup'],
    ['battle-frontier-spellcraft-cup'],
    ['battle-frontier-ul-retro'],
    ['battle-frontier-master'],
  ] as const)(
    'passes %s formatId to team generation for end-to-end requests',
    async (formatId) => {
      const request = new Request('http://localhost/api/generate-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'PlayPokemon',
          formatId,
        }),
      });

      const response = await POST(request as NextRequest);

      expect(response.status).toBe(200);
      expect(generateTeam).toHaveBeenCalledWith(
        expect.objectContaining({ formatId }),
      );
    },
  );

  it('defaults formatId to Great League when omitted', async () => {
    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
      }),
    });

    const response = await POST(request as NextRequest);

    expect(response.status).toBe(200);
    expect(generateTeam).toHaveBeenCalledWith(
      expect.objectContaining({ formatId: DEFAULT_BATTLE_FORMAT_ID }),
    );
  });

  it('returns team, fitness, lineup-aware fields, and top-level analysis without algorithm labels', async () => {
    vi.mocked(generateTeam).mockResolvedValue({
      team: ['lanturn', 'dewgong', 'annihilape'],
      fitness: 0.8123,
      anchors: [],
      recommendedLineups: [
        {
          lineup: {
            lead: 'lanturn',
            switch: 'dewgong',
            closer: 'annihilape',
          },
          score: 0.91,
          scoreBreakdown: {
            components: {
              synergy: 0.92,
              coverage: 0.87,
              safety: 0.72,
              consistency: 0.7,
              bulk: 0.66,
              defensiveRatio: 0.81,
              offensiveRatio: 0.77,
              role: 0.69,
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
            score: 0.81,
            threatScore: {
              score: 0.32,
              evaluatedCount: 2,
              topMetaThreats: [
                {
                  speciesId: 'venusaur',
                  pokemon: 'Venusaur',
                  rank: 1,
                  teamAnswers: 0,
                  threatValue: 1,
                  severityTier: 'critical',
                },
              ],
              overallTeamThreats: [
                {
                  speciesId: 'venusaur',
                  pokemon: 'Venusaur',
                  rank: 1,
                  teamAnswers: 0,
                  threatValue: 1,
                  severityTier: 'critical',
                },
              ],
            },
          },
          coverageMetrics: {
            coverageRate: 0.86,
            dominatingMatchupCount: 5,
            overwhelmingLossCount: 1,
            singleAnswerThreatCount: 1,
          },
          coveredThreats: ['feraligatr'],
          weaknesses: ['venusaur'],
          diagnosticLabel: 'ABC',
        },
      ],
      scoreBreakdown: {
        components: {
          synergy: 0.91,
          coverage: 0.82,
          safety: 0.68,
          consistency: 0.57,
          bulk: 0.44,
          defensiveRatio: 0.72,
          offensiveRatio: 0.61,
          role: 0.38,
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
        score: 0.74,
        threatScore: {
          score: 0.28,
          evaluatedCount: 2,
          topMetaThreats: [
            {
              speciesId: 'venusaur',
              pokemon: 'Venusaur',
              rank: 1,
              teamAnswers: 0,
              threatValue: 1,
              severityTier: 'critical',
            },
          ],
          overallTeamThreats: [
            {
              speciesId: 'venusaur',
              pokemon: 'Venusaur',
              rank: 1,
              teamAnswers: 0,
              threatValue: 1,
              severityTier: 'critical',
            },
          ],
        },
      },
    });

    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'GBL',
        formatId: 'great-league',
        anchorPokemon: ['Marowak'],
        excludedPokemon: ['Azumarill'],
      }),
    });

    const response = await POST(request as NextRequest);
    const payload = (await response.json()) as {
      team: string[];
      fitness: number;
      scoreBreakdown: {
        components: {
          synergy: number;
          coverage: number;
          safety: number;
          consistency: number;
          bulk: number;
          defensiveRatio: number;
          offensiveRatio: number;
          role: number;
        };
        weights: {
          synergy: number;
          coverage: number;
          safety: number;
          consistency: number;
          bulk: number;
          defensiveRatio: number;
          offensiveRatio: number;
          role: number;
        };
        score: number;
        threatScore?: unknown;
      };
      recommendedLineups: unknown[];
      analysis: {
        mode: string;
        teamSize: number;
        generatedAt: string;
        threats: {
          evaluatedCount: number;
          entries: Array<{
            pokemon: string;
            rank: number;
            teamAnswers: number;
            severityTier: string;
          }>;
        };
        coreBreakers: {
          threshold: number;
          entries: Array<{
            pokemon: string;
            rank: number;
            teamAnswers: number;
            severityTier: string;
          }>;
        };
        shieldScenarios: {
          '0-0': {
            coveredThreats: number;
            evaluatedThreats: number;
            coverageRate: number;
          };
          '1-1': {
            coveredThreats: number;
            evaluatedThreats: number;
            coverageRate: number;
          };
          '2-2': {
            coveredThreats: number;
            evaluatedThreats: number;
            coverageRate: number;
          };
        };
        pokemonContributions: {
          entries: Array<{
            speciesId: string;
            pokemon: string;
            threatsHandled: number;
            coverageAdded: number;
            highSeverityRelief: number;
            fragilityRiskTier: string;
          }>;
        };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.team).toEqual(['lanturn', 'dewgong', 'annihilape']);
    expect(payload.fitness).toBe(0.8123);
    expect(payload.recommendedLineups).toEqual([
      {
        lineup: {
          lead: 'Lanturn',
          switch: 'Dewgong',
          closer: 'Annihilape',
        },
        score: 0.91,
        scoreBreakdown: {
          components: {
            synergy: 0.92,
            coverage: 0.87,
            safety: 0.72,
            consistency: 0.7,
            bulk: 0.66,
            defensiveRatio: 0.81,
            offensiveRatio: 0.77,
            role: 0.69,
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
          score: 0.81,
          threatScore: {
            score: 0.32,
            evaluatedCount: 2,
            topMetaThreats: [
              {
                speciesId: 'venusaur',
                pokemon: 'Venusaur',
                rank: 1,
                teamAnswers: 0,
                threatValue: 1,
                severityTier: 'critical',
              },
            ],
            overallTeamThreats: [
              {
                speciesId: 'venusaur',
                pokemon: 'Venusaur',
                rank: 1,
                teamAnswers: 0,
                threatValue: 1,
                severityTier: 'critical',
              },
            ],
          },
        },
        coverageMetrics: {
          coverageRate: 0.86,
          dominatingMatchupCount: 5,
          overwhelmingLossCount: 1,
          singleAnswerThreatCount: 1,
        },
        coveredThreats: ['feraligatr'],
        weaknesses: ['Venusaur'],
        diagnosticLabel: 'ABC',
      },
    ]);
    expect(payload.scoreBreakdown.components).toMatchObject({
      synergy: 0.91,
      defensiveRatio: 0.72,
      offensiveRatio: 0.61,
      role: 0.38,
    });
    expect(payload.scoreBreakdown.weights).toMatchObject({
      synergy: 0.24,
      coverage: 0.21,
      safety: 0.17,
      consistency: 0.13,
      bulk: 0.1,
      defensiveRatio: 0.07,
      offensiveRatio: 0.05,
      role: 0.03,
    });
    expect(payload.scoreBreakdown.score).toBe(0.74);
    expect(payload.scoreBreakdown.threatScore).toEqual({
      score: 0.28,
      evaluatedCount: 2,
      topMetaThreats: [
        {
          speciesId: 'venusaur',
          pokemon: 'Venusaur',
          rank: 1,
          teamAnswers: 0,
          threatValue: 1,
          severityTier: 'critical',
        },
      ],
      overallTeamThreats: [
        {
          speciesId: 'venusaur',
          pokemon: 'Venusaur',
          rank: 1,
          teamAnswers: 0,
          threatValue: 1,
          severityTier: 'critical',
        },
      ],
    });
    expect(payload).not.toHaveProperty('algorithm');
    expect(payload.analysis).not.toHaveProperty('algorithm');
    expect(payload.analysis).toMatchObject({
      mode: 'GBL',
      teamSize: 3,
      threats: {
        evaluatedCount: 50,
        entries: [
          {
            speciesId: 'feraligatr',
            pokemon: 'Feraligatr',
            rank: 1,
            teamAnswers: 2,
            severityTier: 'high',
          },
        ],
      },
      coreBreakers: {
        threshold: 1,
        entries: [
          {
            pokemon: 'Feraligatr',
            rank: 1,
            teamAnswers: 1,
            severityTier: 'medium',
          },
        ],
      },
      shieldScenarios: {
        '0-0': {
          coveredThreats: 12,
          evaluatedThreats: 40,
          coverageRate: 0.3,
        },
        '1-1': {
          coveredThreats: 18,
          evaluatedThreats: 42,
          coverageRate: 0.4286,
        },
        '2-2': {
          coveredThreats: 15,
          evaluatedThreats: 38,
          coverageRate: 0.3947,
        },
      },
      pokemonContributions: {
        entries: [
          {
            speciesId: 'lanturn',
            pokemon: 'Lanturn',
            threatsHandled: 12,
            coverageAdded: 3,
            highSeverityRelief: 4,
            fragilityRiskTier: 'moderate',
          },
        ],
      },
    });
    expect(payload.analysis.pokemonContributions.entries[0]).not.toHaveProperty(
      'rationale',
    );
    expect(typeof payload.analysis.generatedAt).toBe('string');
    expect(payload.analysis.generatedAt.length).toBeGreaterThan(0);
    expect(buildThreatAnalysis).toHaveBeenCalledWith(
      ['lanturn', 'dewgong', 'annihilape'],
      'great-league',
    );
    expect(buildCoreBreakerAnalysis).toHaveBeenCalledWith(3, [
      {
        speciesId: 'feraligatr',
        pokemon: 'Feraligatr',
        rank: 1,
        teamAnswers: 2,
        severityTier: 'high',
      },
    ]);
    expect(buildShieldScenarioAnalysis).toHaveBeenCalledWith(
      ['lanturn', 'dewgong', 'annihilape'],
      [
        {
          speciesId: 'feraligatr',
          pokemon: 'Feraligatr',
          rank: 1,
          teamAnswers: 2,
          severityTier: 'high',
        },
      ],
      'great-league',
    );
    expect(buildPokemonContributionAnalysis).toHaveBeenCalledWith(
      ['lanturn', 'dewgong', 'annihilape'],
      [
        {
          speciesId: 'feraligatr',
          pokemon: 'Feraligatr',
          rank: 1,
          teamAnswers: 2,
          severityTier: 'high',
        },
      ],
      'great-league',
    );
  });

  it('passes no algorithm into canonical team generation', async () => {
    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'great-league',
      }),
    });

    const response = await POST(request as NextRequest);
    const [generationOptions] = vi.mocked(generateTeam).mock.calls[0];

    expect(response.status).toBe(200);
    expect(generationOptions).not.toHaveProperty('algorithm');
  });

  it('ignores deprecated algorithm request fields', async () => {
    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'great-league',
        algorithm: 'broken-algorithm',
      }),
    });

    const response = await POST(request as NextRequest);
    const [generationOptions] = vi.mocked(generateTeam).mock.calls[0];

    expect(response.status).toBe(200);
    expect(generationOptions).not.toHaveProperty('algorithm');
  });

  it('returns PlayPokemon lineup recommendations without roster metrics display payload', async () => {
    const generatedTeamResult = {
      team: ['azumarill', 'marowak', 'marowak-shadow'],
      fitness: 0.765,
      anchors: [],
      recommendedLineups: [
        {
          lineup: {
            lead: 'azumarill',
            switch: 'marowak',
            closer: 'marowak-shadow',
          },
          score: 0.82,
          coverageMetrics: {
            coverageRate: 0.7,
            dominatingMatchupCount: 4,
            overwhelmingLossCount: 1,
            singleAnswerThreatCount: 1,
          },
          coveredThreats: ['feraligatr'],
          weaknesses: ['morpeko_full_belly'],
          diagnosticLabel: 'ABC',
          resourcePathMetrics: {
            balanced: { available: true, score: 0.8 },
            shieldSpend: { available: true, score: 0.65 },
            shieldSave: { available: true, score: 0.55 },
          },
        },
      ],
      rosterMetrics: {
        viableLineupCount: 12,
        topLineupQuality: 0.82,
        topNLineupDepth: 0.74,
        dominatingMatchupRate: 0.2,
        overwhelmingLossRate: 0.05,
        singleAnswerRisks: ['morpeko_full_belly'],
        viableLeadDiversity: 3,
        benchUtilitySummary: [
          {
            speciesId: 'azumarill',
            utilityScore: 1,
            totalAppearances: 5,
            leadAppearances: 5,
            switchAppearances: 0,
            closerAppearances: 0,
            warnings: [],
          },
        ],
      },
      benchUtility: [
        {
          speciesId: 'azumarill',
          utilityScore: 1,
          totalAppearances: 5,
          leadAppearances: 5,
          switchAppearances: 0,
          closerAppearances: 0,
          warnings: [],
        },
      ],
    } as unknown as Awaited<ReturnType<typeof generateTeam>>;

    vi.mocked(generateTeam).mockResolvedValue(generatedTeamResult);

    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'great-league',
      }),
    });

    const response = await POST(request as NextRequest);
    const payload = (await response.json()) as {
      recommendedLineups: unknown[];
    };

    expect(response.status).toBe(200);
    expect(payload.recommendedLineups).toEqual([
      {
        lineup: {
          lead: 'Azumarill',
          switch: 'Marowak',
          closer: 'Marowak (Shadow)',
        },
        score: 0.82,
        coverageMetrics: {
          coverageRate: 0.7,
          dominatingMatchupCount: 4,
          overwhelmingLossCount: 1,
          singleAnswerThreatCount: 1,
        },
        coveredThreats: ['feraligatr'],
        weaknesses: ['Morpeko (Full Belly)'],
        diagnosticLabel: 'ABC',
      },
    ]);
    expect(payload).not.toHaveProperty('rosterMetrics');
    expect(payload).not.toHaveProperty('benchUtility');
    expect(payload.recommendedLineups[0]).not.toHaveProperty(
      'resourcePathMetrics',
    );
  });

  it('returns optimizer score breakdown for analysis display', async () => {
    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'great-league',
      }),
    });

    const response = await POST(request as NextRequest);
    const payload = (await response.json()) as {
      scoreBreakdown?: unknown;
    };

    expect(response.status).toBe(200);
    expect(payload.scoreBreakdown).toEqual({
      components: {
        synergy: 0.91,
        coverage: 0.82,
        safety: 0.68,
        consistency: 0.57,
        bulk: 0.44,
        defensiveRatio: 0.72,
        offensiveRatio: 0.61,
        role: 0.38,
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
      score: 0.74,
    });
  });

  it.each([['little-cup'], ['kanto-cup'], ['spring-cup']] as const)(
    'returns 400 for invalid formatId %s',
    async (formatId) => {
      const request = new Request('http://localhost/api/generate-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'PlayPokemon',
          formatId,
        }),
      });

      const response = await POST(request as NextRequest);
      const responseBody = (await response.json()) as { error: string };

      expect(response.status).toBe(400);
      expect(responseBody.error).toBe(`Invalid battle format: ${formatId}`);
      expect(generateTeam).not.toHaveBeenCalled();
    },
  );

  it('returns 400 when Battle Frontier requests use GBL mode', async () => {
    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'GBL',
        formatId: 'battle-frontier-master',
      }),
    });

    const response = await POST(request as NextRequest);
    const responseBody = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe(
      'Battle Frontier formats only support Play! Pokemon team generation.',
    );
    expect(generateTeam).not.toHaveBeenCalled();
  });

  it('returns 400 when selected anchor is not ranked in selected format', async () => {
    vi.mocked(speciesNameToId).mockImplementation((name: string) =>
      name === 'Pikachu' ? 'pikachu' : name.toLowerCase().replace(/\s+/g, '-'),
    );
    vi.mocked(getRankedSpeciesIds).mockReturnValue(new Set(['azumarill']));

    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'ultra-league',
        anchorPokemon: ['Pikachu'],
      }),
    });

    const response = await POST(request as NextRequest);
    const responseBody = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe(
      'Pokémon is not eligible for ultra-league: Pikachu',
    );
    expect(generateTeam).not.toHaveBeenCalled();
  });

  it('returns 400 when a Battle Frontier anchor is on the banned list', async () => {
    vi.mocked(speciesNameToId).mockImplementation((name: string) =>
      name === 'Groudon (Primal)'
        ? 'groudon_primal'
        : name.toLowerCase().replace(/\s+/g, '-'),
    );
    vi.mocked(getRankedSpeciesIds).mockReturnValue(new Set(['groudon_primal']));
    vi.mocked(isBattleFrontierBannedSpeciesId).mockImplementation(
      (speciesId: string) => speciesId === 'groudon_primal',
    );

    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'battle-frontier-master',
        anchorPokemon: ['Groudon (Primal)'],
      }),
    });

    const response = await POST(request as NextRequest);
    const responseBody = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe(
      'Pokémon is not eligible for battle-frontier-master: Groudon (Primal)',
    );
    expect(generateTeam).not.toHaveBeenCalled();
  });

  it('returns 400 when Battle Frontier Master anchors exceed the point cap', async () => {
    vi.mocked(getBattleFrontierMasterTeamLegality).mockReturnValue({
      isLegal: false,
      totalPoints: 12,
      fivePointPokemonCount: 1,
      megaCount: 0,
      violations: ['points-cap'],
    });

    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'battle-frontier-master',
        anchorPokemon: ['Azumarill', 'Marowak'],
      }),
    });

    const response = await POST(request as NextRequest);
    const responseBody = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe(
      'Battle Frontier Master anchors exceed the 11-point cap.',
    );
    expect(getBattleFrontierMasterTeamLegality).toHaveBeenCalledWith([
      'azumarill',
      'marowak',
    ]);
    expect(generateTeam).not.toHaveBeenCalled();
  });

  it('returns 400 when Battle Frontier Master anchors include multiple 5-point Pokemon', async () => {
    vi.mocked(getBattleFrontierMasterTeamLegality).mockReturnValue({
      isLegal: false,
      totalPoints: 10,
      fivePointPokemonCount: 2,
      megaCount: 0,
      violations: ['five-point-limit'],
    });

    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'battle-frontier-master',
        anchorPokemon: ['Azumarill', 'Marowak'],
      }),
    });

    const response = await POST(request as NextRequest);
    const responseBody = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe(
      'Battle Frontier Master anchors can include at most one 5-point Pokemon.',
    );
    expect(generateTeam).not.toHaveBeenCalled();
  });

  it('returns 400 when Battle Frontier Master anchors include multiple Mega Pokemon', async () => {
    vi.mocked(getBattleFrontierMasterTeamLegality).mockReturnValue({
      isLegal: false,
      totalPoints: 8,
      fivePointPokemonCount: 0,
      megaCount: 2,
      violations: ['mega-limit'],
    });

    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'battle-frontier-master',
        anchorPokemon: ['Azumarill', 'Marowak'],
      }),
    });

    const response = await POST(request as NextRequest);
    const responseBody = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe(
      'Battle Frontier Master anchors can include at most one Mega Pokemon.',
    );
    expect(generateTeam).not.toHaveBeenCalled();
  });

  it('returns a clear error when selected format simulation data is missing', async () => {
    vi.mocked(generateTeam).mockRejectedValue(
      new MissingSimulationDataError('ultra-league'),
    );

    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'ultra-league',
      }),
    });

    const response = await POST(request as NextRequest);
    const responseBody = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(responseBody.error).toMatch(
      /Simulation data missing for Ultra League \(all\/2500\)/,
    );
  });

  it('returns a clear error when selected format ranking data is missing', async () => {
    vi.mocked(generateTeam).mockRejectedValue(
      new MissingRankingDataError(
        'master-league',
        'overall',
        'cp10000_all_overall_rankings.csv',
      ),
    );

    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'master-league',
      }),
    });

    const response = await POST(request as NextRequest);
    const responseBody = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(responseBody.error).toMatch(
      /Ranking data missing for Master League \(all\/10000\), category overall: cp10000_all_overall_rankings\.csv/,
    );
  });
});
