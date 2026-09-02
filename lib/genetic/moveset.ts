import { resolveAdditionalChargedMove } from '@lib/data/additionalMegaMove';
import { normalizeMoveId } from '@lib/data/aliases';
import type { BattleFormatId } from '@lib/data/battleFormats';
import { getMovesetAvailability } from '@lib/data/moveAvailability';
import { getMoveByMoveId } from '@lib/data/moves';
import {
  getMovesetVariantId,
  selectBestMovesetVariant,
} from '@lib/data/movesetVariants';
import { getPokemonBySpeciesId } from '@lib/data/pokemon';
import {
  getOptimalMoveset,
  getRoleBasedThreatSpeciesIds,
} from '@lib/data/rankings';
import { MovesetVariantSimulationDataError } from '@lib/data/runtimeSimulationRepository';
import {
  ensureSimulationDataAvailable,
  getActiveMovesetVariants,
  getMatchupResult,
  getMovesetVariantManifestPolicyIdentity,
} from '@lib/data/simulations';
import type {
  EligibleMoveAvailability,
  Moveset,
  MovesetAcquisitionRequirements,
  MovesetAssignmentPolicyIdentity,
  MovesetVariant,
  MovesetVariantId,
  Pokemon,
  RosterMovesetAssignment,
} from '../types';

/**
 * Get strict recommended moveset from rankings for a Pokemon.
 * Falls back to the Pokemon's first available moves when ranking data is missing.
 */
export function getRecommendedMovesetForPokemon(
  pokemon: Pokemon,
  formatId?: BattleFormatId,
): Moveset {
  const rankedMoves = getOptimalMoveset(pokemon.speciesName, formatId);

  return {
    fastMove: rankedMoves.fastMove || pokemon.fastMoves[0],
    chargedMove1: rankedMoves.chargedMove1 || pokemon.chargedMoves[0],
    chargedMove2:
      rankedMoves.chargedMove2 ||
      pokemon.chargedMoves[1] ||
      pokemon.chargedMoves[0],
  };
}

function getCompleteRankedMovesetForPokemon(
  pokemon: Pokemon,
  formatId: BattleFormatId,
): Moveset | undefined {
  const rankedMoves = getOptimalMoveset(pokemon.speciesName, formatId);
  if (
    !rankedMoves.fastMove ||
    !rankedMoves.chargedMove1 ||
    !rankedMoves.chargedMove2
  ) {
    return undefined;
  }
  return {
    fastMove: rankedMoves.fastMove,
    chargedMove1: rankedMoves.chargedMove1,
    chargedMove2: rankedMoves.chargedMove2,
  };
}

interface SimulationBackedMovesetDependencies {
  getVariants: (
    speciesId: string,
    formatId: BattleFormatId,
  ) => readonly MovesetVariant[];
  getThreats: (formatId: BattleFormatId) => string[];
  getDefaultMatchupRating: (
    speciesId: string,
    opponentSpeciesId: string,
  ) => number | null;
  getVariantMatchupRating: (
    speciesId: string,
    movesetVariantId: MovesetVariantId,
    opponentSpeciesId: string,
  ) => number | null;
  getRankedDefault?: (pokemon: Pokemon, formatId: BattleFormatId) => Moveset;
}

/** Injectable boundaries for deterministic roster assignment resolution. */
export interface RosterMovesetAssignmentDependencies {
  getPokemon: (speciesId: string) => Pokemon | undefined;
  getManifestPolicyIdentity: (
    formatId: BattleFormatId,
  ) => Readonly<{ schemaVersion: number; policyVersion: string }>;
  getMovesetVariantForTeam: (
    pokemon: Pokemon,
    team: readonly string[],
    formatId: BattleFormatId,
  ) => MovesetVariant;
  getRankedDefault: (pokemon: Pokemon, formatId: BattleFormatId) => Moveset;
}

/** Injectable boundaries for bounded roster assignment enumeration. */
export interface RosterMovesetAssignmentEnumerationDependencies {
  getPokemon: (speciesId: string) => Pokemon | undefined;
  getManifestPolicyIdentity: (
    formatId: BattleFormatId,
  ) => Readonly<{ schemaVersion: number; policyVersion: string }>;
  getActiveVariants: (
    speciesId: string,
    formatId: BattleFormatId,
  ) => readonly MovesetVariant[];
  getRankedDefault: (pokemon: Pokemon, formatId: BattleFormatId) => Moveset;
}

