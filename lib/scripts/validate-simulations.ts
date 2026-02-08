/**
 * Validates simulation data coverage for Pokémon GO PvP team generator.
 *
 * This script checks that all expected matchup simulations are present and contain valid data.
 * It validates coverage for the top 150 ranked Pokémon against 52 meta threats across 3 shield scenarios.
 *
 * Usage: npm run validate-simulations [--verbose]
 *
 * Options:
 *   --verbose  Show detailed breakdown of issues per attacker
 *
 * Output: Console report showing coverage percentage and missing/incomplete data.
 */
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';
import { parse } from 'csv-parse/sync';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const PROJECT_ROOT = join(__dirname, '../..');

const CONFIG = {
  RANKINGS_FILE: join(PROJECT_ROOT, 'data/cp1500_all_overall_rankings.csv'),
  SIMULATIONS_DIR: join(PROJECT_ROOT, 'data/simulations'),
  TOP_COUNT: 150,
  SHIELD_SCENARIOS: [0, 1, 2] as const,
};

interface RankingEntry {
  name: string;
  rank: number;
  score: number;
}

interface SimulationRow {
  Pokemon: string;
  'Battle Rating': string;
  'Energy Remaining': string;
  'HP Remaining': string;
}

function escapeRegex(string: string): string {
  return string.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function loadRankingsData(): RankingEntry[] {
  try {
    const csvContent = readFileSync(CONFIG.RANKINGS_FILE, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as Record<string, string>[];

    return records
      .map((row, index) => ({
        name: row.Pokemon || row.pokemon || row.name,
        rank: index + 1,
        score: parseFloat(row.Score || row.score || '0'),
      }))
      .sort((a, b) => a.rank - b.rank)
      .slice(0, CONFIG.TOP_COUNT);
  } catch (error) {
    console.error(`Error loading rankings data: ${error}`);
    return [];
  }
}

function getTopPokemon(): string[] {
  const rankings = loadRankingsData();
  return rankings.map((entry) => entry.name);
}

function getExpectedThreats(): string[] {
  try {
    const files = readdirSync(CONFIG.SIMULATIONS_DIR);
    // Find any CSV file
    const csvFile = files.find((f) => f.endsWith('.csv'));
    if (!csvFile) return [];

    const csvPath = join(CONFIG.SIMULATIONS_DIR, csvFile);
    const csvContent = readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as SimulationRow[];

    const threats = records
      .map((row) => {
        const fullPokemonName = row.Pokemon?.trim();
        if (!fullPokemonName) return '';
        // Extract Pokemon name (everything before moveset)
        const parts = fullPokemonName.split(' ');
        let nameEndIndex = parts.length;
        for (let i = 0; i < parts.length; i++) {
          if (parts[i].includes('+') || parts[i].includes('/')) {
            nameEndIndex = i;
            break;
          }
        }
        return parts.slice(0, nameEndIndex).join(' ').toLowerCase();
      })
      .filter((name) => name);

    return [...new Set(threats)]; // unique
  } catch (error) {
    console.error(`Error getting expected threats: ${error}`);
    return [];
  }
}

function findSimulationFiles(attacker: string): Map<number, string> {
  try {
    const files = readdirSync(CONFIG.SIMULATIONS_DIR);
    const simFiles = new Map<number, string>();

    for (const file of files) {
      // Match pattern: {attacker}*vs Open League {shields}-{shields} shields.csv
      const match = file.match(
        new RegExp(
          `^${escapeRegex(attacker)}.*vs Open League (\\d+)-\\d+ shields\\.csv$`,
          'i',
        ),
      );
      if (match) {
        const shields = parseInt(match[1]);
        if (
          CONFIG.SHIELD_SCENARIOS.includes(
            shields as (typeof CONFIG.SHIELD_SCENARIOS)[number],
          )
        ) {
          simFiles.set(shields, join(CONFIG.SIMULATIONS_DIR, file));
        }
      }
    }

    return simFiles;
  } catch (error) {
    console.error(`Error scanning simulation directory: ${error}`);
    return new Map();
  }
}

function validateCsvContent(
  csvPath: string,
  expectedThreats: string[],
): boolean {
  try {
    const csvContent = readFileSync(csvPath, 'utf-8');
    const records = parse(csvContent, {
      columns: true,
      skip_empty_lines: true,
      trim: true,
    }) as SimulationRow[];

    if (records.length !== expectedThreats.length) {
      return false;
    }

    const expectedThreatsSet = new Set(
      expectedThreats.map((t) => t.toLowerCase()),
    );

    for (const row of records) {
      const fullPokemonName = row.Pokemon?.trim();
      if (!fullPokemonName) {
        return false;
      }
      // Extract Pokemon name (everything before moveset, which contains + or /)
      const parts = fullPokemonName.split(' ');
      let nameEndIndex = parts.length;
      for (let i = 0; i < parts.length; i++) {
        if (parts[i].includes('+') || parts[i].includes('/')) {
          nameEndIndex = i;
          break;
        }
      }
      const pokemonName = parts.slice(0, nameEndIndex).join(' ').toLowerCase();
      if (!expectedThreatsSet.has(pokemonName)) {
        return false;
      }

      const battleRating = parseFloat(row['Battle Rating']);
      const energyRemaining = parseFloat(row['Energy Remaining']);
      const hpRemaining = parseFloat(row['HP Remaining']);

      if (isNaN(battleRating) || battleRating < 0 || battleRating > 1000) {
        return false;
      }
      if (isNaN(energyRemaining) || energyRemaining < 0) {
        return false;
      }
      if (isNaN(hpRemaining) || hpRemaining < 0) {
        return false;
      }
    }

    return true;
  } catch (error) {
    console.error(`Error validating CSV ${csvPath}: ${error}`);
    return false;
  }
}

function generateReport(
  attackers: string[],
  threats: string[],
  results: Map<string, { missingFiles: number[]; incompleteCsvs: string[] }>,
  verbose: boolean,
): void {
  const totalExpected =
    attackers.length * threats.length * CONFIG.SHIELD_SCENARIOS.length;
  let totalValid = 0;
  let totalMissingFiles = 0;
  let totalIncompleteCsvs = 0;

  for (const [, result] of results) {
    totalMissingFiles += result.missingFiles.length;
    totalIncompleteCsvs += result.incompleteCsvs.length;
    totalValid +=
      CONFIG.SHIELD_SCENARIOS.length -
      result.missingFiles.length -
      result.incompleteCsvs.length;
  }

  const coveragePercent =
    totalExpected > 0 ? ((totalValid / totalExpected) * 100).toFixed(1) : '0.0';

  console.log('\nSimulation Data Validation Report');
  console.log('=================================\n');

  console.log(
    `Total Expected: ${attackers.length} attackers × ${threats.length} threats × ${CONFIG.SHIELD_SCENARIOS.length} shields = ${totalExpected} matchups`,
  );
  console.log(`Coverage: ${coveragePercent}% (${totalValid} valid matchups)\n`);

  console.log(`Missing Files: ${totalMissingFiles} total`);
  console.log(`Incomplete CSVs: ${totalIncompleteCsvs} total\n`);

  // Show top 10 attackers with most issues
  const sortedByIssues = Array.from(results.entries())
    .map(([attacker, result]) => ({
      attacker,
      issues: result.missingFiles.length + result.incompleteCsvs.length,
    }))
    .filter((item) => item.issues > 0)
    .sort((a, b) => b.issues - a.issues)
    .slice(0, 10);

  if (sortedByIssues.length > 0) {
    console.log('Top Attackers with Issues:');
    for (const item of sortedByIssues) {
      console.log(`- ${item.attacker}: ${item.issues} issues`);
    }
    console.log();
  }

  if (totalValid === totalExpected) {
    console.log('🎉 All simulation data is complete!');
  } else {
    console.log('⚠️  Some simulation data is missing or incomplete.');
    console.log('Run with --verbose flag for detailed breakdowns.');
  }

  if (verbose) {
    console.log('\nDetailed Breakdown:');
    const sortedResults = Array.from(results.entries())
      .filter(
        ([, result]) =>
          result.missingFiles.length > 0 || result.incompleteCsvs.length > 0,
      )
      .sort(([a], [b]) => a.localeCompare(b));

    for (const [attacker, result] of sortedResults) {
      const parts: string[] = [];
      if (result.missingFiles.length > 0) {
        parts.push(`Missing shields ${result.missingFiles.join(', ')}`);
      }
      if (result.incompleteCsvs.length > 0) {
        parts.push(`Incomplete CSVs: ${result.incompleteCsvs.join(', ')}`);
      }
      console.log(`${attacker}: ${parts.join('; ')}`);
    }
  }
}

function main(): void {
  const verbose = process.argv.includes('--verbose');

  console.log('Loading rankings data...');
  const topPokemon = getTopPokemon();

  if (topPokemon.length === 0) {
    console.error(
      'Failed to load rankings data. Check if data/cp1500_overall.csv exists.',
    );
    process.exit(1);
  }

  console.log(`Found ${topPokemon.length} top-ranked Pokémon.`);

  console.log('Determining expected threats from simulation data...');
  const expectedThreats = getExpectedThreats();
  if (expectedThreats.length === 0) {
    console.error(
      'Failed to determine expected threats from simulation files.',
    );
    process.exit(1);
  }
  console.log(`Found ${expectedThreats.length} expected threats.`);

  const results = new Map<
    string,
    { missingFiles: number[]; incompleteCsvs: string[] }
  >();

  console.log('Validating simulation files...');
  for (const attacker of topPokemon) {
    const simFiles = findSimulationFiles(attacker);
    const missingFiles: number[] = [];
    const incompleteCsvs: string[] = [];

    for (const shields of CONFIG.SHIELD_SCENARIOS) {
      const filePath = simFiles.get(shields);
      if (!filePath) {
        missingFiles.push(shields);
      } else if (!validateCsvContent(filePath, expectedThreats)) {
        incompleteCsvs.push(filePath);
      }
    }

    results.set(attacker, { missingFiles, incompleteCsvs });
  }

  generateReport(topPokemon, expectedThreats, results, verbose);
}

main();
