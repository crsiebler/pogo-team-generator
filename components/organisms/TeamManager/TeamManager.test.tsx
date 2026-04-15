import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterEach, vi } from 'vitest';
import { TeamManager } from './TeamManager';
import { type BattleFormatId } from '@/lib/data/battleFormats';

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

interface MockAnalysisPanelProps {
  fitness: number | null;
  analysis: unknown;
}

vi.mock('@/components/organisms', () => ({
  TeamConfigPanel: ({
    selectedFormatId,
    mode,
    onFormatChange,
    onModeChange,
    onAnchorsChange,
    onGenerate,
    errorMessage,
  }: MockTeamConfigPanelProps) => (
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
  ),
  ResultsPanel: () => <div>Results</div>,
  AnalysisPanel: ({ fitness, analysis }: MockAnalysisPanelProps) => (
    <div>
      Analysis {fitness ?? 'none'} {analysis ? 'loaded' : 'missing'}
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
      expect(screen.getByText('Analysis 0.75 loaded')).toBeInTheDocument();
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
