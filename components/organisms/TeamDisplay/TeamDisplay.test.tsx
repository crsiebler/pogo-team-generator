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
});
