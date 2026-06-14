import type { RankedPokemon } from '../types';
import { deriveCandidateRankingBands } from './candidateRankingBands';

function makeRanking(pokemon: string, score: number): RankedPokemon {
  return {
    Pokemon: pokemon,
    Score: score,
    Dex: 1,
    'Type 1': 'Normal',
    'Type 2': '',
    Attack: 100,
    Defense: 100,
    Stamina: 100,
    'Stat Product': 1000,
    Level: 20,
    CP: 1500,
    'Fast Move': 'Tackle',
    'Charged Move 1': 'Body Slam',
    'Charged Move 2': 'Dig',
    'Charged Move 1 Count': 5,
    'Charged Move 2 Count': 8,
    'Buddy Distance': 3,
    'Charged Move Cost': 50000,
  };
}

function makeDenseOpenCurve(count: number, offset = 0): RankedPokemon[] {
  return Array.from({ length: count }, (_, index) => {
    const score = 91.7 - index * 0.18 - Math.floor(index / 30) * 0.22;
    return makeRanking(
      `Dense ${index + 1}`,
      Number((score + offset).toFixed(2)),
    );
  });
}

function makeSteepLimitedCurve(): RankedPokemon[] {
  const scores = [
    96.4, 95.3, 94.1, 91.9, 88.2, 84.9, 82.4, 80.1, 78.6, 77.4, 76.5, 75.7,
    75.0, 74.4, 73.9, 73.5, 73.2, 72.9, 72.6, 72.4, 72.2, 72.0, 71.8, 71.6,
    71.4, 71.2, 71.0, 70.8, 70.6, 70.4, 70.2, 70.0, 69.8, 69.6, 69.4, 69.2,
  ];

  return scores.map((score, index) =>
    makeRanking(`Limited ${index + 1}`, score),
  );
}

function makeSameSizeSteepCurve(count: number): RankedPokemon[] {
  return Array.from({ length: count }, (_, index) => {
    const score = index < 12 ? 96 - index * 1.7 : 76 - (index - 12) * 0.08;

    return makeRanking(
      `Same Size Steep ${index + 1}`,
      Number(score.toFixed(2)),
    );
  });
}

describe('deriveCandidateRankingBands', () => {
  it('derives wider candidate bands for dense open-format score curves', () => {
    const result = deriveCandidateRankingBands(makeDenseOpenCurve(120), {
      minCandidates: 18,
      maxCandidates: 60,
      minBandSize: 3,
    });

    expect(result.candidateCount).toBeGreaterThanOrEqual(18);
    expect(result.candidateCount).toBeLessThanOrEqual(60);
    expect(result.bands.eliteAnchors).not.toHaveLength(0);
    expect(result.bands.preferredAnchors).not.toHaveLength(0);
    expect(result.bands.normalCompanions).not.toHaveLength(0);
    expect(result.bands.flexibleCompanions).not.toHaveLength(0);
    expect(result.bands.specialists).not.toHaveLength(0);

    const bandedNames = result.assignments.map(
      (assignment) => assignment.pokemon,
    );
    expect(bandedNames).toContain('Dense 1');
    expect(bandedNames).toContain('Dense 40');
  });

  it('uses steep limited-meta dropoffs to keep anchor bands tighter', () => {
    const options = {
      minCandidates: 12,
      maxCandidates: 60,
      minBandSize: 2,
    };
    const denseResult = deriveCandidateRankingBands(
      makeDenseOpenCurve(120),
      options,
    );
    const sameSizeSteepResult = deriveCandidateRankingBands(
      makeSameSizeSteepCurve(120),
      options,
    );
    const limitedResult = deriveCandidateRankingBands(
      makeSteepLimitedCurve(),
      options,
    );

    expect(sameSizeSteepResult.candidateCount).toBeLessThan(
      denseResult.candidateCount,
    );
    expect(limitedResult.candidateCount).toBeGreaterThanOrEqual(12);
    expect(limitedResult.candidateCount).toBeLessThan(
      denseResult.candidateCount,
    );
    expect(limitedResult.bands.eliteAnchors).toHaveLength(2);
    expect(limitedResult.bands.preferredAnchors.length).toBeLessThan(
      denseResult.bands.preferredAnchors.length,
    );
  });

  it('classifies relative curve quality instead of hardcoded global score thresholds', () => {
    const shiftedDenseResult = deriveCandidateRankingBands(
      makeDenseOpenCurve(80, -8),
      {
        minCandidates: 15,
        maxCandidates: 45,
        minBandSize: 3,
      },
    );

    expect(shiftedDenseResult.bands.eliteAnchors[0]?.score).toBeLessThan(92);
    expect(
      shiftedDenseResult.bands.preferredAnchors.at(-1)?.score,
    ).toBeLessThan(90);
    expect(
      shiftedDenseResult.bands.normalCompanions.at(-1)?.score,
    ).toBeLessThan(88);
    expect(
      shiftedDenseResult.bands.flexibleCompanions.some(
        (assignment) => assignment.score < 85,
      ),
    ).toBe(true);
    expect(shiftedDenseResult.scoreCutoffs).not.toEqual([92, 90, 88, 85]);
  });

  it('keeps boundaries feasible for undersized ranking exports', () => {
    const result = deriveCandidateRankingBands(makeDenseOpenCurve(4), {
      minCandidates: 4,
      maxCandidates: 4,
      minBandSize: 3,
    });

    expect(result.candidateCount).toBe(4);
    expect(result.bands.eliteAnchors).toHaveLength(1);
    expect(result.assignments[0]?.band).toBe('eliteAnchors');
    expect(result.scoreCutoffs).toEqual(
      [...result.scoreCutoffs].sort((a, b) => b - a),
    );
  });
});
