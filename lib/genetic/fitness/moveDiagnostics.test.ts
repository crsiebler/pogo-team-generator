import { describe, expect, test } from 'vitest';
import {
  getDiagnosticMovePower,
  type DiagnosticMoveset,
} from './moveDiagnostics';

describe('getDiagnosticMovePower', () => {
  const megaMoveset: DiagnosticMoveset = {
    fastMove: 'FAST',
    chargedMove1: 'CHARGED_A',
    chargedMove2: 'CHARGED_B',
    additionalChargedMove: 'MEGA_MOVE',
    megaLevel: 4,
  };

  test('applies the Level 4 multiplier only to the fixed Mega move', () => {
    expect(
      getDiagnosticMovePower(
        { type: 'grass', power: 70, isMegaMove: true },
        'MEGA_MOVE',
        megaMoveset,
      ),
    ).toBeCloseTo(91);
    expect(
      getDiagnosticMovePower(
        { type: 'normal', power: 70, isMegaMove: true },
        'CHARGED_A',
        megaMoveset,
      ),
    ).toBe(70);
  });

  test('does not treat status-effect data as extra raw damage', () => {
    const statusMove = {
      type: 'grass',
      power: 70,
      isMegaMove: true,
      buffs: [0, -2] as const,
    };
    expect(
      getDiagnosticMovePower(statusMove, 'MEGA_MOVE', megaMoveset),
    ).toBeCloseTo(91);
  });
});
