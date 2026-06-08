import { fireEvent, render, screen, within } from '@testing-library/react';
import { AnalysisPanel } from './AnalysisPanel';
import type {
  GenerationAnalysis,
  OptimizerScoreBreakdown,
  RecommendedLineup,
} from '@/lib/types';

const analysisFixture: GenerationAnalysis = {
  mode: 'GBL',
  teamSize: 3,
  generatedAt: '2026-03-15T00:00:00.000Z',
  threats: {
    evaluatedCount: 100,
    entries: [
      {
        speciesId: 'azumarill',
        pokemon: 'Azumarill',
        rank: 1,
        teamAnswers: 1,
        severityTier: 'critical',
      },
      {
        speciesId: 'feraligatr',
        pokemon: 'Feraligatr',
        rank: 2,
        teamAnswers: 0,
        severityTier: 'high',
      },
      {
        speciesId: 'gastrodon',
        pokemon: 'Gastrodon',
        rank: 3,
        teamAnswers: 2,
        severityTier: 'medium',
      },
      {
        speciesId: 'venusaur',
        pokemon: 'Venusaur',
        rank: 4,
        teamAnswers: 0,
        severityTier: 'medium',
      },
    ],
  },
  coreBreakers: {
    threshold: 1,
    entries: [
      {
        pokemon: 'Feraligatr',
        rank: 2,
        teamAnswers: 0,
        severityTier: 'high',
      },
    ],
  },
  shieldScenarios: {
    '0-0': {
      coveredThreats: 72,
      evaluatedThreats: 100,
      coverageRate: 0.72,
    },
    '1-1': {
      coveredThreats: 64,
      evaluatedThreats: 100,
      coverageRate: 0.64,
    },
    '2-2': {
      coveredThreats: 49,
      evaluatedThreats: 100,
      coverageRate: 0.49,
    },
  },
  pokemonContributions: {
    entries: [
      {
        speciesId: 'azumarill',
        pokemon: 'Azumarill',
        threatsHandled: 19,
        coverageAdded: 6,
        highSeverityRelief: 7,
        fragilityRiskTier: 'high',
      },
      {
        speciesId: 'gastrodon',
        pokemon: 'Gastrodon',
        threatsHandled: 14,
        coverageAdded: 2,
        highSeverityRelief: 4,
        fragilityRiskTier: 'low',
      },
    ],
  },
};

