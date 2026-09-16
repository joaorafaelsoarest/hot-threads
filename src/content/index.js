import { observeThreadRoute } from './route-observer.js';
import { findThreadHeader } from './dom-anchors.js';
import { createPinButtonReconciler } from './pin-button.js';
import { createHeaderInjector } from './header-injector.js';
import { createSidebarInjector } from './sidebar-injector.js';
import { createDashboardMount } from './dashboard-mount.js';
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

function createDomReconciler({ document, MutationObserver, header, sidebar, dashboard }) {
  let observer = null;
  let scheduled = false;

  function reconcile() {
    try {
      header.reconcile();
    } catch {
      // A page-owned DOM transition must not interrupt the content script.
    }
    try {
      sidebar.reconcile();
    } catch {
      // A page-owned DOM transition must not interrupt the content script.
    }
    try {
      dashboard.reconcile();
    } catch {
      // A page-owned DOM transition must not interrupt the content script.
    }
  }

  function schedule() {
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
  MutationObserver = globalThis.MutationObserver
} = {}) {
  if (!window || !document) {
    return () => {};
  }

  const reconciler = createPinButtonReconciler({ document, sendMessage, MutationObserver });
  const dashboard = createDashboardMount({ document, sendMessage });
  const header = createHeaderInjector({
    document,
    MutationObserver: undefined,
    onOpen: (trigger) => dashboard.open({ trigger })
  });
  const sidebar = createSidebarInjector({
    document,
    MutationObserver: undefined,
    onOpen: (trigger) => dashboard.open({ trigger })
  });
  const domReconciler = createDomReconciler({ document, MutationObserver, header, sidebar, dashboard });
  reconciler.start();
  domReconciler.start();
  const stopObserving = observeThreadRoute((route) => {
    void reconciler.setRoute(route).catch(() => {});
    if (route) {
      void safeSendMessage(sendMessage, {
        type: SYNC_THREAD,
        thread: { ...route, title: titleForRoute(document, route) }
      });
    }
  }, { window });

  return () => {
    stopObserving();
    domReconciler.stop();
    header.stop();
    sidebar.stop();
    dashboard.stop();
    reconciler.stop();
  };
}

if (globalThis.window && globalThis.document) {
  startContentScript();
}
