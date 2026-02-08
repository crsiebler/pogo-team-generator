import { ThemeProvider } from '@hooks/useTheme';
import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders primary button by default', () => {
    render(
      <ThemeProvider theme="light">
        <Button>Click me</Button>
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });
  it('accepts variants and sizes', () => {
    render(
      <ThemeProvider theme="dark">
        <Button variant="danger" size="lg">
          Danger
        </Button>
      </ThemeProvider>,
    );
    expect(screen.getByRole('button')).toMatchSnapshot();
  });
});