describe('AnalysisPanel', () => {
  const recommendedLineups: RecommendedLineup[] = [
    {
      lineup: {
        lead: 'azumarill',
        switch: 'skarmory',
        closer: 'registeel',
      },
      score: 0.87,
      coverageMetrics: {
        coverageRate: 0.74,
        dominatingMatchupCount: 8,
        overwhelmingLossCount: 2,
        singleAnswerThreatCount: 1,
      },
      coveredThreats: ['lanturn'],
      weaknesses: ['Venusaur'],
      diagnosticLabel: 'ABC',
    },
    {
      lineup: {
        lead: 'skarmory',
        switch: 'registeel',
        closer: 'azumarill',
      },
      score: 0.81,
      coverageMetrics: {
        coverageRate: 0.68,
        dominatingMatchupCount: 6,
        overwhelmingLossCount: 3,
        singleAnswerThreatCount: 2,
      },
      coveredThreats: ['venusaur'],
      weaknesses: ['Lanturn'],
      diagnosticLabel: 'ABA',
    },
  ];

  const optimizerScoreBreakdown: OptimizerScoreBreakdown = {
    components: {
      synergy: 0.91,
      coverage: 0.82,
      safety: 0.68,
      consistency: 0.57,
      bulk: 0.44,
      defensiveRatio: 0.72,
      offensiveRatio: 0.61,
      role: 0.38,
    },
    weights: {
      synergy: 0.24,
      coverage: 0.21,
      safety: 0.17,
      consistency: 0.13,
      bulk: 0.1,
      defensiveRatio: 0.07,
      offensiveRatio: 0.05,
      role: 0.03,
    },
    score: 0.74,
  };

  it('renders accordion sections collapsed by default', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'gastrodon', 'dunsparce'],
          formatId: 'great-league',
        }}
        isGenerating={false}
        fitness={0.78}
        analysis={analysisFixture}
      />,
    );

    expect(screen.getByText('Team Analysis Summary')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Summary Statistics' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', { name: 'Per-Pokemon Contribution' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.queryByRole('button', { name: 'Fitness Contribution Categories' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Expected Ranges')).not.toBeInTheDocument();
  });

  it('renders section-level legends and contribution details after expansion', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'gastrodon', 'dunsparce'],
          formatId: 'great-league',
        }}
        isGenerating={false}
        fitness={0.78}
        analysis={analysisFixture}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Summary Statistics' }));
    fireEvent.click(
      screen.getByRole('button', { name: 'Per-Pokemon Contribution' }),
    );

    expect(screen.getByText('Overall Fitness')).toBeInTheDocument();
    expect(screen.getByText('Expected Ranges')).toBeInTheDocument();
    expect(screen.getByText('Threat Handling')).toBeInTheDocument();
    expect(screen.getByText('Shield Stability')).toBeInTheDocument();
    expect(screen.getByText('Core-Breaker Risk')).toBeInTheDocument();

    expect(screen.queryByText('Meta Coverage')).not.toBeInTheDocument();
    expect(screen.queryByText('Shield Reliability')).not.toBeInTheDocument();
    expect(screen.queryByText('Core Stability')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Expected contribution bands'),
    ).not.toBeInTheDocument();

    expect(screen.getByText('Azumarill')).toBeInTheDocument();
    expect(screen.getByText('Threats Handled: 19')).toBeInTheDocument();
    expect(screen.getByText('Coverage Added: 6')).toBeInTheDocument();
    expect(screen.getByText('High-Pressure Relief: 7')).toBeInTheDocument();
    expect(screen.getByText('Replacement Risk: High')).toBeInTheDocument();
    expect(
      screen.queryByText('Relative grading guide'),
    ).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Covers 19 ranked threats/),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/individual algorithm/i)).not.toBeInTheDocument();
    expect(
      screen.queryByText(/team synergy algorithm/i),
    ).not.toBeInTheDocument();
    expect(screen.queryByText(/fitness mode/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/algorithm/i)).not.toBeInTheDocument();
  });

  it('renders optimizer score breakdown categories in documented priority order', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'skarmory', 'registeel'],
          formatId: 'great-league',
          recommendedLineups,
          scoreBreakdown: optimizerScoreBreakdown,
        }}
        isGenerating={false}
        fitness={0.78}
        analysis={analysisFixture}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Optimizer Score Breakdown' }),
    );

    const section = screen.getByRole('region', {
      name: 'Optimizer Score Breakdown',
    });
    const labels = within(section)
      .getAllByTestId('optimizer-score-category-label')
      .map((label) => label.textContent);

    expect(labels).toEqual([
      'Synergy',
      'Coverage',
      'Safety',
      'Consistency',
      'Bulk',
      'Offensive Ratio',
      'Defensive Ratio',
      'Role',
    ]);
    expect(labels.indexOf('Offensive Ratio')).toBeLessThan(
      labels.indexOf('Defensive Ratio'),
    );
    expect(labels.indexOf('Defensive Ratio')).toBeLessThan(
      labels.indexOf('Role'),
    );
    expect(within(section).getByText('0.91')).toHaveAccessibleDescription(
      'elite',
    );
    expect(within(section).getByText('0.57')).toHaveAccessibleDescription(
      'neutral',
    );
    expect(within(section).getByText('0.44')).toHaveAccessibleDescription(
      'weak',
    );
    expect(within(section).getByText('elite')).toHaveClass('text-sky-800');
    expect(within(section).getAllByText('neutral')[0]).toHaveClass(
      'text-amber-800',
    );
    expect(within(section).getAllByText('weak')[0]).toHaveClass(
      'text-rose-700',
    );
    expect(
      within(section).getByText(/Lineup role fit from lead, switch, closer/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('distinguishes top-threat and full-meta coverage diagnostics', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'skarmory', 'registeel'],
          formatId: 'great-league',
          recommendedLineups: [
            {
              ...recommendedLineups[0],
              coverageMetrics: {
                ...recommendedLineups[0].coverageMetrics,
                topThreatCoverage: {
                  coverageRate: 0.8,
                  evaluatedThreatCount: 10,
                  noAnswerThreatCount: 1,
                  singleAnswerThreatCount: 2,
                  dominatingMatchupCount: 4,
                  overwhelmingLossCount: 1,
                },
                fullMetaCoverage: {
                  coverageRate: 0.62,
                  evaluatedThreatCount: 40,
                  noAnswerThreatCount: 8,
                  singleAnswerThreatCount: 11,
                  dominatingMatchupCount: 9,
                  overwhelmingLossCount: 6,
                },
              },
            },
          ],
          scoreBreakdown: optimizerScoreBreakdown,
        }}
        isGenerating={false}
        fitness={0.78}
        analysis={analysisFixture}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Optimizer Score Breakdown' }),
    );

    const topThreatCard = screen
      .getByText('Top-threat coverage')
      .closest('article');
    const fullMetaCard = screen
      .getByText('Full-meta coverage')
      .closest('article');

    expect(topThreatCard).toHaveClass('border-indigo-200');
    expect(fullMetaCard).toHaveClass('border-cyan-200');
    expect(within(topThreatCard!).getByText('80%')).toBeInTheDocument();
    expect(within(fullMetaCard!).getByText('62%')).toBeInTheDocument();
    expect(
      within(topThreatCard!).getByText('1 no-answer, 2 single-answer risks'),
    ).toBeInTheDocument();
    expect(
      within(fullMetaCard!).getByText('8 no-answer, 11 single-answer risks'),
    ).toBeInTheDocument();
  });

  it('renders concise recommended lineup details with readable weakness names', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'skarmory', 'registeel'],
          formatId: 'great-league',
          recommendedLineups,
        }}
        isGenerating={false}
        fitness={0.78}
        analysis={analysisFixture}
      />,
    );

    const recommendedLineupsButton = screen.getByRole('button', {
      name: 'Recommended Lineups',
    });

    expect(recommendedLineupsButton).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Lineup 1')).not.toBeInTheDocument();

    fireEvent.click(recommendedLineupsButton);

    expect(recommendedLineupsButton).toHaveAttribute('aria-expanded', 'true');
    expect(
      screen.getByRole('region', { name: 'Recommended Lineups' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Lineup 1')).toBeInTheDocument();
    expect(screen.getAllByText('Lead')).toHaveLength(2);
    expect(screen.getAllByText('azumarill')).toHaveLength(2);
    expect(screen.getAllByText('Switch')).toHaveLength(2);
    expect(screen.getAllByText('skarmory')).toHaveLength(2);
    expect(screen.getAllByText('Closer')).toHaveLength(2);
    expect(screen.getAllByText('registeel')).toHaveLength(2);
    expect(screen.queryByText('Lead: azumarill')).not.toBeInTheDocument();
    expect(screen.queryByText('Safe Swap: skarmory')).not.toBeInTheDocument();
    expect(screen.queryByText('Score: 0.87')).not.toBeInTheDocument();
    expect(screen.queryByText(/Covered threats/i)).not.toBeInTheDocument();
    expect(screen.getAllByText('Weaknesses')).toHaveLength(2);
    expect(
      screen.getByRole('list', { name: 'Lineup 1 weaknesses' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('Weaknesses: Venusaur')).not.toBeInTheDocument();
    expect(screen.queryByText('Weaknesses: venusaur')).not.toBeInTheDocument();
    expect(screen.queryByText(/Structure/i)).not.toBeInTheDocument();
    expect(screen.queryByText('ABC')).not.toBeInTheDocument();
    expect(screen.queryByText('Balanced')).not.toBeInTheDocument();
    expect(screen.queryByText('Shield spend')).not.toBeInTheDocument();
    expect(screen.queryByText('Shield save')).not.toBeInTheDocument();
    expect(screen.queryByText('Balanced shield use')).not.toBeInTheDocument();
    expect(screen.queryByText('Spend shields early')).not.toBeInTheDocument();
    expect(
      screen.queryByText('Save shields for backline'),
    ).not.toBeInTheDocument();
  });

  it('places recommended lineups directly after summary statistics in full accordion order', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'skarmory', 'registeel'],
          formatId: 'great-league',
          recommendedLineups,
          scoreBreakdown: optimizerScoreBreakdown,
        }}
        isGenerating={false}
        fitness={0.78}
        analysis={analysisFixture}
      />,
    );

    const accordion = screen.getByRole('region', {
      name: 'Team analysis drill-down sections',
    });
    const accordionButtons = within(accordion).getAllByRole('button');

    expect(accordionButtons).toHaveLength(4);
    expect(accordionButtons[0]).toHaveAccessibleName('Summary Statistics');
    expect(accordionButtons[1]).toHaveAccessibleName('Recommended Lineups');
    expect(accordionButtons[2]).toHaveAccessibleName(
      'Optimizer Score Breakdown',
    );
    expect(accordionButtons[3]).toHaveAccessibleName(
      'Per-Pokemon Contribution',
    );
  });

  it('keeps accordion keyboard focus on rendered sections when score breakdown is unavailable', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'gastrodon', 'dunsparce'],
          formatId: 'great-league',
          recommendedLineups,
        }}
        isGenerating={false}
        fitness={0.78}
        analysis={analysisFixture}
      />,
    );

    const summaryButton = screen.getByRole('button', {
      name: 'Summary Statistics',
    });
    const perPokemonButton = screen.getByRole('button', {
      name: 'Per-Pokemon Contribution',
    });
    const recommendedLineupsButton = screen.getByRole('button', {
      name: 'Recommended Lineups',
    });

    expect(
      screen.queryByRole('button', { name: 'Optimizer Score Breakdown' }),
    ).not.toBeInTheDocument();

    summaryButton.focus();
    fireEvent.keyDown(summaryButton, { key: 'ArrowDown' });

    expect(recommendedLineupsButton).toHaveFocus();

    fireEvent.keyDown(recommendedLineupsButton, { key: 'ArrowDown' });

    expect(perPokemonButton).toHaveFocus();

    fireEvent.keyDown(perPokemonButton, { key: 'ArrowUp' });

    expect(recommendedLineupsButton).toHaveFocus();
  });

  it('omits resource path labels from recommended lineup cards', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'skarmory', 'registeel'],
          formatId: 'great-league',
          recommendedLineups: [
            {
              ...recommendedLineups[0],
            },
          ],
        }}
        isGenerating={false}
        fitness={0.78}
        analysis={analysisFixture}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Recommended Lineups' }),
    );

    expect(screen.queryByText('Balanced')).not.toBeInTheDocument();
    expect(screen.queryByText('Shield spend')).not.toBeInTheDocument();
    expect(screen.queryByText('Shield save')).not.toBeInTheDocument();
  });

  it('renders each lineup weakness as a separate semantic list item', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'skarmory', 'registeel'],
          formatId: 'great-league',
          recommendedLineups: [
            {
              ...recommendedLineups[0],
              weaknesses: ['Venusaur', 'Lanturn'],
            },
            {
              ...recommendedLineups[1],
              weaknesses: [],
            },
          ],
        }}
        isGenerating={false}
        fitness={0.78}
        analysis={analysisFixture}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Recommended Lineups' }),
    );

    const weaknessList = screen.getByRole('list', {
      name: 'Lineup 1 weaknesses',
    });
    const weaknessItems = within(weaknessList).getAllByRole('listitem');

    expect(weaknessItems).toHaveLength(2);
    expect(weaknessItems[0]).toHaveTextContent('Venusaur');
    expect(weaknessItems[1]).toHaveTextContent('Lanturn');
    expect(screen.queryByText('Venusaur, Lanturn')).not.toBeInTheDocument();
    expect(
      screen.getByText('No major weaknesses identified'),
    ).toBeInTheDocument();
  });

  it('renders recommended lineups even when analysis details are unavailable', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'skarmory', 'registeel'],
          formatId: 'great-league',
          recommendedLineups: [recommendedLineups[0]],
        }}
        isGenerating={false}
        fitness={null}
        analysis={null}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Recommended Lineups' }),
    );

    expect(screen.getByText('azumarill')).toBeInTheDocument();
    expect(
      screen.getByText('Analysis unavailable for this run.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByRole('button', { name: 'Per-Pokemon Contribution' }),
    ).not.toBeInTheDocument();
  });

  it('grades displayed percentages and fitness values using the shown rounded values', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'gastrodon', 'dunsparce'],
          formatId: 'great-league',
        }}
        isGenerating={false}
        fitness={0.749}
        analysis={{
          ...analysisFixture,
          shieldScenarios: {
            '0-0': {
              coveredThreats: 72,
              evaluatedThreats: 100,
              coverageRate: 0.72,
            },
            '1-1': {
              coveredThreats: 72,
              evaluatedThreats: 100,
              coverageRate: 0.72,
            },
            '2-2': {
              coveredThreats: 648,
              evaluatedThreats: 1000,
              coverageRate: 0.648,
            },
          },
          threats: {
            evaluatedCount: 125,
            entries: [
              ...analysisFixture.threats.entries,
              ...Array.from({ length: 84 }, (_, index) => ({
                speciesId: `support-${index}`,
                pokemon: `Support ${index}`,
                rank: index + 4,
                teamAnswers: 1,
                severityTier: 'medium' as const,
              })),
              ...Array.from({ length: 38 }, (_, index) => ({
                speciesId: `pressure-${index}`,
                pokemon: `Pressure ${index}`,
                rank: index + 88,
                teamAnswers: 0,
                severityTier: 'low' as const,
              })),
            ],
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Summary Statistics' }));

    expect(screen.getByText('0.75')).toHaveClass('text-emerald-700');
    expect(screen.getByText('86/125 (69%)')).toHaveClass('text-amber-700');
  });

  it('shows a waiting state when analysis data is unavailable', () => {
    render(
      <AnalysisPanel
        generatedTeam={null}
        isGenerating={false}
        fitness={null}
        analysis={null}
      />,
    );

    expect(
      screen.getByText('Generate a team to inspect analysis.'),
    ).toBeInTheDocument();
    expect(screen.queryByText('Summary Statistics')).not.toBeInTheDocument();
  });

  it('shows an unavailable message when team exists but analysis payload is missing', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'gastrodon', 'dunsparce'],
          formatId: 'great-league',
        }}
        isGenerating={false}
        fitness={null}
        analysis={null}
      />,
    );

    expect(
      screen.getByText('Analysis unavailable for this run.'),
    ).toBeInTheDocument();
  });
});
