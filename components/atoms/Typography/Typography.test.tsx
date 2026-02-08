import { ThemeProvider } from '@hooks/useTheme';
import { render, screen } from '@testing-library/react';
import { Typography } from './Typography';

describe('Typography', () => {
  it('renders correct heading', () => {
    render(
      <ThemeProvider initialTheme="light">
        <Typography as="h1" variant="h1">
          Title
        </Typography>
      </ThemeProvider>,
    );
    expect(screen.getByText('Title').tagName).toBe('H1');
  });
  it('applies dark mode style', () => {
    render(
      <ThemeProvider initialTheme="dark">
        <Typography variant="h2">Subtitle</Typography>
      </ThemeProvider>,
    );
    expect(screen.getByText('Subtitle')).toMatchSnapshot();
  });
});
