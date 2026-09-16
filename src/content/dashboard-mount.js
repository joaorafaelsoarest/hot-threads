import React from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { GET_DASHBOARD, OPEN_THREAD, UNPIN_THREAD } from '../shared/protocol.js';
import { ThreadsDashboard } from './ui/ThreadsDashboard.jsx';
import dashboardStyles from './ui/styles.css?raw';
import { VISUAL_SYSTEM_STYLES } from './ui/visual-system.js';
import { findThreadHeader } from './dom-anchors.js';

const HOST_ATTRIBUTE = 'data-hot-threads-dashboard';

function runtimeSendMessage(message) {
  return globalThis.chrome?.runtime?.sendMessage(message);
}

function normalizedText(element) {
  return element?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
}

function accessibleName(element) {
  return element?.getAttribute?.('aria-label')?.trim().toLowerCase() || normalizedText(element);
}

function isActionElement(element) {
  const role = element?.getAttribute?.('role');
  return element?.tagName === 'BUTTON' || element?.tagName === 'A' || role === 'button' ||
    role === 'link' || role === 'menuitem' || role === 'tab' ||
    (element?.hasAttribute?.('aria-label') &&
      (element?.hasAttribute?.('tabindex') || element?.hasAttribute?.('jsaction')));
}

function isSemanticBoundary(element) {
  const role = element?.getAttribute?.('role');
  return ['ASIDE', 'NAV', 'SECTION', 'MAIN', 'ARTICLE'].includes(element?.tagName) ||
    ['navigation', 'region', 'group'].includes(role) || element?.hasAttribute?.('aria-label') ||
    element?.hasAttribute?.('aria-labelledby');
}

function isWithinSemanticScope(root, element) {
  let ancestor = element?.parentElement;
  while (ancestor && ancestor !== root) {
    if (isSemanticBoundary(ancestor)) return false;
    ancestor = ancestor.parentElement;
  }
  return ancestor === root;
}

function findNamedElement(root, name, { actionOnly = false } = {}) {
  return Array.from(root?.querySelectorAll?.('*') || []).find((element) =>
    (!actionOnly || isActionElement(element)) &&
    (accessibleName(element) === name ||
      (name === 'starred' && accessibleName(element) === `${name} shortcut`)) &&
    isWithinSemanticScope(root, element)
  ) || null;
}

function findAssociatedShortcutsSection(label, document) {
  let scope = label?.parentElement;
  while (scope && scope !== document?.body && scope !== document?.documentElement) {
    const controller = Array.from(scope.querySelectorAll?.('[aria-controls]') || []).find((candidate) => {
      const controlled = document?.getElementById?.(candidate.getAttribute('aria-controls'));
      return Boolean(findNamedElement(controlled, 'starred', { actionOnly: true }));
    });
    if (controller) {
      const controlled = document.getElementById(controller.getAttribute('aria-controls'));
      const starred = findNamedElement(controlled, 'starred', { actionOnly: true });
      let container = label.parentElement;
      while (container?.parentElement && !container.contains(controlled)) {
        container = container.parentElement;
      }
      return { container, starred };
    }
    scope = scope.parentElement;
  }
  return null;
}

function findShortcutsSection(root) {
  const ownerDocument = root?.ownerDocument || root;
  const labels = Array.from(root?.querySelectorAll?.('*') || []).filter((element) =>
    accessibleName(element) === 'shortcuts'
  );

  for (const label of labels) {
    let candidate = label.parentElement;
    while (candidate && candidate !== ownerDocument?.body && candidate !== ownerDocument?.documentElement) {
      const starred = findNamedElement(candidate, 'starred', { actionOnly: true });
      if (starred) return { container: candidate, starred };
      if (isSemanticBoundary(candidate)) break;
      candidate = candidate.parentElement;
    }
    const associated = findAssociatedShortcutsSection(label, ownerDocument);
    if (associated) return associated;
  }

  return null;
}

function containsShortcutsStarredNavigation(element) {
  return Boolean(findShortcutsSection(element));
}

