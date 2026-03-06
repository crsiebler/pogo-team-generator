import { fireEvent, render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { TeamConfigPanel } from './TeamConfigPanel';
import { getBattleFormats } from '@/lib/data/battleFormats';

vi.mock('@/components/molecules', () => ({
  ModeSelector: () => <div>Mode Selector</div>,
}));

vi.mock('@/components/organisms', () => ({
  TeamGenerator: () => <div>Team Generator</div>,
}));

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
});
