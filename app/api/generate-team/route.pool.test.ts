import { beforeEach, describe, expect, it, vi } from 'vitest';
import { POST } from './route';
import { generateTeam } from '@/lib/genetic/algorithm';

vi.mock('@/lib/genetic/algorithm', () => ({ generateTeam: vi.fn() }));

describe('pregenerated team endpoint', () => {
  beforeEach(() => vi.clearAllMocks());
  it('serves an unconstrained valid pool result without running a search', async () => {
    const response = await POST(
      new Request('http://localhost/api/generate-team', {
        method: 'POST',
        body: JSON.stringify({ mode: 'PlayPokemon', formatId: 'play-pokemon' }),
      }) as Parameters<typeof POST>[0],
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.team).toHaveLength(6);
    expect(result.pokemon).toHaveLength(6);
    expect(result.movesetAssignment.formatId).toBe('play-pokemon');
    expect(result.analysis.generatedAt).toBeDefined();
    expect(generateTeam).not.toHaveBeenCalled();
  });

  it('selects distinct pooled teams for different random choices', async () => {
    const random = vi.spyOn(Math, 'random');
    try {
      random.mockReturnValue(0);
      const makeRequest = (): Parameters<typeof POST>[0] =>
        new Request('http://localhost/api/generate-team', {
          method: 'POST',
          body: JSON.stringify({
            mode: 'PlayPokemon',
            formatId: 'play-pokemon',
          }),
        }) as Parameters<typeof POST>[0];
      const first = await (await POST(makeRequest())).json();
      random.mockReturnValue(0.999);
      const second = await (await POST(makeRequest())).json();
      expect([...first.team].sort()).not.toEqual([...second.team].sort());
      expect(generateTeam).not.toHaveBeenCalled();
    } finally {
      random.mockRestore();
    }
  });

  it('runs live generation for experimental movesets', async () => {
    vi.mocked(generateTeam).mockRejectedValueOnce(new Error('live search'));
    const error = vi
      .spyOn(console, 'error')
      .mockImplementation(() => undefined);
    try {
      const response = await POST(
        new Request('http://localhost/api/generate-team', {
          method: 'POST',
          body: JSON.stringify({
            mode: 'PlayPokemon',
            formatId: 'play-pokemon',
            simulateMovesetVariants: true,
          }),
        }) as Parameters<typeof POST>[0],
      );
      expect(response.status).toBe(500);
      expect(generateTeam).toHaveBeenCalledOnce();
    } finally {
      error.mockRestore();
    }
  });

  it('serves a ranked single-anchor pool for Great League', async () => {
    const response = await POST(
      new Request('http://localhost/api/generate-team', {
        method: 'POST',
        body: JSON.stringify({
          mode: 'PlayPokemon',
          formatId: 'great-league',
          anchorPokemon: ['Melmetal'],
        }),
      }) as Parameters<typeof POST>[0],
    );
    expect(response.status).toBe(200);
    const result = await response.json();
    expect(result.team[0]).toBe('melmetal');
    expect(result.movesetAssignment.formatId).toBe('great-league');
    expect(generateTeam).not.toHaveBeenCalled();
  });
});
