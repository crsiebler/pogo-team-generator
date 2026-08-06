import { createHash } from 'crypto';
import type { BattleFormat } from '@/lib/data/battleFormats';
import {
  MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
  parseMovesetVariantManifestJson,
  serializeMovesetVariantManifest,
  type MovesetVariantDerivationSettings,
  type MovesetVariantManifest,
  type MovesetVariantManifestSpecies,
  type MovesetVariantSourceDigest,
} from '@/lib/data/movesetVariantManifest';

/** Pure inputs required to construct one generated manifest. */
export interface BuildMovesetVariantManifestInput {
  readonly format: BattleFormat;
  readonly policyVersion: string;
  readonly sourceDigests: readonly MovesetVariantSourceDigest[];
  readonly derivationSettings: MovesetVariantDerivationSettings;
  readonly species: readonly MovesetVariantManifestSpecies[];
}

/** Hash exact source bytes under a stable logical key for reproducibility. */
export function createMovesetVariantSourceDigest(
  key: string,
  contents: string | Uint8Array,
): MovesetVariantSourceDigest {
  return {
    key,
    algorithm: 'sha256',
    digest: createHash('sha256').update(contents).digest('hex'),
  };
}

/** Construct and validate a canonical manifest without publishing it. */
export function buildMovesetVariantManifest(
  input: BuildMovesetVariantManifestInput,
): MovesetVariantManifest {
  const manifest: MovesetVariantManifest = {
    metadata: {
      schemaVersion: MOVESET_VARIANT_MANIFEST_SCHEMA_VERSION,
      policyVersion: input.policyVersion,
      formatId: input.format.id,
      cup: input.format.cup,
      cp: input.format.cp,
      sourceDigests: input.sourceDigests,
      derivationSettings: input.derivationSettings,
    },
    species: input.species,
  };

  return parseMovesetVariantManifestJson(
    serializeMovesetVariantManifest(manifest),
  );
}

/** Serialize a built manifest using the authoritative data-layer validator. */
export function serializeBuiltMovesetVariantManifest(
  manifest: MovesetVariantManifest,
): string {
  return serializeMovesetVariantManifest(manifest);
}
