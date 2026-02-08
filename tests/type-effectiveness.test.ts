import { describe, it, expect } from 'vitest';
import {
  calculateEffectiveness,
  getSTAB,
  calculateTotalMultiplier,
  getEffectivenessCategory,
} from '../lib/coverage/typeChart';

describe('Type Effectiveness Calculator', () => {
  describe('User-Provided Examples', () => {
    it('should calculate Water vs Fire = 1.6×', () => {
      expect(calculateEffectiveness(['fire'], 'water')).toBe(1.6);
    });

    it('should calculate Water vs Fire/Rock = 2.56×', () => {
      expect(calculateEffectiveness(['fire', 'rock'], 'water')).toBe(2.56);
    });

    it('should calculate Water vs Dragon/Fire = 1.0× (0.625 × 1.6)', () => {
      expect(calculateEffectiveness(['dragon', 'fire'], 'water')).toBe(1.0);
    });

    it('should calculate Dragon vs Steel = 0.625×', () => {
      expect(calculateEffectiveness(['steel'], 'dragon')).toBe(0.625);
    });

    it('should calculate Dragon vs Fairy = 0.39×', () => {
      expect(calculateEffectiveness(['fairy'], 'dragon')).toBe(0.39);
    });

    it('should calculate Dragon vs Steel/Fairy = 0.24375×', () => {
      const result = calculateEffectiveness(['steel', 'fairy'], 'dragon');
      expect(result).toBeCloseTo(0.24375, 5);
    });
  });

  describe('Super Effective Interactions (1.6×)', () => {
    it('Fire should be super effective vs Grass', () => {
      expect(calculateEffectiveness(['grass'], 'fire')).toBe(1.6);
    });

    it('Fire should be super effective vs Ice', () => {
      expect(calculateEffectiveness(['ice'], 'fire')).toBe(1.6);
    });

    it('Fire should be super effective vs Bug', () => {
      expect(calculateEffectiveness(['bug'], 'fire')).toBe(1.6);
    });

    it('Fire should be super effective vs Steel', () => {
      expect(calculateEffectiveness(['steel'], 'fire')).toBe(1.6);
    });

    it('Water should be super effective vs Fire', () => {
      expect(calculateEffectiveness(['fire'], 'water')).toBe(1.6);
    });

    it('Water should be super effective vs Ground', () => {
      expect(calculateEffectiveness(['ground'], 'water')).toBe(1.6);
    });

    it('Water should be super effective vs Rock', () => {
      expect(calculateEffectiveness(['rock'], 'water')).toBe(1.6);
    });

    it('Electric should be super effective vs Water', () => {
      expect(calculateEffectiveness(['water'], 'electric')).toBe(1.6);
    });

    it('Electric should be super effective vs Flying', () => {
      expect(calculateEffectiveness(['flying'], 'electric')).toBe(1.6);
    });

    it('Grass should be super effective vs Water', () => {
      expect(calculateEffectiveness(['water'], 'grass')).toBe(1.6);
    });

    it('Grass should be super effective vs Ground', () => {
      expect(calculateEffectiveness(['ground'], 'grass')).toBe(1.6);
    });

    it('Grass should be super effective vs Rock', () => {
      expect(calculateEffectiveness(['rock'], 'grass')).toBe(1.6);
    });

    it('Ice should be super effective vs Grass', () => {
      expect(calculateEffectiveness(['grass'], 'ice')).toBe(1.6);
    });

    it('Ice should be super effective vs Ground', () => {
      expect(calculateEffectiveness(['ground'], 'ice')).toBe(1.6);
    });

    it('Ice should be super effective vs Flying', () => {
      expect(calculateEffectiveness(['flying'], 'ice')).toBe(1.6);
    });

    it('Ice should be super effective vs Dragon', () => {
      expect(calculateEffectiveness(['dragon'], 'ice')).toBe(1.6);
    });

    it('Fighting should be super effective vs Normal', () => {
      expect(calculateEffectiveness(['normal'], 'fighting')).toBe(1.6);
    });

    it('Fighting should be super effective vs Ice', () => {
      expect(calculateEffectiveness(['ice'], 'fighting')).toBe(1.6);
    });

    it('Fighting should be super effective vs Rock', () => {
      expect(calculateEffectiveness(['rock'], 'fighting')).toBe(1.6);
    });

    it('Fighting should be super effective vs Dark', () => {
      expect(calculateEffectiveness(['dark'], 'fighting')).toBe(1.6);
    });

    it('Fighting should be super effective vs Steel', () => {
      expect(calculateEffectiveness(['steel'], 'fighting')).toBe(1.6);
    });

    it('Poison should be super effective vs Grass', () => {
      expect(calculateEffectiveness(['grass'], 'poison')).toBe(1.6);
    });

    it('Poison should be super effective vs Fairy', () => {
      expect(calculateEffectiveness(['fairy'], 'poison')).toBe(1.6);
    });

    it('Ground should be super effective vs Fire', () => {
      expect(calculateEffectiveness(['fire'], 'ground')).toBe(1.6);
    });

    it('Ground should be super effective vs Electric', () => {
      expect(calculateEffectiveness(['electric'], 'ground')).toBe(1.6);
    });

    it('Ground should be super effective vs Poison', () => {
      expect(calculateEffectiveness(['poison'], 'ground')).toBe(1.6);
    });

    it('Ground should be super effective vs Rock', () => {
      expect(calculateEffectiveness(['rock'], 'ground')).toBe(1.6);
    });

    it('Ground should be super effective vs Steel', () => {
      expect(calculateEffectiveness(['steel'], 'ground')).toBe(1.6);
    });

    it('Flying should be super effective vs Grass', () => {
      expect(calculateEffectiveness(['grass'], 'flying')).toBe(1.6);
    });

    it('Flying should be super effective vs Fighting', () => {
      expect(calculateEffectiveness(['fighting'], 'flying')).toBe(1.6);
    });

    it('Flying should be super effective vs Bug', () => {
      expect(calculateEffectiveness(['bug'], 'flying')).toBe(1.6);
    });

    it('Psychic should be super effective vs Fighting', () => {
      expect(calculateEffectiveness(['fighting'], 'psychic')).toBe(1.6);
    });

    it('Psychic should be super effective vs Poison', () => {
      expect(calculateEffectiveness(['poison'], 'psychic')).toBe(1.6);
    });

    it('Bug should be super effective vs Grass', () => {
      expect(calculateEffectiveness(['grass'], 'bug')).toBe(1.6);
    });

    it('Bug should be super effective vs Psychic', () => {
      expect(calculateEffectiveness(['psychic'], 'bug')).toBe(1.6);
    });

    it('Bug should be super effective vs Dark', () => {
      expect(calculateEffectiveness(['dark'], 'bug')).toBe(1.6);
    });

    it('Rock should be super effective vs Fire', () => {
      expect(calculateEffectiveness(['fire'], 'rock')).toBe(1.6);
    });

    it('Rock should be super effective vs Ice', () => {
      expect(calculateEffectiveness(['ice'], 'rock')).toBe(1.6);
    });

    it('Rock should be super effective vs Flying', () => {
      expect(calculateEffectiveness(['flying'], 'rock')).toBe(1.6);
    });

    it('Rock should be super effective vs Bug', () => {
      expect(calculateEffectiveness(['bug'], 'rock')).toBe(1.6);
    });

    it('Ghost should be super effective vs Psychic', () => {
      expect(calculateEffectiveness(['psychic'], 'ghost')).toBe(1.6);
    });

    it('Ghost should be super effective vs Ghost', () => {
      expect(calculateEffectiveness(['ghost'], 'ghost')).toBe(1.6);
    });

    it('Dragon should be super effective vs Dragon', () => {
      expect(calculateEffectiveness(['dragon'], 'dragon')).toBe(1.6);
    });

    it('Dark should be super effective vs Psychic', () => {
      expect(calculateEffectiveness(['psychic'], 'dark')).toBe(1.6);
    });

    it('Dark should be super effective vs Ghost', () => {
      expect(calculateEffectiveness(['ghost'], 'dark')).toBe(1.6);
    });

    it('Steel should be super effective vs Ice', () => {
      expect(calculateEffectiveness(['ice'], 'steel')).toBe(1.6);
    });

    it('Steel should be super effective vs Rock', () => {
      expect(calculateEffectiveness(['rock'], 'steel')).toBe(1.6);
    });

    it('Steel should be super effective vs Fairy', () => {
      expect(calculateEffectiveness(['fairy'], 'steel')).toBe(1.6);
    });

    it('Fairy should be super effective vs Fighting', () => {
      expect(calculateEffectiveness(['fighting'], 'fairy')).toBe(1.6);
    });

    it('Fairy should be super effective vs Dragon', () => {
      expect(calculateEffectiveness(['dragon'], 'fairy')).toBe(1.6);
    });

    it('Fairy should be super effective vs Dark', () => {
      expect(calculateEffectiveness(['dark'], 'fairy')).toBe(1.6);
    });
  });

  describe('Not Very Effective Interactions (0.625×)', () => {
    it('Fire should be not very effective vs Fire', () => {
      expect(calculateEffectiveness(['fire'], 'fire')).toBe(0.625);
    });

    it('Fire should be not very effective vs Water', () => {
      expect(calculateEffectiveness(['water'], 'fire')).toBe(0.625);
    });

    it('Fire should be not very effective vs Rock', () => {
      expect(calculateEffectiveness(['rock'], 'fire')).toBe(0.625);
    });

    it('Water should be not very effective vs Water', () => {
      expect(calculateEffectiveness(['water'], 'water')).toBe(0.625);
    });

    it('Water should be not very effective vs Grass', () => {
      expect(calculateEffectiveness(['grass'], 'water')).toBe(0.625);
    });

    it('Water should be not very effective vs Dragon', () => {
      expect(calculateEffectiveness(['dragon'], 'water')).toBe(0.625);
    });

    it('Electric should be not very effective vs Electric', () => {
      expect(calculateEffectiveness(['electric'], 'electric')).toBe(0.625);
    });

    it('Electric should be not very effective vs Grass', () => {
      expect(calculateEffectiveness(['grass'], 'electric')).toBe(0.625);
    });

    it('Electric should be not very effective vs Dragon', () => {
      expect(calculateEffectiveness(['dragon'], 'electric')).toBe(0.625);
    });

    it('Grass should resist Fire, Grass, Poison, Flying, Bug, Dragon, Steel', () => {
      expect(calculateEffectiveness(['fire'], 'grass')).toBe(0.625);
      expect(calculateEffectiveness(['grass'], 'grass')).toBe(0.625);
      expect(calculateEffectiveness(['poison'], 'grass')).toBe(0.625);
      expect(calculateEffectiveness(['flying'], 'grass')).toBe(0.625);
      expect(calculateEffectiveness(['bug'], 'grass')).toBe(0.625);
      expect(calculateEffectiveness(['dragon'], 'grass')).toBe(0.625);
      expect(calculateEffectiveness(['steel'], 'grass')).toBe(0.625);
    });

    it('Ice should be not very effective vs Fire, Water, Ice, Steel', () => {
      expect(calculateEffectiveness(['fire'], 'ice')).toBe(0.625);
      expect(calculateEffectiveness(['water'], 'ice')).toBe(0.625);
      expect(calculateEffectiveness(['ice'], 'ice')).toBe(0.625);
      expect(calculateEffectiveness(['steel'], 'ice')).toBe(0.625);
    });

    it('Fighting should resist Poison, Flying, Psychic, Bug, Fairy', () => {
      expect(calculateEffectiveness(['poison'], 'fighting')).toBe(0.625);
      expect(calculateEffectiveness(['flying'], 'fighting')).toBe(0.625);
      expect(calculateEffectiveness(['psychic'], 'fighting')).toBe(0.625);
      expect(calculateEffectiveness(['bug'], 'fighting')).toBe(0.625);
      expect(calculateEffectiveness(['fairy'], 'fighting')).toBe(0.625);
    });

    it('Poison should resist Poison, Ground, Rock, Ghost', () => {
      expect(calculateEffectiveness(['poison'], 'poison')).toBe(0.625);
      expect(calculateEffectiveness(['ground'], 'poison')).toBe(0.625);
      expect(calculateEffectiveness(['rock'], 'poison')).toBe(0.625);
      expect(calculateEffectiveness(['ghost'], 'poison')).toBe(0.625);
    });

    it('Ground should resist Grass, Bug', () => {
      expect(calculateEffectiveness(['grass'], 'ground')).toBe(0.625);
      expect(calculateEffectiveness(['bug'], 'ground')).toBe(0.625);
    });

    it('Flying should resist Electric, Rock, Steel', () => {
      expect(calculateEffectiveness(['electric'], 'flying')).toBe(0.625);
      expect(calculateEffectiveness(['rock'], 'flying')).toBe(0.625);
      expect(calculateEffectiveness(['steel'], 'flying')).toBe(0.625);
    });

    it('Psychic should resist Psychic, Steel', () => {
      expect(calculateEffectiveness(['psychic'], 'psychic')).toBe(0.625);
      expect(calculateEffectiveness(['steel'], 'psychic')).toBe(0.625);
    });

    it('Bug should resist many types', () => {
      expect(calculateEffectiveness(['fire'], 'bug')).toBe(0.625);
      expect(calculateEffectiveness(['fighting'], 'bug')).toBe(0.625);
      expect(calculateEffectiveness(['poison'], 'bug')).toBe(0.625);
      expect(calculateEffectiveness(['flying'], 'bug')).toBe(0.625);
      expect(calculateEffectiveness(['ghost'], 'bug')).toBe(0.625);
      expect(calculateEffectiveness(['steel'], 'bug')).toBe(0.625);
      expect(calculateEffectiveness(['fairy'], 'bug')).toBe(0.625);
    });

    it('Rock should resist Fighting, Ground, Steel', () => {
      expect(calculateEffectiveness(['fighting'], 'rock')).toBe(0.625);
      expect(calculateEffectiveness(['ground'], 'rock')).toBe(0.625);
      expect(calculateEffectiveness(['steel'], 'rock')).toBe(0.625);
    });

    it('Ghost should resist Dark', () => {
      expect(calculateEffectiveness(['dark'], 'ghost')).toBe(0.625);
    });

    it('Dragon should resist Steel', () => {
      expect(calculateEffectiveness(['steel'], 'dragon')).toBe(0.625);
    });

    it('Dark should resist Fighting, Dark, Fairy', () => {
      expect(calculateEffectiveness(['fighting'], 'dark')).toBe(0.625);
      expect(calculateEffectiveness(['dark'], 'dark')).toBe(0.625);
      expect(calculateEffectiveness(['fairy'], 'dark')).toBe(0.625);
    });

    it('Steel should resist Fire, Water, Electric, Steel', () => {
      expect(calculateEffectiveness(['fire'], 'steel')).toBe(0.625);
      expect(calculateEffectiveness(['water'], 'steel')).toBe(0.625);
      expect(calculateEffectiveness(['electric'], 'steel')).toBe(0.625);
      expect(calculateEffectiveness(['steel'], 'steel')).toBe(0.625);
    });

    it('Fairy should resist Fire, Poison, Steel', () => {
      expect(calculateEffectiveness(['fire'], 'fairy')).toBe(0.625);
      expect(calculateEffectiveness(['poison'], 'fairy')).toBe(0.625);
      expect(calculateEffectiveness(['steel'], 'fairy')).toBe(0.625);
    });
  });

  describe('Immune Interactions (0.39×)', () => {
    it('Normal cannot hit Ghost (0.39×)', () => {
      expect(calculateEffectiveness(['ghost'], 'normal')).toBe(0.39);
    });

    it('Electric cannot hit Ground (0.39×)', () => {
      expect(calculateEffectiveness(['ground'], 'electric')).toBe(0.39);
    });

    it('Fighting cannot hit Ghost (0.39×)', () => {
      expect(calculateEffectiveness(['ghost'], 'fighting')).toBe(0.39);
    });

    it('Poison cannot hit Steel (0.39×)', () => {
      expect(calculateEffectiveness(['steel'], 'poison')).toBe(0.39);
    });

    it('Ground cannot hit Flying (0.39×)', () => {
      expect(calculateEffectiveness(['flying'], 'ground')).toBe(0.39);
    });

    it('Psychic cannot hit Dark (0.39×)', () => {
      expect(calculateEffectiveness(['dark'], 'psychic')).toBe(0.39);
    });

    it('Ghost cannot hit Normal (0.39×)', () => {
      expect(calculateEffectiveness(['normal'], 'ghost')).toBe(0.39);
    });

    it('Dragon cannot hit Fairy (0.39×)', () => {
      expect(calculateEffectiveness(['fairy'], 'dragon')).toBe(0.39);
    });
  });

  describe('Dual Type Calculations', () => {
    it('should calculate double super effective (2.56×)', () => {
      // Water vs Fire/Rock
      expect(calculateEffectiveness(['fire', 'rock'], 'water')).toBe(2.56);

      // Ice vs Dragon/Flying
      expect(calculateEffectiveness(['dragon', 'flying'], 'ice')).toBe(2.56);

      // Ground vs Rock/Steel
      expect(calculateEffectiveness(['rock', 'steel'], 'ground')).toBe(2.56);
    });

    it('should calculate SE + NVE = Neutral (1.6×)', () => {
      // Fighting vs Normal/Flying (1.6 × 0.625 = 1.0)
      expect(calculateEffectiveness(['normal', 'flying'], 'fighting')).toBe(
        1.0,
      );
    });

    it('should calculate SE + NVE = Neutral (1.0×)', () => {
      // Fire vs Grass/Water (1.6 × 0.625)
      expect(calculateEffectiveness(['grass', 'water'], 'fire')).toBe(1.0);

      // Fighting vs Normal/Flying (1.6 × 0.625)
      expect(calculateEffectiveness(['normal', 'flying'], 'fighting')).toBe(
        1.0,
      );
    });

    it('should calculate SE + Immune = Resisted (0.624×)', () => {
      // Ground vs Rock/Flying (1.6 × 0.39)
      const result = calculateEffectiveness(['rock', 'flying'], 'ground');
      expect(result).toBeCloseTo(0.624, 3);
    });

    it('should calculate NVE + Immune = Heavy Resist (0.24375×)', () => {
      // Dragon vs Steel/Fairy (0.625 × 0.39)
      const result = calculateEffectiveness(['steel', 'fairy'], 'dragon');
      expect(result).toBeCloseTo(0.24375, 5);
    });

    it('should calculate double resist (0.390625×)', () => {
      // Grass vs Grass/Dragon (0.625 × 0.625)
      const result = calculateEffectiveness(['grass', 'dragon'], 'grass');
      expect(result).toBeCloseTo(0.390625, 6);
    });
  });

  describe('STAB (Same Type Attack Bonus)', () => {
    it('should apply 1.2× STAB when move matches attacker type', () => {
      expect(getSTAB(['fire'], 'fire')).toBe(1.2);
      expect(getSTAB(['water', 'ground'], 'water')).toBe(1.2);
      expect(getSTAB(['water', 'ground'], 'ground')).toBe(1.2);
    });

    it('should not apply STAB when move does not match attacker type', () => {
      expect(getSTAB(['fire'], 'water')).toBe(1.0);
      expect(getSTAB(['water', 'ground'], 'fire')).toBe(1.0);
    });

    it('should calculate total multiplier with STAB', () => {
      // Fire Pokémon using Fire move vs Grass (1.6 × 1.2 = 1.92)
      expect(calculateTotalMultiplier(['fire'], ['grass'], 'fire')).toBe(1.92);

      // Water Pokémon using Water move vs Fire (1.6 × 1.2 = 1.92)
      expect(calculateTotalMultiplier(['water'], ['fire'], 'water')).toBe(1.92);

      // Water Pokémon using Ice move vs Grass (1.6 × 1.0 = 1.6, no STAB)
      expect(calculateTotalMultiplier(['water'], ['grass'], 'ice')).toBe(1.6);
    });
  });

  describe('Effectiveness Categories', () => {
    it('should categorize multipliers correctly', () => {
      expect(getEffectivenessCategory(2.56)).toBe('Double Super Effective');
      expect(getEffectivenessCategory(1.92)).toBe('Super Effective');
      expect(getEffectivenessCategory(1.6)).toBe('Super Effective');
      expect(getEffectivenessCategory(1.2)).toBe('Effective');
      expect(getEffectivenessCategory(1.0)).toBe('Neutral');
      expect(getEffectivenessCategory(0.8)).toBe('Not Very Effective');
      expect(getEffectivenessCategory(0.625)).toBe('Not Very Effective');
      expect(getEffectivenessCategory(0.39)).toBe('Resisted');
      expect(getEffectivenessCategory(0.24375)).toBe('Heavily Resisted');
    });
  });

  describe('Neutral Interactions', () => {
    it('should have neutral effectiveness for unrelated types', () => {
      expect(calculateEffectiveness(['normal'], 'water')).toBe(1.0);
      expect(calculateEffectiveness(['fire'], 'electric')).toBe(1.0);
      expect(calculateEffectiveness(['water'], 'flying')).toBe(1.0);
      expect(calculateEffectiveness(['bug'], 'normal')).toBe(1.0);
    });
  });
});
