import { normalizeMoveId, normalizeToChoosableSpeciesId } from './aliases';
import {
  getBattleFormatById,
  type BattleFormat,
  type BattleFormatId,
} from './battleFormats';
import { getMovesetVariantId } from './movesetVariants';
import type {
  EligibleMoveAvailability,
  Moveset,
  MovesetVariantId,
  ShieldScenarioKey,
} from '@/lib/types';

/** Current repository-owned moveset variant manifest schema version. */
export const MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION = 2 as const;

/** Fixed Mega level used when additional Charged Attacks are simulated. */
export const MOVESET_VARIANT_MEGA_LEVEL = 4 as const;

/** Current moveset derivation policy accepted by sync and runtime artifacts. */
export const MOVESET_VARIANT_POLICY_VERSION = 'ranking-evidence-v1' as const;

/** Hard maximum number of derived candidates for one species and format. */
export const MAX_MOVESET_CANDIDATES = 8;

/** Hard maximum number of active variants for one species and format. */
export const MAX_ACTIVE_MOVESET_VARIANTS = 3;

/** Required simulation scenarios represented for every manifest candidate. */
export const MOVESET_VARIANT_SCENARIOS = ['0-0', '1-1', '2-2'] as const;

/** Return the repository-relative manifest path for one supported format. */
export function getMovesetVariantManifestPath(format: BattleFormat): string {
  return `data/simulations/cp${format.cp}/${format.cup}/moveset-variants.json`;
}

/** Ranking categories retained as candidate evidence. */
export type MovesetVariantEvidenceCategory =
  | 'overall'
  | 'leads'
  | 'switches'
  | 'closers'
  | 'chargers'
  | 'attackers'
  | 'consistency';

/** Values keyed by each required simulation shield scenario. */
export type MovesetVariantScenarioRecord<Value> = Readonly<
  Record<ShieldScenarioKey, Value>
>;

/** Digest for one logical source consumed by manifest generation. */
export interface MovesetVariantSourceDigest {
  readonly key: string;
  readonly algorithm: 'sha256';
  readonly digest: string;
}

/** Policy-affecting settings used to derive one manifest. */
export interface MovesetVariantDerivationSettings {
  readonly maxCandidatesPerSpecies: number;
  readonly maxActiveVariantsPerSpecies: number;
  readonly maxExpansionFastMoves: number;
  readonly maxExpansionChargedMoves: number;
  readonly requiredScenarios: readonly ShieldScenarioKey[];
  readonly categoryWeights: Readonly<
    Record<MovesetVariantEvidenceCategory, number>
  >;
}

/** Reproducibility and format metadata for a manifest. */
export interface MovesetVariantManifestMetadata {
  readonly schemaVersion: typeof MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION;
  readonly megaLevel: typeof MOVESET_VARIANT_MEGA_LEVEL;
  readonly policyVersion: string;
  readonly formatId: BattleFormatId;
  readonly cup: BattleFormat['cup'];
  readonly cp: BattleFormat['cp'];
  readonly sourceDigests: readonly MovesetVariantSourceDigest[];
  readonly derivationSettings: MovesetVariantDerivationSettings;
}

/** Evidence explaining why a candidate entered the bounded set. */
export interface MovesetVariantCandidateEvidence {
  readonly kind: 'preferred' | 'observed' | 'override' | 'substitution';
  readonly sourceCategories: readonly MovesetVariantEvidenceCategory[];
  readonly sourceVariantIds: readonly MovesetVariantId[];
}

/** Acquisition requirements for each move slot in one candidate. */
export interface MovesetVariantAcquisitionRequirements {
  readonly fastMove: EligibleMoveAvailability;
  readonly chargedMove1: EligibleMoveAvailability;
  readonly chargedMove2: EligibleMoveAvailability;
}

