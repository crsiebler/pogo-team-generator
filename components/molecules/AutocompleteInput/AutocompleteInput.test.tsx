import { ThemeProvider } from '@hooks/useTheme';
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
      <ThemeProvider initialTheme="light">
        <AutocompleteInput
          value=""
          onChange={() => {}}
          onSelect={() => {}}
          suggestions={mockSuggestions}
          placeholder="Search Pokemon"
        />
      </ThemeProvider>,
    );
    expect(screen.getByPlaceholderText('Search Pokemon')).toBeInTheDocument();
  });

  it('shows clear button when input has value', () => {
    render(
      <ThemeProvider initialTheme="light">
        <AutocompleteInput
          value="Pikachu"
          onChange={() => {}}
          onSelect={() => {}}
          suggestions={mockSuggestions}
        />
      </ThemeProvider>,
    );
    expect(screen.getByLabelText('Clear input')).toBeInTheDocument();
  });

  it('does not show suggestions for input less than 2 characters', () => {
    render(
      <ThemeProvider initialTheme="light">
        <AutocompleteInput
          value="P"
          onChange={() => {}}
          onSelect={() => {}}
          suggestions={mockSuggestions}
        />
      </ThemeProvider>,
    );
    expect(screen.queryByText('Pikachu')).not.toBeInTheDocument();
  });

  it('shows filtered suggestions when typing 2+ characters', async () => {
    render(
      <ThemeProvider initialTheme="light">
        <AutocompleteInput
          value="Pi"
          onChange={() => {}}
          onSelect={() => {}}
          suggestions={mockSuggestions}
        />
      </ThemeProvider>,
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
      <ThemeProvider initialTheme="light">
        <AutocompleteInput
          value="Pokemon"
          onChange={() => {}}
          onSelect={() => {}}
          suggestions={manySuggestions}
        />
      </ThemeProvider>,
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
      <ThemeProvider initialTheme="light">
        <AutocompleteInput
          value="Pi"
          onChange={() => {}}
          onSelect={mockOnSelect}
          suggestions={mockSuggestions}
        />
      </ThemeProvider>,
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
      <ThemeProvider initialTheme="light">
        <AutocompleteInput
          value=""
          onChange={mockOnChange}
          onSelect={() => {}}
          suggestions={mockSuggestions}
        />
      </ThemeProvider>,
    );
    const input = screen.getByPlaceholderText('Type to search...');
    fireEvent.change(input, { target: { value: 'test' } });
    expect(mockOnChange).toHaveBeenCalledWith('test');
  });

  it('closes suggestions on Escape key', async () => {
    render(
      <ThemeProvider initialTheme="light">
        <AutocompleteInput
          value="Pi"
          onChange={() => {}}
          onSelect={() => {}}
          suggestions={mockSuggestions}
        />
      </ThemeProvider>,
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
      <ThemeProvider initialTheme="light">
        <AutocompleteInput
          value="Pikachu"
          onChange={mockOnChange}
          onSelect={() => {}}
          suggestions={mockSuggestions}
        />
      </ThemeProvider>,
    );
    fireEvent.click(screen.getByLabelText('Clear input'));
    expect(mockOnChange).toHaveBeenCalledWith('');
  });
});
