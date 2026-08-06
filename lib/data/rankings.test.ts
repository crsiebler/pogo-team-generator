import { getBattleFormats } from './battleFormats';
import { speciesNameToChoosableId } from './pokemon';
import {
  getAllRankingsForPokemon,
  getAttackersRankings,
  getChargersRankings,
  getClosersRankings,
  getConsistencyRankings,
  getLeadsRankings,
  getMetaThreats,
  getOptimalMoveset,
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
    for (const format of getBattleFormats()) {
      expect(getOverallRankings(format.id).length).toBeGreaterThan(0);
    }
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

describe('getOptimalMoveset', () => {
  it('converts punctuation in ranking move names to PvPoke move ids', () => {
    expect(
      getOptimalMoveset('Golisopod', 'battle-frontier-coupe-du-sillage'),
    ).toEqual({
      fastMove: 'FURY_CUTTER',
      chargedMove1: 'X_SCISSOR',
      chargedMove2: 'AQUA_JET',
    });
  });

  it('normalizes ranking move spelling aliases', () => {
    expect(getOptimalMoveset('Snorlax')).toEqual({
      fastMove: 'LICK',
      chargedMove1: 'BODY_SLAM',
      chargedMove2: 'SUPER_POWER',
    });
    expect(getOptimalMoveset('Krabby')).toEqual({
      fastMove: 'BUBBLE',
      chargedMove1: 'VICE_GRIP',
      chargedMove2: 'RAZOR_SHELL',
    });
  });

  it('resolves stateful move names against the canonical species movepool', () => {
    expect(getOptimalMoveset('Morpeko (Full Belly)')).toEqual({
      fastMove: 'THUNDER_SHOCK',
      chargedMove1: 'AURA_WHEEL_ELECTRIC',
      chargedMove2: 'PSYCHIC_FANGS',
    });
    expect(getOptimalMoveset('Aegislash (Shield)')).toEqual({
      fastMove: 'AEGISLASH_CHARGE_PSYCHO_CUT',
      chargedMove1: 'SHADOW_BALL',
      chargedMove2: 'GYRO_BALL',
    });
  });
});
