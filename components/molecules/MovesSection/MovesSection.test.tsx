import { render, screen } from '@testing-library/react';
import { MovesSection } from './MovesSection';

describe('MovesSection', () => {
  it('renders fast move recommendation', () => {
    render(<MovesSection fastMove="Tackle" />);
    expect(screen.getByText('Recommended Fast Move')).toBeInTheDocument();
    expect(screen.getByText('⭐ Tackle')).toBeInTheDocument();
  });

  it('renders charged moves recommendations', () => {
    render(
      <MovesSection
        chargedMove1="Power_Up_Punch"
        chargedMove2="Dynamic_Punch"
      />,
    );
    expect(screen.getByText('Recommended Charged Moves')).toBeInTheDocument();
    expect(screen.getByText('⭐ Power Up Punch')).toBeInTheDocument();
    expect(screen.getByText('⭐ Dynamic Punch')).toBeInTheDocument();
  });

  it('renders no recommendation messages when moves are missing', () => {
    render(<MovesSection />);
    expect(screen.getByText('No recommendation')).toBeInTheDocument();
    expect(screen.getByText('No recommendations')).toBeInTheDocument();
  });

  it('formats move names by replacing underscores', () => {
    render(<MovesSection fastMove="Water_Gun" chargedMove1="Hydro_Pump" />);
    expect(screen.getByText('⭐ Water Gun')).toBeInTheDocument();
    expect(screen.getByText('⭐ Hydro Pump')).toBeInTheDocument();
  });
});
