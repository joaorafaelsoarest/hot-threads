import { observeThreadRoute } from './route-observer.js';
import { findThreadHeader } from './dom-anchors.js';
import { createPinButtonReconciler } from './pin-button.js';
import { createHeaderInjector } from './header-injector.js';
import { createDashboardMount } from './dashboard-mount.js';
import { createPerfProbe } from '../shared/perf-probe.js';
import { SYNC_THREAD } from '../shared/protocol.js';

function safeSendMessage(sendMessage, message) {
  try {
    return Promise.resolve(sendMessage(message)).catch(() => null);
  } catch {
    return Promise.resolve(null);
  }
}

function titleForRoute(document, route) {
  return findThreadHeader(document)?.getAttribute('aria-label') ||
    document?.title ||
    `Thread ${route.threadId}`;
}

function createDomReconciler({ document, MutationObserver, header, dashboard, perf }) {
  let observer = null;
  let scheduled = false;

  function reconcile() {
    perf.measure('content.header.reconcile', () => {
      try {
        header.reconcile();
      } catch {
        // A page-owned DOM transition must not interrupt the content script.
      }
    });
    perf.measure('content.dashboard.reconcile', () => {
      try {
        dashboard.reconcile();
      } catch {
        // A page-owned DOM transition must not interrupt the content script.
      }
    });
  }

  function schedule(records = []) {
    const batches = perf.count('content.dom.mutationBatches');
    perf.count('content.dom.mutationRecords', records.length);
    if (batches >= 100) {
      perf.flush({ surface: 'content', reason: 'dom-mutation-batches' });
    }
    if (scheduled) return;
    scheduled = true;
    const queue = globalThis.queueMicrotask || ((callback) => Promise.resolve().then(callback));
    queue(() => {
      scheduled = false;
      reconcile();
    });
  }

  function start() {
    reconcile();
    const target = document?.body || document?.documentElement;
    if (!observer && MutationObserver && target) {
      observer = new MutationObserver(schedule);
      observer.observe(target, {
        childList: true,
        subtree: true,
        attributes: true,
        attributeFilter: ['aria-label', 'role']
      });
    }
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    scheduled = false;
  }

  return { start, stop };
}

export function startContentScript({
  window = globalThis.window,
  document = globalThis.document,
  sendMessage = (message) => globalThis.chrome?.runtime?.sendMessage(message),
  MutationObserver = globalThis.MutationObserver,
  perf = createPerfProbe({ enabled: import.meta.env.VITE_HOT_THREADS_PERF === '1' })
} = {}) {
  if (!window || !document) {
    return () => {};
  }

  const instrumentedSendMessage = (message) =>
    perf.measureAsync(`content.runtime.${message?.type || 'unknown'}`, () => sendMessage(message));
  const reconciler = createPinButtonReconciler({ document, sendMessage: instrumentedSendMessage, MutationObserver, perf });
  const dashboard = createDashboardMount({ document, sendMessage: instrumentedSendMessage, perf });
  const header = createHeaderInjector({
    document,
    MutationObserver: undefined,
    onOpen: (trigger) => dashboard.open({ trigger })
  });
  const domReconciler = createDomReconciler({ document, MutationObserver, header, dashboard, perf });
  reconciler.start();
  domReconciler.start();
  const stopObserving = observeThreadRoute((route) => {
    perf.count('content.route.events');
    void reconciler.setRoute(route).catch(() => {});
    if (route) {
      void safeSendMessage(instrumentedSendMessage, {
        type: SYNC_THREAD,
        thread: { ...route, title: titleForRoute(document, route) }
      });
    }
    perf.flush({ surface: 'content', reason: 'route' });
  }, { window });

  return () => {
    stopObserving();
    domReconciler.stop();
    header.stop();
    dashboard.stop();
    reconciler.stop();
  };
}

if (globalThis.window && globalThis.document) {
  startContentScript();
}
