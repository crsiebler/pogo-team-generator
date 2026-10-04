import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  assertBattleFormatAvailable,
  getBattleFormatById,
  getSelectableBattleFormats,
} from './battleFormats';
import pokemonData from '@/data/pokemon.json';
import retainedPointRules from '@/tests/fixtures/battleFrontierMasterPointRules.json';

type BattleFrontierMasterCup = {
  tierRules?: {
    tiers: Array<{
      points: number;
      pokemon: string[];
    }>;
  };
};

function readBattleFrontierMasterPointsCsv(): string {
  return fs.readFileSync(
    path.join(process.cwd(), 'data', 'battle-frontier-master-points.csv'),
    'utf8',
  );
}

function parsePointsCsv(csvText: string): Array<{
  speciesId: string;
  points: number;
}> {
  return csvText
    .trim()
    .split(/\r?\n/)
    .slice(1)
    .map((line) => {
      const [speciesId, points] = line.split(',');

      return {
        speciesId,
        points: Number(points),
      };
    });
}

describe('Battle Frontier Master points CSV', () => {
  it('allows a cycle without tiers and keeps archived points out of runtime rules', () => {
    const csvText = readBattleFrontierMasterPointsCsv();
    const rows = parsePointsCsv(csvText);
    const canonicalSpeciesIds = new Set(
      pokemonData.map((pokemon) => pokemon.speciesId),
    );
    const currentCycleCup = JSON.parse(
      fs.readFileSync(
        path.join(
          process.cwd(),
          'vendor',
          'pvpoke',
          'src',
          'data',
          'gamemaster',
          'cups',
          'battlefrontiermaster.json',
        ),
        'utf8',
      ),
    ) as BattleFrontierMasterCup;

    expect(csvText.split(/\r?\n/)[0]).toBe('speciesId,points');
    expect(rows).not.toHaveLength(0);
    expect(new Set(rows.map((row) => row.speciesId)).size).toBe(rows.length);

    for (const row of rows) {
      expect(canonicalSpeciesIds.has(row.speciesId)).toBe(true);
      expect(Number.isInteger(row.points)).toBe(true);
      expect(row.points).toBeGreaterThan(0);
    }

    if (!currentCycleCup.tierRules) {
      expect(
        getBattleFormatById('battle-frontier-master')?.unavailableReason,
      ).toBeUndefined();
      expect(() =>
        assertBattleFormatAvailable('battle-frontier-master'),
      ).not.toThrow();
      expect(getSelectableBattleFormats().map(({ id }) => id)).toContain(
        'battle-frontier-master',
      );
      return;
    }

    const expectedRows = currentCycleCup.tierRules.tiers.flatMap((tier) =>
      tier.pokemon.map((speciesId) => ({
        speciesId,
        points: tier.points,
      })),
    );

    expect(rows).toEqual(expectedRows);
  });

  it('retains the archived point table for historical rule regression tests only', () => {
    const expectedRows = retainedPointRules.tierRules.tiers.flatMap((tier) =>
      tier.pokemon.map((speciesId) => ({ speciesId, points: tier.points })),
    );
    expect(parsePointsCsv(readBattleFrontierMasterPointsCsv())).toEqual(
      expectedRows,
    );
  });
});