/** One complete, validated simulation candidate in a species manifest record. */
export interface MovesetVariantManifestCandidate extends Moveset {
  readonly id: MovesetVariantId;
  readonly isDefault: boolean;
  readonly evidence: MovesetVariantCandidateEvidence;
  readonly acquisitionRequirements: MovesetVariantAcquisitionRequirements;
  readonly storageKeys: MovesetVariantScenarioRecord<string>;
  readonly completeness: MovesetVariantScenarioRecord<boolean>;
  readonly evaluationCounts: MovesetVariantScenarioRecord<number>;
  readonly active: boolean;
}

/** Rejection evidence retained when a ranked default contains an excluded move. */
export interface MovesetVariantRejectionEvidence {
  readonly sourceMoveset: Moveset;
  readonly excludedMove: string;
  readonly reason: string;
}

/** Format-specific ranking evidence retained for one species. */
export interface MovesetVariantSpeciesEvidence {
  readonly pvpokeScorePrior: number | null;
  readonly retainedFastMoves: readonly string[];
  readonly retainedChargedMoves: readonly string[];
  readonly rejections: readonly MovesetVariantRejectionEvidence[];
}

/** One species and its bounded, simulation-addressable candidates. */
export interface MovesetVariantManifestSpecies {
  readonly speciesId: string;
  readonly additionalChargedMove?: string;
  readonly defaultVariantId: MovesetVariantId;
  readonly evidence: MovesetVariantSpeciesEvidence;
  readonly candidates: readonly MovesetVariantManifestCandidate[];
}

/** Versioned authoritative moveset variant manifest contract. */
export interface MovesetVariantManifest {
  readonly metadata: MovesetVariantManifestMetadata;
  readonly species: readonly MovesetVariantManifestSpecies[];
}

/** Typed failure raised for malformed moveset variant manifest data. */
export class MovesetVariantManifestValidationError extends Error {
  constructor(
    public readonly path: string,
    message: string,
  ) {
    super(`${path}: ${message}`);
    this.name = 'MovesetVariantManifestValidationError';
  }
}

const evidenceCategories: readonly MovesetVariantEvidenceCategory[] = [
  'overall',
  'leads',
  'switches',
  'closers',
  'chargers',
  'attackers',
  'consistency',
];
const evidenceCategorySet = new Set<string>(evidenceCategories);
const eligibleAvailabilityKinds = new Set<string>([
  'regular',
  'elite',
  'eventExclusive',
  'purified',
]);
const candidateEvidenceKinds = new Set<string>([
  'preferred',
  'observed',
  'override',
  'substitution',
]);
const canonicalIdPartPattern = '[a-z0-9]+(?:_[a-z0-9]+)*';
const canonicalMoveIdPattern = /^[A-Z0-9]+(?:_[A-Z0-9]+)*$/;
const canonicalSpeciesIdPattern = new RegExp(`^${canonicalIdPartPattern}$`);
const canonicalVariantIdPattern = new RegExp(
  `^${canonicalIdPartPattern}--${canonicalIdPartPattern}--${canonicalIdPartPattern}$`,
);

function fail(path: string, message: string): never {
  throw new MovesetVariantManifestValidationError(path, message);
}

function readRecord(value: unknown, path: string): Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) {
    fail(path, 'must be an object');
  }
  return value as Record<string, unknown>;
}

function readArray(value: unknown, path: string): readonly unknown[] {
  if (!Array.isArray(value)) {
    fail(path, 'must be an array');
  }
  return value;
}

function readString(value: unknown, path: string): string {
  if (typeof value !== 'string' || !value.trim()) {
    fail(path, 'must be a non-empty string');
  }
  return value;
}

function readBoolean(value: unknown, path: string): boolean {
  if (typeof value !== 'boolean') {
    fail(path, 'must be a boolean');
  }
  return value;
}

function readFiniteNumber(value: unknown, path: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) {
    fail(path, 'must be a finite number');
  }
  return value;
}

function readNonNegativeInteger(value: unknown, path: string): number {
  const number = readFiniteNumber(value, path);
  if (!Number.isInteger(number) || number < 0) {
    fail(path, 'must be a non-negative integer');
  }
  return number;
}

