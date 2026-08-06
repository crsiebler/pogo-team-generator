import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { getBattleFormats } from './battleFormats';
import {
  ensureSimulationDataAvailable,
  getMatchupMatrix,
  getMovesetVariantShieldScenarioMatchupResult,
  getShieldScenarioMatchupResult,
  getTopThreatsByRole,
  parseSimulationFilename,
} from './simulations';

describe('format-aware simulation loading', () => {
  it('parses moveset-specific simulation filenames separately from species ids', () => {
    expect(
      parseSimulationFilename(
        'golisopod--shadow_claw--x_scissor--aqua_jet_1-1.csv',
      ),
    ).toEqual({
      speciesId: 'golisopod',
      movesetVariantId: 'shadow_claw--x_scissor--aqua_jet',
      shieldCount: 1,
    });
  });

  it('supports default and explicit Great League lookups', () => {
    const defaultMatrix = getMatchupMatrix();
    const explicitMatrix = getMatchupMatrix('great-league');

    expect(defaultMatrix).toBe(explicitMatrix);

    const defaultThreats = getTopThreatsByRole(25);
    const explicitThreats = getTopThreatsByRole(25, 'great-league');

    expect(defaultThreats).toEqual(explicitThreats);
  });

  it('ensures simulation data exists for all supported battle formats', () => {
    for (const format of getBattleFormats()) {
      expect(() => ensureSimulationDataAvailable(format.id)).not.toThrow();
    }
  }, 15000);

  it('keeps Great League cache stable after loading other formats', () => {
    const beforeFailure = getMatchupMatrix();
    ensureSimulationDataAvailable('master-league');

    const afterFailure = getMatchupMatrix();
    expect(afterFailure).toBe(beforeFailure);
  });

  it('returns the requested shield scenario battle rating', () => {
    expect(
      getShieldScenarioMatchupResult('abomasnow', 'absol', 0, 'ultra-league'),
    ).toBe(461);
    expect(
      getShieldScenarioMatchupResult('abomasnow', 'absol', 1, 'ultra-league'),
    ).toBe(461);
    expect(
      getShieldScenarioMatchupResult('abomasnow', 'absol', 2, 'ultra-league'),
    ).toBe(352);
  });

  it('requires a manifest for variants without replacing default matrices', () => {
    expect(() =>
      getMovesetVariantShieldScenarioMatchupResult(
        'golisopod',
        'shadow_claw--x_scissor--aqua_jet',
        'mewtwo',
        1,
        'battle-frontier-coupe-du-sillage',
      ),
    ).toThrowError(
      expect.objectContaining({
        name: 'MovesetVariantSimulationDataError',
        code: 'manifest-missing',
      }),
    );
    expect(
      getShieldScenarioMatchupResult(
        'golisopod',
        'mewtwo',
        1,
        'battle-frontier-coupe-du-sillage',
      ),
    ).toBe(564);
  });

  it('keeps generated Golisopod variants complete across applicable formats', () => {
    const scenarios = ['0-0', '1-1', '2-2'] as const;
    const simulationRoot = path.join(process.cwd(), 'data', 'simulations');
    const applicableFormats = getBattleFormats().filter((format) =>
      scenarios.every((scenario) =>
        existsSync(
          path.join(
            simulationRoot,
            `cp${format.cp}`,
            format.cup,
            `golisopod_${scenario}.csv`,
          ),
        ),
      ),
    );

    expect(applicableFormats).not.toHaveLength(0);

    for (const format of applicableFormats) {
      const opponentLists = scenarios.map((scenario) => {
        const variantPath = path.join(
          simulationRoot,
          `cp${format.cp}`,
          format.cup,
          `golisopod--shadow_claw--x_scissor--aqua_jet_${scenario}.csv`,
        );

        expect(existsSync(variantPath), variantPath).toBe(true);

        const records = parse(readFileSync(variantPath, 'utf8'), {
          columns: true,
          skip_empty_lines: true,
        }) as Array<{ Pokemon: string }>;
        return records.map((record) => record.Pokemon);
      });

      expect(opponentLists[1]).toEqual(opponentLists[0]);
      expect(opponentLists[2]).toEqual(opponentLists[0]);
    }
  });

  it('returns null when shield scenario matchup data is missing', () => {
    expect(
      getShieldScenarioMatchupResult('missing-species', 'abomasnow', 1),
    ).toBeNull();
    expect(
      getShieldScenarioMatchupResult('abomasnow', 'missing-opponent', 1),
    ).toBeNull();
  });
});
