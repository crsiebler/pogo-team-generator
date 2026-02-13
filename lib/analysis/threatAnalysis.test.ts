import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildThreatAnalysis,
  calculateThreatSeverity,
} from '@/lib/analysis/threatAnalysis';

const getTopPokemonMock = vi.fn();
const speciesIdToRankingNameMock = vi.fn();
const winsMatchupMock = vi.fn();

vi.mock('@/lib/data/rankings', () => ({
  getTopPokemon: (...args: unknown[]) => getTopPokemonMock(...args),
  speciesIdToRankingName: (speciesId: string) =>
    speciesIdToRankingNameMock(speciesId),
}));

vi.mock('@/lib/data/simulations', () => ({
  winsMatchup: (pokemon: string, opponent: string) =>
    winsMatchupMock(pokemon, opponent),
}));

describe('buildThreatAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    speciesIdToRankingNameMock.mockImplementation((speciesId: string) =>
      speciesId.toUpperCase(),
    );
  });

  it('evaluates exactly the top 50 ranked threats', () => {
    const rankedThreats = Array.from({ length: 60 }, (_, index) => ({
      Pokemon: `Threat ${index + 1}`,
    }));

    getTopPokemonMock.mockReturnValue(rankedThreats);
    winsMatchupMock.mockReturnValue(false);

    const analysis = buildThreatAnalysis(['lanturn', 'dewgong', 'annihilape']);

    expect(getTopPokemonMock).toHaveBeenCalledWith('overall', 50);
    expect(analysis.evaluatedCount).toBe(50);
    expect(analysis.entries).toHaveLength(50);
    expect(analysis.entries[49].pokemon).toBe('Threat 50');
  });

  it('includes team answer count and severity tier per threat', () => {
    getTopPokemonMock.mockReturnValue([{ Pokemon: 'Threat 1' }]);

    winsMatchupMock.mockImplementation((pokemon: string) => {
      return pokemon !== 'ANNIHILAPE';
    });

    const analysis = buildThreatAnalysis(['lanturn', 'dewgong', 'annihilape']);

    expect(analysis.entries[0]).toMatchObject({
      pokemon: 'Threat 1',
      rank: 1,
      teamAnswers: 2,
      severityTier: 'high',
    });
  });
});

describe('calculateThreatSeverity', () => {
  it('increases severity for higher-ranked threats', () => {
    const topThreatSeverity = calculateThreatSeverity(5, 2);
    const lowerThreatSeverity = calculateThreatSeverity(45, 2);

    expect(topThreatSeverity).toBe('high');
    expect(lowerThreatSeverity).toBe('medium');
  });

  it('reduces severity tier for threats ranked above 100', () => {
    const severity = calculateThreatSeverity(110, 1);

    expect(severity).toBe('medium');
  });
});
