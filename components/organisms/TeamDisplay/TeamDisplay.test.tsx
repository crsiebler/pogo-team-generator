import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamDisplay } from './TeamDisplay';
import type { RosterMovesetAssignment } from '@/lib/types';

const { exportButtonMock } = vi.hoisted(() => ({
  exportButtonMock: vi.fn(),
}));

const movesetAssignment: RosterMovesetAssignment = {
  formatId: 'battle-frontier-liga-ultra',
  policyIdentity: {
    source: 'manifest',
    schemaVersion: 1,
    policyVersion: 'ranking-evidence-v1',
  },
  variantsBySpeciesId: {
    decidueye: {
      id: 'leafage--spirit_shackle--frenzy_plant',
      fastMove: 'LEAFAGE',
      chargedMove1: 'FRENZY_PLANT',
      chargedMove2: 'SPIRIT_SHACKLE',
      isDefault: false,
    },
  },
  fingerprint: 'team-display-assignment',
};

function assignmentForFormat(
  formatId: RosterMovesetAssignment['formatId'],
  speciesIds: readonly string[] = ['decidueye'],
): RosterMovesetAssignment {
  const variant = movesetAssignment.variantsBySpeciesId.decidueye!;

  return {
    ...movesetAssignment,
    formatId,
    variantsBySpeciesId: Object.fromEntries(
      speciesIds.map((speciesId) => [speciesId, variant]),
    ),
    fingerprint: `assignment:${formatId}`,
  };
}

function createPokemonDetails(
  speciesId: string,
  assignment: RosterMovesetAssignment,
  speciesName: string = speciesId,
) {
  return {
    speciesId,
    speciesName,
    recommendedMoveset: {
      ...assignment.variantsBySpeciesId[speciesId],
      acquisitionRequirements: {
        fastMove: { kind: 'regular' },
        chargedMove1: { kind: 'regular' },
        chargedMove2: { kind: 'regular' },
      },
    },
  };
}

vi.mock('@/components/molecules', () => ({
  PokemonCard: () => <div>Pokemon Card</div>,
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

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: [createPokemonDetails('decidueye', movesetAssignment)],
        }),
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
        movesetAssignment={movesetAssignment}
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
      movesetAssignment,
    });
  });

  it('forwards the scored assignment and acquisition-only export metadata', async () => {
    render(
      <TeamDisplay
        team={['decidueye']}
        mode="PlayPokemon"
        formatId="battle-frontier-liga-ultra"
        movesetAssignment={movesetAssignment}
      />,
    );

    await waitFor(() => {
      expect(exportButtonMock).toHaveBeenCalledWith({
        team: ['decidueye'],
        movesetAssignment,
        acquisitionRequirementsBySpeciesId: {
          decidueye: {
            fastMove: { kind: 'regular' },
            chargedMove1: { kind: 'regular' },
            chargedMove2: { kind: 'regular' },
          },
        },
        disabled: false,
      });
    });
  });

  it.each([
    [
      'a non-success response',
      {
        ok: false,
        json: vi.fn().mockResolvedValue({
          pokemon: [{ speciesId: 'decidueye' }],
        }),
      },
    ],
    [
      'a malformed success response',
      {
        ok: true,
        json: vi.fn().mockResolvedValue({}),
      },
    ],
    [
      'an incomplete roster response',
      {
        ok: true,
        json: vi.fn().mockResolvedValue({ pokemon: [] }),
      },
    ],
    [
      'moves that differ from the scored assignment',
      {
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: [
            {
              speciesId: 'decidueye',
              recommendedMoveset: {
                ...movesetAssignment.variantsBySpeciesId.decidueye,
                fastMove: 'ASTONISH',
                acquisitionRequirements: {
                  fastMove: { kind: 'regular' },
                  chargedMove1: { kind: 'regular' },
                  chargedMove2: { kind: 'regular' },
                },
              },
            },
          ],
        }),
      },
    ],
    [
      'invalid acquisition metadata',
      {
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: [
            {
              speciesId: 'decidueye',
              recommendedMoveset: {
                ...movesetAssignment.variantsBySpeciesId.decidueye,
                acquisitionRequirements: {
                  fastMove: { kind: 'excluded' },
                  chargedMove1: { kind: 'regular' },
                  chargedMove2: { kind: 'regular' },
                },
              },
            },
          ],
        }),
      },
    ],
  ])('rejects %s without corrupting team state', async (_label, response) => {
    const consoleError = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(response));

    render(
      <TeamDisplay
        team={['decidueye']}
        mode="PlayPokemon"
        formatId="battle-frontier-liga-ultra"
        movesetAssignment={movesetAssignment}
      />,
    );

    await waitFor(() => {
      expect(consoleError).toHaveBeenCalledWith(
        'Failed to fetch team details:',
        expect.any(Error),
      );
    });

    expect(screen.queryByText('Pokemon Card')).not.toBeInTheDocument();
    expect(screen.getByText(/Team Notes/)).toBeInTheDocument();
    expect(exportButtonMock).toHaveBeenLastCalledWith(
      expect.objectContaining({ disabled: true }),
    );
  });

  it('does not show Battle Frontier Master point usage in the notes', async () => {
    const team = ['charizard_mega_y', 'garchomp'];
    const assignment = assignmentForFormat(
      'battle-frontier-coupe-du-sillage',
      team,
    );
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: [
            createPokemonDetails(
              'charizard_mega_y',
              assignment,
              'Charizard (Mega Y)',
            ),
            createPokemonDetails('garchomp', assignment, 'Garchomp'),
          ],
        }),
      }),
    );

    render(
      <TeamDisplay
        team={team}
        mode="PlayPokemon"
        formatId="battle-frontier-coupe-du-sillage"
        movesetAssignment={assignment}
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
    const team = ['azumarill', 'skarmory', 'registeel'];
    const assignment = assignmentForFormat('great-league', team);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: team.map((speciesId) =>
            createPokemonDetails(speciesId, assignment),
          ),
        }),
      }),
    );

    render(
      <TeamDisplay
        team={team}
        mode="PlayPokemon"
        formatId="great-league"
        movesetAssignment={assignment}
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
    const team = ['clodsire', 'feraligatr', 'dunsparce'];
    const assignment = assignmentForFormat('great-league', team);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: team.map((speciesId) =>
            createPokemonDetails(speciesId, assignment),
          ),
        }),
      }),
    );

    render(
      <TeamDisplay
        team={team}
        mode="GBL"
        formatId="great-league"
        movesetAssignment={assignment}
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
    const team = ['azumarill', 'registeel'];
    const assignment = assignmentForFormat('great-league', team);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: team.map((speciesId) =>
            createPokemonDetails(speciesId, assignment),
          ),
        }),
      }),
    );

    render(
      <TeamDisplay
        team={team}
        mode="PlayPokemon"
        formatId="great-league"
        movesetAssignment={assignment}
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
    const team = ['azumarill', 'registeel'];
    const assignment = assignmentForFormat('great-league', team);
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: team.map((speciesId) =>
            createPokemonDetails(speciesId, assignment),
          ),
        }),
      }),
    );

    render(
      <TeamDisplay
        team={team}
        mode="GBL"
        formatId="great-league"
        movesetAssignment={assignment}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Team Notes/)).toBeInTheDocument();
    });

    expect(screen.queryByText('Roster Metrics')).not.toBeInTheDocument();
  });
});
