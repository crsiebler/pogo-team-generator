import { createHash } from 'node:crypto';
import {
  assertBattleFormatAvailable,
  type BattleFormatId,
} from './battleFormats';
import { getPokemonBySpeciesId } from './pokemon';
import { getRankedSpeciesIds } from './rankings';
import { getMatchupMatrix } from './simulations';
import {
  parseRosterMovesetAssignment,
  resolveRankedDefaultRosterMovesetAssignment,
} from '@/lib/genetic/moveset';
import { TOURNAMENT_POLICY } from '@/lib/genetic/paretoSelection';
import { isTeamLegalForFormat } from '@/lib/genetic/teamLegality';
import type { RosterMovesetAssignment } from '@/lib/types';

/** Ranked-default opposing roster; matrices cannot replay arbitrary enemy moves. */
export interface OpponentRoster {
  readonly id: string;
  readonly species: readonly string[];
  readonly assignment: RosterMovesetAssignment;
  readonly source: 'synthetic' | 'curated';
  readonly family: string;
  readonly partition: 'selection' | 'held-out';
  readonly provenance: string;
  readonly verifiedOn: string | null;
  readonly adapted: boolean;
}

/** Immutable per-run scenario authority, independent of candidate generation. */
export interface OpponentRosterDataset {
  readonly formatId: BattleFormatId;
  readonly fingerprint: string;
  readonly rosters: readonly OpponentRoster[];
  readonly excluded: readonly string[];
}

/** Unavailable opponent evidence is actionable, not a zero-risk result. */
export class OpponentRosterDataError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'OpponentRosterDataError';
  }
}

/** Validates curated input against the exact current corpus/snapshot identity.
 * Unknown is intentional at this untrusted JSON boundary. Rejected stale or
 * illegal records retain reasons; malformed schemas fail rather than disappear.
 */
export function validateCuratedOpponentRosters(
  input: unknown,
  current: OpponentRosterDataset,
): { rosters: OpponentRoster[]; excluded: string[] } {
  const record = (value: unknown): value is Record<string, unknown> =>
    typeof value === 'object' && value !== null && !Array.isArray(value);
  if (
    !record(input) ||
    input.schemaVersion !== 1 ||
    input.formatId !== current.formatId ||
    typeof input.snapshotFingerprint !== 'string' ||
    !Array.isArray(input.rosters)
  )
    throw new OpponentRosterDataError(
      'Opponent corpus schema, format, fingerprint, or roster list is invalid.',
    );
  if (input.snapshotFingerprint !== current.fingerprint)
    return {
      rosters: [],
      excluded: [
        'Curated corpus is stale for the synchronized ranking/simulation fingerprint. Revalidate its legality and context.',
      ],
    };
  const ranked = getRankedSpeciesIds(current.formatId);
  const rosters: OpponentRoster[] = [];
  const excluded: string[] = [];
  const ids = new Set<string>();
  for (const entry of input.rosters) {
    if (
      !record(entry) ||
      typeof entry.id !== 'string' ||
      !entry.id ||
      typeof entry.family !== 'string' ||
      !entry.family ||
      typeof entry.provenance !== 'string' ||
      !/^https:\/\//.test(entry.provenance) ||
      typeof entry.context !== 'string' ||
      !entry.context ||
      typeof entry.verifiedOn !== 'string' ||
      !/^\d{4}-\d{2}-\d{2}$/.test(entry.verifiedOn) ||
      !Number.isFinite(Date.parse(entry.verifiedOn)) ||
      !['selection', 'held-out'].includes(String(entry.partition)) ||
      typeof entry.adapted !== 'boolean' ||
      !Array.isArray(entry.species) ||
      !entry.species.every((id): id is string => typeof id === 'string')
    )
      throw new OpponentRosterDataError(
        'Curated roster requires identity, family/event, HTTPS provenance, context, verification date, partition, adaptation flag, and species.',
      );
    if (ids.has(entry.id))
      throw new OpponentRosterDataError(
        `Duplicate opponent roster id: ${entry.id}.`,
      );
    ids.add(entry.id);
    const species = [...entry.species].sort();
    if (
      species.length !== 6 ||
      species.some((id) => !ranked.has(id)) ||
      new Set(species.map((id) => getPokemonBySpeciesId(id)?.dex)).size !== 6 ||
      !isTeamLegalForFormat(species, current.formatId)
    ) {
      excluded.push(
        `${entry.id}: illegal or unsupported six-member roster in ${current.formatId}.`,
      );
      continue;
    }
    if (
      rosters.some(
        (r) => r.family === entry.family && r.partition !== entry.partition,
      )
    )
      throw new OpponentRosterDataError(
        'Roster families/events cannot cross tuning and held-out partitions.',
      );
    if (
      rosters.some(
        (r) => r.species.filter((id) => species.includes(id)).length >= 5,
      )
    ) {
      excluded.push(`${entry.id}: duplicate or near-duplicate roster family.`);
      continue;
    }
    const published = parseRosterMovesetAssignment(
      entry.assignment,
      species,
      current.formatId,
    );
    const assignment = resolveRankedDefaultRosterMovesetAssignment(
      species,
      current.formatId,
    );
    const adapted = species.some(
      (id) =>
        published.variantsBySpeciesId[id].id !==
        assignment.variantsBySpeciesId[id].id,
    );
    if (adapted && !entry.adapted) {
      excluded.push(
        `${entry.id}: enemy movesets require explicit ranked-default adaptation.`,
      );
      continue;
    }
    rosters.push({
      id: entry.id,
      species,
      assignment,
      source: 'curated',
      family: entry.family,
      partition: entry.partition as OpponentRoster['partition'],
      provenance: `${entry.provenance} — ${entry.context}`,
      verifiedOn: entry.verifiedOn,
      adapted,
    });
  }
  return { rosters, excluded };
}

