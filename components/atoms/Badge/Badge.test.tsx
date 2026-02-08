import { render, screen } from '@testing-library/react';
import { vi } from 'vitest';
import { Badge } from './Badge';

// Mock localStorage
const localStorageMock = {
  getItem: vi.fn(),
  setItem: vi.fn(),
  removeItem: vi.fn(),
  clear: vi.fn(),
};
Object.defineProperty(window, 'localStorage', {
  value: localStorageMock,
});

// Mock matchMedia
Object.defineProperty(window, 'matchMedia', {
  value: vi.fn().mockImplementation((query) => ({
    matches: false,
    media: query,
    onchange: null,
    addListener: vi.fn(),
    removeListener: vi.fn(),
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    dispatchEvent: vi.fn(),
  })),
});

describe('Badge', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders with default color', () => {
    render(<Badge>TEST</Badge>);
    expect(screen.getByText('TEST')).toBeInTheDocument();
  });

  it('renders with color="green"', () => {
    render(<Badge color="green">SUCCESS</Badge>);
    expect(screen.getByText('SUCCESS')).toBeInTheDocument();
  });
});
