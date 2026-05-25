import { calculateEffectiveness } from '@/lib/coverage/typeChart';

interface OffensiveTypeRatioInput {
  attackingMoveTypes: string[];
  defenderTypeProfiles: string[][];
}

interface DefensiveTypeRatioInput {
  defenderTypes: string[][];
  incomingAttackTypes: string[];
}

/** Calculates a Pokemon GO type-effectiveness multiplier from the checked-in type chart. */
export function calculateTypeEffectivenessMultiplier(
  attackType: string,
  defenderTypes: string[],
): number {
  return calculateEffectiveness(defenderTypes, attackType);
}

/** Scores selected fast and charged move types into expected defender type profiles. */
export function calculateOffensiveTypeRatio(
  input: OffensiveTypeRatioInput,
): number {
  const attackingMoveTypes = normalizeTypes(input.attackingMoveTypes);
  const defenderTypeProfiles = input.defenderTypeProfiles.filter(
    (types) => types.length > 0,
  );

  if (attackingMoveTypes.length === 0 || defenderTypeProfiles.length === 0) {
    return 0.5;
  }

  return average(
    defenderTypeProfiles.map((defenderTypes) => {
      const bestMultiplier = Math.max(
        ...attackingMoveTypes.map((attackType) =>
          calculateTypeEffectivenessMultiplier(attackType, defenderTypes),
        ),
      );

      return normalizeOffensiveMultiplier(bestMultiplier);
    }),
  );
}

/** Scores defensive resistance versus weakness exposure against expected attack types. */
export function calculateDefensiveTypeRatio(
  input: DefensiveTypeRatioInput,
): number {
  const defenderTypes = input.defenderTypes.filter((types) => types.length > 0);
  const incomingAttackTypes = normalizeTypes(input.incomingAttackTypes);

  if (defenderTypes.length === 0 || incomingAttackTypes.length === 0) {
    return 0.5;
  }

  return average(
    incomingAttackTypes.map((attackType) =>
      scoreDefensiveExposureForAttackType(attackType, defenderTypes),
    ),
  );
}

function scoreDefensiveExposureForAttackType(
  attackType: string,
  defenderTypes: string[][],
): number {
  const multipliers = defenderTypes.map((types) =>
    calculateTypeEffectivenessMultiplier(attackType, types),
  );
  const resistanceCount = multipliers.filter((value) => value < 1).length;
  const weaknessCount = multipliers.filter((value) => value > 1).length;
  const doubleResistanceCount = multipliers.filter(
    (value) => value <= 0.390626,
  ).length;
  const doubleWeaknessCount = multipliers.filter(
    (value) => value >= 2.56,
  ).length;
  const sharedWeaknessCount = Math.max(0, weaknessCount - 1);
  const averageExposure = average(
    multipliers.map((multiplier) => normalizeDefensiveMultiplier(multiplier)),
  );

  return clamp01(
    averageExposure +
      Math.min(resistanceCount, 2) * 0.1 +
      doubleResistanceCount * 0.08 -
      sharedWeaknessCount * 0.14 -
      doubleWeaknessCount * 0.18,
  );
}

function normalizeOffensiveMultiplier(multiplier: number): number {
  if (multiplier >= 2.56) {
    return 1;
  }
  if (multiplier >= 1.6) {
    return 0.82;
  }
  if (multiplier >= 1) {
    return 0.6;
  }
  if (multiplier >= 0.625) {
    return 0.3;
  }
  return 0.12;
}

function normalizeDefensiveMultiplier(multiplier: number): number {
  if (multiplier <= 0.390626) {
    return 1;
  }
  if (multiplier <= 0.625) {
    return 0.78;
  }
  if (multiplier < 1) {
    return 0.65;
  }
  if (multiplier === 1) {
    return 0.52;
  }
  if (multiplier < 2.56) {
    return 0.22;
  }
  return 0.05;
}

function normalizeTypes(types: string[]): string[] {
  return types
    .map((type) => type.trim().toLowerCase())
    .filter((type) => type.length > 0);
}

function average(values: number[]): number {
  return values.length > 0
    ? values.reduce((total, value) => total + value, 0) / values.length
    : 0;
}

function clamp01(value: number): number {
  return Math.min(1, Math.max(0, value));
}
