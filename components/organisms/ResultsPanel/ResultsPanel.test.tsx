import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { ResultsPanel } from './ResultsPanel';
import type { GenerationAnalysis } from '@/lib/types';

vi.mock('@/components/organisms', () => ({
  TeamDisplay: () => <div>TeamDisplay</div>,
}));

const analysisFixture: GenerationAnalysis = {
  mode: 'GBL',
  algorithm: 'teamSynergy',
  teamSize: 3,
  generatedAt: '2026-02-13T00:00:00.000Z',
  threats: {
    evaluatedCount: 4,
    entries: [
      {
        pokemon: 'Azumarill',
        rank: 1,
        teamAnswers: 1,
        severityTier: 'critical',
      },
      {
        pokemon: 'Feraligatr',
        rank: 2,
        teamAnswers: 0,
        severityTier: 'high',
      },
      {
        pokemon: 'Gastrodon',
        rank: 3,
        teamAnswers: 2,
        severityTier: 'medium',
      },
      {
        pokemon: 'Dunsparce',
        rank: 4,
        teamAnswers: 1,
        severityTier: 'low',
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
      {
        pokemon: 'Drapion',
        rank: 8,
        teamAnswers: 1,
        severityTier: 'medium',
      },
    ],
  },
  shieldScenarios: {
    '0-0': {
      coveredThreats: 18,
      evaluatedThreats: 50,
      coverageRate: 36,
    },
    '1-1': {
      coveredThreats: 24,
      evaluatedThreats: 50,
      coverageRate: 48,
    },
    '2-2': {
      coveredThreats: 20,
      evaluatedThreats: 50,
      coverageRate: 40,
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
        rationale:
          'Covers 19 ranked threats, adds 6 unique team answers, and stabilizes 7 high-pressure matchups. Replacement fragility is high.',
      },
      {
        speciesId: 'gastrodon',
        pokemon: 'Gastrodon',
        threatsHandled: 16,
        coverageAdded: 2,
        highSeverityRelief: 5,
        fragilityRiskTier: 'low',
        rationale:
          'Covers 16 ranked threats, adds 2 unique team answers, and stabilizes 5 high-pressure matchups. Replacement fragility is low.',
      },
    ],
  },
};

describe('ResultsPanel', () => {
  it('renders accordion sections collapsed by default', () => {
    render(
      <ResultsPanel
        generatedTeam={['azumarill', 'gastrodon', 'dunsparce']}
        mode="GBL"
        isGenerating={false}
        fitness={123.456}
        analysis={analysisFixture}
      />,
    );

    expect(screen.getByText('Team Analysis Summary')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Summary Statistics' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', {
        name: 'Fitness Contribution Categories',
      }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', {
        name: 'Per-Pokemon Contribution',
      }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Legend')).not.toBeInTheDocument();
    expect(screen.queryByText('Meta Coverage')).not.toBeInTheDocument();
    expect(screen.queryByText('Azumarill')).not.toBeInTheDocument();
    expect(screen.getByText('TeamDisplay')).toBeInTheDocument();
  });

  it('renders analysis summary metrics with legend text after expanding section', () => {
    render(
      <ResultsPanel
        generatedTeam={['azumarill', 'gastrodon', 'dunsparce']}
        mode="GBL"
        isGenerating={false}
        fitness={123.456}
        analysis={analysisFixture}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Summary Statistics' }));

    expect(screen.getByText('123.5')).toBeInTheDocument();
    expect(screen.getByText('3/4 (75%)')).toBeInTheDocument();
    expect(screen.getByText('41%')).toBeInTheDocument();
    expect(screen.getByText('Moderate')).toBeInTheDocument();
    expect(screen.getByText('Legend')).toBeInTheDocument();
    expect(screen.getByText('TeamDisplay')).toBeInTheDocument();
  });

  it('renders category-level contribution impacts with concise definitions', () => {
    render(
      <ResultsPanel
        generatedTeam={['azumarill', 'gastrodon', 'dunsparce']}
        mode="GBL"
        isGenerating={false}
        fitness={123.456}
        analysis={analysisFixture}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Fitness Contribution Categories',
      }),
    );

    expect(
      screen.getByText('Fitness Contribution Categories'),
    ).toBeInTheDocument();
    expect(screen.getByText('Meta Coverage')).toBeInTheDocument();
    expect(screen.getByText('Shield Reliability')).toBeInTheDocument();
    expect(screen.getByText('Core Stability')).toBeInTheDocument();

    expect(screen.getByText('+25')).toBeInTheDocument();
    expect(screen.getByText('-9')).toBeInTheDocument();
    expect(screen.getByText('-50')).toBeInTheDocument();

    expect(screen.getByText('Positive')).toBeInTheDocument();
    expect(screen.getAllByText('Negative')).toHaveLength(2);

    expect(screen.getByText('Category Definitions')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Meta Coverage: how consistently the team has at least one answer into ranked threats.',
      ),
    ).toBeInTheDocument();
  });

  it('renders per-Pokemon contribution stats and rationale in drill-down section', () => {
    render(
      <ResultsPanel
        generatedTeam={['azumarill', 'gastrodon', 'dunsparce']}
        mode="GBL"
        isGenerating={false}
        fitness={123.456}
        analysis={analysisFixture}
      />,
    );

    fireEvent.click(
      screen.getByRole('button', {
        name: 'Per-Pokemon Contribution',
      }),
    );

    expect(screen.getByText('Azumarill')).toBeInTheDocument();
    expect(screen.getByText('Gastrodon')).toBeInTheDocument();
    expect(screen.getByText('Threats Handled: 19')).toBeInTheDocument();
    expect(screen.getByText('Coverage Added: 6')).toBeInTheDocument();
    expect(screen.getByText('High-Pressure Relief: 7')).toBeInTheDocument();
    expect(screen.getByText('Replacement Risk: High')).toBeInTheDocument();
    expect(
      screen.getByText(
        'Covers 19 ranked threats, adds 6 unique team answers, and stabilizes 7 high-pressure matchups. Replacement fragility is high.',
      ),
    ).toBeInTheDocument();
  });

  it('supports keyboard navigation between accordion headers', () => {
    render(
      <ResultsPanel
        generatedTeam={['azumarill', 'gastrodon', 'dunsparce']}
        mode="GBL"
        isGenerating={false}
        fitness={123.456}
        analysis={analysisFixture}
      />,
    );

    const summaryButton = screen.getByRole('button', {
      name: 'Summary Statistics',
    });

    const contributionButton = screen.getByRole('button', {
      name: 'Fitness Contribution Categories',
    });

    summaryButton.focus();
    fireEvent.keyDown(summaryButton, { key: 'ArrowDown' });
    expect(contributionButton).toHaveFocus();

    fireEvent.keyDown(contributionButton, { key: 'ArrowUp' });
    expect(summaryButton).toHaveFocus();
  });

  it('hides summary panel when analysis payload is missing', () => {
    render(
      <ResultsPanel
        generatedTeam={['azumarill', 'gastrodon', 'dunsparce']}
        mode="GBL"
        isGenerating={false}
        fitness={null}
        analysis={null}
      />,
    );

    expect(screen.queryByText('Team Analysis Summary')).not.toBeInTheDocument();
    expect(screen.getByText('TeamDisplay')).toBeInTheDocument();
  });
});
