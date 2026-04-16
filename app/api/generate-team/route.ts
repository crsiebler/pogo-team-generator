import { NextRequest, NextResponse } from 'next/server';
import { buildCoreBreakerAnalysis } from '@/lib/analysis/coreBreakerAnalysis';
import { buildPokemonContributionAnalysis } from '@/lib/analysis/pokemonContributionAnalysis';
import { buildShieldScenarioAnalysis } from '@/lib/analysis/shieldScenarioAnalysis';
import { buildThreatAnalysis } from '@/lib/analysis/threatAnalysis';
import {
  isBattleFrontierFormatId,
  DEFAULT_BATTLE_FORMAT_ID,
  isBattleFormatId,
} from '@/lib/data/battleFormats';
import {
  getBattleFrontierMasterTeamLegality,
  type BattleFrontierMasterLegalityViolation,
} from '@/lib/data/battleFrontierMasterRules';
import {
  isBattleFrontierBannedSpeciesId,
  normalizeToChoosableSpeciesId,
  speciesNameToId,
  validateTeamUniqueness,
} from '@/lib/data/pokemon';
import {
  getRankedSpeciesIds,
  MissingRankingDataError,
} from '@/lib/data/rankings';
import { MissingSimulationDataError } from '@/lib/data/simulations';
import { generateTeam } from '@/lib/genetic/algorithm';
import type {
  FitnessAlgorithm,
  GenerationAnalysis,
  TournamentMode,
} from '@/lib/types';

export const runtime = 'nodejs';

function isFitnessAlgorithm(value: string): value is FitnessAlgorithm {
  return value === 'individual' || value === 'teamSynergy';
}

function getBattleFrontierMasterAnchorError(
  violation: BattleFrontierMasterLegalityViolation,
): string {
  switch (violation) {
    case 'points-cap':
      return 'Battle Frontier Master anchors exceed the 11-point cap.';
    case 'five-point-limit':
      return 'Battle Frontier Master anchors can include at most one 5-point Pokemon.';
    case 'mega-limit':
      return 'Battle Frontier Master anchors can include at most one Mega Pokemon.';
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mode, formatId, anchorPokemon, excludedPokemon, algorithm } =
      body as {
        mode: TournamentMode;
        formatId?: string;
        anchorPokemon?: string[];
        excludedPokemon?: string[];
        algorithm?: FitnessAlgorithm;
      };

    const resolvedFormatId = formatId ?? DEFAULT_BATTLE_FORMAT_ID;

    if (!isBattleFormatId(resolvedFormatId)) {
      return NextResponse.json(
        { error: `Invalid battle format: ${resolvedFormatId}` },
        { status: 400 },
      );
    }

    if (!mode || (mode !== 'PlayPokemon' && mode !== 'GBL')) {
      return NextResponse.json(
        { error: 'Invalid tournament mode' },
        { status: 400 },
      );
    }

    if (isBattleFrontierFormatId(resolvedFormatId) && mode !== 'PlayPokemon') {
      return NextResponse.json(
        {
          error:
            'Battle Frontier formats only support Play! Pokemon team generation.',
        },
        { status: 400 },
      );
    }

    if (algorithm !== undefined && !isFitnessAlgorithm(algorithm)) {
      return NextResponse.json(
        { error: `Invalid fitness algorithm: ${algorithm}` },
        { status: 400 },
      );
    }

    const anchorSpeciesIds: string[] = [];
    const rankedSpeciesIds = getRankedSpeciesIds(resolvedFormatId);
    if (anchorPokemon && anchorPokemon.length > 0) {
      for (const name of anchorPokemon) {
        const speciesId = speciesNameToId(name);
        if (!speciesId) {
          return NextResponse.json(
            { error: `Invalid Pokémon name: ${name}` },
            { status: 400 },
          );
        }

        const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
        if (
          !rankedSpeciesIds.has(canonicalSpeciesId) ||
          (isBattleFrontierFormatId(resolvedFormatId) &&
            isBattleFrontierBannedSpeciesId(canonicalSpeciesId))
        ) {
          return NextResponse.json(
            {
              error: `Pokémon is not eligible for ${resolvedFormatId}: ${name}`,
            },
            { status: 400 },
          );
        }

        anchorSpeciesIds.push(speciesId);
      }

      if (!validateTeamUniqueness(anchorSpeciesIds)) {
        return NextResponse.json(
          {
            error:
              'Team cannot be generated due to multiple identical species.',
          },
          { status: 400 },
        );
      }

      if (resolvedFormatId === 'battle-frontier-master') {
        const legality = getBattleFrontierMasterTeamLegality(anchorSpeciesIds);

        if (!legality.isLegal) {
          return NextResponse.json(
            {
              error: getBattleFrontierMasterAnchorError(legality.violations[0]),
            },
            { status: 400 },
          );
        }
      }
    }

    console.log('Anchor Pokemon names:', anchorPokemon);
    console.log('Anchor Species IDs:', anchorSpeciesIds);

    const excludedSpeciesIds: string[] = [];
    if (excludedPokemon && excludedPokemon.length > 0) {
      for (const name of excludedPokemon) {
        const speciesId = speciesNameToId(name);
        if (!speciesId) {
          return NextResponse.json(
            { error: `Invalid Pokémon name: ${name}` },
            { status: 400 },
          );
        }

        const canonicalSpeciesId = normalizeToChoosableSpeciesId(speciesId);
        if (
          !rankedSpeciesIds.has(canonicalSpeciesId) ||
          (isBattleFrontierFormatId(resolvedFormatId) &&
            isBattleFrontierBannedSpeciesId(canonicalSpeciesId))
        ) {
          return NextResponse.json(
            {
              error: `Pokémon is not eligible for ${resolvedFormatId}: ${name}`,
            },
            { status: 400 },
          );
        }

        excludedSpeciesIds.push(speciesId);
      }
    }

    console.log('Excluded Pokemon names:', excludedPokemon);
    console.log('Excluded Species IDs:', excludedSpeciesIds);

    const selectedAlgorithm = algorithm ?? 'individual';
    const teamSize = mode === 'GBL' ? 3 : 6;

    const result = await generateTeam({
      formatId: resolvedFormatId,
      mode,
      anchorPokemon: anchorSpeciesIds,
      excludedPokemon: excludedSpeciesIds,
      populationSize: 150,
      generations: 75,
      algorithm: selectedAlgorithm,
    });

    const threats = buildThreatAnalysis(result.team, resolvedFormatId);

    const analysis: GenerationAnalysis = {
      mode,
      algorithm: selectedAlgorithm,
      teamSize,
      generatedAt: new Date().toISOString(),
      threats,
      coreBreakers: buildCoreBreakerAnalysis(teamSize, threats.entries),
      shieldScenarios: buildShieldScenarioAnalysis(
        result.team,
        threats.entries,
        resolvedFormatId,
      ),
      pokemonContributions: buildPokemonContributionAnalysis(
        result.team,
        threats.entries,
        resolvedFormatId,
      ),
    };

    console.log('Generated team:', result.team);
    console.log('Team size:', result.team.length);
    console.log('Anchors preserved:', result.anchors);

    return NextResponse.json({
      team: result.team,
      fitness: result.fitness,
      analysis,
    });
  } catch (error) {
    if (
      error instanceof MissingRankingDataError ||
      error instanceof MissingSimulationDataError
    ) {
      return NextResponse.json(
        { error: error instanceof Error ? error.message : 'Invalid data' },
        { status: 400 },
      );
    }

    console.error('Error generating team:', error);
    return NextResponse.json(
      { error: 'Failed to generate team' },
      { status: 500 },
    );
  }
}
