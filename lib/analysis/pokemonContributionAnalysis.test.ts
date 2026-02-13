import { describe, expect, it, vi } from 'vitest';
import {
  buildPokemonContributionAnalysis,
  getFragilityRiskTier,
} from './pokemonContributionAnalysis';

const speciesIdToRankingNameMock = vi.fn();
const winsMatchupMock = vi.fn();

vi.mock('@/lib/data/rankings', () => ({
  speciesIdToRankingName: (speciesId: string) =>
    speciesIdToRankingNameMock(speciesId),
}));

vi.mock('@/lib/data/simulations', () => ({
  winsMatchup: (pokemon: string, opponent: string) =>
    winsMatchupMock(pokemon, opponent),
}));

describe('buildPokemonContributionAnalysis', () => {
  it('builds per-Pokemon coverage and fragility details in team order', () => {
    speciesIdToRankingNameMock.mockImplementation((speciesId: string) => {
      const map: Record<string, string> = {
        lanturn: 'Lanturn',
        dewgong: 'Dewgong',
      };

      return map[speciesId] ?? speciesId;
    });

    winsMatchupMock.mockImplementation((pokemon: string, opponent: string) => {
      if (pokemon === 'Lanturn') {
        return ['Feraligatr', 'Azumarill', 'Drapion'].includes(opponent);
      }

      if (pokemon === 'Dewgong') {
        return ['Azumarill'].includes(opponent);
      }

      return false;
    });

    const analysis = buildPokemonContributionAnalysis(
      ['lanturn', 'dewgong'],
      [
        {
          pokemon: 'Feraligatr',
          rank: 1,
          teamAnswers: 1,
          severityTier: 'critical',
        },
        {
          pokemon: 'Azumarill',
          rank: 2,
          teamAnswers: 2,
          severityTier: 'high',
        },
        {
          pokemon: 'Drapion',
          rank: 3,
          teamAnswers: 1,
          severityTier: 'medium',
        },
      ],
    );

    expect(analysis.entries).toHaveLength(2);
    expect(analysis.entries[0]).toMatchObject({
      speciesId: 'lanturn',
      pokemon: 'Lanturn',
      threatsHandled: 3,
      coverageAdded: 2,
      highSeverityRelief: 2,
      fragilityRiskTier: 'low',
    });
    expect(analysis.entries[0].rationale).toContain(
      'adds 2 unique team answers',
    );

    expect(analysis.entries[1]).toMatchObject({
      speciesId: 'dewgong',
      pokemon: 'Dewgong',
      threatsHandled: 1,
      coverageAdded: 0,
      highSeverityRelief: 1,
      fragilityRiskTier: 'low',
    });
  });
});

describe('getFragilityRiskTier', () => {
  it('classifies replacement fragility by coverage-added thresholds', () => {
    expect(getFragilityRiskTier(0)).toBe('low');
    expect(getFragilityRiskTier(2)).toBe('low');
    expect(getFragilityRiskTier(3)).toBe('moderate');
    expect(getFragilityRiskTier(5)).toBe('moderate');
    expect(getFragilityRiskTier(6)).toBe('high');
  });
});
