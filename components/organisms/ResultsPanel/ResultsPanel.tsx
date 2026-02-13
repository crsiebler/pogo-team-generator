'use client';

import { KeyboardEvent, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import { TeamDisplay } from '@/components/organisms';
import {
  GenerationAnalysis,
  PokemonContributionRiskTier,
  ShieldScenarioKey,
  TournamentMode,
} from '@/lib/types';

interface ResultsPanelProps {
  generatedTeam: string[] | null;
  mode: TournamentMode;
  isGenerating: boolean;
  fitness: number | null;
  analysis: GenerationAnalysis | null;
}

interface SummaryMetric {
  label: string;
  value: string;
  hint: string;
}

type ContributionImpactDirection = 'Positive' | 'Neutral' | 'Negative';

interface ContributionCategoryMetric {
  label: string;
  impactValue: number;
  definition: string;
}

const ANALYSIS_ACCORDION_SECTIONS = [
  'summaryStatistics',
  'fitnessContributionCategories',
  'perPokemonContributions',
] as const;

type AnalysisAccordionSectionId = (typeof ANALYSIS_ACCORDION_SECTIONS)[number];

const SHIELD_SCENARIO_ORDER: ShieldScenarioKey[] = ['0-0', '1-1', '2-2'];

const getCoreBreakerRiskLabel = (
  coreBreakerCount: number,
  highSeverityCount: number,
): string => {
  if (coreBreakerCount === 0) {
    return 'Low';
  }

  if (highSeverityCount >= 2 || coreBreakerCount >= 5) {
    return 'High';
  }

  return 'Moderate';
};

const formatPercent = (value: number): string => `${Math.round(value)}%`;

const formatImpactValue = (value: number): string =>
  value > 0 ? `+${value}` : `${value}`;

const formatRiskTier = (riskTier: PokemonContributionRiskTier): string => {
  if (riskTier === 'high') {
    return 'High';
  }

  if (riskTier === 'moderate') {
    return 'Moderate';
  }

  return 'Low';
};

const getRiskTierClassName = (
  riskTier: PokemonContributionRiskTier,
): string => {
  if (riskTier === 'high') {
    return 'bg-rose-100 text-rose-800 dark:bg-rose-900/40 dark:text-rose-200';
  }

  if (riskTier === 'moderate') {
    return 'bg-amber-100 text-amber-800 dark:bg-amber-900/40 dark:text-amber-200';
  }

  return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/40 dark:text-emerald-200';
};

const getImpactDirection = (
  impactValue: number,
): ContributionImpactDirection => {
  if (impactValue > 0) {
    return 'Positive';
  }

  if (impactValue < 0) {
    return 'Negative';
  }

  return 'Neutral';
};

const buildSummaryMetrics = (
  fitness: number,
  analysis: GenerationAnalysis,
): SummaryMetric[] => {
  const evaluatedThreats = analysis.threats.evaluatedCount;
  const coveredThreats = analysis.threats.entries.filter(
    (threat) => threat.teamAnswers > 0,
  ).length;

  const threatCoverageRate =
    evaluatedThreats > 0 ? (coveredThreats / evaluatedThreats) * 100 : 0;

  const averageShieldCoverageRate =
    SHIELD_SCENARIO_ORDER.reduce((sum, scenario) => {
      return sum + analysis.shieldScenarios[scenario].coverageRate;
    }, 0) / SHIELD_SCENARIO_ORDER.length;

  const highSeverityCoreBreakers = analysis.coreBreakers.entries.filter(
    (entry) => entry.severityTier === 'high',
  ).length;

  return [
    {
      label: 'Overall Fitness',
      value: fitness.toFixed(1),
      hint: 'Composite team score from the selected generation algorithm.',
    },
    {
      label: 'Threat Handling',
      value: `${coveredThreats}/${evaluatedThreats} (${formatPercent(threatCoverageRate)})`,
      hint: 'How many ranked threats have at least one practical team answer.',
    },
    {
      label: 'Shield Stability',
      value: formatPercent(averageShieldCoverageRate),
      hint: 'Average threat coverage across 0-0, 1-1, and 2-2 shield states.',
    },
    {
      label: 'Core-Breaker Risk',
      value: getCoreBreakerRiskLabel(
        analysis.coreBreakers.entries.length,
        highSeverityCoreBreakers,
      ),
      hint: 'Higher risk means more threats can overwhelm most team members.',
    },
  ];
};

const buildContributionCategoryMetrics = (
  analysis: GenerationAnalysis,
): ContributionCategoryMetric[] => {
  const evaluatedThreats = analysis.threats.evaluatedCount;
  const coveredThreats = analysis.threats.entries.filter(
    (threat) => threat.teamAnswers > 0,
  ).length;

  const threatCoverageRate =
    evaluatedThreats > 0 ? (coveredThreats / evaluatedThreats) * 100 : 0;

  const averageShieldCoverageRate =
    SHIELD_SCENARIO_ORDER.reduce((sum, scenario) => {
      return sum + analysis.shieldScenarios[scenario].coverageRate;
    }, 0) / SHIELD_SCENARIO_ORDER.length;

  const coreBreakerExposureRate =
    evaluatedThreats > 0
      ? (analysis.coreBreakers.entries.length / evaluatedThreats) * 100
      : 0;

  return [
    {
      label: 'Meta Coverage',
      impactValue: Math.round(threatCoverageRate - 50),
      definition:
        'Meta Coverage: how consistently the team has at least one answer into ranked threats.',
    },
    {
      label: 'Shield Reliability',
      impactValue: Math.round(averageShieldCoverageRate - 50),
      definition:
        'Shield Reliability: how stable the team remains across 0-0, 1-1, and 2-2 shield states.',
    },
    {
      label: 'Core Stability',
      impactValue: -Math.round(coreBreakerExposureRate),
      definition:
        'Core Stability: how often ranked threats can pressure most team members with limited counterplay.',
    },
  ];
};

export function ResultsPanel({
  generatedTeam,
  mode,
  isGenerating,
  fitness,
  analysis,
}: ResultsPanelProps) {
  const summaryMetrics =
    fitness !== null && analysis !== null
      ? buildSummaryMetrics(fitness, analysis)
      : [];

  const contributionCategoryMetrics =
    analysis !== null ? buildContributionCategoryMetrics(analysis) : [];

  const pokemonContributionEntries =
    analysis?.pokemonContributions.entries ?? [];

  const [expandedSections, setExpandedSections] = useState<
    Record<AnalysisAccordionSectionId, boolean>
  >({
    summaryStatistics: false,
    fitnessContributionCategories: false,
    perPokemonContributions: false,
  });

  const accordionButtonRefs = useRef<
    Record<AnalysisAccordionSectionId, HTMLButtonElement | null>
  >({
    summaryStatistics: null,
    fitnessContributionCategories: null,
    perPokemonContributions: null,
  });

  const accordionIdPrefix = useId();

  const toggleAccordionSection = (
    sectionId: AnalysisAccordionSectionId,
  ): void => {
    setExpandedSections((currentSections) => ({
      ...currentSections,
      [sectionId]: !currentSections[sectionId],
    }));
  };

  const focusAccordionSection = (
    sectionId: AnalysisAccordionSectionId,
  ): void => {
    accordionButtonRefs.current[sectionId]?.focus();
  };

  const onAccordionHeaderKeyDown = (
    event: KeyboardEvent<HTMLButtonElement>,
    sectionId: AnalysisAccordionSectionId,
  ): void => {
    const currentIndex = ANALYSIS_ACCORDION_SECTIONS.indexOf(sectionId);

    if (currentIndex === -1) {
      return;
    }

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = (currentIndex + 1) % ANALYSIS_ACCORDION_SECTIONS.length;
      focusAccordionSection(ANALYSIS_ACCORDION_SECTIONS[nextIndex]);
      return;
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const previousIndex =
        (currentIndex - 1 + ANALYSIS_ACCORDION_SECTIONS.length) %
        ANALYSIS_ACCORDION_SECTIONS.length;
      focusAccordionSection(ANALYSIS_ACCORDION_SECTIONS[previousIndex]);
      return;
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusAccordionSection(ANALYSIS_ACCORDION_SECTIONS[0]);
      return;
    }

    if (event.key === 'End') {
      event.preventDefault();
      focusAccordionSection(
        ANALYSIS_ACCORDION_SECTIONS[ANALYSIS_ACCORDION_SECTIONS.length - 1],
      );
    }
  };

  return (
    <div
      className={clsx(
        'rounded-2xl bg-white p-6 shadow-xl sm:p-8',
        'dark:bg-transparent dark:bg-gradient-to-br dark:from-gray-800 dark:to-gray-900',
      )}
    >
      <h2
        className={clsx(
          'mb-6 text-xl font-bold sm:text-2xl',
          'text-gray-950 dark:text-gray-100',
        )}
      >
        Generated Team
      </h2>

      {!generatedTeam && !isGenerating && (
        <div
          className={clsx(
            'flex h-64 items-center justify-center sm:h-96',
            'text-gray-600 dark:text-gray-500',
          )}
        >
          <div className="text-center">
            <svg
              className="mx-auto mb-4 h-16 w-16 opacity-50 sm:h-24 sm:w-24"
              fill="none"
              viewBox="0 0 24 24"
              stroke="currentColor"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"
              />
            </svg>
            <p className="text-base font-medium sm:text-lg">
              No team generated yet
            </p>
            <p className="mt-2 text-xs sm:text-sm">
              Configure your settings and click Generate
            </p>
          </div>
        </div>
      )}

      {isGenerating && (
        <div className="flex h-64 items-center justify-center sm:h-96">
          <div className="text-center">
            <svg
              className="mx-auto mb-4 h-12 w-12 animate-spin text-blue-600 sm:h-16 sm:w-16 dark:text-blue-400"
              viewBox="0 0 24 24"
            >
              <circle
                className="opacity-25"
                cx="12"
                cy="12"
                r="10"
                stroke="currentColor"
                strokeWidth="4"
                fill="none"
              />
              <path
                className="opacity-75"
                fill="currentColor"
                d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
              />
            </svg>
            <p
              className={clsx(
                'text-base font-medium sm:text-lg',
                'text-gray-900 dark:text-gray-300',
              )}
            >
              Running genetic algorithm...
            </p>
            <p
              className={clsx(
                'mt-2 text-xs sm:text-sm',
                'text-gray-600 dark:text-gray-400',
              )}
            >
              This may take 10-30 seconds
            </p>
          </div>
        </div>
      )}

      {generatedTeam && (
        <div className="space-y-4 sm:space-y-6">
          {summaryMetrics.length > 0 && (
            <section
              aria-labelledby="analysis-summary-heading"
              className={clsx(
                'rounded-xl border border-emerald-200 bg-emerald-50/70 p-4',
                'dark:border-emerald-700 dark:bg-emerald-900/20',
              )}
            >
              <h3
                id="analysis-summary-heading"
                className={clsx(
                  'text-sm font-bold tracking-wide sm:text-base',
                  'text-emerald-900 dark:text-emerald-100',
                )}
              >
                Team Analysis Summary
              </h3>
              <p
                className={clsx(
                  'mt-1 text-xs sm:text-sm',
                  'text-emerald-800/90 dark:text-emerald-100/80',
                )}
              >
                Snapshot metrics for quick go/no-go decisions. Values are
                normalized for both individual and team synergy generation
                modes.
              </p>
              <div
                className={clsx(
                  'mt-4 rounded-md border border-emerald-300 bg-emerald-100/80 p-3',
                  'dark:border-emerald-700 dark:bg-emerald-900/30',
                )}
              >
                <p
                  className={clsx(
                    'text-xs font-semibold tracking-wide uppercase',
                    'text-emerald-800 dark:text-emerald-200',
                  )}
                >
                  Analysis Sections
                </p>
                <p
                  className={clsx(
                    'mt-1 text-xs leading-5 sm:text-sm',
                    'text-emerald-900 dark:text-emerald-100/90',
                  )}
                >
                  Open each section for details. All sections start collapsed by
                  default so you can scan first and drill down only where
                  needed.
                </p>
              </div>

              <section
                aria-label="Team analysis drill-down sections"
                className="mt-4 space-y-3"
              >
                <div
                  className={clsx(
                    'rounded-lg border border-emerald-200 bg-white',
                    'dark:border-emerald-700 dark:bg-gray-900/40',
                  )}
                >
                  <h4>
                    <button
                      ref={(buttonElement) => {
                        accordionButtonRefs.current.summaryStatistics =
                          buttonElement;
                      }}
                      type="button"
                      aria-expanded={expandedSections.summaryStatistics}
                      aria-controls={`${accordionIdPrefix}-summary-statistics-panel`}
                      id={`${accordionIdPrefix}-summary-statistics-trigger`}
                      className={clsx(
                        'flex w-full items-center justify-between rounded-lg p-3 text-left',
                        'focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none',
                      )}
                      onClick={() => {
                        toggleAccordionSection('summaryStatistics');
                      }}
                      onKeyDown={(event) => {
                        onAccordionHeaderKeyDown(event, 'summaryStatistics');
                      }}
                    >
                      <span
                        className={clsx(
                          'text-xs font-semibold tracking-wide uppercase sm:text-sm',
                          'text-emerald-800 dark:text-emerald-200',
                        )}
                      >
                        Summary Statistics
                      </span>
                      <span
                        aria-hidden="true"
                        className={clsx(
                          'text-sm font-semibold',
                          'text-emerald-700 dark:text-emerald-300',
                        )}
                      >
                        {expandedSections.summaryStatistics ? '-' : '+'}
                      </span>
                    </button>
                  </h4>

                  {expandedSections.summaryStatistics && (
                    <div
                      id={`${accordionIdPrefix}-summary-statistics-panel`}
                      role="region"
                      aria-labelledby={`${accordionIdPrefix}-summary-statistics-trigger`}
                      className="px-3 pb-3"
                    >
                      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                        {summaryMetrics.map((metric) => (
                          <article
                            key={metric.label}
                            className={clsx(
                              'rounded-lg border border-emerald-200 bg-emerald-50/70 p-3',
                              'dark:border-emerald-700 dark:bg-emerald-900/20',
                            )}
                          >
                            <p
                              className={clsx(
                                'text-xs font-semibold tracking-wide uppercase',
                                'text-emerald-700 dark:text-emerald-300',
                              )}
                            >
                              {metric.label}
                            </p>
                            <p
                              className={clsx(
                                'mt-1 text-base font-bold sm:text-lg',
                                'text-gray-900 dark:text-gray-100',
                              )}
                            >
                              {metric.value}
                            </p>
                            <p
                              className={clsx(
                                'mt-1 text-xs leading-5',
                                'text-gray-700 dark:text-gray-300',
                              )}
                            >
                              {metric.hint}
                            </p>
                          </article>
                        ))}
                      </div>

                      <div
                        className={clsx(
                          'mt-3 rounded-md border border-emerald-300 bg-emerald-100/80 p-2',
                          'dark:border-emerald-700 dark:bg-emerald-900/30',
                        )}
                      >
                        <p
                          className={clsx(
                            'text-xs font-semibold tracking-wide uppercase',
                            'text-emerald-800 dark:text-emerald-200',
                          )}
                        >
                          Legend
                        </p>
                        <p
                          className={clsx(
                            'mt-1 text-xs leading-5 sm:text-sm',
                            'text-emerald-900 dark:text-emerald-100/90',
                          )}
                        >
                          Overall Fitness ranks total team quality, Threat
                          Handling tracks coverage of ranked meta threats,
                          Shield Stability shows consistency across standard
                          shield states, and Core-Breaker Risk highlights
                          collapse-prone matchups.
                        </p>
                      </div>
                    </div>
                  )}
                </div>

                <div
                  className={clsx(
                    'rounded-lg border border-emerald-200 bg-white',
                    'dark:border-emerald-700 dark:bg-gray-900/40',
                  )}
                >
                  <h4>
                    <button
                      ref={(buttonElement) => {
                        accordionButtonRefs.current.fitnessContributionCategories =
                          buttonElement;
                      }}
                      type="button"
                      aria-expanded={
                        expandedSections.fitnessContributionCategories
                      }
                      aria-controls={`${accordionIdPrefix}-fitness-contribution-panel`}
                      id={`${accordionIdPrefix}-fitness-contribution-trigger`}
                      className={clsx(
                        'flex w-full items-center justify-between rounded-lg p-3 text-left',
                        'focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none',
                      )}
                      onClick={() => {
                        toggleAccordionSection('fitnessContributionCategories');
                      }}
                      onKeyDown={(event) => {
                        onAccordionHeaderKeyDown(
                          event,
                          'fitnessContributionCategories',
                        );
                      }}
                    >
                      <span
                        className={clsx(
                          'text-xs font-semibold tracking-wide uppercase sm:text-sm',
                          'text-emerald-800 dark:text-emerald-200',
                        )}
                      >
                        Fitness Contribution Categories
                      </span>
                      <span
                        aria-hidden="true"
                        className={clsx(
                          'text-sm font-semibold',
                          'text-emerald-700 dark:text-emerald-300',
                        )}
                      >
                        {expandedSections.fitnessContributionCategories
                          ? '-'
                          : '+'}
                      </span>
                    </button>
                  </h4>

                  {expandedSections.fitnessContributionCategories && (
                    <div
                      id={`${accordionIdPrefix}-fitness-contribution-panel`}
                      role="region"
                      aria-labelledby={`${accordionIdPrefix}-fitness-contribution-trigger`}
                      className="px-3 pb-3"
                    >
                      <div className="grid grid-cols-1 gap-2 sm:grid-cols-3">
                        {contributionCategoryMetrics.map((category) => {
                          const impactDirection = getImpactDirection(
                            category.impactValue,
                          );

                          return (
                            <article
                              key={category.label}
                              className={clsx(
                                'rounded-md border p-2',
                                'border-emerald-200 bg-emerald-50/70',
                                'dark:border-emerald-700 dark:bg-emerald-900/20',
                              )}
                            >
                              <p
                                className={clsx(
                                  'text-xs font-semibold tracking-wide uppercase',
                                  'text-emerald-800 dark:text-emerald-200',
                                )}
                              >
                                {category.label}
                              </p>
                              <p
                                className={clsx(
                                  'mt-1 text-sm font-bold sm:text-base',
                                  'text-gray-900 dark:text-gray-100',
                                )}
                              >
                                {formatImpactValue(category.impactValue)}
                              </p>
                              <p
                                className={clsx(
                                  'text-xs font-medium',
                                  'text-gray-700 dark:text-gray-300',
                                )}
                              >
                                {impactDirection}
                              </p>
                            </article>
                          );
                        })}
                      </div>
                      <div
                        className={clsx(
                          'mt-3 rounded-md border border-emerald-300 bg-emerald-100/80 p-2',
                          'dark:border-emerald-700 dark:bg-emerald-900/30',
                        )}
                      >
                        <p
                          className={clsx(
                            'text-xs font-semibold tracking-wide uppercase',
                            'text-emerald-800 dark:text-emerald-200',
                          )}
                        >
                          Category Definitions
                        </p>
                        <div className="mt-1 space-y-1">
                          {contributionCategoryMetrics.map((category) => (
                            <p
                              key={category.label}
                              className={clsx(
                                'text-xs leading-5 sm:text-sm',
                                'text-emerald-900 dark:text-emerald-100/90',
                              )}
                            >
                              {category.definition}
                            </p>
                          ))}
                        </div>
                      </div>
                    </div>
                  )}
                </div>

                <div
                  className={clsx(
                    'rounded-lg border border-emerald-200 bg-white',
                    'dark:border-emerald-700 dark:bg-gray-900/40',
                  )}
                >
                  <h4>
                    <button
                      ref={(buttonElement) => {
                        accordionButtonRefs.current.perPokemonContributions =
                          buttonElement;
                      }}
                      type="button"
                      aria-expanded={expandedSections.perPokemonContributions}
                      aria-controls={`${accordionIdPrefix}-pokemon-contribution-panel`}
                      id={`${accordionIdPrefix}-pokemon-contribution-trigger`}
                      className={clsx(
                        'flex w-full items-center justify-between rounded-lg p-3 text-left',
                        'focus-visible:ring-2 focus-visible:ring-emerald-500 focus-visible:ring-offset-2 focus-visible:outline-none',
                      )}
                      onClick={() => {
                        toggleAccordionSection('perPokemonContributions');
                      }}
                      onKeyDown={(event) => {
                        onAccordionHeaderKeyDown(
                          event,
                          'perPokemonContributions',
                        );
                      }}
                    >
                      <span
                        className={clsx(
                          'text-xs font-semibold tracking-wide uppercase sm:text-sm',
                          'text-emerald-800 dark:text-emerald-200',
                        )}
                      >
                        Per-Pokemon Contribution
                      </span>
                      <span
                        aria-hidden="true"
                        className={clsx(
                          'text-sm font-semibold',
                          'text-emerald-700 dark:text-emerald-300',
                        )}
                      >
                        {expandedSections.perPokemonContributions ? '-' : '+'}
                      </span>
                    </button>
                  </h4>

                  {expandedSections.perPokemonContributions && (
                    <div
                      id={`${accordionIdPrefix}-pokemon-contribution-panel`}
                      role="region"
                      aria-labelledby={`${accordionIdPrefix}-pokemon-contribution-trigger`}
                      className="space-y-3 px-3 pb-3"
                    >
                      <p
                        className={clsx(
                          'text-xs leading-5 sm:text-sm',
                          'text-gray-700 dark:text-gray-300',
                        )}
                      >
                        Review each team member&apos;s direct coverage, unique
                        threat answers, and replacement fragility before making
                        swaps.
                      </p>

                      <div className="space-y-2">
                        {pokemonContributionEntries.map((entry) => (
                          <article
                            key={entry.speciesId}
                            className={clsx(
                              'rounded-md border border-emerald-200 bg-emerald-50/70 p-3',
                              'dark:border-emerald-700 dark:bg-emerald-900/20',
                            )}
                          >
                            <div className="flex flex-wrap items-center justify-between gap-2">
                              <p
                                className={clsx(
                                  'text-sm font-bold sm:text-base',
                                  'text-gray-900 dark:text-gray-100',
                                )}
                              >
                                {entry.pokemon}
                              </p>
                              <span
                                className={clsx(
                                  'rounded-full px-2 py-1 text-xs font-semibold tracking-wide uppercase',
                                  getRiskTierClassName(entry.fragilityRiskTier),
                                )}
                              >
                                {`Replacement Risk: ${formatRiskTier(entry.fragilityRiskTier)}`}
                              </span>
                            </div>

                            <div className="mt-2 grid grid-cols-1 gap-2 sm:grid-cols-3">
                              <p
                                className={clsx(
                                  'rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs',
                                  'text-gray-800 dark:border-emerald-700 dark:bg-gray-900/40 dark:text-gray-200',
                                )}
                              >
                                Threats Handled: {entry.threatsHandled}
                              </p>
                              <p
                                className={clsx(
                                  'rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs',
                                  'text-gray-800 dark:border-emerald-700 dark:bg-gray-900/40 dark:text-gray-200',
                                )}
                              >
                                Coverage Added: {entry.coverageAdded}
                              </p>
                              <p
                                className={clsx(
                                  'rounded-md border border-emerald-200 bg-white px-2 py-1 text-xs',
                                  'text-gray-800 dark:border-emerald-700 dark:bg-gray-900/40 dark:text-gray-200',
                                )}
                              >
                                High-Pressure Relief: {entry.highSeverityRelief}
                              </p>
                            </div>

                            <p
                              className={clsx(
                                'mt-2 text-xs leading-5 sm:text-sm',
                                'text-emerald-900 dark:text-emerald-100/90',
                              )}
                            >
                              {entry.rationale}
                            </p>
                          </article>
                        ))}
                      </div>
                    </div>
                  )}
                </div>
              </section>
            </section>
          )}

          <TeamDisplay team={generatedTeam} mode={mode} />
        </div>
      )}
    </div>
  );
}
