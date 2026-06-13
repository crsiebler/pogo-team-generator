'use client';

import { KeyboardEvent, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import type {
  GenerationAnalysis,
  OptimizerScoreBreakdown,
  OptimizerScoreComponent,
  OptimizerThreatScoreEntry,
  PokemonContributionRiskTier,
  RecommendedLineup,
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

const ANALYSIS_ACCORDION_SECTIONS = [
  'summaryStatistics',
  'recommendedLineups',
  'perPokemonContributions',
] as const;

type AnalysisAccordionSectionId = (typeof ANALYSIS_ACCORDION_SECTIONS)[number];

const OPTIMIZER_SCORE_COMPONENT_ORDER: OptimizerScoreComponent[] = [
  'synergy',
  'coverage',
  'safety',
  'consistency',
  'bulk',
  'role',
  'offensiveRatio',
  'defensiveRatio',
];

const MAX_VISIBLE_THREAT_SCORE_ENTRIES = 5;

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

type OptimizerScoreGrade = 'A' | 'B' | 'C' | 'D' | 'F';

type LineupQuality = 'elite' | 'strong' | 'neutral' | 'weak';

type ThreatProfile = 'elite' | 'strong' | 'neutral' | 'weak';

const lineupQualityClasses: Record<LineupQuality, string> = {
  elite:
    'border-violet-200 bg-violet-100 text-violet-800 dark:border-violet-800/60 dark:bg-violet-950/60 dark:text-violet-200',
  strong:
    'border-emerald-200 bg-emerald-100 text-emerald-800 dark:border-emerald-800/60 dark:bg-emerald-950/60 dark:text-emerald-200',
  neutral:
    'border-sky-200 bg-sky-100 text-sky-800 dark:border-sky-800/60 dark:bg-sky-950/60 dark:text-sky-200',
  weak: 'border-amber-200 bg-amber-100 text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/60 dark:text-amber-200',
};

function getLineupQuality(score: number): LineupQuality {
  if (score >= 0.85) {
    return 'elite';
  }

  if (score >= 0.7) {
    return 'strong';
  }

  if (score >= 0.5) {
    return 'neutral';
  }

  return 'weak';
}

function getThreatProfile(score: number): ThreatProfile {
  if (score <= 0.15) {
    return 'elite';
  }

  if (score <= 0.3) {
    return 'strong';
  }

  if (score <= 0.45) {
    return 'neutral';
  }

  return 'weak';
}

function getOptimizerScoreGrade(score: number): OptimizerScoreGrade {
  const displayedScore = Number(formatScore(score));

  if (displayedScore >= 0.9) {
    return 'A';
  }

  if (displayedScore >= 0.75) {
    return 'B';
  }

  if (displayedScore >= 0.55) {
    return 'C';
  }

  if (displayedScore >= 0.4) {
    return 'D';
  }

  return 'F';
}

function getOptimizerScoreMetrics(
  scoreBreakdown: OptimizerScoreBreakdown,
): Array<{
  component: OptimizerScoreComponent;
  label: string;
  value: string;
  description: string;
}> {
  return OPTIMIZER_SCORE_COMPONENT_ORDER.map((component) => {
    const details = optimizerScoreComponentDetails[component];
    const score = scoreBreakdown.components[component];

    return {
      component,
      label: details.label,
      value: getOptimizerScoreGrade(score),
      description: details.description,
    };
  });
}

function formatScore(score: number): string {
  return score.toFixed(2);
}

function formatThreatEntry(threat: OptimizerThreatScoreEntry): string {
  return threat.pokemon;
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
    perPokemonContributions: false,
  });
  const accordionButtonRefs = useRef<
    Record<AnalysisAccordionSectionId, HTMLButtonElement | null>
  >({
    summaryStatistics: null,
    recommendedLineups: null,
    perPokemonContributions: null,
  });
  const accordionIdPrefix = useId();

  const pokemonEntries = analysis?.pokemonContributions.entries ?? [];
  const recommendedLineups = generatedTeam?.recommendedLineups ?? [];
  const scoreBreakdown = generatedTeam?.scoreBreakdown;
  const optimizerScoreMetrics = scoreBreakdown
    ? getOptimizerScoreMetrics(scoreBreakdown)
    : [];
  const primaryOptimizerScoreMetrics = optimizerScoreMetrics.filter(
    (metric) =>
      metric.component !== 'offensiveRatio' &&
      metric.component !== 'defensiveRatio',
  );
  const ratioOptimizerScoreMetrics = optimizerScoreMetrics.filter(
    (metric) =>
      metric.component === 'offensiveRatio' ||
      metric.component === 'defensiveRatio',
  );
  const hasRecommendedLineups = recommendedLineups.length > 0;
  const hasAnalysisDetails = analysis !== null && fitness !== null;
  const visibleAccordionSections = ANALYSIS_ACCORDION_SECTIONS.filter(
    (sectionId) => {
      if (sectionId === 'summaryStatistics') {
        return generatedTeam !== null;
      }

      if (sectionId === 'perPokemonContributions') {
        return hasAnalysisDetails;
      }

      return hasRecommendedLineups;
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
    return (
      <article
        key={metric.component}
        className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 dark:border-blue-900/60 dark:bg-blue-950/20"
      >
        <p
          data-testid="optimizer-score-category-label"
          className="text-xs font-semibold tracking-wide text-blue-700 uppercase dark:text-blue-300"
        >
          {metric.label}
        </p>
        <p className="mt-1 text-lg font-bold text-blue-950 dark:text-blue-50">
          {metric.value}
        </p>
        <p className="mt-1 text-xs leading-5 text-gray-700 dark:text-gray-300">
          {metric.description}
        </p>
      </article>
    );
  };

  const renderThreatScoreList = (
    label: string,
    threats: OptimizerThreatScoreEntry[],
    emptyMessage: string,
  ) => {
    const visibleThreats = threats.slice(0, MAX_VISIBLE_THREAT_SCORE_ENTRIES);

    return (
      <div>
        <p className="text-xs font-semibold tracking-wide text-blue-700 uppercase dark:text-blue-300">
          {label}
        </p>
        {visibleThreats.length > 0 ? (
          <>
            <ul aria-label={label} className="mt-1 list-disc space-y-1 pl-5">
              {visibleThreats.map((threat) => (
                <li key={threat.speciesId}>{formatThreatEntry(threat)}</li>
              ))}
            </ul>
            {threats.length > visibleThreats.length ? (
              <p className="mt-1 text-xs text-gray-600 dark:text-gray-400">
                {`Showing top ${visibleThreats.length} of ${threats.length}`}
              </p>
            ) : null}
          </>
        ) : (
          <p className="mt-1">{emptyMessage}</p>
        )}
      </div>
    );
  };

  const renderThreatScoreCard = (
    threatScore: OptimizerScoreBreakdown['threatScore'],
  ) => {
    if (!threatScore) {
      return null;
    }

    const threatProfile = getThreatProfile(threatScore.score);

    return (
      <article className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-sm text-gray-800 dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-gray-200">
        <p className="text-xs font-semibold tracking-wide text-blue-700 uppercase dark:text-blue-300">
          Threat Score
        </p>
        <p className="mt-1 text-xs leading-5 text-gray-700 dark:text-gray-300">
          Lower is better: this highlights meta threats the team may struggle to
          answer.
        </p>
        <div className="mt-3">
          <span
            aria-label={`Team threat profile: ${threatProfile}`}
            data-testid="threat-profile-pill"
            className={clsx(
              'inline-flex rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide uppercase',
              lineupQualityClasses[threatProfile],
            )}
          >
            {threatProfile}
          </span>
        </div>
        <div className="mt-3 grid grid-cols-1 gap-3 sm:grid-cols-2">
          {renderThreatScoreList(
            'Top Meta Threats',
            threatScore.topMetaThreats,
            'No top meta threats identified',
          )}
          {renderThreatScoreList(
            'Overall Team Threats',
            threatScore.overallTeamThreats,
            'No overall team threats identified',
          )}
        </div>
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
                ...(generatedTeam
                  ? [
                      {
                        id: 'summaryStatistics' as const,
                        title: 'Summary Statistics',
                        content: (
                          <div className="space-y-3 px-3 pb-3">
                            {scoreBreakdown ? (
                              <>
                                <div
                                  data-testid="optimizer-score-primary-grid"
                                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                                >
                                  {primaryOptimizerScoreMetrics.map(
                                    renderOptimizerScoreMetric,
                                  )}
                                </div>
                                <div
                                  data-testid="optimizer-score-ratio-grid"
                                  className="grid grid-cols-1 gap-3 sm:grid-cols-2"
                                >
                                  {ratioOptimizerScoreMetrics.map(
                                    renderOptimizerScoreMetric,
                                  )}
                                </div>
                                {renderThreatScoreCard(
                                  scoreBreakdown.threatScore,
                                )}
                              </>
                            ) : (
                              <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-100">
                                Optimizer scores unavailable for this run.
                              </div>
                            )}
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
                              (recommendedLineup, index) => {
                                const quality = getLineupQuality(
                                  recommendedLineup.score,
                                );

                                return (
                                  <article
                                    key={`${recommendedLineup.lineup.lead}-${recommendedLineup.lineup.switch}-${recommendedLineup.lineup.closer}-${index}`}
                                    className="rounded-lg border border-blue-200 bg-blue-50/70 p-3 text-xs text-gray-800 shadow-sm sm:text-sm dark:border-blue-900/60 dark:bg-blue-950/20 dark:text-gray-200"
                                  >
                                    <div className="flex flex-wrap items-center gap-2">
                                      {recommendedLineups.length > 1 ? (
                                        <h4 className="font-semibold text-blue-900 dark:text-blue-100">
                                          Lineup {index + 1}
                                        </h4>
                                      ) : null}
                                      <span
                                        aria-label={`Lineup quality: ${quality}`}
                                        data-testid="lineup-quality-pill"
                                        className={clsx(
                                          'inline-flex rounded-full border px-2 py-0.5 text-[0.6875rem] font-semibold tracking-wide uppercase',
                                          lineupQualityClasses[quality],
                                        )}
                                      >
                                        {quality}
                                      </span>
                                    </div>
                                    <dl className="mt-2 grid gap-2 sm:grid-cols-3">
                                      <div>
                                        <dt className="font-semibold">Lead</dt>
                                        <dd>{recommendedLineup.lineup.lead}</dd>
                                      </div>
                                      <div>
                                        <dt className="font-semibold">
                                          Switch
                                        </dt>
                                        <dd>
                                          {recommendedLineup.lineup.switch}
                                        </dd>
                                      </div>
                                      <div>
                                        <dt className="font-semibold">
                                          Closer
                                        </dt>
                                        <dd>
                                          {recommendedLineup.lineup.closer}
                                        </dd>
                                      </div>
                                    </dl>
                                    <div className="mt-3 text-gray-800 dark:text-gray-200">
                                      <div>
                                        <p className="font-semibold text-blue-900 dark:text-blue-100">
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
                                                <li key={weakness}>
                                                  {weakness}
                                                </li>
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
                                );
                              },
                            )}
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
                                <div className="space-y-1">
                                  <div data-testid="pokemon-contribution-name-row">
                                    <p className="text-base font-bold text-gray-900 dark:text-gray-100">
                                      {entry.pokemon}
                                    </p>
                                  </div>
                                  <div data-testid="pokemon-contribution-risk-row">
                                    <span
                                      className={clsx(
                                        'inline-flex rounded-full px-2 py-1 text-xs font-semibold tracking-wide uppercase',
                                        getBadgeClasses(
                                          entry.fragilityRiskTier,
                                        ),
                                      )}
                                    >
                                      {`Replacement Risk: ${formatRiskTier(entry.fragilityRiskTier)}`}
                                    </span>
                                  </div>
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
