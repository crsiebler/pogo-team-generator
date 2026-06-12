/** Maps a PvPoke-style battle rating to a normalized soft matchup score. */
export function scoreMatchupRating(rating: number): number {
  if (!Number.isFinite(rating)) {
    return 0.5;
  }

  return clamp01((rating - 400) / 200);
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