/** Injectable boundaries for ranked-default roster assignment resolution. */
export interface RankedDefaultRosterMovesetAssignmentDependencies {
  getPokemon: (speciesId: string) => Pokemon | undefined;
  getRankedDefault: (pokemon: Pokemon, formatId: BattleFormatId) => Moveset;
}

/** Injectable runtime authorities for validating returned roster assignments. */
export interface RosterMovesetAuthorityValidationDependencies {
  ensureSimulationData: (formatId: BattleFormatId) => void;
  getManifestPolicyIdentity: (
    formatId: BattleFormatId,
  ) => Readonly<{ schemaVersion: number; policyVersion: string }>;
  getActiveVariants: (
    speciesId: string,
    formatId: BattleFormatId,
  ) => readonly MovesetVariant[];
  getPokemon: (speciesId: string) => Pokemon | undefined;
  getRankedDefault: (
    pokemon: Pokemon,
    formatId: BattleFormatId,
  ) => Moveset | undefined;
}

/** Input used to create a validated immutable roster assignment value. */
export interface CreateRosterMovesetAssignmentInput {
  readonly formatId: BattleFormatId;
  readonly authorityBySpeciesId: Readonly<
    Record<string, MovesetAssignmentPolicyIdentity>
  >;
  readonly variantsBySpeciesId: Readonly<Record<string, MovesetVariant>>;
}

/** Assigned moveset projected for API display without selecting another variant. */
export interface AssignedMovesetDetails extends MovesetVariant {
  readonly authority: MovesetAssignmentPolicyIdentity;
  readonly acquisitionRequirements: MovesetAcquisitionRequirements;
}

/** Typed failure raised when a client-supplied roster assignment is inconsistent. */
export class RosterMovesetAssignmentValidationError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RosterMovesetAssignmentValidationError';
  }
}

const RANKED_DEFAULT_POLICY_IDENTITY: MovesetAssignmentPolicyIdentity = {
  source: 'ranked-default-fallback',
  schemaVersion: 0,
  policyVersion: 'ranked-default-v1',
};
const MAX_ACTIVE_VARIANTS_PER_SPECIES = 3;
const MAX_ROSTER_SIZE = 6;
const MAX_ASSIGNMENT_STRING_LENGTH = 128;
const MAX_ASSIGNMENT_FINGERPRINT_LENGTH = 16_384;
export const MAX_ROSTER_MOVESET_ASSIGNMENTS = 3 ** 6;

function toDefaultMovesetVariant(
  moveset: Moveset,
  pokemon?: Pokemon,
): MovesetVariant {
  const additionalChargedMove = resolveAdditionalChargedMove(pokemon);

  return {
    ...moveset,
    id: getMovesetVariantId(moveset),
    isDefault: true,
    ...(additionalChargedMove
      ? { additionalChargedMove, megaLevel: 4 as const }
      : {}),
  };
}

function isUnsupportedSpeciesVariantError(
  error: unknown,
  formatId: BattleFormatId,
  speciesId: string,
): error is MovesetVariantSimulationDataError {
  return (
    error instanceof MovesetVariantSimulationDataError &&
    error.code === 'variant-unavailable' &&
    error.formatId === formatId &&
    error.speciesId === speciesId &&
    error.variantId === undefined
  );
}

function matchesPolicyIdentity(
  actual: MovesetAssignmentPolicyIdentity,
  expected: MovesetAssignmentPolicyIdentity,
): boolean {
  return (
    actual.source === expected.source &&
    actual.schemaVersion === expected.schemaVersion &&
    actual.policyVersion === expected.policyVersion
  );
}

function matchesMovesetVariant(
  actual: MovesetVariant,
  expected: MovesetVariant,
): boolean {
  return (
    actual.id === expected.id &&
    actual.fastMove === expected.fastMove &&
    actual.chargedMove1 === expected.chargedMove1 &&
    actual.chargedMove2 === expected.chargedMove2 &&
    actual.isDefault === expected.isDefault &&
    actual.additionalChargedMove === expected.additionalChargedMove &&
    actual.megaLevel === expected.megaLevel
  );
}

