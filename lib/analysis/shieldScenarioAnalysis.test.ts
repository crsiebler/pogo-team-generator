import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildShieldScenarioAnalysis } from '@/lib/analysis/shieldScenarioAnalysis';
import type { ThreatAnalysisEntry } from '@/lib/types';

const speciesIdToRankingNameMock = vi.fn();
const getShieldScenarioMatchupResultMock = vi.fn();

vi.mock('@/lib/data/rankings', () => ({
  speciesIdToRankingName: (speciesId: string) =>
    speciesIdToRankingNameMock(speciesId),
}));

vi.mock('@/lib/data/simulations', () => ({
  getShieldScenarioMatchupResult: (
    pokemon: string,
    opponent: string,
    shields: 0 | 1 | 2,
  ) => getShieldScenarioMatchupResultMock(pokemon, opponent, shields),
}));

describe('buildShieldScenarioAnalysis', () => {
  const threats: ThreatAnalysisEntry[] = [
    {
      pokemon: 'Threat 1',
      rank: 1,
      teamAnswers: 2,
      severityTier: 'high',
    },
    {
      pokemon: 'Threat 2',
      rank: 2,
      teamAnswers: 1,
      severityTier: 'medium',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    speciesIdToRankingNameMock.mockImplementation((speciesId: string) =>
      speciesId.toUpperCase(),
    );
  });

  it('returns 0-0, 1-1, and 2-2 scenario statistics', () => {
    getShieldScenarioMatchupResultMock.mockImplementation(
      (pokemon: string, opponent: string, shields: 0 | 1 | 2) => {
        if (shields === 0 && pokemon === 'LANTURN' && opponent === 'Threat 1') {
          return 620;
        }

        if (shields === 1 && opponent === 'Threat 1') {
          return 480;
        }

        if (shields === 1 && opponent === 'Threat 2') {
          return 450;
        }

        if (shields === 2 && pokemon === 'LANTURN' && opponent === 'Threat 1') {
          return 420;
        }

        if (shields === 2 && pokemon === 'DEWGONG' && opponent === 'Threat 2') {
          return 700;
        }

        return null;
      },
    );

    const analysis = buildShieldScenarioAnalysis(
      ['lanturn', 'dewgong'],
      threats,
    );

    expect(analysis).toEqual({
      '0-0': {
        coveredThreats: 1,
        evaluatedThreats: 1,
        coverageRate: 1,
      },
      '1-1': {
        coveredThreats: 0,
        evaluatedThreats: 2,
        coverageRate: 0,
      },
      '2-2': {
        coveredThreats: 1,
        evaluatedThreats: 2,
        coverageRate: 0.5,
      },
    });
  });

  it('handles missing matchup data without throwing', () => {
    getShieldScenarioMatchupResultMock.mockReturnValue(null);

    const analysis = buildShieldScenarioAnalysis(
      ['lanturn', 'dewgong'],
      threats,
    );

    expect(analysis).toEqual({
      '0-0': {
        coveredThreats: 0,
        evaluatedThreats: 0,
        coverageRate: 0,
      },
      '1-1': {
        coveredThreats: 0,
        evaluatedThreats: 0,
        coverageRate: 0,
      },
      '2-2': {
        coveredThreats: 0,
        evaluatedThreats: 0,
        coverageRate: 0,
      },
    });
  });
});
