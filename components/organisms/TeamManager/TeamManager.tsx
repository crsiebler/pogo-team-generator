'use client';

import { useState, useCallback, useEffect, useMemo } from 'react';
import { TeamConfigPanel, ResultsPanel } from '@/components/organisms';
import {
  DEFAULT_BATTLE_FORMAT_ID,
  type BattleFormatId,
} from '@/lib/data/battleFormats';
import { useToast } from '@/lib/hooks/useToast';
import { TournamentMode, FitnessAlgorithm } from '@/lib/types';

interface TeamManagerProps {
  pokemonList?: string[];
}

export function TeamManager({ pokemonList = [] }: TeamManagerProps) {
  const { showToast } = useToast();
  const [generatedTeam, setGeneratedTeam] = useState<string[] | null>(null);
  const [isGenerating, setIsGenerating] = useState(false);
  const [isLoadingPokemonList, setIsLoadingPokemonList] = useState(false);
  const [currentMode, setCurrentMode] = useState<TournamentMode>('PlayPokemon');
  const [currentFormatId, setCurrentFormatId] = useState<BattleFormatId>(
    DEFAULT_BATTLE_FORMAT_ID,
  );
  const [eligiblePokemonList, setEligiblePokemonList] =
    useState<string[]>(pokemonList);
  const [anchorPokemon, setAnchorPokemon] = useState<string[]>([]);
  const [excludedPokemon, setExcludedPokemon] = useState<string[]>([]);
  const [currentAlgorithm, setCurrentAlgorithm] =
    useState<FitnessAlgorithm>('individual');

  const eligiblePokemonSet = useMemo(() => {
    return new Set(eligiblePokemonList);
  }, [eligiblePokemonList]);

  useEffect(() => {
    const abortController = new AbortController();

    async function loadEligiblePokemonList(): Promise<void> {
      setIsLoadingPokemonList(true);

      try {
        const response = await fetch(
          `/api/pokemon-list?formatId=${currentFormatId}`,
          {
            signal: abortController.signal,
          },
        );

        if (!response.ok) {
          const errorData = (await response.json().catch(() => null)) as {
            error?: string;
          } | null;
          throw new Error(
            errorData?.error ?? 'Failed to load eligible Pokémon list.',
          );
        }

        const data = (await response.json()) as {
          pokemon: string[];
        };

        const nextEligiblePokemonList = data.pokemon ?? [];
        setEligiblePokemonList(nextEligiblePokemonList);

        setAnchorPokemon((previousAnchors) =>
          previousAnchors.filter((name) =>
            nextEligiblePokemonList.includes(name),
          ),
        );
        setExcludedPokemon((previousExclusions) =>
          previousExclusions.filter((name) =>
            nextEligiblePokemonList.includes(name),
          ),
        );
      } catch (error) {
        if (abortController.signal.aborted) {
          return;
        }

        setEligiblePokemonList([]);

        const message =
          error instanceof Error
            ? error.message
            : 'Failed to load eligible Pokémon list.';
        showToast(message, 'error');
      } finally {
        if (!abortController.signal.aborted) {
          setIsLoadingPokemonList(false);
        }
      }
    }

    void loadEligiblePokemonList();

    return () => {
      abortController.abort();
    };
  }, [currentFormatId, showToast]);

  const handleModeChange = useCallback((mode: TournamentMode) => {
    setCurrentMode(mode);
    setAnchorPokemon([]);
    setExcludedPokemon([]);
  }, []);

  const handleFormatChange = useCallback((formatId: BattleFormatId) => {
    setCurrentFormatId(formatId);
    setAnchorPokemon([]);
    setExcludedPokemon([]);
  }, []);

  const handleAnchorsChange = useCallback((anchors: string[]) => {
    setAnchorPokemon(anchors);
  }, []);

  const handleExclusionsChange = useCallback((exclusions: string[]) => {
    setExcludedPokemon(exclusions);
  }, []);

  const handleAlgorithmChange = useCallback((algorithm: FitnessAlgorithm) => {
    setCurrentAlgorithm(algorithm);
  }, []);

  const getBaseSpeciesName = (pokemonName: string): string =>
    pokemonName
      .replace(/\s*\([^)]*\)\s*/g, '')
      .trim()
      .toLowerCase();

  const hasDuplicateBaseSpecies = (pokemon: string[]): boolean => {
    const seenBaseSpecies = new Set<string>();

    for (const name of pokemon) {
      const baseSpecies = getBaseSpeciesName(name);
      if (!baseSpecies) {
        continue;
      }

      if (seenBaseSpecies.has(baseSpecies)) {
        return true;
      }

      seenBaseSpecies.add(baseSpecies);
    }

    return false;
  };

  const handleGenerate = async () => {
    if (isLoadingPokemonList) {
      showToast('Please wait for eligible Pokémon to finish loading.', 'error');
      return;
    }

    setIsGenerating(true);
    setGeneratedTeam(null);

    try {
      const selectedAnchors = anchorPokemon.filter(Boolean);

      if (hasDuplicateBaseSpecies(selectedAnchors)) {
        throw new Error(
          'Team cannot be generated due to multiple identical species.',
        );
      }

      const ineligibleAnchor = selectedAnchors.find(
        (name) => !eligiblePokemonSet.has(name),
      );

      if (ineligibleAnchor) {
        throw new Error(
          `Selected anchor is not eligible for ${currentFormatId}: ${ineligibleAnchor}`,
        );
      }

      const ineligibleExcludedPokemon = excludedPokemon.find(
        (name) => !eligiblePokemonSet.has(name),
      );

      if (ineligibleExcludedPokemon) {
        throw new Error(
          `Excluded Pokémon is not eligible for ${currentFormatId}: ${ineligibleExcludedPokemon}`,
        );
      }

      const response = await fetch('/api/generate-team', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          formatId: currentFormatId,
          mode: currentMode,
          anchorPokemon: selectedAnchors,
          excludedPokemon: excludedPokemon,
          algorithm: currentAlgorithm,
        }),
      });

      if (!response.ok) {
        const errorData = (await response.json().catch(() => null)) as {
          error?: string;
        } | null;

        throw new Error(errorData?.error ?? 'Failed to generate team');
      }

      const data = await response.json();
      setGeneratedTeam(data.team);
    } catch (error) {
      console.error('Error generating team:', error);
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to generate team. Please try again.';
      showToast(message, 'error');
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="grid grid-cols-1 gap-6 sm:gap-8 lg:grid-cols-2">
      <TeamConfigPanel
        pokemonList={eligiblePokemonList}
        selectedFormatId={currentFormatId}
        onFormatChange={handleFormatChange}
        mode={currentMode}
        onModeChange={handleModeChange}
        onAnchorsChange={handleAnchorsChange}
        onExclusionsChange={handleExclusionsChange}
        algorithm={currentAlgorithm}
        onAlgorithmChange={handleAlgorithmChange}
        onGenerate={handleGenerate}
        isGenerating={isGenerating}
      />
      <ResultsPanel
        generatedTeam={generatedTeam}
        mode={currentMode}
        isGenerating={isGenerating}
      />
    </div>
  );
}
