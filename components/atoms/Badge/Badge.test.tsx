import { ThemeProvider } from '@hooks/useTheme';
import { render, screen } from '@testing-library/react';
import { Badge } from './Badge';

describe('Badge', () => {
  it('renders with default color', () => {
    render(
      <ThemeProvider theme="light">
        <Badge>TEST</Badge>
      </ThemeProvider>,
    );
    expect(screen.getByText('TEST')).toBeInTheDocument();
  });
  it('renders with color="green"', () => {
    render(
      <ThemeProvider theme="dark">
        <Badge color="green">SUCCESS</Badge>
      </ThemeProvider>,
    );
    expect(screen.getByText('SUCCESS')).toMatchSnapshot();
  });
});
