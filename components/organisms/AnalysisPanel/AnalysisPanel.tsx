'use client';

import { KeyboardEvent, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import type {
  GenerationAnalysis,
  OptimizerScoreBreakdown,
  OptimizerScoreComponent,
  PokemonContributionRiskTier,
  RecommendedLineup,
  ShieldScenarioKey,
} from '@/lib/types';

interface GeneratedTeamResult {
  team: string[];
  formatId: BattleFormatId;
  recommendedLineups?: RecommendedLineup[];
  scoreBreakdown?: OptimizerScoreBreakdown;
}

interface AnalysisPanelProps {
  generatedTeam: GeneratedTeamResult | null;
  isGenerating: boolean;
  fitness: number | null;
  analysis: GenerationAnalysis | null;
}

interface SummaryMetric {
  label: string;
  value: string;
  description: string;
  status: 'good' | 'average' | 'weak';
  range: string;
}

const ANALYSIS_ACCORDION_SECTIONS = [
  'summaryStatistics',
  'recommendedLineups',
  'optimizerScoreBreakdown',
  'perPokemonContributions',
] as const;

type AnalysisAccordionSectionId = (typeof ANALYSIS_ACCORDION_SECTIONS)[number];

const SHIELD_SCENARIO_ORDER: ShieldScenarioKey[] = ['0-0', '1-1', '2-2'];

const OPTIMIZER_SCORE_COMPONENT_ORDER: OptimizerScoreComponent[] = [
  'synergy',
  'coverage',
  'safety',
  'consistency',
  'bulk',
  'offensiveRatio',
  'defensiveRatio',
  'role',
];

const optimizerScoreComponentDetails: Record<
  OptimizerScoreComponent,
  { label: string; description: string }
> = {
  synergy: {
    label: 'Synergy',
    description:
      'Pick-3 cohesion, complementary typing, and role interaction across the generated team.',
  },
  coverage: {
    label: 'Coverage',
    description:
      'How broadly the roster answers expected threats, weighted toward top-threat matchups.',
  },
  safety: {
    label: 'Safety',
    description:
      'Risk control against no-answer threats, single-answer dependencies, bad leads, and sweep paths.',
  },
  consistency: {
    label: 'Consistency',
    description:
      'Reliability from consistency rankings, shield stability, neutral damage, and low bait dependence.',
  },
  bulk: {
    label: 'Bulk',
    description:
      'Durability from bulk/stat balance so the roster avoids brittle low-bulk compositions.',
  },
  defensiveRatio: {
    label: 'Defensive Ratio',
    description:
      'Resistance versus weakness spread into expected incoming attack types.',
  },
  offensiveRatio: {
    label: 'Offensive Ratio',
    description:
      'Fast and charged move pressure into top-threat and full-meta defenders.',
  },
  role: {
    label: 'Role',
    description:
      'Lineup role fit from lead, switch, closer, charger, attacker, and consistency signals.',
  },
};

type ResourcePathQuality = 'weak' | 'neutral' | 'strong' | 'elite';

function getNormalizedScoreQuality(score: number): ResourcePathQuality {
  return getResourcePathQuality(score);
}

function getResourcePathQuality(score: number): ResourcePathQuality {
  const displayedScore = Number(formatScore(score));

  if (displayedScore >= 0.9) {
    return 'elite';
  }

  if (displayedScore >= 0.75) {
    return 'strong';
  }

  if (displayedScore >= 0.55) {
    return 'neutral';
  }

  return 'weak';
}

function getResourcePathQualityClasses(quality: ResourcePathQuality): string {
  if (quality === 'elite') {
    return 'bg-sky-100 text-sky-800 ring-sky-200 dark:bg-sky-950/70 dark:text-sky-200 dark:ring-sky-800';
  }

  if (quality === 'strong') {
    return 'bg-emerald-100 text-emerald-700 ring-emerald-200 dark:bg-emerald-950/70 dark:text-emerald-200 dark:ring-emerald-800';
  }

  if (quality === 'neutral') {
    return 'bg-amber-100 text-amber-800 ring-amber-200 dark:bg-amber-950/70 dark:text-amber-200 dark:ring-amber-800';
  }

  return 'bg-rose-100 text-rose-700 ring-rose-200 dark:bg-rose-950/70 dark:text-rose-200 dark:ring-rose-800';
}

function getOptimizerScoreMetrics(
  scoreBreakdown: OptimizerScoreBreakdown,
): Array<{
  component: OptimizerScoreComponent;
  label: string;
  value: string;
  quality: ResourcePathQuality;
  description: string;
}> {
  return OPTIMIZER_SCORE_COMPONENT_ORDER.map((component) => {
    const details = optimizerScoreComponentDetails[component];
    const score = scoreBreakdown.components[component];

    return {
      component,
      label: details.label,
      value: formatScore(score),
      quality: getNormalizedScoreQuality(score),
      description: details.description,
    };
  });
}

function formatCoverageRate(value: number): string {
  return `${Math.round(value * 100)}%`;
}

function formatScore(score: number): string {
  return score.toFixed(2);
}

function getOverallFitnessStatus(fitness: number): SummaryMetric['status'] {
  const roundedFitness = roundToHundredths(fitness);
  const thresholds = { good: 0.75, average: 0.55 };

  if (roundedFitness >= thresholds.good) {
    return 'good';
  }

  if (roundedFitness >= thresholds.average) {
    return 'average';
  }

  return 'weak';
}

function getOverallFitnessRange(): string {
  return 'Green >= 0.75, Yellow 0.55-0.74, Red < 0.55';
}

function getPercentStatus(percent: number): SummaryMetric['status'] {
  if (percent >= 70) {
    return 'good';
  }

  if (percent >= 50) {
    return 'average';
  }

  return 'weak';
}

function getRiskStatus(risk: string): SummaryMetric['status'] {
  if (risk === 'Low') {
    return 'good';
  }

  if (risk === 'Moderate') {
    return 'average';
  }

  return 'weak';
}

function formatPercent(value: number): string {
  return `${roundPercent(value)}%`;
}

function roundPercent(value: number): number {
  return Math.round(value);
}

function roundToHundredths(value: number): number {
  return Math.round(value * 100) / 100;
}

function getCoreBreakerRiskLabel(
  coreBreakerCount: number,
  highSeverityCount: number,
): string {
  if (coreBreakerCount === 0) {
    return 'Low';
  }

  if (highSeverityCount >= 2 || coreBreakerCount >= 5) {
    return 'High';
  }

  return 'Moderate';
}

function getValueClasses(status: SummaryMetric['status']): string {
  if (status === 'good') {
    return 'text-emerald-700 dark:text-emerald-300';
  }

  if (status === 'average') {
    return 'text-amber-700 dark:text-amber-300';
  }

  return 'text-rose-700 dark:text-rose-300';
}

function getBadgeClasses(riskTier: PokemonContributionRiskTier): string {
  if (riskTier === 'low') {
    return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950/60 dark:text-emerald-200';
  }

  if (riskTier === 'moderate') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-950/60 dark:text-amber-200';
  }

  return 'bg-rose-100 text-rose-800 dark:bg-rose-950/60 dark:text-rose-200';
}

