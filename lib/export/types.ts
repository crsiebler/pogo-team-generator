export interface Moveset {
  fastMove: string | null;
  chargedMove1: string | null;
  chargedMove2: string | null;
}

export interface TeamMovesets {
  [speciesId: string]: Moveset;
}
