import { render, screen } from '@testing-library/react';
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
};

describe('ResultsPanel', () => {
  it('renders analysis summary metrics with legend text', () => {
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
