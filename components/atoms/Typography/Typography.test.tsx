import { render, screen } from '@testing-library/react';
import { Typography } from './Typography';

describe('Typography', () => {
  it('renders correct heading', () => {
    render(
      <Typography as="h1" variant="h1">
        Title
      </Typography>,
    );
    expect(screen.getByText('Title').tagName).toBe('H1');
  });
  it('applies dark mode style', () => {
    render(<Typography variant="h2">Subtitle</Typography>);
    expect(screen.getByText('Subtitle')).toMatchSnapshot();
  });
});
