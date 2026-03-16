import {
  ensureSimulationDataAvailable,
  getMatchupMatrix,
  getShieldScenarioMatchupResult,
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
    expect(() =>
      ensureSimulationDataAvailable('battle-frontier-bayou-cup'),
    ).not.toThrow();
    expect(() =>
      ensureSimulationDataAvailable('battle-frontier-brujeria-cup'),
    ).not.toThrow();
    expect(() =>
      ensureSimulationDataAvailable('battle-frontier-ul-retro'),
    ).not.toThrow();
    expect(() =>
      ensureSimulationDataAvailable('battle-frontier-master'),
    ).not.toThrow();
    expect(() => ensureSimulationDataAvailable('kanto-cup')).not.toThrow();
    expect(() => ensureSimulationDataAvailable('spring-cup')).not.toThrow();
  }, 15000);

  it('keeps Great League cache stable after loading other formats', () => {
    const beforeFailure = getMatchupMatrix();
    ensureSimulationDataAvailable('master-league');

    const afterFailure = getMatchupMatrix();
    expect(afterFailure).toBe(beforeFailure);
  });

  it('returns the requested shield scenario battle rating', () => {
    expect(
      getShieldScenarioMatchupResult('abomasnow', 'absol', 0, 'ultra-league'),
    ).toBe(306);
    expect(
      getShieldScenarioMatchupResult('abomasnow', 'absol', 1, 'ultra-league'),
    ).toBe(373);
    expect(
      getShieldScenarioMatchupResult('abomasnow', 'absol', 2, 'ultra-league'),
    ).toBe(302);
  });

  it('returns null when shield scenario matchup data is missing', () => {
    expect(
      getShieldScenarioMatchupResult('missing-species', 'abomasnow', 1),
    ).toBeNull();
    expect(
      getShieldScenarioMatchupResult('abomasnow', 'missing-opponent', 1),
    ).toBeNull();
  });
});
