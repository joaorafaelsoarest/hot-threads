import { parseThreadUrl } from '../background/route-parser.js';
import { installPageBridge, ROUTE_CHANGE_EVENT } from './history-bridge.js';

export function observeThreadRoute(onRoute, { window = globalThis.window } = {}) {
  if (!window || typeof onRoute !== 'function') {
    return () => {};
  }

  const cleanupBridge = installPageBridge(window);
  const emitRoute = () => onRoute(parseThreadUrl(window.location?.href));
  window.addEventListener?.(ROUTE_CHANGE_EVENT, emitRoute);
  window.addEventListener?.('popstate', emitRoute);
  window.addEventListener?.('hashchange', emitRoute);
  emitRoute();

  return () => {
    window.removeEventListener?.(ROUTE_CHANGE_EVENT, emitRoute);
    window.removeEventListener?.('popstate', emitRoute);
    window.removeEventListener?.('hashchange', emitRoute);
    cleanupBridge();
  };
}
