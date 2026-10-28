# Play! Pokemon custom PvPoke meta

The [custom settings](play-pokemon-2026-10-21.json) target standard 1,500 CP
Championship Series play, using the
[official banned list](https://www.pokemon.com/us/play-pokemon/about/play-pokemon-pokemon-go-championship-series-banned-pokemon-list)
read on October 21, 2026. This is a dated rules snapshot, not an automatically
updated tournament eligibility service or the separate LAIC 2027 cup.

## Import into PvPoke

1. Open [Custom Rankings](https://pvpoke.com/custom-rankings/).
2. Expand **Import/Export Settings** and paste the complete JSON file.
3. Keep **Use Default Movesets** enabled and retain the nine moveset overrides.
4. Generate rankings for the desired shield scenario.

PvPoke custom rankings are scenario-specific estimates. Importing this file does
not publish a named cup on PvPoke. The app separately exposes **Play! Pokémon**
first in the format selector, with ID `play-pokemon`, cup `playpokemon`, and
a 1,500 CP cap. This meta only supports Pick 6 (open sheets); selecting it
switches the roster mode to six Pokemon, and Pick 3 API requests are rejected.
The app initially selects the first available format, currently Play! Pokémon.

## Generate app data

```bash
bun run lib/scripts/syncPlayPokemon.ts
```

This additive command generates a local PvPoke source overlay under the ignored
`build/play-pokemon-pvpoke/` directory, independently simulates Leads, Closers,
Switches, Chargers, and Attackers, then runs PvPoke's Overall and Consistency
ranker. It uses the vendored engine's scenario definitions. Open Great League
rankings supply initial movesets, but their ranking scores are not reused.
The nine explicit overrides take precedence. An input fingerprint caches these
expensive exports until the rules, engine, gamemaster, or seed rankings change.
The validated seven-category source exports are also stored in
`data/play-pokemon-rankings.json`, with input and output SHA-256 fingerprints.
Read-only simulation projection consumes this bundle without generating files
or running the ranking engine. If the source inputs change, regenerate the
bundle before projection; stale or modified evidence fails explicitly.

The command passes those exports through the normal typed ranking and simulation
pipeline to publish `data/rankings/cp1500/playpokemon/` and
`data/simulations/cp1500/playpokemon/`, including the moveset manifest and compact
runtime snapshot. Existing formats are synchronized with resume enabled; stale
file deletion is omitted. It uses the checked-in Pokemon and move snapshots;
use the full sync workflow when refreshing those shared inputs.

The normal `npm run sync` workflow also prepares the custom source overlay
before its existing full-sync phases. `PVPOKE_PATH`, if supplied, should point
to the original PvPoke checkout, not the generated overlay. Vendor source files
remain unchanged. No PHP server, browser session, or public PvPoke publication
is needed for local generation.

## Rules encoded

The exclusions cover Minior and Mimikyu (including battle-state forms), Cobalion,
Terrakion, Virizion, Reshiram, Zekrom, both Landorus formes, every Kyurem form,
Tapu Koko, Tapu Lele, Tapu Bulu, Solgaleo, Lunala, every Zacian and Zamazenta form,
both Enamorus formes, Groudon, Kyogre, both Dialga and Palkia formes, both
Thundurus and Tornadus formes, ordinary Mewtwo, Shadow Ponyta, Shadow Rapidash,
Shadow Kabuto, Shadow Kabutops, Volcanion, Ditto, Shedinja, Xerneas, Yveltal,
Mudbray, and Mudsdale. Tapu Fini remains eligible.

The official footnote permits the Shadow variants of Landorus Incarnate,
Groudon, Kyogre, ordinary Dialga, ordinary Palkia, Thundurus Incarnate,
Tornadus Incarnate, and Mewtwo. An explicit include-ID exception preserves
these because PvPoke's exclude-ID filter otherwise also excludes Shadows.
The all-types include filter keeps the rest of the eligible pool open.
PvPoke still applies its availability, CP, and ranking stat-product filters.

Mega evolutions are excluded for standard Championship Series play, consistent
with the vendored `championshipseries` definition; this is a separate format
restriction from the linked species list. PvPoke tags Primal forms as Mega.
Event-specific formats may differ.

## Move and acquisition restrictions

The official list additionally prohibits these combinations, not the entire
species:

| Pokemon                         | Banned move  |
| ------------------------------- | ------------ |
| Grimer, Muk, Koffing, Weezing   | Acid         |
| Chansey                         | Psybeam      |
| Staryu, Starmie, Porygon, Pichu | Quick Attack |

The preset locks legal alternative movesets for these nine species. Seven
species have source Overall rankings; their movesets are retained except for
Porygon, whose source Quick Attack is replaced with Tackle. Staryu and Pichu
receive legal manual sets. These are simulation inputs, not claims of optimal
movesets. Do not add a global move exclusion: that would exclude other legal
users and can remove a Pokemon merely for knowing the move.

PvPoke filters cannot prohibit a specific species/move combination across all
manual edits. Removing an override or choosing a banned move invalidates this
preset's move restriction. Review selected moves before using exported results.

Purified Giratina Altered is also banned. PvPoke does not expose purification
as a separate species filter. Its checked-in minimum purified level-25 CP is
2,108, already above this preset's 1,500 CP cap; regular and Shadow Giratina
Altered are intentionally not species-banned. Do not change the preset to a
higher CP cap and assume that purification restriction remains enforced.

The official release window is 00:00 UTC on the Tuesday two weeks after release,
with team registration closing after eligibility begins. This static preset does
not calculate that window, validate acquisition history, or enforce roster-wide
rules. Recheck the official list and event rules before tournament registration.

The current vendored Pokemon schema contains a `released` boolean, but neither
Pokemon nor move records provide structured release dates. Following the task's
October 21 clarification, no additional release-window exclusions are applied.
Future temporary exclusions require an explicit maintained list with dates;
the boolean alone cannot establish tournament eligibility. Update the preset
and regenerate both rankings and simulations when eligibility changes.
