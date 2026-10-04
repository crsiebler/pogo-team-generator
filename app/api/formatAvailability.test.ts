import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { POST as generateTeam } from './generate-team/route';
import { GET as listPokemon } from './pokemon-list/route';
import { POST as teamDetails } from './team-details/route';
import { resolveRankedDefaultRosterMovesetAssignment } from '@/lib/genetic/moveset';

describe('Battle Frontier Master format requests', () => {
  it('validates generation input without rejecting the format as unavailable', async () => {
    const response = await generateTeam(
      new NextRequest('http://localhost/api/generate-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ formatId: 'battle-frontier-master' }),
      }),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: 'Invalid tournament mode' });
  });

  it('returns team details for a roster with multiple Megas', async () => {
    const team = ['swampert_mega', 'aggron_mega', 'palkia_origin'];
    const movesetAssignment = resolveRankedDefaultRosterMovesetAssignment(
      team,
      'battle-frontier-master',
    );
    const response = await teamDetails(
      new NextRequest('http://localhost/api/team-details', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          team,
          movesetAssignment,
          formatId: 'battle-frontier-master',
        }),
      }),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      pokemon: Array<{ speciesId: string }>;
    };
    expect(payload.pokemon.map(({ speciesId }) => speciesId)).toEqual(team);
  });

  it('offers ranked Pokemon for Master without point metadata', async () => {
    const response = await listPokemon(
      new Request(
        'http://localhost/api/pokemon-list?formatId=battle-frontier-master',
      ),
    );
    expect(response.status).toBe(200);
    const payload = (await response.json()) as {
      pokemon: string[];
      count: number;
    };
    expect(payload.pokemon).toContain('Swampert (Mega)');
    expect(payload.pokemon).toContain('Aggron (Mega)');
    expect(payload.count).toBe(payload.pokemon.length);
    expect(payload).not.toHaveProperty(
      'battleFrontierMasterPointsByPokemonName',
    );
  });
});
