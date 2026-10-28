# Opponent roster sources

No current verified tournament roster corpus is checked in. Runtime uses the
deterministic, format-specific synthetic fallback in
`lib/data/opponentRosters.ts`, labeled as synthetic in result metadata.

Curated input is an object with `schemaVersion: 1`, `formatId`,
`snapshotFingerprint` matching the current synthetic corpus fingerprint, and
`rosters`. Each roster supplies `id`, `family` (use a shared event/family key to
prevent leakage), `species`, `assignment`, `partition` (`selection` or
`held-out`), HTTPS `provenance`, `context`, ISO `verifiedOn` date, and `adapted`.
The assignment follows the existing `RosterMovesetAssignment` contract.

Revalidate legality and relevance after sync changes the fingerprint. Enemy
movesets other than synchronized ranked defaults require `adapted: true` and
are explicitly projected, never claimed as an exact replay. Near-duplicate
rosters cannot gain extra weight or cross partitions. Rejected entries retain
reasons. A malformed schema is an error.

Pass curated data through `loadOpponentRosters(formatId, input)` or validate it
with `validateCuratedOpponentRosters`. No API accepts arbitrary opponent data.
Adding a default runtime corpus requires an explicit import/load integration,
exact asset-trace validation, and verification against current evidence.
