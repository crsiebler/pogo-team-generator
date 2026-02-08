import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { vi } from 'vitest';
import { AutocompleteInput } from './AutocompleteInput';

const mockSuggestions = [
  'Pikachu',
  'Charizard',
  'Squirtle',
  'Bulbasaur',
  'Mewtwo',
  'Dragonite',
  'Gyarados',
  'Lapras',
  'Snorlax',
  'Venusaur',
  'Blastoise',
  'Raichu',
];

describe('AutocompleteInput', () => {
  it('renders input with placeholder', () => {
    render(
      <AutocompleteInput
        value=""
        onChange={() => {}}
        onSelect={() => {}}
        suggestions={mockSuggestions}
        placeholder="Search Pokemon"
      />,
    );
    expect(screen.getByPlaceholderText('Search Pokemon')).toBeInTheDocument();
  });

  it('shows clear button when input has value', () => {
    render(
      <AutocompleteInput
        value="Pikachu"
        onChange={() => {}}
        onSelect={() => {}}
        suggestions={mockSuggestions}
      />,
    );
    expect(screen.getByLabelText('Clear input')).toBeInTheDocument();
  });

  it('does not show suggestions for input less than 2 characters', () => {
    render(
      <AutocompleteInput
        value="P"
        onChange={() => {}}
        onSelect={() => {}}
        suggestions={mockSuggestions}
      />,
    );
    expect(screen.queryByText('Pikachu')).not.toBeInTheDocument();
  });

  it('shows filtered suggestions when typing 2+ characters', async () => {
    render(
      <AutocompleteInput
        value="Pi"
        onChange={() => {}}
        onSelect={() => {}}
        suggestions={mockSuggestions}
      />,
    );
    const input = screen.getByPlaceholderText('Type to search...');
    fireEvent.focus(input);
    await waitFor(() => {
      expect(screen.getByText('Pikachu')).toBeInTheDocument();
    });
  });

  it('limits suggestions to 10 items', async () => {
    const manySuggestions = Array.from({ length: 15 }, (_, i) => `Pokemon${i}`);
    render(
      <AutocompleteInput
        value="Pokemon"
        onChange={() => {}}
        onSelect={() => {}}
        suggestions={manySuggestions}
      />,
    );
    const input = screen.getByPlaceholderText('Type to search...');
    fireEvent.focus(input);
    await waitFor(() => {
      const suggestions = screen
        .getAllByRole('button')
        .filter((btn) => btn.textContent?.startsWith('Pokemon'));
      expect(suggestions).toHaveLength(10);
    });
  });

  it('calls onSelect when suggestion is clicked', async () => {
    const mockOnSelect = vi.fn();
    render(
      <AutocompleteInput
        value="Pi"
        onChange={() => {}}
        onSelect={mockOnSelect}
        suggestions={mockSuggestions}
      />,
    );
    const input = screen.getByPlaceholderText('Type to search...');
    fireEvent.focus(input);
    await waitFor(() => {
      fireEvent.click(screen.getByText('Pikachu'));
    });
    expect(mockOnSelect).toHaveBeenCalledWith('Pikachu');
  });

  it('calls onChange when input value changes', () => {
    const mockOnChange = vi.fn();
    render(
      <AutocompleteInput
        value=""
        onChange={mockOnChange}
        onSelect={() => {}}
        suggestions={mockSuggestions}
      />,
    );
    const input = screen.getByPlaceholderText('Type to search...');
    fireEvent.change(input, { target: { value: 'test' } });
    expect(mockOnChange).toHaveBeenCalledWith('test');
  });

  it('closes suggestions on Escape key', async () => {
    render(
      <AutocompleteInput
        value="Pi"
        onChange={() => {}}
        onSelect={() => {}}
        suggestions={mockSuggestions}
      />,
    );
    const input = screen.getByPlaceholderText('Type to search...');
    fireEvent.focus(input);
    await waitFor(() => {
      expect(screen.getByText('Pikachu')).toBeInTheDocument();
    });
    fireEvent.keyDown(input, { key: 'Escape' });
    expect(screen.queryByText('Pikachu')).not.toBeInTheDocument();
  });

  it('clears input when clear button is clicked', () => {
    const mockOnChange = vi.fn();
    render(
      <AutocompleteInput
        value="Pikachu"
        onChange={mockOnChange}
        onSelect={() => {}}
        suggestions={mockSuggestions}
      />,
    );
    fireEvent.click(screen.getByLabelText('Clear input'));
    expect(mockOnChange).toHaveBeenCalledWith('');
  });
});
