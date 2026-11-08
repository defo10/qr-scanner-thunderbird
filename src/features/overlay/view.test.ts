// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { aDecodedCode, anOverlay, codesFrom } from '../../../tests/helpers/builders';

describe('overlay panel', () => {
  it('appears with the first codes event and lists codes in arrival order', () => {
    const overlay = anOverlay();

    overlay.send({ type: 'scan-started', sourceCount: 2 });
    expect(overlay.host()).toBeNull();

    overlay.send(codesFrom('label.png', aDecodedCode({ text: 'FIRST' })));
    overlay.send(codesFrom('scan.png', aDecodedCode({ format: 'QRCode', text: 'SECOND' })));

    expect(overlay.host()).not.toBeNull();
    expect(overlay.entries().map(e => e.textContent)).toEqual([
      'Data Matrix · label.pngFIRSTCopy',
      'QR · scan.pngSECONDCopy',
    ]);
    expect(overlay.text()).toContain('2 codes');
  });

  it('shows a spinner while scanning and removes it when the scan finishes', () => {
    const overlay = anOverlay();

    overlay.send({ type: 'scan-started', sourceCount: 2 }, codesFrom('label.png', aDecodedCode()));
    expect(overlay.root()?.querySelector('[role=status]')?.getAttribute('aria-label')).toBe('Scanning…');

    overlay.send({ type: 'scan-finished' });
    expect(overlay.root()?.querySelector('[role=status]')).toBeNull();
    expect(overlay.text()).toContain('1 code');
  });

  it('never renders a panel for a scan without results', () => {
    const overlay = anOverlay();

    overlay.send({ type: 'scan-started', sourceCount: 3 }, { type: 'scan-finished' });

    expect(overlay.host()).toBeNull();
  });

  it('copies the exact raw text of a GS1 code, including the group separator', async () => {
    const overlay = anOverlay();
    const raw = '01040123456789011725123110ABC123\x1D21XYZ789';
    overlay.send(codesFrom('label.png', aDecodedCode({ text: raw, contentKind: 'GS1', symbologyId: ']d2' })));

    overlay.click('.copy');
    await Promise.resolve();

    expect(overlay.clipboard).toEqual([raw]);
    expect(overlay.root()?.querySelector('.copy')?.textContent).toBe('Copied ✓');
  });

  it('shows a failure on the button when the clipboard rejects the write', async () => {
    const overlay = anOverlay({ clipboardFails: true });
    overlay.send(codesFrom('label.png', aDecodedCode()));

    overlay.click('.copy');
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(overlay.clipboard).toEqual([]);
    expect(overlay.root()?.querySelector('.copy')?.textContent).toBe('Copy failed');
  });

  it('renders a URL as plain text with its host in bold', () => {
    const overlay = anOverlay();

    overlay.send(codesFrom('flyer.png', aDecodedCode({ format: 'QRCode', text: 'https://bank.example@evil.example/login' })));

    const value = overlay.root()?.querySelector('.value');
    expect(value?.querySelector('a')).toBeNull();
    expect(value?.querySelector('b')?.textContent).toBe('evil.example');
    expect(value?.textContent).toBe('https://bank.example@evil.example/login');
  });

  it('renders markup inside a code as literal text', () => {
    const overlay = anOverlay();
    const payload = '<img src=x onerror="alert(1)">';

    overlay.send(codesFrom('label.png', aDecodedCode({ text: payload })));

    expect(overlay.root()?.querySelector('img')).toBeNull();
    expect(overlay.root()?.querySelector('.value')?.textContent).toBe(payload);
  });

  it('minimizes to a badge with the count and restores from it', () => {
    const overlay = anOverlay();
    overlay.send(codesFrom('label.png', aDecodedCode({ text: 'A' }), aDecodedCode({ text: 'B' })));

    overlay.click('.minimize');
    expect(overlay.entries()).toEqual([]);
    expect(overlay.root()?.querySelector('.badge')?.textContent).toBe('▦ 2');

    overlay.click('.badge');
    expect(overlay.entries()).toHaveLength(2);
  });

  it('removes itself on close and stays closed when more codes arrive', () => {
    const overlay = anOverlay();
    overlay.send(codesFrom('label.png', aDecodedCode()));

    overlay.click('.close');
    overlay.send(codesFrom('other.png', aDecodedCode({ text: 'LATER' })));

    expect(overlay.host()).toBeNull();
  });

  it('shows the panel with an error line when a source could not be read', () => {
    const overlay = anOverlay();

    overlay.send({ type: 'source-error', source: { kind: 'attachment', name: 'broken.png', partName: '1.2' }, reason: 'unreadable' });

    expect(overlay.host()).not.toBeNull();
    expect(overlay.root()?.querySelector('.errors')?.textContent).toBe('broken.png — could not be read');
  });
});
