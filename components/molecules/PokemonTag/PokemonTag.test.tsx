import { render, screen, fireEvent } from '@testing-library/react';
import { vi } from 'vitest';
import { PokemonTag } from './PokemonTag';

describe('PokemonTag', () => {
  it('renders pokemon name', () => {
    const mockOnRemove = vi.fn();
    render(<PokemonTag pokemon="Pikachu" onRemove={mockOnRemove} />);
    expect(screen.getByText('Pikachu')).toBeInTheDocument();
  });

  it('calls onRemove when clicked', () => {
    const mockOnRemove = vi.fn();
    render(<PokemonTag pokemon="Charizard" onRemove={mockOnRemove} />);
    const tag = screen.getByRole('button');
    fireEvent.click(tag);
    expect(mockOnRemove).toHaveBeenCalledWith('Charizard');
  });

  it('has correct styling classes', () => {
    const mockOnRemove = vi.fn();
    render(<PokemonTag pokemon="Squirtle" onRemove={mockOnRemove} />);
    const tag = screen.getByRole('button');
    expect(tag).toHaveClass(
      'group',
      'inline-flex',
      'items-center',
      'gap-1.5',
      'rounded-full',
      'bg-red-100',
      'px-3',
      'py-1.5',
      'text-xs',
      'font-medium',
      'text-red-800',
      'transition-all',
      'hover:bg-red-200',
      'sm:text-sm',
    );
  });

  it('shows remove icon', () => {
    const mockOnRemove = vi.fn();
    render(<PokemonTag pokemon="Bulbasaur" onRemove={mockOnRemove} />);
    const icon = screen.getByRole('button').querySelector('svg');
    expect(icon).toBeInTheDocument();
  });
});
