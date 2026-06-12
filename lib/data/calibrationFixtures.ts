import rawGreatLeagueCalibrationFixtures from '@/data/calibration/great-league-show6-pick3.json';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import { isBattleFormatId } from '@/lib/data/battleFormats';
import { getPokemonBySpeciesId } from '@/lib/data/pokemon';
import { getRankedSpeciesIds } from '@/lib/data/rankings';
import { enumeratePlayPokemonLineups } from '@/lib/genetic/fitness/lineupEnumeration';

const PLAY_POKEMON_ORDERED_LINEUP_COUNT = 120;

/** Minimum broad optimizer invariants used by calibration fixture tests. */
export interface CalibrationFixtureMinimums {
  viableLineupCount: number;
  topLineupQuality: number;
}

/** Raw calibration fixture data shape before validation. */
export interface RawCalibrationFixture {
  id: string;
  formatId: string;
  season: string;
  context: string;
  sourceLabel: string;
  notes: string;
  roster: string[];
  minimums: CalibrationFixtureMinimums;
}

/** Validated season/context calibration fixture for broad optimizer regressions. */
export interface CalibrationFixture {
  id: string;
  formatId: BattleFormatId;
  season: string;
  context: string;
  sourceLabel: string;
  notes: string;
  roster: string[];
  minimums: CalibrationFixtureMinimums;
}

/** Validation failure for malformed calibration fixture data. */
export class CalibrationFixtureValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'CalibrationFixtureValidationError';
  }
}

/** Returns validated Great League Show-6 Pick-3 calibration fixtures. */
export function getGreatLeagueShowSixPickThreeCalibrationFixtures(): CalibrationFixture[] {
  return validateCalibrationFixtures(rawGreatLeagueCalibrationFixtures);
}

/** Validates calibration fixture data for metadata, species, and roster shape. */
export function validateCalibrationFixtures(
  fixtures: unknown,
): CalibrationFixture[] {
  if (!Array.isArray(fixtures)) {
    throw new CalibrationFixtureValidationError(
      'Calibration fixtures must be an array.',
    );
  }

  const fixtureIds = new Set<string>();

  return fixtures.map((entry, index) => {
    const fixture = parseRawCalibrationFixture(entry, index);

    validateFixtureMetadata(fixture, fixtureIds);
    validateFixtureRoster(fixture);

    return {
      ...fixture,
      formatId: fixture.formatId,
      roster: [...fixture.roster],
      minimums: { ...fixture.minimums },
    };
  });
}

