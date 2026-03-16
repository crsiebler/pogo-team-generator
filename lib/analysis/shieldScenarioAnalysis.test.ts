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
    formatId?: string,
  ) => getShieldScenarioMatchupResultMock(pokemon, opponent, shields, formatId),
}));

describe('buildShieldScenarioAnalysis', () => {
  const threats: ThreatAnalysisEntry[] = [
    {
      speciesId: 'threat-1',
      pokemon: 'Threat 1',
      rank: 1,
      teamAnswers: 2,
      severityTier: 'high',
    },
    {
      speciesId: 'threat-2',
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
        if (shields === 0 && pokemon === 'lanturn' && opponent === 'threat-1') {
          return 620;
        }

        if (shields === 1 && opponent === 'threat-1') {
          return 480;
        }

        if (shields === 1 && opponent === 'threat-2') {
          return 450;
        }

        if (shields === 2 && pokemon === 'lanturn' && opponent === 'threat-1') {
          return 420;
        }

        if (shields === 2 && pokemon === 'dewgong' && opponent === 'threat-2') {
          return 700;
        }

        return null;
      },
    );

    const analysis = buildShieldScenarioAnalysis(
      ['lanturn', 'dewgong'],
      threats,
      'great-league',
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
      'great-league',
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

  it('threads formatId into shield-scenario lookups', () => {
    getShieldScenarioMatchupResultMock.mockReturnValue(null);

    buildShieldScenarioAnalysis(['lanturn'], threats, 'spring-cup');

    expect(getShieldScenarioMatchupResultMock).toHaveBeenCalledWith(
      'lanturn',
      'threat-1',
      0,
      'spring-cup',
    );
  });

  it('treats shield scenario coverage as evaluated once data exists and covered on first win', () => {
    getShieldScenarioMatchupResultMock.mockImplementation(
      (pokemon: string, opponent: string, shields: 0 | 1 | 2) => {
        if (pokemon === 'lanturn' && opponent === 'threat-1' && shields === 1) {
          return 640;
        }

        if (pokemon === 'lanturn' && opponent === 'threat-2' && shields === 1) {
          return null;
        }

        if (pokemon === 'dewgong' && opponent === 'threat-2' && shields === 1) {
          return 430;
        }

        return null;
      },
    );

    const analysis = buildShieldScenarioAnalysis(
      ['lanturn', 'dewgong'],
      threats,
      'great-league',
    );

    expect(analysis['1-1']).toEqual({
      coveredThreats: 1,
      evaluatedThreats: 2,
      coverageRate: 0.5,
    });
  });
});
