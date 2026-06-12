import { describe, expect, test } from 'vitest';
import {
  CalibrationFixtureValidationError,
  getGreatLeagueShowSixPickThreeCalibrationFixtures,
  validateCalibrationFixtures,
  type RawCalibrationFixture,
} from './calibrationFixtures';
import { getRankedSpeciesIds } from './rankings';
import { enumeratePlayPokemonLineups } from '@/lib/genetic/fitness/lineupEnumeration';

describe('Great League Show-6 Pick-3 calibration fixtures', () => {
  test('loads documented Great League calibration rosters', () => {
    const fixtures = getGreatLeagueShowSixPickThreeCalibrationFixtures();

    expect(fixtures.length).toBeGreaterThanOrEqual(3);

    for (const fixture of fixtures) {
      expect(fixture.id).toMatch(/^great-league-.+/);
      expect(fixture.formatId).toBe('great-league');
      expect(fixture.season).toMatch(/\d{4}|Season/i);
      expect(fixture.context).toMatch(/Show-6 Pick-3/i);
      expect(fixture.sourceLabel).toContain('calibration');
      expect(fixture.notes).toMatch(/calibration data only/i);
      expect(fixture.roster).toHaveLength(6);
      expect(new Set(fixture.roster).size).toBe(6);
      expect(fixture.minimums.viableLineupCount).toBeGreaterThanOrEqual(1);
      expect(fixture.minimums.topLineupQuality).toBeGreaterThan(0);
      expect(enumeratePlayPokemonLineups(fixture.roster)).toHaveLength(120);
    }
  });

  test('rejects invalid fixture data with validation errors', () => {
    const duplicateRosterFixture: RawCalibrationFixture = {
      id: 'great-league-invalid-duplicate',
      formatId: 'great-league',
      season: '2026 calibration season',
      context: 'Great League Show-6 Pick-3 calibration fixture',
      sourceLabel: 'invalid calibration sample',
      notes: 'Calibration data only.',
      roster: [
        'clodsire',
        'clodsire',
        'azumarill',
        'dunsparce',
        'jumpluff',
        'talonflame',
      ],
      minimums: {
        viableLineupCount: 1,
        topLineupQuality: 0.1,
      },
    };

    expect(() => validateCalibrationFixtures([duplicateRosterFixture])).toThrow(
      CalibrationFixtureValidationError,
    );
  });

  test('rejects malformed raw fixture data with validation errors', () => {
    expect(() => validateCalibrationFixtures({})).toThrow(
      CalibrationFixtureValidationError,
    );
    expect(() =>
      validateCalibrationFixtures([
        {
          id: 'great-league-invalid-minimums',
          formatId: 'great-league',
          season: '2026 calibration season',
          context: 'Great League Show-6 Pick-3 calibration fixture',
          sourceLabel: 'invalid calibration sample',
          notes: 'Calibration data only.',
          roster: [
            'clodsire',
            'azumarill',
            'dunsparce',
            'jumpluff',
            'gastrodon',
            'talonflame',
          ],
          minimums: {
            viableLineupCount: '1',
            topLineupQuality: 0.1,
          },
        },
      ]),
    ).toThrow(CalibrationFixtureValidationError);
  });

  test('rejects untraceable fixture metadata', () => {
    const invalidMetadataFixture: RawCalibrationFixture = {
      id: 'great-league-invalid-source',
      formatId: 'great-league',
      season: '2026 calibration season',
      context: 'Great League Show-6 Pick-3 calibration fixture',
      sourceLabel: ' ',
      notes: 'Calibration data only.',
      roster: [
        'clodsire',
        'azumarill',
        'dunsparce',
        'jumpluff',
        'gastrodon',
        'talonflame',
      ],
      minimums: {
        viableLineupCount: 10,
        topLineupQuality: 0.45,
      },
    };

    expect(() => validateCalibrationFixtures([invalidMetadataFixture])).toThrow(
      CalibrationFixtureValidationError,
    );
  });

  test('rejects impossible fixture minimums', () => {
    const impossibleLineupCountFixture: RawCalibrationFixture = {
      id: 'great-league-invalid-lineup-count-minimum',
      formatId: 'great-league',
      season: '2026 calibration season',
      context: 'Great League Show-6 Pick-3 calibration fixture',
      sourceLabel: 'invalid calibration sample',
      notes: 'Calibration data only.',
      roster: [
        'clodsire',
        'azumarill',
        'dunsparce',
        'jumpluff',
        'gastrodon',
        'talonflame',
      ],
      minimums: {
        viableLineupCount: 121,
        topLineupQuality: 1,
      },
    };
    const impossibleTopQualityFixture: RawCalibrationFixture = {
      ...impossibleLineupCountFixture,
      id: 'great-league-invalid-top-quality-minimum',
      minimums: {
        viableLineupCount: 120,
        topLineupQuality: 1.01,
      },
    };

    expect(() =>
      validateCalibrationFixtures([impossibleLineupCountFixture]),
    ).toThrow(CalibrationFixtureValidationError);
    expect(() =>
      validateCalibrationFixtures([impossibleTopQualityFixture]),
    ).toThrow(CalibrationFixtureValidationError);
  });

  test('rejects known species that are unranked for Great League', () => {
    expect(getRankedSpeciesIds('great-league')).not.toContain('smeargle');

    const unrankedSpeciesFixture: RawCalibrationFixture = {
      id: 'great-league-invalid-unranked-species',
      formatId: 'great-league',
      season: '2026 calibration season',
      context: 'Great League Show-6 Pick-3 calibration fixture',
      sourceLabel: 'invalid calibration sample',
      notes: 'Calibration data only.',
      roster: [
        'smeargle',
        'azumarill',
        'dunsparce',
        'jumpluff',
        'gastrodon',
        'talonflame',
      ],
      minimums: {
        viableLineupCount: 10,
        topLineupQuality: 0.45,
      },
    };

    expect(() => validateCalibrationFixtures([unrankedSpeciesFixture])).toThrow(
      CalibrationFixtureValidationError,
    );
  });
});
