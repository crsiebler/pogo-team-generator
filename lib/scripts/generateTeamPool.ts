import { writeFileSync } from 'node:fs';
import { gzipSync } from 'node:zlib';
import { getTeamPoolSourceFingerprint } from './teamPoolSourceFingerprint';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import { speciesNameToChoosableId } from '@/lib/data/pokemon';
import { getOverallRankings } from '@/lib/data/rankings';
import { generateTeam } from '@/lib/genetic/algorithm';
import {
  getPregeneratedFingerprint,
  type PregeneratedPool,
} from '@/lib/genetic/pregeneratedPool';
import type { Chromosome, TournamentMode } from '@/lib/types';

const targets: ReadonlyArray<{
  formatId: BattleFormatId;
  modes: readonly TournamentMode[];
}> = [
  { formatId: 'play-pokemon', modes: ['PlayPokemon'] },
  { formatId: 'great-league', modes: ['PlayPokemon', 'GBL'] },
  { formatId: 'ultra-league', modes: ['PlayPokemon', 'GBL'] },
];
const originalRandom = Math.random;
const pools: PregeneratedPool[] = [];
try {
  for (const { formatId, modes } of targets) {
    const anchors = [
      ...new Set(
        getOverallRankings(formatId).flatMap(({ Pokemon }) => {
          const id = speciesNameToChoosableId(Pokemon);
          return id ? [id] : [];
        }),
      ),
    ].slice(0, 2);
    for (const mode of modes) {
      for (const anchorSpeciesId of [undefined, ...anchors]) {
        const pool: PregeneratedPool = {
          formatId,
          mode,
          anchorSpeciesId,
          fingerprint: getPregeneratedFingerprint(formatId),
          teams: [],
        };
        const seeds = mode === 'GBL' ? [20, 7, 42] : [20];
        for (const seed of seeds) {
          let state = seed;
          Math.random = (): number =>
            (state = (Math.imul(1664525, state) + 1013904223) >>> 0) /
            0x100000000;
          const candidates: Chromosome[] = [];
          const winner = await generateTeam(
            {
              formatId,
              mode,
              anchorPokemon: anchorSpeciesId ? [anchorSpeciesId] : [],
              populationSize: 150,
              generations: 75,
            },
            { collectFinalists: (teams) => candidates.push(...teams) },
          );
          if (mode === 'GBL') candidates.push(winner);
          for (const result of candidates) {
            const team = {
              team: result.team,
              anchors: result.anchors,
              fitness: result.fitness,
              tournamentSelection: result.tournamentSelection,
              movesetAssignment: result.movesetAssignment,
              scoreBreakdown: result.scoreBreakdown,
              recommendedLineups: result.recommendedLineups,
            };
            if (
              !pool.teams.some(
                (entry) =>
                  [...entry.team].sort().join(',') ===
                  [...team.team].sort().join(','),
              )
            )
              pool.teams.push(team);
          }
        }
        if (!pool.teams.length)
          throw new Error(
            `No generated teams for ${formatId}/${mode}/${anchorSpeciesId ?? 'unconstrained'}`,
          );
        pools.push(pool);
        console.log(
          `Pool ${formatId}/${mode}/${anchorSpeciesId ?? 'unconstrained'}: ${pool.teams.length} distinct teams`,
        );
      }
    }
  }
} finally {
  Math.random = originalRandom;
}
writeFileSync(
  process.argv[2] === '--staged'
    ? 'build/tmp/pregeneratedTeams.staged.ts'
    : 'lib/genetic/pregeneratedTeams.ts',
  `import { gunzipSync } from 'node:zlib';\nimport type { PregeneratedPool } from './pregeneratedPool';\n\n/** Source digest for the generated pool's verification test. */\nexport const pregeneratedSourceFingerprint = '${getTeamPoolSourceFingerprint()}';\n\n/** Generated from typed results; pool integration tests validate the serialized artifact. */\nexport const pregeneratedPools: readonly PregeneratedPool[] = JSON.parse(gunzipSync(Buffer.from(${JSON.stringify(
    gzipSync(JSON.stringify(pools), { level: 9 })
      .toString('base64')
      .match(/.{1,256}/g),
  )}.join(''), 'base64')).toString('utf8')) as PregeneratedPool[];\n`,
);