function readPositiveInteger(value: unknown, path: string): number {
  const number = readNonNegativeInteger(value, path);
  if (number < 1) {
    fail(path, 'must be a positive integer');
  }
  return number;
}

function readUniqueStrings(value: unknown, path: string): string[] {
  const strings = readArray(value, path).map((entry, index) =>
    readString(entry, `${path}[${index}]`),
  );
  if (new Set(strings).size !== strings.length) {
    fail(path, 'must not contain duplicate values');
  }
  return strings;
}

function isCanonicalMoveId(moveId: string): boolean {
  return (
    canonicalMoveIdPattern.test(moveId) && normalizeMoveId(moveId) === moveId
  );
}

function isCanonicalVariantMoveId(moveId: string): boolean {
  const upperMoveId = moveId.toUpperCase();
  return isCanonicalMoveId(upperMoveId);
}

function readCanonicalMoveId(value: unknown, path: string): string {
  const moveId = readString(value, path);
  if (!isCanonicalMoveId(moveId)) {
    fail(path, 'must be a canonical move id');
  }
  return moveId;
}

function readUniqueCanonicalMoveIds(value: unknown, path: string): string[] {
  const moveIds = readUniqueStrings(value, path);
  moveIds.forEach((moveId, index) => {
    if (!isCanonicalMoveId(moveId)) {
      fail(`${path}[${index}]`, 'must be a canonical move id');
    }
  });
  return moveIds;
}

function isCanonicalVariantId(value: string): value is MovesetVariantId {
  if (!canonicalVariantIdPattern.test(value)) {
    return false;
  }
  const [fastMove, chargedMove1, chargedMove2] = value.split('--');
  if (!fastMove || !chargedMove1 || !chargedMove2) {
    return false;
  }
  return (
    isCanonicalVariantMoveId(fastMove) &&
    isCanonicalVariantMoveId(chargedMove1) &&
    isCanonicalVariantMoveId(chargedMove2) &&
    chargedMove1 !== chargedMove2 &&
    getMovesetVariantId({ fastMove, chargedMove1, chargedMove2 }) === value
  );
}

function isSafeLogicalSourceKey(key: string): boolean {
  if (key.startsWith('/') || key.includes('\\')) {
    return false;
  }
  const segments = key.split('/');
  return segments.every(
    (segment) =>
      segment !== '' &&
      segment !== '.' &&
      segment !== '..' &&
      /^[a-zA-Z0-9][a-zA-Z0-9._-]*$/.test(segment),
  );
}

function readMoveset(value: unknown, path: string): Moveset {
  const record = readRecord(value, path);
  const fastMove = readCanonicalMoveId(record.fastMove, `${path}.fastMove`);
  const chargedMove1 = readCanonicalMoveId(
    record.chargedMove1,
    `${path}.chargedMove1`,
  );
  const chargedMove2 = readCanonicalMoveId(
    record.chargedMove2,
    `${path}.chargedMove2`,
  );
  if (chargedMove1.toLowerCase() === chargedMove2.toLowerCase()) {
    fail(path, 'must contain two distinct charged moves');
  }
  return { fastMove, chargedMove1, chargedMove2 };
}

function readScenarioRecord<Value>(
  value: unknown,
  path: string,
  readValue: (entry: unknown, entryPath: string) => Value,
): MovesetVariantScenarioRecord<Value> {
  const record = readRecord(value, path);
  const keys = Object.keys(record);
  if (
    keys.length !== MOVESET_VARIANT_SCENARIOS.length ||
    keys.some(
      (key) => !MOVESET_VARIANT_SCENARIOS.includes(key as ShieldScenarioKey),
    )
  ) {
    fail(path, 'must contain exactly 0-0, 1-1, and 2-2');
  }
  return {
    '0-0': readValue(record['0-0'], `${path}.0-0`),
    '1-1': readValue(record['1-1'], `${path}.1-1`),
    '2-2': readValue(record['2-2'], `${path}.2-2`),
  };
}