function findStructuralCentralContent(document) {
  const header = findThreadHeader(document);
  if (!header) return null;

  let headerBranch = header;
  let ancestor = header.parentElement;
  while (ancestor) {
    const navigationSibling = Array.from(ancestor.children).find((candidate) =>
      candidate !== headerBranch && containsShortcutsStarredNavigation(candidate)
    );
    if (navigationSibling) return headerBranch;
    headerBranch = ancestor;
    ancestor = ancestor.parentElement;
  }
  return null;
}

function isPreferredCentralBranch(element) {
  return element.matches?.('[data-hot-threads-central], main, [role="main"]') ||
    Boolean(findThreadHeader(element));
}

function findHomeStructuralCentralContent(document) {
  const navigation = findShortcutsSection(document);
  if (!navigation) return null;

  let navigationBranch = navigation.container;
  let ancestor = navigationBranch.parentElement;
  while (ancestor) {
    const siblings = Array.from(ancestor.children).filter((candidate) =>
      candidate !== navigationBranch && !containsShortcutsStarredNavigation(candidate)
    );
    const preferred = siblings.filter(isPreferredCentralBranch);
    if (preferred.length > 0) return preferred[0];
    if (siblings.length === 1) return siblings[0];
    navigationBranch = ancestor;
    ancestor = ancestor.parentElement;
  }
  return null;
}

function findCentralContent(document) {
  return document?.querySelector?.('[data-hot-threads-central], main, [role="main"]') ||
    findStructuralCentralContent(document) ||
    findHomeStructuralCentralContent(document);
}

function errorMessage(error) {
  if (typeof error === 'string') return error;
  return error?.message || 'Não foi possível carregar o painel.';
}

function threadUrl(item) {
  return typeof item === 'string' ? item : item?.url;
}

