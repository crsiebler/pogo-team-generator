import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { parse } from 'csv-parse/sync';
import { getBattleFormats } from './battleFormats';
import { getMovesetAvailability } from './moveAvailability';
import {
  getMovesetVariantManifestPath,
  MOVESET_VARIANT_SCENARIOS,
  parseMovesetVariantManifestJson,
} from './movesetVariantManifest';
import {
  ensureSimulationDataAvailable,
  getActiveMovesetVariants,
  getMatchupMatrix,
  getMatchupResult,
  getMovesetVariantShieldScenarioMatchupResult,
  getShieldScenarioMatchupResult,
  getTopThreatsByRole,
} from './simulations';

describe('format-aware simulation loading', () => {
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

  it('uses manifest-declared active variants without replacing default matrices', () => {
    expect(
      getMovesetVariantShieldScenarioMatchupResult(
        'golisopod',
        'fury_cutter--x_scissor--aqua_jet',
        'mewtwo',
        1,
        'battle-frontier-coupe-du-sillage',
      ),
    ).toBe(564);

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
        code: 'variant-unavailable',
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

  it('validates every checked-in manifest and active variant scenario', () => {
    const representativeSpeciesIds = [
      'golisopod',
      'quagsire',
      'forretress',
      'feraligatr',
      'empoleon',
      'furret',
      'sableye',
      'florges',
      'blastoise',
    ];
    const representativesWithAlternates = new Set<string>();
    let eliteDefaultCount = 0;
    let eventExclusiveMoveCount = 0;

    for (const format of getBattleFormats()) {
      const manifestResourcePath = getMovesetVariantManifestPath(format);
      const manifest = parseMovesetVariantManifestJson(
        readFileSync(path.join(process.cwd(), manifestResourcePath), 'utf8'),
      );

      expect(manifest.metadata.formatId).toBe(format.id);
      const defaultMatrix = getMatchupMatrix(format.id);
      expect(defaultMatrix.size).toBe(manifest.species.length);

      for (const species of manifest.species) {
        expect(species.speciesId).not.toMatch(/^(furret|florges)_shadow$/);

        if (
          representativeSpeciesIds.includes(species.speciesId) &&
          species.candidates.length > 1
        ) {
          representativesWithAlternates.add(species.speciesId);
        }

        for (const candidate of species.candidates) {
          const availability = getMovesetAvailability(
            species.speciesId,
            candidate,
            format.id,
          );
          if (
            Object.values(availability).some(({ kind }) => kind === 'excluded')
          ) {
            throw new Error(
              `${format.id}/${species.speciesId}/${candidate.id} contains an excluded move`,
            );
          }

          if (
            candidate.isDefault &&
            Object.values(availability).some(({ kind }) => kind === 'elite')
          ) {
            eliteDefaultCount += 1;
          }
          eventExclusiveMoveCount += Object.values(availability).filter(
            ({ kind }) => kind === 'eventExclusive',
          ).length;
        }

        const activeCandidates = species.candidates.filter(
          ({ active }) => active,
        );
        const defaultCandidate = activeCandidates.find(
          ({ id }) => id === species.defaultVariantId,
        );
        expect(defaultCandidate).toBeDefined();
        expect(
          getActiveMovesetVariants(species.speciesId, format.id).map(
            ({ id }) => id,
          ),
        ).toEqual(activeCandidates.map(({ id }) => id));

        const loadedDefaultMatchups = defaultMatrix.get(species.speciesId);
        expect(loadedDefaultMatchups).toBeDefined();
        if (!loadedDefaultMatchups || loadedDefaultMatchups.size === 0) {
          throw new Error(
            `${format.id}/${species.speciesId} has no default opponents`,
          );
        }
        for (const [opponentSpeciesId, matchup] of loadedDefaultMatchups) {
          expect(
            getMatchupResult(species.speciesId, opponentSpeciesId, format.id),
          ).toBe(
            getMatchupResult(
              species.speciesId,
              opponentSpeciesId,
              format.id,
              species.defaultVariantId,
            ),
          );
          expect(
            getMovesetVariantShieldScenarioMatchupResult(
              species.speciesId,
              species.defaultVariantId,
              opponentSpeciesId,
              0,
              format.id,
            ),
          ).toBe(matchup.shields0.battleRating);
          expect(
            getMovesetVariantShieldScenarioMatchupResult(
              species.speciesId,
              species.defaultVariantId,
              opponentSpeciesId,
              1,
              format.id,
            ),
          ).toBe(matchup.shields1.battleRating);
          expect(
            getMovesetVariantShieldScenarioMatchupResult(
              species.speciesId,
              species.defaultVariantId,
              opponentSpeciesId,
              2,
              format.id,
            ),
          ).toBe(matchup.shields2.battleRating);
        }

        const defaultOpponents = Object.fromEntries(
          MOVESET_VARIANT_SCENARIOS.map((scenario) => [
            scenario,
            readValidSimulationOpponents(
              manifestResourcePath,
              defaultCandidate!.storageKeys[scenario],
            ),
          ]),
        );

        for (const candidate of activeCandidates) {
          for (const scenario of MOVESET_VARIANT_SCENARIOS) {
            const opponents = readValidSimulationOpponents(
              manifestResourcePath,
              candidate.storageKeys[scenario],
            );
            if (
              opponents.length !== defaultOpponents[scenario].length ||
              opponents.some(
                (opponent, index) =>
                  opponent !== defaultOpponents[scenario][index],
              )
            ) {
              throw new Error(
                `${format.id}/${species.speciesId}/${candidate.id}/${scenario} does not match its default opponent set`,
              );
            }
          }
        }
      }
    }

    expect([...representativesWithAlternates].sort()).toEqual(
      [...representativeSpeciesIds].sort(),
    );
    expect(eliteDefaultCount).toBeGreaterThan(0);
    expect(eventExclusiveMoveCount).toBeGreaterThan(0);
  }, 120000);

  it('returns null when shield scenario matchup data is missing', () => {
    expect(
      getShieldScenarioMatchupResult('missing-species', 'abomasnow', 1),
    ).toBeNull();
    expect(
      getShieldScenarioMatchupResult('abomasnow', 'missing-opponent', 1),
    ).toBeNull();
  });
});

function readValidSimulationOpponents(
  manifestResourcePath: string,
  storageKey: string,
): string[] {
  const simulationPath = path.join(
    process.cwd(),
    path.dirname(manifestResourcePath),
    storageKey,
  );
  const lines = readFileSync(simulationPath, 'utf8')
    .split(/\r?\n/)
    .filter(Boolean);
  if (
    lines.shift() !== 'Pokemon,Battle Rating,Energy Remaining,HP Remaining' ||
    lines.length === 0
  ) {
    throw new Error(`${simulationPath} has an invalid or empty CSV header`);
  }

  const opponents: string[] = [];
  for (const line of lines) {
    const [opponent, battleRating, energyRemaining, hpRemaining, extra] =
      line.split(',');
    if (
      !opponent ||
      extra !== undefined ||
      [battleRating, energyRemaining, hpRemaining].some(
        (value) => !value?.trim() || !Number.isFinite(Number(value)),
      )
    ) {
      throw new Error(`${simulationPath} contains an invalid row: ${line}`);
    }
    opponents.push(opponent);
  }

  if (new Set(opponents).size !== opponents.length) {
    throw new Error(`${simulationPath} contains duplicate opponents`);
  }
  return opponents;
}
