import type { NextRequest } from 'next/server';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { POST } from './route';
import { DEFAULT_BATTLE_FORMAT_ID } from '@/lib/data/battleFormats';
import { speciesNameToId, validateTeamUniqueness } from '@/lib/data/pokemon';
import { MissingRankingDataError } from '@/lib/data/rankings';
import { MissingSimulationDataError } from '@/lib/data/simulations';
import { generateTeam } from '@/lib/genetic/algorithm';

vi.mock('@/lib/data/pokemon', () => ({
  speciesNameToId: vi.fn(),
  validateTeamUniqueness: vi.fn(),
}));

vi.mock('@/lib/genetic/algorithm', () => ({
  generateTeam: vi.fn(),
}));

describe('POST /api/generate-team format validation', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(speciesNameToId).mockImplementation((name: string) =>
      name.toLowerCase().replace(/\s+/g, '-'),
    );
    vi.mocked(validateTeamUniqueness).mockReturnValue(true);
    vi.mocked(generateTeam).mockResolvedValue({
      team: ['azumarill'],
      fitness: 1,
      anchors: [],
    });
  });

  it('passes validated formatId to team generation', async () => {
    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'ultra-league',
        anchorPokemon: ['Azumarill'],
      }),
    });

    const response = await POST(request as NextRequest);

    expect(response.status).toBe(200);
    expect(generateTeam).toHaveBeenCalledWith(
      expect.objectContaining({ formatId: 'ultra-league' }),
    );
  });

  it.each([
    ['great-league'],
    ['ultra-league'],
    ['master-league'],
    ['kanto-cup'],
  ] as const)(
    'passes %s formatId to team generation for end-to-end requests',
    async (formatId) => {
      const request = new Request('http://localhost/api/generate-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'PlayPokemon',
          formatId,
        }),
      });

      const response = await POST(request as NextRequest);

      expect(response.status).toBe(200);
      expect(generateTeam).toHaveBeenCalledWith(
        expect.objectContaining({ formatId }),
      );
    },
  );

  it('defaults formatId to Great League when omitted', async () => {
    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
      }),
    });

    const response = await POST(request as NextRequest);

    expect(response.status).toBe(200);
    expect(generateTeam).toHaveBeenCalledWith(
      expect.objectContaining({ formatId: DEFAULT_BATTLE_FORMAT_ID }),
    );
  });

  it('returns 400 for invalid formatId', async () => {
    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'little-cup',
      }),
    });

    const response = await POST(request as NextRequest);
    const responseBody = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(responseBody.error).toBe('Invalid battle format: little-cup');
    expect(generateTeam).not.toHaveBeenCalled();
  });

  it('returns a clear error when selected format simulation data is missing', async () => {
    vi.mocked(generateTeam).mockRejectedValue(
      new MissingSimulationDataError('ultra-league'),
    );

    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'ultra-league',
      }),
    });

    const response = await POST(request as NextRequest);
    const responseBody = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(responseBody.error).toMatch(
      /Simulation data missing for Ultra League \(all\/2500\)/,
    );
  });

  it('returns a clear error when selected format ranking data is missing', async () => {
    vi.mocked(generateTeam).mockRejectedValue(
      new MissingRankingDataError(
        'master-league',
        'overall',
        'cp10000_all_overall_rankings.csv',
      ),
    );

    const request = new Request('http://localhost/api/generate-team', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: 'PlayPokemon',
        formatId: 'master-league',
      }),
    });

    const response = await POST(request as NextRequest);
    const responseBody = (await response.json()) as { error: string };

    expect(response.status).toBe(400);
    expect(responseBody.error).toMatch(
      /Ranking data missing for Master League \(all\/10000\), category overall: cp10000_all_overall_rankings\.csv/,
    );
  });
});