export function createDashboardMount({
  document = globalThis.document,
  sendMessage = runtimeSendMessage
} = {}) {
  let host = null;
  let shadowRoot = null;
  let root = null;
  let mountPoint = null;
  let openState = false;
  let centralSnapshot = null;
  let returnFocus = null;
  let requestGeneration = 0;
  let status = 'loading';
  let data = {};
  let loadError = '';
  let actionError = '';
  const unpinningIds = new Set();

  function ensureHost(central) {
    if (!document) return null;
    host = document.querySelector(`[${HOST_ATTRIBUTE}]`) || host;
    if (!host) {
      host = document.createElement('div');
      host.setAttribute(HOST_ATTRIBUTE, '');
    }
    const fallbackParent = document.body || document.documentElement;
    const parent = central?.parentElement || fallbackParent;
    if (parent && central?.parentElement === parent) {
      if (host.parentElement !== parent || host.previousElementSibling !== central) {
        parent.insertBefore(host, central.nextSibling);
      }
    } else if (parent && !host.isConnected) {
      parent.append(host);
    }
    host.hidden = false;
    host.style.display = 'block';
    host.style.width = '100%';
    host.style.height = '100%';
    host.style.flex = '1 1 auto';
    host.style.minWidth = '0';
    host.style.minHeight = '0';
    const pageFont = document.defaultView?.getComputedStyle?.(central || parent)?.fontFamily;
    if (pageFont) host.style.setProperty('--hot-threads-page-font-family', pageFont);

    if (!shadowRoot) {
      shadowRoot = host.shadowRoot || host.attachShadow({ mode: 'open' });
      mountPoint = document.createElement('div');
      mountPoint.setAttribute('data-hot-threads-dashboard-root', '');
      const style = document.createElement('style');
      style.textContent = `${VISUAL_SYSTEM_STYLES}\n${dashboardStyles}`;
      shadowRoot.append(style, mountPoint);
      root = createRoot(mountPoint);
    }
    return host;
  }

  function restoreCentral() {
    if (!centralSnapshot) return;
    const { element, style, ariaHidden } = centralSnapshot;
    if (style === null) element.removeAttribute('style');
    else element.setAttribute('style', style);
    if (ariaHidden === null) element.removeAttribute('aria-hidden');
    else element.setAttribute('aria-hidden', ariaHidden);
    centralSnapshot = null;
  }

  function hideCentral(central = findCentralContent(document)) {
    if (!central) return null;
    if (centralSnapshot?.element !== central) {
      restoreCentral();
      centralSnapshot = {
        element: central,
        style: central.getAttribute('style'),
        ariaHidden: central.getAttribute('aria-hidden')
      };
    }
    central.style.display = 'none';
    central.setAttribute('aria-hidden', 'true');
    return central;
  }

  function render() {
    if (!root) return;
    flushSync(() => {
      root.render(React.createElement(ThreadsDashboard, {
        status,
        data,
        errorMessage: loadError,
        actionError,
        unpinningIds,
        onBack: close,
        onRetry: loadDashboard,
        onOpenThread: openThread,
        onUnpinThread: unpinThread
      }));
    });
  }

  async function openThread(item) {
    const url = threadUrl(item);
    if (!url) return;
    try {
      const response = await sendMessage({ type: OPEN_THREAD, url });
      if (!response?.ok) {
        throw new Error(response?.error?.message || 'Não foi possível abrir a thread.');
      }
    } catch (error) {
      if (openState) {
        actionError = errorMessage(error);
        render();
      }
    }
  }

  async function unpinThread(item) {
    const threadId = item?.id;
    if (typeof threadId !== 'string' || threadId.length === 0 || unpinningIds.has(threadId)) return;

    unpinningIds.add(threadId);
    actionError = '';
    render();
    try {
      const response = await sendMessage({ type: UNPIN_THREAD, threadId });
      if (!response?.ok) {
        throw new Error(response?.error?.message || 'Não foi possível desafixar a thread.');
      }
      if (openState) {
        const pinned = Array.isArray(data?.pinned) ? data.pinned : [];
        data = { ...data, pinned: pinned.filter((candidate) => candidate?.id !== threadId) };
      }
    } catch (error) {
      if (openState) actionError = errorMessage(error);
    } finally {
      unpinningIds.delete(threadId);
      if (openState) render();
    }
  }

  async function loadDashboard() {
    const generation = ++requestGeneration;
    status = 'loading';
    loadError = '';
    actionError = '';
    render();
    try {
      const response = await sendMessage({ type: GET_DASHBOARD });
      if (!openState || generation !== requestGeneration) return;
      if (!response?.ok) {
        throw new Error(response?.error?.message || 'Não foi possível carregar o painel.');
      }
      data = response.data || {};
      status = 'ready';
    } catch (error) {
      if (!openState || generation !== requestGeneration) return;
      status = 'error';
      loadError = errorMessage(error);
    }
    render();
  }

  function open({ trigger } = {}) {
    if (openState) {
      reconcile();
      return host;
    }
    returnFocus = trigger || document?.activeElement || null;
    openState = true;
    const central = findCentralContent(document);
    ensureHost(central);
    hideCentral(central);
    render();
    void loadDashboard();
    return host;
  }

  function close({ restoreFocus = true } = {}) {
    if (!openState && !centralSnapshot) return;
    openState = false;
    requestGeneration += 1;
    restoreCentral();
    if (root) {
      flushSync(() => root.render(null));
    }
    if (host) host.hidden = true;
    if (restoreFocus && returnFocus?.isConnected && typeof returnFocus.focus === 'function') {
      returnFocus.focus();
    }
    returnFocus = null;
  }

  function reconcile() {
    if (!openState) return host;
    const central = findCentralContent(document);
    ensureHost(central);
    hideCentral(central);
    return host;
  }

  function toggle(options) {
    if (openState) close();
    else open(options);
  }

  function stop() {
    close({ restoreFocus: false });
    if (root) {
      flushSync(() => root.unmount());
    }
    if (host?.parentElement) host.parentElement.removeChild(host);
    host = null;
    shadowRoot = null;
    mountPoint = null;
    root = null;
  }

  return { open, close, toggle, reconcile, stop };
}
