# Manual QA checklist

There are no automated end-to-end tests. Before a release, run this list in Thunderbird 128 ESR and in the current Thunderbird release, on macOS, Windows and Linux where possible.

Test material: the images in `tests/fixtures/images/` and the PDFs in `tests/fixtures/pdf/`. Send them to yourself as attachments, or embed images in an HTML mail.

Record the Thunderbird version, OS and result for each item.

## Scanning

1. A mail with a PNG Data Matrix attachment (`datamatrix-plain.png`) shows the panel at the top left within about 1 s. Copy pastes the exact string.
2. A GS1 Data Matrix (`datamatrix-gs1.png`) shows `(01)04012345678901(17)251231(10)ABC123(21)XYZ789`. Copy pastes the raw string including the GS character (check in a hex-aware editor: `1D` before `21`). Copy as HRI pastes the bracketed form.
3. A binary Data Matrix (`datamatrix-binary.png`) shows `AAH/gMhhYmM=` with a "binary" tag, and Copy pastes the same Base64.
4. An HTML mail with an inline `cid:` QR code, and one with a `data:` URI QR code, are both decoded and labelled "inline image".
5. A mail with a remote image (`<img src="https://…">`) triggers no network request (check the network monitor of the Developer Toolbox, or work offline).
6. A multi-page PDF label (`mixed-3-pages.pdf`, vector Data Matrix) shows codes per page (`… · p.1`, `… · p.3`) as they stream in.
7. `pages-25.pdf` shows "only first 20 of 25 pages scanned". `encrypted.pdf` shows "password-protected PDF, not scanned". `truncated.pdf` shows "could not be read".
8. A 15 MB attachment shows "skipped (15 MB > 10 MB limit)". After raising the limit to 20 in the settings and reopening the mail, it is scanned.
9. The same image attached twice (or attached and embedded inline) appears once, with "+1 more" and both sources in the tooltip.

## Performance

10. Switching quickly between 10 messages with PDFs causes no CPU spike after the switching stops, and the panel shows only the current mail's codes.
11. Arrowing through 10 mails with photo and PDF attachments but no codes: no visible lag in the thread pane, and CPU (Activity Monitor / Task Manager) settles within a second of stopping.
12. Reopening a mail that was already scanned shows its codes immediately (session cache).

## Panel

13. Minimize shows a badge "▦ N"; clicking it restores the panel. Close hides it; the next mail shows the panel again.
14. A code containing markup (e.g. a QR with `<img src=x onerror=alert(1)>`) shows the literal text.
15. A URL code is not clickable and its host is bold; for `https://bank.example@evil.example/` the bold part is `evil.example`.
16. Dark theme: the panel and the settings page are legible in both light and dark Thunderbird themes.
17. Messages without codes never show a panel, not even briefly.

## Settings and modes

18. With automatic scanning off, nothing happens on display; the "Scan for codes" toolbar button scans the message. With automatic scanning on, the button is disabled.
19. Switching off a format (e.g. QR) hides codes of that format on the next scan; the last enabled format cannot be switched off.
20. Out-of-range limits are flagged while typing and clamped when leaving the field; "Reset to defaults" restores all settings.
21. German UI: with Thunderbird in German, the panel, error lines, toolbar button and settings page are in German.

## Special cases

22. Mails in the Junk folder, and mails marked as junk, show no panel.
23. Selecting several messages shows no panel.
24. An OpenPGP- or S/MIME-encrypted mail with an image attachment is either scanned or shows "could not be read", and never fails silently.
25. Offline mode: every scenario above still works.

## Not yet confirmed in a real Thunderbird

The automated tests run in Node, so these behaviors have only been verified there. Check them explicitly:

- pdf.js running inside the scanner worker (items 6–7).
- `messages.getAttachmentFile` returning inline (`cid:`) parts (item 4). If it rejects them, the image shows "could not be read".
- `storage.session` replay (item 12) and the message display action (item 18).
