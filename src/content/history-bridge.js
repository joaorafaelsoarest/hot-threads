export const ROUTE_CHANGE_EVENT = 'hot-threads:route-change';
export const HISTORY_BRIDGE_MARKER = '__hotThreadsRouteBridgeInstalled__';

export function installPageBridge(page = globalThis.window) {
  const history = page?.history;
  if (!history) return () => {};
  if (history[HISTORY_BRIDGE_MARKER]) return () => {};

  const dispatchRouteChange = () => {
    const EventConstructor = page.CustomEvent || globalThis.CustomEvent;
    page.dispatchEvent(new EventConstructor(ROUTE_CHANGE_EVENT));
  };
  const originals = {};
  for (const name of ['pushState', 'replaceState']) {
    const original = history[name];
    if (typeof original !== 'function') continue;
    originals[name] = original;
    const wrapped = function bridgedHistoryMethod(...args) {
      const result = original.apply(this, args);
      dispatchRouteChange();
      return result;
    };
    history[name] = wrapped;
    originals[`${name}Wrapped`] = wrapped;
  }
  const cleanup = () => {
    for (const name of ['pushState', 'replaceState']) {
      if (history[name] === originals[`${name}Wrapped`]) history[name] = originals[name];
    }
    delete history[HISTORY_BRIDGE_MARKER];
  };
  history[HISTORY_BRIDGE_MARKER] = { cleanup };
  return cleanup;
}
