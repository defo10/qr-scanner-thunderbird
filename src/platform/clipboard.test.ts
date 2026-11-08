// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest';
import { writeClipboardText } from './clipboard';

/** A document that is not a secure context and answers the copy command like a browser would. */
function aMessageDocument(options: { commandAllowed: boolean }) {
  const doc = document.implementation.createHTMLDocument('message');
  const clipboard = new DataTransfer();
  Object.defineProperty(doc, 'defaultView', { value: { isSecureContext: false } });
  doc.execCommand = (command: string) => {
    if (command !== 'copy' || !options.commandAllowed) return false;
    doc.dispatchEvent(new ClipboardEvent('copy', { clipboardData: clipboard, cancelable: true }));
    return true;
  };
  return { doc, clipboardText: () => clipboard.getData('text/plain') };
}

describe('writeClipboardText outside a secure context', () => {
  it('puts the exact text, control characters included, on the clipboard via the copy command', async () => {
    const { doc, clipboardText } = aMessageDocument({ commandAllowed: true });
    const raw = '01040123456789011725123110ABC123\x1D21XYZ789';

    await writeClipboardText(raw, doc);

    expect(clipboardText()).toBe(raw);
  });

  it('rejects when the copy command is refused', async () => {
    const { doc } = aMessageDocument({ commandAllowed: false });

    await expect(writeClipboardText('text', doc)).rejects.toThrow('copy command was refused');
  });
});
