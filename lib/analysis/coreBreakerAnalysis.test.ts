import { describe, expect, it } from 'vitest';
import { buildCoreBreakerAnalysis } from '@/lib/analysis/coreBreakerAnalysis';

describe('buildCoreBreakerAnalysis', () => {
  it('classifies team size 3 core breakers when answers are 1 or less', () => {
    const analysis = buildCoreBreakerAnalysis(3, [
      {
        pokemon: 'Threat Rank 4',
        rank: 4,
        teamAnswers: 1,
        severityTier: 'high',
      },
      {
        pokemon: 'Threat Rank 2',
        rank: 2,
        teamAnswers: 0,
        severityTier: 'critical',
      },
      {
        pokemon: 'Threat Rank 1',
        rank: 1,
        teamAnswers: 2,
        severityTier: 'medium',
      },
    ]);

    expect(analysis.threshold).toBe(1);
    expect(analysis.entries).toEqual([
      {
        pokemon: 'Threat Rank 2',
        rank: 2,
        teamAnswers: 0,
        severityTier: 'high',
      },
      {
        pokemon: 'Threat Rank 4',
        rank: 4,
        teamAnswers: 1,
        severityTier: 'medium',
      },
    ]);
  });

  it('classifies team size 6 core breakers when answers are 2 or less', () => {
    const analysis = buildCoreBreakerAnalysis(6, [
      {
        pokemon: 'Threat Rank 9',
        rank: 9,
        teamAnswers: 3,
        severityTier: 'low',
      },
      {
        pokemon: 'Threat Rank 12',
        rank: 12,
        teamAnswers: 2,
        severityTier: 'medium',
      },
      {
        pokemon: 'Threat Rank 10',
        rank: 10,
        teamAnswers: 1,
        severityTier: 'critical',
      },
      {
        pokemon: 'Threat Rank 15',
        rank: 15,
        teamAnswers: 0,
        severityTier: 'critical',
      },
    ]);

    expect(analysis.threshold).toBe(2);
    expect(analysis.entries).toEqual([
      {
        pokemon: 'Threat Rank 10',
        rank: 10,
        teamAnswers: 1,
        severityTier: 'high',
      },
      {
        pokemon: 'Threat Rank 12',
        rank: 12,
        teamAnswers: 2,
        severityTier: 'medium',
      },
      {
        pokemon: 'Threat Rank 15',
        rank: 15,
        teamAnswers: 0,
        severityTier: 'high',
      },
    ]);
  });
});
