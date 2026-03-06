import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_BATTLE_FORMAT_ID,
  isBattleFormatId,
} from '@/lib/data/battleFormats';
import { speciesNameToId, validateTeamUniqueness } from '@/lib/data/pokemon';
import { generateTeam } from '@/lib/genetic/algorithm';
import type { TournamentMode, FitnessAlgorithm } from '@/lib/types';

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

    // Validate mode
    if (!mode || (mode !== 'PlayPokemon' && mode !== 'GBL')) {
      return NextResponse.json(
        { error: 'Invalid tournament mode' },
        { status: 400 },
      );
    }

    // Convert anchor Pokemon names to speciesIds
    const anchorSpeciesIds: string[] = [];
    if (anchorPokemon && anchorPokemon.length > 0) {
      for (const name of anchorPokemon) {
        const speciesId = speciesNameToId(name);
        if (!speciesId) {
          return NextResponse.json(
            { error: `Invalid Pokémon name: ${name}` },
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
    }

    console.log('Anchor Pokemon names:', anchorPokemon);
    console.log('Anchor Species IDs:', anchorSpeciesIds);

    // Convert excluded Pokemon names to speciesIds
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
        excludedSpeciesIds.push(speciesId);
      }
    }

    console.log('Excluded Pokemon names:', excludedPokemon);
    console.log('Excluded Species IDs:', excludedSpeciesIds);

    // Run genetic algorithm
    const result = await generateTeam({
      formatId: resolvedFormatId,
      mode,
      anchorPokemon: anchorSpeciesIds,
      excludedPokemon: excludedSpeciesIds,
      populationSize: 150,
      generations: 75,
      algorithm: algorithm || 'individual',
    });

    console.log('Generated team:', result.team);
    console.log('Team size:', result.team.length);
    console.log('Anchors preserved:', result.anchors);

    return NextResponse.json({
      team: result.team,
      fitness: result.fitness,
    });
  } catch (error) {
    console.error('Error generating team:', error);
    return NextResponse.json(
      { error: 'Failed to generate team' },
      { status: 500 },
    );
  }
}