function readSourceDigests(
  value: unknown,
  path: string,
): MovesetVariantSourceDigest[] {
  const entries = readArray(value, path);
  if (entries.length === 0) {
    fail(path, 'must contain at least one source digest');
  }
  const keys = new Set<string>();
  return entries.map((entry, index) => {
    const entryPath = `${path}[${index}]`;
    const record = readRecord(entry, entryPath);
    const key = readString(record.key, `${entryPath}.key`);
    if (!isSafeLogicalSourceKey(key)) {
      fail(
        `${entryPath}.key`,
        'must be a safe repository-relative logical key',
      );
    }
    if (keys.has(key)) {
      fail(`${entryPath}.key`, `duplicate source key ${key}`);
    }
    keys.add(key);
    if (record.algorithm !== 'sha256') {
      fail(`${entryPath}.algorithm`, 'must be sha256');
    }
    const digest = readString(record.digest, `${entryPath}.digest`);
    if (!/^[a-f0-9]{64}$/.test(digest)) {
      fail(`${entryPath}.digest`, 'must be a lowercase SHA-256 digest');
    }
    return { key, algorithm: 'sha256', digest };
  });
}

function readDerivationSettings(
  value: unknown,
  path: string,
): MovesetVariantDerivationSettings {
  const record = readRecord(value, path);
  const maxCandidatesPerSpecies = readPositiveInteger(
    record.maxCandidatesPerSpecies,
    `${path}.maxCandidatesPerSpecies`,
  );
  if (maxCandidatesPerSpecies > MAX_MOVESET_CANDIDATES) {
    fail(
      `${path}.maxCandidatesPerSpecies`,
      `must not exceed ${MAX_MOVESET_CANDIDATES}`,
    );
  }
  const maxActiveVariantsPerSpecies = readPositiveInteger(
    record.maxActiveVariantsPerSpecies,
    `${path}.maxActiveVariantsPerSpecies`,
  );
  if (maxActiveVariantsPerSpecies > MAX_ACTIVE_MOVESET_VARIANTS) {
    fail(
      `${path}.maxActiveVariantsPerSpecies`,
      `must not exceed ${MAX_ACTIVE_MOVESET_VARIANTS}`,
    );
  }
  if (maxActiveVariantsPerSpecies > maxCandidatesPerSpecies) {
    fail(
      `${path}.maxActiveVariantsPerSpecies`,
      'must not exceed the candidate cap',
    );
  }
  const requiredScenarios = readUniqueStrings(
    record.requiredScenarios,
    `${path}.requiredScenarios`,
  );
  if (
    requiredScenarios.length !== MOVESET_VARIANT_SCENARIOS.length ||
    requiredScenarios.some(
      (scenario) =>
        !MOVESET_VARIANT_SCENARIOS.includes(scenario as ShieldScenarioKey),
    )
  ) {
    fail(`${path}.requiredScenarios`, 'must contain exactly 0-0, 1-1, and 2-2');
  }
  const weights = readRecord(record.categoryWeights, `${path}.categoryWeights`);
  const weightKeys = Object.keys(weights);
  if (
    weightKeys.length !== evidenceCategories.length ||
    weightKeys.some((key) => !evidenceCategorySet.has(key))
  ) {
    fail(
      `${path}.categoryWeights`,
      'must contain exactly the seven ranking categories',
    );
  }
  const categoryWeights = Object.fromEntries(
    evidenceCategories.map((category) => {
      const weight = readFiniteNumber(
        weights[category],
        `${path}.categoryWeights.${category}`,
      );
      if (weight < 0) {
        fail(`${path}.categoryWeights.${category}`, 'must not be negative');
      }
      return [category, weight];
    }),
  ) as Record<MovesetVariantEvidenceCategory, number>;

  return {
    maxCandidatesPerSpecies,
    maxActiveVariantsPerSpecies,
    maxExpansionFastMoves: readPositiveInteger(
      record.maxExpansionFastMoves,
      `${path}.maxExpansionFastMoves`,
    ),
    maxExpansionChargedMoves: readPositiveInteger(
      record.maxExpansionChargedMoves,
      `${path}.maxExpansionChargedMoves`,
    ),
    requiredScenarios: requiredScenarios as ShieldScenarioKey[],
    categoryWeights,
  };
}

