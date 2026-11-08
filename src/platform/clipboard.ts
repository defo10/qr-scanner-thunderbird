// - Messages are shown from imap:, mailbox: or news: URLs, which are not
//   secure contexts, so navigator.clipboard is usually missing in the message
//   display script.
// - The fallback runs a "copy" command and puts the text on the clipboard from
//   the copy event. With the clipboardWrite permission this works in content
//   scripts, and unlike copying a selected textarea it keeps the text exactly,
//   control characters included.
// - Must be called from the click handler: the user gesture is needed there.
export function writeClipboardText(text: string, doc: Document = document): Promise<void> {
  const clipboard = doc.defaultView?.isSecureContext ? doc.defaultView.navigator.clipboard : undefined;
  if (!clipboard) return copyWithCommand(text, doc);
  return clipboard.writeText(text).catch(() => copyWithCommand(text, doc));
}

function copyWithCommand(text: string, doc: Document): Promise<void> {
  let written = false;
  const onCopy = (e: ClipboardEvent) => {
    if (!e.clipboardData) return;
    e.clipboardData.setData('text/plain', text);
    e.preventDefault();
    written = true;
  };
  doc.addEventListener('copy', onCopy, true);
  try {
    // Deprecated, but the only clipboard API available outside secure contexts.
    const executed = doc.execCommand('copy');
    return executed && written ? Promise.resolve() : Promise.reject(new Error('copy command was refused'));
  } catch (e) {
    return Promise.reject(e instanceof Error ? e : new Error(String(e)));
  } finally {
    doc.removeEventListener('copy', onCopy, true);
  }
}