function parseRawCalibrationFixture(
  entry: unknown,
  index: number,
): RawCalibrationFixture {
  if (!isRecord(entry)) {
    throw new CalibrationFixtureValidationError(
      `Calibration fixture ${index} must be an object.`,
    );
  }

  return {
    id: readStringField(entry, 'id', index),
    formatId: readStringField(entry, 'formatId', index),
    season: readStringField(entry, 'season', index),
    context: readStringField(entry, 'context', index),
    sourceLabel: readStringField(entry, 'sourceLabel', index),
    notes: readStringField(entry, 'notes', index),
    roster: readRosterField(entry, index),
    minimums: readMinimumsField(entry, index),
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readStringField(
  entry: Record<string, unknown>,
  fieldName: keyof Omit<RawCalibrationFixture, 'roster' | 'minimums'>,
  index: number,
): string {
  const value = entry[fieldName];

  if (typeof value !== 'string') {
    throw new CalibrationFixtureValidationError(
      `Calibration fixture ${index} field ${fieldName} must be a string.`,
    );
  }

  return value;
}

function readRosterField(
  entry: Record<string, unknown>,
  index: number,
): string[] {
  const value = entry.roster;

  if (
    !Array.isArray(value) ||
    value.some((speciesId) => typeof speciesId !== 'string')
  ) {
    throw new CalibrationFixtureValidationError(
      `Calibration fixture ${index} roster must be an array of species ids.`,
    );
  }

  return [...value];
}

function readMinimumsField(
  entry: Record<string, unknown>,
  index: number,
): CalibrationFixtureMinimums {
  const value = entry.minimums;

  if (!isRecord(value)) {
    throw new CalibrationFixtureValidationError(
      `Calibration fixture ${index} minimums must be an object.`,
    );
  }

  const viableLineupCount = value.viableLineupCount;
  const topLineupQuality = value.topLineupQuality;

  if (
    typeof viableLineupCount !== 'number' ||
    !Number.isFinite(viableLineupCount) ||
    !Number.isInteger(viableLineupCount)
  ) {
    throw new CalibrationFixtureValidationError(
      `Calibration fixture ${index} minimum viable lineup count must be a finite integer.`,
    );
  }

  if (
    typeof topLineupQuality !== 'number' ||
    !Number.isFinite(topLineupQuality)
  ) {
    throw new CalibrationFixtureValidationError(
      `Calibration fixture ${index} minimum top lineup quality must be a finite number.`,
    );
  }

  return {
    viableLineupCount,
    topLineupQuality,
  };
}

function validateFixtureMetadata(
  fixture: RawCalibrationFixture,
  fixtureIds: Set<string>,
): asserts fixture is RawCalibrationFixture & { formatId: BattleFormatId } {
  if (fixtureIds.has(fixture.id)) {
    throw new CalibrationFixtureValidationError(
      `Duplicate calibration fixture id: ${fixture.id}`,
    );
  }

  fixtureIds.add(fixture.id);

  if (!fixture.id.trim() || !fixture.sourceLabel.trim()) {
    throw new CalibrationFixtureValidationError(
      `Calibration fixture requires id and source label metadata: ${fixture.id}`,
    );
  }

  if (!isBattleFormatId(fixture.formatId)) {
    throw new CalibrationFixtureValidationError(
      `Unsupported calibration fixture format id: ${fixture.formatId}`,
    );
  }

  if (fixture.formatId !== 'great-league') {
    throw new CalibrationFixtureValidationError(
      `Great League calibration fixtures must use great-league format: ${fixture.id}`,
    );
  }

  if (!fixture.season.trim() || !fixture.context.trim()) {
    throw new CalibrationFixtureValidationError(
      `Calibration fixture requires season and context metadata: ${fixture.id}`,
    );
  }

  if (!/calibration data only/i.test(fixture.notes)) {
    throw new CalibrationFixtureValidationError(
      `Calibration fixture notes must state calibration-only usage: ${fixture.id}`,
    );
  }

  if (
    fixture.minimums.viableLineupCount < 1 ||
    fixture.minimums.viableLineupCount > PLAY_POKEMON_ORDERED_LINEUP_COUNT ||
    fixture.minimums.topLineupQuality <= 0 ||
    fixture.minimums.topLineupQuality > 1
  ) {
    throw new CalibrationFixtureValidationError(
      `Calibration fixture minimums must be broad positive invariants: ${fixture.id}`,
    );
  }
}

function validateFixtureRoster(
  fixture: RawCalibrationFixture & { formatId: BattleFormatId },
): void {
  try {
    enumeratePlayPokemonLineups(fixture.roster);
  } catch (error) {
    throw new CalibrationFixtureValidationError(
      `Invalid calibration fixture roster for ${fixture.id}: ${
        error instanceof Error ? error.message : 'unknown roster error'
      }`,
    );
  }

  const rankedSpeciesIds = getRankedSpeciesIds(fixture.formatId);

  for (const speciesId of fixture.roster) {
    if (!getPokemonBySpeciesId(speciesId)) {
      throw new CalibrationFixtureValidationError(
        `Unknown calibration fixture species id ${speciesId} in ${fixture.id}`,
      );
    }

    if (!rankedSpeciesIds.has(speciesId)) {
      throw new CalibrationFixtureValidationError(
        `Unranked calibration fixture species id ${speciesId} for ${fixture.formatId} in ${fixture.id}`,
      );
    }
  }
}
