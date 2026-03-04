import { speciesNameToChoosableId } from './pokemon';
import {
  getClosersRankings,
  getLeadsRankings,
  getOverallRankings,
  getRoleBasedThreatSpeciesIds,
  getSwitchesRankings,
} from './rankings';

describe('getRoleBasedThreatSpeciesIds', () => {
  it('builds a deduplicated union of top entries across all roles', () => {
    const topPerRole = 25;
    const actualThreats = getRoleBasedThreatSpeciesIds(topPerRole);

    const expectedThreats = new Set<string>();
    const roleRankings = [
      getOverallRankings(),
      getLeadsRankings(),
      getSwitchesRankings(),
      getClosersRankings(),
    ];

    for (const rankings of roleRankings) {
      for (const entry of rankings.slice(0, topPerRole)) {
        const speciesId = speciesNameToChoosableId(entry.Pokemon);
        if (speciesId) {
          expectedThreats.add(speciesId);
        }
      }
    }

    expect(new Set(actualThreats)).toEqual(expectedThreats);
  });

  it('includes role-specific threats that are outside overall top 100', () => {
    const topPerRole = 100;
    const threats = getRoleBasedThreatSpeciesIds(topPerRole);

    const overallTop = new Set<string>();
    for (const entry of getOverallRankings().slice(0, topPerRole)) {
      const speciesId = speciesNameToChoosableId(entry.Pokemon);
      if (speciesId) {
        overallTop.add(speciesId);
      }
    }

    const roleSpecificThreats = new Set<string>();
    const roleRankings = [
      getLeadsRankings(),
      getSwitchesRankings(),
      getClosersRankings(),
    ];

    for (const rankings of roleRankings) {
      for (const entry of rankings.slice(0, topPerRole)) {
        const speciesId = speciesNameToChoosableId(entry.Pokemon);
        if (speciesId && !overallTop.has(speciesId)) {
          roleSpecificThreats.add(speciesId);
        }
      }
    }

    expect(roleSpecificThreats.size).toBeGreaterThan(0);

    for (const speciesId of roleSpecificThreats) {
      expect(threats).toContain(speciesId);
    }
  });
});
