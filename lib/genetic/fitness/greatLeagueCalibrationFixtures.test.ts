import { describe, expect, test } from 'vitest';
import { createDefaultLineupScoringContext } from './lineupScoring';
import { scorePlayPokemonRoster } from './rosterScoring';
import { getGreatLeagueShowSixPickThreeCalibrationFixtures } from '@/lib/data/calibrationFixtures';
import type { LineupAwareFitnessConfig } from '@/lib/types';

const fullDiagnosticsConfig: LineupAwareFitnessConfig = {
  mode: 'full',
  includeDiagnostics: true,
  recommendationLimit: 5,
};

describe('Great League calibration fixture scoring', () => {
  test('scores calibration rosters with broad regression invariants', () => {
    const context = createDefaultLineupScoringContext('great-league', 30);
    const fixtures = getGreatLeagueShowSixPickThreeCalibrationFixtures();

    for (const fixture of fixtures) {
      const result = scorePlayPokemonRoster(
        fixture.roster,
        context,
        fullDiagnosticsConfig,
      );

      expect(result.evaluatedLineupCount).toBe(120);
      expect(Number.isFinite(result.fitness)).toBe(true);
      expect(result.fitness).toBeGreaterThanOrEqual(0);
      expect(result.fitness).toBeLessThanOrEqual(1);
      expect(result.metrics.viableLineupCount).toBeGreaterThanOrEqual(
        fixture.minimums.viableLineupCount,
      );
      expect(result.metrics.topLineupQuality).toBeGreaterThanOrEqual(
        fixture.minimums.topLineupQuality,
      );
      expect(result.lineupScores).toHaveLength(5);
    }
  });
});
