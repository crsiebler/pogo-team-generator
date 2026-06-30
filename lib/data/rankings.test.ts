import { getRankedPokemonForFormat, speciesNameToChoosableId } from './pokemon';
import {
  getAllRankingsForPokemon,
  getAttackersRankings,
  getAutomaticCandidatePokemonNames,
  getChargersRankings,
  getClosersRankings,
  getConsistencyRankings,
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
    const megaMasterLeagueRankings = getOverallRankings('mega-master-league');
    const summerCupRankings = getOverallRankings('summer-cup');
    const copaDiluvioRankings = getOverallRankings(
      'battle-frontier-copa-diluvio',
    );
    const tsukiCupRankings = getOverallRankings('battle-frontier-tsuki-cup');
    const ligaUltraRankings = getOverallRankings('battle-frontier-liga-ultra');
    const coupeDuSillageRankings = getOverallRankings(
      'battle-frontier-coupe-du-sillage',
    );

    expect(greatLeagueRankings.length).toBeGreaterThan(0);
    expect(ultraLeagueRankings.length).toBeGreaterThan(0);
    expect(masterLeagueRankings.length).toBeGreaterThan(0);
    expect(megaMasterLeagueRankings.length).toBeGreaterThan(0);
    expect(summerCupRankings.length).toBeGreaterThan(0);
    expect(copaDiluvioRankings.length).toBeGreaterThan(0);
    expect(tsukiCupRankings.length).toBeGreaterThan(0);
    expect(ligaUltraRankings.length).toBeGreaterThan(0);
    expect(coupeDuSillageRankings.length).toBeGreaterThan(0);
  });

  it('keeps Great League cache stable after loading other formats', () => {
    const beforeFailure = getOverallRankings();
    getOverallRankings('master-league');

    const afterFailure = getOverallRankings();
    expect(afterFailure).toBe(beforeFailure);
  });

  it('supports all documented ranking categories at runtime', () => {
    expect(getChargersRankings().length).toBeGreaterThan(0);
    expect(getAttackersRankings().length).toBeGreaterThan(0);
    expect(getConsistencyRankings().length).toBeGreaterThan(0);

    expect(getRankingScore('Azumarill', 'chargers')).toBeGreaterThan(0);
    expect(getRankingScore('Azumarill', 'attackers')).toBeGreaterThan(0);
    expect(getRankingScore('Azumarill', 'consistency')).toBeGreaterThan(0);
  });

  it('loads documented category rankings for non-default formats', () => {
    expect(
      getChargersRankings('battle-frontier-copa-diluvio').length,
    ).toBeGreaterThan(0);
  });

  it('includes enough non-Mega automatic candidates for legal Mega Master teams', () => {
    const candidateNames =
      getAutomaticCandidatePokemonNames('mega-master-league');
    const candidates = getRankedPokemonForFormat(
      candidateNames,
      'mega-master-league',
    );
    const nonMegaDexNumbers = new Set(
      candidates
        .filter((pokemon) => !pokemon.tags?.includes('mega'))
        .map((pokemon) => pokemon.dex),
    );

    expect(nonMegaDexNumbers.size).toBeGreaterThanOrEqual(5);
  });

  it('exposes all category scores in the aggregate ranking contract', () => {
    type AllRankingScores = ReturnType<typeof getAllRankingsForPokemon>;
    const scoreKeys: Array<keyof AllRankingScores> = [
      'overall',
      'leads',
      'switches',
      'closers',
      'chargers',
      'attackers',
      'consistency',
      'average',
    ];

    expect(scoreKeys).toContain('chargers');
    expect(scoreKeys).toContain('attackers');
    expect(scoreKeys).toContain('consistency');
  });

  it('includes supporting role categories in aggregate rankings', () => {
    const rankings = getAllRankingsForPokemon('Azumarill');

    expect(rankings.overall).toBeGreaterThan(0);
    expect(rankings.leads).toBeGreaterThan(0);
    expect(rankings.switches).toBeGreaterThan(0);
    expect(rankings.closers).toBeGreaterThan(0);
    expect(rankings.chargers).toBeGreaterThan(0);
    expect(rankings.attackers).toBeGreaterThan(0);
    expect(rankings.consistency).toBeGreaterThan(0);
    expect(rankings.average).toBeGreaterThan(0);
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
