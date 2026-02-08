import { Badge } from '@/components/atoms';

interface TypeBadgeProps {
  type: string;
}

type PokemonType =
  | 'normal'
  | 'fire'
  | 'water'
  | 'electric'
  | 'grass'
  | 'ice'
  | 'fighting'
  | 'poison'
  | 'ground'
  | 'flying'
  | 'psychic'
  | 'bug'
  | 'rock'
  | 'ghost'
  | 'dragon'
  | 'dark'
  | 'steel'
  | 'fairy';

export function TypeBadge({ type }: TypeBadgeProps) {
  const color = type.toLowerCase() as PokemonType;
  return <Badge color={color}>{type}</Badge>;
}