/** Select a legal moveset using simulations against threats unresolved by teammates. */
export function getSimulationBackedMovesetForTeam(
  pokemon: Pokemon,
  team: readonly string[],
  formatId: BattleFormatId,
  dependencies?: SimulationBackedMovesetDependencies,
): Moveset {
  let selected: MovesetVariant;
  try {
    selected = getSimulationBackedMovesetVariantForTeam(
      pokemon,
      team,
      formatId,
      dependencies,
    );
  } catch (error) {
    if (!isUnsupportedSpeciesVariantError(error, formatId, pokemon.speciesId)) {
      throw error;
    }
    selected = toDefaultMovesetVariant(
      (dependencies?.getRankedDefault ?? getRecommendedMovesetForPokemon)(
        pokemon,
        formatId,
      ),
      pokemon,
    );
  }
  return {
    fastMove: selected.fastMove,
    chargedMove1: selected.chargedMove1,
    chargedMove2: selected.chargedMove2,
  };
}

/** Select a complete simulation-backed moveset variant for one roster member. */
export function getSimulationBackedMovesetVariantForTeam(
  pokemon: Pokemon,
  team: readonly string[],
  formatId: BattleFormatId,
  dependencies?: SimulationBackedMovesetDependencies,
): MovesetVariant {
  const resolvedDependencies: SimulationBackedMovesetDependencies =
    dependencies ?? {
      getVariants: getActiveMovesetVariants,
      getThreats: (selectedFormatId) =>
        getRoleBasedThreatSpeciesIds(50, selectedFormatId),
      getDefaultMatchupRating: (speciesId, opponentSpeciesId) =>
        getMatchupResult(speciesId, opponentSpeciesId, formatId),
      getVariantMatchupRating: (
        speciesId,
        movesetVariantId,
        opponentSpeciesId,
      ) =>
        getMatchupResult(
          speciesId,
          opponentSpeciesId,
          formatId,
          movesetVariantId,
        ),
    };
  const variants = resolvedDependencies.getVariants(
    pokemon.speciesId,
    formatId,
  );
  const defaultVariant = variants.find(({ isDefault }) => isDefault);
  if (!defaultVariant) {
    throw new Error('Active moveset variants must include a manifest default.');
  }
  if (variants.length === 1) {
    return defaultVariant;
  }
  const teammates = team.filter((speciesId) => speciesId !== pokemon.speciesId);
  const unresolvedThreats = resolvedDependencies
    .getThreats(formatId)
    .filter((threat) => {
      return !teammates.some((speciesId) => {
        const rating = resolvedDependencies.getDefaultMatchupRating(
          speciesId,
          threat,
        );
        return rating !== null && rating >= 500;
      });
    });

  if (unresolvedThreats.length === 0) {
    return defaultVariant;
  }

  const selected = selectBestMovesetVariant(
    variants,
    unresolvedThreats,
    (variant, opponentSpeciesId) => {
      return variant.isDefault
        ? resolvedDependencies.getDefaultMatchupRating(
            pokemon.speciesId,
            opponentSpeciesId,
          )
        : resolvedDependencies.getVariantMatchupRating(
            pokemon.speciesId,
            variant.id,
            opponentSpeciesId,
          );
    },
  );

  return selected;
}

/** Create a deeply immutable assignment with canonical deterministic identity. */
export function createRosterMovesetAssignment(
  input: CreateRosterMovesetAssignmentInput,
): RosterMovesetAssignment {
  const sortedVariants = Object.entries(input.variantsBySpeciesId).toSorted(
    ([firstSpeciesId], [secondSpeciesId]) =>
      firstSpeciesId.localeCompare(secondSpeciesId),
  );
  const variantSpeciesIds = sortedVariants.map(([speciesId]) => speciesId);
  const authoritySpeciesIds = Object.keys(
    input.authorityBySpeciesId,
  ).toSorted();
  if (
    authoritySpeciesIds.length !== variantSpeciesIds.length ||
    authoritySpeciesIds.some(
      (speciesId, index) => speciesId !== variantSpeciesIds[index],
    )
  ) {
    throw new RosterMovesetAssignmentValidationError(
      'Roster moveset assignment authority species do not match assigned variants.',
    );
  }
  const authorityBySpeciesId = Object.freeze(
    Object.fromEntries(
      variantSpeciesIds.map((speciesId) => [
        speciesId,
        Object.freeze({ ...input.authorityBySpeciesId[speciesId] }),
      ]),
    ),
  );
  const variantsBySpeciesId = Object.freeze(
    Object.fromEntries(
      sortedVariants.map(([speciesId, variant]) => [
        speciesId,
        Object.freeze({ ...variant }),
      ]),
    ),
  );
  const fingerprint = JSON.stringify([
    'roster-moveset-assignment-v3',
    input.formatId,
    ...sortedVariants.map(([speciesId, variant]) => [
      speciesId,
      authorityBySpeciesId[speciesId]!.source,
      authorityBySpeciesId[speciesId]!.schemaVersion,
      authorityBySpeciesId[speciesId]!.policyVersion,
      variant.id,
      variant.fastMove,
      variant.chargedMove1,
      variant.chargedMove2,
      variant.isDefault,
      variant.additionalChargedMove ?? null,
      variant.megaLevel ?? null,
    ]),
  ]);

  return Object.freeze({
    formatId: input.formatId,
    authorityBySpeciesId,
    variantsBySpeciesId,
    fingerprint,
  });
}

function isUnknownRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function readBoundedString(
  value: unknown,
  field: string,
  maxLength: number = MAX_ASSIGNMENT_STRING_LENGTH,
): string {
  if (
    typeof value !== 'string' ||
    value.trim() === '' ||
    value.length > maxLength
  ) {
    throw new RosterMovesetAssignmentValidationError(
      `Roster moveset assignment ${field} must be a non-empty string of at most ${maxLength} characters.`,
    );
  }
  return value;
}

function validateCanonicalMoveId(moveId: string, field: string): void {
  if (!/^[A-Z0-9_]+$/.test(moveId) || normalizeMoveId(moveId) !== moveId) {
    throw new RosterMovesetAssignmentValidationError(
      `Roster moveset assignment ${field} must use a canonical move ID.`,
    );
  }
}

function validateMoveSlots(speciesId: string, moveset: Moveset): void {
  const fastMove = getMoveByMoveId(moveset.fastMove);
  const chargedMove1 = getMoveByMoveId(moveset.chargedMove1);
  const chargedMove2 = getMoveByMoveId(moveset.chargedMove2);
  if (!fastMove || fastMove.energy !== 0 || fastMove.energyGain <= 0) {
    throw new RosterMovesetAssignmentValidationError(
      `Roster moveset assignment fast move for ${speciesId} is invalid.`,
    );
  }
  if (
    !chargedMove1 ||
    chargedMove1.energy <= 0 ||
    chargedMove1.energyGain !== 0 ||
    !chargedMove2 ||
    chargedMove2.energy <= 0 ||
    chargedMove2.energyGain !== 0
  ) {
    throw new RosterMovesetAssignmentValidationError(
      `Roster moveset assignment charged moves for ${speciesId} are invalid.`,
    );
  }
}

