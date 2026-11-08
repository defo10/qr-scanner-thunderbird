import { Window } from 'happy-dom';
import { describe, expect, it } from 'vitest';
import { findDataUriImages } from './find-data-uris';

const parser = new new Window().DOMParser() as unknown as DOMParser;

describe('findDataUriImages', () => {
  it('decodes base64 and percent-encoded data URIs of raster images', () => {
    const html = '<img src="data:image/png;base64,iVBORw0K"><img src="data:image/gif,GIF89a%01">';

    const found = findDataUriImages(html, parser);

    expect(found.map(f => [f.index, f.mime, [...f.bytes]])).toEqual([
      [0, 'image/png', [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]],
      [1, 'image/gif', [...new TextEncoder().encode('GIF89a'), 0x01]],
    ]);
  });

  it('stops after the configured number of data URIs', () => {
    const html = Array.from({ length: 5 }, () => '<img src="data:image/png;base64,AAAA">').join('');

    expect(findDataUriImages(html, parser, 3)).toHaveLength(3);
  });

  it('skips malformed base64 instead of failing', () => {
    const html = '<img src="data:image/png;base64,@@@"><img src="data:image/png;base64,AAAA">';

    expect(findDataUriImages(html, parser).map(f => f.index)).toEqual([1]);
  });
});