/** Builds deterministic legal opponent scenarios from the selected format. */
export function loadOpponentRosters(
  formatId: BattleFormatId,
  curatedInput?: unknown,
): OpponentRosterDataset {
  assertBattleFormatAvailable(formatId);
  const matrix = getMatchupMatrix(formatId);
  const candidates = [...getRankedSpeciesIds(formatId)]
    .filter((id) => matrix.has(id) && getPokemonBySpeciesId(id))
    .slice(0, TOURNAMENT_POLICY.opponentCandidateCount);
  if (candidates.length < 6)
    throw new OpponentRosterDataError(
      `Not enough synchronized ranked candidates for ${formatId} opponent rosters. Run sync for this format.`,
    );
  const rosters: OpponentRoster[] = [];
  const target =
    TOURNAMENT_POLICY.selectionRosterCount +
    TOURNAMENT_POLICY.heldOutRosterCount;
  // Seeds belong to corpus construction, never to Math.random or the search.
  for (let attempt = 0; attempt < 2048 && rosters.length < target; attempt++) {
    const seed = candidates[attempt % candidates.length];
    const team = [seed];
    const ordered = candidates.toSorted(
      (a, b) =>
        stableHash(`${attempt}:${a}`) - stableHash(`${attempt}:${b}`) ||
        a.localeCompare(b),
    );
    while (team.length < 6) {
      const legal = ordered.filter(
        (id) =>
          !team.includes(id) &&
          !team.some(
            (member) =>
              getPokemonBySpeciesId(member)!.dex ===
              getPokemonBySpeciesId(id)!.dex,
          ) &&
          isTeamLegalForFormat([...team, id], formatId),
      );
      if (!legal.length) break;
      // Alternate diverse ranked compositions and complementary core repair.
      if (attempt % 2 === 0 && team.length < 3) {
        const counters = candidates.filter((opponent) =>
          team.every(
            (member) =>
              (matrix.get(member)?.get(opponent)?.shields1?.battleRating ??
                500) < 500,
          ),
        );
        legal.sort(
          (a, b) =>
            counters.filter(
              (t) => (matrix.get(b)?.get(t)?.shields1?.battleRating ?? 0) > 500,
            ).length -
            counters.filter(
              (t) => (matrix.get(a)?.get(t)?.shields1?.battleRating ?? 0) > 500,
            ).length,
        );
      }
      team.push(legal[0]);
    }
    team.sort();
    if (
      team.length !== 6 ||
      rosters.some(
        (r) => r.species.filter((id) => team.includes(id)).length >= 5,
      )
    )
      continue;
    const id = team.join('|');
    rosters.push({
      id,
      species: team,
      assignment: resolveRankedDefaultRosterMovesetAssignment(team, formatId),
      source: 'synthetic',
      family: id,
      partition:
        rosters.length < TOURNAMENT_POLICY.selectionRosterCount
          ? 'selection'
          : 'held-out',
      provenance:
        'Deterministic ranked-default synthetic composition; no tournament usage claim.',
      verifiedOn: null,
      adapted: false,
    });
  }
  if (rosters.length !== target)
    throw new OpponentRosterDataError(
      `Insufficient distinct legal opponent rosters for ${formatId}: ${rosters.length}/${target}. Supply a validated corpus or synchronize broader format evidence.`,
    );
  // Include synchronized cell contents, not merely names, so new moves or
  // regenerated simulations cannot reuse the previous evidence identity.
  const hash = createHash('sha256').update(
    JSON.stringify([formatId, TOURNAMENT_POLICY.version, rosters]),
  );
  for (const id of candidates)
    for (const opponent of candidates) {
      const cell = matrix.get(id)?.get(opponent);
      hash.update(
        JSON.stringify([
          id,
          opponent,
          cell?.shields0?.battleRating ?? null,
          cell?.shields1?.battleRating ?? null,
          cell?.shields2?.battleRating ?? null,
        ]),
      );
    }
  const synthetic: OpponentRosterDataset = {
    formatId,
    fingerprint: hash.digest('hex'),
    rosters,
    excluded: [],
  };
  if (curatedInput === undefined) return synthetic;
  const curated = validateCuratedOpponentRosters(curatedInput, synthetic);
  const combined: OpponentRoster[] = [...curated.rosters];
  for (const roster of rosters)
    if (
      !combined.some(
        (r) =>
          r.species.filter((id) => roster.species.includes(id)).length >= 5,
      )
    )
      combined.push(roster);
  for (const partition of ['selection', 'held-out'] as const)
    if (!combined.some((r) => r.partition === partition))
      throw new OpponentRosterDataError(
        `No independent ${partition} opponent families are available.`,
      );
  return {
    formatId,
    fingerprint: createHash('sha256')
      .update(JSON.stringify([synthetic.fingerprint, combined]))
      .digest('hex'),
    rosters: combined,
    excluded: curated.excluded,
  };
}

function stableHash(value: string): number {
  let hash = 2166136261;
  for (let index = 0; index < value.length; index++)
    hash = Math.imul(hash ^ value.charCodeAt(index), 16777619);
  return hash >>> 0;
}
