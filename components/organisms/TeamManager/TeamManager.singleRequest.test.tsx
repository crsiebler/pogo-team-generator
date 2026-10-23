import { StrictMode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamManager } from './TeamManager';
import { ResultsPanel } from '@/components/organisms/ResultsPanel/ResultsPanel';
import type {
  GenerationResponse,
  PokemonWithMoves,
  RosterMovesetAssignment,
  TournamentMode,
} from '@/lib/types';

const pickSix = [
  'azumarill',
  'skarmory',
  'registeel',
  'garchomp',
  'lanturn',
  'decidueye',
];
const freshPickSix = [
  'melmetal',
  'altaria',
  'mimikyu',
  'clodsire',
  'carbink',
  'araquanid',
];

function makeGenerationResponse(
  formatId: 'play-pokemon' | 'great-league',
  mode: TournamentMode,
  suffix: string,
): GenerationResponse {
  const roster = suffix === 'fresh' ? freshPickSix : pickSix;
  const team = mode === 'GBL' ? roster.slice(0, 3) : roster;
  const authority = {
    source: 'manifest' as const,
    schemaVersion: 1,
    policyVersion: 'ranking-evidence-v1',
  };
  const movesetAssignment: RosterMovesetAssignment = {
    formatId,
    authorityBySpeciesId: Object.fromEntries(
      team.map((speciesId) => [speciesId, authority]),
    ),
    variantsBySpeciesId: Object.fromEntries(
      team.map((speciesId) => [
        speciesId,
        {
          id: 'bubble--ice_beam--play_rough',
          fastMove: 'BUBBLE',
          chargedMove1: 'ICE_BEAM',
          chargedMove2: 'PLAY_ROUGH',
          isDefault: true,
        },
      ]),
    ),
    fingerprint: `single-request-${suffix}`,
  };
  const pokemon: PokemonWithMoves[] = team.map((speciesId, index) => ({
    dex: index + 1,
    speciesName: `${speciesId}-${suffix}`,
    speciesId,
    baseStats: { atk: 100, def: 100, hp: 100 },
    types: ['water'],
    fastMoves: ['BUBBLE'],
    chargedMoves: ['ICE_BEAM', 'PLAY_ROUGH'],
    tags: [],
    defaultIVs: {},
    buddyDistance: 3,
    thirdMoveCost: 10000,
    released: true,
    recommendedMoveset: {
      ...movesetAssignment.variantsBySpeciesId[speciesId]!,
      authority,
      acquisitionRequirements: {
        fastMove: { kind: 'regular' },
        chargedMove1: { kind: suffix === 'fresh' ? 'regular' : 'elite' },
        chargedMove2: {
          kind: suffix === 'fresh' ? 'eventExclusive' : 'regular',
        },
      },
    },
  }));

  return {
    team,
    fitness: 0.75,
    movesetAssignment,
    analysis: {
      mode,
      teamSize: team.length,
      generatedAt: '2026-10-22T00:00:00.000Z',
      threats: { evaluatedCount: 0, entries: [] },
      coreBreakers: { threshold: 0, entries: [] },
      shieldScenarios: {
        '0-0': { coveredThreats: 0, evaluatedThreats: 0, coverageRate: 0 },
        '1-1': { coveredThreats: 0, evaluatedThreats: 0, coverageRate: 0 },
        '2-2': { coveredThreats: 0, evaluatedThreats: 0, coverageRate: 0 },
      },
      pokemonContributions: {
        entries: [
          {
            speciesId: team[0]!,
            pokemon: `${team[0]}-${suffix}`,
            threatsHandled: 3,
            coverageAdded: 2,
            highSeverityRelief: 1,
            fragilityRiskTier: 'low',
          },
        ],
      },
    },
    pokemon,
  };
}

function jsonResponse(payload: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => payload };
}

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((complete) => {
    resolve = complete;
  });
  return { promise, resolve };
}

function expectedExport(team: readonly string[], fresh: boolean): string {
  return [
    ...team.map((id) => `${id},BUBBLE,ICE_BEAM,PLAY_ROUGH`),
    '# Acquisition requirements',
    ...team.map(
      (id) =>
        `# ${id}: ${fresh ? 'PLAY_ROUGH (event-exclusive)' : 'ICE_BEAM (Elite Charged TM)'}`,
    ),
  ].join('\n');
}

