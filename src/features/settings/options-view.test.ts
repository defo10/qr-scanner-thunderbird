// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { englishTranslate } from '../../../tests/helpers/i18n';
import { mountOptions } from './options-view';
import { DEFAULT_SETTINGS, type Settings } from './schema';

const flush = () => new Promise(resolve => setTimeout(resolve, 0));

function anOptionsPage(initial: Settings = DEFAULT_SETTINGS) {
  const doc = document.implementation.createHTMLDocument('options');
  const root = doc.createElement('main');
  doc.body.append(root);
  const saved: Settings[] = [];
  mountOptions(root, { document: doc, t: englishTranslate, initial, save: s => { saved.push(s); return Promise.resolve(); } });
  const checkbox = (label: string) =>
    [...root.querySelectorAll('label')].find(l => l.textContent?.trim() === label)?.querySelector('input') as HTMLInputElement;
  const numberInput = (name: string) => root.querySelector(`input[name="${name}"]`) as HTMLInputElement;
  return { root, saved, checkbox, numberInput, text: () => root.textContent ?? '' };
}

describe('options page', () => {
  it('shows the current settings', () => {
    const page = anOptionsPage({ ...DEFAULT_SETTINGS, scanPdfs: false, maxAttachmentMB: 25 });

    expect(page.checkbox('PDF attachments').checked).toBe(false);
    expect(page.checkbox('Image attachments').checked).toBe(true);
    expect(page.numberInput('maxAttachmentMB').value).toBe('25');
  });

  it('saves a toggle as soon as it changes and confirms it', async () => {
    const page = anOptionsPage();

    page.checkbox('PDF attachments').click();
    await flush();

    expect(page.saved).toEqual([{ ...DEFAULT_SETTINGS, scanPdfs: false }]);
    expect(page.root.querySelector('[role=status]')?.textContent).toBe('Saved');
  });

  it('refuses to disable the last remaining format', async () => {
    const page = anOptionsPage({ ...DEFAULT_SETTINGS, formats: ['QRCode'] });

    page.checkbox('QR').click();
    await flush();

    expect(page.checkbox('QR').checked).toBe(true);
    expect(page.saved).toEqual([]);
    expect(page.text()).toContain('At least one format must stay enabled.');
  });

  it('flags an out-of-range number while typing and clamps it when the field is left', async () => {
    const page = anOptionsPage();
    const field = page.numberInput('maxAttachmentMB');

    field.value = '0';
    field.dispatchEvent(new Event('input'));
    expect(field.getAttribute('aria-invalid')).toBe('true');
    expect(page.text()).toContain('Enter a whole number from 1 to 100.');

    field.dispatchEvent(new Event('change'));
    await flush();
    expect(field.value).toBe('1');
    expect(page.saved.at(-1)?.maxAttachmentMB).toBe(1);
    expect(page.text()).not.toContain('Enter a whole number');
  });

  it('resets every field to the defaults', async () => {
    const page = anOptionsPage({ ...DEFAULT_SETTINGS, autoScan: false, formats: ['Aztec'], maxPdfPages: 5 });

    (page.root.querySelector('button') as HTMLButtonElement).click();
    await flush();

    expect(page.saved).toEqual([DEFAULT_SETTINGS]);
    expect(page.checkbox('Scan messages automatically when they are displayed').checked).toBe(true);
    expect(page.checkbox('Data Matrix').checked).toBe(true);
    expect(page.numberInput('maxPdfPages').value).toBe('20');
  });
});