function formatRiskTier(riskTier: PokemonContributionRiskTier): string {
  if (riskTier === 'moderate') {
    return 'Moderate';
  }

  return riskTier === 'high' ? 'High' : 'Low';
}

function buildSummaryMetrics(
  fitness: number,
  analysis: GenerationAnalysis,
): SummaryMetric[] {
  const evaluatedThreats = analysis.threats.evaluatedCount;
  const coveredThreats = analysis.threats.entries.filter(
    (threat) => threat.teamAnswers > 0,
  ).length;
  const threatHandlingPercent =
    evaluatedThreats > 0 ? (coveredThreats / evaluatedThreats) * 100 : 0;
  const shieldStabilityPercent =
    SHIELD_SCENARIO_ORDER.reduce((sum, scenario) => {
      return sum + analysis.shieldScenarios[scenario].coverageRate * 100;
    }, 0) / SHIELD_SCENARIO_ORDER.length;
  const highSeverityCoreBreakers = analysis.coreBreakers.entries.filter(
    (entry) => entry.severityTier === 'high',
  ).length;
  const coreBreakerRisk = getCoreBreakerRiskLabel(
    analysis.coreBreakers.entries.length,
    highSeverityCoreBreakers,
  );

  const roundedThreatHandlingPercent = roundPercent(threatHandlingPercent);
  const roundedShieldStabilityPercent = roundPercent(shieldStabilityPercent);
  const roundedFitness = roundToHundredths(fitness);

  return [
    {
      label: 'Overall Fitness',
      value: roundedFitness.toFixed(2),
      description:
        'Composite lineup-aware score for the selected format using matchup coverage, role quality, and team stability.',
      status: getOverallFitnessStatus(roundedFitness),
      range: getOverallFitnessRange(),
    },
    {
      label: 'Threat Handling',
      value: `${coveredThreats}/${evaluatedThreats} (${formatPercent(roundedThreatHandlingPercent)})`,
      description:
        'How often the team has at least one practical answer into the evaluated GA threat pool.',
      status: getPercentStatus(roundedThreatHandlingPercent),
      range: 'Green >= 70%, Yellow 50-69%, Red < 50%',
    },
    {
      label: 'Shield Stability',
      value: formatPercent(roundedShieldStabilityPercent),
      description:
        'Average threat coverage across 0-0, 1-1, and 2-2 shield states for the selected format.',
      status: getPercentStatus(roundedShieldStabilityPercent),
      range: 'Green >= 70%, Yellow 50-69%, Red < 50%',
    },
    {
      label: 'Core-Breaker Risk',
      value: coreBreakerRisk,
      description:
        'How vulnerable the team is to threats that overwhelm most team members with limited counterplay.',
      status: getRiskStatus(coreBreakerRisk),
      range: 'Green = Low, Yellow = Moderate, Red = High',
    },
  ];
}

