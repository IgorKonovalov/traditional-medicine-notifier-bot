/**
 * Pure herb↔formula cross-link builder (Plan 009). Derives the reverse map
 * (`herb id → formula ids`) and the forward map (`formula id → member-herb ids`)
 * from the loaded combinations. No Node, no DB — `loader.ts` calls this at boot
 * and surfaces the result on `LoadedContent.crossLinks`.
 *
 * Member ids are validated to resolve to a `Herb` by `validateCorpus`, so the
 * reverse map never points at a non-existent herb. Both maps are sparse: a herb
 * that appears in no formula is absent (callers read `.get(id) ?? []`).
 */

import type { Combination, CrossLinks } from './types';

/**
 * Build the cross-link maps from combinations in their (deterministic) corpus
 * order, so each herb's formula list and each formula's member list are stable
 * across runs and platforms.
 */
export function buildCrossLinks(combinations: readonly Combination[]): CrossLinks {
  const formulasByHerb = new Map<string, string[]>();
  const herbsByFormula = new Map<string, readonly string[]>();

  for (const combination of combinations) {
    const members = combination.members ?? [];
    herbsByFormula.set(combination.id, members);
    for (const herbId of members) {
      const list = formulasByHerb.get(herbId);
      if (list === undefined) formulasByHerb.set(herbId, [combination.id]);
      else list.push(combination.id);
    }
  }

  return { formulasByHerb, herbsByFormula };
}
