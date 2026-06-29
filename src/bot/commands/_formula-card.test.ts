import { describe, expect, it } from 'vitest';

import type { Combination, Herb, LoadedContent } from '../../content/types';

import { formulaMemberLinks, renderFormula } from './_formula-card';

/**
 * A formula carrying every verbose field: the structured ones
 * (indications/traditionalUse/dosingNotes) are now surfaced, while the raw
 * `sourceText`/`body` must never leak.
 */
function verboseFormula(): Combination {
  return {
    id: 'tib-formula-agar-8',
    tradition: 'tibetan',
    nameRu: 'Агар-8',
    nameOriginal: 'A gar 8',
    nature: 'слегка прохладная',
    aliases: ['Агар 8'],
    composition: ['миробалан хебула', 'мускатный орех'],
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
  };
}

describe('renderFormula — surfaces structured verbose fields, never the raw body', () => {
  it('surfaces name(s), nature, composition, themes and cautions', () => {
    const out = renderFormula(verboseFormula());
    expect(out).toContain('Агар-8');
    expect(out).toContain('A gar 8');
    expect(out).toContain('слегка прохладная');
    expect(out).toContain('Состав: миробалан хебула, мускатный орех');
    expect(out).toContain('традиционно связывают с поддержкой нервной системы');
    expect(out).toContain('Предостережения: возможна индивидуальная непереносимость');
  });

  it('surfaces the structured verbose fields with their labels (live-review surface)', () => {
    const out = renderFormula(verboseFormula());
    expect(out).toContain('Показания:');
    expect(out).toContain('ЖАР-СЕРДЦА-СЕКРЕТ');
    expect(out).toContain('Применение:');
    expect(out).toContain('ТРАД-ИСПОЛЬЗОВАНИЕ-СЕКРЕТ');
    expect(out).toContain('Приём:');
    expect(out).toContain('ДОЗИРОВКА-СЕКРЕТ');
  });

  it('never surfaces the raw sourceText or the markdown body (ADR 006)', () => {
    const out = renderFormula(verboseFormula());
    for (const secret of ['ПОЛНЫЙ-ИСХОДНЫЙ-ТЕКСТ-СЕКРЕТ', 'СЫРОЙ-BODY-СЕКРЕТ']) {
      expect(out).not.toContain(secret);
    }
  });

  it('always ends with the render-time disclaimer', () => {
    expect(renderFormula(verboseFormula()).endsWith('консультируйтесь с врачом.')).toBe(true);
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
