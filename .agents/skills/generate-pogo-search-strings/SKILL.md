---
name: generate-pogo-search-strings
description: Generate or troubleshoot Pokémon GO storage search strings for PvP metas and cups from eligibility rules or PvPoke data, including regional forms and Mega-only candidates. Use for inventory filtering, not team optimization or runtime format implementation.
---

# Generate Pokémon GO Meta Search Strings

Produce copyable inventory searches with explicit eligibility scope and honest
verification status. Pokémon GO search is not a general Boolean expression
evaluator: operator precedence and keyword-specific bugs both matter.

## Establish the requested pool

- Identify the cup, CP cap, rules snapshot, and game language. Use the user's
  context; otherwise state an English-language assumption.
- Distinguish all eligible Pokémon from ranked recommendations, owned roster
  searches, and candidates that become eligible after evolution or transformation.
  Rankings are not a complete legality list.
- Include Mega-only species in the main candidate search when requested. Explain
  that matching an ordinary or Shadow specimen does not make that form legal.
  Do not add pre-evolutions, IV filters, or blanket Shadow exclusions by default.
- Scope work to generating/explaining strings unless the user requests code or
  data changes. This skill grants no permission to modify game inventory.

## Extract rules from evidence

In this repository, resolve these paths from the project root:

| Input                                               | Purpose                                                           |
| --------------------------------------------------- | ----------------------------------------------------------------- |
| `lib/data/battleFormats.ts`                         | Application format IDs, CP caps, and selectable formats           |
| `vendor/pvpoke/src/data/gamemaster/formats.json`    | PvPoke active listings, CP caps, descriptive rules and exceptions |
| `vendor/pvpoke/src/data/gamemaster/cups/{cup}.json` | Structured type, category, species, form, and move rules          |
| `vendor/pvpoke/src/data/gamemaster.json`            | Species IDs, National Pokédex numbers, form types and tags        |
| `vendor/pvpoke/src/data/rankings/{cup}/`            | Ranked subsets, only when the request calls for them              |

Use equivalent inputs if working elsewhere. Read bounded files rather than
searching entire minified datasets. Record the source revision/date when relevant;
a retained cup file does not establish that a format is active. Local active
listings establish the snapshot's state, not the live tournament cycle.

Read both the structured cup and descriptive format rules. Explicit exceptions
can override prohibited types, species, or categories; do not assume that applying
every exclusion last reproduces eligibility. Confirm ambiguous filter semantics
from the relevant source implementation or tournament rules before claiming an
exact result. Preserve runtime boundaries: reading vendor data or code is not
permission to execute or import vendor JavaScript into the application.

Map IDs to dex numbers through data, not memory. Inspect every form sharing a dex
number before excluding it. A base-form ban need not ban its Mega, and a regional
form ban need not ban its ordinary form. Check Shadow inheritance explicitly.

## Translate into storage search syntax

Read [search-semantics.md](references/search-semantics.md) when constructing mixed
operators, regional-form filters, or transformation exceptions, and when debugging
a reported failure. It records sources and evidence limits.

- `&` joins requirements; commas join alternatives within a requirement.
  `A,B&C,D` normally means `(A OR B) AND (C OR D)`. Parentheses here explain the
  grouping; they must not appear in the emitted game string.
- A trailing `&condition` applies to the whole result. A species number at the
  end of the preceding comma group does not receive a special local condition.
- Avoid regional keywords in combined form filters. Use a distinguishing type
  when supported: append `&!222,water` for ordinary Corsola or `&!28,ground` for
  ordinary Sandslash. These clauses constrain the named species while allowing
  other species through that clause; they do not include the species by themselves.
- Do not treat `!222,!galar` or `!28,!alola` as reliable replacements. Negated
  regions have documented side effects outside the intended alternative.
- For prohibited type T with permitted species exceptions, use an OR group such
  as `!fire,6,257,655`, after deriving the actual exception list. Each candidate
  must pass every other group too; a Steel/Fairy exception must pass both groups.
- Use `cp-1500` or the applicable cap. CP is current CP, not projected CP after
  evolving or Mega Evolving. An uncapped format needs no CP exclusion; if a
  nonempty match-all string is useful, use `cp0-`.
- Neither `megaevolve` nor Mega-level searches identify only currently active,
  legal Mega forms. Do not use `!mega` or `!megaevolve` as a general Mega ban.
- If forms cannot be separated with supported, evidenced filters, say so and
  provide a labeled candidate superset or split searches. Do not silently discard
  legal forms to make the search look exact.

## Verify the result at the available level

1. Check data/rule coverage: permitted and banned species, all relevant forms,
   Shadows, dual types, Mega exceptions, CP boundaries, and unaffected controls.
   For a large pool, compare expected candidates against an offline model using
   the source data. An ordinary Boolean model cannot validate the game's bugs.
2. Read [worked-cases.md](references/worked-cases.md) for diagnostic examples and
   representative regression cases. Derive current cup lists anew; do not copy
   historical meta strings as current rules.
3. When the client or user observations are available, isolate clauses in Pokémon
   storage before checking the complete string. Record actual results, game
   version/language, and active filters. Clear unrelated search chips. Expected
   results are not observations, and an empty result proves little when the
   account lacks a matching specimen.
4. For contradictions, obtain the exact failing string and relevant inventory
   controls. Check storage versus Pokédex context, localization, nickname/tag
   collisions, CP, and keyword bugs before diagnosing. Do not assert that a user
   report is impossible because the expression is mathematically valid.

When behavior is disputed or current behavior matters, revisit the primary
sources in the reference using available web tools. Separate official syntax,
dated first-hand reports, maintained documentation, and your own inference. If
the client cannot be tested, finish the useful research and label strings as
source-derived and not tested in-game; do not block ordinary delivery on testing.

## Deliver

Give the format/cap, one-line copyable strings, necessary form/transform caveats,
rule-source links, and actual verification status. Keep Mega-only candidates in
the main string if requested. Search matches do not enforce team point budgets,
duplicate restrictions, or limits on the number of Megas in a roster.
