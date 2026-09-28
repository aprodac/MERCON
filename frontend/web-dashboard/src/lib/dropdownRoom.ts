/**
 * Dropdowns always open *below* their field. When the field sits too close to
 * the bottom of the screen, slide the page up just enough to fit the dropdown
 * (adding a little temporary space at the end of the page if it can't scroll
 * that far). Returns a cleanup that removes the temporary space.
 */

let lastRoomScrollAt = 0;

/** True for ~700 ms after makeRoomBelow scrolled — dropdowns that close on scroll ignore it. */
export function isRoomScrollInProgress(): boolean {
  return Date.now() - lastRoomScrollAt < 700;
}

function scrollParentOf(el: HTMLElement): HTMLElement {
  let node = el.parentElement;
  while (node && node !== document.body) {
    const { overflowY } = getComputedStyle(node);
    if ((overflowY === 'auto' || overflowY === 'scroll') && node.clientHeight > 0) return node;
    node = node.parentElement;
  }
  return (document.scrollingElement as HTMLElement) || document.documentElement;
}

export function makeRoomBelow(trigger: HTMLElement | null, neededPx: number): () => void {
  if (!trigger) return () => {};
  const rect = trigger.getBoundingClientRect();
  const shortBy = Math.ceil(neededPx - (window.innerHeight - rect.bottom) + 12);
  // Never push the field itself off the top of the screen.
  const maxShift = Math.max(0, rect.top - 72);
  const shift = Math.min(shortBy, maxShift);
  if (shift <= 0) return () => {};

  const scroller = scrollParentOf(trigger);
  const remaining = scroller.scrollHeight - scroller.clientHeight - scroller.scrollTop;
  let added = 0;
  const previousPadding = scroller.style.paddingBottom;
  if (remaining < shift) {
    added = shift - remaining;
    const current = parseFloat(getComputedStyle(scroller).paddingBottom) || 0;
    scroller.style.paddingBottom = `${current + added}px`;
  }
  lastRoomScrollAt = Date.now();
  scroller.scrollBy({ top: shift, behavior: 'smooth' });

  return () => {
    if (added) scroller.style.paddingBottom = previousPadding;
  };
}
