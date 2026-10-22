import { render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamDisplay } from './TeamDisplay';
import type { PokemonWithMoves, RosterMovesetAssignment } from '@/lib/types';

const { exportButtonMock } = vi.hoisted(() => ({
  exportButtonMock: vi.fn(),
}));

function assignmentFor(speciesIds: readonly string[]): RosterMovesetAssignment {
  return {
    formatId: 'great-league',
    authorityBySpeciesId: Object.fromEntries(
      speciesIds.map((speciesId) => [
        speciesId,
        {
          source: 'manifest',
          schemaVersion: 1,
          policyVersion: 'ranking-evidence-v1',
        },
      ]),
    ),
    variantsBySpeciesId: Object.fromEntries(
      speciesIds.map((speciesId) => [
        speciesId,
        {
          id: 'leafage--frenzy_plant--spirit_shackle',
          fastMove: 'LEAFAGE',
          chargedMove1: 'FRENZY_PLANT',
          chargedMove2: 'SPIRIT_SHACKLE',
          isDefault: false,
        },
      ]),
    ),
    fingerprint: `assignment:${speciesIds.join(',')}`,
  };
}

function pokemonFor(
  speciesId: string,
  assignment: RosterMovesetAssignment,
  speciesName = speciesId,
): PokemonWithMoves {
  return {
    dex: 1,
    speciesName,
    speciesId,
    baseStats: { atk: 100, def: 100, hp: 100 },
    types: ['grass'],
    fastMoves: ['LEAFAGE'],
    chargedMoves: ['FRENZY_PLANT', 'SPIRIT_SHACKLE'],
    tags: [],
    defaultIVs: {},
    buddyDistance: 3,
    thirdMoveCost: 10000,
    released: true,
    recommendedMoveset: {
      ...assignment.variantsBySpeciesId[speciesId]!,
      authority: assignment.authorityBySpeciesId[speciesId]!,
      acquisitionRequirements: {
        fastMove: { kind: 'regular' },
        chargedMove1: { kind: 'elite' },
        chargedMove2: { kind: 'eventExclusive' },
      },
    },
  };
}

vi.mock('@/components/molecules', () => ({
  PokemonCard: ({ pokemon }: { pokemon: PokemonWithMoves }) => (
    <div>
      {pokemon.speciesName}: {pokemon.recommendedMoveset.fastMove}/
      {pokemon.recommendedMoveset.chargedMove1}/
      {pokemon.recommendedMoveset.chargedMove2}
    </div>
  ),
}));

vi.mock('@/components/molecules/ExportButton/ExportButton', () => ({
  ExportButton: (props: unknown) => {
    exportButtonMock(props);
    return <button type="button">Export</button>;
  },
}));

describe('TeamDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('fetch', vi.fn());
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it.each([
    [
      'Pick 6',
      [
        'decidueye',
        'azumarill',
        'skarmory',
        'registeel',
        'garchomp',
        'lanturn',
      ],
    ],
    ['Pick 3', ['decidueye', 'azumarill', 'skarmory']],
  ])('renders ordered %s details directly from props', (_label, speciesIds) => {
    const assignment = assignmentFor(speciesIds);
    const pokemon = speciesIds.map((speciesId) =>
      pokemonFor(speciesId, assignment),
    );

    render(
      <TeamDisplay
        team={speciesIds}
        mode={speciesIds.length === 3 ? 'GBL' : 'PlayPokemon'}
        movesetAssignment={assignment}
        pokemon={pokemon}
      />,
    );

    expect(
      screen.getAllByText(/LEAFAGE\/FRENZY_PLANT\/SPIRIT_SHACKLE/),
    ).toHaveLength(speciesIds.length);
    expect(
      screen.getByText(
        speciesIds.length === 3
          ? /This team is optimized for GO Battle League format/
          : /This team is optimized for Play! Pokémon format/,
      ),
    ).toBeInTheDocument();
    expect(screen.getByText('Export')).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();

    expect(exportButtonMock).toHaveBeenLastCalledWith(
      expect.objectContaining({
        team: speciesIds,
        movesetAssignment: assignment,
        acquisitionRequirementsBySpeciesId: Object.fromEntries(
          speciesIds.map((speciesId) => [
            speciesId,
            {
              fastMove: { kind: 'regular' },
              chargedMove1: { kind: 'elite' },
              chargedMove2: { kind: 'eventExclusive' },
            },
          ]),
        ),
        disabled: false,
      }),
    );
  });

  it('does not fetch when the result rerenders or remounts', () => {
    const team = ['decidueye'];
    const assignment = assignmentFor(team);
    const pokemon = [pokemonFor(team[0]!, assignment)];
    const props = {
      team,
      mode: 'PlayPokemon' as const,
      movesetAssignment: assignment,
      pokemon,
    };

    const view = render(<TeamDisplay {...props} />);
    view.rerender(<TeamDisplay {...props} />);
    view.unmount();
    render(<TeamDisplay {...props} />);

    expect(screen.getByText(/decidueye:/)).toBeInTheDocument();
    expect(fetch).not.toHaveBeenCalled();
  });
});
