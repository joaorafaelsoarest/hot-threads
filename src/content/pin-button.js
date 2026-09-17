import { findThreadHeader } from './dom-anchors.js';
import { createPerfProbe } from '../shared/perf-probe.js';
import { GET_THREAD_STATE, TOGGLE_PIN } from '../shared/protocol.js';

const PIN_ATTRIBUTE = 'data-hot-threads-pin';

function sendRuntimeMessage(message) {
  return globalThis.chrome?.runtime?.sendMessage(message);
}

function applyPinState(button, isPinned) {
  const label = isPinned ? 'Desfixar thread' : 'Fixar thread';
  if (button.getAttribute('aria-label') !== label) button.setAttribute('aria-label', label);
  if (button.getAttribute('title') !== label) button.setAttribute('title', label);
  if (button.getAttribute('aria-pressed') !== String(isPinned)) button.setAttribute('aria-pressed', String(isPinned));
  button.setAttribute('data-hot-threads-pin-state', isPinned ? 'pinned' : 'unpinned');
  const path = button.querySelector('path');
  if (path) {
    path.setAttribute('fill', isPinned ? 'currentColor' : 'none');
    if (isPinned) {
      path.removeAttribute('stroke');
    } else {
      path.setAttribute('stroke', 'currentColor');
      path.setAttribute('stroke-width', '2');
    }
  }
  button.disabled = false;
  button.removeAttribute('disabled');
  button.removeAttribute('aria-busy');
}

function setButtonStatus(button, label) {
  button.setAttribute('aria-label', label);
  button.setAttribute('title', label);
  if (button.getAttribute('aria-pressed') === null) {
    button.setAttribute('aria-pressed', 'false');
    button.setAttribute('data-hot-threads-pin-state', 'unpinned');
  }
  button.disabled = true;
  button.setAttribute('disabled', '');
  button.setAttribute('aria-busy', 'true');
}

function setTogglePending(button) {
  button.disabled = true;
  button.setAttribute('disabled', '');
  button.setAttribute('aria-busy', 'true');
}

function setRetryAction(button) {
  button.setAttribute('aria-label', 'Tentar novamente');
  button.setAttribute('title', 'Tentar novamente');
  button.disabled = false;
  button.removeAttribute('disabled');
  button.removeAttribute('aria-busy');
}

function threadTitle(header, document, route) {
  return header.getAttribute('aria-label') || document.title || `Thread ${route.threadId}`;
}

function createButton(document, onToggle) {
  const button = document.createElementNS('http://www.w3.org/1999/xhtml', 'button');
  button.setAttribute(PIN_ATTRIBUTE, '');
  button.setAttribute('type', 'button');
  button.setAttribute('fill', 'currentColor');

  const icon = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  icon.setAttribute('viewBox', '0 0 24 24');
  icon.setAttribute('width', '20');
  icon.setAttribute('height', '20');
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('fill', 'currentColor');
  const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
  path.setAttribute('d', 'M8 3h8v6l2 3v2h-5v7l-1 1-1-1v-7H6v-2l2-3V3z');
  path.setAttribute('fill', 'none');
  path.setAttribute('stroke', 'currentColor');
  path.setAttribute('stroke-width', '2');
  icon.append(path);
  button.append(icon);
  button.addEventListener('click', onToggle);
  button.addEventListener('keydown', (event) => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      void onToggle();
    }
  });
  return button;
}

function nativeControls(header) {
  const anchor = header.querySelector('button[aria-label^="Open in full screen"]') ||
    header.querySelector('button[aria-label="Close"]') ||
    header.querySelector('button[aria-label^="Close "]');
  return anchor?.parentElement || header;
}

function removePinButtons(document) {
  document?.querySelectorAll?.(`[${PIN_ATTRIBUTE}]`).forEach((button) => {
    if (typeof button.remove === 'function') {
      button.remove();
    } else {
      button.parentElement?.removeChild?.(button);
    }
  });
}

function removePinsOutsideControls(document, controls) {
  let retained = false;
  document?.querySelectorAll?.(`[${PIN_ATTRIBUTE}]`).forEach((button) => {
    if (button.parentElement === controls && !retained) {
      retained = true;
      return;
    }
    if (typeof button.remove === 'function') button.remove();
    else button.parentElement?.removeChild?.(button);
  });
}

