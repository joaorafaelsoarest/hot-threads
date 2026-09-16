const MENU_ATTRIBUTE = 'data-hot-threads-menu';
const SHORTCUTS_NAME = 'shortcuts';
const STARRED_NAME = 'starred';

function normalizedText(element) {
  return element?.textContent?.replace(/\s+/g, ' ').trim().toLowerCase() || '';
}

function accessibleName(element) {
  return element?.getAttribute?.('aria-label')?.trim().toLowerCase() || normalizedText(element);
}

function isActionElement(element) {
  if (!element) return false;
  const role = element.getAttribute?.('role');
  return element.tagName === 'BUTTON' || element.tagName === 'A' ||
    role === 'button' || role === 'link' || role === 'menuitem' || role === 'tab' ||
    (element.hasAttribute?.('aria-label') &&
      (element.hasAttribute?.('tabindex') || element.hasAttribute?.('jsaction')));
}

function isSemanticBoundary(element) {
  const role = element?.getAttribute?.('role');
  return ['ASIDE', 'NAV', 'SECTION', 'MAIN', 'ARTICLE'].includes(element?.tagName) ||
    ['navigation', 'region', 'group'].includes(role) ||
    element?.hasAttribute?.('aria-label') || element?.hasAttribute?.('aria-labelledby');
}

function isWithinSemanticScope(root, element) {
  let ancestor = element.parentElement;
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
      (name === STARRED_NAME && accessibleName(element) === `${name} shortcut`)) &&
    isWithinSemanticScope(root, element)
  ) || null;
}

function findAssociatedShortcutsSection(label, document) {
  let scope = label?.parentElement;
  while (scope && scope !== document?.body && scope !== document?.documentElement) {
    const controller = Array.from(scope.querySelectorAll?.('[aria-controls]') || []).find((candidate) => {
      const controlled = document?.getElementById?.(candidate.getAttribute('aria-controls'));
      return Boolean(findNamedElement(controlled, STARRED_NAME, { actionOnly: true }));
    });
    if (controller) {
      const controlled = document.getElementById(controller.getAttribute('aria-controls'));
      const starred = findNamedElement(controlled, STARRED_NAME, { actionOnly: true });
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

function findShortcutsSection(document) {
  const labels = Array.from(document?.querySelectorAll?.('*') || []).filter((element) =>
    accessibleName(element) === SHORTCUTS_NAME
  );

  for (const label of labels) {
    let candidate = label.parentElement;
    while (candidate && candidate !== document.body && candidate !== document.documentElement) {
      const starred = findNamedElement(candidate, STARRED_NAME, { actionOnly: true });
      if (starred) return { container: candidate, starred };
      if (isSemanticBoundary(candidate)) break;
      candidate = candidate.parentElement;
    }
    const associated = findAssociatedShortcutsSection(label, document);
    if (associated) return associated;
  }

  return null;
}

function removeElement(element) {
  if (typeof element?.remove === 'function') element.remove();
  else element?.parentElement?.removeChild?.(element);
}

function configureMenuButton(button) {
  if (button.getAttribute('type') !== 'button') button.setAttribute('type', 'button');
  if (button.getAttribute('aria-label') !== '🔥 Threads') button.setAttribute('aria-label', '🔥 Threads');
  if (!button.hasAttribute(MENU_ATTRIBUTE)) button.setAttribute(MENU_ATTRIBUTE, '');
  if (button.textContent !== '🔥 Threads') button.textContent = '🔥 Threads';
  return button;
}

function addFocusStyle(button) {
  let priorFocusStyle = null;
  button.addEventListener('focus', () => {
    priorFocusStyle = {
      outline: button.style.getPropertyValue('outline'),
      outlineOffset: button.style.getPropertyValue('outline-offset')
    };
    button.style.setProperty('outline', '3px solid currentColor');
    button.style.setProperty('outline-offset', '3px');
  });
  button.addEventListener('blur', () => {
    if (!priorFocusStyle) return;
    if (priorFocusStyle.outline) button.style.setProperty('outline', priorFocusStyle.outline);
    else button.style.removeProperty('outline');
    if (priorFocusStyle.outlineOffset) button.style.setProperty('outline-offset', priorFocusStyle.outlineOffset);
    else button.style.removeProperty('outline-offset');
    priorFocusStyle = null;
  });
}

function createMenuButton(document) {
  return configureMenuButton(document.createElement('button'));
}

function attachMenuBehavior(button, onOpen) {
  const activate = () => onOpen?.(button);
  button.addEventListener('click', activate);
  addFocusStyle(button);
}

export function createSidebarInjector({
  document = globalThis.document,
  onOpen,
  MutationObserver = globalThis.MutationObserver,
  queueMicrotask = globalThis.queueMicrotask
} = {}) {
  let observer = null;
  let scheduled = false;
  const enhancedButtons = new WeakSet();

  function reconcile() {
    const section = findShortcutsSection(document);
    const menus = Array.from(document?.querySelectorAll?.(`[${MENU_ATTRIBUTE}]`) || []);
    if (!section) {
      menus.forEach(removeElement);
      return null;
    }

    let button = menus.find((candidate) => candidate.tagName === 'BUTTON') || null;
    if (!button) button = createMenuButton(document);
    configureMenuButton(button);
    if (!enhancedButtons.has(button)) {
      attachMenuBehavior(button, onOpen);
      enhancedButtons.add(button);
    }
    menus.filter((candidate) => candidate !== button).forEach(removeElement);

    if (button.parentElement !== section.starred.parentElement || button.previousElementSibling !== section.starred) {
      section.starred.parentElement.insertBefore(button, section.starred.nextSibling);
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
        attributeFilter: ['aria-label', 'role']
      });
    }
  }

  function stop() {
    observer?.disconnect();
    observer = null;
    scheduled = false;
  }

  return {
    reconcile,
    start,
    stop
  };
}
