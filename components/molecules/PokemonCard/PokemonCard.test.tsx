import { ThemeProvider } from '@hooks/useTheme';
import { render, screen } from '@testing-library/react';
import { PokemonCard } from './PokemonCard';
import type { Pokemon } from '@/lib/types';

const mockPokemon: Pokemon = {
  dex: 25,
  speciesName: 'Pikachu',
  speciesId: 'pikachu',
  baseStats: {
    atk: 112,
    def: 96,
    hp: 111,
  },
  types: ['electric'],
  fastMoves: ['Quick Attack', 'Thunder Shock'],
  chargedMoves: ['Thunderbolt', 'Thunder'],
  tags: [],
  defaultIVs: {},
  buddyDistance: 1,
  thirdMoveCost: 10000,
  released: true,
  recommendedMoveset: {
    fastMove: 'Thunder_Shock',
    chargedMove1: 'Thunderbolt',
    chargedMove2: 'Thunder',
  },
};

describe('PokemonCard', () => {
  it('renders pokemon name and dex number', () => {
    render(
      <ThemeProvider initialTheme="light">
        <PokemonCard pokemon={mockPokemon} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Pikachu')).toBeInTheDocument();
    expect(screen.getByText('Dex #25')).toBeInTheDocument();
  });

  it('renders type badges', () => {
    render(
      <ThemeProvider initialTheme="light">
        <PokemonCard pokemon={mockPokemon} />
      </ThemeProvider>,
    );
    expect(screen.getByText('electric')).toBeInTheDocument();
  });

  it('renders stat cards', () => {
    render(
      <ThemeProvider initialTheme="light">
        <PokemonCard pokemon={mockPokemon} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Attack')).toBeInTheDocument();
    expect(screen.getByText('112')).toBeInTheDocument();
    expect(screen.getByText('Defense')).toBeInTheDocument();
    expect(screen.getByText('96')).toBeInTheDocument();
    expect(screen.getByText('HP')).toBeInTheDocument();
    expect(screen.getByText('111')).toBeInTheDocument();
  });

  it('renders moves section', () => {
    render(
      <ThemeProvider initialTheme="light">
        <PokemonCard pokemon={mockPokemon} />
      </ThemeProvider>,
    );
    expect(screen.getByText('Recommended Fast Move')).toBeInTheDocument();
    expect(screen.getByText('⭐ Thunder Shock')).toBeInTheDocument();
    expect(screen.getByText('Recommended Charged Moves')).toBeInTheDocument();
    expect(screen.getByText('⭐ Thunderbolt')).toBeInTheDocument();
    expect(screen.getByText('⭐ Thunder')).toBeInTheDocument();
  });

  it('renders shadow badge when pokemon is shadow', () => {
    const shadowPokemon = { ...mockPokemon, tags: ['shadow'] };
    render(
      <ThemeProvider initialTheme="light">
        <PokemonCard pokemon={shadowPokemon} />
      </ThemeProvider>,
    );
    expect(screen.getByText('SHADOW')).toBeInTheDocument();
  });

  it('does not render shadow badge for non-shadow pokemon', () => {
    render(
      <ThemeProvider initialTheme="light">
        <PokemonCard pokemon={mockPokemon} />
      </ThemeProvider>,
    );
    expect(screen.queryByText('SHADOW')).not.toBeInTheDocument();
  });

  it('handles multiple types', () => {
    const dualTypePokemon = { ...mockPokemon, types: ['fire', 'flying'] };
    render(
      <ThemeProvider initialTheme="light">
        <PokemonCard pokemon={dualTypePokemon} />
      </ThemeProvider>,
    );
    expect(screen.getByText('fire')).toBeInTheDocument();
    expect(screen.getByText('flying')).toBeInTheDocument();
  });
});
