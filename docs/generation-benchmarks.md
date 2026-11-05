# Team generation benchmarks

Run `bun run lib/scripts/benchmarkGeneration.ts [format] [PlayPokemon|GBL] [runs]`.
The defaults are `play-pokemon PlayPokemon 2`; each run uses seed 20, a
population of 150, and a 75-generation cap. The first run starts with an
unloaded format; subsequent runs reuse the same process caches. JSON lines
include phase timings, total time, tournament counters where available, and
process RSS at completion. Run a fresh process to repeat the cold-format case.

The timer starts after module imports and measures `generateTeam`, not process
startup, request validation, API analysis, serialization, network time, or peak
memory. Data loaded lazily after the initial snapshot availability check is
included in the later phase that triggered it. Search includes initial population
construction and evaluation. Finalists measures tournament reranking; GBL has no
separate reranking phase. Diagnostics covers the optimizer's final scoring and
recommendations, not API analysis. The small differences between phase sums and
total include timing and observer overhead.

## Initial measurements

On 2026-11-04, local arm64 macOS, Bun 1.4.2, with checked-in data and seed 20:

| Format and run                | Total ms | Data ms | Setup ms | Search ms | Finalists ms | Diagnostics ms |
| ----------------------------- | -------: | ------: | -------: | --------: | -----------: | -------------: |
| Play! Pokémon, cold format    |   32,258 |      35 |       46 |    20,117 |       12,056 |              3 |
| Play! Pokémon, warm           |   32,656 |      <1 |        6 |    20,282 |       12,365 |              3 |
| Great League GBL, cold format |    2,051 |      30 |       48 |     1,970 |           <1 |              4 |
| Great League GBL, warm        |    1,942 |      <1 |        7 |     1,931 |           <1 |              4 |

The first Play! Pokémon run overlapped briefly with test and typecheck work;
the other runs did not. These are single observations per state, not latency
distributions or production measurements. The Play! Pokémon runs reached 75
generations, with 5,601 search evaluation misses, 7,811 hits, and 100 finalists;
finalist scoring recorded 12,000 lineup cache misses and 120 hits. RSS at the
end of the cold and warm tournament runs was approximately 429 MB and 511 MB,
respectively, not isolated per-request peak memory. Both runs used the same seed
and budget. Further seeds, formats, API-level measurements, and profiling are
needed before estimating production impact or choosing an optimization.
