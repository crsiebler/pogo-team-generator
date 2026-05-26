# Type Effectiveness

Type effectiveness is used for defensive weakness/resistance scoring and offensive move pressure scoring. Use `data/type-effectiveness.json` as the source of truth for Pokemon GO type interactions.

## Pokemon GO Multipliers

Pokemon GO uses these damage multipliers:

- Super effective: `1.6x`
- Neutral: `1.0x`
- Not very effective: `0.625x`
- Immunity-style interactions: `0.39x`

Pokemon GO does not use main-series zero-damage immunities. Immunity-style matchups, such as Normal into Ghost or Dragon into Fairy, are represented as heavy resistance at `0.39x`.

## Calculation Formula

For dual-type defenders, multiply both defender-type effectiveness values.

Single-type examples:

- Water into Fire = `1.6x`
- Dragon into Steel = `0.625x`
- Dragon into Fairy = `0.39x`
- Normal into Ghost = `0.39x`

Dual-type examples:

- Water into Fire/Rock = `1.6 * 1.6 = 2.56x`
- Water into Dragon/Fire = `1.0 * 1.6 = 1.6x`
- Dragon into Steel/Fairy = `0.625 * 0.39 = 0.24375x`
- Fire into Grass/Water = `1.6 * 0.625 = 1.0x`
- Ground into Rock/Flying = `1.6 * 0.39 = 0.624x`

## Offensive Scoring

Offensive scoring asks how well a Pokemon, lineup, or roster applies damage with its move types.

For each Pokemon:

- Evaluate fast move and charged move types into top-threat defenders.
- Evaluate the same move types into full-meta defenders.
- Use dual-type multiplication for defenders.
- Reward super-effective and neutral coverage.
- Penalize moves that are frequently resisted.
- Reward move-type diversity when it covers meaningful meta targets.
- Treat same-type attack bonus as a useful modifier when reliable move power data is available.

At roster and lineup level:

- Reward broad offensive pressure into top threats.
- Penalize overreliance on one attacking type.
- Penalize moveset profiles that are frequently resisted by the same defensive core.
- Score top-threat offensive pressure separately from full-meta offensive pressure.

## Defensive Scoring

Defensive scoring asks how well a Pokemon, lineup, or roster receives incoming damage types.

For each Pokemon:

- Count or weight weaknesses where incoming multiplier is greater than `1.0`.
- Count or weight resistances where incoming multiplier is less than `1.0`.
- Penalize double weaknesses more heavily.
- Reward double resistances or immunity-style resistances.

For each lineup or roster:

- Penalize shared weaknesses.
- Penalize ABA shared weakness against top-threat attack types.
- Reward distributed resistances.
- Reward having at least one reliable resistance to common meta attack types.
- Weight top-threat attacking types more heavily than rare types.

The score should be ratio-like or normalized, not a raw count that grows with team size.

## Shared Weakness Severity

Shared weakness severity should account for both type chart and meta relevance.

Examples:

- Two Fire weaknesses are worse when Talonflame, Charizard, or other Fire pressure is common.
- Two Fighting weaknesses are worse when Primeape, Annihilape, or other Fighting pressure is common.
- A shared weakness is less severe when the lineup has two reliable answers to that threat.

Prefer meta-weighted defensive exposure over generic type counts when enough data is available.

## Super Effective Interactions

- Fire into Grass, Ice, Bug, Steel
- Water into Fire, Ground, Rock
- Electric into Water, Flying
- Grass into Water, Ground, Rock
- Ice into Grass, Ground, Flying, Dragon
- Fighting into Normal, Ice, Rock, Dark, Steel
- Poison into Grass, Fairy
- Ground into Fire, Electric, Poison, Rock, Steel
- Flying into Grass, Fighting, Bug
- Psychic into Fighting, Poison
- Bug into Grass, Psychic, Dark
- Rock into Fire, Ice, Flying, Bug
- Ghost into Psychic, Ghost
- Dragon into Dragon
- Dark into Psychic, Ghost
- Steel into Ice, Rock, Fairy
- Fairy into Fighting, Dragon, Dark

## Not Very Effective Interactions

- Fire into Fire, Water, Rock, Dragon
- Water into Water, Grass, Dragon
- Electric into Electric, Grass, Dragon
- Grass into Fire, Grass, Poison, Flying, Bug, Dragon, Steel
- Ice into Fire, Water, Ice, Steel
- Fighting into Poison, Flying, Psychic, Bug, Fairy
- Poison into Poison, Ground, Rock, Ghost
- Ground into Grass, Bug
- Flying into Electric, Rock, Steel
- Psychic into Psychic, Steel
- Bug into Fire, Fighting, Poison, Flying, Ghost, Steel, Fairy
- Rock into Fighting, Ground, Steel
- Ghost into Dark
- Dragon into Steel
- Dark into Fighting, Dark, Fairy
- Steel into Fire, Water, Electric, Steel
- Fairy into Fire, Poison, Steel

## Immunity-Style Interactions

These use `0.39x` in Pokemon GO:

- Normal into Ghost
- Electric into Ground
- Fighting into Ghost
- Poison into Steel
- Ground into Flying
- Psychic into Dark
- Ghost into Normal
- Dragon into Fairy

## Validation

Validation should confirm:

- All 324 single-type interactions are represented: 18 attack types times 18 defender types.
- Single-type interactions match Pokemon GO mechanics.
- Dual-type calculations multiply both defender-type values correctly.
- Immunity-style interactions use `0.39x`, not zero damage.
- Edge cases such as neutral cancellation, double resistance, and double super effectiveness are covered.
