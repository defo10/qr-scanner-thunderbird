// Lives inside the closed shadow root: the mail's CSS cannot reach the panel
// and the panel's CSS cannot leak into the mail.
export const overlayStyles = `
:host { all: initial; }
.panel, .badge {
  --fg: #1f2328; --muted: #59636e; --bg: #ffffff; --border: #d1d9e0; --hover: #eff2f5; --accent: #0969da;
  font: 13px/1.4 system-ui, -apple-system, "Segoe UI", sans-serif;
  color: var(--fg);
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 8px;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.18);
}
@media (prefers-color-scheme: dark) {
  .panel, .badge {
    --fg: #e6edf3; --muted: #9198a1; --bg: #1c2128; --border: #3d444d; --hover: #262c36; --accent: #4493f8;
  }
}
.panel {
  display: flex;
  flex-direction: column;
  max-width: min(480px, 90vw);
  max-height: 40vh;
  overflow: hidden;
}
header {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 4px 4px 4px 10px;
  border-bottom: 1px solid var(--border);
}
.count { flex: 1; font-weight: 600; }
button {
  font: inherit;
  color: inherit;
  background: transparent;
  border: 1px solid transparent;
  border-radius: 4px;
  padding: 2px 8px;
  cursor: pointer;
}
button:hover { background: var(--hover); }
button:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
.spinner {
  width: 12px;
  height: 12px;
  border: 2px solid var(--border);
  border-top-color: var(--accent);
  border-radius: 50%;
  animation: spin 0.8s linear infinite;
}
@keyframes spin { to { transform: rotate(360deg); } }
.list, .errors { list-style: none; margin: 0; padding: 0; overflow: auto; }
.entry {
  display: grid;
  grid-template-columns: 1fr auto;
  gap: 2px 8px;
  padding: 6px 10px;
  border-bottom: 1px solid var(--border);
}
.meta { font-size: 11px; color: var(--muted); }
.value {
  font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
  white-space: pre-wrap;
  overflow-wrap: anywhere;
}
.value b { font-weight: 700; }
.actions {
  grid-column: 2;
  grid-row: 1 / span 2;
  align-self: center;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.copy { border-color: var(--border); white-space: nowrap; }
.tag {
  padding: 0 4px;
  border: 1px solid var(--border);
  border-radius: 3px;
  font-size: 10px;
  text-transform: uppercase;
}
.errors { padding: 4px 10px 6px; font-size: 11px; color: var(--muted); }
.badge { padding: 4px 10px; font-weight: 600; }
`;
