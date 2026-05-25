import { render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { TeamDisplay } from './TeamDisplay';
import type {
  BenchUtility,
  PlayPokemonRosterMetrics,
  RecommendedLineup,
} from '@/lib/types';

vi.mock('@/components/molecules', () => ({
  PokemonCard: () => <div>Pokemon Card</div>,
}));

vi.mock('@/components/molecules/ExportButton/ExportButton', () => ({
  ExportButton: () => <button type="button">Export</button>,
}));

describe('TeamDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ pokemon: [] }),
      }),
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('sends formatId when requesting team details', async () => {
    render(
      <TeamDisplay
        team={['decidueye']}
        mode="PlayPokemon"
        formatId="battle-frontier-ul-retro"
      />,
    );

    await waitFor(() => {
      expect(fetch).toHaveBeenCalledWith(
        '/api/team-details',
        expect.objectContaining({ method: 'POST' }),
      );
    });

    const [, options] = vi.mocked(fetch).mock.calls[0] as [
      string,
      RequestInit & { body: string },
    ];

    expect(JSON.parse(options.body)).toEqual({
      team: ['decidueye'],
      formatId: 'battle-frontier-ul-retro',
    });
  });

  it('shows Battle Frontier Master generated team point usage in the notes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: [
            {
              speciesId: 'charizard_mega_y',
              speciesName: 'Charizard (Mega Y)',
            },
            { speciesId: 'garchomp', speciesName: 'Garchomp' },
          ],
        }),
      }),
    );

    render(
      <TeamDisplay
        team={['charizard_mega_y', 'garchomp']}
        mode="PlayPokemon"
        formatId="battle-frontier-master"
        battleFrontierMasterPointsByPokemonName={{
          'Charizard (Mega Y)': 4,
          Garchomp: 0,
        }}
      />,
    );

    await waitFor(() => {
      expect(
        screen.getByText(/Current Battle Frontier Master point usage:/i),
      ).toBeInTheDocument();
      expect(screen.getByText(/4\s*\/\s*11 points/i)).toBeInTheDocument();
    });
  });

  it('shows multiple PlayPokemon recommended lineups with diagnostics', async () => {
    const recommendedLineups: RecommendedLineup[] = [
      {
        lineup: {
          lead: 'azumarill',
          switch: 'skarmory',
          closer: 'registeel',
        },
        score: 0.87,
        coverageMetrics: {
          coverageRate: 0.74,
          dominatingMatchupCount: 8,
          overwhelmingLossCount: 2,
          singleAnswerThreatCount: 1,
        },
        coveredThreats: ['lanturn', 'talonflame'],
        weaknesses: ['venusaur'],
        diagnosticLabel: 'ABC',
        resourcePathMetrics: {
          balanced: { available: true, score: 0.8 },
          shieldSpend: { available: true, score: 0.76 },
          shieldSave: { available: false },
        },
      },
      {
        lineup: {
          lead: 'skarmory',
          switch: 'registeel',
          closer: 'azumarill',
        },
        score: 0.81,
        coverageMetrics: {
          coverageRate: 0.68,
          dominatingMatchupCount: 6,
          overwhelmingLossCount: 3,
          singleAnswerThreatCount: 2,
        },
        coveredThreats: ['venusaur'],
        weaknesses: ['lanturn'],
        diagnosticLabel: 'ABA',
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: [
            { speciesId: 'azumarill', speciesName: 'Azumarill' },
            { speciesId: 'skarmory', speciesName: 'Skarmory' },
            { speciesId: 'registeel', speciesName: 'Registeel' },
          ],
        }),
      }),
    );

    render(
      <TeamDisplay
        team={['azumarill', 'skarmory', 'registeel']}
        mode="PlayPokemon"
        formatId="great-league"
        recommendedLineups={recommendedLineups}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Recommended Lineups')).toBeInTheDocument();
      expect(screen.getByText('Lineup 1')).toBeInTheDocument();
      expect(screen.getByText('Lineup 2')).toBeInTheDocument();
    });

    expect(screen.getByText('Lead: Azumarill')).toBeInTheDocument();
    expect(screen.getByText('Safe Swap: Skarmory')).toBeInTheDocument();
    expect(screen.getByText('Closer: Registeel')).toBeInTheDocument();
    expect(screen.getByText('Score: 0.87')).toBeInTheDocument();
    expect(
      screen.getByText('Covered threats: lanturn, talonflame'),
    ).toBeInTheDocument();
    expect(screen.getByText('Weaknesses: venusaur')).toBeInTheDocument();
    expect(screen.getByText('Structure: ABC')).toBeInTheDocument();
    expect(screen.getByText('Balanced: 0.80')).toBeInTheDocument();
    expect(screen.getByText('Shield spend: 0.76')).toBeInTheDocument();
    expect(screen.queryByText(/Shield save:/i)).not.toBeInTheDocument();
  });

  it('shows one GBL role-ordered lineup when one recommendation is present', async () => {
    const recommendedLineups: RecommendedLineup[] = [
      {
        lineup: {
          lead: 'clodsire',
          switch: 'feraligatr',
          closer: 'dunsparce',
        },
        score: 0.79,
        coverageMetrics: {
          coverageRate: 0.72,
          dominatingMatchupCount: 5,
          overwhelmingLossCount: 2,
          singleAnswerThreatCount: 1,
        },
        coveredThreats: ['gastrodon'],
        weaknesses: ['jumpluff'],
        diagnosticLabel: 'ABB',
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: [
            { speciesId: 'clodsire', speciesName: 'Clodsire' },
            { speciesId: 'feraligatr', speciesName: 'Feraligatr' },
            { speciesId: 'dunsparce', speciesName: 'Dunsparce' },
          ],
        }),
      }),
    );

    render(
      <TeamDisplay
        team={['clodsire', 'feraligatr', 'dunsparce']}
        mode="GBL"
        formatId="great-league"
        recommendedLineups={recommendedLineups}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Recommended Lineup')).toBeInTheDocument();
    });

    expect(screen.getByText('Lead: Clodsire')).toBeInTheDocument();
    expect(screen.getByText('Safe Swap: Feraligatr')).toBeInTheDocument();
    expect(screen.getByText('Closer: Dunsparce')).toBeInTheDocument();
    expect(screen.queryByText('Lineup 2')).not.toBeInTheDocument();
  });

  it('shows PlayPokemon roster metrics and bench utility warnings', async () => {
    const benchUtility: BenchUtility[] = [
      {
        speciesId: 'azumarill',
        utilityScore: 0.84,
        totalAppearances: 4,
        leadAppearances: 1,
        switchAppearances: 2,
        closerAppearances: 1,
        warnings: [],
      },
      {
        speciesId: 'registeel',
        utilityScore: 0.12,
        totalAppearances: 0,
        leadAppearances: 0,
        switchAppearances: 0,
        closerAppearances: 0,
        warnings: ['unbringable'],
      },
    ];
    const rosterMetrics: PlayPokemonRosterMetrics = {
      viableLineupCount: 12,
      topLineupQuality: 0.88,
      topNLineupDepth: 0.76,
      dominatingMatchupRate: 0.42,
      overwhelmingLossRate: 0.14,
      singleAnswerRisks: ['lanturn', 'venusaur'],
      viableLeadDiversity: 3,
      benchUtilitySummary: benchUtility,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({
          pokemon: [
            { speciesId: 'azumarill', speciesName: 'Azumarill' },
            { speciesId: 'registeel', speciesName: 'Registeel' },
          ],
        }),
      }),
    );

    render(
      <TeamDisplay
        team={['azumarill', 'registeel']}
        mode="PlayPokemon"
        formatId="great-league"
        rosterMetrics={rosterMetrics}
        benchUtility={benchUtility}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Roster Metrics')).toBeInTheDocument();
      expect(screen.getByText('Bench Utility')).toBeInTheDocument();
    });

    expect(screen.getByText('Viable Lineups')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
    expect(screen.getByText('Top Lineup Quality')).toBeInTheDocument();
    expect(screen.getByText('0.88')).toBeInTheDocument();
    expect(screen.getByText('Top-N Lineup Depth')).toBeInTheDocument();
    expect(screen.getByText('0.76')).toBeInTheDocument();
    expect(screen.getByText('Dominating Matchup Rate')).toBeInTheDocument();
    expect(screen.getByText('42%')).toBeInTheDocument();
    expect(screen.getByText('Overwhelming Loss Rate')).toBeInTheDocument();
    expect(screen.getByText('14%')).toBeInTheDocument();
    expect(screen.getByText('Single-Answer Risks')).toBeInTheDocument();
    expect(screen.getByText('lanturn, venusaur')).toBeInTheDocument();
    expect(screen.getByText('Viable Lead Diversity')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
    expect(screen.getByText('Bench Utility Summary')).toBeInTheDocument();
    expect(screen.getByText('2 roster members tracked')).toBeInTheDocument();

    expect(screen.getByText('Azumarill')).toBeInTheDocument();
    expect(screen.getByText('Utility Score: 0.84')).toBeInTheDocument();
    expect(screen.getByText('Appearances: 4 total')).toBeInTheDocument();
    expect(
      screen.getByText('Lead: 1 / Safe Swap: 2 / Closer: 1'),
    ).toBeInTheDocument();
    expect(screen.getByText('Registeel')).toBeInTheDocument();
    expect(screen.getByText('Warning: unbringable')).toBeInTheDocument();
  });

  it('does not show PlayPokemon roster metrics for GBL results', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue({
        ok: true,
        json: vi.fn().mockResolvedValue({ pokemon: [] }),
      }),
    );

    render(
      <TeamDisplay
        team={['azumarill', 'registeel']}
        mode="GBL"
        formatId="great-league"
        rosterMetrics={{
          viableLineupCount: 12,
          topLineupQuality: 0.88,
          topNLineupDepth: 0.76,
          dominatingMatchupRate: 0.42,
          overwhelmingLossRate: 0.14,
          singleAnswerRisks: [],
          viableLeadDiversity: 3,
          benchUtilitySummary: [],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText(/Team Notes/)).toBeInTheDocument();
    });

    expect(screen.queryByText('Roster Metrics')).not.toBeInTheDocument();
  });
});
