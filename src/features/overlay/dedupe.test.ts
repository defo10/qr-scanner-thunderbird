import { describe, expect, it } from 'vitest';
import { aDecodedCode } from '../../../tests/helpers/builders';
import type { SourceRef } from '../../shared/types';
import { mergeCodes } from './dedupe';

const scanPng: SourceRef = { kind: 'attachment', name: 'scan.png', partName: '1.2' };
const labelPdfPage3: SourceRef = { kind: 'attachment', name: 'label.pdf', partName: '1.3', page: 3 };

describe('mergeCodes', () => {
  it('merges the same Data Matrix from an image and a PDF page into one entry with both sources', () => {
    const dm = aDecodedCode({ format: 'DataMatrix', text: 'SAME-CODE' });

    const afterImage = mergeCodes([], [dm], scanPng);
    const afterPdf = mergeCodes(afterImage, [dm], labelPdfPage3);

    expect(afterPdf).toEqual([{ ...dm, sources: [scanPng, labelPdfPage3] }]);
  });

  it('keeps the same text in QR and in Data Matrix as two entries', () => {
    const entries = mergeCodes(
      [],
      [aDecodedCode({ format: 'QRCode', text: 'SAME-TEXT' }), aDecodedCode({ format: 'DataMatrix', text: 'SAME-TEXT' })],
      scanPng,
    );

    expect(entries.map(e => e.format)).toEqual(['QRCode', 'DataMatrix']);
  });

  it('records a code found twice in one image once, with one source', () => {
    const dm = aDecodedCode({ text: 'TWICE' });

    const entries = mergeCodes([], [dm, dm], scanPng);

    expect(entries).toEqual([{ ...dm, sources: [scanPng] }]);
  });

  it('keeps first-seen order when a later source repeats an earlier code', () => {
    const a = aDecodedCode({ text: 'A' });
    const b = aDecodedCode({ text: 'B' });

    const entries = mergeCodes(mergeCodes([], [a, b], scanPng), [b, a], labelPdfPage3);

    expect(entries.map(e => [e.text, e.sources.length])).toEqual([['A', 2], ['B', 2]]);
  });
});
