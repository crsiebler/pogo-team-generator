import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { TeamManager } from './TeamManager';
import { type BattleFormatId } from '@/lib/data/battleFormats';

const showToastMock = vi.fn();

interface MockTeamConfigPanelProps {
  selectedFormatId: BattleFormatId;
  onFormatChange: (formatId: BattleFormatId) => void;
  onAnchorsChange: (anchors: string[]) => void;
  onGenerate: () => void;
}

vi.mock('@/components/organisms', () => ({
  TeamConfigPanel: ({
    selectedFormatId,
    onFormatChange,
    onAnchorsChange,
    onGenerate,
  }: MockTeamConfigPanelProps) => (
    <div>
      <div>Selected Format: {selectedFormatId}</div>
      <button type="button" onClick={() => onFormatChange('ultra-league')}>
        Set Ultra League
      </button>
      <button
        type="button"
        onClick={() => onAnchorsChange(['Marowak', 'Marowak (Shadow)'])}
      >
        Set Invalid Anchors
      </button>
      <button type="button" onClick={onGenerate}>
        Generate Team
      </button>
    </div>
  ),
  ResultsPanel: () => <div>Results</div>,
}));

vi.mock('@/lib/hooks/useToast', () => ({
  useToast: () => ({
    showToast: showToastMock,
  }),
}));

describe('TeamManager', () => {
  beforeEach(() => {
    showToastMock.mockClear();
    vi.clearAllMocks();
  });

  it('blocks generation when anchors contain duplicate base species', async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal('fetch', fetchMock);

    render(<TeamManager pokemonList={['Marowak', 'Marowak (Shadow)']} />);

    fireEvent.click(screen.getByText('Set Invalid Anchors'));
    fireEvent.click(screen.getByText('Generate Team'));

    await waitFor(() => {
      expect(fetchMock).not.toHaveBeenCalled();
      expect(showToastMock).toHaveBeenCalledWith(
        'Team cannot be generated due to multiple identical species.',
        'error',
      );
    });
  });

  it('stores selected battle format in TeamManager state', () => {
    render(<TeamManager pokemonList={['Azumarill', 'Skarmory']} />);

    expect(
      screen.getByText('Selected Format: great-league'),
    ).toBeInTheDocument();

    fireEvent.click(screen.getByText('Set Ultra League'));

    expect(
      screen.getByText('Selected Format: ultra-league'),
    ).toBeInTheDocument();
  });

  it('sends selected format id in generate-team request payload', async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: vi.fn().mockResolvedValue({ team: ['Azumarill'] }),
    });

    vi.stubGlobal('fetch', fetchMock);

    render(<TeamManager pokemonList={['Azumarill', 'Skarmory']} />);

    fireEvent.click(screen.getByText('Set Ultra League'));
    fireEvent.click(screen.getByText('Generate Team'));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalled();
    });

    const [, options] = fetchMock.mock.calls[0] as [
      string,
      RequestInit & { body: string },
    ];
    const payload = JSON.parse(options.body) as {
      formatId: string;
    };

    expect(payload.formatId).toBe('ultra-league');
  });
});
