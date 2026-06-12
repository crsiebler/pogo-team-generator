import { describe, expect, test } from 'vitest';
import { scoreMatchupRating } from './matchupScoring';

describe('scoreMatchupRating', () => {
  test('maps battle ratings to clamped soft matchup scores', () => {
    expect(scoreMatchupRating(700)).toBe(1);
    expect(scoreMatchupRating(600)).toBe(1);
    expect(scoreMatchupRating(550)).toBeCloseTo(0.75);
    expect(scoreMatchupRating(500)).toBeCloseTo(0.5);
    expect(scoreMatchupRating(450)).toBeCloseTo(0.25);
    expect(scoreMatchupRating(400)).toBe(0);
    expect(scoreMatchupRating(300)).toBe(0);
  });

  test('distinguishes close matchups from decisive matchups', () => {
    expect(scoreMatchupRating(560)).toBeGreaterThan(scoreMatchupRating(520));
    expect(scoreMatchupRating(520)).toBeGreaterThan(0.5);
    expect(scoreMatchupRating(500)).toBeCloseTo(0.5);
    expect(scoreMatchupRating(480)).toBeLessThan(0.5);
    expect(scoreMatchupRating(480)).toBeGreaterThan(scoreMatchupRating(440));
  });
});
