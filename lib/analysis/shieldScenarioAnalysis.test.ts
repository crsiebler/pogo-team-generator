import { beforeEach, describe, expect, it, vi } from 'vitest';
import { buildShieldScenarioAnalysis } from '@/lib/analysis/shieldScenarioAnalysis';
import type {
  MovesetAssignmentPolicyIdentity,
  RosterMovesetAssignment,
  ThreatAnalysisEntry,
} from '@/lib/types';

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
    movesetVariantId?: string,
  ) =>
    getShieldScenarioMatchupResultMock(
      pokemon,
      opponent,
      shields,
      formatId,
      movesetVariantId,
    ),
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

    buildShieldScenarioAnalysis(
      ['lanturn'],
      threats,
      'battle-frontier-tsuki-cup',
    );

    expect(getShieldScenarioMatchupResultMock).toHaveBeenCalledWith(
      'lanturn',
      'threat-1',
      0,
      'battle-frontier-tsuki-cup',
      undefined,
    );
  });

  it('uses each roster member assigned variant for every shield lookup', () => {
    const assignment = createAssignment(['lanturn', 'dewgong']);
    getShieldScenarioMatchupResultMock.mockImplementation(
      (
        speciesId: string,
        _opponent: string,
        _shields: number,
        _formatId: string,
        movesetVariantId?: string,
      ) =>
        movesetVariantId === assignment.variantsBySpeciesId[speciesId]?.id
          ? 600
          : null,
    );

    const analysis = buildShieldScenarioAnalysis(
      ['lanturn', 'dewgong'],
      threats,
      'great-league',
      assignment,
    );
    const reads = getShieldScenarioMatchupResultMock.mock.calls;

    expect(reads.length).toBeGreaterThan(0);
    expect(
      reads.every(
        ([speciesId, , , , variantId]) =>
          variantId === assignment.variantsBySpeciesId[speciesId]?.id,
      ),
    ).toBe(true);
    expect(analysis['0-0'].coveredThreats).toBe(2);
    expect(analysis['1-1'].coveredThreats).toBe(2);
    expect(analysis['2-2'].coveredThreats).toBe(2);
  });

  it('keeps ranked-default shield lookups unqualified', () => {
    const assignment = createAssignment(
      ['lanturn', 'dewgong'],
      'ranked-default-fallback',
    );
    getShieldScenarioMatchupResultMock.mockReturnValue(550);

    buildShieldScenarioAnalysis(
      ['lanturn', 'dewgong'],
      threats,
      'great-league',
      assignment,
    );
    const variantIds = getShieldScenarioMatchupResultMock.mock.calls.map(
      ([, , , , variantId]) => variantId,
    );

    expect(variantIds).not.toHaveLength(0);
    expect(variantIds.every((variantId) => variantId === undefined)).toBe(true);
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
    expect(getShieldScenarioMatchupResultMock).toHaveBeenCalledTimes(11);
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