/** Parse and validate a serialized assignment against its requested roster. */
export function parseRosterMovesetAssignment(
  value: unknown,
  roster: readonly string[],
  formatId: BattleFormatId,
): RosterMovesetAssignment {
  if (roster.length === 0 || roster.length > MAX_ROSTER_SIZE) {
    throw new RosterMovesetAssignmentValidationError(
      `Roster moveset assignments require between 1 and at most ${MAX_ROSTER_SIZE} Pokemon.`,
    );
  }
  if (!isUnknownRecord(value)) {
    throw new RosterMovesetAssignmentValidationError(
      'A scored roster moveset assignment is required.',
    );
  }
  if (value.formatId !== formatId) {
    throw new RosterMovesetAssignmentValidationError(
      'Roster moveset assignment format does not match the requested format.',
    );
  }

  const authorities = value.authorityBySpeciesId;
  if (!isUnknownRecord(authorities)) {
    throw new RosterMovesetAssignmentValidationError(
      'Roster moveset assignment authorities are invalid.',
    );
  }

  const variants = value.variantsBySpeciesId;
  if (!isUnknownRecord(variants)) {
    throw new RosterMovesetAssignmentValidationError(
      'Roster moveset assignment variants are invalid.',
    );
  }
  const variantSpeciesIds = Object.keys(variants);
  if (variantSpeciesIds.length > MAX_ROSTER_SIZE) {
    throw new RosterMovesetAssignmentValidationError(
      `Roster moveset assignments support at most ${MAX_ROSTER_SIZE} species.`,
    );
  }

  const canonicalRoster = roster.map((speciesId) => {
    readBoundedString(speciesId, 'roster species ID');
    const pokemon = getPokemonBySpeciesId(speciesId);
    if (!pokemon) {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment references unknown Pokemon ${speciesId}.`,
      );
    }
    return pokemon.speciesId;
  });
  if (new Set(canonicalRoster).size !== canonicalRoster.length) {
    throw new RosterMovesetAssignmentValidationError(
      'Roster moveset assignment cannot contain duplicate species.',
    );
  }
  variantSpeciesIds.sort();
  const expectedSpeciesIds = [...canonicalRoster].toSorted();
  if (
    variantSpeciesIds.length !== expectedSpeciesIds.length ||
    variantSpeciesIds.some(
      (speciesId, index) => speciesId !== expectedSpeciesIds[index],
    )
  ) {
    throw new RosterMovesetAssignmentValidationError(
      'Roster moveset assignment species do not match the requested team.',
    );
  }

  const authoritySpeciesIds = Object.keys(authorities).toSorted();
  if (
    authoritySpeciesIds.length !== expectedSpeciesIds.length ||
    authoritySpeciesIds.some(
      (speciesId, index) => speciesId !== expectedSpeciesIds[index],
    )
  ) {
    throw new RosterMovesetAssignmentValidationError(
      'Roster moveset assignment authority species do not match the requested team.',
    );
  }

  const variantsBySpeciesId: Record<string, MovesetVariant> = {};
  const authorityBySpeciesId: Record<string, MovesetAssignmentPolicyIdentity> =
    {};
  for (const speciesId of expectedSpeciesIds) {
    const authority = authorities[speciesId];
    if (!isUnknownRecord(authority)) {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment authority for ${speciesId} is invalid.`,
      );
    }
    const source = authority.source;
    if (source !== 'manifest' && source !== 'ranked-default-fallback') {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment authority source for ${speciesId} is invalid.`,
      );
    }
    const schemaVersion = authority.schemaVersion;
    if (!Number.isSafeInteger(schemaVersion) || Number(schemaVersion) < 0) {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment schema version for ${speciesId} is invalid.`,
      );
    }
    authorityBySpeciesId[speciesId] = {
      source,
      schemaVersion: Number(schemaVersion),
      policyVersion: readBoundedString(
        authority.policyVersion,
        `authorityBySpeciesId.${speciesId}.policyVersion`,
      ),
    };

    const candidate = variants[speciesId];
    if (!isUnknownRecord(candidate)) {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment variant for ${speciesId} is invalid.`,
      );
    }
    const moveset: Moveset = {
      fastMove: readBoundedString(candidate.fastMove, `${speciesId}.fastMove`),
      chargedMove1: readBoundedString(
        candidate.chargedMove1,
        `${speciesId}.chargedMove1`,
      ),
      chargedMove2: readBoundedString(
        candidate.chargedMove2,
        `${speciesId}.chargedMove2`,
      ),
    };
    validateCanonicalMoveId(moveset.fastMove, `${speciesId}.fastMove`);
    validateCanonicalMoveId(moveset.chargedMove1, `${speciesId}.chargedMove1`);
    validateCanonicalMoveId(moveset.chargedMove2, `${speciesId}.chargedMove2`);
    if (moveset.chargedMove1 === moveset.chargedMove2) {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment charged moves for ${speciesId} must be distinct.`,
      );
    }
    validateMoveSlots(speciesId, moveset);
    const rawAdditionalChargedMove = candidate.additionalChargedMove;
    let additionalChargedMove: string | undefined;
    if (rawAdditionalChargedMove !== undefined) {
      additionalChargedMove = readBoundedString(
        rawAdditionalChargedMove,
        `${speciesId}.additionalChargedMove`,
      );
      validateCanonicalMoveId(
        additionalChargedMove,
        `${speciesId}.additionalChargedMove`,
      );
      if (
        additionalChargedMove === moveset.chargedMove1 ||
        additionalChargedMove === moveset.chargedMove2
      ) {
        throw new RosterMovesetAssignmentValidationError(
          `Roster moveset assignment additional move for ${speciesId} must be distinct from selectable charged moves.`,
        );
      }
    }
    const megaLevel = candidate.megaLevel;
    if (megaLevel !== undefined && megaLevel !== 4) {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment Mega level for ${speciesId} must be 4 when present.`,
      );
    }
    if ((additionalChargedMove === undefined) !== (megaLevel === undefined)) {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment additional move and Mega level for ${speciesId} must be provided together.`,
      );
    }
    const id = readBoundedString(candidate.id, `${speciesId}.id`, 512);
    if (id !== getMovesetVariantId(moveset)) {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment variant identity for ${speciesId} is invalid.`,
      );
    }
    if (typeof candidate.isDefault !== 'boolean') {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment default status for ${speciesId} is invalid.`,
      );
    }
    variantsBySpeciesId[speciesId] = {
      ...moveset,
      id: id as MovesetVariantId,
      isDefault: candidate.isDefault,
      ...(additionalChargedMove !== undefined
        ? { additionalChargedMove, megaLevel: 4 as const }
        : {}),
    };
  }

  const assignment = createRosterMovesetAssignment({
    formatId,
    authorityBySpeciesId,
    variantsBySpeciesId,
  });
  const fingerprint = readBoundedString(
    value.fingerprint,
    'fingerprint',
    MAX_ASSIGNMENT_FINGERPRINT_LENGTH,
  );
  if (fingerprint !== assignment.fingerprint) {
    throw new RosterMovesetAssignmentValidationError(
      'Roster moveset assignment fingerprint is invalid.',
    );
  }
  return assignment;
}

