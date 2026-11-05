# Pregenerated teams

Ranked-default Play! Pokémon, Great League, and Ultra League requests can select
a team generated offline with the normal 150-population, 75-generation search.
Each format has an unconstrained pool and single-anchor pools for the first two
distinct species in its synchronized Overall rankings. Rankings are a proxy for
potential interest, not a claim about actual player usage. Other formats,
experimental movesets, multiple or unsupported anchors, exclusions, and stale
data use live generation.
The response analysis and Pokémon details are built on request using the scored
assignment. Selection from a finite pool is not a fresh search. Pick-six pools
retain the normal winner and up to three additional nondominated, fully evaluated
finalists from the same selection corpus. Alternatives can trade off objective
values and are not necessarily the normal policy's winner. GBL pools retain
the winner and up to three other distinct high-scoring final-population teams
from each seeded search; these alternatives can have lower scores.

Run `bun run lib/scripts/generateTeamPool.ts` after refreshing data or changing
optimizer behavior. It runs seed 20 for pick-six and seeds 20, 7, and 42 for GBL,
deduplicates rosters, and writes the checked-in application artifact. The
generation may take several minutes. The generated artifact compresses the
typed pool results; pool tests validate roster legality, moveset authority,
selection evidence, and input fingerprints after decoding. Runtime fingerprints include the format's
snapshot, all ranking categories, Pokémon, moves, type chart, and tournament
policy version; changed data automatically causes a live-generation fallback.
The source-fingerprint test detects changed optimizer and data-loader source
and requires regenerating the pool. Run that test before deploying: source
freshness is enforced by verification, not checked in the deployed function.
Generation is explicit and is not automatically run by sync.
