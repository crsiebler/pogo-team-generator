import { ThemeProvider } from '@hooks/useTheme';
import { render, screen } from '@testing-library/react';
import { TypeBadge } from './TypeBadge';

describe('TypeBadge', () => {
  it('renders with correct fire type color', () => {
    render(
      <ThemeProvider initialTheme="light">
        <TypeBadge type="fire" />
      </ThemeProvider>,
    );
    const badge = screen.getByText('fire');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('text-white');
  });

  it('renders with correct water type color', () => {
    render(
      <ThemeProvider initialTheme="light">
        <TypeBadge type="water" />
      </ThemeProvider>,
    );
    expect(screen.getByText('water')).toBeInTheDocument();
  });

  it('renders unknown type with default color', () => {
    render(
      <ThemeProvider initialTheme="light">
        <TypeBadge type="unknown" />
      </ThemeProvider>,
    );
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('renders uppercase type text', () => {
    render(
      <ThemeProvider initialTheme="light">
        <TypeBadge type="grass" />
      </ThemeProvider>,
    );
    expect(screen.getByText('grass')).toBeInTheDocument();
  });
});
