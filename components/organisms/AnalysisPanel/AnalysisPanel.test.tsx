import { fireEvent, render, screen } from '@testing-library/react';
import { AnalysisPanel } from './AnalysisPanel';
import type { GenerationAnalysis } from '@/lib/types';

const analysisFixture: GenerationAnalysis = {
  mode: 'GBL',
  algorithm: 'teamSynergy',
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
        rationale:
          'Covers 19 ranked threats, adds 6 unique team answers, and stabilizes 7 high-pressure matchups. Replacement fragility is high.',
      },
      {
        speciesId: 'gastrodon',
        pokemon: 'Gastrodon',
        threatsHandled: 14,
        coverageAdded: 2,
        highSeverityRelief: 4,
        fragilityRiskTier: 'low',
        rationale:
          'Covers 14 ranked threats, adds 2 unique team answers, and stabilizes 4 high-pressure matchups. Replacement fragility is low.',
      },
    ],
  },
};

describe('AnalysisPanel', () => {
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
      screen.getByRole('button', { name: 'Fitness Contribution Categories' }),
    ).toHaveAttribute('aria-expanded', 'false');
    expect(
      screen.getByRole('button', { name: 'Per-Pokemon Contribution' }),
    ).toHaveAttribute('aria-expanded', 'false');
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
      screen.getByRole('button', { name: 'Fitness Contribution Categories' }),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Per-Pokemon Contribution' }),
    );

    expect(screen.getByText('Overall Fitness')).toBeInTheDocument();
    expect(screen.getByText('Expected Ranges')).toBeInTheDocument();
    expect(screen.getByText('Threat Handling')).toBeInTheDocument();
    expect(screen.getByText('Shield Stability')).toBeInTheDocument();
    expect(screen.getByText('Core-Breaker Risk')).toBeInTheDocument();

    expect(screen.getByText('Meta Coverage')).toBeInTheDocument();
    expect(screen.getByText('Shield Reliability')).toBeInTheDocument();
    expect(screen.getByText('Core Stability')).toBeInTheDocument();
    expect(screen.getByText('Expected contribution bands')).toBeInTheDocument();

    expect(screen.getByText('Azumarill')).toBeInTheDocument();
    expect(screen.getByText('Threats Handled: 19')).toBeInTheDocument();
    expect(screen.getByText('Coverage Added: 6')).toBeInTheDocument();
    expect(screen.getByText('High-Pressure Relief: 7')).toBeInTheDocument();
    expect(screen.getByText('Replacement Risk: High')).toBeInTheDocument();
    expect(screen.getByText('Relative grading guide')).toBeInTheDocument();
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
});
