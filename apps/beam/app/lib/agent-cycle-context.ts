/**
 * The cycle route path carries only an id, so the detail page publishes the
 * loaded cycle here and view-screen reads it alongside the URL view state.
 */
import type { CycleStatus } from "./cycle";

export type PublishedCycle = {
  id: string;
  number: number;
  name: string | null;
  state: CycleStatus;
  startsAt: string;
  endsAt: string;
  progress: { completed: number; total: number; percent: number | null };
  teamKey: string;
};

let published: PublishedCycle | null = null;

export function publishCycleContext(cycle: PublishedCycle | null): void {
  published = cycle;
}

export function readCycleContext(cycleId: string): PublishedCycle | null {
  return published?.id === cycleId ? published : null;
}