/** Validate a parsed assignment against current snapshot and ranking authorities. */
export function validateRosterMovesetAssignmentAuthority(
  assignment: RosterMovesetAssignment,
  dependencies: RosterMovesetAuthorityValidationDependencies = {
    ensureSimulationData: ensureSimulationDataAvailable,
    getManifestPolicyIdentity: getMovesetVariantManifestPolicyIdentity,
    getActiveVariants: getActiveMovesetVariants,
    getPokemon: getPokemonBySpeciesId,
    getRankedDefault: getCompleteRankedMovesetForPokemon,
  },
): RosterMovesetAssignment {
  const speciesIds = Object.keys(assignment.variantsBySpeciesId).toSorted();
  const hasManifestAuthority = speciesIds.some(
    (speciesId) =>
      assignment.authorityBySpeciesId[speciesId]?.source === 'manifest',
  );
  let manifestPolicy: MovesetAssignmentPolicyIdentity | undefined;

  if (hasManifestAuthority) {
    dependencies.ensureSimulationData(assignment.formatId);
    manifestPolicy = {
      source: 'manifest',
      ...dependencies.getManifestPolicyIdentity(assignment.formatId),
    };
  }

  for (const speciesId of speciesIds) {
    const authority = assignment.authorityBySpeciesId[speciesId];
    const assignedVariant = assignment.variantsBySpeciesId[speciesId];
    if (!authority || !assignedVariant) {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment authority for ${speciesId} is incomplete.`,
      );
    }

    if (authority.source === 'manifest') {
      if (
        !manifestPolicy ||
        !matchesPolicyIdentity(authority, manifestPolicy)
      ) {
        throw new RosterMovesetAssignmentValidationError(
          `Roster moveset assignment manifest authority for ${speciesId} is stale.`,
        );
      }

      let activeVariants: readonly MovesetVariant[];
      try {
        activeVariants = dependencies.getActiveVariants(
          speciesId,
          assignment.formatId,
        );
      } catch (error) {
        if (
          !isUnsupportedSpeciesVariantError(
            error,
            assignment.formatId,
            speciesId,
          )
        ) {
          throw error;
        }
        throw new RosterMovesetAssignmentValidationError(
          `Roster moveset assignment manifest authority for ${speciesId} is unavailable.`,
        );
      }
      if (
        !activeVariants.some((variant) =>
          matchesMovesetVariant(assignedVariant, variant),
        )
      ) {
        throw new RosterMovesetAssignmentValidationError(
          `Roster moveset assignment variant for ${speciesId} is not active.`,
        );
      }
      continue;
    }

    if (!matchesPolicyIdentity(authority, RANKED_DEFAULT_POLICY_IDENTITY)) {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment ranked-default authority for ${speciesId} is stale.`,
      );
    }
    const pokemon = dependencies.getPokemon(speciesId);
    if (!pokemon) {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment authority references unknown Pokemon ${speciesId}.`,
      );
    }
    const rankedMoveset = dependencies.getRankedDefault(
      pokemon,
      assignment.formatId,
    );
    if (!rankedMoveset) {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment ranked-default authority for ${speciesId} is unavailable.`,
      );
    }
    const rankedDefault = toDefaultMovesetVariant(rankedMoveset, pokemon);
    if (!matchesMovesetVariant(assignedVariant, rankedDefault)) {
      throw new RosterMovesetAssignmentValidationError(
        `Roster moveset assignment ranked default for ${speciesId} is not current.`,
      );
    }
  }

  return assignment;
}

function requireEligibleMoveAvailability(
  availability: ReturnType<typeof getMovesetAvailability>[keyof Moveset],
): EligibleMoveAvailability {
  if (availability.kind === 'excluded') {
    throw new RosterMovesetAssignmentValidationError(availability.reason);
  }
  return availability;
}

