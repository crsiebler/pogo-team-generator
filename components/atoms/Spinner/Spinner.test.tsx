import { render } from '@testing-library/react';
import { Spinner } from './Spinner';

describe('Spinner', () => {
  it('renders spinner in light mode', () => {
    const { container } = render(<Spinner />);
    expect(container.firstChild).toMatchSnapshot();
  });
  it('renders spinner in dark mode', () => {
    const { container } = render(<Spinner size={32} />);
    expect(container.firstChild).toMatchSnapshot();
  });
});
