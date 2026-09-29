import { NextRequest } from 'next/server';
import { describe, expect, it } from 'vitest';
import { POST as generateTeam } from './generate-team/route';
import { GET as listPokemon } from './pokemon-list/route';
import { POST as teamDetails } from './team-details/route';

describe('unavailable format requests', () => {
  it.each([
    ['generate-team', generateTeam, { mode: 'PlayPokemon' }],
    ['team-details', teamDetails, { team: ['mewtwo'] }],
  ] as const)(
    'returns an actionable 400 from %s before processing the team',
    async (path, handler, body) => {
      const response = await handler(
        new NextRequest(`http://localhost/api/${path}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ...body, formatId: 'battle-frontier-master' }),
        }),
      );
      expect(response.status).toBe(400);
      expect(await response.json()).toEqual({
        error: expect.stringContaining('current cycle rules'),
      });
    },
  );

  it('returns an actionable 400 instead of offering Pokemon for an unavailable format', async () => {
    const response = await listPokemon(
      new Request(
        'http://localhost/api/pokemon-list?formatId=battle-frontier-master',
      ),
    );
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({
      error: expect.stringContaining('current cycle rules'),
    });
  });
});