/** Add acquisition metadata to the exact variant assigned during scoring. */
export function getAssignedMovesetDetails(
  assignment: RosterMovesetAssignment,
  speciesId: string,
): AssignedMovesetDetails {
  const variant = assignment.variantsBySpeciesId[speciesId];
  const authority = assignment.authorityBySpeciesId[speciesId];
  if (!variant || !authority) {
    throw new RosterMovesetAssignmentValidationError(
      `Roster moveset assignment is missing ${speciesId}.`,
    );
  }
  const availability = getMovesetAvailability(
    speciesId,
    variant,
    assignment.formatId,
  );

  return {
    ...variant,
    authority,
    acquisitionRequirements: {
      fastMove: requireEligibleMoveAvailability(availability.fastMove),
      chargedMove1: requireEligibleMoveAvailability(availability.chargedMove1),
      chargedMove2: requireEligibleMoveAvailability(availability.chargedMove2),
    } satisfies MovesetAcquisitionRequirements,
  };
}

/** Resolve every roster member with manifest or per-species fallback authority. */
export function resolveRosterMovesetAssignment(
  roster: readonly string[],
  formatId: BattleFormatId,
  dependencies: RosterMovesetAssignmentDependencies = {
    getPokemon: getPokemonBySpeciesId,
    getManifestPolicyIdentity: getMovesetVariantManifestPolicyIdentity,
    getMovesetVariantForTeam: getSimulationBackedMovesetVariantForTeam,
    getRankedDefault: getRecommendedMovesetForPokemon,
  },
): RosterMovesetAssignment {
  const manifestPolicyIdentity: MovesetAssignmentPolicyIdentity = {
    source: 'manifest',
    ...dependencies.getManifestPolicyIdentity(formatId),
  };

  const variantsBySpeciesId: Record<string, MovesetVariant> = {};
  const authorityBySpeciesId: Record<string, MovesetAssignmentPolicyIdentity> =
    {};
  for (const requestedSpeciesId of roster) {
    const pokemon = dependencies.getPokemon(requestedSpeciesId);
    if (!pokemon) {
      throw new Error(
        `Cannot resolve a moveset assignment for unknown Pokemon ${requestedSpeciesId}.`,
      );
    }
    if (variantsBySpeciesId[pokemon.speciesId]) {
      throw new Error(
        `Cannot resolve duplicate roster species ${pokemon.speciesId}.`,
      );
    }

    try {
      variantsBySpeciesId[pokemon.speciesId] =
        dependencies.getMovesetVariantForTeam(pokemon, roster, formatId);
      authorityBySpeciesId[pokemon.speciesId] = manifestPolicyIdentity;
    } catch (error) {
      if (
        !isUnsupportedSpeciesVariantError(error, formatId, pokemon.speciesId)
      ) {
        throw error;
      }
      variantsBySpeciesId[pokemon.speciesId] = toDefaultMovesetVariant(
        dependencies.getRankedDefault(pokemon, formatId),
        pokemon,
      );
      authorityBySpeciesId[pokemon.speciesId] = RANKED_DEFAULT_POLICY_IDENTITY;
    }
  }

  return createRosterMovesetAssignment({
    formatId,
    authorityBySpeciesId,
    variantsBySpeciesId,
  });
}

