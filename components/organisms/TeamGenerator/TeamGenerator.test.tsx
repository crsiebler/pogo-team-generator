import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { TeamGenerator } from './TeamGenerator';

const showToastMock = vi.fn();

vi.mock('@/lib/hooks/useToast', () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

describe('TeamGenerator', () => {
  beforeEach(() => {
    showToastMock.mockClear();
  });

  it('rejects selecting duplicate base species anchors', async () => {
    render(
      <TeamGenerator
        mode="GBL"
        pokemonList={['Marowak', 'Marowak (Shadow)', 'Azumarill']}
        selectedFormatId="great-league"
        onAnchorsChange={() => {}}
        onExclusionsChange={() => {}}
      />,
    );

    const firstAnchorInput = screen.getByPlaceholderText('Pokémon 1');
    fireEvent.focus(firstAnchorInput);
    fireEvent.change(firstAnchorInput, { target: { value: 'Mar' } });

    await waitFor(() => {
      expect(screen.getByText('Marowak')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Marowak'));

    const secondAnchorInput = screen.getByPlaceholderText('Pokémon 2');
    fireEvent.focus(secondAnchorInput);
    fireEvent.change(secondAnchorInput, { target: { value: 'Shadow' } });

    await waitFor(() => {
      expect(screen.getByText('Marowak (Shadow)')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Marowak (Shadow)'));

    expect(secondAnchorInput).toHaveValue('');
    expect(showToastMock).toHaveBeenCalledWith(
      'Invalid anchor: duplicate species or variant is not allowed.',
      'error',
    );
  });

  it('does not render Battle Frontier Master point usage copy', () => {
    render(
      <TeamGenerator
        mode="GBL"
        pokemonList={['Azumarill']}
        selectedFormatId="great-league"
        onAnchorsChange={() => {}}
        onExclusionsChange={() => {}}
      />,
    );

    expect(screen.queryByText(/\(\d+ \/ 11 points\)/i)).not.toBeInTheDocument();
  });

  it('renders generation controls without algorithm selection text', () => {
    render(
      <TeamGenerator
        mode="PlayPokemon"
        pokemonList={['Azumarill']}
        selectedFormatId="great-league"
        onAnchorsChange={() => {}}
        onExclusionsChange={() => {}}
      />,
    );

    expect(screen.queryByText(/algorithm selection/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/individual scoring/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/team synergy/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/fitness mode/i)).not.toBeInTheDocument();
  });
});
