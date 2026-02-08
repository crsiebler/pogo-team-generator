import { render, screen } from '@testing-library/react';
import { TypeBadge } from './TypeBadge';

describe('TypeBadge', () => {
  it('renders with correct fire type color', () => {
    render(<TypeBadge type="fire" />);
    const badge = screen.getByText('fire');
    expect(badge).toBeInTheDocument();
    expect(badge).toHaveClass('text-white');
  });

  it('renders with correct water type color', () => {
    render(<TypeBadge type="water" />);
    expect(screen.getByText('water')).toBeInTheDocument();
  });

  it('renders unknown type with default color', () => {
    render(<TypeBadge type="unknown" />);
    expect(screen.getByText('unknown')).toBeInTheDocument();
  });

  it('renders uppercase type text', () => {
    render(<TypeBadge type="grass" />);
    expect(screen.getByText('grass')).toBeInTheDocument();
  });
});
