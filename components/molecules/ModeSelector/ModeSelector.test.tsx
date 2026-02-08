import { render, screen, fireEvent } from '@testing-library/react';
import { ModeSelector } from './ModeSelector';

describe('ModeSelector', () => {
  const mockOnModeChange = vi.fn();

  beforeEach(() => {
    mockOnModeChange.mockClear();
  });

  it('renders both mode buttons', () => {
    render(<ModeSelector mode="PlayPokemon" onModeChange={mockOnModeChange} />);

    expect(screen.getByText('Play! Pokémon')).toBeInTheDocument();
    expect(screen.getByText('GO Battle League')).toBeInTheDocument();
    expect(screen.getByText('6 Pokémon, Open Sheets')).toBeInTheDocument();
    expect(screen.getByText('3 Pokémon, Blind')).toBeInTheDocument();
  });

  it('applies correct styling for PlayPokemon mode', () => {
    render(<ModeSelector mode="PlayPokemon" onModeChange={mockOnModeChange} />);

    const playPokemonButton = screen
      .getByText('Play! Pokémon')
      .closest('button');
    const gblButton = screen.getByText('GO Battle League').closest('button');

    expect(playPokemonButton).toHaveClass(
      'border-blue-600',
      'bg-blue-50',
      'text-blue-900',
    );
    expect(gblButton).toHaveClass(
      'border-gray-300',
      'bg-white',
      'text-gray-700',
    );
  });

  it('applies correct styling for GBL mode', () => {
    render(<ModeSelector mode="GBL" onModeChange={mockOnModeChange} />);

    const playPokemonButton = screen
      .getByText('Play! Pokémon')
      .closest('button');
    const gblButton = screen.getByText('GO Battle League').closest('button');

    expect(playPokemonButton).toHaveClass(
      'border-gray-300',
      'bg-white',
      'text-gray-700',
    );
    expect(gblButton).toHaveClass(
      'border-purple-600',
      'bg-purple-50',
      'text-purple-900',
    );
  });

  it('calls onModeChange with PlayPokemon when PlayPokemon button is clicked', () => {
    render(<ModeSelector mode="GBL" onModeChange={mockOnModeChange} />);

    const playPokemonButton = screen.getByText('Play! Pokémon');
    fireEvent.click(playPokemonButton);

    expect(mockOnModeChange).toHaveBeenCalledTimes(1);
    expect(mockOnModeChange).toHaveBeenCalledWith('PlayPokemon');
  });

  it('calls onModeChange with GBL when GBL button is clicked', () => {
    render(<ModeSelector mode="PlayPokemon" onModeChange={mockOnModeChange} />);

    const gblButton = screen.getByText('GO Battle League');
    fireEvent.click(gblButton);

    expect(mockOnModeChange).toHaveBeenCalledTimes(1);
    expect(mockOnModeChange).toHaveBeenCalledWith('GBL');
  });

  it('does not call onModeChange when clicking the currently selected mode', () => {
    render(<ModeSelector mode="PlayPokemon" onModeChange={mockOnModeChange} />);

    const playPokemonButton = screen.getByText('Play! Pokémon');
    fireEvent.click(playPokemonButton);

    expect(mockOnModeChange).toHaveBeenCalledTimes(1);
    expect(mockOnModeChange).toHaveBeenCalledWith('PlayPokemon');
  });
});
