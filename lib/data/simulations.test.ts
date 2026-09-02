import { readdirSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { beforeAll } from 'vitest';
import { getBattleFormats } from './battleFormats';
import { getMovesetAvailability } from './moveAvailability';
import {
  getMovesetVariantManifestPath,
  MOVESET_VARIANT_SCENARIOS,
  parseMovesetVariantManifestJson,
} from './movesetVariantManifest';
import { speciesIdToSpeciesName, speciesNameToChoosableId } from './pokemon';
import { getOptimalMoveset } from './rankings';
import {
  parseRuntimeSimulationAssetIndexJson,
  RUNTIME_SIMULATION_ASSET_INDEX_PATH,
} from './runtimeSimulationAssetIndex';
import {
  ensureSimulationDataAvailable,
  extractSpeciesNameFromSimulationCell,
  getActiveMovesetVariants,
  getMatchupMatrix,
  getMatchupResult,
  getMovesetVariantShieldScenarioMatchupResult,
  getShieldScenarioMatchupResult,
  getTopThreatsByRole,
} from './simulations';
import { parseVariantSimulationFilename } from '@/lib/sync/simulationProjection';

describe('format-aware simulation loading', () => {
  beforeAll(() => {
    for (const format of getBattleFormats()) {
      ensureSimulationDataAvailable(format.id);
    }
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

  it('contains no generated variant-qualified simulation CSVs', () => {
    const simulationRoot = path.join(process.cwd(), 'data', 'simulations');
    const variantPaths = getRegularFiles(simulationRoot).filter(
      (filePath) =>
        parseVariantSimulationFilename(path.basename(filePath)) !== null,
    );

    expect(variantPaths).toEqual([]);
  });

  it('validates every checked-in default-only manifest and scenario', () => {
    const expectedRuntimeAssets = new Set<string>();
    let eliteDefaultCount = 0;
    let eventExclusiveMoveCount = 0;

    for (const format of getBattleFormats()) {
      const manifestResourcePath = getMovesetVariantManifestPath(format);
      const manifest = parseMovesetVariantManifestJson(
        readFileSync(path.join(process.cwd(), manifestResourcePath), 'utf8'),
      );

      expect(manifest.metadata.formatId).toBe(format.id);
      expectedRuntimeAssets.add(manifestResourcePath);
      const defaultMatrix = getMatchupMatrix(format.id);
      expect(defaultMatrix.size).toBe(manifest.species.length);

      for (const species of manifest.species) {
        expect(species.speciesId).not.toMatch(/^(furret|florges)_shadow$/);

        expect(species.candidates).toHaveLength(1);

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
        expect(activeCandidates).toHaveLength(1);
        const defaultCandidate = activeCandidates.find(
          ({ id }) => id === species.defaultVariantId,
        );
        expect(defaultCandidate).toBeDefined();
        expect(defaultCandidate?.isDefault).toBe(true);
        expect(defaultCandidate).toMatchObject(
          getOptimalMoveset(
            speciesIdToSpeciesName(species.speciesId),
            format.id,
          ),
        );
        for (const scenario of MOVESET_VARIANT_SCENARIOS) {
          expect(defaultCandidate?.storageKeys[scenario]).toBe(
            `${species.speciesId}_${scenario}.csv`,
          );
          expectedRuntimeAssets.add(
            path.posix.join(
              path.posix.dirname(manifestResourcePath),
              defaultCandidate!.storageKeys[scenario],
            ),
          );
        }
        expect(getActiveMovesetVariants(species.speciesId, format.id)).toEqual(
          activeCandidates.map(
            ({ id, fastMove, chargedMove1, chargedMove2, isDefault }) => ({
              id,
              fastMove,
              chargedMove1,
              chargedMove2,
              isDefault,
              ...(species.additionalChargedMove
                ? {
                    additionalChargedMove: species.additionalChargedMove,
                    megaLevel: 4,
                  }
                : {}),
            }),
          ),
        );

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

        const defaultRows = Object.fromEntries(
          MOVESET_VARIANT_SCENARIOS.map((scenario) => [
            scenario,
            readValidSimulationRows(
              manifestResourcePath,
              defaultCandidate!.storageKeys[scenario],
            ),
          ]),
        );
        expect([...loadedDefaultMatchups.keys()]).toEqual(
          defaultRows['0-0'].map(({ opponentSpeciesId }) => opponentSpeciesId),
        );

        for (const candidate of activeCandidates) {
          const candidateRows = Object.fromEntries(
            MOVESET_VARIANT_SCENARIOS.map((scenario) => [
              scenario,
              readValidSimulationRows(
                manifestResourcePath,
                candidate.storageKeys[scenario],
              ),
            ]),
          );
          const candidateRatings = Object.fromEntries(
            MOVESET_VARIANT_SCENARIOS.map((scenario) => [
              scenario,
              new Map(
                candidateRows[scenario].map(
                  ({ opponentSpeciesId, battleRating }) => [
                    opponentSpeciesId,
                    battleRating,
                  ],
                ),
              ),
            ]),
          );
          for (const scenario of MOVESET_VARIANT_SCENARIOS) {
            const rows = candidateRows[scenario];
            const defaultScenarioRows = defaultRows[scenario];
            if (
              rows.length !== defaultScenarioRows.length ||
              rows.some(
                (row, index) =>
                  row.opponentSpeciesId !==
                  defaultScenarioRows[index]?.opponentSpeciesId,
              )
            ) {
              throw new Error(
                `${format.id}/${species.speciesId}/${candidate.id}/${scenario} does not match its default opponent set`,
              );
            }
            const shields = Number(scenario[0]) as 0 | 1 | 2;
            for (const row of rows) {
              const loaded = getMovesetVariantShieldScenarioMatchupResult(
                species.speciesId,
                candidate.id,
                row.opponentSpeciesId,
                shields,
                format.id,
              );
              if (loaded !== row.battleRating) {
                throw new Error(
                  `${format.id}/${species.speciesId}/${candidate.id}/${scenario}/${row.opponentSpeciesId} snapshot rating ${loaded} does not match CSV ${row.battleRating}`,
                );
              }
            }
          }
          for (const row of candidateRows['0-0']) {
            const expectedAggregate =
              row.battleRating * 0.3 +
              getRequiredCsvRating(
                candidateRatings['1-1'],
                row.opponentSpeciesId,
              ) *
                0.5 +
              getRequiredCsvRating(
                candidateRatings['2-2'],
                row.opponentSpeciesId,
              ) *
                0.2;
            const loadedAggregate = getMatchupResult(
              species.speciesId,
              row.opponentSpeciesId,
              format.id,
              candidate.id,
            );
            if (loadedAggregate !== expectedAggregate) {
              throw new Error(
                `${format.id}/${species.speciesId}/${candidate.id}/${row.opponentSpeciesId} snapshot aggregate ${loadedAggregate} does not match CSV ${expectedAggregate}`,
              );
            }
          }
        }
      }
    }

    expect(eliteDefaultCount).toBeGreaterThan(0);
    expect(eventExclusiveMoveCount).toBeGreaterThan(0);
    const runtimeAssetIndex = parseRuntimeSimulationAssetIndexJson(
      readFileSync(
        path.join(process.cwd(), RUNTIME_SIMULATION_ASSET_INDEX_PATH),
        'utf8',
      ),
    );
    expect(runtimeAssetIndex.assets).toEqual([...expectedRuntimeAssets].sort());
    for (const assetPath of runtimeAssetIndex.assets) {
      expect(
        readFileSync(path.join(process.cwd(), assetPath)).length,
      ).toBeGreaterThan(0);
    }
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

function getRegularFiles(directoryPath: string): string[] {
  return readdirSync(directoryPath, { withFileTypes: true }).flatMap(
    (entry) => {
      const entryPath = path.join(directoryPath, entry.name);
      if (entry.isDirectory()) {
        return getRegularFiles(entryPath);
      }
      return entry.isFile() ? [entryPath] : [];
    },
  );
}

interface ValidSimulationRow {
  readonly opponentSpeciesId: string;
  readonly battleRating: number;
}

function getRequiredCsvRating(
  ratings: ReadonlyMap<string, number>,
  opponentSpeciesId: string,
): number {
  const rating = ratings.get(opponentSpeciesId);
  if (rating === undefined) {
    throw new Error(`Missing CSV rating for ${opponentSpeciesId}`);
  }
  return rating;
}

function readValidSimulationRows(
  manifestResourcePath: string,
  storageKey: string,
): ValidSimulationRow[] {
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

  const rows: ValidSimulationRow[] = [];
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
    const opponentSpeciesId = speciesNameToChoosableId(
      extractSpeciesNameFromSimulationCell(opponent),
    );
    if (!opponentSpeciesId) {
      throw new Error(
        `${simulationPath} contains unknown opponent ${opponent}`,
      );
    }
    rows.push({
      opponentSpeciesId,
      battleRating: Number(battleRating),
    });
  }

  if (
    new Set(rows.map(({ opponentSpeciesId }) => opponentSpeciesId)).size !==
    rows.length
  ) {
    throw new Error(`${simulationPath} contains duplicate opponents`);
  }
  return rows;
}
