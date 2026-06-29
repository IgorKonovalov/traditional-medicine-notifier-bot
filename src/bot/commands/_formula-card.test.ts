import { describe, expect, it } from 'vitest';

import type { Combination, Herb, LoadedContent } from '../../content/types';
import { TELEGRAM_LIMIT } from '../render/markdown';

import { formulaMemberLinks, parseOriginalNames, renderFormula } from './_formula-card';

/**
 * A formula carrying every verbose field: the structured ones
 * (indications/traditionalUse/dosingNotes) are surfaced as a live-review surface
 * (ADR 006), while the raw `sourceText`/`body` must never leak. One composition
 * entry carries a Latin parenthetical so the `<code>` wrap is exercised.
 */
function verboseFormula(overrides: Partial<Combination> = {}): Combination {
  return {
    id: 'tib-formula-agar-8',
    tradition: 'tibetan',
    nameRu: 'Агар-8',
    nameOriginal: 'A gar 8',
    nature: 'слегка прохладная',
    aliases: ['Агар 8'],
    composition: ['миробалан хебула (Terminalia chebula)', 'мускатный орех'],
    members: ['tib-haritaki'],
    themes: ['традиционно связывают с поддержкой нервной системы'],
    indications: ['ЖАР-СЕРДЦА-СЕКРЕТ', 'бессонница'],
    traditionalUse: ['ТРАД-ИСПОЛЬЗОВАНИЕ-СЕКРЕТ'],
    dosingNotes: ['ДОЗИРОВКА-СЕКРЕТ по 0,2 г'],
    sourceText: 'ПОЛНЫЙ-ИСХОДНЫЙ-ТЕКСТ-СЕКРЕТ',
    cautions: ['возможна индивидуальная непереносимость'],
    tags: ['сердце'],
    sources: ['https://manla.ru/herbs/'],
    body: 'СЫРОЙ-BODY-СЕКРЕТ из источника.',
    ...overrides,
  };
}

/** True when every HTML tag in `s` is properly opened and closed (LIFO). */
function tagsBalanced(s: string): boolean {
  const stack: string[] = [];
  const re = /<(\/?)([a-z][a-z0-9-]*)[^>]*>/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(s)) !== null) {
    if (m[0].endsWith('/>')) continue;
    const name = m[2]!.toLowerCase();
    if (m[1] === '/') {
      if (stack.pop() !== name) return false;
    } else {
      stack.push(name);
    }
  }
  return stack.length === 0;
}

