import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { TeamConfigPanel } from './TeamConfigPanel';
import { getBattleFormats } from '@/lib/data/battleFormats';

vi.mock('@/components/molecules', () => ({
  ModeSelector: () => <div>Mode Selector</div>,
}));

vi.mock('@/components/organisms', async () => {
  const React = await import('react');

  return {
    TeamGenerator: (props: Record<string, unknown>) => {
      const [anchorValue, setAnchorValue] = React.useState('');

      return (
        <div>
          <input
            aria-label="Anchor Mock"
            value={anchorValue}
            onChange={(event) => setAnchorValue(event.target.value)}
          />
          <div data-testid="team-generator-props">
            {Object.keys(props).join(',')}
          </div>
        </div>
      );
    },
  };
});

describe('TeamConfigPanel', () => {
  it('renders the battle format dropdown with expected options and default value', () => {
    render(
      <TeamConfigPanel
        pokemonList={[]}
        selectedFormatId="great-league"
        onFormatChange={vi.fn()}
        mode="PlayPokemon"
        onModeChange={vi.fn()}
        onAnchorsChange={vi.fn()}
        onExclusionsChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
      />,
    );

    const formatSelect = screen.getByRole('combobox', {
      name: 'Battle Format',
    });
    expect(formatSelect).toHaveValue('great-league');

    const optionLabels = screen
      .getAllByRole('option')
      .map((option) => option.textContent);
    expect(optionLabels).toEqual(
      getBattleFormats().map((format) => format.label),
    );
  });

  it('calls onFormatChange when the selected format changes', () => {
    const onFormatChange = vi.fn();

    render(
      <TeamConfigPanel
        pokemonList={[]}
        selectedFormatId="great-league"
        onFormatChange={onFormatChange}
        mode="PlayPokemon"
        onModeChange={vi.fn()}
        onAnchorsChange={vi.fn()}
        onExclusionsChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
      />,
    );

    fireEvent.change(screen.getByRole('combobox', { name: 'Battle Format' }), {
      target: { value: 'ultra-league' },
    });

    expect(onFormatChange).toHaveBeenCalledWith('ultra-league');
  });

  it('resets anchor selection UI when the selected format changes', () => {
    const { rerender } = render(
      <TeamConfigPanel
        pokemonList={[]}
        selectedFormatId="great-league"
        onFormatChange={vi.fn()}
        mode="PlayPokemon"
        onModeChange={vi.fn()}
        onAnchorsChange={vi.fn()}
        onExclusionsChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
      />,
    );

    const anchorInput = screen.getByRole('textbox', { name: 'Anchor Mock' });
    fireEvent.change(anchorInput, { target: { value: 'Azumarill' } });

    expect(anchorInput).toHaveValue('Azumarill');

    rerender(
      <TeamConfigPanel
        pokemonList={[]}
        selectedFormatId="ultra-league"
        onFormatChange={vi.fn()}
        mode="PlayPokemon"
        onModeChange={vi.fn()}
        onAnchorsChange={vi.fn()}
        onExclusionsChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Anchor Mock' })).toHaveValue(
      '',
    );
  });

  it('shows the tournament format selector for non-Battle Frontier formats', () => {
    render(
      <TeamConfigPanel
        pokemonList={[]}
        selectedFormatId="great-league"
        onFormatChange={vi.fn()}
        mode="PlayPokemon"
        onModeChange={vi.fn()}
        onAnchorsChange={vi.fn()}
        onExclusionsChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
      />,
    );

    expect(screen.getByText('Tournament Format')).toBeInTheDocument();
    expect(screen.getByText('Mode Selector')).toBeInTheDocument();
  });

  it('hides the tournament format selector for Battle Frontier formats', () => {
    render(
      <TeamConfigPanel
        pokemonList={[]}
        selectedFormatId="battle-frontier-tsuki-cup"
        onFormatChange={vi.fn()}
        mode="PlayPokemon"
        onModeChange={vi.fn()}
        onAnchorsChange={vi.fn()}
        onExclusionsChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
      />,
    );

    expect(screen.queryByText('Tournament Format')).not.toBeInTheDocument();
    expect(screen.queryByText('Mode Selector')).not.toBeInTheDocument();
  });

  it('does not pass algorithm selection props to TeamGenerator', () => {
    render(
      <TeamConfigPanel
        pokemonList={[]}
        selectedFormatId="great-league"
        onFormatChange={vi.fn()}
        mode="PlayPokemon"
        onModeChange={vi.fn()}
        onAnchorsChange={vi.fn()}
        onExclusionsChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
      />,
    );

    const propNames = screen.getByTestId('team-generator-props').textContent;

    expect(propNames).not.toContain('algorithm');
    expect(propNames).not.toContain('onAlgorithmChange');
  });
});
