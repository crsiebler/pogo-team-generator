import { NextRequest, NextResponse } from 'next/server';
import { getPokemonBySpeciesId } from '@/lib/data/pokemon';
import { getOptimalMovesetForTeam } from '@/lib/genetic/moveset';

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { team } = body as { team: string[] };

    console.log('Team details requested for:', team);
    console.log('Team size:', team.length);

    if (!team || !Array.isArray(team)) {
      return NextResponse.json({ error: 'Invalid team data' }, { status: 400 });
    }

    // Fetch full Pokémon data for each team member with optimal movesets
    const pokemonData = team
      .map((speciesId) => {
        const pokemon = getPokemonBySpeciesId(speciesId);
        if (!pokemon) {
          console.warn(`Pokemon not found: ${speciesId}`);
          return null;
        }

        // Get optimal moveset based on team context
        const moveset = getOptimalMovesetForTeam(pokemon, team);

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
