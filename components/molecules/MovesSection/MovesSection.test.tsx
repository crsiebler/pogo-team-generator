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

  it('renders a distinct additional charged attack with its Mega level', () => {
    render(<MovesSection additionalChargedMove="Frenzy_Plant" megaLevel={4} />);

    expect(screen.getByText('Additional Charged Attack')).toBeInTheDocument();
    expect(screen.getByText('Frenzy Plant')).toBeInTheDocument();
    expect(screen.getByText('Mega Level 4')).toBeInTheDocument();
    expect(screen.queryByText('⭐ Frenzy Plant')).not.toBeInTheDocument();
  });

  it('does not render an additional attack section without a move', () => {
    render(<MovesSection megaLevel={4} />);

    expect(
      screen.queryByText('Additional Charged Attack'),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('Mega Level 4')).not.toBeInTheDocument();
  });
});
