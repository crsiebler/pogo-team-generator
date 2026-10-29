import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { TeamManager } from './TeamManager';
import { type BattleFormatId } from '@/lib/data/battleFormats';
import type {
  GenerationResponse,
  OptimizerScoreBreakdown,
  PokemonWithMoves,
  RecommendedLineup,
  RosterMovesetAssignment,
  TournamentMode,
} from '@/lib/types';

const showToastMock = vi.fn();

interface MockTeamConfigPanelProps {
  selectedFormatId: BattleFormatId;
  mode: string;
  onFormatChange: (formatId: BattleFormatId) => void;
  onModeChange: (mode: 'PlayPokemon' | 'GBL') => void;
  onAnchorsChange: (anchors: string[]) => void;
  onGenerate: () => void;
  errorMessage?: string | null;
}

const teamConfigPanelProps: Array<
  MockTeamConfigPanelProps & Record<string, unknown>
> = [];

interface MockAnalysisPanelProps {
  generatedTeam: {
    recommendedLineups?: RecommendedLineup[];
    scoreBreakdown?: OptimizerScoreBreakdown;
  } | null;
  fitness: number | null;
  analysis: unknown;
}

interface MockResultsPanelProps {
  generatedTeam: {
    team?: string[];
    mode?: TournamentMode;
    movesetAssignment?: RosterMovesetAssignment;
    pokemon?: PokemonWithMoves[];
  } | null;
}

const pickSix = [
  'azumarill',
  'skarmory',
  'registeel',
  'garchomp',
  'lanturn',
  'decidueye',
];

