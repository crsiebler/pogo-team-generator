import { performance } from 'node:perf_hooks';
import {
  getBattleFormats,
  type BattleFormatId,
} from '@/lib/data/battleFormats';
import {
  generateTeam,
  type GenerationPhaseObserver,
} from '@/lib/genetic/algorithm';

const formatArg = process.argv[2] ?? 'play-pokemon';
const modeArg = process.argv[3] ?? 'PlayPokemon';
const runs = Number(process.argv[4] ?? 2);
if (!getBattleFormats().some(({ id }) => id === formatArg)) {
  throw new Error(`Unknown format: ${formatArg}`);
}
if (
  (modeArg !== 'PlayPokemon' && modeArg !== 'GBL') ||
  !Number.isInteger(runs) ||
  runs < 1 ||
  runs > 20
) {
  throw new Error(
    'Usage: bun run lib/scripts/benchmarkGeneration.ts [format] [PlayPokemon|GBL] [runs 1-20]',
  );
}

const originalRandom = Math.random;
const originalLog = console.log;
try {
  for (let run = 0; run < runs; run++) {
    let state = 20;
    Math.random = (): number =>
      (state = (Math.imul(1664525, state) + 1013904223) >>> 0) / 0x100000000;
    const phases: Record<string, number> = {};
    const observe: GenerationPhaseObserver = (phase, elapsedMs) => {
      phases[phase] = elapsedMs;
    };
    console.log = (): void => undefined;
    const start = performance.now();
    let result;
    try {
      result = await generateTeam(
        {
          formatId: formatArg as BattleFormatId,
          mode: modeArg,
          populationSize: 150,
          generations: 75,
        },
        {},
        observe,
      );
    } finally {
      console.log = originalLog;
    }
    originalLog(
      JSON.stringify({
        format: formatArg,
        mode: modeArg,
        seed: 20,
        run: run + 1,
        processState: run === 0 ? 'cold-format' : 'warm',
        population: 150,
        generationCap: 75,
        totalMs: performance.now() - start,
        phasesMs: phases,
        search: result.tournamentSearchStats,
        finalists: result.finalistRerankingStats,
        rssBytes: process.memoryUsage().rss,
      }),
    );
  }
} finally {
  Math.random = originalRandom;
  console.log = originalLog;
}
