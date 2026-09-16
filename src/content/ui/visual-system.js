import controlsStyles from './controls.css?raw';

export const CONTROL_ATTRIBUTE = 'data-hot-threads-control';
export const CONTROL_VARIANT_ATTRIBUTE = 'data-hot-threads-variant';
export const STYLE_ATTRIBUTE = 'data-hot-threads-style';
export const VISUAL_SYSTEM_STYLES = controlsStyles;

const SVG_NS = 'http://www.w3.org/2000/svg';

export const ICONS = Object.freeze({
  flame: Object.freeze({
    viewBox: '0 0 24 24',
    paths: Object.freeze([
      Object.freeze({
        d: 'M12 22c-3.87 0-7-2.69-7-6.5 0-2.49 1.34-4.72 3.64-6.66-.04 1.53.45 2.73 1.39 3.61-.09-1.82.74-4.28 2.61-6.45.19 1.62.92 2.83 2.2 3.63 1.4 1.02 2.16 2.37 2.16 4.05 0 .72-.17 1.39-.5 2.01.78-.35 1.4-.91 1.86-1.7.43 3.97-2.34 8.01-6.36 8.01Z',
        fill: 'currentColor'
      })
    ])
  }),
  'push-pin': Object.freeze({
    viewBox: '0 0 24 24',
    paths: Object.freeze([
      Object.freeze({
        d: 'M8 3h8v6l2 3v2h-5v7l-1 1-1-1v-7H6v-2l2-3V3z',
        fill: 'none',
        stroke: 'currentColor',
        strokeWidth: 2
      })
    ])
  }),
  'arrow-back': Object.freeze({
    viewBox: '0 0 24 24',
    paths: Object.freeze([
      Object.freeze({
        d: 'M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z',
        fill: 'currentColor'
      })
    ])
  }),
  refresh: Object.freeze({
    viewBox: '0 0 24 24',
    paths: Object.freeze([
      Object.freeze({
        d: 'M17.65 6.35C16.2 4.9 14.21 4 12 4c-4.42 0-7.99 3.58-7.99 8s3.57 8 7.99 8c3.73 0 6.84-2.55 7.73-6h-2.08c-.82 2.33-3.04 4-5.65 4-3.31 0-6-2.69-6-6s2.69-6 6-6c1.66 0 3.14.69 4.22 1.78L13 11h7V4l-2.35 2.35z',
        fill: 'currentColor'
      })
    ])
  }),
  close: Object.freeze({
    viewBox: '0 0 24 24',
    paths: Object.freeze([
      Object.freeze({
        d: 'M18.3 5.71 12 12l6.3 6.29-1.41 1.42L10.59 13.41 4.3 19.71 2.89 18.3 9.17 12 2.89 5.7 4.3 4.29l6.29 6.3 6.3-6.3 1.41 1.42z',
        fill: 'currentColor'
      })
    ])
  })
});

function iconDefinition(name) {
  const definition = ICONS[name];
  if (!definition) throw new Error(`Unknown Hot Threads icon: ${name}`);
  return definition;
}

export function createSvgIcon(document, name, { size = 20 } = {}) {
  const definition = iconDefinition(name);
  const icon = document.createElementNS(SVG_NS, 'svg');
  icon.setAttribute('viewBox', definition.viewBox);
  icon.setAttribute('width', String(size));
  icon.setAttribute('height', String(size));
  icon.setAttribute('aria-hidden', 'true');
  icon.setAttribute('focusable', 'false');
  icon.setAttribute('fill', 'currentColor');
  icon.setAttribute('data-hot-threads-icon', name);
  definition.paths.forEach((pathDefinition) => {
    const path = document.createElementNS(SVG_NS, 'path');
    Object.entries(pathDefinition).forEach(([attribute, value]) => {
      const svgAttribute = attribute === 'strokeWidth' ? 'stroke-width' : attribute;
      path.setAttribute(svgAttribute, String(value));
    });
    icon.append(path);
  });
  return icon;
}

export function createReactIcon(createElement, name, { size = 20 } = {}) {
  const definition = iconDefinition(name);
  const props = {
    viewBox: definition.viewBox,
    width: size,
    height: size,
    'aria-hidden': true,
    focusable: false,
    fill: 'currentColor',
    'data-hot-threads-icon': name
  };
  const paths = definition.paths.map((pathDefinition, index) => createElement('path', {
    ...pathDefinition,
    strokeWidth: pathDefinition.strokeWidth,
    key: `${name}-${index}`
  }));
  return createElement('svg', props, ...paths);
}

export function configureControl(element, variant) {
  if (!element) return element;
  element.setAttribute(CONTROL_ATTRIBUTE, '');
  element.setAttribute(CONTROL_VARIANT_ATTRIBUTE, variant);
  if (element.getAttribute('type') !== 'button') element.setAttribute('type', 'button');
  return element;
}

export function setIconLabelContent(document, element, { iconName, label }) {
  if (!document || !element) return element;
  const currentIcon = element.querySelector?.(`[data-hot-threads-icon="${iconName}"]`);
  const currentLabel = element.querySelector?.('[data-hot-threads-label]');
  if (currentIcon && currentLabel?.textContent === label && element.children?.length === 2) {
    return element;
  }
  const icon = createSvgIcon(document, iconName);
  const labelElement = document.createElement('span');
  labelElement.setAttribute('data-hot-threads-label', '');
  labelElement.textContent = label;
  element.replaceChildren(icon, labelElement);
  return element;
}

export function ensurePluginStyles(document = globalThis.document) {
  if (!document?.createElement) return null;
  const existing = document.querySelector?.(`style[${STYLE_ATTRIBUTE}]`);
  if (existing) return existing;

  const style = document.createElement('style');
  style.setAttribute(STYLE_ATTRIBUTE, '');
  style.textContent = controlsStyles;
  (document.head || document.documentElement || document.body)?.append(style);
  return style;
}
