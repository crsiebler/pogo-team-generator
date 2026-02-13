import { NextRequest } from 'next/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';

const speciesNameToIdMock = vi.fn();
const validateTeamUniquenessMock = vi.fn();
const generateTeamMock = vi.fn();
const buildThreatAnalysisMock = vi.fn();
const buildCoreBreakerAnalysisMock = vi.fn();
const buildShieldScenarioAnalysisMock = vi.fn();

vi.mock('@/lib/data/pokemon', () => ({
  speciesNameToId: (name: string) => speciesNameToIdMock(name),
  validateTeamUniqueness: (team: string[]) => validateTeamUniquenessMock(team),
}));

vi.mock('@/lib/genetic/algorithm', () => ({
  generateTeam: (options: unknown) => generateTeamMock(options),
}));

vi.mock('@/lib/analysis/threatAnalysis', () => ({
  buildThreatAnalysis: (team: string[]) => buildThreatAnalysisMock(team),
}));

vi.mock('@/lib/analysis/coreBreakerAnalysis', () => ({
  buildCoreBreakerAnalysis: (teamSize: number, threats: unknown[]) =>
    buildCoreBreakerAnalysisMock(teamSize, threats),
}));

vi.mock('@/lib/analysis/shieldScenarioAnalysis', () => ({
  buildShieldScenarioAnalysis: (team: string[], threats: unknown[]) =>
    buildShieldScenarioAnalysisMock(team, threats),
}));

describe('POST /api/generate-team', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.spyOn(console, 'log').mockImplementation(() => undefined);
    vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);
  });

  it('returns team and fitness unchanged with top-level analysis', async () => {
    speciesNameToIdMock.mockImplementation((name: string) =>
      name.toLowerCase().replaceAll(' ', '_'),
    );
    validateTeamUniquenessMock.mockReturnValue(true);
    generateTeamMock.mockResolvedValue({
      team: ['lanturn', 'dewgong', 'annihilape'],
      fitness: 0.8123,
    });
    buildThreatAnalysisMock.mockReturnValue({
      evaluatedCount: 50,
      entries: [
        {
          pokemon: 'Feraligatr',
          rank: 1,
          teamAnswers: 2,
          severityTier: 'high',
        },
      ],
    });
    buildCoreBreakerAnalysisMock.mockReturnValue({
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
    buildShieldScenarioAnalysisMock.mockReturnValue({
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

    const request = new NextRequest('http://localhost/api/generate-team', {
      method: 'POST',
      body: JSON.stringify({
        mode: 'GBL',
        anchorPokemon: ['Lanturn'],
        excludedPokemon: ['Skarmory'],
        algorithm: 'teamSynergy',
      }),
      headers: {
        'Content-Type': 'application/json',
      },
    });

    const response = await POST(request);
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
    });
    expect(typeof payload.analysis.generatedAt).toBe('string');
    expect(payload.analysis.generatedAt.length).toBeGreaterThan(0);
    expect(buildThreatAnalysisMock).toHaveBeenCalledWith([
      'lanturn',
      'dewgong',
      'annihilape',
    ]);
    expect(buildCoreBreakerAnalysisMock).toHaveBeenCalledWith(3, [
      {
        pokemon: 'Feraligatr',
        rank: 1,
        teamAnswers: 2,
        severityTier: 'high',
      },
    ]);
    expect(buildShieldScenarioAnalysisMock).toHaveBeenCalledWith(
      ['lanturn', 'dewgong', 'annihilape'],
      [
        {
          pokemon: 'Feraligatr',
          rank: 1,
          teamAnswers: 2,
          severityTier: 'high',
        },
      ],
    );
  });
});
