import { NextRequest, NextResponse } from 'next/server';
import { generateTeam } from '@/lib/genetic/algorithm';
import { speciesNameToId } from '@/lib/data/pokemon';
import type { TournamentMode } from '@/lib/types';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { mode, anchorPokemon } = body as {
      mode: TournamentMode;
      anchorPokemon?: string[];
    };

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
    }

    console.log('Anchor Pokemon names:', anchorPokemon);
    console.log('Anchor Species IDs:', anchorSpeciesIds);

    // Run genetic algorithm
    const result = await generateTeam({
      mode,
      anchorPokemon: anchorSpeciesIds,
      populationSize: 150,
      generations: 75,
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
