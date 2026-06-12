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

/** Starting normalized optimizer weights from the GBL optimizer model. */
export const OPTIMIZER_SCORE_COMPONENT_WEIGHTS: OptimizerScoreWeights =
  Object.freeze({
    synergy: 0.24,
    coverage: 0.21,
    safety: 0.17,
    consistency: 0.13,
    bulk: 0.1,
    defensiveRatio: 0.07,
    offensiveRatio: 0.05,
    role: 0.03,
  });

/** Strategic scoring hard constraints are limited to validity and legality. */
export const OPTIMIZER_HARD_CONSTRAINT_CATEGORIES: readonly OptimizerHardConstraintCategory[] =
  ['validity', 'legality'];

/** Creates a normalized weighted optimizer score breakdown. */
export function createNormalizedScoreBreakdown(
  components: OptimizerScoreComponents,
  weights: OptimizerScoreWeights = OPTIMIZER_SCORE_COMPONENT_WEIGHTS,
  diagnostics: { threatScore?: OptimizerThreatScore } = {},
): OptimizerScoreBreakdown {
  const normalizedComponents = normalizeScoreComponents(components);

  return {
    components: normalizedComponents,
    weights,
    score: aggregateWeightedScore(normalizedComponents, weights),
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
