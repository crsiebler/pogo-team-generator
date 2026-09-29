# Evidence for Pokémon GO storage search behavior

Research reviewed on 2026-09-29. This is a dated evidence record, not a promise
that future clients preserve every behavior. No game-client execution was
performed during the research that produced this skill.

## Syntax and evaluation

The [official inventory search documentation](https://niantic.helpshift.com/hc/en/6-pokemon-go/faq/1486-searching-filtering-your-pokemon-inventory/)
documents dex numbers, types, CP ranges, negation, AND (`&` or `|`), and OR
(`,`, `:`, or `;`). Prefer `&` and commas for clarity; `|` is not an OR alias.
The official page does not fully specify parser precedence or keyword bugs.

[First-hand operator experiments from November 2023](https://www.reddit.com/r/TheSilphRoad/comments/17okvx1/)
and the [maintained Search Phrases reference](https://leidwesen.github.io/SearchPhrases/)
describe comma groups nested inside ampersand groups, with no parentheses.
The reference advertised an update on September 19, 2026, for version 0.429.1
when inspected. Its [table source](https://github.com/Leidwesen/SearchPhrases/blob/master/js/code.js)
contains the detailed notes that may not appear in text-only page extraction.
It is documentation, not Pokémon GO's parser implementation.

For ordinary supported terms, use AND-of-OR groups. For example,
`fire,water&!shadow` requires either type and excludes Shadows. A trailing
ampersand affects every candidate, not just the nearest dex number.

## Regional terms are an exception

- [July 2021 experiments, with a July 2022 update](https://www.reddit.com/r/TheSilphRoad/comments/ooc47n/)
  report that negated regional searches can remove forms even when an OR
  alternative should admit them. The later update reports the issue for Hisui.
- [October 2024 investigation](https://www.reddit.com/r/TheSilphRoad/comments/1ga2x4v/)
  reports a similar global suppression of regional forms from positive early
  region searches, with examples such as `kanto,alola&vulpix`. Thus a positive
  base-region keyword is not a generally safe replacement for a negated region.
- The maintained reference still recorded regional-search defects at the research
  date, including a costume-specific Galarian Corsola classification anomaly.

Do not generalize this into “all negation is broken” or “commas always act like
AND.” In particular, these reports do not prove the exact outcome of every
combination such as `!222,!galar`. The originating user flagged both Corsola
forms and both Sandslash forms disappearing in the proposed strings; this was
not independently reproduced, and the precise failing client conditions were
not established. Preserve that distinction.

## Type-based form filters

[May 2022 discussion and subsequent worked examples](https://www.reddit.com/r/TheSilphRoad/comments/uphpts/)
recommend type-based exclusions in place of problematic regional terms.
[A 2024 generator review](https://www.reddit.com/r/TheSilphRoad/comments/1egy6bq/)
specifically recommends `&!618,steel` to exclude ordinary Stunfisk while retaining
Galarian Stunfisk. These support the pattern `&!DEX,desiredType`.

For other species, first verify their actual form typings. The pattern cannot
distinguish forms with identical types. It also does not establish that every
future type, name, or tag combination is bug-free.

## Other relevant limitations

The maintained reference records ignored negation for IV attribute filters and
unexpectedly limited results for negated Mega-level filters. Use positive ranges
or other supported filters where appropriate; do not assume `!term` always means
the complement of `term`.

The official documentation describes `megaevolve` as eligibility to Mega Evolve
or undergo Primal Reversion, considering energy. It is not an active-form flag.
Mega-level filters track a Pokémon's Mega level rather than tournament legality.

Storage and Pokédex search differ. The maintained reference describes the Pokédex
as lacking logical operators and using base-form typing. Do not apply that
Pokédex limitation to storage searches without separate evidence.

For English storage searches, `655&!steel` is expected to retain Delphox based
on supported syntax and its Fire/Psychic typing. No specific failure of that
combination was established in this research. A failure in a longer string
requires inspecting all groups and active filters rather than guessing which
substring caused it.