export function AnalysisPanel({
  generatedTeam,
  isGenerating,
  fitness,
  analysis,
}: AnalysisPanelProps) {
  const [expandedSections, setExpandedSections] = useState<
    Record<AnalysisAccordionSectionId, boolean>
  >({
    summaryStatistics: false,
    recommendedLineups: false,
    optimizerScoreBreakdown: false,
    perPokemonContributions: false,
  });
  const accordionButtonRefs = useRef<
    Record<AnalysisAccordionSectionId, HTMLButtonElement | null>
  >({
    summaryStatistics: null,
    recommendedLineups: null,
    optimizerScoreBreakdown: null,
    perPokemonContributions: null,
  });
  const accordionIdPrefix = useId();

  const summaryMetrics =
    analysis !== null && fitness !== null
      ? buildSummaryMetrics(fitness, analysis)
      : [];
  const pokemonEntries = analysis?.pokemonContributions.entries ?? [];
  const recommendedLineups = generatedTeam?.recommendedLineups ?? [];
  const scoreBreakdown = generatedTeam?.scoreBreakdown;
  const optimizerScoreMetrics = scoreBreakdown
    ? getOptimizerScoreMetrics(scoreBreakdown)
    : [];
  const primaryOptimizerScoreMetrics = optimizerScoreMetrics.filter(
    (metric) =>
      metric.component !== 'offensiveRatio' &&
      metric.component !== 'defensiveRatio' &&
      metric.component !== 'role',
  );
  const ratioOptimizerScoreMetrics = optimizerScoreMetrics.filter(
    (metric) =>
      metric.component === 'offensiveRatio' ||
      metric.component === 'defensiveRatio',
  );
  const roleOptimizerScoreMetric = optimizerScoreMetrics.find(
    (metric) => metric.component === 'role',
  );
  const splitCoverageMetrics = recommendedLineups.find(
    (lineup) =>
      lineup.coverageMetrics.topThreatCoverage ||
      lineup.coverageMetrics.fullMetaCoverage,
  )?.coverageMetrics;
  const hasRecommendedLineups = recommendedLineups.length > 0;
  const hasAnalysisDetails = analysis !== null && fitness !== null;
  const visibleAccordionSections = ANALYSIS_ACCORDION_SECTIONS.filter(
    (sectionId) => {
      if (
        sectionId === 'summaryStatistics' ||
        sectionId === 'perPokemonContributions'
      ) {
        return hasAnalysisDetails;
      }

      if (sectionId === 'recommendedLineups') {
        return hasRecommendedLineups;
      }

      return Boolean(scoreBreakdown);
    },
  );

  function toggleSection(sectionId: AnalysisAccordionSectionId): void {
    setExpandedSections((current) => ({
      ...current,
      [sectionId]: !current[sectionId],
    }));
  }

  function focusSection(sectionId: AnalysisAccordionSectionId): void {
    accordionButtonRefs.current[sectionId]?.focus();
  }

  function onAccordionHeaderKeyDown(
    event: KeyboardEvent<HTMLButtonElement>,
    sectionId: AnalysisAccordionSectionId,
  ): void {
    const currentIndex = visibleAccordionSections.indexOf(sectionId);

    if (currentIndex === -1) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = (currentIndex + 1) % visibleAccordionSections.length;
      focusSection(visibleAccordionSections[nextIndex]);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const previousIndex =
        (currentIndex - 1 + visibleAccordionSections.length) %
        visibleAccordionSections.length;
      focusSection(visibleAccordionSections[previousIndex]);
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusSection(visibleAccordionSections[0]);
    }

    if (event.key === 'End') {
      event.preventDefault();
      focusSection(
        visibleAccordionSections[visibleAccordionSections.length - 1],
      );
    }
  }

  const renderOptimizerScoreMetric = (
    metric: (typeof optimizerScoreMetrics)[number],
  ) => {
    const qualityDescriptionId = `${accordionIdPrefix}-${metric.component}-optimizer-quality`;

    return (
      <article
        key={metric.component}
        className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900/60 dark:bg-blue-950/20"
      >
        <div className="flex items-start justify-between gap-2">
          <p
            data-testid="optimizer-score-category-label"
            className="text-xs font-semibold tracking-wide text-blue-700 uppercase dark:text-blue-300"
          >
            {metric.label}
          </p>
          <span
            id={qualityDescriptionId}
            className={clsx(
              'rounded-full px-2 py-0.5 text-xs font-semibold ring-1',
              getResourcePathQualityClasses(metric.quality),
            )}
          >
            {metric.quality}
          </span>
        </div>
        <p
          aria-describedby={qualityDescriptionId}
          className="mt-1 text-lg font-bold text-blue-950 dark:text-blue-50"
        >
          {metric.value}
        </p>
        <p className="mt-1 text-xs leading-5 text-gray-700 dark:text-gray-300">
          {metric.description}
        </p>
      </article>
    );
  };

  return (
    <div
      className={clsx(
        'rounded-2xl border border-blue-200 bg-white p-6 shadow-xl sm:p-8',
        'dark:border-blue-900/60 dark:bg-transparent dark:bg-linear-to-br dark:from-gray-800 dark:to-gray-900',
      )}
    >
      <h2
        className={clsx(
          'mb-2 text-xl font-bold sm:text-2xl',
          'text-blue-950 dark:text-blue-100',
        )}
      >
        Team Analysis Summary
      </h2>

      {!generatedTeam && !isGenerating && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
          Generate a team to inspect analysis.
        </div>
      )}

      {isGenerating && (
        <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-sm text-blue-900 dark:border-blue-900/60 dark:bg-blue-950/30 dark:text-blue-100">
          Analysis updates after the current generation run completes.
        </div>
      )}

      {generatedTeam &&
        (analysis === null || fitness === null) &&
        !isGenerating && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
            Analysis unavailable for this run.
          </div>
        )}

      {generatedTeam &&
        visibleAccordionSections.length > 0 &&
        !isGenerating && (
          <section className="space-y-3" aria-label="Team analysis sections">
            <section aria-label="Team analysis drill-down sections">
              {[
                ...(hasAnalysisDetails
                  ? [
                      {
                        id: 'summaryStatistics' as const,
                        title: 'Summary Statistics',
                        content: (
                          <div className="space-y-3 px-3 pb-3">
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {summaryMetrics.map((metric) => (
                                <article
                                  key={metric.label}
                                  className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900/60 dark:bg-blue-950/20"
                                >
                                  <p className="text-xs font-semibold tracking-wide text-blue-700 uppercase dark:text-blue-300">
                                    {metric.label}
                                  </p>
                                  <p
                                    className={clsx(
                                      'mt-1 text-lg font-bold',
                                      getValueClasses(metric.status),
                                    )}
                                  >
                                    {metric.value}
                                  </p>
                                  <p className="mt-1 text-xs leading-5 text-gray-700 dark:text-gray-300">
                                    {metric.description}
                                  </p>
                                </article>
                              ))}
                            </div>
                            <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/60 dark:bg-blue-950/20">
                              <p className="text-xs font-semibold tracking-wide text-blue-700 uppercase dark:text-blue-300">
                                Expected Ranges
                              </p>
                              <div className="mt-2 space-y-2 text-xs leading-5 text-blue-950 dark:text-blue-100">
                                {summaryMetrics.map((metric) => (
                                  <p key={metric.label}>
                                    <span className="font-semibold">
                                      {metric.label}:
                                    </span>{' '}
                                    {metric.range}
                                  </p>
                                ))}
                              </div>
                            </div>
                          </div>
                        ),
                      },
                    ]
                  : []),
                ...(hasRecommendedLineups
                  ? [
                      {
                        id: 'recommendedLineups' as const,
                        title: 'Recommended Lineups',
                        content: (
                          <div className="space-y-3 px-3 pb-3">
                            {recommendedLineups.map(
                              (recommendedLineup, index) => (
                                <article
                                  key={`${recommendedLineup.lineup.lead}-${recommendedLineup.lineup.switch}-${recommendedLineup.lineup.closer}-${index}`}
                                  className="rounded-lg border border-emerald-100 bg-emerald-50/80 p-3 text-xs text-emerald-950 shadow-sm sm:text-sm dark:border-emerald-900 dark:bg-emerald-950/20 dark:text-emerald-50"
                                >
                                  {recommendedLineups.length > 1 ? (
                                    <h4 className="font-semibold text-emerald-900 dark:text-emerald-100">
                                      Lineup {index + 1}
                                    </h4>
                                  ) : null}
                                  <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                                    <div>
                                      <dt className="font-semibold">Lead</dt>
                                      <dd>{recommendedLineup.lineup.lead}</dd>
                                    </div>
                                    <div>
                                      <dt className="font-semibold">Switch</dt>
                                      <dd>{recommendedLineup.lineup.switch}</dd>
                                    </div>
                                    <div>
                                      <dt className="font-semibold">Closer</dt>
                                      <dd>{recommendedLineup.lineup.closer}</dd>
                                    </div>
                                  </dl>
                                  <div className="mt-3 grid gap-1 text-emerald-900 sm:grid-cols-2 dark:text-emerald-100">
                                    <p>
                                      Structure:{' '}
                                      {recommendedLineup.diagnosticLabel}
                                    </p>
                                    <div>
                                      <p className="font-semibold">
                                        Weaknesses
                                      </p>
                                      {recommendedLineup.weaknesses.length >
                                      0 ? (
                                        <ul
                                          aria-label={`Lineup ${index + 1} weaknesses`}
                                          className="mt-1 list-disc space-y-0.5 pl-5"
                                        >
                                          {recommendedLineup.weaknesses.map(
                                            (weakness) => (
                                              <li key={weakness}>{weakness}</li>
                                            ),
                                          )}
                                        </ul>
                                      ) : (
                                        <p className="mt-1">
                                          No major weaknesses identified
                                        </p>
                                      )}
                                    </div>
                                  </div>
                                </article>
                              ),
                            )}
                          </div>
                        ),
                      },
                    ]
                  : []),
                ...(scoreBreakdown
                  ? [
                      {
                        id: 'optimizerScoreBreakdown' as const,
                        title: 'Optimizer Score Breakdown',
                        content: (
                          <div className="space-y-3 px-3 pb-3">
                            <p className="text-xs leading-5 text-gray-700 dark:text-gray-300">
                              Normalized optimizer categories explain the
                              generated score in priority order. Range labels
                              are shown with colors so category strength is not
                              communicated by color alone.
                            </p>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {primaryOptimizerScoreMetrics.map(
                                renderOptimizerScoreMetric,
                              )}
                            </div>
                            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                              {ratioOptimizerScoreMetrics.map(
                                renderOptimizerScoreMetric,
                              )}
                            </div>
                            {roleOptimizerScoreMetric
                              ? renderOptimizerScoreMetric(
                                  roleOptimizerScoreMetric,
                                )
                              : null}
                            {splitCoverageMetrics?.topThreatCoverage ||
                            splitCoverageMetrics?.fullMetaCoverage ? (
                              <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                                {splitCoverageMetrics.topThreatCoverage ? (
                                  <article className="rounded-lg border border-indigo-200 bg-indigo-50/80 p-3 dark:border-indigo-900/60 dark:bg-indigo-950/25">
                                    <p className="text-xs font-semibold tracking-wide text-indigo-700 uppercase dark:text-indigo-300">
                                      Top-threat coverage
                                    </p>
                                    <p className="mt-1 text-lg font-bold text-indigo-950 dark:text-indigo-100">
                                      {formatCoverageRate(
                                        splitCoverageMetrics.topThreatCoverage
                                          .coverageRate,
                                      )}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-indigo-900 dark:text-indigo-100">
                                      {`${splitCoverageMetrics.topThreatCoverage.noAnswerThreatCount} no-answer, ${splitCoverageMetrics.topThreatCoverage.singleAnswerThreatCount} single-answer risks`}
                                    </p>
                                  </article>
                                ) : null}
                                {splitCoverageMetrics.fullMetaCoverage ? (
                                  <article className="rounded-lg border border-cyan-200 bg-cyan-50/80 p-3 dark:border-cyan-900/60 dark:bg-cyan-950/25">
                                    <p className="text-xs font-semibold tracking-wide text-cyan-700 uppercase dark:text-cyan-300">
                                      Full-meta coverage
                                    </p>
                                    <p className="mt-1 text-lg font-bold text-cyan-950 dark:text-cyan-100">
                                      {formatCoverageRate(
                                        splitCoverageMetrics.fullMetaCoverage
                                          .coverageRate,
                                      )}
                                    </p>
                                    <p className="mt-1 text-xs leading-5 text-cyan-900 dark:text-cyan-100">
                                      {`${splitCoverageMetrics.fullMetaCoverage.noAnswerThreatCount} no-answer, ${splitCoverageMetrics.fullMetaCoverage.singleAnswerThreatCount} single-answer risks`}
                                    </p>
                                  </article>
                                ) : null}
                              </div>
                            ) : null}
                          </div>
                        ),
                      },
                    ]
                  : []),
                ...(hasAnalysisDetails
                  ? [
                      {
                        id: 'perPokemonContributions' as const,
                        title: 'Per-Pokemon Contribution',
                        content: (
                          <div className="space-y-3 px-3 pb-3">
                            {pokemonEntries.map((entry) => (
                              <article
                                key={entry.speciesId}
                                className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900/60 dark:bg-blue-950/20"
                              >
                                <div className="flex flex-wrap items-center justify-between gap-2">
                                  <p className="text-base font-bold text-gray-900 dark:text-gray-100">
                                    {entry.pokemon}
                                  </p>
                                  <span
                                    className={clsx(
                                      'rounded-full px-2 py-1 text-xs font-semibold tracking-wide uppercase',
                                      getBadgeClasses(entry.fragilityRiskTier),
                                    )}
                                  >
                                    {`Replacement Risk: ${formatRiskTier(entry.fragilityRiskTier)}`}
                                  </span>
                                </div>
                                <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                                  <p className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs dark:border-blue-900/60 dark:bg-gray-900/40">
                                    {`Threats Handled: ${entry.threatsHandled}`}
                                  </p>
                                  <p className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs dark:border-blue-900/60 dark:bg-gray-900/40">
                                    {`Coverage Added: ${entry.coverageAdded}`}
                                  </p>
                                  <p className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs dark:border-blue-900/60 dark:bg-gray-900/40">
                                    {`High-Pressure Relief: ${entry.highSeverityRelief}`}
                                  </p>
                                </div>
                              </article>
                            ))}
                          </div>
                        ),
                      },
                    ]
                  : []),
              ].map((section) => (
                <div
                  key={section.id}
                  className="rounded-lg border border-blue-200 bg-white dark:border-blue-900/60 dark:bg-gray-900/40"
                >
                  <h3>
                    <button
                      ref={(buttonElement) => {
                        accordionButtonRefs.current[section.id] = buttonElement;
                      }}
                      type="button"
                      aria-expanded={expandedSections[section.id]}
                      aria-controls={`${accordionIdPrefix}-${section.id}-panel`}
                      id={`${accordionIdPrefix}-${section.id}-trigger`}
                      className="flex w-full items-center justify-between rounded-lg p-3 text-left focus-visible:ring-2 focus-visible:ring-blue-500 focus-visible:ring-offset-2 focus-visible:outline-none"
                      onClick={() => {
                        toggleSection(section.id);
                      }}
                      onKeyDown={(event) => {
                        onAccordionHeaderKeyDown(event, section.id);
                      }}
                    >
                      <span className="text-sm font-semibold tracking-wide text-blue-800 uppercase dark:text-blue-200">
                        {section.title}
                      </span>
                      <span
                        aria-hidden="true"
                        className="text-sm font-semibold text-blue-700 dark:text-blue-300"
                      >
                        {expandedSections[section.id] ? '-' : '+'}
                      </span>
                    </button>
                  </h3>
                  {expandedSections[section.id] && (
                    <div
                      id={`${accordionIdPrefix}-${section.id}-panel`}
                      role="region"
                      aria-labelledby={`${accordionIdPrefix}-${section.id}-trigger`}
                    >
                      {section.content}
                    </div>
                  )}
                </div>
              ))}
            </section>
          </section>
        )}
    </div>
  );
}
