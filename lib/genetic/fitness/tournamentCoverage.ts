import { createHash } from 'node:crypto';
import type { LineupScoringContext } from './lineupScoring';
import { scoreMatchupRating } from './matchupScoring';
import { getDexNumber } from '@/lib/data/pokemon';
import { getAssignedMovesetVariantId } from '@/lib/genetic/moveset';
import { isTeamLegalForFormat } from '@/lib/genetic/teamLegality';
import type {
  RosterMovesetAssignment,
  TournamentCoverageAudit,
} from '@/lib/types';

interface Profile {
  readonly quality: readonly number[];
  readonly missing: number;
  readonly counters: readonly number[];
}
interface AuditContext {
  readonly threats: readonly string[];
  readonly weights: readonly number[];
  readonly fingerprint: string;
  readonly profiles: Map<string, Profile>;
}
const contexts = new WeakMap<LineupScoringContext, AuditContext>();
const TAIL_SIZE = 6;

/** Common ranked universe and member profiles are reused only within one run. */
function auditContext(context: LineupScoringContext): AuditContext {
  const cached = contexts.get(context);
  if (cached) return cached;
  const threats = [
    ...new Set(
      context.tournamentThreats ?? context.fullMetaThreats ?? context.threats,
    ),
  ].sort();
  const weights = threats.map((id) => {
    const score = context.getRankingScore(id);
    if (!Number.isFinite(score) || score < 0 || score > 100)
      throw new Error('Tournament threat ranking must be within 0..100.');
    return score / 100;
  });
  const result = {
    threats,
    weights,
    fingerprint: createHash('sha256')
      .update(JSON.stringify([threats, weights]))
      .digest('hex'),
    profiles: new Map<string, Profile>(),
  };
  contexts.set(context, result);
  return result;
}

function memberProfile(
  species: string,
  assignment: RosterMovesetAssignment | undefined,
  context: LineupScoringContext,
  audit: AuditContext,
): Profile {
  const variant = getAssignedMovesetVariantId(assignment, species);
  const key = JSON.stringify([species, variant ?? 'default']);
  const cached = audit.profiles.get(key);
  if (cached) return cached;
  let missing = 0;
  const quality = audit.threats.map((enemy) =>
    Math.min(
      ...([0, 1, 2] as const).map((shield) => {
        const rating = context.getShieldScenarioMatchupRating?.(
          species,
          enemy,
          shield,
          variant,
        );
        if (
          rating == null ||
          !Number.isFinite(rating) ||
          rating < 0 ||
          rating > 1000
        ) {
          missing++;
          return 0;
        }
        return scoreMatchupRating(rating);
      }),
    ),
  );
  const counters = quality
    .map((value, i) => ({ i, risk: (1 - value) * audit.weights[i] }))
    .sort((a, b) => b.risk - a.risk || a.i - b.i)
    .slice(0, 12)
    .map(({ i }) => i);
  const profile = { quality, missing, counters };
  if (audit.profiles.size >= 512)
    audit.profiles.delete(audit.profiles.keys().next().value!);
  audit.profiles.set(key, profile);
  return profile;
}

/** Mean of the worst distinct-Dex risks, so numerous easy wins cannot dilute gaps. */
function worstThreatRisk(
  risks: readonly number[],
  threats: readonly string[],
): number {
  const seen = new Set<number | string>();
  const worst = risks
    .map((risk, index) => ({ risk, index }))
    .sort((a, b) => b.risk - a.risk || a.index - b.index)
    .filter(({ index }) => {
      const dex = getDexNumber(threats[index]) ?? threats[index];
      if (seen.has(dex)) return false;
      seen.add(dex);
      return true;
    })
    .slice(0, TAIL_SIZE);
  return worst.length
    ? worst.reduce((sum, item) => sum + item.risk, 0) / worst.length
    : 1;
}

