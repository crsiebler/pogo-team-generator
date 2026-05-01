import { speciesNameToChoosableId } from './pokemon';
import {
  getClosersRankings,
  getLeadsRankings,
  getMetaThreats,
  getOverallRankings,
  getRankingScore,
  getRoleBasedThreatSpeciesIds,
  getSwitchesRankings,
} from './rankings';

describe('format-aware rankings loading', () => {
  it('supports default and explicit Great League lookups', () => {
    const defaultRankings = getOverallRankings();
    const explicitRankings = getOverallRankings('great-league');

    expect(defaultRankings).toBe(explicitRankings);

    const defaultScore = getRankingScore('Azumarill', 'overall');
    const explicitScore = getRankingScore(
      'Azumarill',
      'overall',
      'great-league',
    );

    expect(defaultScore).toBe(explicitScore);

    const defaultThreats = getMetaThreats();
    const explicitThreats = getMetaThreats('great-league');

    expect(defaultThreats).toEqual(explicitThreats);
  });

  it('loads overall rankings for all supported battle formats', () => {
    const greatLeagueRankings = getOverallRankings('great-league');
    const ultraLeagueRankings = getOverallRankings('ultra-league');
    const masterLeagueRankings = getOverallRankings('master-league');
    const fantasyCupRankings = getOverallRankings('fantasy-cup');
    const naic2026CupRankings = getOverallRankings(
      'naic-2026-championship-cup',
    );
    const bayouCupRankings = getOverallRankings('battle-frontier-bayou-cup');
    const spellcraftCupRankings = getOverallRankings(
      'battle-frontier-spellcraft-cup',
    );
    const ulRetroRankings = getOverallRankings('battle-frontier-ul-retro');
    const battleFrontierMasterRankings = getOverallRankings(
      'battle-frontier-master',
    );
    const jungleCupRankings = getOverallRankings('jungle-cup');

    expect(greatLeagueRankings.length).toBeGreaterThan(0);
    expect(ultraLeagueRankings.length).toBeGreaterThan(0);
    expect(masterLeagueRankings.length).toBeGreaterThan(0);
    expect(fantasyCupRankings.length).toBeGreaterThan(0);
    expect(naic2026CupRankings.length).toBeGreaterThan(0);
    expect(bayouCupRankings.length).toBeGreaterThan(0);
    expect(spellcraftCupRankings.length).toBeGreaterThan(0);
    expect(ulRetroRankings.length).toBeGreaterThan(0);
    expect(battleFrontierMasterRankings.length).toBeGreaterThan(0);
    expect(jungleCupRankings.length).toBeGreaterThan(0);
  });

  it('keeps Great League cache stable after loading other formats', () => {
    const beforeFailure = getOverallRankings();
    getOverallRankings('master-league');

    const afterFailure = getOverallRankings();
    expect(afterFailure).toBe(beforeFailure);
  });
});

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
