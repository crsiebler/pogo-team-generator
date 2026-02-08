import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('renders base input by default', () => {
    render(<Input placeholder="test input" />);
    expect(screen.getByPlaceholderText('test input')).toBeInTheDocument();
  });
  it('respects size prop', () => {
    render(<Input size="lg" placeholder="large" />);
    expect(screen.getByPlaceholderText('large')).toMatchSnapshot();
  });
});