function readMetadata(
  value: unknown,
  path: string,
): MovesetVariantManifestMetadata {
  const record = readRecord(value, path);
  if (record.schemaVersion !== MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION) {
    fail(
      `${path}.schemaVersion`,
      `must be ${MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION}`,
    );
  }
  if (record.megaLevel !== MOVESET_VARIANT_MEGA_LEVEL) {
    fail(`${path}.megaLevel`, `must be ${MOVESET_VARIANT_MEGA_LEVEL}`);
  }
  const formatId = readString(record.formatId, `${path}.formatId`);
  const format = getBattleFormatById(formatId);
  if (!format) {
    fail(`${path}.formatId`, `unsupported format ${formatId}`);
  }
  if (record.cup !== format.cup) {
    fail(`${path}.cup`, `must match ${format.id} cup ${format.cup}`);
  }
  if (record.cp !== format.cp) {
    fail(`${path}.cp`, `must match ${format.id} CP ${format.cp}`);
  }
  return {
    schemaVersion: MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
    megaLevel: MOVESET_VARIANT_MEGA_LEVEL,
    policyVersion: readString(record.policyVersion, `${path}.policyVersion`),
    formatId: format.id,
    cup: format.cup,
    cp: format.cp,
    sourceDigests: readSourceDigests(
      record.sourceDigests,
      `${path}.sourceDigests`,
    ),
    derivationSettings: readDerivationSettings(
      record.derivationSettings,
      `${path}.derivationSettings`,
    ),
  };
}

function readCandidateEvidence(
  value: unknown,
  path: string,
): MovesetVariantCandidateEvidence {
  const record = readRecord(value, path);
  const kind = readString(record.kind, `${path}.kind`);
  if (!candidateEvidenceKinds.has(kind)) {
    fail(`${path}.kind`, `unsupported candidate evidence kind ${kind}`);
  }
  const sourceCategories = readUniqueStrings(
    record.sourceCategories,
    `${path}.sourceCategories`,
  );
  if (sourceCategories.some((category) => !evidenceCategorySet.has(category))) {
    fail(
      `${path}.sourceCategories`,
      'contains an unsupported ranking category',
    );
  }
  const sourceVariantIds = readUniqueStrings(
    record.sourceVariantIds,
    `${path}.sourceVariantIds`,
  );
  if (sourceVariantIds.some((id) => !isCanonicalVariantId(id))) {
    fail(`${path}.sourceVariantIds`, 'must contain canonical variant ids');
  }
  return {
    kind: kind as MovesetVariantCandidateEvidence['kind'],
    sourceCategories: sourceCategories as MovesetVariantEvidenceCategory[],
    sourceVariantIds: sourceVariantIds as MovesetVariantId[],
  };
}

function readAvailability(
  value: unknown,
  path: string,
): EligibleMoveAvailability {
  const record = readRecord(value, path);
  const kind = readString(record.kind, `${path}.kind`);
  if (!eligibleAvailabilityKinds.has(kind)) {
    fail(`${path}.kind`, `ineligible acquisition requirement ${kind}`);
  }
  return { kind } as EligibleMoveAvailability;
}

function readAcquisitionRequirements(
  value: unknown,
  path: string,
): MovesetVariantAcquisitionRequirements {
  const record = readRecord(value, path);
  return {
    fastMove: readAvailability(record.fastMove, `${path}.fastMove`),
    chargedMove1: readAvailability(record.chargedMove1, `${path}.chargedMove1`),
    chargedMove2: readAvailability(record.chargedMove2, `${path}.chargedMove2`),
  };
}

