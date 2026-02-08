import { render, screen } from '@testing-library/react';
import { StatCard } from './StatCard';

describe('StatCard', () => {
  it('renders with red color scheme', () => {
    render(<StatCard label="Attack" value={150} color="red" />);
    expect(screen.getByText('Attack')).toBeInTheDocument();
    expect(screen.getByText('150')).toBeInTheDocument();
  });

  it('renders with blue color scheme', () => {
    render(<StatCard label="Defense" value={120} color="blue" />);
    expect(screen.getByText('Defense')).toBeInTheDocument();
    expect(screen.getByText('120')).toBeInTheDocument();
  });

  it('renders with green color scheme', () => {
    render(<StatCard label="HP" value={200} color="green" />);
    expect(screen.getByText('HP')).toBeInTheDocument();
    expect(screen.getByText('200')).toBeInTheDocument();
  });

  it('has correct styling structure', () => {
    render(<StatCard label="Test" value={100} color="red" />);
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
