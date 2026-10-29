import type { NextRequest } from 'next/server';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { POST as generateTeamPost } from './route';
import { POST as teamDetailsPost } from '@/app/api/team-details/route';
import {
  ensureSimulationDataAvailable,
  getActiveMovesetVariants,
  getMovesetVariantManifestPolicyIdentity,
} from '@/lib/data/simulations';
import { generateTeam } from '@/lib/genetic/algorithm';
import {
  createRosterMovesetAssignment,
  resolveRankedDefaultRosterMovesetAssignment,
} from '@/lib/genetic/moveset';
import type {
  GenerationResponse,
  PokemonWithMoves,
  RosterMovesetAssignment,
  TournamentMode,
} from '@/lib/types';

vi.mock('@/lib/genetic/algorithm', () => ({
  generateTeam: vi.fn(),
}));

const team = ['melmetal', 'altaria', 'mimikyu'];

function request(url: string, body: unknown): NextRequest {
  return new Request(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  }) as NextRequest;
}

async function getBothRouteResponses(
  assignment: RosterMovesetAssignment,
): Promise<{
  generation: GenerationResponse;
  standalone: { pokemon: PokemonWithMoves[] };
}> {
  vi.mocked(generateTeam).mockResolvedValue({
    team,
    fitness: 0.8,
    anchors: [],
    movesetAssignment: assignment,
  });

  const generationResponse = await generateTeamPost(
    request('http://localhost/api/generate-team', {
      mode: 'GBL' satisfies TournamentMode,
      formatId: 'great-league',
    }),
  );
  const standaloneResponse = await teamDetailsPost(
    request('http://localhost/api/team-details', {
      team,
      formatId: 'great-league',
      movesetAssignment: assignment,
    }),
  );

  expect(generationResponse.status).toBe(200);
  expect(standaloneResponse.status).toBe(200);
  const generation = (await generationResponse.json()) as GenerationResponse;
  const standalone = (await standaloneResponse.json()) as {
    pokemon: PokemonWithMoves[];
  };

  expect(generation.team).toEqual(team);
  expect(generation.movesetAssignment).toEqual(assignment);
  return { generation, standalone };
}

describe('POST /api/generate-team display projection parity', () => {
  afterEach(() => vi.clearAllMocks());

  it('matches standalone details with a current manifest-backed assignment', async () => {
    ensureSimulationDataAvailable('great-league');
    const policy = getMovesetVariantManifestPolicyIdentity('great-league');
    const assignment = createRosterMovesetAssignment({
      formatId: 'great-league',
      authorityBySpeciesId: Object.fromEntries(
        team.map((speciesId) => [
          speciesId,
          {
            source: 'manifest' as const,
            ...policy,
          },
        ]),
      ),
      variantsBySpeciesId: Object.fromEntries(
        team.map((speciesId) => {
          const variant = getActiveMovesetVariants(
            speciesId,
            'great-league',
          )[0];
          if (!variant) throw new Error(`Missing active variant: ${speciesId}`);
          return [speciesId, variant];
        }),
      ),
    });

    const { generation, standalone } = await getBothRouteResponses(assignment);

    expect(generation.pokemon).toEqual(standalone.pokemon);
    expect(generation.pokemon).toHaveLength(team.length);
  });

  it('matches standalone details with current ranked-default fallback authority', async () => {
    const assignment = resolveRankedDefaultRosterMovesetAssignment(
      team,
      'great-league',
    );
    expect(
      Object.values(assignment.authorityBySpeciesId).every(
        ({ source }) => source === 'ranked-default-fallback',
      ),
    ).toBe(true);

    const { generation, standalone } = await getBothRouteResponses(assignment);

    expect(generation.pokemon).toEqual(standalone.pokemon);
    expect(generation.pokemon).toHaveLength(team.length);
  });
});
