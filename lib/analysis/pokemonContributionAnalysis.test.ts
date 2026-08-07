import { beforeEach, describe, expect, it, vi } from 'vitest';
import {
  buildPokemonContributionAnalysis,
  getFragilityRiskTier,
} from '@/lib/analysis/pokemonContributionAnalysis';
import type {
  MovesetAssignmentPolicyIdentity,
  RosterMovesetAssignment,
  ThreatAnalysisEntry,
} from '@/lib/types';

const getMatchupResultMock = vi.fn();

vi.mock('@/lib/data/simulations', () => ({
  getMatchupResult: (...args: unknown[]) => getMatchupResultMock(...args),
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
    getMatchupResultMock.mockImplementation(
      (speciesId: string, opponentSpeciesId: string, formatId?: string) => {
        expect(formatId).toBe('great-league');

        return (speciesId === 'lanturn' && opponentSpeciesId === 'azumarill') ||
          (speciesId === 'lanturn' && opponentSpeciesId === 'feraligatr') ||
          (speciesId === 'dewgong' && opponentSpeciesId === 'gastrodon')
          ? 600
          : 400;
      },
    );

    const analysis = buildPokemonContributionAnalysis(
      ['lanturn', 'dewgong'],
      threats,
      'great-league',
    );

    expect(analysis.entries).toEqual([
      {
        pokemon: 'Lanturn',
        speciesId: 'lanturn',
        threatsHandled: 2,
        coverageAdded: 2,
        highSeverityRelief: 2,
        fragilityRiskTier: 'low',
      },
      {
        pokemon: 'Dewgong',
        speciesId: 'dewgong',
        threatsHandled: 1,
        coverageAdded: 0,
        highSeverityRelief: 0,
        fragilityRiskTier: 'low',
      },
    ]);
    expect(analysis.entries[0]).not.toHaveProperty('rationale');
  });

  it('computes each threat matchup once per Pokemon', () => {
    getMatchupResultMock.mockImplementation(
      (speciesId: string, opponentSpeciesId: string) => {
        return (speciesId === 'lanturn' && opponentSpeciesId === 'azumarill') ||
          (speciesId === 'lanturn' && opponentSpeciesId === 'feraligatr') ||
          (speciesId === 'dewgong' && opponentSpeciesId === 'gastrodon')
          ? 600
          : 400;
      },
    );

    buildPokemonContributionAnalysis(
      ['lanturn', 'dewgong'],
      threats,
      'great-league',
    );

    expect(getMatchupResultMock).toHaveBeenCalledTimes(6);
  });

  it('uses the fixed assigned variant for every contribution matchup', () => {
    const assignment = createAssignment(['lanturn', 'dewgong']);
    getMatchupResultMock.mockImplementation(
      (
        speciesId: string,
        _opponentSpeciesId: string,
        _formatId: string,
        movesetVariantId?: string,
      ) =>
        movesetVariantId === assignment.variantsBySpeciesId[speciesId]?.id
          ? 600
          : 400,
    );

    const analysis = buildPokemonContributionAnalysis(
      ['lanturn', 'dewgong'],
      threats,
      'great-league',
      assignment,
    );
    const reads = getMatchupResultMock.mock.calls;

    expect(reads).toHaveLength(6);
    expect(
      reads.every(
        ([speciesId, , , variantId]) =>
          variantId === assignment.variantsBySpeciesId[speciesId]?.id,
      ),
    ).toBe(true);
    expect(analysis.entries.map((entry) => entry.threatsHandled)).toEqual([
      3, 3,
    ]);
  });

  it('keeps ranked-default contribution lookups unqualified', () => {
    const assignment = createAssignment(
      ['lanturn', 'dewgong'],
      'ranked-default-fallback',
    );
    getMatchupResultMock.mockReturnValue(550);

    buildPokemonContributionAnalysis(
      ['lanturn', 'dewgong'],
      threats,
      'great-league',
      assignment,
    );
    const variantIds = getMatchupResultMock.mock.calls.map(
      ([, , , variantId]) => variantId,
    );

    expect(variantIds).not.toHaveLength(0);
    expect(variantIds.every((variantId) => variantId === undefined)).toBe(true);
  });
});

function createAssignment(
  speciesIds: readonly string[],
  source: MovesetAssignmentPolicyIdentity['source'] = 'manifest',
): RosterMovesetAssignment {
  return {
    formatId: 'great-league',
    authorityBySpeciesId: Object.fromEntries(
      speciesIds.map((speciesId) => [
        speciesId,
        { source, schemaVersion: 1, policyVersion: 'ranking-evidence-v1' },
      ]),
    ),
    fingerprint: 'analysis-assignment',
    variantsBySpeciesId: Object.fromEntries(
      speciesIds.map((speciesId) => [
        speciesId,
        {
          id: `${speciesId}_fast--${speciesId}_charged_b--${speciesId}_charged_a`,
          fastMove: `${speciesId}_FAST`,
          chargedMove1: `${speciesId}_CHARGED_A`,
          chargedMove2: `${speciesId}_CHARGED_B`,
          isDefault: false,
        },
      ]),
    ),
  };
}

describe('getFragilityRiskTier', () => {
  it('classifies fragility tiers by coverage-added thresholds', () => {
    expect(getFragilityRiskTier(6)).toBe('high');
    expect(getFragilityRiskTier(3)).toBe('moderate');
    expect(getFragilityRiskTier(1)).toBe('low');
  });
});
