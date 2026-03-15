import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildThreatAnalysis,
  calculateThreatSeverity,
} from '@/lib/analysis/threatAnalysis';

const getTopPokemonMock = vi.fn();
const getRoleBasedThreatSpeciesIdsMock = vi.fn();
const speciesIdToRankingNameMock = vi.fn();
const speciesIdToSpeciesNameMock = vi.fn();
const winsMatchupMock = vi.fn();

vi.mock('@/lib/data/rankings', () => ({
  getTopPokemon: (...args: unknown[]) => getTopPokemonMock(...args),
  getRoleBasedThreatSpeciesIds: (...args: unknown[]) =>
    getRoleBasedThreatSpeciesIdsMock(...args),
  speciesIdToRankingName: (speciesId: string) =>
    speciesIdToRankingNameMock(speciesId),
  speciesIdToSpeciesName: (speciesId: string) =>
    speciesIdToSpeciesNameMock(speciesId),
}));

vi.mock('@/lib/data/simulations', () => ({
  winsMatchup: (pokemon: string, opponent: string, formatId?: string) =>
    winsMatchupMock(pokemon, opponent, formatId),
}));

describe('buildThreatAnalysis', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    speciesIdToRankingNameMock.mockImplementation((speciesId: string) =>
      speciesId.toUpperCase(),
    );
    speciesIdToSpeciesNameMock.mockImplementation((speciesId: string) =>
      speciesId.toUpperCase(),
    );
  });

  it('evaluates the role-based GA threat pool for the selected format', () => {
    getRoleBasedThreatSpeciesIdsMock.mockReturnValue([
      'threat-1',
      'threat-2',
      'threat-3',
    ]);
    winsMatchupMock.mockReturnValue(false);

    const analysis = buildThreatAnalysis(
      ['lanturn', 'dewgong', 'annihilape'],
      'great-league',
    );

    expect(getRoleBasedThreatSpeciesIdsMock).toHaveBeenCalledWith(
      100,
      'great-league',
    );
    expect(analysis.evaluatedCount).toBe(3);
    expect(analysis.entries).toHaveLength(3);
    expect(analysis.entries[0]).toMatchObject({
      speciesId: 'threat-1',
      pokemon: 'THREAT-1',
    });
  });

  it('includes team answer count and severity tier per threat', () => {
    getRoleBasedThreatSpeciesIdsMock.mockReturnValue(['threat-1']);

    winsMatchupMock.mockImplementation((pokemon: string) => {
      return pokemon !== 'annihilape';
    });

    const analysis = buildThreatAnalysis(
      ['lanturn', 'dewgong', 'annihilape'],
      'great-league',
    );

    expect(analysis.entries[0]).toMatchObject({
      speciesId: 'threat-1',
      pokemon: 'THREAT-1',
      rank: 1,
      teamAnswers: 2,
      severityTier: 'high',
    });
    expect(winsMatchupMock).toHaveBeenCalledWith(
      'lanturn',
      'threat-1',
      'great-league',
    );
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
