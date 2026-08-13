import { describe, expect, it } from 'vitest';
import {
  buildThreatAnalysis,
  calculateThreatSeverity,
} from '@/lib/analysis/threatAnalysis';
import type { OptimizerThreatScore } from '@/lib/types';

describe('buildThreatAnalysis', () => {
  it('derives ranked threat analysis from assignment-aware score diagnostics', () => {
    const analysis = buildThreatAnalysis(createThreatScore());

    expect(analysis.evaluatedCount).toBe(3);
    expect(analysis.entries).toHaveLength(3);
    expect(analysis.entries).toEqual([
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
        severityTier: 'critical',
      },
      {
        speciesId: 'threat-3',
        pokemon: 'Threat 3',
        rank: 3,
        teamAnswers: 0,
        severityTier: 'critical',
      },
    ]);
  });

  it('uses only evaluated score entries and preserves their answer counts', () => {
    const score = createThreatScore();
    score.overallTeamThreats = score.overallTeamThreats.slice(0, 1);

    const analysis = buildThreatAnalysis(score);

    expect(analysis).toEqual({
      evaluatedCount: 1,
      entries: [
        expect.objectContaining({
          speciesId: 'threat-2',
          teamAnswers: 1,
        }),
      ],
    });
  });
});

function createThreatScore(): OptimizerThreatScore {
  return {
    score: 0.5,
    evaluatedCount: 3,
    topMetaThreats: [],
    overallTeamThreats: [
      {
        speciesId: 'threat-2',
        pokemon: 'Threat 2',
        rank: 2,
        teamAnswers: 1,
        threatValue: 0.9,
        severityTier: 'critical',
      },
      {
        speciesId: 'threat-3',
        pokemon: 'Threat 3',
        rank: 3,
        teamAnswers: 0,
        threatValue: 0.8,
        severityTier: 'critical',
      },
      {
        speciesId: 'threat-1',
        pokemon: 'Threat 1',
        rank: 1,
        teamAnswers: 2,
        threatValue: 0.2,
        severityTier: 'low',
      },
    ],
    pools: {
      topMeta: { score: 0.5, evaluatedCount: 2, weight: 0.7 },
      fullMeta: { score: 0.5, evaluatedCount: 3, weight: 0.3 },
    },
  };
}

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
