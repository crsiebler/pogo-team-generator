import { createHash } from 'node:crypto';
import { promises as fs } from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import preset from '../../docs/metas/play-pokemon-2026-10-21.json';
import { createPvpokeAdapter, type RankingCategory } from './adapter';
import { parseRankingSourceEntries, type RankingSourceEntry } from './rankings';
import { validatePokemonJson } from './validation';

const categories: readonly RankingCategory[] = [
  'leads',
  'closers',
  'switches',
  'chargers',
  'attackers',
  'overall',
  'consistency',
];
const scripts = [
  'battle/DamageCalculator.js',
  'battle/actions/ActionLogic.js',
  'battle/timeline/TimelineAction.js',
  'battle/timeline/TimelineEvent.js',
  'GameMaster.js',
  'pokemon/Pokemon.js',
  'battle/Battle.js',
  'battle/rankers/Ranker.js',
  'battle/rankers/RankerOverall.js',
];

interface Gamemaster {
  pokemon: Array<{
    speciesId: string;
    fastMoves: string[];
    chargedMoves: string[];
  }>;
  cups: Array<{ name: string }>;
  rankingScenarios: Array<{
    slug: string;
    shields: number[];
    energy: number[];
  }>;
}

interface LocalAjaxRequest {
  url: string;
  type?: string;
  data?: {
    data: string;
    cup: string;
    category: RankingCategory;
    league: number;
  };
}

async function loadRankingInputs(sourcePath: string): Promise<{
  gamemaster: Gamemaster;
  cup: typeof preset;
  seedRankings: RankingSourceEntry[];
  scriptSources: string[];
  fingerprint: string;
}> {
  const source = createPvpokeAdapter({ sourcePath });
  const gamemaster = await source.readCombinedGamemasterJson<Gamemaster>();
  const validation = validatePokemonJson(gamemaster.pokemon);
  if (!validation.valid) throw new Error(validation.errors.join('\n'));
  const cup = { ...preset, name: 'playpokemon', title: 'Play! Pokémon' };
  gamemaster.cups = [
    ...gamemaster.cups.filter((entry) => entry.name !== cup.name),
    cup,
  ];
  const seedRankings = parseRankingSourceEntries(
    await source.readRankingJson('overall', 1500, 'all'),
    'Great League moveset seeds',
  );
  const scriptSources = await Promise.all(
    scripts.map((file) =>
      fs.readFile(
        path.join(source.getRankingGenerationPaths().scriptDirectory, file),
        'utf8',
      ),
    ),
  );
  const fingerprint = createHash('sha256')
    .update(JSON.stringify({ gamemaster, preset, seedRankings, scriptSources }))
    .digest('hex');
  return { gamemaster, cup, seedRankings, scriptSources, fingerprint };
}

/** Read checked-in custom exports without writes, rejecting stale input evidence. */
export async function readPlayPokemonRankingExports(
  sourcePath: string,
): Promise<{
  rankings: Record<RankingCategory, RankingSourceEntry[]>;
  overrides: typeof preset.overrides;
}> {
  const { fingerprint } = await loadRankingInputs(sourcePath);
  const bundle: {
    fingerprint: string;
    rankingsDigest: string;
    rankings: Record<RankingCategory, unknown>;
  } = JSON.parse(await fs.readFile('data/play-pokemon-rankings.json', 'utf8'));
  if (bundle.fingerprint !== fingerprint)
    throw new Error(
      'Play! Pokemon ranking inputs changed. Run bun run lib/scripts/syncPlayPokemon.ts before projection.',
    );
  const digest = createHash('sha256')
    .update(JSON.stringify(bundle.rankings))
    .digest('hex');
  if (digest !== bundle.rankingsDigest)
    throw new Error('Play! Pokemon ranking export digest mismatch');
  const rankings = {} as Record<RankingCategory, RankingSourceEntry[]>;
  for (const category of categories)
    rankings[category] = parseRankingSourceEntries(
      bundle.rankings[category],
      `Play! Pokemon ${category}`,
    );
  return { rankings, overrides: preset.overrides };
}

async function saveRankingExports(
  outputPath: string,
  fingerprint: string,
): Promise<void> {
  const adapter = createPvpokeAdapter({ sourcePath: outputPath });
  const rankings = {} as Record<RankingCategory, RankingSourceEntry[]>;
  for (const category of categories)
    rankings[category] = parseRankingSourceEntries(
      await adapter.readRankingJson(category, 1500, 'playpokemon'),
      category,
    );
  const rankingsDigest = createHash('sha256')
    .update(JSON.stringify(rankings))
    .digest('hex');
  await fs.writeFile(
    'data/play-pokemon-rankings.json',
    JSON.stringify({ fingerprint, rankingsDigest, rankings }),
  );
}

async function linkSource(source: string, target: string): Promise<void> {
  try {
    const existing = await fs.readlink(target);
    if (existing !== source)
      throw new Error(`Unexpected overlay link: ${target}`);
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    )
      throw error;
    await fs.symlink(source, target);
  }
}

/**
 * Build a local PvPoke overlay with independently simulated Play! Pokemon
 * rankings. Vendor files remain untouched. The preset and engine inputs key
 * the reusable export cache; no network or PHP writes execute in the VM.
 */
