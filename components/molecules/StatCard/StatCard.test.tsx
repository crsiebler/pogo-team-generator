import { ThemeProvider } from '@hooks/useTheme';
import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders with red color scheme', () => {
    render(
      <ThemeProvider initialTheme="light">
        <StatCard label="Attack" value={150} color="red" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Attack')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('renders with blue color scheme', () => {
    render(
      <ThemeProvider initialTheme="light">
        <StatCard label="Defense" value={120} color="blue" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Defense')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('renders with green color scheme', () => {
    render(
      <ThemeProvider initialTheme="light">
        <StatCard label="HP" value={200} color="green" />
      </ThemeProvider>,
    );
    expect(screen.getByText('HP')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('has correct styling structure', () => {
    render(
      <ThemeProvider initialTheme="light">
        <StatCard label="Test" value={100} color="red" />
      </ThemeProvider>,
    );
    const container = screen.getByText('Test').parentElement;
    expect(container).toHaveClass(
      'rounded-lg',
      'p-2',
      'text-center',
      'bg-red-50',
      'text-red-700',
    );
  });
});
