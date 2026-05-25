import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamDisplay } from './TeamDisplay';
import type { BenchUtility, PlayPokemonRosterMetrics } from '@/lib/types';

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

  it('keeps recommended lineups out of the generated team card list', async () => {
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
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Pokemon Card')).toHaveLength(3);
    });

    expect(screen.queryByText('Recommended Lineups')).not.toBeInTheDocument();
    expect(screen.queryByText('Lineup 1')).not.toBeInTheDocument();
    expect(screen.queryByText('Lead: Azumarill')).not.toBeInTheDocument();
    expect(screen.queryByText('Score: 0.87')).not.toBeInTheDocument();
  });

  it('keeps GBL role-ordered lineups out of the generated team card list', async () => {
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
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Pokemon Card')).toHaveLength(3);
    });

    expect(screen.queryByText('Recommended Lineup')).not.toBeInTheDocument();
    expect(screen.queryByText('Lead: Clodsire')).not.toBeInTheDocument();
    expect(screen.queryByText('Safe Swap: Feraligatr')).not.toBeInTheDocument();
    expect(screen.queryByText('Closer: Dunsparce')).not.toBeInTheDocument();
    expect(screen.queryByText('Lineup 2')).not.toBeInTheDocument();
  });

  it('shows PlayPokemon roster metrics and bench utility warnings', async () => {
    const benchUtility: BenchUtility[] = [
      {
        speciesId: 'azumarill',
        utilityScore: 0.84,
        totalAppearances: 4,
        leadAppearances: 1,
        switchAppearances: 2,
        closerAppearances: 1,
        warnings: [],
      },
      {
        speciesId: 'registeel',
        utilityScore: 0.12,
        totalAppearances: 0,
        leadAppearances: 0,
        switchAppearances: 0,
        closerAppearances: 0,
        warnings: ['unbringable'],
      },
    ];
    const rosterMetrics: PlayPokemonRosterMetrics = {
      viableLineupCount: 12,
      topLineupQuality: 0.88,
      topNLineupDepth: 0.76,
      dominatingMatchupRate: 0.42,
      overwhelmingLossRate: 0.14,
      singleAnswerRisks: ['Morpeko (Full Belly)', 'Venusaur'],
      viableLeadDiversity: 3,
      benchUtilitySummary: benchUtility,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: [
            { speciesId: 'azumarill', speciesName: 'Azumarill' },
            { speciesId: 'registeel', speciesName: 'Registeel' },
          ],
        }),
      }),
    );

    render(
      <TeamDisplay
        team={['azumarill', 'registeel']}
        mode="PlayPokemon"
        formatId="great-league"
        rosterMetrics={rosterMetrics}
        benchUtility={benchUtility}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Roster Metrics')).toBeInTheDocument();
      expect(screen.getByText('Bench Utility')).toBeInTheDocument();
    });

    expect(screen.getByText('Viable Lineups')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Top Lineup Quality')).toBeInTheDocument();
    expect(screen.getByText('0.88')).toBeInTheDocument();
    expect(screen.getByText('Top-N Lineup Depth')).toBeInTheDocument();
    expect(screen.getByText('0.76')).toBeInTheDocument();
    expect(screen.getByText('Dominating Matchup Rate')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('Overwhelming Loss Rate')).toBeInTheDocument();
    expect(screen.getByText('14%')).toBeInTheDocument();
    expect(screen.getByText('Single-Answer Risks')).toBeInTheDocument();
    expect(
      screen.getByText('Morpeko (Full Belly), Venusaur'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('morpeko_full_belly, venusaur'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Viable Lead Diversity')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Bench Utility Summary')).toBeInTheDocument();
    expect(screen.getByText('2 roster members tracked')).toBeInTheDocument();

    expect(screen.getByText('Azumarill')).toBeInTheDocument();
    expect(screen.getByText('Utility Score: 0.84')).toBeInTheDocument();
    expect(screen.getByText('Appearances: 4 total')).toBeInTheDocument();
    expect(
      screen.getByText('Lead: 1 / Switch: 2 / Closer: 1'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText('Lead: 1 / Safe Swap: 2 / Closer: 1'),
    ).not.toBeInTheDocument();
    expect(screen.getByText('Registeel')).toBeInTheDocument();
    expect(screen.getByText('Warning: unbringable')).toBeInTheDocument();
  });

  it('centers bench utility warning pill text', async () => {
    const benchUtility: BenchUtility[] = [
      {
        speciesId: 'registeel',
        utilityScore: 0.12,
        totalAppearances: 0,
        leadAppearances: 0,
        switchAppearances: 0,
        closerAppearances: 0,
        warnings: ['unbringable', 'low-utility'],
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: [{ speciesId: 'registeel', speciesName: 'Registeel' }],
        }),
      }),
    );

    render(
      <TeamDisplay
        team={['registeel']}
        mode="PlayPokemon"
        formatId="great-league"
        rosterMetrics={{
          viableLineupCount: 1,
          topLineupQuality: 0.42,
          topNLineupDepth: 0.32,
          dominatingMatchupRate: 0.1,
          overwhelmingLossRate: 0.45,
          singleAnswerRisks: [],
          viableLeadDiversity: 1,
          benchUtilitySummary: benchUtility,
        }}
        benchUtility={benchUtility}
      />,
    );

    const unbringableWarning = await screen.findByText('Warning: unbringable');
    const lowUtilityWarning = screen.getByText('Warning: low-utility');

    [unbringableWarning, lowUtilityWarning].forEach((warning) => {
      expect(warning).toHaveClass(
        'inline-flex',
        'items-center',
        'justify-center',
        'text-center',
      );
    });
  });

  it('does not show PlayPokemon roster metrics for GBL results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ pokemon: [] }),
      }),
    );

    render(
      <TeamDisplay
        team={['azumarill', 'registeel']}
        mode="GBL"
        formatId="great-league"
        rosterMetrics={{
          viableLineupCount: 12,
          topLineupQuality: 0.88,
          topNLineupDepth: 0.76,
          dominatingMatchupRate: 0.42,
          overwhelmingLossRate: 0.14,
          singleAnswerRisks: [],
          viableLeadDiversity: 3,
          benchUtilitySummary: [],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Team Notes/)).toBeInTheDocument();
    });

    expect(screen.queryByText('Roster Metrics')).not.toBeInTheDocument();
  });
});