export async function preparePlayPokemonSource(
  sourcePath: string,
  outputPath: string = path.resolve('build/play-pokemon-pvpoke'),
): Promise<string> {
  if (path.resolve(sourcePath) === path.resolve(outputPath)) {
    throw new Error(
      'Use the original PvPoke checkout as the source, not the generated Play! Pokemon overlay.',
    );
  }
  const source = createPvpokeAdapter({ sourcePath });
  const output = createPvpokeAdapter({ sourcePath: outputPath });
  const sourcePaths = source.getRankingGenerationPaths();
  const outputPaths = output.getRankingGenerationPaths();
  await fs.mkdir(path.join(outputPaths.rankingDirectory, 'playpokemon'), {
    recursive: true,
  });
  await fs.mkdir(path.join(outputPaths.overridesDirectory, 'playpokemon'), {
    recursive: true,
  });
  await fs.mkdir(path.dirname(outputPaths.scriptDirectory), {
    recursive: true,
  });
  await linkSource(sourcePaths.scriptDirectory, outputPaths.scriptDirectory);
  for (const entry of await fs.readdir(sourcePaths.dataDirectory)) {
    const sourceEntry = path.join(sourcePaths.dataDirectory, entry);
    if (
      [
        sourcePaths.gamemasterFile,
        sourcePaths.rankingDirectory,
        sourcePaths.overridesDirectory,
      ].includes(sourceEntry)
    )
      continue;
    await linkSource(sourceEntry, path.join(outputPaths.dataDirectory, entry));
  }
  for (const directory of ['rankingDirectory', 'overridesDirectory'] as const) {
    for (const entry of await fs.readdir(sourcePaths[directory])) {
      if (entry === 'playpokemon') continue;
      await linkSource(
        path.join(sourcePaths[directory], entry),
        path.join(outputPaths[directory], entry),
      );
    }
  }

  const { gamemaster, cup, seedRankings, scriptSources, fingerprint } =
    await loadRankingInputs(sourcePath);
  await fs.writeFile(outputPaths.gamemasterFile, JSON.stringify(gamemaster));
  await fs.writeFile(
    output.getMovesetOverridesFilePath(1500, 'playpokemon'),
    JSON.stringify(preset.overrides),
  );

  const metadataPath = path.join(outputPath, 'generation.json');
  try {
    const metadata: { fingerprint?: string } = JSON.parse(
      await fs.readFile(metadataPath, 'utf8'),
    );
    if (metadata.fingerprint === fingerprint) {
      for (const category of categories)
        parseRankingSourceEntries(
          await output.readRankingJson(category, 1500, 'playpokemon'),
          category,
        );
      console.log('[play-pokemon] Reusing validated custom ranking exports');
      await saveRankingExports(outputPath, fingerprint);
      return outputPath;
    }
  } catch (error) {
    if (
      !(error instanceof Error) ||
      !('code' in error) ||
      error.code !== 'ENOENT'
    )
      throw error;
  }

  const captured = new Map<RankingCategory, string>();
  const jquery = {
    ajax(request: LocalAjaxRequest): void {
      if (!request.type) return; // Gamemaster is supplied explicitly below.
      const data = request.data;
      if (
        request.type !== 'POST' ||
        request.url !== 'data/write.php' ||
        !data ||
        data.cup !== 'playpokemon' ||
        data.league !== 1500 ||
        !categories.includes(data.category)
      ) {
        throw new Error('Unexpected PvPoke ranking output request');
      }
      parseRankingSourceEntries(JSON.parse(data.data), data.category);
      captured.set(data.category, data.data);
      console.log(`[play-pokemon] Completed ${data.category}`);
    },
    each(
      values: unknown[],
      callback: (index: number, value: unknown) => void,
    ): void {
      values.forEach((value, index) => callback(index, value));
    },
  };
  const context = vm.createContext({
    console: {
      log: (message: unknown): void => {
        if (typeof message === 'string' && !message.startsWith('['))
          console.log(message);
      },
    },
    host: 'localhost',
    webRoot: '',
    siteVersion: 'local',
    settings: { gamemaster: 'gamemaster' },
    $: jquery,
    gamemaster,
    cup,
    seedRankings,
    setInterval: (): number => 0,
  });
  for (let index = 0; index < scripts.length - 1; index++) {
    vm.runInContext(scriptSources[index], context, {
      filename: scripts[index],
    });
  }
  vm.runInContext(
    `
    var gm = GameMaster.getInstance();
    gm.data = gamemaster;
    gm.createSearchMaps();
    var ranker = RankerMaster.getInstance();
    ranker.setMoveOverrides(1500, cup.name, cup.overrides);
    ranker.rankLoop(1500, cup, () => {}, seedRankings);
  `,
    context,
  );
  // The upstream overall ranker reads the newly simulated category scores.
  context.categorySources = Object.fromEntries(captured);
  vm.runInContext(scriptSources[scriptSources.length - 1], context, {
    filename: scripts[scripts.length - 1],
  });
  vm.runInContext(
    `
    for (var category of Object.keys(categorySources)) {
      gm.rankings['playpokemon' + category + '1500'] = JSON.parse(categorySources[category]);
    }
    var overallRanker = RankerMaster.getInstance();
    overallRanker.rankLoop(1500, cup);
    gm.loadedData = 5;
    overallRanker.displayRankingData();
  `,
    context,
  );
  for (const category of categories) {
    const contents = captured.get(category);
    if (!contents) throw new Error(`Missing generated ${category} rankings`);
    const target = output.getRankingFilePath(category, 1500, 'playpokemon');
    await fs.mkdir(path.dirname(target), { recursive: true });
    await fs.writeFile(target, contents);
  }
  await fs.writeFile(
    metadataPath,
    JSON.stringify({ fingerprint, rulesCheckedAt: '2026-10-21' }, null, 2),
  );
  await saveRankingExports(outputPath, fingerprint);
  return outputPath;
}