/** Audits stable first/backup answers and bounded legal counter pairs across the ranked field. */
export function evaluateTournamentCoverage(
  roster: readonly string[],
  assignment: RosterMovesetAssignment | undefined,
  context: LineupScoringContext,
): {
  coverage: number;
  redundancy: number;
  missingCells: number;
  fingerprint: string;
  audit: TournamentCoverageAudit;
} {
  const common = auditContext(context);
  const team = [...roster].sort();
  const profiles = team.map((id) =>
    memberProfile(id, assignment, context, common),
  );
  const missingCells = profiles.reduce(
    (sum, profile) => sum + profile.missing,
    0,
  );
  const rows = common.threats.map((speciesId, index) => {
    const answers = profiles
      .map((profile, member) => ({ member, quality: profile.quality[index] }))
      .sort((a, b) => b.quality - a.quality || a.member - b.member);
    const first = answers[0];
    const second = answers[1];
    return {
      speciesId,
      index,
      primary: first?.member ?? 0,
      answers: answers.filter((answer) => answer.quality > 0.5).length,
      firstRisk: (1 - (first?.quality ?? 0)) * common.weights[index],
      risk: (1 - (second?.quality ?? 0)) * common.weights[index],
    };
  });
  const gaps = rows
    .toSorted(
      (a, b) =>
        b.risk - a.risk ||
        b.firstRisk - a.firstRisk ||
        a.speciesId.localeCompare(b.speciesId),
    )
    .slice(0, 12);
  const pairs = new Map<string, number>();
  for (const gap of gaps.slice(0, TAIL_SIZE)) {
    // Stress both shared threats and opponents that punish the primary answer.
    const counters = new Set([
      ...gaps.slice(0, TAIL_SIZE).map((row) => row.index),
      ...(profiles[gap.primary]?.counters ?? []),
    ]);
    for (const other of counters) {
      const a = gap.index,
        b = other;
      const enemy = common.threats[b];
      if (
        a === b ||
        (getDexNumber(gap.speciesId) !== undefined &&
          getDexNumber(gap.speciesId) === getDexNumber(enemy)) ||
        !isTeamLegalForFormat([gap.speciesId, enemy], context.formatId)
      )
        continue;
      const key = [a, b].sort((x, y) => x - y).join('|');
      if (pairs.has(key)) continue;
      let quality = 0;
      for (let i = 0; i < profiles.length; i++)
        for (let j = 0; j < profiles.length; j++)
          if (i !== j)
            quality = Math.max(
              quality,
              Math.min(profiles[i].quality[a], profiles[j].quality[b]),
            );
      pairs.set(
        key,
        (1 - quality) * Math.min(common.weights[a], common.weights[b]),
      );
    }
  }
  const pairRisks = [...pairs.values()]
    .sort((a, b) => b - a)
    .slice(0, TAIL_SIZE);
  const pairProtection = pairRisks.length
    ? 1 - pairRisks.reduce((sum, risk) => sum + risk, 0) / pairRisks.length
    : 1;
  const backupCoverage =
    1 -
    worstThreatRisk(
      rows.map((row) => row.risk),
      common.threats,
    );
  const complete = missingCells === 0 && common.threats.length > 0;
  return {
    coverage: complete
      ? 1 -
        worstThreatRisk(
          rows.map((row) => row.firstRisk),
          common.threats,
        )
      : 0,
    redundancy: complete ? Math.min(backupCoverage, pairProtection) : 0,
    missingCells,
    fingerprint: common.fingerprint,
    audit: {
      threatCount: common.threats.length,
      uncoveredCount: rows.filter((row) => row.answers === 0).length,
      singleAnswerCount: rows.filter((row) => row.answers === 1).length,
      evaluatedPairs: pairs.size,
      backupCoverage,
      pairProtection,
      gaps: gaps.map((row) => ({
        speciesId: row.speciesId,
        answers: row.answers,
        primaryAnswer: team[row.primary],
        risk: row.risk,
      })),
    },
  };
}
