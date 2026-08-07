import type { MovesetAcquisitionRequirements } from '@/lib/types';

/** Eligible acquisition metadata keyed by canonical roster species ID. */
export type TeamAcquisitionRequirements = Readonly<
  Record<string, MovesetAcquisitionRequirements>
>;
