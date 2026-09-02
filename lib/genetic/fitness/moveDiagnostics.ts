import { resolveAdditionalChargedMove } from '@/lib/data/additionalMegaMove';
import type { Pokemon } from '@/lib/types';

/** Move fields needed by optimizer diagnostics. */
export interface DiagnosticMoveData {
  readonly type: string;
  readonly power?: number;
  readonly energy?: number;
  readonly isMegaMove?: boolean;
}

/** Selectable and fixed charged moves used by paper diagnostics. */
export interface DiagnosticMoveset {
  readonly fastMove: string | null;
  readonly chargedMove1: string | null;
  readonly chargedMove2: string | null;
  readonly additionalChargedMove?: string;
  readonly megaLevel?: 4;
}

/** Add synchronized fixed Mega-move metadata without changing variant identity. */
export function resolveDiagnosticMoveset(
  pokemon: Pokemon,
  moveset: DiagnosticMoveset,
  getMove: (moveId: string) => DiagnosticMoveData | undefined,
  resolveFromPokemon: boolean = true,
): DiagnosticMoveset {
  const additionalChargedMove =
    moveset.additionalChargedMove ??
    (resolveFromPokemon
      ? resolveAdditionalChargedMove(pokemon, getMove)
      : undefined);
  if (additionalChargedMove === undefined) {
    return moveset;
  }

  return {
    ...moveset,
    additionalChargedMove,
    megaLevel: moveset.megaLevel ?? 4,
  };
}

/** Return all effective charged moves while preserving the fixed move order. */
export function getDiagnosticChargedMoveIds(
  moveset: DiagnosticMoveset,
): string[] {
  return [
    moveset.chargedMove1,
    moveset.chargedMove2,
    moveset.additionalChargedMove,
  ].filter(
    (moveId): moveId is string => moveId !== null && moveId !== undefined,
  );
}

/** Apply PvPoke's fixed Level 4 bonus only to the active Mega move's power. */
export function getDiagnosticMovePower(
  move: DiagnosticMoveData,
  moveId: string,
  moveset: DiagnosticMoveset,
): number | undefined {
  if (move.power === undefined) {
    return undefined;
  }

  const megaMultiplier =
    moveId === moveset.additionalChargedMove &&
    moveset.megaLevel === 4 &&
    move.isMegaMove === true
      ? 1.3
      : 1;

  return move.power * megaMultiplier;
}
