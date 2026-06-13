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

  const optimizerScoreBreakdownWithThreatScore: OptimizerScoreBreakdown = {
    ...optimizerScoreBreakdown,
    threatScore: {
      score: 0.34,
      evaluatedCount: 18,
      topMetaThreats: [
        {
          speciesId: 'samurott_shadow',
          pokemon: 'Samurott (Shadow)',
          rank: 16,
          teamAnswers: 0,
          threatValue: 0.49,
          severityTier: 'high',
        },
        {
          speciesId: 'toxapex',
          pokemon: 'Toxapex',
          rank: 7,
          teamAnswers: 2,
          threatValue: 0.43,
          severityTier: 'medium',
        },
        {
          speciesId: 'drapion',
          pokemon: 'Drapion',
          rank: 9,
          teamAnswers: 2,
          threatValue: 0.39,
          severityTier: 'medium',
        },
        {
          speciesId: 'lapras',
          pokemon: 'Lapras',
          rank: 11,
          teamAnswers: 2,
          threatValue: 0.32,
          severityTier: 'medium',
        },
        {
          speciesId: 'charjabug',
          pokemon: 'Charjabug',
          rank: 15,
          teamAnswers: 3,
          threatValue: 0.25,
          severityTier: 'low',
        },
        {
          speciesId: 'jumpluff',
          pokemon: 'Jumpluff',
          rank: 21,
          teamAnswers: 3,
          threatValue: 0.2,
          severityTier: 'low',
        },
      ],
      overallTeamThreats: [
        {
          speciesId: 'talonflame',
          pokemon: 'Talonflame',
          rank: 12,
          teamAnswers: 0,
          threatValue: 0.86,
          severityTier: 'critical',
        },
        {
          speciesId: 'lanturn',
          pokemon: 'Lanturn',
          rank: 19,
          teamAnswers: 1,
          threatValue: 0.61,
          severityTier: 'high',
        },
        {
          speciesId: 'forretress',
          pokemon: 'Forretress',
          rank: 25,
          teamAnswers: 1,
          threatValue: 0.58,
          severityTier: 'high',
        },
        {
          speciesId: 'malamar',
          pokemon: 'Malamar',
          rank: 31,
          teamAnswers: 2,
          threatValue: 0.44,
          severityTier: 'medium',
        },
        {
          speciesId: 'sealeo',
          pokemon: 'Sealeo',
          rank: 37,
          teamAnswers: 2,
          threatValue: 0.35,
          severityTier: 'medium',
        },
        {
          speciesId: 'dunsparce',
          pokemon: 'Dunsparce',
          rank: 48,
          teamAnswers: 3,
          threatValue: 0.28,
          severityTier: 'low',
        },
      ],
      pools: {
        topMeta: {
          score: 0.28,
          evaluatedCount: 8,
          weight: 0.8,
        },
        fullMeta: {
          score: 0.41,
          evaluatedCount: 42,
          weight: 0.2,
        },
      },
    },
  };

  it('renders accordion sections collapsed by default', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'gastrodon', 'dunsparce'],
          formatId: 'great-league',
          scoreBreakdown: optimizerScoreBreakdown,
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

  it('renders optimizer score cards in summary statistics and contribution details after expansion', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'gastrodon', 'dunsparce'],
          formatId: 'great-league',
          scoreBreakdown: optimizerScoreBreakdown,
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

    const summarySection = screen.getByRole('region', {
      name: 'Summary Statistics',
    });

    expect(within(summarySection).getByText('Synergy')).toBeInTheDocument();
    expect(within(summarySection).getByText('Coverage')).toBeInTheDocument();
    expect(within(summarySection).getByText('A')).toBeInTheDocument();
    expect(screen.queryByText('Overall Fitness')).not.toBeInTheDocument();
    expect(screen.queryByText('Expected Ranges')).not.toBeInTheDocument();
    expect(screen.queryByText('Threat Handling')).not.toBeInTheDocument();
    expect(screen.queryByText('Shield Stability')).not.toBeInTheDocument();
    expect(screen.queryByText('Core-Breaker Risk')).not.toBeInTheDocument();
    expect(
      screen.queryByText(/Normalized optimizer categories explain/i),
    ).not.toBeInTheDocument();

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

  it('renders replacement risk below each Pokemon name in a dedicated row', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'gastrodon', 'dunsparce'],
          formatId: 'great-league',
          scoreBreakdown: optimizerScoreBreakdown,
        }}
        isGenerating={false}
        fitness={0.78}
        analysis={analysisFixture}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', { name: 'Per-Pokemon Contribution' }),
    );

    const contributionSection = screen.getByRole('region', {
      name: 'Per-Pokemon Contribution',
    });
    for (const entry of analysisFixture.pokemonContributions.entries) {
      const expectedRiskTier =
        entry.fragilityRiskTier === 'moderate'
          ? 'Moderate'
          : entry.fragilityRiskTier === 'high'
            ? 'High'
            : 'Low';
      const pokemonName = within(contributionSection).getByText(entry.pokemon);
      const replacementRisk = within(contributionSection).getByText(
        `Replacement Risk: ${expectedRiskTier}`,
      );
      const nameRow = pokemonName.closest(
        '[data-testid="pokemon-contribution-name-row"]',
      );
      const riskRow = replacementRisk.closest(
        '[data-testid="pokemon-contribution-risk-row"]',
      );

      expect(nameRow).not.toBeNull();
      expect(riskRow).not.toBeNull();
      expect(nameRow).not.toBe(riskRow);
      expect(
        nameRow!.compareDocumentPosition(riskRow!) &
          Node.DOCUMENT_POSITION_FOLLOWING,
      ).toBeTruthy();
      expect(
        within(contributionSection).getByText(
          `Threats Handled: ${entry.threatsHandled}`,
        ),
      ).toBeInTheDocument();
      expect(
        within(contributionSection).getByText(
          `Coverage Added: ${entry.coverageAdded}`,
        ),
      ).toBeInTheDocument();
      expect(
        within(contributionSection).getByText(
          `High-Pressure Relief: ${entry.highSeverityRelief}`,
        ),
      ).toBeInTheDocument();
    }
  });

  it('renders optimizer score categories in summary statistics in documented priority order', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Summary Statistics' }));

    const section = screen.getByRole('region', {
      name: 'Summary Statistics',
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
      'Role',
      'Offensive Ratio',
      'Defensive Ratio',
    ]);
    expect(labels.indexOf('Bulk') + 1).toBe(labels.indexOf('Role'));
    expect(labels.indexOf('Role')).toBeLessThan(
      labels.indexOf('Offensive Ratio'),
    );
    expect(labels.indexOf('Offensive Ratio') + 1).toBe(
      labels.indexOf('Defensive Ratio'),
    );
    expect(
      within(screen.getByTestId('optimizer-score-primary-grid'))
        .getAllByTestId('optimizer-score-category-label')
        .map((label) => label.textContent),
    ).toEqual(['Synergy', 'Coverage', 'Safety', 'Consistency', 'Bulk', 'Role']);
    expect(
      within(screen.getByTestId('optimizer-score-ratio-grid'))
        .getAllByTestId('optimizer-score-category-label')
        .map((label) => label.textContent),
    ).toEqual(['Offensive Ratio', 'Defensive Ratio']);
    expect(within(section).getByText('A')).toBeInTheDocument();
    expect(within(section).getByText('B')).toBeInTheDocument();
    expect(within(section).getAllByText('C')).toHaveLength(4);
    expect(within(section).getByText('D')).toBeInTheDocument();
    expect(within(section).getByText('F')).toBeInTheDocument();
    expect(within(section).queryByText('A+')).not.toBeInTheDocument();
    expect(within(section).queryByText('B-')).not.toBeInTheDocument();
    expect(within(section).queryByText('elite')).not.toBeInTheDocument();
    expect(within(section).queryByText('strong')).not.toBeInTheDocument();
    expect(within(section).queryByText('neutral')).not.toBeInTheDocument();
    expect(within(section).queryByText('weak')).not.toBeInTheDocument();
    expect(
      within(section).getByText(/Lineup role fit from lead, switch, closer/i),
    ).toBeInTheDocument();
    expect(screen.queryByRole('spinbutton')).not.toBeInTheDocument();
  });

  it('renders threat score diagnostics inside summary statistics without quality pills', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'skarmory', 'registeel'],
          formatId: 'great-league',
          scoreBreakdown: optimizerScoreBreakdownWithThreatScore,
        }}
        isGenerating={false}
        fitness={0.78}
        analysis={analysisFixture}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Summary Statistics' }));

    const section = screen.getByRole('region', {
      name: 'Summary Statistics',
    });

    expect(within(section).getByText('Threat Score')).toBeInTheDocument();
    expect(within(section).getByText(/Lower is better/i)).toBeInTheDocument();
    expect(within(section).getByText('Overall: 0.34')).toBeInTheDocument();
    expect(
      within(section).getByText('Top Meta: 0.28 (8 evaluated)'),
    ).toBeInTheDocument();
    expect(
      within(section).getByText('Full Meta: 0.41 (42 evaluated)'),
    ).toBeInTheDocument();
    expect(within(section).getByText('Top Meta Threats')).toBeInTheDocument();
    expect(
      within(section).getByRole('list', { name: 'Top Meta Threats' }),
    ).toBeInTheDocument();
    const topMetaThreatItems = within(
      within(section).getByRole('list', { name: 'Top Meta Threats' }),
    ).getAllByRole('listitem');

    expect(topMetaThreatItems.map((item) => item.textContent)).toEqual([
      'Samurott (Shadow)',
      'Toxapex',
      'Drapion',
      'Lapras',
      'Charjabug',
    ]);
    expect(within(section).queryByText(/Jumpluff/)).not.toBeInTheDocument();
    expect(
      within(section).getByText('Overall Team Threats'),
    ).toBeInTheDocument();
    expect(
      within(section).getByRole('list', { name: 'Overall Team Threats' }),
    ).toBeInTheDocument();
    const overallThreatItems = within(
      within(section).getByRole('list', { name: 'Overall Team Threats' }),
    ).getAllByRole('listitem');

    expect(overallThreatItems.map((item) => item.textContent)).toEqual([
      'Talonflame',
      'Lanturn',
      'Forretress',
      'Malamar',
      'Sealeo',
    ]);
    expect(within(section).queryByText(/Dunsparce/)).not.toBeInTheDocument();
    expect(within(section).getAllByText('Showing top 5 of 6')).toHaveLength(2);
    expect(
      within(section).queryByText(
        'Samurott (Shadow) (Rank #16, Answers: 0, Risk: 0.49)',
      ),
    ).not.toBeInTheDocument();
    expect(within(section).queryByText(/Rank #/)).not.toBeInTheDocument();
    expect(within(section).queryByText(/Answers:/)).not.toBeInTheDocument();
    expect(within(section).queryByText(/Risk:/)).not.toBeInTheDocument();
    expect(within(section).queryByText('elite')).not.toBeInTheDocument();
    expect(within(section).queryByText('strong')).not.toBeInTheDocument();
    expect(within(section).queryByText('neutral')).not.toBeInTheDocument();
    expect(within(section).queryByText('weak')).not.toBeInTheDocument();
    expect(
      within(section).getAllByTestId('optimizer-score-category-label'),
    ).toHaveLength(8);
  });

  it('omits the threat score card when threat diagnostics are unavailable', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'skarmory', 'registeel'],
          formatId: 'great-league',
          scoreBreakdown: optimizerScoreBreakdown,
        }}
        isGenerating={false}
        fitness={0.78}
        analysis={analysisFixture}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Summary Statistics' }));

    const section = screen.getByRole('region', {
      name: 'Summary Statistics',
    });

    expect(within(section).queryByText('Threat Score')).not.toBeInTheDocument();
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
    expect(screen.getByText('elite')).toBeInTheDocument();
    expect(screen.getByText('strong')).toBeInTheDocument();
    expect(screen.getAllByText('Lead')).toHaveLength(2);
    expect(screen.getAllByText('azumarill')).toHaveLength(2);
    expect(screen.getAllByText('Switch')).toHaveLength(2);
    expect(screen.getAllByText('skarmory')).toHaveLength(2);
    expect(screen.getAllByText('Closer')).toHaveLength(2);
    expect(screen.getAllByText('registeel')).toHaveLength(2);
    expect(screen.queryByText('Lead: azumarill')).not.toBeInTheDocument();
    expect(screen.queryByText('Safe Swap: skarmory')).not.toBeInTheDocument();
    expect(screen.queryByText('Score: 0.87')).not.toBeInTheDocument();
    expect(screen.queryByText('0.87')).not.toBeInTheDocument();
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

  it('renders exactly one lineup-quality pill per recommended lineup card from lineup score', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'skarmory', 'registeel'],
          formatId: 'great-league',
          recommendedLineups: [
            { ...recommendedLineups[0], score: 0.85 },
            { ...recommendedLineups[1], score: 0.7 },
            {
              ...recommendedLineups[0],
              lineup: {
                lead: 'registeel',
                switch: 'azumarill',
                closer: 'skarmory',
              },
              score: 0.5,
            },
            {
              ...recommendedLineups[1],
              lineup: {
                lead: 'lanturn',
                switch: 'venusaur',
                closer: 'talonflame',
              },
              score: 0.49,
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

    const lineupCards = screen
      .getAllByText(/Lineup \d/)
      .map((lineupHeading) => lineupHeading.closest('article'));

    expect(lineupCards).toHaveLength(4);
    expect(lineupCards.every((lineupCard) => lineupCard !== null)).toBe(true);

    const qualityAssertions = [
      {
        label: 'elite',
        classes: ['border-violet-200', 'bg-violet-100', 'text-violet-800'],
      },
      {
        label: 'strong',
        classes: ['border-emerald-200', 'bg-emerald-100', 'text-emerald-800'],
      },
      {
        label: 'neutral',
        classes: ['border-sky-200', 'bg-sky-100', 'text-sky-800'],
      },
      {
        label: 'weak',
        classes: ['border-amber-200', 'bg-amber-100', 'text-amber-800'],
      },
    ];
    for (const [index, lineupCard] of lineupCards.entries()) {
      const qualityPills = within(lineupCard!).getAllByTestId(
        'lineup-quality-pill',
      );
      const qualityAssertion = qualityAssertions[index];

      expect(qualityPills).toHaveLength(1);
      expect(qualityPills[0]).toHaveTextContent(qualityAssertion.label);
      expect(qualityPills[0]).toHaveAccessibleName(
        `Lineup quality: ${qualityAssertion.label}`,
      );
      expect(qualityPills[0]).toHaveClass(...qualityAssertion.classes);
    }

    expect(screen.queryByText('Score: 0.85')).not.toBeInTheDocument();
    expect(screen.queryByText('0.85')).not.toBeInTheDocument();
  });

  it('uses blue diagnostic styling for recommended lineup cards', () => {
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

    fireEvent.click(
      screen.getByRole('button', { name: 'Recommended Lineups' }),
    );

    const lineupCard = screen.getByText('Lineup 1').closest('article');

    expect(lineupCard).not.toBeNull();
    expect(lineupCard).toHaveClass('border-blue-200', 'bg-blue-50/70');
    expect(lineupCard).not.toHaveClass(
      'border-emerald-100',
      'bg-emerald-50/80',
    );
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

    expect(accordionButtons).toHaveLength(3);
    expect(accordionButtons[0]).toHaveAccessibleName('Summary Statistics');
    expect(accordionButtons[1]).toHaveAccessibleName('Recommended Lineups');
    expect(accordionButtons[2]).toHaveAccessibleName(
      'Per-Pokemon Contribution',
    );
    expect(
      screen.queryByRole('button', { name: 'Optimizer Score Breakdown' }),
    ).not.toBeInTheDocument();
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

    const perPokemonButton = screen.getByRole('button', {
      name: 'Per-Pokemon Contribution',
    });
    const recommendedLineupsButton = screen.getByRole('button', {
      name: 'Recommended Lineups',
    });

    expect(
      screen.queryByRole('button', { name: 'Optimizer Score Breakdown' }),
    ).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Summary Statistics' }),
    ).toBeInTheDocument();

    const summaryButton = screen.getByRole('button', {
      name: 'Summary Statistics',
    });

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

  it('renders zero optimizer scores as provided values instead of treating them as missing', () => {
    render(
      <AnalysisPanel
        generatedTeam={{
          team: ['azumarill', 'gastrodon', 'dunsparce'],
          formatId: 'great-league',
          scoreBreakdown: {
            ...optimizerScoreBreakdown,
            components: {
              ...optimizerScoreBreakdown.components,
              synergy: 0,
            },
          },
        }}
        isGenerating={false}
        fitness={0.78}
        analysis={analysisFixture}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Summary Statistics' }));

    const summarySection = screen.getByRole('region', {
      name: 'Summary Statistics',
    });

    const synergyCard = within(summarySection)
      .getByText('Synergy')
      .closest('article');

    expect(synergyCard).not.toBeNull();
    expect(within(synergyCard!).getByText('F')).toBeInTheDocument();
    expect(within(synergyCard!).queryByText('0.00')).not.toBeInTheDocument();
    expect(within(synergyCard!).queryByText('weak')).not.toBeInTheDocument();
  });

  it('keeps summary statistics visible with a display-only fallback when score breakdown is unavailable', () => {
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

    fireEvent.click(screen.getByRole('button', { name: 'Summary Statistics' }));

    const summarySection = screen.getByRole('region', {
      name: 'Summary Statistics',
    });

    expect(
      within(summarySection).getByText(
        'Optimizer scores unavailable for this run.',
      ),
    ).toBeInTheDocument();
    expect(
      within(summarySection).queryByTestId('optimizer-score-category-label'),
    ).not.toBeInTheDocument();
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
