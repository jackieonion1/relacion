import React, { useEffect, useRef, useState } from 'react';
import Sheet from './Sheet';
import Field from './Field';
import Button from './Button';
import { revealFocused, useKeyboardInset } from '../lib/keyboardInset';

function exec(cmd, value = null) {
  try {
    document.execCommand(cmd, false, value);
  } catch {}
}

function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export default function RichTextEditor({ html, onChange, className = '' }) {
  const editorRef = useRef(null);
  const [states, setStates] = useState({ bold: false, italic: false });
  const savedRangeRef = useRef(null);
  const [linkOpen, setLinkOpen] = useState(false);
  const [linkUrl, setLinkUrl] = useState('');
  const linkInset = useKeyboardInset(linkOpen);

  const updateStates = () => {
    try {
      setStates({
        bold: document.queryCommandState('bold'),
        italic: document.queryCommandState('italic'),
      });
    } catch {}
  };

  // Only push prop html to DOM when it actually changes from outside
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    const current = el.innerHTML;
    if ((html || '') !== current) {
      el.innerHTML = html || '';
    }
  }, [html]);

  useEffect(() => {
    const handler = () => {
      if (!editorRef.current) return;
      const sel = window.getSelection();
      if (!sel || sel.rangeCount === 0) return;
      const range = sel.getRangeAt(0);
      // Check if selection is within editor
      let node = range.startContainer;
      while (node) {
        if (node === editorRef.current) {
          savedRangeRef.current = range.cloneRange();
          updateStates();
          break;
        }
        node = node.parentNode;
      }
    };
    document.addEventListener('selectionchange', handler);
    return () => document.removeEventListener('selectionchange', handler);
  }, []);

  const onInput = () => {
    const el = editorRef.current;
    if (!el) return;
    onChange(el.innerHTML);
    updateStates();
  };

  const focusEditor = () => {
    const el = editorRef.current;
    el?.focus();
    const sel = window.getSelection();
    if (el && savedRangeRef.current && sel) {
      try {
        sel.removeAllRanges();
        sel.addRange(savedRangeRef.current);
      } catch {}
    }
  };

  const applyInline = (cmd, value) => {
    focusEditor();
    exec(cmd, value);
    onInput();
  };

  const isInsideList = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return false;
    let node = sel.getRangeAt(0).startContainer;
    if (node.nodeType === 3) node = node.parentNode;
    while (node && node !== editorRef.current) {
      if (node.tagName === 'LI') return true;
      node = node.parentNode;
    }
    return false;
  };

  const listify = (ordered = false) => {
    focusEditor();
    // one-shot: if already in a list, do nothing (avoid toggle-off)
    if (isInsideList()) return;
    let sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) {
      const el = editorRef.current;
      if (!el) return;
      const r = document.createRange();
      r.selectNodeContents(el);
      r.collapse(false);
      sel = window.getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
    }
    let range = sel.getRangeAt(0);
    // Expand to a reasonable block container within the editor
    let node = range.startContainer;
    if (node.nodeType === 3) node = node.parentNode;
    while (node && node !== editorRef.current) {
      const tag = node.tagName;
      const display = window.getComputedStyle(node).display;
      if (tag === 'P' || tag === 'DIV' || tag === 'LI' || display === 'block') break;
      node = node.parentNode;
    }
    const block = node && node !== editorRef.current ? node : editorRef.current;
    const blockRange = document.createRange();
    blockRange.selectNodeContents(block);

    // Use selection contents if non-collapsed; otherwise use block contents
    if (range.collapsed) range = blockRange;

    const frag = range.extractContents();
    const ul = document.createElement(ordered ? 'ol' : 'ul');
    const li = document.createElement('li');
    if (frag.childNodes.length) {
      li.appendChild(frag);
    } else {
      li.appendChild(document.createTextNode('\u00A0'));
    }
    ul.appendChild(li);
    range.insertNode(ul);

    // Place caret at end of the new li
    sel.removeAllRanges();
    const caret = document.createRange();
    caret.selectNodeContents(li);
    caret.collapse(false);
    sel.addRange(caret);
    onInput();
  };

  // The link asks for its address in a sheet (it was a prompt()); the selection is kept in savedRangeRef meanwhile
  const createLink = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return; // require selection
    savedRangeRef.current = range.cloneRange();
    setLinkUrl('');
    setLinkOpen(true);
  };

  const onLinkSubmit = (e) => {
    e.preventDefault();
    e.stopPropagation(); // the sheet is a portal: without this the submit reaches the note form and saves it
    const url = linkUrl.trim();
    setLinkOpen(false);
    if (!url) return;
    let u = url;
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    applyInline('createLink', u);
  };

  const TOOLS = [
    { label: 'Negrita', d: ICON_BOLD, pressed: states.bold, run: () => applyInline('bold') },
    { label: 'Cursiva', d: ICON_ITALIC, pressed: states.italic, run: () => applyInline('italic') },
    { label: 'Lista de puntos', d: ICON_LIST, run: () => listify(false) },
    { label: 'Lista numerada', d: ICON_OLIST, run: () => listify(true) },
    { label: 'Enlace', d: ICON_LINK, run: createLink },
  ];

  return (
    <div className={className}>
      <div role="toolbar" aria-label="Formato" className="sticky top-0 z-10 flex gap-1 py-1 -mx-1 bg-card">
        {TOOLS.map((t) => (
          <button
            key={t.label}
            type="button"
            aria-label={t.label}
            aria-pressed={t.pressed === undefined ? undefined : t.pressed}
            className={`flex items-center justify-center w-12 h-11 rounded-xl transition-colors ${t.pressed ? 'bg-lacre-soft text-accent-ink' : 'text-ink-2 active:bg-sunk'}`}
            onMouseDown={(e) => e.preventDefault()}
            onClick={t.run}
          >
            <svg viewBox="0 0 24 24" width={20} height={20} fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true" focusable="false">
              <path d={t.d} />
            </svg>
          </button>
        ))}
      </div>
      <div
        ref={editorRef}
        role="textbox"
        aria-multiline="true"
        aria-label="Texto de la nota"
        className="rte w-full min-h-[200px] py-2 text-[17px] leading-[1.55] outline-hidden empty:before:content-[attr(placeholder)] empty:before:text-ink-2"
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onBlur={updateStates}
        onKeyUp={updateStates}
        placeholder="Escribe tu nota…"
      />
      <Sheet isOpen={linkOpen} onClose={() => setLinkOpen(false)}>
        <form onSubmit={onLinkSubmit} className="flex flex-col gap-3.5 px-5 pt-2 pb-[34px]" style={{ marginBottom: linkInset }}>
          <h2 className="serif text-[26px] leading-[1.15] font-normal">Añadir enlace</h2>
          <Field
            label="Dirección"
            placeholder="https://…"
            inputMode="url"
            autoCapitalize="none"
            autoCorrect="off"
            spellCheck={false}
            value={linkUrl}
            onChange={(e) => setLinkUrl(e.target.value)}
            onFocus={(e) => revealFocused(e.target)}
          />
          <Button type="submit" size="l" disabled={!linkUrl.trim()}>Añadir enlace</Button>
          <Button variant="txt" size="l" onClick={() => setLinkOpen(false)}>Cancelar</Button>
        </form>
      </Sheet>
    </div>
  );
}

// Format icons from Prototipo.dc.html (FMT), same 24 grid as Icon
const ICON_BOLD = 'M7 5h5.5a3.5 3.5 0 0 1 0 7H7zM7 12h6.5a3.5 3.5 0 0 1 0 7H7z';
const ICON_ITALIC = 'M10 5h8M6 19h8M14 5l-4 14';
const ICON_LIST = 'M9 7h11M9 12h11M9 17h11M4.5 7h.01M4.5 12h.01M4.5 17h.01';
const ICON_OLIST = 'M10 7h10M10 12h10M10 17h10M4 6l1.5-1v4M4 14.5a1.5 1.5 0 1 1 2.5 1.2L4 18h3';
const ICON_LINK = 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1';
