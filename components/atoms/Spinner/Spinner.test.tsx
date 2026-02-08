import { ThemeProvider } from '@hooks/useTheme';
import { render } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('renders spinner in light mode', () => {
    const { container } = render(
      <ThemeProvider theme="light">
        <Spinner />
      </ThemeProvider>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
  it('renders spinner in dark mode', () => {
    const { container } = render(
      <ThemeProvider theme="dark">
        <Spinner size={32} />
      </ThemeProvider>,
    );
    expect(container.firstChild).toMatchSnapshot();
  });
});
