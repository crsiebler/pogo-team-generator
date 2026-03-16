'use client';

import { KeyboardEvent, useId, useRef, useState } from 'react';
import clsx from 'clsx';
import type { BattleFormatId } from '@/lib/data/battleFormats';
import type {
  FitnessAlgorithm,
  GenerationAnalysis,
  PokemonContributionRiskTier,
  ShieldScenarioKey,
} from '@/lib/types';

interface GeneratedTeamResult {
  team: string[];
  formatId: BattleFormatId;
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

interface CategoryMetric {
  label: string;
  value: string;
  description: string;
  range: string;
  status: 'good' | 'average' | 'weak';
}

const ANALYSIS_ACCORDION_SECTIONS = [
  'summaryStatistics',
  'fitnessContributionCategories',
  'perPokemonContributions',
] as const;

type AnalysisAccordionSectionId = (typeof ANALYSIS_ACCORDION_SECTIONS)[number];

const SHIELD_SCENARIO_ORDER: ShieldScenarioKey[] = ['0-0', '1-1', '2-2'];

function getOverallFitnessStatus(
  fitness: number,
  algorithm: FitnessAlgorithm,
): SummaryMetric['status'] {
  const roundedFitness = roundToHundredths(fitness);
  const thresholds =
    algorithm === 'teamSynergy'
      ? { good: 0.75, average: 0.55 }
      : { good: 0.9, average: 0.65 };

  if (roundedFitness >= thresholds.good) {
    return 'good';
  }

  if (roundedFitness >= thresholds.average) {
    return 'average';
  }

  return 'weak';
}

function getOverallFitnessRange(algorithm: FitnessAlgorithm): string {
  return algorithm === 'teamSynergy'
    ? 'Green >= 0.75, Yellow 0.55-0.74, Red < 0.55'
    : 'Green >= 0.90, Yellow 0.65-0.89, Red < 0.65';
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

function getContributionStatus(value: number): CategoryMetric['status'] {
  if (value >= 10) {
    return 'good';
  }

  if (value > -10) {
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

function formatImpactValue(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
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

function getRelativeMetricStatus(
  value: number,
  maxValue: number,
): SummaryMetric['status'] {
  if (maxValue <= 0) {
    return 'average';
  }

  const ratio = value / maxValue;
  if (ratio >= 0.67) {
    return 'good';
  }

  if (ratio >= 0.34) {
    return 'average';
  }

  return 'weak';
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
        'Composite algorithm score for the selected format. Bands are normalized by algorithm family because raw fitness varies by strategy model.',
      status: getOverallFitnessStatus(roundedFitness, analysis.algorithm),
      range: getOverallFitnessRange(analysis.algorithm),
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

function buildContributionMetrics(
  analysis: GenerationAnalysis,
): CategoryMetric[] {
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
  const coreBreakerExposurePercent =
    evaluatedThreats > 0
      ? (analysis.coreBreakers.entries.length / evaluatedThreats) * 100
      : 0;
  const categoryValues = [
    {
      label: 'Meta Coverage',
      rawValue: Math.round(threatHandlingPercent - 50),
      description:
        'How consistently the team has at least one answer into the role-based threat field.',
    },
    {
      label: 'Shield Reliability',
      rawValue: Math.round(shieldStabilityPercent - 50),
      description: 'How stable the team remains across common shield states.',
    },
    {
      label: 'Core Stability',
      rawValue: -Math.round(coreBreakerExposurePercent),
      description:
        'How well the team avoids collapse-prone matchups that pressure most slots at once.',
    },
  ];

  return categoryValues.map((metric) => ({
    label: metric.label,
    value: formatImpactValue(metric.rawValue),
    description: metric.description,
    range: 'Green >= +10, Yellow -9 to +9, Red <= -10',
    status: getContributionStatus(metric.rawValue),
  }));
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

  const summaryMetrics =
    analysis !== null && fitness !== null
      ? buildSummaryMetrics(fitness, analysis)
      : [];
  const contributionMetrics =
    analysis !== null ? buildContributionMetrics(analysis) : [];
  const pokemonEntries = analysis?.pokemonContributions.entries ?? [];
  const maxThreatsHandled = Math.max(
    ...pokemonEntries.map((entry) => entry.threatsHandled),
    0,
  );
  const maxCoverageAdded = Math.max(
    ...pokemonEntries.map((entry) => entry.coverageAdded),
    0,
  );
  const maxHighSeverityRelief = Math.max(
    ...pokemonEntries.map((entry) => entry.highSeverityRelief),
    0,
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
    const currentIndex = ANALYSIS_ACCORDION_SECTIONS.indexOf(sectionId);

    if (event.key === 'ArrowDown') {
      event.preventDefault();
      const nextIndex = (currentIndex + 1) % ANALYSIS_ACCORDION_SECTIONS.length;
      focusSection(ANALYSIS_ACCORDION_SECTIONS[nextIndex]);
    }

    if (event.key === 'ArrowUp') {
      event.preventDefault();
      const previousIndex =
        (currentIndex - 1 + ANALYSIS_ACCORDION_SECTIONS.length) %
        ANALYSIS_ACCORDION_SECTIONS.length;
      focusSection(ANALYSIS_ACCORDION_SECTIONS[previousIndex]);
    }

    if (event.key === 'Home') {
      event.preventDefault();
      focusSection(ANALYSIS_ACCORDION_SECTIONS[0]);
    }

    if (event.key === 'End') {
      event.preventDefault();
      focusSection(
        ANALYSIS_ACCORDION_SECTIONS[ANALYSIS_ACCORDION_SECTIONS.length - 1],
      );
    }
  }

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

      {generatedTeam && analysis !== null && fitness !== null && (
        <section
          className="space-y-3"
          aria-label="Team analysis drill-down sections"
        >
          {[
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
                          <span className="font-semibold">{metric.label}:</span>{' '}
                          {metric.range}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ),
            },
            {
              id: 'fitnessContributionCategories' as const,
              title: 'Fitness Contribution Categories',
              content: (
                <div className="space-y-3 px-3 pb-3">
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                    {contributionMetrics.map((metric) => (
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
                      Expected contribution bands
                    </p>
                    <div className="mt-2 space-y-2 text-xs leading-5 text-blue-950 dark:text-blue-100">
                      {contributionMetrics.map((metric) => (
                        <p key={metric.label}>
                          <span className="font-semibold">{metric.label}:</span>{' '}
                          {metric.range}
                        </p>
                      ))}
                    </div>
                  </div>
                </div>
              ),
            },
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
                          <span
                            className={getValueClasses(
                              getRelativeMetricStatus(
                                entry.threatsHandled,
                                maxThreatsHandled,
                              ),
                            )}
                          >
                            {`Threats Handled: ${entry.threatsHandled}`}
                          </span>
                        </p>
                        <p className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs dark:border-blue-900/60 dark:bg-gray-900/40">
                          <span
                            className={getValueClasses(
                              getRelativeMetricStatus(
                                entry.coverageAdded,
                                maxCoverageAdded,
                              ),
                            )}
                          >
                            {`Coverage Added: ${entry.coverageAdded}`}
                          </span>
                        </p>
                        <p className="rounded-md border border-blue-200 bg-white px-2 py-1 text-xs dark:border-blue-900/60 dark:bg-gray-900/40">
                          <span
                            className={getValueClasses(
                              getRelativeMetricStatus(
                                entry.highSeverityRelief,
                                maxHighSeverityRelief,
                              ),
                            )}
                          >
                            {`High-Pressure Relief: ${entry.highSeverityRelief}`}
                          </span>
                        </p>
                      </div>
                      <p className="mt-2 text-xs leading-5 text-gray-700 dark:text-gray-300">
                        {entry.rationale}
                      </p>
                    </article>
                  ))}
                  <div className="rounded-lg border border-blue-200 bg-blue-50 p-3 dark:border-blue-900/60 dark:bg-blue-950/20">
                    <p className="text-xs font-semibold tracking-wide text-blue-700 uppercase dark:text-blue-300">
                      Relative grading guide
                    </p>
                    <p className="mt-2 text-xs leading-5 text-blue-950 dark:text-blue-100">
                      Green marks values near the strongest contributor on this
                      team, yellow marks middle-of-team support, and red marks
                      low relative contribution for the current lineup.
                      Replacement risk uses Low / Moderate / High bands
                      directly.
                    </p>
                  </div>
                </div>
              ),
            },
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
      )}
    </div>
  );
}