function readCandidate(
  value: unknown,
  path: string,
  speciesId: string,
): MovesetVariantManifestCandidate {
  const record = readRecord(value, path);
  const moveset = readMoveset(record, path);
  const id = readString(record.id, `${path}.id`) as MovesetVariantId;
  if (!isCanonicalVariantId(id) || id !== getMovesetVariantId(moveset)) {
    fail(`${path}.id`, 'must match the canonical moveset variant identity');
  }
  const isDefault = readBoolean(record.isDefault, `${path}.isDefault`);
  const storageKeys = readScenarioRecord(
    record.storageKeys,
    `${path}.storageKeys`,
    (entry, entryPath) => readString(entry, entryPath),
  );
  for (const scenario of MOVESET_VARIANT_SCENARIOS) {
    const expectedStorageKey = isDefault
      ? `${speciesId}_${scenario}.csv`
      : `${speciesId}--${id}_${scenario}.csv`;
    if (storageKeys[scenario] !== expectedStorageKey) {
      fail(`${path}.storageKeys.${scenario}`, `must be ${expectedStorageKey}`);
    }
  }
  return {
    id,
    ...moveset,
    isDefault,
    evidence: readCandidateEvidence(record.evidence, `${path}.evidence`),
    acquisitionRequirements: readAcquisitionRequirements(
      record.acquisitionRequirements,
      `${path}.acquisitionRequirements`,
    ),
    storageKeys,
    completeness: readScenarioRecord(
      record.completeness,
      `${path}.completeness`,
      readBoolean,
    ),
    evaluationCounts: readScenarioRecord(
      record.evaluationCounts,
      `${path}.evaluationCounts`,
      readNonNegativeInteger,
    ),
    active: readBoolean(record.active, `${path}.active`),
  };
}

function readRejectionEvidence(
  value: unknown,
  path: string,
): MovesetVariantRejectionEvidence {
  const record = readRecord(value, path);
  return {
    sourceMoveset: readMoveset(record.sourceMoveset, `${path}.sourceMoveset`),
    excludedMove: readCanonicalMoveId(
      record.excludedMove,
      `${path}.excludedMove`,
    ),
    reason: readString(record.reason, `${path}.reason`),
  };
}

function readSpeciesEvidence(
  value: unknown,
  path: string,
): MovesetVariantSpeciesEvidence {
  const record = readRecord(value, path);
  const score = record.pvpokeScorePrior;
  return {
    pvpokeScorePrior:
      score === null
        ? null
        : readFiniteNumber(score, `${path}.pvpokeScorePrior`),
    retainedFastMoves: readUniqueCanonicalMoveIds(
      record.retainedFastMoves,
      `${path}.retainedFastMoves`,
    ),
    retainedChargedMoves: readUniqueCanonicalMoveIds(
      record.retainedChargedMoves,
      `${path}.retainedChargedMoves`,
    ),
    rejections: readArray(record.rejections, `${path}.rejections`).map(
      (entry, index) =>
        readRejectionEvidence(entry, `${path}.rejections[${index}]`),
    ),
  };
}

