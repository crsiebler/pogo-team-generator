import { NextRequest, NextResponse } from 'next/server';
import {
  DEFAULT_BATTLE_FORMAT_ID,
  isBattleFormatId,
} from '@/lib/data/battleFormats';
import { getPokemonBySpeciesId } from '@/lib/data/pokemon';
import { getRecommendedMovesetForPokemon } from '@/lib/genetic/moveset';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team, formatId } = body as {
      team: string[];
      formatId?: string;
    };
    const resolvedFormatId = formatId ?? DEFAULT_BATTLE_FORMAT_ID;

    console.log('Team details requested for:', team);
    console.log('Team size:', team.length);

    if (!team || !Array.isArray(team)) {
      return NextResponse.json({ error: 'Invalid team data' }, { status: 400 });
    }

    if (!isBattleFormatId(resolvedFormatId)) {
      return NextResponse.json(
        { error: `Invalid battle format: ${resolvedFormatId}` },
        { status: 400 },
      );
    }

    // Fetch full Pokemon data for each team member with strict recommended movesets
    const pokemonData = team
      .map((speciesId) => {
        const pokemon = getPokemonBySpeciesId(speciesId);
        if (!pokemon) {
          console.warn(`Pokemon not found: ${speciesId}`);
          return null;
        }

        const moveset = getRecommendedMovesetForPokemon(
          pokemon,
          resolvedFormatId,
        );

        return {
          ...pokemon,
          recommendedMoveset: moveset,
        };
      })
      .filter(Boolean);

    console.log('Returning pokemon data, count:', pokemonData.length);

    return NextResponse.json({
      pokemon: pokemonData,
    });
  } catch (error) {
    console.error('Error fetching team details:', error);
    return NextResponse.json(
      { error: 'Failed to fetch team details' },
      { status: 500 },
    );
  }
}
