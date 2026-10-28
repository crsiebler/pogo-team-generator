import { promises as fs } from 'node:fs';
import path from 'node:path';
import {
  getBattleFormats,
  type BattleFormatId,
} from '@/lib/data/battleFormats';
import {
  completeSimulationManifestSync,
  createSyncOutputFingerprint,
  resolveCompletedSyncMetadata,
} from '@/lib/sync';
import { preparePlayPokemonSource } from '@/lib/sync/playPokemonSource';
import { scrapeRankings } from '@/lib/sync/rankings';
import { resolvePvpokeSourcePath } from '@/lib/sync/source';
import type { PokemonData } from '@/lib/sync/types';
import { validatePokemonJson } from '@/lib/sync/validation';

const previousMetadata = await fs.readFile('data/sync-metadata.json', 'utf8');
const previousOutputFingerprint = createSyncOutputFingerprint();
const sourcePath = await preparePlayPokemonSource(
  resolvePvpokeSourcePath().sourcePath,
);
const previousOverallRankingsByFormatId = new Map<BattleFormatId, string>();
for (const format of getBattleFormats()) {
  const filename = path.join(
    'data/rankings',
    `cp${format.cp}`,
    format.cup,
    'overall_rankings.csv',
  );
  try {
    previousOverallRankingsByFormatId.set(
      format.id,
      await fs.readFile(filename, 'utf8'),
    );
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    )
      throw error;
  }
}
const pokemonSource = await fs.readFile('data/pokemon.json', 'utf8');
const movesSource = await fs.readFile('data/moves.json', 'utf8');
const pokemonData: PokemonData[] = JSON.parse(pokemonSource);
const validation = validatePokemonJson(pokemonData);
if (!validation.valid) throw new Error(validation.errors.join('\n'));
const rankingSyncResult = await scrapeRankings({
  sourcePath,
  resume: true,
  previousOverallRankingsByFormatId,
});
await completeSimulationManifestSync(
  {
    sourcePath,
    options: { resume: true },
    rankingSyncResult,
    pokemonData,
    pokemonSource,
    movesSource,
  },
  {
    // This additive workflow preserves all existing source files.
    cleanup: async (): Promise<string[]> => [],
  },
);
await fs.writeFile(
  'data/sync-metadata.json',
  resolveCompletedSyncMetadata(previousMetadata, previousOutputFingerprint),
);
console.log('[play-pokemon] Rankings and runtime simulations published');
