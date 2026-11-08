// Needs the clipboardWrite permission, or a user gesture in the calling context.
export function writeClipboardText(text: string): Promise<void> {
  return navigator.clipboard.writeText(text);
}
