import { describe, expect, it } from 'vitest';
import type {
  BenchUtility,
  LineupAwareFitnessConfig,
  LineupCoverageMetrics,
  LineupPatternLabel,
  LineupResourcePathMetrics,
  OrderedLineup,
  PlayPokemonRosterMetrics,
  RecommendedLineup,
} from './types';

describe('lineup-aware generation types', () => {
  it('models ordered roles, recommendation diagnostics, roster metrics, bench utility, and scoring modes', () => {
    const orderedLineup = {
      lead: 'clodsire',
      switch: 'azumarill',
      closer: 'skarmory',
    } satisfies OrderedLineup;

    const coverageMetrics = {
      coverageRate: 0.72,
      dominatingMatchupCount: 4,
      overwhelmingLossCount: 1,
      singleAnswerThreatCount: 2,
    } satisfies LineupCoverageMetrics;

    const resourcePathMetrics = {
      balanced: { available: true, score: 0.71 },
      shieldSpend: { available: false },
      shieldSave: { available: true, score: 0.65 },
    } satisfies LineupResourcePathMetrics;

    const missingResourcePathScore: LineupResourcePathMetrics = {
      // @ts-expect-error available resource paths must include a score.
      balanced: { available: true },
      shieldSpend: { available: false },
      shieldSave: { available: false },
    };

    const unavailableResourcePathWithScore: LineupResourcePathMetrics = {
      // @ts-expect-error unavailable resource paths must not include a score.
      balanced: { available: false, score: 0.71 },
      shieldSpend: { available: false },
      shieldSave: { available: false },
    };

    const diagnosticLabel = 'ABC' satisfies LineupPatternLabel;

    const recommendedLineup = {
      lineup: orderedLineup,
      score: 0.83,
      coverageMetrics,
      coveredThreats: ['registeel', 'lanturn'],
      weaknesses: ['talonflame'],
      diagnosticLabel,
      resourcePathMetrics,
    } satisfies RecommendedLineup;

    const benchUtility = {
      speciesId: 'azumarill',
      utilityScore: 0.75,
      totalAppearances: 3,
      leadAppearances: 0,
      switchAppearances: 2,
      closerAppearances: 1,
      warnings: ['low-utility'],
    } satisfies BenchUtility;

    const rosterMetrics = {
      viableLineupCount: 12,
      topLineupQuality: 0.83,
      topNLineupDepth: 0.76,
      dominatingMatchupRate: 0.31,
      overwhelmingLossRate: 0.08,
      singleAnswerRisks: ['registeel'],
      viableLeadDiversity: 4,
      benchUtilitySummary: [benchUtility],
    } satisfies PlayPokemonRosterMetrics;

    const fastConfig = {
      mode: 'fast',
      includeDiagnostics: false,
      recommendationLimit: 0,
    } satisfies LineupAwareFitnessConfig;

    const fullConfig = {
      mode: 'full',
      includeDiagnostics: true,
      recommendationLimit: 5,
    } satisfies LineupAwareFitnessConfig;

    // @ts-expect-error fast scoring must not include UI-ready diagnostics.
    const fastConfigWithDiagnostics: LineupAwareFitnessConfig = {
      mode: 'fast',
      includeDiagnostics: true,
      recommendationLimit: 5,
    };

    // @ts-expect-error full scoring must include UI-ready diagnostics.
    const fullConfigWithoutDiagnostics: LineupAwareFitnessConfig = {
      mode: 'full',
      includeDiagnostics: false,
      recommendationLimit: 5,
    };

    expect(recommendedLineup.lineup.lead).toBe('clodsire');
    expect(rosterMetrics.benchUtilitySummary[0].switchAppearances).toBe(2);
    expect(fastConfig.includeDiagnostics).toBe(false);
    expect(fullConfig.recommendationLimit).toBe(5);
    expect(missingResourcePathScore).toBeDefined();
    expect(unavailableResourcePathWithScore).toBeDefined();
    expect(fastConfigWithDiagnostics).toBeDefined();
    expect(fullConfigWithoutDiagnostics).toBeDefined();
  });
});
