import { fireEvent, render, screen } from '@testing-library/react';
import { Option } from './Option';
import { Select } from './Select';

describe('Select', () => {
  it('renders with label and options', () => {
    render(
      <Select label="Battle Format" defaultValue="great-league">
        <Option value="great-league">Great League</Option>
        <Option value="ultra-league">Ultra League</Option>
      </Select>,
    );

    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.getByText('Battle Format')).toBeInTheDocument();
    expect(
      screen.getByRole('option', { name: 'Great League' }),
    ).toBeInTheDocument();
  });

  it('floats label after selecting a value', () => {
    render(
      <Select label="Battle Format" defaultValue="">
        <Option value="">Select a format</Option>
        <Option value="kanto-cup">Kanto Cup</Option>
      </Select>,
    );

    const selectElement = screen.getByRole('combobox');
    const labelElement = screen.getByText('Battle Format');

    expect(labelElement).toHaveClass('top-1/2');
    fireEvent.change(selectElement, { target: { value: 'kanto-cup' } });
    expect(labelElement).toHaveClass('top-2');
  });

  it('renders dark mode styles', () => {
    const { container } = render(
      <div className="dark">
        <Select label="Battle Format" defaultValue="great-league">
          <Option value="great-league">Great League</Option>
        </Select>
      </div>,
    );

    expect(container.firstChild).toMatchSnapshot();
  });
});
