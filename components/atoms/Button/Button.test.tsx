import { render, screen } from '@testing-library/react';
import { Button } from './Button';

describe('Button', () => {
  it('renders primary button by default', () => {
    render(<Button>Click me</Button>);
    expect(screen.getByRole('button')).toHaveTextContent('Click me');
  });
  it('accepts variants and sizes', () => {
    render(
      <Button variant="danger" size="lg">
        Danger
      </Button>,
    );
    expect(screen.getByRole('button')).toMatchSnapshot();
  });
});