describe('renderFormula — rich HTML card (ADR 011)', () => {
  it('renders the name bold and the original-names sub-line in italics', () => {
    const out = renderFormula(verboseFormula());
    expect(out).toContain('<b>Агар-8</b>');
    expect(out).toContain('<i>A gar 8</i>'); // verbatim fallback, italic
  });

  it('surfaces nature, a bulleted composition, the Latin code-wrap and cautions', () => {
    const out = renderFormula(verboseFormula());
    expect(out).toContain('слегка прохладная');
    expect(out).toContain('• миробалан хебула (<code>Terminalia chebula</code>)');
    expect(out).toContain('• мускатный орех');
    expect(out).toContain('<b>Предостережения:</b>');
    expect(out).toContain('возможна индивидуальная непереносимость');
  });

  it('surfaces the structured verbose fields, folding long ones into expandable quotes', () => {
    const out = renderFormula(verboseFormula());
    expect(out).toContain('<b>Показания:</b>');
    expect(out).toContain('ЖАР-СЕРДЦА-СЕКРЕТ');
    // Label then the quote on the next line with NO leading indentation.
    expect(out).toContain(
      '<b>Применение:</b>\n<blockquote expandable>ТРАД-ИСПОЛЬЗОВАНИЕ-СЕКРЕТ</blockquote>',
    );
    expect(out).toContain(
      '<b>Приём:</b>\n<blockquote expandable>ДОЗИРОВКА-СЕКРЕТ по 0,2 г</blockquote>',
    );
    expect(out).not.toMatch(/\n +<blockquote/); // no baked-in source indent
  });

  it('never surfaces the raw sourceText or the markdown body (ADR 006)', () => {
    const out = renderFormula(verboseFormula());
    for (const secret of ['ПОЛНЫЙ-ИСХОДНЫЙ-ТЕКСТ-СЕКРЕТ', 'СЫРОЙ-BODY-СЕКРЕТ']) {
      expect(out).not.toContain(secret);
    }
  });

  it('appends the disclaimer in a blockquote, last and never truncated', () => {
    const out = renderFormula(verboseFormula());
    expect(out).toContain('проконсультируйтесь с врачом.');
    expect(out.endsWith('</blockquote>')).toBe(true);
    expect(tagsBalanced(out)).toBe(true);
  });

  it('omits optional sections cleanly (no nature, no verbose fields)', () => {
    const out = renderFormula(
      verboseFormula({
        nameOriginal: undefined,
        nature: undefined,
        indications: undefined,
        traditionalUse: undefined,
        dosingNotes: undefined,
      }),
    );
    expect(out).toContain('<b>Агар-8</b>');
    expect(out).not.toContain('Показания:');
    expect(out).not.toContain('Применение:');
    expect(tagsBalanced(out)).toBe(true);
  });

  it('escapes HTML metacharacters in every interpolated field (ADR 011)', () => {
    const out = renderFormula(
      verboseFormula({
        nameRu: 'Тест <b> & >',
        composition: ['ингредиент <x> & <y>'],
        cautions: ['осторожно: a < b & c > d'],
      }),
    );
    expect(out).toContain('Тест &lt;b&gt; &amp; &gt;');
    expect(out).toContain('ингредиент &lt;x&gt; &amp; &lt;y&gt;');
    expect(out).toContain('a &lt; b &amp; c &gt; d');
    // The injected angle brackets must not survive as real tags.
    expect(out).not.toContain('<x>');
    expect(out).not.toContain('<y>');
    expect(tagsBalanced(out)).toBe(true);
  });

  it('produces valid, tag-closed HTML under the limit even when oversized', () => {
    const out = renderFormula(verboseFormula({ traditionalUse: ['x'.repeat(6000)] }));
    expect(out.length).toBeLessThanOrEqual(TELEGRAM_LIMIT);
    expect(tagsBalanced(out)).toBe(true);
    expect(out.endsWith('</blockquote>')).toBe(true);
    expect(out).toContain('проконсультируйтесь с врачом.');
  });
});

describe('parseOriginalNames', () => {
  it('returns a non-matching simple string verbatim', () => {
    expect(parseOriginalNames('A gar 8')).toBe('A gar 8');
    expect(parseOriginalNames('Ширу / Shiru')).toBe('Ширу / Shiru');
  });

  it('compacts a labelled multi-script string to abbreviated parts', () => {
    expect(parseOriginalNames('Монгольское: Гагал 19; тибетское: Ко-ла-бчу-бду; Kola-19')).toBe(
      'Монг.: Гагал 19 · Тиб.: Ко-ла-бчу-бду · Kola-19',
    );
  });

  it('keeps the verbatim string when no segment carries a known label', () => {
    expect(parseOriginalNames('Сороло 4 / Сроло 4')).toBe('Сороло 4 / Сроло 4');
  });
});

describe('formulaMemberLinks', () => {
  function herb(id: string, nameRu: string): Herb {
    return {
      id,
      tradition: 'tibetan',
      category: 'digestive-herbs',
      nameRu,
      properties: [],
      uses: [],
      cautions: [],
      tags: [],
      body: '',
    };
  }

  it('resolves member ids to herb cross-links and drops unresolved ones', () => {
    const herbs = [herb('tib-haritaki', 'Миробалан хебула')];
    const content = {
      herbs: { all: herbs, byId: new Map(herbs.map((h) => [h.id, h])) },
    } as unknown as Pick<LoadedContent, 'herbs'>;
    const formula = { ...verboseFormula(), members: ['tib-haritaki', 'tib-missing'] };

    expect(formulaMemberLinks(formula, content)).toEqual([
      { id: 'tib-haritaki', nameRu: 'Миробалан хебула' },
    ]);
  });
});
