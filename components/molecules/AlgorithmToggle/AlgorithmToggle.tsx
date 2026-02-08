'use client';

import { useCallback } from 'react';
import { Switch } from '@/components/atoms';
import type { FitnessAlgorithm } from '@/lib/types';

interface AlgorithmToggleProps {
  algorithm: FitnessAlgorithm;
  onChange: (algorithm: FitnessAlgorithm) => void;
}

export function AlgorithmToggle({ algorithm, onChange }: AlgorithmToggleProps) {
  const handleChange = useCallback(
    (checked: boolean) => {
      onChange(checked ? 'teamSynergy' : 'individual');
    },
    [onChange],
  );

  const isTeamSynergy = algorithm === 'teamSynergy';

  return (
    <Switch
      checked={isTeamSynergy}
      onChange={handleChange}
      label={isTeamSynergy ? 'Team Synergy Analysis' : 'Individual Scoring'}
      description={
        isTeamSynergy
          ? 'Focuses on team coverage and redundancy'
          : 'Focuses on individual Pokemon quality'
      }
    />
  );
}
