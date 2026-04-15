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
    TeamGenerator: () => {
      const [anchorValue, setAnchorValue] = React.useState('');

      return (
        <input
          aria-label="Anchor Mock"
          value={anchorValue}
          onChange={(event) => setAnchorValue(event.target.value)}
        />
      );
    },
  };
});

describe('TeamConfigPanel', () => {
  it('renders the battle format dropdown with expected options and default value', () => {
    render(
      <TeamConfigPanel
        pokemonList={[]}
        battleFrontierMasterPointsByPokemonName={{}}
        selectedFormatId="great-league"
        onFormatChange={vi.fn()}
        mode="PlayPokemon"
        onModeChange={vi.fn()}
        onAnchorsChange={vi.fn()}
        onExclusionsChange={vi.fn()}
        algorithm="individual"
        onAlgorithmChange={vi.fn()}
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
        battleFrontierMasterPointsByPokemonName={{}}
        selectedFormatId="great-league"
        onFormatChange={onFormatChange}
        mode="PlayPokemon"
        onModeChange={vi.fn()}
        onAnchorsChange={vi.fn()}
        onExclusionsChange={vi.fn()}
        algorithm="individual"
        onAlgorithmChange={vi.fn()}
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
        battleFrontierMasterPointsByPokemonName={{}}
        selectedFormatId="great-league"
        onFormatChange={vi.fn()}
        mode="PlayPokemon"
        onModeChange={vi.fn()}
        onAnchorsChange={vi.fn()}
        onExclusionsChange={vi.fn()}
        algorithm="individual"
        onAlgorithmChange={vi.fn()}
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
        battleFrontierMasterPointsByPokemonName={{}}
        selectedFormatId="ultra-league"
        onFormatChange={vi.fn()}
        mode="PlayPokemon"
        onModeChange={vi.fn()}
        onAnchorsChange={vi.fn()}
        onExclusionsChange={vi.fn()}
        algorithm="individual"
        onAlgorithmChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
      />,
    );

    expect(screen.getByRole('textbox', { name: 'Anchor Mock' })).toHaveValue(
      '',
    );
  });

  it('shows Battle Frontier Master rules in the team configuration panel', () => {
    render(
      <TeamConfigPanel
        pokemonList={[]}
        battleFrontierMasterPointsByPokemonName={{}}
        selectedFormatId="battle-frontier-master"
        onFormatChange={vi.fn()}
        mode="PlayPokemon"
        onModeChange={vi.fn()}
        onAnchorsChange={vi.fn()}
        onExclusionsChange={vi.fn()}
        algorithm="individual"
        onAlgorithmChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
      />,
    );

    expect(
      screen.getByText(
        /11 total points, at most one 5-point pokemon, and at most one mega pokemon/i,
      ),
    ).toBeInTheDocument();
  });

  it('hides Battle Frontier Master rules for other formats', () => {
    render(
      <TeamConfigPanel
        pokemonList={[]}
        battleFrontierMasterPointsByPokemonName={{}}
        selectedFormatId="great-league"
        onFormatChange={vi.fn()}
        mode="PlayPokemon"
        onModeChange={vi.fn()}
        onAnchorsChange={vi.fn()}
        onExclusionsChange={vi.fn()}
        algorithm="individual"
        onAlgorithmChange={vi.fn()}
        onGenerate={vi.fn()}
        isGenerating={false}
      />,
    );

    expect(
      screen.queryByText(
        /11 total points, at most one 5-point pokemon, and at most one mega pokemon/i,
      ),
    ).not.toBeInTheDocument();
  });
});
