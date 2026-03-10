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

  it('ensures simulation data exists for all supported battle formats', () => {
    expect(() => ensureSimulationDataAvailable('great-league')).not.toThrow();
    expect(() => ensureSimulationDataAvailable('ultra-league')).not.toThrow();
    expect(() => ensureSimulationDataAvailable('master-league')).not.toThrow();
    expect(() => ensureSimulationDataAvailable('kanto-cup')).not.toThrow();
    expect(() => ensureSimulationDataAvailable('spring-cup')).not.toThrow();
  });

  it('keeps Great League cache stable after loading other formats', () => {
    const beforeFailure = getMatchupMatrix();
    ensureSimulationDataAvailable('master-league');

    const afterFailure = getMatchupMatrix();
    expect(afterFailure).toBe(beforeFailure);
  });
});
