/**
 * Corpus-level validation, run once at boot after loading. Per-field shape is
 * already enforced in the loader; this catches cross-record problems:
 * duplicate ids and dangling category references. Throws on the first failure
 * so a broken corpus fails the boot loudly.
 */

import type { LoadedContent } from './types';

export function validateCorpus(content: LoadedContent): void {
  const errors: string[] = [];

  assertUniqueIds(content.herbs.all, 'herb', errors);
  assertUniqueIds(content.combinations.all, 'combination', errors);
  assertUniqueIds(content.categories.all, 'category', errors);
  assertUniqueIds(content.tips.all, 'tip', errors);

  // Every herb's category must resolve to a real category.
  for (const herb of content.herbs.all) {
    if (!content.categories.byId.has(herb.category)) {
      errors.push(`herb "${herb.id}" references unknown category "${herb.category}"`);
    }
  }

  // A combination must carry SOME substance — composition, verbatim source text,
  // or indications (ADR 006 relaxes the old non-empty-composition rule, since some
  // formulas publish no ingredient list). Each cross-referenced member id must
  // still resolve to a real herb (ADR 005).
  for (const combination of content.combinations.all) {
    const hasSubstance =
      combination.composition.length > 0 ||
      (combination.sourceText?.trim().length ?? 0) > 0 ||
      (combination.indications?.length ?? 0) > 0;
    if (!hasSubstance) {
      errors.push(
        `combination "${combination.id}" has no composition, source text, or indications`,
      );
    }
    for (const memberId of combination.members ?? []) {
      if (!content.herbs.byId.has(memberId)) {
        errors.push(`combination "${combination.id}" references unknown herb member "${memberId}"`);
      }
    }
  }
  // A tip may scope itself to a category; if it does, it must resolve.
  for (const tip of content.tips.all) {
    if (tip.category !== undefined && !content.categories.byId.has(tip.category)) {
      errors.push(`tip "${tip.id}" references unknown category "${tip.category}"`);
    }
  }

  if (errors.length > 0) {
    throw new Error(`Content validation failed:\n  - ${errors.join('\n  - ')}`);
  }
}

function assertUniqueIds(items: readonly { id: string }[], label: string, errors: string[]): void {
  const seen = new Set<string>();
  for (const item of items) {
    if (seen.has(item.id)) {
      errors.push(`duplicate ${label} id "${item.id}"`);
    }
    seen.add(item.id);
  }
}