/** Enumerate the bounded Cartesian product of active variants for one roster. */
export function enumerateRosterMovesetAssignments(
  roster: readonly string[],
  formatId: BattleFormatId,
  dependencies: RosterMovesetAssignmentEnumerationDependencies = {
    getPokemon: getPokemonBySpeciesId,
    getManifestPolicyIdentity: getMovesetVariantManifestPolicyIdentity,
    getActiveVariants: getActiveMovesetVariants,
    getRankedDefault: getRecommendedMovesetForPokemon,
  },
): readonly RosterMovesetAssignment[] {
  const manifestPolicy: Readonly<{
    schemaVersion: number;
    policyVersion: string;
  }> = dependencies.getManifestPolicyIdentity(formatId);

  const pokemon = roster.map((speciesId) => {
    const entry = dependencies.getPokemon(speciesId);
    if (!entry) {
      throw new Error(
        `Cannot enumerate moveset assignments for unknown Pokemon ${speciesId}.`,
      );
    }
    return entry;
  });
  const canonicalSpeciesIds = pokemon.map(({ speciesId }) => speciesId);
  if (new Set(canonicalSpeciesIds).size !== canonicalSpeciesIds.length) {
    throw new Error(
      'Cannot enumerate assignments for duplicate roster species.',
    );
  }
  const assignmentSlots = pokemon.map((entry) => {
    let variants: readonly MovesetVariant[];
    let authority: MovesetAssignmentPolicyIdentity;
    try {
      variants = [
        ...dependencies.getActiveVariants(entry.speciesId, formatId),
      ].toSorted((first, second) => {
        if (first.isDefault !== second.isDefault) {
          return first.isDefault ? -1 : 1;
        }
        return first.id.localeCompare(second.id);
      });
      authority = { source: 'manifest', ...manifestPolicy };
    } catch (error) {
      if (!isUnsupportedSpeciesVariantError(error, formatId, entry.speciesId)) {
        throw error;
      }
      variants = [
        toDefaultMovesetVariant(
          dependencies.getRankedDefault(entry, formatId),
          entry,
        ),
      ];
      authority = RANKED_DEFAULT_POLICY_IDENTITY;
    }
    if (
      variants.length === 0 ||
      variants.length > MAX_ACTIVE_VARIANTS_PER_SPECIES ||
      variants.filter(({ isDefault }) => isDefault).length !== 1 ||
      new Set(variants.map(({ id }) => id)).size !== variants.length
    ) {
      throw new Error(
        `Active moveset variants for ${entry.speciesId} must contain one default and at most three unique variants.`,
      );
    }
    return { authority, speciesId: entry.speciesId, variants };
  });
  const authorityBySpeciesId = Object.fromEntries(
    assignmentSlots.map(({ authority, speciesId }) => [speciesId, authority]),
  );
  const variantsByRosterSlot = assignmentSlots.map(({ variants }) => variants);

  const assignmentCount = variantsByRosterSlot.reduce(
    (count, variants) => count * variants.length,
    1,
  );
  if (assignmentCount > MAX_ROSTER_MOVESET_ASSIGNMENTS) {
    throw new Error(
      `Roster moveset assignments exceed the ${MAX_ROSTER_MOVESET_ASSIGNMENTS} candidate limit.`,
    );
  }

  let assignments: Array<Record<string, MovesetVariant>> = [{}];
  variantsByRosterSlot.forEach((variants, index) => {
    const speciesId = canonicalSpeciesIds[index];
    assignments = assignments.flatMap((assignment) =>
      variants.map((variant) => ({ ...assignment, [speciesId]: variant })),
    );
  });

  return assignments.map((variantsBySpeciesId) =>
    createRosterMovesetAssignment({
      formatId,
      authorityBySpeciesId,
      variantsBySpeciesId,
    }),
  );
}

/** Resolve one immutable PvPoke ranking-recommended assignment for a roster. */
export function resolveRankedDefaultRosterMovesetAssignment(
  roster: readonly string[],
  formatId: BattleFormatId,
  dependencies: RankedDefaultRosterMovesetAssignmentDependencies = {
    getPokemon: getPokemonBySpeciesId,
    getRankedDefault: getRecommendedMovesetForPokemon,
  },
): RosterMovesetAssignment {
  const variantsBySpeciesId: Record<string, MovesetVariant> = {};
  const authorityBySpeciesId: Record<string, MovesetAssignmentPolicyIdentity> =
    {};
  for (const requestedSpeciesId of roster) {
    const pokemon = dependencies.getPokemon(requestedSpeciesId);
    if (!pokemon) {
      throw new Error(
        `Cannot enumerate moveset assignments for unknown Pokemon ${requestedSpeciesId}.`,
      );
    }
    if (variantsBySpeciesId[pokemon.speciesId]) {
      throw new Error(
        `Cannot enumerate duplicate roster species ${pokemon.speciesId}.`,
      );
    }
    variantsBySpeciesId[pokemon.speciesId] = toDefaultMovesetVariant(
      dependencies.getRankedDefault(pokemon, formatId),
      pokemon,
    );
    authorityBySpeciesId[pokemon.speciesId] = RANKED_DEFAULT_POLICY_IDENTITY;
  }

  return createRosterMovesetAssignment({
    formatId,
    authorityBySpeciesId,
    variantsBySpeciesId,
  });
}

/** Return the simulation qualifier for one member of a fixed assignment. */
export function getAssignedMovesetVariantId(
  assignment: RosterMovesetAssignment | undefined,
  speciesId: string,
): MovesetVariantId | undefined {
  if (!assignment) {
    return undefined;
  }
  const variant = assignment.variantsBySpeciesId[speciesId];
  const authority = assignment.authorityBySpeciesId[speciesId];
  if (!variant || !authority) {
    throw new Error(`Bound roster moveset assignment is missing ${speciesId}.`);
  }

  return authority.source === 'manifest' ? variant.id : undefined;
}
