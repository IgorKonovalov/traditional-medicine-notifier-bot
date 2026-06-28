import { describe, expect, it } from 'vitest';

import { backState, clampPage } from './library';

describe('clampPage', () => {
  it('clamps a too-high page to the last page (no wrap past the end)', () => {
    expect(clampPage(99, 20, 8)).toEqual({ page: 2, pageCount: 3 });
  });

  it('clamps a negative page to the first page (no wrap past the start)', () => {
    expect(clampPage(-5, 20, 8)).toEqual({ page: 0, pageCount: 3 });
  });

  it('treats an empty list as a single page', () => {
    expect(clampPage(0, 0, 8)).toEqual({ page: 0, pageCount: 1 });
  });

  it('keeps an in-range page unchanged', () => {
    expect(clampPage(1, 20, 8)).toEqual({ page: 1, pageCount: 3 });
  });
});

describe('backState — library navigation never wraps or dead-ends', () => {
  it('card reached via a tradition list returns to that list with its page', () => {
    expect(backState({ screen: 'card', tradition: 'tibetan', page: 2, herbId: 'h' })).toEqual({
      screen: 'list',
      tradition: 'tibetan',
      page: 2,
    });
  });

  it('card reached via a category list returns to that list', () => {
    expect(
      backState({ screen: 'card', category: 'digestive-herbs', page: 1, herbId: 'h' }),
    ).toEqual({ screen: 'list', category: 'digestive-herbs', page: 1 });
  });

  it('a context-free card (notification deep link) returns to the hub', () => {
    expect(backState({ screen: 'card', page: 0, herbId: 'h' })).toEqual({ screen: 'hub', page: 0 });
  });

  it('a tradition list returns to the tradition picker', () => {
    expect(backState({ screen: 'list', tradition: 'chinese', page: 3 })).toEqual({
      screen: 'pick-tradition',
      page: 0,
    });
  });

  it('a category list returns to the category picker', () => {
    expect(backState({ screen: 'list', category: 'digestive-herbs', page: 0 })).toEqual({
      screen: 'pick-category',
      page: 0,
    });
  });

  it('either picker returns to the herbs sub-menu', () => {
    expect(backState({ screen: 'pick-tradition', page: 0 })).toEqual({ screen: 'herbs', page: 0 });
    expect(backState({ screen: 'pick-category', page: 0 })).toEqual({ screen: 'herbs', page: 0 });
  });

  it('the herbs sub-menu and the tips leaf return to the hub', () => {
    expect(backState({ screen: 'herbs', page: 0 })).toEqual({ screen: 'hub', page: 0 });
    expect(backState({ screen: 'tips', page: 0 })).toEqual({ screen: 'hub', page: 0 });
  });
});