function makeResponse(
  formatId: BattleFormatId,
  mode: TournamentMode,
): GenerationResponse {
  const team = mode === 'GBL' ? pickSix.slice(0, 3) : pickSix;
  const authority = {
    source: 'manifest' as const,
    schemaVersion: 1,
    policyVersion: 'ranking-evidence-v1',
  };
  const variant = {
    id: 'bubble--ice_beam--play_rough' as const,
    fastMove: 'BUBBLE',
    chargedMove1: 'ICE_BEAM',
    chargedMove2: 'PLAY_ROUGH',
    isDefault: true,
  };
  const movesetAssignment: RosterMovesetAssignment = {
    formatId,
    authorityBySpeciesId: Object.fromEntries(
      team.map((speciesId) => [speciesId, authority]),
    ),
    variantsBySpeciesId: Object.fromEntries(
      team.map((speciesId) => [speciesId, variant]),
    ),
    fingerprint: 'team-manager-assignment',
  };
  const pokemon: PokemonWithMoves[] = team.map((speciesId, index) => ({
    dex: index + 1,
    speciesName: speciesId,
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
      ...variant,
      authority,
      acquisitionRequirements: {
        fastMove: { kind: 'regular' },
        chargedMove1: { kind: 'elite' },
        chargedMove2: { kind: 'regular' },
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
      generatedAt: '2026-03-15T00:00:00.000Z',
      threats: { evaluatedCount: 0, entries: [] },
      coreBreakers: { threshold: 0, entries: [] },
      shieldScenarios: {
        '0-0': { coveredThreats: 0, evaluatedThreats: 0, coverageRate: 0 },
        '1-1': { coveredThreats: 0, evaluatedThreats: 0, coverageRate: 0 },
        '2-2': { coveredThreats: 0, evaluatedThreats: 0, coverageRate: 0 },
      },
      pokemonContributions: { entries: [] },
    },
    pokemon,
    recommendedLineups: [
      {
        lineup: {
          lead: 'azumarill',
          switch: 'skarmory',
          closer: 'registeel',
        },
        score: 0.82,
        coverageMetrics: {
          coverageRate: 0.7,
          dominatingMatchupCount: 5,
          overwhelmingLossCount: 2,
          singleAnswerThreatCount: 1,
        },
        coveredThreats: [],
        weaknesses: [],
        diagnosticLabel: 'ABC',
      },
    ],
    scoreBreakdown: {
      components: {
        synergy: 0.91,
        coverage: 0.82,
        safety: 0.68,
        consistency: 0.57,
        bulk: 0.44,
        defensiveRatio: 0.72,
        offensiveRatio: 0.61,
        role: 0.38,
      },
      weights: {
        synergy: 0.24,
        coverage: 0.21,
        safety: 0.17,
        consistency: 0.13,
        bulk: 0.1,
        defensiveRatio: 0.07,
        offensiveRatio: 0.05,
        role: 0.03,
      },
      score: 0.74,
    },
  };
}

vi.mock('@/components/organisms', () => ({
  TeamConfigPanel: (
    props: MockTeamConfigPanelProps & Record<string, unknown>,
  ) => {
    teamConfigPanelProps.push(props);

    const {
      selectedFormatId,
      mode,
      onFormatChange,
      onModeChange,
      onAnchorsChange,
      onGenerate,
      errorMessage,
    } = props;

    return (
      <div>
        <div>Selected Format: {selectedFormatId}</div>
        <div>Selected Mode: {mode}</div>
        <button type="button" onClick={() => onFormatChange('ultra-league')}>
          Set Ultra League
        </button>
        <button type="button" onClick={() => onModeChange('GBL')}>
          Set GBL Mode
        </button>
        <button type="button" onClick={() => onFormatChange('play-pokemon')}>
          Set Play Pokemon
        </button>
        <button
          type="button"
          onClick={() => onFormatChange('battle-frontier-tsuki-cup')}
        >
          Set Battle Frontier Tsuki
        </button>
        <button
          type="button"
          onClick={() => onFormatChange('battle-frontier-coupe-du-sillage')}
        >
          Set Battle Frontier Coupe du Sillage
        </button>
        <button
          type="button"
          onClick={() => onAnchorsChange(['Marowak', 'Marowak (Shadow)'])}
        >
          Set Invalid Anchors
        </button>
        <button type="button" onClick={() => onAnchorsChange(['Marowak'])}>
          Set Single Anchor
        </button>
        <button type="button" onClick={onGenerate}>
          Generate Team
        </button>
        {errorMessage ? <div role="alert">{errorMessage}</div> : null}
      </div>
    );
  },
  ResultsPanel: ({ generatedTeam }: MockResultsPanelProps) => (
    <div>
      Results team {generatedTeam?.team?.join(', ') ?? 'none'} assignment{' '}
      {generatedTeam?.movesetAssignment?.fingerprint ?? 'none'}
      {' details '}
      {generatedTeam?.pokemon?.map(({ speciesId }) => speciesId).join(', ') ??
        'none'}
      {' mode '}
      {generatedTeam?.mode ?? 'none'}
    </div>
  ),
  AnalysisPanel: ({
    generatedTeam,
    fitness,
    analysis,
  }: MockAnalysisPanelProps) => (
    <div>
      Analysis {fitness ?? 'none'} {analysis ? 'loaded' : 'missing'}
      {generatedTeam?.recommendedLineups?.[0]
        ? ` ${generatedTeam.recommendedLineups.length} lineups ${generatedTeam.recommendedLineups[0].lineup.lead} ${generatedTeam.recommendedLineups[0].score} ${generatedTeam.recommendedLineups[0].diagnosticLabel}`
        : ''}
      {generatedTeam?.scoreBreakdown
        ? ` optimizer ${generatedTeam.scoreBreakdown.components.synergy} ${generatedTeam.scoreBreakdown.components.role}`
        : ''}
    </div>
  ),
}));

vi.mock('@/lib/hooks/useToast', () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

describe('TeamManager', () => {
  const pokemonListResponse = {
    ok: true,
    json: vi.fn().mockResolvedValue({
      pokemon: ['Marowak', 'Marowak (Shadow)', 'Azumarill', 'Skarmory'],
      count: 4,
    }),
  };

  beforeEach(() => {
    teamConfigPanelProps.length = 0;
    showToastMock.mockClear();
    vi.clearAllMocks();
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    const fetchMock = vi
      .fn()
      .mockImplementation((input: RequestInfo | URL, options?: RequestInit) => {
        if (
          typeof input === 'string' &&
          input.startsWith('/api/pokemon-list')
        ) {
          return Promise.resolve(pokemonListResponse);
        }

        const requestBody = JSON.parse(options?.body as string) as {
          formatId: BattleFormatId;
          mode: TournamentMode;
        };

        return Promise.resolve({
          ok: true,
          json: vi
            .fn()
            .mockResolvedValue(
              makeResponse(requestBody.formatId, requestBody.mode),
            ),
        });
      });

    vi.stubGlobal('fetch', fetchMock);
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  it('blocks generation when anchors contain duplicate base species', async () => {
    const fetchMock = vi.mocked(fetch);

    render(<TeamManager />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pokemon-list?formatId=play-pokemon',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(screen.getByText('Set Invalid Anchors'));
    fireEvent.click(screen.getByText('Generate Team'));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        'Team cannot be generated due to multiple identical species.',
        'error',
      );
    });

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/generate-team',
      expect.anything(),
    );
  });

  it('stores selected battle format in TeamManager state', () => {
    render(<TeamManager />);

    expect(
      screen.getByText('Selected Format: play-pokemon'),
    ).toBeInTheDocument();
    expect(screen.getByText('Selected Mode: PlayPokemon')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Set Ultra League'));

    return waitFor(() => {
      expect(
        screen.getByText('Selected Format: ultra-league'),
      ).toBeInTheDocument();
    });
  });

  it.each(['PlayPokemon', 'GBL'] as const)(
    'generates %s without a search-depth option',
    async (choice) => {
      render(<TeamManager />);
      if (choice === 'GBL')
        fireEvent.click(screen.getByText('Set Ultra League'));
      await waitFor(() =>
        expect(teamConfigPanelProps.at(-1)?.pokemonList).toContain('Azumarill'),
      );
      if (choice === 'GBL') fireEvent.click(screen.getByText('Set GBL Mode'));
      fireEvent.click(screen.getByText('Generate Team'));
      await waitFor(() =>
        expect(fetch).toHaveBeenCalledWith(
          '/api/generate-team',
          expect.anything(),
        ),
      );
      const call = vi
        .mocked(fetch)
        .mock.calls.find(([url]) => url === '/api/generate-team');
      const payload = JSON.parse(call![1]!.body as string);
      expect(payload.mode).toBe(choice);
      expect(payload).not.toHaveProperty('searchDepth');
      const expectedTeam = choice === 'GBL' ? pickSix.slice(0, 3) : pickSix;
      await waitFor(() =>
        expect(
          screen.getByText(new RegExp(`details ${expectedTeam.join(', ')}`)),
        ).toBeInTheDocument(),
      );
      expect(
        vi
          .mocked(fetch)
          .mock.calls.filter(([url]) => url === '/api/generate-team'),
      ).toHaveLength(1);
    },
  );

  it('switches from Pick 3 to Pick 6 when selecting Play Pokemon', async () => {
    render(<TeamManager />);
    fireEvent.click(screen.getByText('Set Ultra League'));
    fireEvent.click(screen.getByText('Set GBL Mode'));
    expect(screen.getByText('Selected Mode: GBL')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Set Play Pokemon'));
    expect(screen.getByText('Selected Mode: PlayPokemon')).toBeInTheDocument();
    fireEvent.click(screen.getByText('Set Ultra League'));
    fireEvent.click(screen.getByText('Set GBL Mode'));
    expect(screen.getByText('Selected Mode: GBL')).toBeInTheDocument();
  });

  it('forces PlayPokemon mode for Battle Frontier formats', async () => {
    render(<TeamManager />);

    await waitFor(() => {
      expect(
        screen.getByText('Selected Mode: PlayPokemon'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Set Ultra League'));
    fireEvent.click(screen.getByText('Set GBL Mode'));

    await waitFor(() => {
      expect(screen.getByText('Selected Mode: GBL')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Set Battle Frontier Coupe du Sillage'));

    await waitFor(() => {
      expect(
        screen.getByText('Selected Format: battle-frontier-coupe-du-sillage'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Selected Mode: PlayPokemon'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Set Battle Frontier Tsuki'));

    await waitFor(() => {
      expect(
        screen.getByText('Selected Format: battle-frontier-tsuki-cup'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Selected Mode: PlayPokemon'),
      ).toBeInTheDocument();
    });
  });

  it('sends selected format id in generate-team request payload', async () => {
    const fetchMock = vi.mocked(fetch);

    render(<TeamManager />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pokemon-list?formatId=play-pokemon',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(screen.getByText('Set Ultra League'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pokemon-list?formatId=ultra-league',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(screen.getByText('Generate Team'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/generate-team',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const postCall = fetchMock.mock.calls.find(
      ([url]) => url === '/api/generate-team',
    );

    expect(postCall).toBeDefined();

    const [, options] = postCall as [string, RequestInit & { body: string }];
    const payload = JSON.parse(options.body) as {
      formatId: string;
    };

    expect(payload.formatId).toBe('ultra-league');
  });

  it('omits moveset variation props and request options', async () => {
    const fetchMock = vi.mocked(fetch);

    render(<TeamManager />);

    await waitFor(() => {
      expect(teamConfigPanelProps.length).toBeGreaterThan(0);
    });

    expect(teamConfigPanelProps.at(-1)).not.toHaveProperty(
      'simulateMovesetVariants',
    );
    expect(teamConfigPanelProps.at(-1)).not.toHaveProperty(
      'onSimulateMovesetVariantsChange',
    );

    fireEvent.click(screen.getByText('Generate Team'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/generate-team',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const postCall = fetchMock.mock.calls.find(
      ([url]) => url === '/api/generate-team',
    );
    const [, options] = postCall as [string, RequestInit & { body: string }];
    const payload = JSON.parse(options.body) as Record<string, unknown>;

    expect(payload).not.toHaveProperty('simulateMovesetVariants');
  });

  it('does not pass algorithm selection props to TeamConfigPanel or generate-team', async () => {
    const fetchMock = vi.mocked(fetch);

    render(<TeamManager />);

    await waitFor(() => {
      expect(teamConfigPanelProps.length).toBeGreaterThan(0);
    });

    expect(teamConfigPanelProps.at(-1)).not.toHaveProperty('algorithm');
    expect(teamConfigPanelProps.at(-1)).not.toHaveProperty('onAlgorithmChange');

    fireEvent.click(screen.getByText('Generate Team'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/generate-team',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const postCall = fetchMock.mock.calls.find(
      ([url]) => url === '/api/generate-team',
    );

    expect(postCall).toBeDefined();

    const [, options] = postCall as [string, RequestInit & { body: string }];
    const payload = JSON.parse(options.body) as Record<string, unknown>;

    expect(payload).not.toHaveProperty('algorithm');
  });

  it('blocks generation when anchor is not eligible for selected format', async () => {
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (
        typeof input === 'string' &&
        input.startsWith('/api/pokemon-list?formatId=play-pokemon')
      ) {
        return Promise.resolve({
          ok: true,
          json: vi.fn().mockResolvedValue({
            pokemon: ['Azumarill'],
            count: 1,
          }),
        });
      }

      return Promise.resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({ team: ['Azumarill'] }),
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<TeamManager />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pokemon-list?formatId=play-pokemon',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(screen.getByText('Set Single Anchor'));
    fireEvent.click(screen.getByText('Generate Team'));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        'Selected anchor is not eligible for play-pokemon: Marowak',
        'error',
      );
    });

    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/generate-team',
      expect.anything(),
    );
  });

  it('passes fitness and analysis response data to AnalysisPanel', async () => {
    const fetchMock = vi.mocked(fetch);

    render(<TeamManager />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pokemon-list?formatId=play-pokemon',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(screen.getByText('Generate Team'));

    await waitFor(() => {
      expect(screen.getByText(/Analysis 0.75 loaded/)).toBeInTheDocument();
    });
  });

  it('passes recommended lineups response data to AnalysisPanel', async () => {
    const fetchMock = vi.mocked(fetch);

    render(<TeamManager />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pokemon-list?formatId=play-pokemon',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(screen.getByText('Generate Team'));

    await waitFor(() => {
      expect(
        screen.getByText(/Analysis 0.75 loaded 1 lineups azumarill 0.82 ABC/),
      ).toBeInTheDocument();
    });
  });

  it('passes optimizer score breakdown response data to AnalysisPanel', async () => {
    const fetchMock = vi.mocked(fetch);

    render(<TeamManager />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pokemon-list?formatId=play-pokemon',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(screen.getByText('Generate Team'));

    await waitFor(() => {
      expect(
        screen.getByText(/Analysis 0.75 loaded .* optimizer 0.91 0.38/),
      ).toBeInTheDocument();
    });
  });

  it('passes generated team data to ResultsPanel without roster metrics display diagnostics', async () => {
    const fetchMock = vi.mocked(fetch);

    render(<TeamManager />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pokemon-list?formatId=play-pokemon',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(screen.getByText('Generate Team'));

    await waitFor(() => {
      expect(
        screen.getByText(
          new RegExp(
            `Results team ${pickSix.join(', ')} assignment team-manager-assignment details ${pickSix.join(', ')}`,
          ),
        ),
      ).toBeInTheDocument();
    });
  });

  it('rejects incomplete response details and allows an explicit retry', async () => {
    const validResponse = makeResponse('play-pokemon', 'PlayPokemon');
    const incompleteResponse = {
      ...validResponse,
      pokemon: validResponse.pokemon.slice(0, -1),
    };
    let generationResponse: unknown = validResponse;
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (typeof input === 'string' && input.startsWith('/api/pokemon-list')) {
        return Promise.resolve(pokemonListResponse);
      }

      return Promise.resolve({
        ok: true,
        json: vi
          .fn()
          .mockImplementation(() => Promise.resolve(generationResponse)),
      });
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<TeamManager />);
    await waitFor(() =>
      expect(teamConfigPanelProps.at(-1)?.pokemonList).toContain('Azumarill'),
    );

    fireEvent.click(screen.getByText('Generate Team'));
    await waitFor(() =>
      expect(
        screen.getByText(/details azumarill, skarmory/),
      ).toBeInTheDocument(),
    );

    generationResponse = incompleteResponse;
    fireEvent.click(screen.getByText('Generate Team'));
    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Generation response is invalid. Please try again.',
      ),
    );
    expect(
      screen.getByText(/Results team none assignment none details none/),
    ).toBeInTheDocument();

    generationResponse = validResponse;
    fireEvent.click(screen.getByText('Generate Team'));
    await waitFor(() =>
      expect(
        screen.getByText(new RegExp(`details ${pickSix.join(', ')}`)),
      ).toBeInTheDocument(),
    );
    expect(
      fetchMock.mock.calls.filter(([url]) => url === '/api/generate-team'),
    ).toHaveLength(3);
    expect(fetchMock).not.toHaveBeenCalledWith(
      '/api/team-details',
      expect.anything(),
    );
  });

  it('shows generation API failures to the user for Battle Frontier formats', async () => {
    const errorMessage = 'Battle Frontier format data is unavailable.';
    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (typeof input === 'string' && input.startsWith('/api/pokemon-list')) {
        return Promise.resolve(pokemonListResponse);
      }

      return Promise.resolve({
        ok: false,
        json: vi.fn().mockResolvedValue({ error: errorMessage }),
      });
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<TeamManager />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pokemon-list?formatId=play-pokemon',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(screen.getByText('Set Battle Frontier Coupe du Sillage'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pokemon-list?formatId=battle-frontier-coupe-du-sillage',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(screen.getByText('Generate Team'));

    await waitFor(() => {
      expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
    });

    expect(showToastMock).toHaveBeenCalledWith(errorMessage, 'error');
    expect(screen.getByText('Analysis none missing')).toBeInTheDocument();
  });
});
