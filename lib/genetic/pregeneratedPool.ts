import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { TOURNAMENT_POLICY } from './paretoSelection';
import {
  getBattleFormatById,
  type BattleFormatId,
} from '@/lib/data/battleFormats';
import type {
  Chromosome,
  GenerationOptions,
  TournamentMode,
} from '@/lib/types';

export interface PregeneratedPool {
  formatId: BattleFormatId;
  mode: TournamentMode;
  anchorSpeciesId?: string;
  fingerprint: string;
  teams: Chromosome[];
}

/** Select a matching pooled team when its inputs are current. */
export function selectPregeneratedTeam(
  pool: PregeneratedPool,
  options: GenerationOptions,
  fingerprint: string,
  random: number,
): Chromosome | undefined {
  if (
    pool.formatId !== options.formatId ||
    pool.mode !== options.mode ||
    pool.fingerprint !== fingerprint ||
    options.simulateMovesetVariants ||
    (options.anchorPokemon?.length ?? 0) > 1 ||
    pool.anchorSpeciesId !== options.anchorPokemon?.[0] ||
    options.excludedPokemon?.length ||
    pool.teams.length === 0 ||
    !Number.isFinite(random) ||
    random < 0 ||
    random >= 1
  )
    return undefined;
  const result = pool.teams[Math.floor(random * pool.teams.length)];
  return pool.anchorSpeciesId && result.team[0] !== pool.anchorSpeciesId
    ? undefined
    : result;
}

/** Fingerprint all runtime input files used to build a format's results. */
export function getPregeneratedFingerprint(formatId: BattleFormatId): string {
  const format = getBattleFormatById(formatId);
  if (!format) throw new Error(`Unknown format: ${formatId}`);
  const files = [
    'data/pokemon.json',
    'data/moves.json',
    'data/type-effectiveness.json',
    `data/simulations/cp${format.cp}/${format.cup}/runtime-snapshot.json`,
    ...[
      'overall',
      'leads',
      'switches',
      'closers',
      'chargers',
      'attackers',
      'consistency',
    ].map(
      (category) =>
        `data/rankings/cp${format.cp}/${format.cup}/${category}_rankings.csv`,
    ),
  ];
  const hash = createHash('sha256').update(
    `pregenerated-v1:${TOURNAMENT_POLICY.version}`,
  );
  for (const file of files)
    hash.update(file).update(readFileSync(path.join(process.cwd(), file)));
  return hash.digest('hex');
}
