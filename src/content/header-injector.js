import { configureControl, ensurePluginStyles, setIconLabelContent } from './ui/visual-system.js';

const MENU_ATTRIBUTE = 'data-hot-threads-menu';
const MENU_PLACEMENT_ATTRIBUTE = 'data-hot-threads-menu-placement';
const MENU_LABEL = 'Threads';
const SEARCH_SELECTOR = '#aso_search_form_anchor';

function removeElement(element) {
  if (typeof element?.remove === 'function') element.remove();
  else element?.parentElement?.removeChild?.(element);
}

function isVisible(element) {
  if (!element) return false;
  const view = element.ownerDocument?.defaultView;
  const style = view?.getComputedStyle?.(element);
  return style?.display !== 'none' && style?.visibility !== 'hidden';
}

function directChild(parent, descendant) {
  if (!parent || !descendant) return null;
  let current = descendant;
  while (current.parentElement && current.parentElement !== parent) {
    current = current.parentElement;
  }
  return current.parentElement === parent ? current : null;
}

function findHeaderInsertionTarget(document) {
  const search = document?.querySelector?.(SEARCH_SELECTOR);
  const header = search?.closest?.('header') || document?.querySelector?.('header[role="banner"]');
  if (!header) return null;

  const content = directChild(header, search);
  if (!content) return null;

  const logo = Array.from(header.querySelectorAll?.('a[aria-label="Chat logo"]') || [])
    .find(isVisible);
  if (!logo) return null;

  const leftCluster = Array.from(content.children || []).find((child) => child.contains(logo));
  const logoCluster = directChild(leftCluster, logo);
  if (leftCluster && logoCluster) {
    return { container: leftCluster, reference: logoCluster };
  }

  // Keep a useful fallback for minor header variations: insert before the
  // search layout in the same header content row.
  const searchLayout = directChild(content, search);
  if (searchLayout) return { container: content, reference: searchLayout.previousElementSibling };
  return null;
}

function configureMenuButton(button, document) {
  configureControl(button, 'menu-header');
  if (button.getAttribute('type') !== 'button') button.setAttribute('type', 'button');
  if (button.getAttribute('aria-label') !== MENU_LABEL) button.setAttribute('aria-label', MENU_LABEL);
  if (!button.hasAttribute(MENU_ATTRIBUTE)) button.setAttribute(MENU_ATTRIBUTE, '');
  if (button.getAttribute(MENU_PLACEMENT_ATTRIBUTE) !== 'header') {
    button.setAttribute(MENU_PLACEMENT_ATTRIBUTE, 'header');
  }
  button.removeAttribute('style');
  setIconLabelContent(document, button, { iconName: 'flame', label: MENU_LABEL });
  ensurePluginStyles(document);
  return button;
}

function attachMenuBehavior(button, onOpen) {
  button.addEventListener('click', () => onOpen?.(button));
}

export function createHeaderInjector({
  document = globalThis.document,
  onOpen,
  MutationObserver = globalThis.MutationObserver,
  queueMicrotask = globalThis.queueMicrotask
} = {}) {
  let observer = null;
  let scheduled = false;
  const enhancedButtons = new WeakSet();

  function reconcile() {
    const target = findHeaderInsertionTarget(document);
    const menus = Array.from(document?.querySelectorAll?.(`[${MENU_ATTRIBUTE}]`) || [])
      .filter((candidate) => candidate.getAttribute(MENU_PLACEMENT_ATTRIBUTE) !== 'sidebar');
    if (!target) {
      menus.forEach(removeElement);
      return null;
    }

    let button = menus.find((candidate) => candidate.parentElement === target.container) || null;
    if (!button) button = menus.find((candidate) => candidate.tagName === 'BUTTON') || null;
    if (!button) button = document.createElement('button');

    configureMenuButton(button, document);
    if (!enhancedButtons.has(button)) {
      attachMenuBehavior(button, onOpen);
      enhancedButtons.add(button);
    }

    menus.filter((candidate) => candidate !== button).forEach(removeElement);

    const expectedAfter = target.reference?.nextElementSibling || null;
    if (button.parentElement !== target.container || button !== expectedAfter) {
      if (target.reference) target.container.insertBefore(button, target.reference.nextSibling);
      else target.container.insertBefore(button, target.container.firstChild);
    }
    return button;
  }

  function schedule() {
    if (scheduled) return;
    scheduled = true;
    const queue = queueMicrotask || ((callback) => Promise.resolve().then(callback));
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
        attributeFilter: ['aria-label', 'class', 'role', 'style']
      });
    }
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    scheduled = false;
  }

  return { reconcile, start, stop };
}