describe.each([
  {
    label: 'Play! Pokémon Pick 6',
    formatId: 'play-pokemon',
    mode: 'PlayPokemon',
  },
  { label: 'Great League GBL', formatId: 'great-league', mode: 'GBL' },
] as const)('$label single-request generation', ({ formatId, mode }) => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('renders and exports each response across failure, retry, and regeneration', async () => {
    const initial = makeGenerationResponse(formatId, mode, 'initial');
    const fresh = makeGenerationResponse(formatId, mode, 'fresh');
    const pendingResponse = deferred<ReturnType<typeof jsonResponse>>();
    const queuedGenerationResponses: Array<
      ReturnType<typeof jsonResponse> | Promise<ReturnType<typeof jsonResponse>>
    > = [
      jsonResponse(initial),
      pendingResponse.promise,
      jsonResponse({
        ...makeGenerationResponse(formatId, mode, 'fresh'),
        pokemon: [],
      }),
      jsonResponse(fresh),
    ];
    const requests: Array<{ url: string; method: string }> = [];
    const fetchMock = vi.fn(
      async (input: RequestInfo | URL, init?: RequestInit) => {
        const url = String(input);
        const method = init?.method ?? 'GET';
        requests.push({ url, method });

        if (url.startsWith('/api/pokemon-list')) {
          return jsonResponse({ pokemon: pickSix });
        }
        if (url === '/api/generate-team' && method === 'POST') {
          const response = queuedGenerationResponses.shift();
          if (!response) throw new Error('No generation response remains.');
          return response;
        }
        throw new Error(`Unexpected request: ${method} ${url}`);
      },
    );
    const clipboardWrite = vi
      .fn<(text: string) => Promise<void>>()
      .mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', {
      configurable: true,
      value: { writeText: clipboardWrite },
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const view = render(
      <StrictMode>
        <TeamManager />
      </StrictMode>,
    );

    if (mode === 'GBL') {
      fireEvent.change(screen.getByLabelText('Battle Format'), {
        target: { value: formatId },
      });
      fireEvent.click(screen.getByRole('button', { name: /GO Battle League/ }));
    }

    const generateButton = await screen.findByRole('button', {
      name: 'Generate Optimized Team',
    });
    await waitFor(() => expect(generateButton).toBeEnabled());

    fireEvent.click(generateButton);
    await waitFor(() =>
      expect(screen.getAllByText(/^Dex #/)).toHaveLength(
        mode === 'GBL' ? 3 : 6,
      ),
    );
    const contributionToggle = screen.getByRole('button', {
      name: 'Per-Pokemon Contribution',
    });
    expect(contributionToggle).toBeInTheDocument();
    fireEvent.click(contributionToggle);
    expect(screen.getAllByText(teamName('initial')).length).toBeGreaterThan(0);
    expect(
      requests.filter(
        ({ url, method }) => url === '/api/generate-team' && method === 'POST',
      ),
    ).toHaveLength(1);
    expect(requests.some(({ url }) => url === '/api/team-details')).toBe(false);

    fireEvent.click(
      screen.getByRole('button', { name: 'Copy team export to clipboard' }),
    );
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));
    const firstExport = clipboardWrite.mock.calls[0]?.[0] ?? '';
    expect(firstExport).toContain('BUBBLE,ICE_BEAM,PLAY_ROUGH');
    expect(firstExport).toContain('ICE_BEAM (Elite Charged TM)');
    expect(firstExport).toBe(expectedExport(initial.team, false));

    fireEvent.click(generateButton);
    await waitFor(() =>
      expect(
        requests.filter(
          ({ url, method }) =>
            url === '/api/generate-team' && method === 'POST',
        ),
      ).toHaveLength(2),
    );
    expect(generateButton).toBeDisabled();
    expect(screen.queryAllByText(/^Dex #/)).toHaveLength(0);
    expect(
      screen.queryByRole('button', { name: 'Copy team export to clipboard' }),
    ).not.toBeInTheDocument();

    pendingResponse.resolve(
      jsonResponse(
        { error: 'Ranking export is unavailable for this format.' },
        false,
        400,
      ),
    );
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Ranking export is unavailable for this format.',
      ),
    );
    expect(generateButton).toBeEnabled();

    fireEvent.click(generateButton);
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Generation response is invalid. Please try again.',
      ),
    );
    expect(screen.queryAllByText(/^Dex #/)).toHaveLength(0);

    fireEvent.click(generateButton);
    await waitFor(() =>
      expect(screen.getAllByText(/^Dex #/)).toHaveLength(
        mode === 'GBL' ? 3 : 6,
      ),
    );
    expect(screen.getAllByText(/melmetal-fresh/)).toHaveLength(2);
    expect(screen.queryByText(/azumarill-initial/)).not.toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Per-Pokemon Contribution' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText(teamName('fresh')).length).toBeGreaterThan(0);

    clipboardWrite.mockClear();
    fireEvent.click(
      screen.getByRole('button', { name: 'Copy team export to clipboard' }),
    );
    await waitFor(() => expect(clipboardWrite).toHaveBeenCalledTimes(1));
    const freshExport = clipboardWrite.mock.calls[0]?.[0] ?? '';
    expect(freshExport).toContain('BUBBLE,ICE_BEAM,PLAY_ROUGH');
    expect(freshExport).toContain('PLAY_ROUGH (event-exclusive)');
    expect(freshExport).not.toContain('initial');
    expect(freshExport).not.toContain('Elite Charged TM');
    expect(freshExport).toBe(expectedExport(fresh.team, true));

    expect(
      requests.filter(
        ({ url, method }) => url === '/api/generate-team' && method === 'POST',
      ),
    ).toHaveLength(4);
    expect(requests.some(({ url }) => url === '/api/team-details')).toBe(false);
    expect(
      requests.filter(({ url }) => url.startsWith('/api/pokemon-list')).length,
    ).toBeGreaterThan(0);

    const requestCount = requests.length;
    view.rerender(
      <StrictMode>
        <TeamManager />
      </StrictMode>,
    );
    expect(requests).toHaveLength(requestCount);
    view.unmount();
    const result = (
      <StrictMode>
        <ResultsPanel generatedTeam={{ ...fresh, mode }} isGenerating={false} />
      </StrictMode>
    );
    const remounted = render(result);
    remounted.rerender(result);
    expect(screen.getAllByText(/^Dex #/)).toHaveLength(fresh.team.length);
    expect(requests).toHaveLength(requestCount);
  });
});

function teamName(suffix: string): string {
  return `${suffix === 'fresh' ? freshPickSix[0] : pickSix[0]}-${suffix}`;
}
