import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { TeamManager } from './TeamManager';
import { type BattleFormatId } from '@/lib/data/battleFormats';
import type {
  BenchUtility,
  OptimizerScoreBreakdown,
  PlayPokemonRosterMetrics,
  RecommendedLineup,
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
    rosterMetrics?: PlayPokemonRosterMetrics;
    benchUtility?: BenchUtility[];
  } | null;
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
        <button
          type="button"
          onClick={() => onFormatChange('battle-frontier-bayou-cup')}
        >
          Set Battle Frontier Bayou
        </button>
        <button
          type="button"
          onClick={() => onFormatChange('battle-frontier-master')}
        >
          Set Battle Frontier Master
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
      Results roster metrics{' '}
      {generatedTeam?.rosterMetrics?.viableLineupCount ?? 'none'} bench utility{' '}
      {generatedTeam?.benchUtility?.[0]?.speciesId ?? 'none'}
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

    const fetchMock = vi.fn().mockImplementation((input: RequestInfo | URL) => {
      if (typeof input === 'string' && input.startsWith('/api/pokemon-list')) {
        return Promise.resolve(pokemonListResponse);
      }

      return Promise.resolve({
        ok: true,
        json: vi.fn().mockResolvedValue({
          team: ['Azumarill'],
          fitness: 0.75,
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
          rosterMetrics: {
            viableLineupCount: 12,
            topLineupQuality: 0.88,
            topNLineupDepth: 0.76,
            dominatingMatchupRate: 0.42,
            overwhelmingLossRate: 0.14,
            singleAnswerRisks: ['lanturn'],
            viableLeadDiversity: 3,
            benchUtilitySummary: [],
          },
          benchUtility: [
            {
              speciesId: 'azumarill',
              utilityScore: 0.84,
              totalAppearances: 4,
              leadAppearances: 1,
              switchAppearances: 2,
              closerAppearances: 1,
              warnings: [],
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
          analysis: { generatedAt: '2026-03-15T00:00:00.000Z' },
        }),
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
        '/api/pokemon-list?formatId=great-league',
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
      screen.getByText('Selected Format: great-league'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Set Ultra League'));

    return waitFor(() => {
      expect(
        screen.getByText('Selected Format: ultra-league'),
      ).toBeInTheDocument();
    });
  });

  it('forces PlayPokemon mode for Battle Frontier formats', async () => {
    render(<TeamManager />);

    await waitFor(() => {
      expect(
        screen.getByText('Selected Mode: PlayPokemon'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Set GBL Mode'));

    await waitFor(() => {
      expect(screen.getByText('Selected Mode: GBL')).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Set Battle Frontier Master'));

    await waitFor(() => {
      expect(
        screen.getByText('Selected Format: battle-frontier-master'),
      ).toBeInTheDocument();
      expect(
        screen.getByText('Selected Mode: PlayPokemon'),
      ).toBeInTheDocument();
    });

    fireEvent.click(screen.getByText('Set Battle Frontier Bayou'));

    await waitFor(() => {
      expect(
        screen.getByText('Selected Format: battle-frontier-bayou-cup'),
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
        '/api/pokemon-list?formatId=great-league',
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
        input.startsWith('/api/pokemon-list?formatId=great-league')
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
        '/api/pokemon-list?formatId=great-league',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(screen.getByText('Set Single Anchor'));
    fireEvent.click(screen.getByText('Generate Team'));

    await waitFor(() => {
      expect(showToastMock).toHaveBeenCalledWith(
        'Selected anchor is not eligible for great-league: Marowak',
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
        '/api/pokemon-list?formatId=great-league',
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
        '/api/pokemon-list?formatId=great-league',
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
        '/api/pokemon-list?formatId=great-league',
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

  it('passes roster metrics and bench utility response data to ResultsPanel', async () => {
    const fetchMock = vi.mocked(fetch);

    render(<TeamManager />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        '/api/pokemon-list?formatId=great-league',
        expect.objectContaining({ signal: expect.any(AbortSignal) }),
      );
    });

    fireEvent.click(screen.getByText('Generate Team'));

    await waitFor(() => {
      expect(
        screen.getByText(/Results roster metrics 12 bench utility azumarill/),
      ).toBeInTheDocument();
    });
  });

  it.each([
    'Battle Frontier Master anchors exceed the 11-point cap.',
    'Battle Frontier Master anchors can include at most one 5-point Pokemon.',
    'Battle Frontier Master anchors can include at most one Mega Pokemon.',
  ])(
    'shows Battle Frontier Master legality failures to the user: %s',
    async (errorMessage) => {
      const fetchMock = vi
        .fn()
        .mockImplementation((input: RequestInfo | URL) => {
          if (
            typeof input === 'string' &&
            input.startsWith('/api/pokemon-list')
          ) {
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
          '/api/pokemon-list?formatId=great-league',
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
      });

      fireEvent.click(screen.getByText('Set Battle Frontier Master'));

      await waitFor(() => {
        expect(fetchMock).toHaveBeenCalledWith(
          '/api/pokemon-list?formatId=battle-frontier-master',
          expect.objectContaining({ signal: expect.any(AbortSignal) }),
        );
      });

      fireEvent.click(screen.getByText('Generate Team'));

      await waitFor(() => {
        expect(screen.getByRole('alert')).toHaveTextContent(errorMessage);
      });

      expect(showToastMock).toHaveBeenCalledWith(errorMessage, 'error');
      expect(screen.getByText('Analysis none missing')).toBeInTheDocument();
    },
  );
});