function readSpecies(
  value: unknown,
  path: string,
): MovesetVariantManifestSpecies {
  const record = readRecord(value, path);
  const speciesId = readString(record.speciesId, `${path}.speciesId`);
  if (!canonicalSpeciesIdPattern.test(speciesId)) {
    fail(`${path}.speciesId`, 'must be a canonical lowercase species id');
  }
  if (normalizeToChoosableSpeciesId(speciesId) !== speciesId) {
    fail(`${path}.speciesId`, 'must be a choosable species id, not an alias');
  }
  const defaultVariantId = readString(
    record.defaultVariantId,
    `${path}.defaultVariantId`,
  ) as MovesetVariantId;
  const candidateValues = readArray(record.candidates, `${path}.candidates`);
  if (
    candidateValues.length === 0 ||
    candidateValues.length > MAX_MOVESET_CANDIDATES
  ) {
    fail(
      `${path}.candidates`,
      `must contain between 1 and at most ${MAX_MOVESET_CANDIDATES} candidates`,
    );
  }
  const candidates = candidateValues.map((entry, index) =>
    readCandidate(entry, `${path}.candidates[${index}]`, speciesId),
  );
  const additionalChargedMove =
    record.additionalChargedMove === undefined
      ? undefined
      : readCanonicalMoveId(
          record.additionalChargedMove,
          `${path}.additionalChargedMove`,
        );
  if (
    additionalChargedMove !== undefined &&
    candidates.some(
      (candidate) =>
        candidate.fastMove === additionalChargedMove ||
        candidate.chargedMove1 === additionalChargedMove ||
        candidate.chargedMove2 === additionalChargedMove,
    )
  ) {
    fail(
      `${path}.additionalChargedMove`,
      'must be distinct from selectable candidate moves',
    );
  }
  const candidateIds = new Set<MovesetVariantId>();
  for (const candidate of candidates) {
    if (candidateIds.has(candidate.id)) {
      fail(`${path}.candidates`, `duplicate candidate id ${candidate.id}`);
    }
    candidateIds.add(candidate.id);
  }
  const defaultCandidates = candidates.filter(
    (candidate) => candidate.isDefault,
  );
  if (defaultCandidates.length !== 1) {
    fail(`${path}.candidates`, 'must contain exactly one default candidate');
  }
  const defaultCandidate = defaultCandidates[0];
  if (!defaultCandidate || defaultCandidate.id !== defaultVariantId) {
    fail(
      `${path}.defaultVariantId`,
      'must identify the candidate marked as default',
    );
  }
  if (!defaultCandidate.active) {
    fail(`${path}.candidates`, 'the default candidate must be active');
  }
  const activeAlternatives = candidates.filter(
    (candidate) => candidate.active && !candidate.isDefault,
  );
  if (
    activeAlternatives.length > 0 &&
    MOVESET_VARIANT_SCENARIOS.some(
      (scenario) => !defaultCandidate.completeness[scenario],
    )
  ) {
    fail(
      `${path}.candidates`,
      'the default candidate must be complete when alternatives are active',
    );
  }
  for (const candidate of activeAlternatives) {
    if (
      MOVESET_VARIANT_SCENARIOS.some(
        (scenario) => !candidate.completeness[scenario],
      )
    ) {
      fail(
        `${path}.candidates`,
        'active alternatives must be complete in every required scenario',
      );
    }
    if (
      MOVESET_VARIANT_SCENARIOS.some(
        (scenario) => candidate.evaluationCounts[scenario] === 0,
      )
    ) {
      fail(
        `${path}.candidates`,
        'active alternatives must have positive evaluation counts in every required scenario',
      );
    }
    if (
      MOVESET_VARIANT_SCENARIOS.some(
        (scenario) =>
          candidate.evaluationCounts[scenario] !==
          defaultCandidate.evaluationCounts[scenario],
      )
    ) {
      fail(
        `${path}.candidates`,
        'active alternatives must match the default evaluation counts in every required scenario',
      );
    }
  }
  const activeCount = candidates.filter((candidate) => candidate.active).length;
  if (activeCount > MAX_ACTIVE_MOVESET_VARIANTS) {
    fail(
      `${path}.candidates`,
      `must contain at most ${MAX_ACTIVE_MOVESET_VARIANTS} active variants`,
    );
  }
  return {
    speciesId,
    ...(additionalChargedMove ? { additionalChargedMove } : {}),
    defaultVariantId,
    evidence: readSpeciesEvidence(record.evidence, `${path}.evidence`),
    candidates,
  };
}

function compareAscii(left: string, right: string): number {
  return left < right ? -1 : left > right ? 1 : 0;
}

function compareRejectionEvidence(
  left: MovesetVariantRejectionEvidence,
  right: MovesetVariantRejectionEvidence,
): number {
  return (
    compareAscii(left.sourceMoveset.fastMove, right.sourceMoveset.fastMove) ||
    compareAscii(
      left.sourceMoveset.chargedMove1,
      right.sourceMoveset.chargedMove1,
    ) ||
    compareAscii(
      left.sourceMoveset.chargedMove2,
      right.sourceMoveset.chargedMove2,
    ) ||
    compareAscii(left.excludedMove, right.excludedMove) ||
    compareAscii(left.reason, right.reason)
  );
}

