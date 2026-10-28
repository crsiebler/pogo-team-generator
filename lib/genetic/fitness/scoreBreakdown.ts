import type {
  OptimizerScoreBreakdown,
  OptimizerScoreComponent,
  OptimizerScoreComponents,
  OptimizerThreatScore,
  OptimizerScoreWeights,
} from '@/lib/types';

export type {
  OptimizerScoreBreakdown,
  OptimizerScoreComponent,
  OptimizerScoreComponents,
  OptimizerThreatScore,
  OptimizerScoreWeights,
} from '@/lib/types';

export type OptimizerHardConstraintCategory = 'validity' | 'legality';

/** Relative quality weights, before combining with lower-is-better threat risk. */
export const OPTIMIZER_SCORE_COMPONENT_WEIGHTS: OptimizerScoreWeights =
  Object.freeze({
    synergy: 0.1,
    coverage: 0,
    safety: 0.4,
    consistency: 0.3,
    bulk: 0.2,
    defensiveRatio: 0,
    offensiveRatio: 0,
    role: 0,
  });

/** Share of total fitness awarded for lower normalized threat risk. */
export const OPTIMIZER_THREAT_WEIGHT = 0.5;

/** Strategic scoring hard constraints are limited to validity and legality. */
export const OPTIMIZER_HARD_CONSTRAINT_CATEGORIES: readonly OptimizerHardConstraintCategory[] =
  ['validity', 'legality'];

/** Creates a normalized weighted optimizer score breakdown. */
export function createNormalizedScoreBreakdown(
  components: OptimizerScoreComponents,
  weights: OptimizerScoreWeights = OPTIMIZER_SCORE_COMPONENT_WEIGHTS,
  diagnostics: {
    threatScore?: OptimizerThreatScore;
    threatRisk?: Pick<OptimizerThreatScore, 'score' | 'evaluatedCount'>;
  } = {},
): OptimizerScoreBreakdown {
  const normalizedComponents = normalizeScoreComponents(components);
  const risk = diagnostics.threatRisk ?? diagnostics.threatScore;
  // No evaluated matchups must not be interpreted as a proven zero-risk team.
  const threatContribution = risk
    ? OPTIMIZER_THREAT_WEIGHT *
      (risk.evaluatedCount > 0 && Number.isFinite(risk.score)
        ? 1 - clamp01(risk.score)
        : 0)
    : 0;

  return {
    components: normalizedComponents,
    weights,
    score: clamp01(
      aggregateWeightedScore(normalizedComponents, weights) *
        (risk ? 1 - OPTIMIZER_THREAT_WEIGHT : 1) +
        threatContribution,
    ),
    ...(risk ? { threatContribution } : {}),
    ...(diagnostics.threatScore
      ? { threatScore: diagnostics.threatScore }
      : {}),
  };
}

/** Aggregates normalized score components using weighted addition. */
export function aggregateWeightedScore(
  components: OptimizerScoreComponents,
  weights: OptimizerScoreWeights = OPTIMIZER_SCORE_COMPONENT_WEIGHTS,
): number {
  const normalizedComponents = normalizeScoreComponents(components);

  return clamp01(
    (Object.keys(weights) as OptimizerScoreComponent[]).reduce(
      (score, component) =>
        score + normalizedComponents[component] * weights[component],
      0,
    ),
  );
}

function normalizeScoreComponents(
  components: OptimizerScoreComponents,
): OptimizerScoreComponents {
  return {
    synergy: clamp01(components.synergy),
    coverage: clamp01(components.coverage),
    safety: clamp01(components.safety),
    consistency: clamp01(components.consistency),
    bulk: clamp01(components.bulk),
    defensiveRatio: clamp01(components.defensiveRatio),
    offensiveRatio: clamp01(components.offensiveRatio),
    role: clamp01(components.role),
  };
}

function clamp01(value: number): number {
  if (Number.isNaN(value)) {
    return 0;
  }

  return Math.min(1, Math.max(0, value));
}
