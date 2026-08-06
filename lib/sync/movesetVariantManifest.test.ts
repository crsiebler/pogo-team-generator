import { describe, expect, it } from 'vitest';
import {
  buildMovesetVariantManifest,
  createMovesetVariantSourceDigest,
  serializeBuiltMovesetVariantManifest,
} from './movesetVariantManifest';
import {
  MAX_ACTIVE_MOVESET_VARIANTS,
  MAX_MOVESET_CANDIDATES,
  type MovesetVariantManifestSpecies,
} from '@/lib/data/movesetVariantManifest';

function createSpecies(
  speciesId: string,
  fastMove: string,
): MovesetVariantManifestSpecies {
  const variantId = `${fastMove.toLowerCase()}--x_scissor--aqua_jet` as const;
  return {
    speciesId,
    defaultVariantId: variantId,
    evidence: {
      pvpokeScorePrior: 90,
      retainedFastMoves: [fastMove],
      retainedChargedMoves: ['X_SCISSOR', 'AQUA_JET'],
      rejections: [],
    },
    candidates: [
      {
        id: variantId,
        fastMove,
        chargedMove1: 'X_SCISSOR',
        chargedMove2: 'AQUA_JET',
        isDefault: true,
        evidence: {
          kind: 'preferred',
          sourceCategories: ['overall'],
          sourceVariantIds: [variantId],
        },
        acquisitionRequirements: {
          fastMove: { kind: 'regular' },
          chargedMove1: { kind: 'regular' },
          chargedMove2: { kind: 'regular' },
        },
        storageKeys: {
          '0-0': `${speciesId}_0-0.csv`,
          '1-1': `${speciesId}_1-1.csv`,
          '2-2': `${speciesId}_2-2.csv`,
        },
        completeness: { '0-0': true, '1-1': true, '2-2': true },
        evaluationCounts: { '0-0': 100, '1-1': 100, '2-2': 100 },
        active: true,
      },
    ],
  };
}

function addAlternateCandidate(
  species: MovesetVariantManifestSpecies,
): MovesetVariantManifestSpecies {
  const defaultCandidate = species.candidates[0]!;
  const id = 'shadow_claw--x_scissor--aqua_jet';
  return {
    ...species,
    candidates: [
      defaultCandidate,
      {
        ...defaultCandidate,
        id,
        fastMove: 'SHADOW_CLAW',
        isDefault: false,
        evidence: {
          kind: 'substitution',
          sourceCategories: ['switches', 'overall'],
          sourceVariantIds: [id, defaultCandidate.id],
        },
        storageKeys: {
          '0-0': `${species.speciesId}--${id}_0-0.csv`,
          '1-1': `${species.speciesId}--${id}_1-1.csv`,
          '2-2': `${species.speciesId}--${id}_2-2.csv`,
        },
        active: false,
      },
    ],
  };
}

function addOrderedRejections(
  species: MovesetVariantManifestSpecies,
  reverse: boolean,
): MovesetVariantManifestSpecies {
  const rejections = [
    {
      sourceMoveset: {
        fastMove: 'WATERFALL',
        chargedMove1: 'AQUA_JET',
        chargedMove2: 'X_SCISSOR',
      },
      excludedMove: 'ACID',
      reason: 'Excluded legacy move.',
    },
    {
      sourceMoveset: {
        fastMove: 'WATERFALL',
        chargedMove1: 'X_SCISSOR',
        chargedMove2: 'AQUA_JET',
      },
      excludedMove: 'ACID',
      reason: 'Excluded legacy move.',
    },
  ];
  return {
    ...species,
    evidence: {
      ...species.evidence,
      rejections: reverse ? rejections.reverse() : rejections,
    },
  };
}

const derivationSettings = {
  maxCandidatesPerSpecies: MAX_MOVESET_CANDIDATES,
  maxActiveVariantsPerSpecies: MAX_ACTIVE_MOVESET_VARIANTS,
  maxExpansionFastMoves: 2,
  maxExpansionChargedMoves: 4,
  requiredScenarios: ['0-0', '1-1', '2-2'],
  categoryWeights: {
    overall: 3,
    leads: 2,
    switches: 2,
    closers: 2,
    chargers: 1,
    attackers: 1,
    consistency: 1,
  },
} as const;

describe('moveset variant manifest construction', () => {
  it('builds byte-identical output from shuffled generated inputs', () => {
    const sources = [
      createMovesetVariantSourceDigest('pokemon', 'pokemon bytes'),
      createMovesetVariantSourceDigest('rankings/overall', 'ranking bytes'),
    ];
    const golisopod = addOrderedRejections(
      addAlternateCandidate(createSpecies('golisopod', 'WATERFALL')),
      false,
    );
    const species = [createSpecies('quagsire', 'MUD_SHOT'), golisopod];
    const shuffledGolisopod: MovesetVariantManifestSpecies = {
      ...addOrderedRejections(golisopod, true),
      candidates: [...golisopod.candidates].reverse().map((candidate) => ({
        ...candidate,
        evidence: {
          ...candidate.evidence,
          sourceCategories: [...candidate.evidence.sourceCategories].reverse(),
          sourceVariantIds: [...candidate.evidence.sourceVariantIds].reverse(),
        },
      })),
    };

    const ordered = serializeBuiltMovesetVariantManifest(
      buildMovesetVariantManifest({
        format: {
          id: 'great-league',
          label: 'Great League',
          cup: 'all',
          cp: 1500,
        },
        policyVersion: 'ranking-evidence-v1',
        sourceDigests: sources,
        derivationSettings,
        species,
      }),
    );
    const shuffled = serializeBuiltMovesetVariantManifest(
      buildMovesetVariantManifest({
        format: {
          id: 'great-league',
          label: 'Great League',
          cup: 'all',
          cp: 1500,
        },
        policyVersion: 'ranking-evidence-v1',
        sourceDigests: [...sources].reverse(),
        derivationSettings,
        species: [shuffledGolisopod, species[0]!],
      }),
    );

    expect(shuffled).toBe(ordered);
    expect(ordered.endsWith('\n')).toBe(true);
  });

  it('uses stable SHA-256 source digests and does not mutate inputs', () => {
    const species = createSpecies('golisopod', 'WATERFALL');
    const before = structuredClone(species);

    const digest = createMovesetVariantSourceDigest(
      'rankings/overall',
      'ranking bytes',
    );
    buildMovesetVariantManifest({
      format: {
        id: 'great-league',
        label: 'Great League',
        cup: 'all',
        cp: 1500,
      },
      policyVersion: 'ranking-evidence-v1',
      sourceDigests: [digest],
      derivationSettings,
      species: [species],
    });

    expect(digest).toEqual({
      key: 'rankings/overall',
      algorithm: 'sha256',
      digest:
        'acee1f69696bd1841fca07cdd839658651e5a6b616d69e099a949521af1d2d3e',
    });
    expect(species).toEqual(before);
  });
});