function canonicalizeManifest(
  manifest: MovesetVariantManifest,
): MovesetVariantManifest {
  return {
    metadata: {
      ...manifest.metadata,
      sourceDigests: [...manifest.metadata.sourceDigests].sort((left, right) =>
        compareAscii(left.key, right.key),
      ),
      derivationSettings: {
        ...manifest.metadata.derivationSettings,
        requiredScenarios: [...MOVESET_VARIANT_SCENARIOS],
        categoryWeights: Object.fromEntries(
          evidenceCategories.map((category) => [
            category,
            manifest.metadata.derivationSettings.categoryWeights[category],
          ]),
        ) as Record<MovesetVariantEvidenceCategory, number>,
      },
    },
    species: [...manifest.species]
      .sort((left, right) => compareAscii(left.speciesId, right.speciesId))
      .map((species) => ({
        ...species,
        evidence: {
          ...species.evidence,
          rejections: [...species.evidence.rejections].sort(
            compareRejectionEvidence,
          ),
        },
        candidates: [...species.candidates]
          .sort(
            (left, right) =>
              Number(right.isDefault) - Number(left.isDefault) ||
              compareAscii(left.id, right.id),
          )
          .map((candidate) => ({
            ...candidate,
            evidence: {
              ...candidate.evidence,
              sourceCategories: [...candidate.evidence.sourceCategories].sort(
                (left, right) =>
                  evidenceCategories.indexOf(left) -
                  evidenceCategories.indexOf(right),
              ),
              sourceVariantIds: [...candidate.evidence.sourceVariantIds].sort(
                compareAscii,
              ),
            },
          })),
      })),
  };
}

/** Parse and validate an unknown moveset variant manifest value. */
export function parseMovesetVariantManifest(
  value: unknown,
): MovesetVariantManifest {
  const record = readRecord(value, 'manifest');
  const metadata = readMetadata(record.metadata, 'manifest.metadata');
  const speciesIds = new Set<string>();
  const species = readArray(record.species, 'manifest.species').map(
    (entry, index) => {
      const parsed = readSpecies(entry, `manifest.species[${index}]`);
      if (speciesIds.has(parsed.speciesId)) {
        fail(
          `manifest.species[${index}].speciesId`,
          `duplicate species id ${parsed.speciesId}`,
        );
      }
      speciesIds.add(parsed.speciesId);
      if (
        parsed.candidates.length >
        metadata.derivationSettings.maxCandidatesPerSpecies
      ) {
        fail(
          `manifest.species[${index}].candidates`,
          `exceeds the declared candidate cap of ${metadata.derivationSettings.maxCandidatesPerSpecies}`,
        );
      }
      const activeCount = parsed.candidates.filter(
        (candidate) => candidate.active,
      ).length;
      if (
        activeCount > metadata.derivationSettings.maxActiveVariantsPerSpecies
      ) {
        fail(
          `manifest.species[${index}].candidates`,
          `exceeds the declared active variant cap of ${metadata.derivationSettings.maxActiveVariantsPerSpecies}`,
        );
      }
      return parsed;
    },
  );
  return {
    metadata,
    species,
  };
}

/** Parse and validate serialized moveset variant manifest JSON. */
export function parseMovesetVariantManifestJson(
  json: string,
): MovesetVariantManifest {
  let value: unknown;
  try {
    value = JSON.parse(json) as unknown;
  } catch (error) {
    throw new MovesetVariantManifestValidationError(
      'manifest',
      `must be valid JSON: ${error instanceof Error ? error.message : 'unknown parse error'}`,
    );
  }
  return parseMovesetVariantManifest(value);
}

/** Validate and deterministically serialize a moveset variant manifest. */
export function serializeMovesetVariantManifest(
  manifest: MovesetVariantManifest,
): string {
  const canonical = canonicalizeManifest(parseMovesetVariantManifest(manifest));
  return `${JSON.stringify(canonical, null, 2)}\n`;
}
