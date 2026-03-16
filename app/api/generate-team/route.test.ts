import type { NextRequest } from 'next/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { buildCoreBreakerAnalysis } from '@/lib/analysis/coreBreakerAnalysis';
import { buildPokemonContributionAnalysis } from '@/lib/analysis/pokemonContributionAnalysis';
import { buildShieldScenarioAnalysis } from '@/lib/analysis/shieldScenarioAnalysis';
import { buildThreatAnalysis } from '@/lib/analysis/threatAnalysis';
import { DEFAULT_BATTLE_FORMAT_ID } from '@/lib/data/battleFormats';
import { speciesNameToId, validateTeamUniqueness } from '@/lib/data/pokemon';
import {
  getRankedSpeciesIds,
  MissingRankingDataError,
} from '@/lib/data/rankings';
import { MissingSimulationDataError } from '@/lib/data/simulations';
import { generateTeam } from '@/lib/genetic/algorithm';

vi.mock('@/lib/data/pokemon', async () => {
  const actual = await vi.importActual('@/lib/data/pokemon');

  return {
    ...actual,
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

describe('POST /api/generate-team', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    vi.mocked(speciesNameToId).mockImplementation((name: string) =>
      name.toLowerCase().replace(/\s+/g, '-'),
    );
    vi.mocked(validateTeamUniqueness).mockReturnValue(true);
    vi.mocked(getRankedSpeciesIds).mockReturnValue(
      new Set(['azumarill', 'marowak', 'marowak-shadow']),
    );
    vi.mocked(generateTeam).mockResolvedValue({
      team: ['azumarill'],
      fitness: 1,
      anchors: [],
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
          rationale: 'Test rationale.',
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
    ['battle-frontier-bayou-cup'],
    ['battle-frontier-brujeria-cup'],
    ['battle-frontier-ul-retro'],
    ['battle-frontier-master'],
    ['kanto-cup'],
    ['spring-cup'],
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

  it('returns team and fitness unchanged with top-level analysis', async () => {
    vi.mocked(generateTeam).mockResolvedValue({
      team: ['lanturn', 'dewgong', 'annihilape'],
      fitness: 0.8123,
      anchors: [],
    });

    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'GBL',
        formatId: 'great-league',
        anchorPokemon: ['Marowak'],
        excludedPokemon: ['Azumarill'],
        algorithm: 'teamSynergy',
      }),
    });

    const response = await POST(request as NextRequest);
    const payload = (await response.json()) as {
      team: string[];
      fitness: number;
      analysis: {
        mode: string;
        algorithm: string;
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
          }>;
        };
      };
    };

    expect(response.status).toBe(200);
    expect(payload.team).toEqual(['lanturn', 'dewgong', 'annihilape']);
    expect(payload.fitness).toBe(0.8123);
    expect(payload.analysis).toMatchObject({
      mode: 'GBL',
      algorithm: 'teamSynergy',
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
          },
        ],
      },
    });
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

  it('returns 400 for invalid formatId', async () => {
    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'little-cup',
      }),
    });

    const response = await POST(request as NextRequest);
    const responseBody = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe('Invalid battle format: little-cup');
    expect(generateTeam).not.toHaveBeenCalled();
  });

  it('returns 400 for invalid algorithm values', async () => {
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
    const responseBody = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe(
      'Invalid fitness algorithm: broken-algorithm',
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
