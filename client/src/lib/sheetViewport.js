// Keeps a bottom sheet above the on-screen keyboard. iOS does not shrink the layout viewport for the keyboard
// (a sheet pinned to the bottom stays under it) and pans the visual viewport instead; only visualViewport knows
// what is visible. The sheet follows it: the height depends on the visual viewport's height alone, never on its
// offset, so panning cannot resize the sheet and move the viewport again (adversario fix1 O2)

const REVEAL_MARGIN = 12;
const KEYBOARD_DELAY = 320; // the keyboard takes about this long to open after a field is focused

// Pins `wrap` (the fixed container of the sheet) to the visible area while the keyboard covers part of the screen
// and caps `panel` to 92 % of it. Resize recomputes both; scroll only moves the top. Returns its cleanup
export function followViewport(wrap, panel, win = window) {
  const vv = win.visualViewport;
  if (!vv || !wrap) return () => {};
  const covered = () => vv.scale <= 1.01 && Math.round(win.innerHeight - vv.height) > 0;
  const moveTop = () => {
    const top = covered() ? `${Math.round(vv.offsetTop)}px` : '';
    if (wrap.style.top !== top) wrap.style.top = top;
  };
  const fit = () => {
    const shrunk = covered();
    wrap.style.height = shrunk ? `${Math.round(vv.height)}px` : '';
    if (panel) panel.style.maxHeight = shrunk ? `${Math.round(vv.height * 0.92)}px` : '';
    moveTop();
  };
  fit();
  vv.addEventListener('resize', fit);
  vv.addEventListener('scroll', moveTop);
  return () => {
    vv.removeEventListener('resize', fit);
    vv.removeEventListener('scroll', moveTop);
    wrap.style.top = '';
    wrap.style.height = '';
    if (panel) panel.style.maxHeight = '';
  };
}

// The box to keep in view: the focused field, or the line of the cursor inside an editor (never the whole editor)
function focusTarget(panel, doc, win) {
  const el = doc.activeElement;
  if (!el || el === panel || !panel.contains(el)) return null;
  if (!el.isContentEditable) return el.getBoundingClientRect();
  const sel = win.getSelection?.();
  if (!sel || sel.rangeCount === 0) return null;
  const range = sel.getRangeAt(0).cloneRange();
  if (!el.contains(range.startContainer)) return null;
  range.collapse(false);
  const caret = range.getClientRects()[0];
  if (caret && (caret.height || caret.width)) return caret;
  // An empty line has no rect of its own: use the element that holds the cursor
  const holder = range.startContainer.nodeType === 1 ? range.startContainer : range.startContainer.parentElement;
  return holder ? holder.getBoundingClientRect() : null;
}

// Scrolls the sheet, and only the sheet, just enough to leave the focused field or cursor line inside the visible part
export function revealFocused(panel, win = window, doc = document) {
  const rect = focusTarget(panel, doc, win);
  if (!rect) return;
  const vv = win.visualViewport;
  const box = panel.getBoundingClientRect();
  const visibleTop = Math.max(box.top, vv ? vv.offsetTop : 0);
  const visibleBottom = Math.min(box.bottom, vv ? vv.offsetTop + vv.height : win.innerHeight);
  if (rect.bottom > visibleBottom - REVEAL_MARGIN) panel.scrollTop += rect.bottom - (visibleBottom - REVEAL_MARGIN);
  else if (rect.top < visibleTop + REVEAL_MARGIN) panel.scrollTop -= visibleTop + REVEAL_MARGIN - rect.top;
}

// Reveals what is focused when a field takes the focus (once the keyboard is up) and when the keyboard changes the
// visible height. Never on scroll. Returns its cleanup
export function revealOnKeyboard(panel, win = window) {
  if (!panel) return () => {};
  const vv = win.visualViewport;
  let timer = 0;
  const onFocusIn = () => {
    clearTimeout(timer);
    timer = setTimeout(() => revealFocused(panel, win), KEYBOARD_DELAY);
  };
  const onResize = () => revealFocused(panel, win);
  panel.addEventListener('focusin', onFocusIn);
  if (vv) vv.addEventListener('resize', onResize);
  return () => {
    clearTimeout(timer);
    panel.removeEventListener('focusin', onFocusIn);
    if (vv) vv.removeEventListener('resize', onResize);
  };
}
