/** One legal fast-move and charged-move combination for a canonical species. */
export interface MovesetVariant {
  id: string;
  fastMove: string;
  chargedMove1: string;
  chargedMove2: string;
  isDefault: boolean;
}

export interface RankedMoveset {
  fastMove: string;
  chargedMove1: string;
  chargedMove2: string;
}

const ALTERNATE_FAST_MOVES_BY_SPECIES_ID: Readonly<
  Record<string, readonly string[]>
> = {
  golisopod: ['SHADOW_CLAW'],
};

/** Build a stable identifier for a moveset variant. */
export function getMovesetVariantId(moveset: RankedMoveset): string {
  return [moveset.fastMove, moveset.chargedMove1, moveset.chargedMove2]
    .join('--')
    .toLowerCase();
}

/** Return the ranked default followed by configured legal alternatives. */
export function getMovesetVariants(
  speciesId: string,
  rankedDefault: RankedMoveset,
): MovesetVariant[] {
  const defaultVariant: MovesetVariant = {
    ...rankedDefault,
    id: getMovesetVariantId(rankedDefault),
    isDefault: true,
  };
  const alternateFastMoves =
    ALTERNATE_FAST_MOVES_BY_SPECIES_ID[speciesId] ?? [];

  return [
    defaultVariant,
    ...alternateFastMoves
      .filter((fastMove) => fastMove !== rankedDefault.fastMove)
      .map((fastMove): MovesetVariant => {
        const moveset = { ...rankedDefault, fastMove };
        return {
          ...moveset,
          id: getMovesetVariantId(moveset),
          isDefault: false,
        };
      }),
  ];
}

/** Select the highest average simulated variant, preserving the default on ties. */
export function selectBestMovesetVariant(
  variants: readonly MovesetVariant[],
  opponents: readonly string[],
  getBattleRating: (
    variant: MovesetVariant,
    opponentSpeciesId: string,
  ) => number | null,
): MovesetVariant {
  const defaultVariant = variants.find((variant) => variant.isDefault);
  if (!defaultVariant) {
    throw new Error('Moveset variants must include a ranked default.');
  }

  let bestVariant = defaultVariant;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const variant of variants) {
    const ratings = opponents
      .map((opponent) => getBattleRating(variant, opponent))
      .filter((rating): rating is number => rating !== null);

    if (ratings.length === 0) {
      continue;
    }

    const score =
      ratings.reduce((sum, rating) => sum + rating, 0) / ratings.length;
    if (score > bestScore) {
      bestVariant = variant;
      bestScore = score;
    }
  }

  return bestVariant;
}
