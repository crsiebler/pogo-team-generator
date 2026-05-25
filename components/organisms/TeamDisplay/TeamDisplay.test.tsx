import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamDisplay } from './TeamDisplay';
import type { RecommendedLineup } from '@/lib/types';

vi.mock('@/components/molecules', () => ({
  PokemonCard: () => <div>Pokemon Card</div>,
}));

vi.mock('@/components/molecules/ExportButton/ExportButton', () => ({
  ExportButton: () => <button type="button">Export</button>,
}));

describe('TeamDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ pokemon: [] }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends formatId when requesting team details', async () => {
    render(
      <TeamDisplay
        team={['decidueye']}
        mode="PlayPokemon"
        formatId="battle-frontier-ul-retro"
      />,
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/team-details',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const [, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit & { body: string },
    ];

    expect(JSON.parse(options.body)).toEqual({
      team: ['decidueye'],
      formatId: 'battle-frontier-ul-retro',
    });
  });

  it('shows Battle Frontier Master generated team point usage in the notes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: [
            {
              speciesId: 'charizard_mega_y',
              speciesName: 'Charizard (Mega Y)',
            },
            { speciesId: 'garchomp', speciesName: 'Garchomp' },
          ],
        }),
      }),
    );

    render(
      <TeamDisplay
        team={['charizard_mega_y', 'garchomp']}
        mode="PlayPokemon"
        formatId="battle-frontier-master"
        battleFrontierMasterPointsByPokemonName={{
          'Charizard (Mega Y)': 4,
          Garchomp: 0,
        }}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Current Battle Frontier Master point usage:/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/4\s*\/\s*11 points/i)).toBeInTheDocument();
    });
  });

  it('shows multiple PlayPokemon recommended lineups with diagnostics', async () => {
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
        coveredThreats: ['lanturn', 'talonflame'],
        weaknesses: ['venusaur'],
        diagnosticLabel: 'ABC',
        resourcePathMetrics: {
          balanced: { available: true, score: 0.8 },
          shieldSpend: { available: true, score: 0.76 },
          shieldSave: { available: false },
        },
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
        weaknesses: ['lanturn'],
        diagnosticLabel: 'ABA',
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: [
            { speciesId: 'azumarill', speciesName: 'Azumarill' },
            { speciesId: 'skarmory', speciesName: 'Skarmory' },
            { speciesId: 'registeel', speciesName: 'Registeel' },
          ],
        }),
      }),
    );

    render(
      <TeamDisplay
        team={['azumarill', 'skarmory', 'registeel']}
        mode="PlayPokemon"
        formatId="great-league"
        recommendedLineups={recommendedLineups}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Recommended Lineups')).toBeInTheDocument();
      expect(screen.getByText('Lineup 1')).toBeInTheDocument();
      expect(screen.getByText('Lineup 2')).toBeInTheDocument();
    });

    expect(screen.getByText('Lead: Azumarill')).toBeInTheDocument();
    expect(screen.getByText('Safe Swap: Skarmory')).toBeInTheDocument();
    expect(screen.getByText('Closer: Registeel')).toBeInTheDocument();
    expect(screen.getByText('Score: 0.87')).toBeInTheDocument();
    expect(
      screen.getByText('Covered threats: lanturn, talonflame'),
    ).toBeInTheDocument();
    expect(screen.getByText('Weaknesses: venusaur')).toBeInTheDocument();
    expect(screen.getByText('Structure: ABC')).toBeInTheDocument();
    expect(screen.getByText('Balanced: 0.80')).toBeInTheDocument();
    expect(screen.getByText('Shield spend: 0.76')).toBeInTheDocument();
    expect(screen.queryByText(/Shield save:/i)).not.toBeInTheDocument();
  });

  it('shows one GBL role-ordered lineup when one recommendation is present', async () => {
    const recommendedLineups: RecommendedLineup[] = [
      {
        lineup: {
          lead: 'clodsire',
          switch: 'feraligatr',
          closer: 'dunsparce',
        },
        score: 0.79,
        coverageMetrics: {
          coverageRate: 0.72,
          dominatingMatchupCount: 5,
          overwhelmingLossCount: 2,
          singleAnswerThreatCount: 1,
        },
        coveredThreats: ['gastrodon'],
        weaknesses: ['jumpluff'],
        diagnosticLabel: 'ABB',
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: [
            { speciesId: 'clodsire', speciesName: 'Clodsire' },
            { speciesId: 'feraligatr', speciesName: 'Feraligatr' },
            { speciesId: 'dunsparce', speciesName: 'Dunsparce' },
          ],
        }),
      }),
    );

    render(
      <TeamDisplay
        team={['clodsire', 'feraligatr', 'dunsparce']}
        mode="GBL"
        formatId="great-league"
        recommendedLineups={recommendedLineups}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Recommended Lineup')).toBeInTheDocument();
    });

    expect(screen.getByText('Lead: Clodsire')).toBeInTheDocument();
    expect(screen.getByText('Safe Swap: Feraligatr')).toBeInTheDocument();
    expect(screen.getByText('Closer: Dunsparce')).toBeInTheDocument();
    expect(screen.queryByText('Lineup 2')).not.toBeInTheDocument();
  });
});
