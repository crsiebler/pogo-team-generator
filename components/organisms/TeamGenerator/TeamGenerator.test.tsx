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
        battleFrontierMasterPointsByPokemonName={{}}
        onAnchorsChange={() => {}}
        onExclusionsChange={() => {}}
        algorithm="individual"
        onAlgorithmChange={() => {}}
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

  it('shows live Battle Frontier Master anchor point usage and updates it immediately', async () => {
    render(
      <TeamGenerator
        mode="GBL"
        pokemonList={['Palkia (Origin)', 'Palkia (Shadow)', 'Hydreigon']}
        selectedFormatId="battle-frontier-master"
        battleFrontierMasterPointsByPokemonName={{
          Hydreigon: 0,
          'Palkia (Origin)': 5,
          'Palkia (Shadow)': 2,
        }}
        onAnchorsChange={() => {}}
        onExclusionsChange={() => {}}
        algorithm="individual"
        onAlgorithmChange={() => {}}
      />,
    );

    expect(screen.getByText('(0 / 11 points)')).toBeInTheDocument();

    const firstAnchorInput = screen.getByPlaceholderText('Pokémon 1');
    fireEvent.change(firstAnchorInput, {
      target: { value: 'Palkia (Origin)' },
    });

    await waitFor(() => {
      expect(screen.getByText('(5 / 11 points)')).toBeInTheDocument();
    });

    const secondAnchorInput = screen.getByPlaceholderText('Pokémon 2');
    fireEvent.change(secondAnchorInput, {
      target: { value: 'Palkia (Shadow)' },
    });

    await waitFor(() => {
      expect(screen.getByText('(7 / 11 points)')).toBeInTheDocument();
    });

    fireEvent.change(firstAnchorInput, { target: { value: '' } });

    await waitFor(() => {
      expect(screen.getByText('(2 / 11 points)')).toBeInTheDocument();
    });
  });

  it('hides the Battle Frontier Master point usage meter for other formats', () => {
    render(
      <TeamGenerator
        mode="GBL"
        pokemonList={['Azumarill']}
        selectedFormatId="great-league"
        battleFrontierMasterPointsByPokemonName={{ Azumarill: 0 }}
        onAnchorsChange={() => {}}
        onExclusionsChange={() => {}}
        algorithm="individual"
        onAlgorithmChange={() => {}}
      />,
    );

    expect(screen.queryByText(/\(\d+ \/ 11 points\)/i)).not.toBeInTheDocument();
  });
});
