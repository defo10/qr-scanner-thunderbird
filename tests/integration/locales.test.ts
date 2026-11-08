import { readdirSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const catalog = (locale: string): Record<string, { message: string }> =>
  JSON.parse(readFileSync(join(root, 'static', '_locales', locale, 'messages.json'), 'utf8')) as Record<string, { message: string }>;

const en = catalog('en');
const de = catalog('de');

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return entry.name.endsWith('.ts') && !entry.name.endsWith('.test.ts') ? [path] : [];
  });

const placeholders = (message: string) => [...message.matchAll(/\$\d/g)].map(m => m[0]).sort();

describe('locales', () => {
  it('has the same keys in German and English', () => {
    expect(Object.keys(de).sort()).toEqual(Object.keys(en).sort());
  });

  it('uses the same placeholders in both languages', () => {
    for (const key of Object.keys(en)) {
      expect({ key, placeholders: placeholders(de[key]?.message ?? '') }).toEqual({ key, placeholders: placeholders(en[key]!.message) });
    }
  });

  it('defines every message key the code uses', () => {
    const used = sourceFiles(join(root, 'src')).flatMap(file =>
      [...readFileSync(file, 'utf8').matchAll(/\bt\(\s*'([A-Za-z0-9_]+)'/g)].map(m => m[1]!));

    expect(used.length).toBeGreaterThan(20);
    expect(used.filter(key => !(key in en))).toEqual([]);
  });

  it('defines every message the manifest refers to', () => {
    const manifest = readFileSync(join(root, 'static', 'manifest.json'), 'utf8');
    const used = [...manifest.matchAll(/__MSG_([A-Za-z0-9_]+)__/g)].map(m => m[1]!);

    expect(used).toEqual(expect.arrayContaining(['extensionName', 'extensionDescription']));
    expect(used.filter(key => !(key in en) || !(key in de))).toEqual([]);
  });
});