export function createPinButtonReconciler({
  document = globalThis.document,
  sendMessage = sendRuntimeMessage,
  MutationObserver = globalThis.MutationObserver,
  queueMicrotask = globalThis.queueMicrotask,
  perf = createPerfProbe()
} = {}) {
  let currentRoute = null;
  let observer = null;
  let scheduled = false;
  let activeReconciliation = null;
  let activeToggle = null;
  let pendingReconciliation = false;
  let pendingExplicitReconciliation = false;
  let generation = 0;
  let errorState = false;
  let stateReady = false;

  function markError(button) {
    errorState = true;
    stateReady = false;
    setRetryAction(button);
  }

  async function performReconciliation(route) {
    if (!route || !document) {
      return null;
    }

    const header = findThreadHeader(document);
    if (!header) {
      removePinButtons(document);
      return null;
    }

    const controls = nativeControls(header);
    removePinsOutsideControls(document, controls);
    let button = controls.querySelector(`[${PIN_ATTRIBUTE}]`);
    if (!button) {
      button = createButton(document, () => {
        const routeAtClick = currentRoute;
        if (!routeAtClick || button.disabled || activeToggle) return Promise.resolve();
        if (errorState) {
          generation += 1;
          stateReady = false;
          errorState = false;
          setButtonStatus(button, 'Carregando estado da thread');
          return reconcile(routeAtClick);
        }
        const toggleGeneration = ++generation;
        setTogglePending(button);
        const running = (async () => {
          try {
          const response = await sendMessage({
            type: TOGGLE_PIN,
            thread: { ...routeAtClick, title: threadTitle(header, document, routeAtClick) }
          });
          if (response?.ok && currentRoute?.id === routeAtClick.id && generation === toggleGeneration) {
            errorState = false;
            stateReady = true;
            applyPinState(button, Boolean(response.data?.isPinned));
          } else if (currentRoute?.id === routeAtClick.id && generation === toggleGeneration) {
            markError(button);
          }
          } catch {
            if (currentRoute?.id === routeAtClick.id && generation === toggleGeneration) {
              markError(button);
            }
          }
        })();
        activeToggle = running;
        return running.finally(() => {
          if (activeToggle === running) {
            activeToggle = null;
            if (pendingReconciliation) {
              pendingReconciliation = false;
              if (pendingExplicitReconciliation) {
                pendingExplicitReconciliation = false;
                void reconcile(currentRoute).catch(() => {});
              } else {
                scheduleReconciliation();
              }
            }
          }
        }
        );
      });
      setButtonStatus(button, 'Carregando estado da thread');
      controls.append(button);
    }

    const requestGeneration = ++generation;
    try {
      const response = await sendMessage({ type: GET_THREAD_STATE, threadId: route.id });
      if (response?.ok && currentRoute?.id === route.id && generation === requestGeneration) {
        errorState = false;
        stateReady = true;
        applyPinState(button, Boolean(response.data?.isPinned));
      } else if (currentRoute?.id === route.id && generation === requestGeneration) {
        markError(button);
      }
    } catch {
      if (currentRoute?.id === route.id && generation === requestGeneration) {
        markError(button);
      }
    }
    return button;
  }

  function scheduleReconciliation(records = []) {
    const batches = perf.count('content.pin.mutationBatches');
    perf.count('content.pin.mutationRecords', records.length);
    if (batches >= 100) {
      perf.flush({ surface: 'content', reason: 'pin-mutation-batches' });
    }
    if (scheduled) return;
    if (errorState) return;
    if (stateReady) {
      const header = findThreadHeader(document);
      const controls = header && nativeControls(header);
      if (controls?.querySelector(`[${PIN_ATTRIBUTE}]`)) return;
    }
    scheduled = true;
    const queue = queueMicrotask || ((callback) => Promise.resolve().then(callback));
    queue(() => {
      scheduled = false;
      void reconcile(currentRoute, { fromMutation: true }).catch(() => {});
    });
  }

  async function reconcile(route = currentRoute, { fromMutation = false } = {}) {
    const routeChanged = currentRoute?.id !== route?.id;
    currentRoute = route;
    if (routeChanged) {
      generation += 1;
      errorState = false;
      stateReady = false;
      pendingReconciliation = false;
      pendingExplicitReconciliation = false;
    }
    if (!route || routeChanged) {
      removePinButtons(document);
    }
    if (!route || !document) {
      return null;
    }

    if (fromMutation && errorState) {
      return null;
    }

    if (!fromMutation) {
      errorState = false;
    }

    if (activeToggle && !routeChanged) {
      pendingReconciliation = true;
      pendingExplicitReconciliation ||= !fromMutation;
      return activeToggle;
    }

    if (activeReconciliation) {
      pendingReconciliation = true;
      return activeReconciliation;
    }

    const running = perf.measureAsync('content.pin.reconcile', () => performReconciliation(route));
    activeReconciliation = running;
    try {
      return await running;
    } finally {
      if (activeReconciliation === running) {
        activeReconciliation = null;
        if (pendingReconciliation) {
          pendingReconciliation = false;
          scheduleReconciliation();
        }
      }
    }
  }

  function setRoute(route) {
    return reconcile(route);
  }

  function start() {
    if (!observer && MutationObserver && document?.documentElement) {
      observer = new MutationObserver(scheduleReconciliation);
      observer.observe(document.documentElement, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label']
      });
    }
  }

  function stop() {
    observer?.disconnect();
    observer = null;
  }

  return { reconcile, setRoute, start, stop };
}
