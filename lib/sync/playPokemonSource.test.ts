import fs from 'node:fs';
import path from 'node:path';
import vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import preset from '../../docs/metas/play-pokemon-2026-10-21.json';
import { createPvpokeAdapter } from './adapter';
import { readPlayPokemonRankingExports } from './playPokemonSource';
import { getMoveAvailability } from '@/lib/data/moveAvailability';

function eligibleSpecies(): string[] {
  const adapter = createPvpokeAdapter({
    sourcePath: path.resolve('vendor/pvpoke'),
  });
  const context = vm.createContext({
    console: { log: (): void => undefined },
    host: 'localhost',
    webRoot: '',
    siteVersion: 'local',
    settings: { gamemaster: 'gamemaster' },
    $: { ajax: (): void => undefined },
    preset,
    gamemaster: JSON.parse(
      fs.readFileSync(
        adapter.getSimulationAssetPath('src/data/gamemaster.json'),
        'utf8',
      ),
    ),
  });
  for (const file of [
    'battle/DamageCalculator.js',
    'battle/actions/ActionLogic.js',
    'battle/timeline/TimelineAction.js',
    'battle/timeline/TimelineEvent.js',
    'GameMaster.js',
    'pokemon/Pokemon.js',
    'battle/Battle.js',
  ]) {
    vm.runInContext(
      fs.readFileSync(adapter.getSimulationAssetPath(`src/js/${file}`), 'utf8'),
      context,
    );
  }
  const result: unknown = vm.runInContext(
    `
    var gm = GameMaster.getInstance();
    gm.data = gamemaster;
    gm.createSearchMaps();
    var battle = new Battle();
    // Isolate the ban filters from PvPoke's independent Great League CP floor.
    battle.setCP(10000);
    battle.setCustomCup(preset);
    gm.generateFilteredPokemonList(battle, preset.include, preset.exclude, null, null, false).map(p => p.speciesId);
  `,
    context,
  );
  if (!Array.isArray(result) || !result.every((id) => typeof id === 'string'))
    throw new Error('Invalid native PvPoke filter output');
  return result;
}

describe('Play! Pokemon preset in the native PvPoke filter', () => {
  it('loads current custom exports with unique species and legal restricted moves', async () => {
    const { rankings } = await readPlayPokemonRankingExports('vendor/pvpoke');
    const bannedMoves = new Map([
      ['grimer', 'ACID'],
      ['muk', 'ACID'],
      ['koffing', 'ACID'],
      ['weezing', 'ACID'],
      ['chansey', 'PSYBEAM'],
      ['staryu', 'QUICK_ATTACK'],
      ['starmie', 'QUICK_ATTACK'],
      ['porygon', 'QUICK_ATTACK'],
      ['pichu', 'QUICK_ATTACK'],
    ]);
    expect(Object.keys(rankings)).toHaveLength(7);
    for (const entries of Object.values(rankings)) {
      expect(entries.length).toBeGreaterThan(150);
      expect(new Set(entries.map((entry) => entry.speciesId)).size).toBe(
        entries.length,
      );
      for (const entry of entries) {
        const bannedMove = bannedMoves.get(
          entry.speciesId.replace(/_shadow$/, ''),
        );
        if (bannedMove) expect(entry.moveset).not.toContain(bannedMove);
      }
    }
  });

  it('rejects banned battle-state forms, species, Shadows and Megas while preserving exceptions', () => {
    const eligible = new Set(eligibleSpecies());
    for (const id of [
      'minior_meteor',
      'minior_core',
      'mimikyu',
      'mimikyu_busted',
      'cobalion',
      'terrakion',
      'virizion',
      'reshiram',
      'zekrom',
      'kyurem',
      'kyurem_black',
      'kyurem_white',
      'zacian_hero',
      'zamazenta_hero',
      'landorus_incarnate',
      'landorus_therian',
      'groudon',
      'kyogre',
      'dialga',
      'dialga_origin',
      'palkia',
      'palkia_origin',
      'mewtwo',
      'ponyta_shadow',
      'rapidash_shadow',
      'kabuto_shadow',
      'kabutops_shadow',
      'mudbray',
      'mudsdale',
      'ditto',
      'shedinja',
      'venusaur_mega',
      'groudon_primal',
      'kyogre_primal',
    ]) {
      expect(eligible.has(id), id).toBe(false);
    }
    for (const id of [
      'tapu_fini',
      'giratina_altered',
      'giratina_altered_shadow',
      'ponyta',
      'ponyta_galarian',
      'rapidash',
      'kabuto',
      'kabutops',
      'landorus_incarnate_shadow',
      'groudon_shadow',
      'kyogre_shadow',
      'dialga_shadow',
      'palkia_shadow',
      'thundurus_incarnate_shadow',
      'tornadus_incarnate_shadow',
      'mewtwo_shadow',
      'grimer',
      'muk',
      'koffing',
      'weezing',
      'chansey',
      'starmie',
      'porygon',
    ]) {
      expect(eligible.has(id), id).toBe(true);
    }
  });

  it('uses legal overrides without banning the entire species or a global move', () => {
    for (const override of preset.overrides) {
      for (const move of [override.fastMove, ...override.chargedMoves]) {
        expect(
          getMoveAvailability(override.speciesId, move, 'play-pokemon').kind,
          `${override.speciesId}/${move}`,
        ).not.toBe('excluded');
      }
    }
    for (const [speciesId, move] of [
      ['grimer', 'ACID'],
      ['muk', 'ACID'],
      ['koffing', 'ACID'],
      ['weezing', 'ACID'],
      ['chansey', 'PSYBEAM'],
      ['staryu', 'QUICK_ATTACK'],
      ['starmie', 'QUICK_ATTACK'],
      ['porygon', 'QUICK_ATTACK'],
      ['pichu', 'QUICK_ATTACK'],
      ['giratina_altered', 'RETURN'],
    ])
      expect(getMoveAvailability(speciesId, move, 'play-pokemon').kind).toBe(
        'excluded',
      );
    expect(
      getMoveAvailability('cradily', 'ACID', 'play-pokemon').kind,
    ).not.toBe('excluded');
  });
});
