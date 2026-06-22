import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamDisplay } from './TeamDisplay';

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
        formatId="battle-frontier-liga-ultra"
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
      formatId: 'battle-frontier-liga-ultra',
    });
  });

  it('does not show Battle Frontier Master point usage in the notes', async () => {
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
        formatId="battle-frontier-coupe-du-sillage"
      />,
    );

    await waitFor(() => {
      expect(
        screen.queryByText(/Current Battle Frontier Master point usage:/i),
      ).not.toBeInTheDocument();
      expect(screen.queryByText(/4\s*\/\s*11 points/i)).not.toBeInTheDocument();
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

  it('omits PlayPokemon roster metrics and bench utility from generated team cards', async () => {
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
      />,
    );

    await waitFor(() => {
      expect(screen.getAllByText('Pokemon Card')).toHaveLength(2);
    });

    expect(screen.queryByText('Roster Metrics')).not.toBeInTheDocument();
    expect(screen.queryByText('Bench Utility')).not.toBeInTheDocument();
    expect(screen.queryByText('Viable Lineups')).not.toBeInTheDocument();
    expect(screen.queryByText('Single-Answer Risks')).not.toBeInTheDocument();
    expect(screen.queryByText('Warning: unbringable')).not.toBeInTheDocument();
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
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Team Notes/)).toBeInTheDocument();
    });

    expect(screen.queryByText('Roster Metrics')).not.toBeInTheDocument();
  });
});
