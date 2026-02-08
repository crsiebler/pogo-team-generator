import { ThemeProvider } from '@hooks/useTheme';
import { render, screen } from '@testing-library/react';
import { Input } from './Input';

describe('Input', () => {
  it('renders base input by default', () => {
    render(
      <ThemeProvider initialTheme="light">
        <Input placeholder="test input" />
      </ThemeProvider>,
    );
    expect(screen.getByPlaceholderText('test input')).toBeInTheDocument();
  });
  it('respects size prop', () => {
    render(
      <ThemeProvider initialTheme="dark">
        <Input size="lg" placeholder="large" />
      </ThemeProvider>,
    );
    expect(screen.getByPlaceholderText('large')).toMatchSnapshot();
  });
});
