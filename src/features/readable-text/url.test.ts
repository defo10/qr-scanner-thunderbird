import { describe, expect, it } from 'vitest';
import { splitUrl } from './url';

describe('splitUrl', () => {
  it('isolates the host of a plain URL', () => {
    expect(splitUrl('https://evil.example/login?x=1')).toEqual({ beforeHost: 'https://', host: 'evil.example', afterHost: '/login?x=1' });
  });

  it('treats the part after the last @ as the host, not the userinfo', () => {
    expect(splitUrl('http://bank.example@evil.example:8080/')).toEqual({
      beforeHost: 'http://bank.example@', host: 'evil.example', afterHost: ':8080/',
    });
  });

  it('accepts an uppercase scheme', () => {
    expect(splitUrl('HTTPS://EXAMPLE.ORG')?.host).toBe('EXAMPLE.ORG');
  });

  it('returns null for text that is not an http(s) URL', () => {
    expect(splitUrl('mailto:someone@example.org')).toBeNull();
    expect(splitUrl('see https://example.org')).toBeNull();
  });
});
