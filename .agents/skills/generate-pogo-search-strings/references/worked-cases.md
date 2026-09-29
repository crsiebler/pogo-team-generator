# Worked cases and verification scenarios

These are source-derived expectations, not results observed in the game client.
The original local PvPoke checkout identified HEAD as
`9dab4bcc8ce8cf201cca34c7632688674084eb16` on 2026-09-29; that identifies the
checkout commit, not proof that its working tree was pristine. Re-read current
rules and forms before using these examples for a tournament.

## Regional form restrictions

| Requirement             | Clause appended to an existing candidate pool | Reason                                                         |
| ----------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| Ordinary Corsola only   | `&!222,water`                                 | Ordinary Corsola is Water/Rock; Galarian Corsola is Ghost      |
| Ordinary Sandslash only | `&!28,ground`                                 | Ordinary Sandslash is Ground; Alolan Sandslash is Ice/Steel    |
| Galarian Stunfisk only  | `&!618,steel`                                 | Ordinary Stunfisk is Ground/Electric; Galarian is Ground/Steel |

Every non-target species satisfies the negated dex alternative. The target
species must satisfy the desired type. The initial pool must already include
the target species; a later AND clause cannot restore it after a species ban.

When diagnosing in-game behavior, use these small searches with known specimens
and no unrelated filters:

| Diagnostic                       | Expected result                              |
| -------------------------------- | -------------------------------------------- |
| `222`                            | Both Corsola forms, if owned                 |
| `222&!222,water`                 | Ordinary Corsola only                        |
| `28`                             | Both Sandslash forms, if owned               |
| `28&!28,ground`                  | Ordinary Sandslash, including Shadows        |
| `655` compared with `655&!steel` | Same Delphox specimens, absent other effects |
| `28,222&!28,ground&!222,water`   | Ordinary Sandslash and ordinary Corsola      |

Validate the full cup string separately after isolated clauses. Inspect a legal
regional Pokémon of another species to detect unintended global suppression.
For example, Cauldron's type rules should retain Alolan Ninetales even while
excluding Alolan Sandslash.

## LAIC Mega-only species in one candidate search

The inspected LAIC 2027 rules prohibited Fire, Dark, Fairy, and Steel and several
categories/species, while explicitly permitting listed Megas despite those
restrictions. Read `formats.json` alongside `cups/laic2027.json` to see the
override. Derive the full exception set before constructing each group.

- Delphox requires inclusion in the Fire exception group, such as
  `!fire,6,257,655`. This illustrative group is incomplete for the full cup.
- Mawile is Steel/Fairy, so its dex number must appear in both applicable
  exception groups; inclusion in only one still excludes it.
- Listed Mega Latias and Latios require exceptions to the Legendary exclusion;
  listed Mega Diancie requires exceptions to both Mythical and Fairy exclusions.
- Altaria and Medicham cannot remain unconditional dex bans when their listed
  Mega forms are requested as candidates.
- Mega Sableye remains banned in the inspected rules. Do not add it merely
  because it is a Mega-capable species.

Species exceptions deliberately return candidates, including ordinary forms
that are illegal until transformed. If including Shadows of Mega-only species,
state that they cannot qualify as-is. Do not remove all Shadows: many ordinary
eligible species may legally be Shadow. Do not imply every listed transformation
is currently available to the player. Check CP after transformation separately.

## Offline checks versus client evidence

An offline comparison can establish that clauses implement a chosen candidate
set over the input Pokémon data. It cannot prove that the game parses those
clauses identically. Keep the target set independent of the generated query;
otherwise the check simply repeats its assumptions.

Include legal and illegal controls for each rule, not just top-ranked Pokémon.
For these examples, useful controls include both Corsola forms, both Sandslash
forms and Shadows, Alolan Ninetales, Delphox, dual-type Mawile, and the LAIC
Legendary/Mythical Mega exceptions. Include CP values immediately below, at, and
above the cap when actual CP data is available. Handle same-dex battle-state forms
explicitly; a raw ID comparison can misclassify bans such as Mimikyu's forms.

Report which checks actually ran. Label rule derivation, offline model checks,
user-reported observations, and direct client verification separately. If an
expected result fails, preserve the observation and investigate rather than
changing an assertion merely to obtain a passing check.
