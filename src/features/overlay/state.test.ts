import { describe, expect, it } from 'vitest';
import { aDecodedCode, codesFrom } from '../../../tests/helpers/builders';
import { initialOverlayState, isVisible, reduce } from './state';

describe('overlay state', () => {
  it('stays invisible until the first result arrives', () => {
    const started = reduce(initialOverlayState, { type: 'scan-started', sourceCount: 1 });

    const withCode = reduce(started, codesFrom('label.png', aDecodedCode()));

    expect(isVisible(started)).toBe(false);
    expect(isVisible(withCode)).toBe(true);
    expect(withCode.phase).toBe('scanning');
  });

  it('turns every decoded code into an entry carrying its source', () => {
    const state = reduce(initialOverlayState, codesFrom('label.png', aDecodedCode({ text: 'A' }), aDecodedCode({ text: 'B' })));

    expect(state.entries.map(e => [e.text, e.sources])).toEqual([
      ['A', [{ kind: 'attachment', name: 'label.png', partName: '1.2' }]],
      ['B', [{ kind: 'attachment', name: 'label.png', partName: '1.2' }]],
    ]);
  });

  it('does not change the previous state', () => {
    const before = initialOverlayState;

    reduce(before, codesFrom('label.png', aDecodedCode()));

    expect(before.entries).toEqual([]);
  });
});
