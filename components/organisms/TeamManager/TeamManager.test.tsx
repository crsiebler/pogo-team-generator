import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { TeamManager } from './TeamManager';

const showToastMock = vi.fn();

interface MockTeamConfigPanelProps {
  onAnchorsChange: (anchors: string[]) => void;
  onGenerate: () => void;
}

vi.mock('@/components/organisms', () => ({
  TeamConfigPanel: ({
    onAnchorsChange,
    onGenerate,
  }: MockTeamConfigPanelProps) => (
    <div>
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
});
