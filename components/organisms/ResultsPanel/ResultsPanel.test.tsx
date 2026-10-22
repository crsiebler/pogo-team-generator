import { render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { ResultsPanel } from './ResultsPanel';
import type { PokemonWithMoves, RosterMovesetAssignment } from '@/lib/types';

vi.mock('@/components/organisms', () => ({
  TeamDisplay: ({
    team,
    movesetAssignment,
    pokemon,
    mode,
  }: {
    team: string[];
    movesetAssignment: RosterMovesetAssignment;
    pokemon: PokemonWithMoves[];
    mode: 'PlayPokemon' | 'GBL';
  }) => (
    <div>
      {team.join(',')}|{movesetAssignment.fingerprint}|{mode}|
      {pokemon.map((entry) => entry.speciesId).join(',')}
    </div>
  ),
}));

describe('ResultsPanel', () => {
  it('passes the team, assignment, and full details to TeamDisplay unchanged', () => {
    const team = ['azumarill', 'skarmory', 'registeel'];
    const movesetAssignment: RosterMovesetAssignment = {
      formatId: 'great-league',
      authorityBySpeciesId: {},
      variantsBySpeciesId: {},
      fingerprint: 'scored-assignment',
    };
    const pokemon = team.map(
      (speciesId) => ({ speciesId }) as PokemonWithMoves,
    );

    render(
      <ResultsPanel
        generatedTeam={{
          team,
          movesetAssignment,
          pokemon,
          mode: 'GBL',
        }}
        isGenerating={false}
      />,
    );

    expect(
      screen.getByText(
        'azumarill,skarmory,registeel|scored-assignment|GBL|azumarill,skarmory,registeel',
      ),
    ).toBeInTheDocument();
  });
});
