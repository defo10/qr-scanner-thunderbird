import type { ScanEvent } from '../../shared/port-protocol';
import { initialOverlayState, reduce, type UiAction } from './state';
import { createOverlayView, type OverlayViewDeps } from './view';

export interface Overlay {
  readonly handle: (event: ScanEvent) => void;
  readonly shadowRoot: () => ShadowRoot | null;
}

// The overlay's only mutable state; every change goes through the reducer.
export function mountOverlay(deps: Omit<OverlayViewDeps, 'dispatch'>): Overlay {
  let state = initialOverlayState;
  const dispatch = (e: ScanEvent | UiAction) => {
    state = reduce(state, e);
    view.render(state);
  };
  const view = createOverlayView({ ...deps, dispatch });
  return { handle: dispatch, shadowRoot: () => view.shadowRoot() };
}
