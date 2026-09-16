export function findThreadHeader(document = globalThis.document) {
  if (!document?.querySelectorAll) {
    return null;
  }

  const semanticHeader = Array.from(document.querySelectorAll('header[aria-label]')).find((header) =>
    header.querySelector('button[aria-label^="Open in full screen"]') ||
    header.querySelector('button[aria-label="Close"]') ||
    header.querySelector('button[aria-label^="Close "]')
  );
  if (semanticHeader) return semanticHeader;

  const controls = Array.from(document.querySelectorAll(
    'button[aria-label^="Open in full screen"], button[aria-label="Close"], button[aria-label^="Close "]'
  ));
  const control = controls.find((candidate) =>
    candidate.closest?.('[jsname="Zpe2Q"], [data-soft-view-current="true"]')
  ) || controls[0];
  if (!control) return null;

  return control.closest?.('[jsname="Zpe2Q"], [data-soft-view-current="true"]') ||
    control.parentElement ||
    null;
}
