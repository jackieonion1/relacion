import React, { useEffect, useRef, useState } from 'react';

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

  const createLink = () => {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return; // require selection
    const url = prompt('URL (https://...)');
    if (!url) return;
    let u = url.trim();
    if (!/^https?:\/\//i.test(u)) u = 'https://' + u;
    applyInline('createLink', u);
  };

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2 mb-2">
        <button
          type="button"
          aria-label="Negrita"
          className={`px-3 py-1.5 rounded text-sm ${states.bold ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyInline('bold')}
        >
          <span className="font-bold">B</span>
        </button>
        <button
          type="button"
          aria-label="Cursiva"
          className={`px-3 py-1.5 rounded text-sm ${states.italic ? 'bg-rose-100 text-rose-700' : 'bg-gray-100 text-gray-700 hover:bg-gray-200'}`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => applyInline('italic')}
        >
          <span className="italic">I</span>
        </button>
        <button
          type="button"
          aria-label="Lista de puntos"
          className={`px-3 py-1.5 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => listify(false)}
        >
          •
        </button>
        <button
          type="button"
          aria-label="Lista numerada"
          className={`px-3 py-1.5 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => listify(true)}
        >
          1.
        </button>
        <button
          type="button"
          aria-label="Enlace"
          className={`px-3 py-1.5 rounded text-sm bg-gray-100 text-gray-700 hover:bg-gray-200`}
          onMouseDown={(e) => e.preventDefault()}
          onClick={createLink}
        >
          ⛓️
        </button>
      </div>
      <div
        ref={editorRef}
        className="input rte w-full min-h-[10rem] max-h-[50vh] overflow-auto leading-relaxed"
        contentEditable
        suppressContentEditableWarning
        onInput={onInput}
        onBlur={updateStates}
        onKeyUp={updateStates}
        placeholder="Escribe tu nota…"
      />
    </div>
  );
}
