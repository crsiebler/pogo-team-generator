import { Component, StrictMode, type ReactNode } from 'react';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { TeamManager } from './TeamManager';
import type {
  GenerationResponse,
  PokemonWithMoves,
  RosterMovesetAssignment,
} from '@/lib/types';

const team = [
  'azumarill',
  'skarmory',
  'registeel',
  'garchomp',
  'lanturn',
  'decidueye',
];

function makeGenerationResponse(): GenerationResponse {
  const authority = {
    source: 'manifest' as const,
    schemaVersion: 1,
    policyVersion: 'ranking-evidence-v1',
  };
  const variant = {
    id: 'bubble--ice_beam--play_rough' as const,
    fastMove: 'BUBBLE',
    chargedMove1: 'ICE_BEAM',
    chargedMove2: 'PLAY_ROUGH',
    isDefault: true,
  };
  const movesetAssignment: RosterMovesetAssignment = {
    formatId: 'play-pokemon',
    authorityBySpeciesId: Object.fromEntries(
      team.map((speciesId) => [speciesId, authority]),
    ),
    variantsBySpeciesId: Object.fromEntries(
      team.map((speciesId) => [speciesId, variant]),
    ),
    fingerprint: 'strict-mode-response-validation',
  };
  const pokemon: PokemonWithMoves[] = team.map((speciesId, index) => ({
    dex: index + 1,
    speciesName: speciesId,
    speciesId,
    baseStats: { atk: 100, def: 100, hp: 100 },
    types: ['water'],
    fastMoves: ['BUBBLE'],
    chargedMoves: ['ICE_BEAM', 'PLAY_ROUGH'],
    tags: [],
    defaultIVs: {},
    buddyDistance: 3,
    thirdMoveCost: 10000,
    released: true,
    recommendedMoveset: {
      ...variant,
      authority,
      acquisitionRequirements: {
        fastMove: { kind: 'regular' },
        chargedMove1: { kind: 'elite' },
        chargedMove2: { kind: 'eventExclusive' },
      },
    },
  }));

  return {
    team,
    fitness: 0.75,
    movesetAssignment,
    analysis: {
      mode: 'PlayPokemon',
      teamSize: team.length,
      generatedAt: '2026-10-22T00:00:00.000Z',
      threats: { evaluatedCount: 0, entries: [] },
      coreBreakers: { threshold: 0, entries: [] },
      shieldScenarios: {
        '0-0': { coveredThreats: 0, evaluatedThreats: 0, coverageRate: 0 },
        '1-1': { coveredThreats: 0, evaluatedThreats: 0, coverageRate: 0 },
        '2-2': { coveredThreats: 0, evaluatedThreats: 0, coverageRate: 0 },
      },
      pokemonContributions: {
        entries: [
          {
            speciesId: 'azumarill',
            pokemon: 'Azumarill',
            threatsHandled: 3,
            coverageAdded: 2,
            highSeverityRelief: 1,
            fragilityRiskTier: 'low',
          },
        ],
      },
    },
    pokemon,
  };
}

function omitProperty<T extends object, Key extends keyof T>(
  value: T,
  key: Key,
): Omit<T, Key> {
  const copy = { ...value };
  Reflect.deleteProperty(copy, key);
  return copy;
}

class RenderErrorBoundary extends Component<
  { children: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError(): { hasError: boolean } {
    return { hasError: true };
  }

  render(): ReactNode {
    if (this.state.hasError) {
      return <div role="alert">Unexpected result rendering failure.</div>;
    }

    return this.props.children;
  }
}

function response(payload: unknown) {
  return {
    ok: true,
    json: async () => payload,
  };
}

describe('TeamManager response validation integration', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('rejects malformed analysis, then retries into the complete real UI', async () => {
    const validResponse = makeGenerationResponse();
    const validResponseWithoutOptionalTags = {
      ...validResponse,
      pokemon: validResponse.pokemon.map((pokemon, index) =>
        index === 0 ? omitProperty(pokemon, 'tags') : pokemon,
      ),
    };
    const incompleteAnalysis = omitProperty(
      validResponse.analysis,
      'pokemonContributions',
    );
    const invalidResponse = {
      ...validResponseWithoutOptionalTags,
      analysis: incompleteAnalysis,
    };
    const generationResponses: unknown[] = [
      invalidResponse,
      validResponseWithoutOptionalTags,
    ];
    let generationRequestCount = 0;
    let teamDetailsRequestCount = 0;
    const fetchMock = vi.fn(async (input: RequestInfo | URL) => {
      const url = String(input);
      if (url.startsWith('/api/pokemon-list')) {
        return response({ pokemon: team.map((speciesId) => speciesId) });
      }

      if (url === '/api/generate-team') {
        generationRequestCount += 1;
        const payload = generationResponses.shift();
        if (payload === undefined) {
          throw new Error('No generation test response remains.');
        }
        return response(payload);
      }

      if (url === '/api/team-details') {
        teamDetailsRequestCount += 1;
        throw new Error('The result UI must not request team details.');
      }

      throw new Error(`Unexpected request: ${url}`);
    });
    vi.stubGlobal('fetch', fetchMock);
    vi.spyOn(console, 'error').mockImplementation(() => undefined);

    render(
      <StrictMode>
        <RenderErrorBoundary>
          <TeamManager />
        </RenderErrorBoundary>
      </StrictMode>,
    );

    await waitFor(() =>
      expect(
        screen.getByRole('button', { name: 'Generate Optimized Team' }),
      ).toBeEnabled(),
    );
    fireEvent.click(
      screen.getByRole('button', { name: 'Generate Optimized Team' }),
    );

    await waitFor(() =>
      expect(screen.getByRole('alert')).toHaveTextContent(
        'Generation response is invalid. Please try again.',
      ),
    );
    expect(
      screen.queryByRole('button', { name: 'Copy team export to clipboard' }),
    ).not.toBeInTheDocument();
    expect(screen.queryByText('azumarill')).not.toBeInTheDocument();

    fireEvent.click(
      screen.getByRole('button', { name: 'Generate Optimized Team' }),
    );

    await waitFor(() =>
      expect(screen.getAllByText(/^Dex #/)).toHaveLength(team.length),
    );
    expect(
      screen.getByRole('button', { name: 'Copy team export to clipboard' }),
    ).toBeInTheDocument();
    fireEvent.click(
      screen.getByRole('button', { name: 'Per-Pokemon Contribution' }),
    );
    expect(screen.getByText('Azumarill')).toBeInTheDocument();
    expect(
      screen.queryByText('Unexpected result rendering failure.'),
    ).not.toBeInTheDocument();
    expect(generationRequestCount).toBe(2);
    expect(teamDetailsRequestCount).toBe(0);
  });
});
