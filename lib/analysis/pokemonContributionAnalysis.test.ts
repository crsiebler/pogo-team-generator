import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPokemonContributionAnalysis,
  getFragilityRiskTier,
} from '@/lib/analysis/pokemonContributionAnalysis';
import type { ThreatAnalysisEntry } from '@/lib/types';

const winsMatchupMock = vi.fn();

vi.mock('@/lib/data/simulations', () => ({
  winsMatchup: (...args: unknown[]) => winsMatchupMock(...args),
}));

describe('buildPokemonContributionAnalysis', () => {
  const threats: ThreatAnalysisEntry[] = [
    {
      speciesId: 'azumarill',
      pokemon: 'Azumarill',
      rank: 1,
      teamAnswers: 1,
      severityTier: 'critical',
    },
    {
      speciesId: 'gastrodon',
      pokemon: 'Gastrodon',
      rank: 2,
      teamAnswers: 2,
      severityTier: 'medium',
    },
    {
      speciesId: 'feraligatr',
      pokemon: 'Feraligatr',
      rank: 3,
      teamAnswers: 1,
      severityTier: 'high',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('builds per-Pokemon contribution stats using format-aware matchups', () => {
    winsMatchupMock.mockImplementation(
      (speciesId: string, opponentSpeciesId: string, formatId?: string) => {
        expect(formatId).toBe('great-league');

        return (
          (speciesId === 'lanturn' && opponentSpeciesId === 'azumarill') ||
          (speciesId === 'lanturn' && opponentSpeciesId === 'feraligatr') ||
          (speciesId === 'dewgong' && opponentSpeciesId === 'gastrodon')
        );
      },
    );

    const analysis = buildPokemonContributionAnalysis(
      ['lanturn', 'dewgong'],
      threats,
      'great-league',
    );

    expect(analysis.entries).toEqual([
      expect.objectContaining({
        speciesId: 'lanturn',
        threatsHandled: 2,
        coverageAdded: 2,
        highSeverityRelief: 2,
        fragilityRiskTier: 'low',
      }),
      expect.objectContaining({
        speciesId: 'dewgong',
        threatsHandled: 1,
        coverageAdded: 0,
        highSeverityRelief: 0,
        fragilityRiskTier: 'low',
      }),
    ]);
  });

  it('computes each threat matchup once per Pokemon', () => {
    winsMatchupMock.mockImplementation(
      (speciesId: string, opponentSpeciesId: string) => {
        return (
          (speciesId === 'lanturn' && opponentSpeciesId === 'azumarill') ||
          (speciesId === 'lanturn' && opponentSpeciesId === 'feraligatr') ||
          (speciesId === 'dewgong' && opponentSpeciesId === 'gastrodon')
        );
      },
    );

    buildPokemonContributionAnalysis(
      ['lanturn', 'dewgong'],
      threats,
      'great-league',
    );

    expect(winsMatchupMock).toHaveBeenCalledTimes(6);
  });
});

describe('getFragilityRiskTier', () => {
  it('classifies fragility tiers by coverage-added thresholds', () => {
    expect(getFragilityRiskTier(6)).toBe('high');
    expect(getFragilityRiskTier(3)).toBe('moderate');
    expect(getFragilityRiskTier(1)).toBe('low');
  });
});
