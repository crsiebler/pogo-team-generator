import { ThemeProvider } from '@hooks/useTheme';
import { render, screen } from '@testing-library/react';
import { MovesSection } from './MovesSection';

describe('MovesSection', () => {
  it('renders fast move recommendation', () => {
    render(
      <ThemeProvider initialTheme="light">
        <MovesSection fastMove="Tackle" />
      </ThemeProvider>,
    );
    expect(screen.getByText('Recommended Fast Move')).toBeInTheDocument();
    expect(screen.getByText('⭐ Tackle')).toBeInTheDocument();
  });

  it('renders charged moves recommendations', () => {
    render(
      <ThemeProvider initialTheme="light">
        <MovesSection
          chargedMove1="Power_Up_Punch"
          chargedMove2="Dynamic_Punch"
        />
      </ThemeProvider>,
    );
    expect(screen.getByText('Recommended Charged Moves')).toBeInTheDocument();
    expect(screen.getByText('⭐ Power Up Punch')).toBeInTheDocument();
    expect(screen.getByText('⭐ Dynamic Punch')).toBeInTheDocument();
  });

  it('renders no recommendation messages when moves are missing', () => {
    render(
      <ThemeProvider initialTheme="light">
        <MovesSection />
      </ThemeProvider>,
    );
    expect(screen.getByText('No recommendation')).toBeInTheDocument();
    expect(screen.getByText('No recommendations')).toBeInTheDocument();
  });

  it('formats move names by replacing underscores', () => {
    render(
      <ThemeProvider initialTheme="light">
        <MovesSection fastMove="Water_Gun" chargedMove1="Hydro_Pump" />
      </ThemeProvider>,
    );
    expect(screen.getByText('⭐ Water Gun')).toBeInTheDocument();
    expect(screen.getByText('⭐ Hydro Pump')).toBeInTheDocument();
  });
});
