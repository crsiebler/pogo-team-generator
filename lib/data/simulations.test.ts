import {
  ensureSimulationDataAvailable,
  getMatchupMatrix,
  getTopThreatsByRole,
} from './simulations';

describe('format-aware simulation loading', () => {
  it('supports default and explicit Great League lookups', () => {
    const defaultMatrix = getMatchupMatrix();
    const explicitMatrix = getMatchupMatrix('great-league');

    expect(defaultMatrix).toBe(explicitMatrix);

    const defaultThreats = getTopThreatsByRole(25);
    const explicitThreats = getTopThreatsByRole(25, 'great-league');

    expect(defaultThreats).toEqual(explicitThreats);
  });

  it('throws a clear error when selected format simulation files are missing', () => {
    expect(() => ensureSimulationDataAvailable('ultra-league')).toThrow(
      /Simulation data missing for Ultra League \(all\/2500\)/,
    );
  });

  it('keeps Great League cache valid after a missing format load failure', () => {
    const beforeFailure = getMatchupMatrix();

    expect(() => ensureSimulationDataAvailable('master-league')).toThrow(
      /Master League \(all\/10000\)/,
    );

    const afterFailure = getMatchupMatrix();
    expect(afterFailure).toBe(beforeFailure);
  });
});
