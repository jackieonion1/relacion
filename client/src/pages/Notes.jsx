import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../components/Modal';
import RichTextEditor from '../components/RichTextEditor';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { addNote, deleteNote, listenNotes, updateNote, deleteThread, markThreadRead } from '../lib/notes';
import { sanitizeHtml } from '../lib/sanitize';

export default function Notes() {
  const pairId = useMemo(() => localStorage.getItem('pairId') || '', []);
  const identity = useMemo(() => localStorage.getItem('identity') || 'yo', []);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [html, setHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, id: '', preview: '' });
  const [editingId, setEditingId] = useState('');
  const [selectedNote, setSelectedNote] = useState(null); // note object when viewing/editing existente
  const [isEditing, setIsEditing] = useState(false); // controls modal mode
  const [title, setTitle] = useState('');
  const [replyThreadId, setReplyThreadId] = useState('');
  const [isThreadView, setIsThreadView] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [deleteThreadConfirmation, setDeleteThreadConfirmation] = useState({ isOpen: false, threadId: '' });
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);

  useEffect(() => {
    let unsub = () => {};
    (async () => {
      try {
        unsub = await listenNotes(pairId, { max: 200 }, (list) => {
          setNotes(list);
          setLoading(false);
        });
      } catch (e) {
        setLoading(false);
      }
    })();
    return () => { try { unsub(); } catch {} };
  }, [pairId]);

  async function onSave(e) {
    e.preventDefault();
    if (!html || !html.replace(/<[^>]*>/g, '').trim()) {
      setError('Escribe algo para la nota.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const clean = sanitizeHtml(html);
      const tmp = document.createElement('div');
      tmp.innerHTML = clean;
      const plain = (tmp.textContent || '').trim();
      const titleTrim = (title || '').trim();
      if (editingId) {
        await updateNote(pairId, editingId, { html: clean, plain, title: titleTrim });
      } else {
        await addNote(pairId, { html: clean, plain, title: titleTrim }, identity, { threadId: replyThreadId || '' });
      }
      setHtml('');
      setEditingId('');
      setSelectedNote(null);
      setIsEditing(false);
      setTitle('');
      setReplyThreadId('');
      setIsModalOpen(false);
    } catch (e) {
      setError('No se pudo guardar.');
    } finally {
      setSaving(false);
    }
  }

  function onDelete(id, body = '', html = '', plain = '') {
    if (!id) return;
    let text = '';
    if (plain) {
      text = plain;
    } else if (html) {
      const tmp = document.createElement('div');
      tmp.innerHTML = sanitizeHtml(html);
      text = (tmp.textContent || '').trim();
    } else if (body) {
      text = String(body).replace(/[#*_`\-\d\.\[\]()]/g, '').trim();
    }
    const preview = text.length > 80 ? text.slice(0, 80) + '…' : text;
    setDeleteConfirmation({ isOpen: true, id, preview });
  }

  async function confirmDelete() {
    const { id } = deleteConfirmation;
    try {
      await deleteNote(pairId, id);
      // If we were viewing this note in the modal, close it and reset state
      if (selectedNote && selectedNote.id === id) {
        setIsModalOpen(false);
        setSelectedNote(null);
        setIsEditing(false);
        setHtml('');
        setTitle('');
        setEditingId('');
      }
      setDeleteConfirmation({ isOpen: false, id: '', preview: '' });
    } catch (e) {
      alert('Error al borrar');
      setDeleteConfirmation({ isOpen: false, id: '', preview: '' });
    }
  }

  function cancelDelete() {
    setDeleteConfirmation({ isOpen: false, id: '', preview: '' });
  }

  function openThread(thread) {
    setIsThreadView(true);
    setSelectedThreadId(thread.threadId);
    setSelectedNote(null);
    setEditingId('');
    setHtml('');
    setTitle('');
    setIsEditing(false);
    setError('');
    setIsModalOpen(true);
  }

  function replyToThread(threadId) {
    setSelectedNote(null);
    setEditingId('');
    setHtml('');
    setIsEditing(true);
    setError('');
    setTitle('');
    setReplyThreadId(threadId);
    setIsModalOpen(true);
  }

  function openNoteMessage(n) {
    const initialHtml = n.html ? sanitizeHtml(n.html) : (n.body ? sanitizeHtml((n.body || '').replace(/[\*#_`\[\]\(\)]/g, '')) : '');
    setHtml(initialHtml);
    setSelectedNote(n);
    setTitle(n.title || '');
    setIsEditing(false);
    setError('');
    setIsMessageModalOpen(true); // overlay above thread modal
  }

  function startNewNote() {
    setSelectedNote(null);
    setEditingId('');
    setHtml('');
    setIsEditing(true);
    setError('');
    setTitle('');
    setIsModalOpen(true);
  }

  // Group notes by threadId and compute ordering/unread
  const threads = useMemo(() => {
    const getMs = (x) => {
      const t = x?.createdAt;
      if (!t) return 0;
      if (typeof t.toMillis === 'function') return t.toMillis();
      if (t.seconds) return t.seconds * 1000;
      return 0;
    };
    const map = new Map();
    for (const n of notes) {
      const tid = n.threadId || n.id;
      if (!map.has(tid)) map.set(tid, []);
      map.get(tid).push(n);
    }
    const list = Array.from(map.entries()).map(([threadId, items]) => {
      items.sort((a, b) => getMs(a) - getMs(b));
      const latest = items[items.length - 1];
      const unread = items.some((it) => Array.isArray(it.unreadFor) && it.unreadFor.includes(identity));
      return { threadId, items, latest, unread };
    });
    list.sort((a, b) => {
      const am = (a.latest && (a.latest.createdAt?.toMillis?.() || (a.latest.createdAt?.seconds || 0) * 1000)) || 0;
      const bm = (b.latest && (b.latest.createdAt?.toMillis?.() || (b.latest.createdAt?.seconds || 0) * 1000)) || 0;
      return bm - am;
    });
    return list;
  }, [notes, identity]);

  // Estimate card height (rough) to balance columns without measuring DOM
  const estimateHeight = (t) => {
    const n = t.latest || {};
    const titleLen = (n.title || '').length;
    const textLen = n.html ? n.html.length : ((n.body || '').length);
    const itemsFactor = (t.items?.length || 1) * 8;
    return 120 + Math.min(600, Math.ceil((titleLen * 1.2 + textLen * 0.45) / 3)) + itemsFactor;
  };

  // Synchronous greedy split into two columns (avoids piling on the left)
  const splitThreads = useMemo(() => {
    const left = [];
    const right = [];
    let leftH = 0;
    let rightH = 0;
    for (const t of threads) {
      const h = estimateHeight(t);
      if (leftH <= rightH) { left.push(t); leftH += h; } else { right.push(t); rightH += h; }
    }
    return { left, right };
  }, [threads]);

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-rose-600">Notas</h2>

      {/* Grid 2 x n */}
      {loading ? (
        <div className="card text-gray-500 text-sm">Cargando…</div>
      ) : notes.length === 0 ? (
        <div className="card text-gray-500 text-sm">Aún no hay notas.</div>
      ) : (
        <div className="masonry-grid pb-20">
          <div className="masonry-col">
            {splitThreads.left.map((t) => {
              const n = t.latest;
              return (
                <div key={t.threadId} className="stack-wrapper relative">
                  <div
                    className="card p-4 flex flex-col relative cursor-pointer"
                    onClick={() => {
                      if (t.items.length > 1) {
                        openThread(t);
                      } else {
                        const only = t.items[0];
                        setSelectedNote(only);
                        setIsThreadView(false);
                        setIsEditing(false);
                        setHtml('');
                        setTitle(only?.title || '');
                        setIsModalOpen(true);
                      }
                    }}
                  >
                    {/* title + author */}
                    {n.title ? (
                      <div className="title-sm mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{n.title}</span>
                          {t.unread && <span className="inline-block w-2 h-2 bg-rose-500 rounded-full" title="Sin leer"></span>}
                        </div>
                        <div className="flex items-center gap-1">
                          {n.identity === 'yo' || n.identity === 'ella' ? (
                            <span className="text-base" title="Autor">{n.identity === 'yo' ? '🫒' : '🍪'}</span>
                          ) : null}
                          {t.items.length > 1 && (
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-700 text-[10px] leading-none border border-rose-200" title="Mensajes en el hilo">{t.items.length}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      (n.identity === 'yo' || n.identity === 'ella') ? (
                        <div className="title-sm mb-1 flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span />
                            {t.unread && <span className="inline-block w-2 h-2 bg-rose-500 rounded-full" title="Sin leer"></span>}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-base" title="Autor">{n.identity === 'yo' ? '🫒' : '🍪'}</span>
                            {t.items.length > 1 && (
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-700 text-[10px] leading-none border border-rose-200" title="Mensajes en el hilo">{t.items.length}</span>
                            )}
                          </div>
                        </div>
                      ) : null
                    )}
                    {/* content snippet of latest */}
                    <div className="note-snippet note-card">
                      {n.html ? (
                        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.html) }} />
                      ) : (
                        <MarkdownRenderer markdown={n.body || ''} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
          <div className="masonry-col">
            {splitThreads.right.map((t) => {
              const n = t.latest;
              return (
                <div key={t.threadId} className="stack-wrapper relative">
                  <div
                    className="card p-4 flex flex-col relative cursor-pointer"
                    onClick={() => {
                      if (t.items.length > 1) {
                        openThread(t);
                      } else {
                        const only = t.items[0];
                        setSelectedNote(only);
                        setIsThreadView(false);
                        setIsEditing(false);
                        setHtml('');
                        setTitle(only?.title || '');
                        setIsModalOpen(true);
                      }
                    }}
                  >
                    {/* title + author */}
                    {n.title ? (
                      <div className="title-sm mb-1 flex items-center justify-between">
                        <div className="flex items-center gap-2 min-w-0">
                          <span className="truncate">{n.title}</span>
                          {t.unread && <span className="inline-block w-2 h-2 bg-rose-500 rounded-full" title="Sin leer"></span>}
                        </div>
                        <div className="flex items-center gap-1">
                          {n.identity === 'yo' || n.identity === 'ella' ? (
                            <span className="text-base" title="Autor">{n.identity === 'yo' ? '🫒' : '🍪'}</span>
                          ) : null}
                          {t.items.length > 1 && (
                            <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-700 text-[10px] leading-none border border-rose-200" title="Mensajes en el hilo">{t.items.length}</span>
                          )}
                        </div>
                      </div>
                    ) : (
                      (n.identity === 'yo' || n.identity === 'ella') ? (
                        <div className="title-sm mb-1 flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            <span />
                            {t.unread && <span className="inline-block w-2 h-2 bg-rose-500 rounded-full" title="Sin leer"></span>}
                          </div>
                          <div className="flex items-center gap-1">
                            <span className="text-base" title="Autor">{n.identity === 'yo' ? '🫒' : '🍪'}</span>
                            {t.items.length > 1 && (
                              <span className="inline-flex items-center justify-center w-4 h-4 rounded-full bg-rose-100 text-rose-700 text-[10px] leading-none border border-rose-200" title="Mensajes en el hilo">{t.items.length}</span>
                            )}
                          </div>
                        </div>
                      ) : null
                    )}
                    {/* content snippet of latest */}
                    <div className="note-snippet note-card">
                      {n.html ? (
                        <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.html) }} />
                      ) : (
                        <MarkdownRenderer markdown={n.body || ''} />
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* FAB Nueva nota: render fuera del contenedor con scroll */}
      {createPortal(
        <button
          className="fab btn-primary shadow-lg rounded-full px-5 py-3 font-semibold"
          onClick={startNewNote}
          aria-label="Nueva nota"
          title="Nueva nota"
        >
          Nueva nota
        </button>,
        document.body
      )}

      {/* Modal Nueva Nota */}
      <Modal isOpen={isModalOpen} onClose={() => { try { if (isThreadView && selectedThreadId) { markThreadRead(pairId, selectedThreadId, identity); } else if (selectedNote) { const tid = selectedNote.threadId || selectedNote.id || ''; if (tid) markThreadRead(pairId, tid, identity); } } catch {}; setIsModalOpen(false); setEditingId(''); setHtml(''); setError(''); setSelectedNote(null); setIsEditing(false); setTitle(''); setReplyThreadId(''); setIsThreadView(false); setSelectedThreadId(''); setIsMessageModalOpen(false); }}>
        <div className="p-6 flex flex-col gap-4" style={{ maxHeight: '75vh' }}>
          {/* Thread view */}
          {!isEditing && isThreadView && (
            <>
              {(() => {
                const th = threads.find((x) => x.threadId === selectedThreadId);
                const count = th ? th.items.length : 0;
                const hasUnread = th && th.unread;
                return (
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2 min-w-0">
                      <h3 className="font-semibold text-lg truncate">{count} {count === 1 ? 'nota' : 'notas'}</h3>
                      {hasUnread && <span className="inline-block w-2 h-2 bg-rose-500 rounded-full" title="Sin leer"></span>}
                    </div>
                    <span />
                  </div>
                );
              })()}
              {/* List of mensajes en thread */}
              <div className="space-y-3 flex-1 overflow-y-auto pr-1">
                {(() => {
                  const th = threads.find((x) => x.threadId === selectedThreadId);
                  const items = th ? th.items : [];
                  return items.map((it) => {
                    const isUnread = Array.isArray(it.unreadFor) && it.unreadFor.includes(identity);
                    return (
                      <button
                        key={it.id}
                        className="text-left w-full note-content card p-3 hover:bg-rose-50 transition-colors"
                        onClick={() => { openNoteMessage(it); }}
                      >
                        <div className="mb-1 flex items-center justify-between">
                          <div className="flex items-center gap-2 min-w-0">
                            {it.title ? <span className="title-sm truncate">{it.title}</span> : <span />}
                            {isUnread && <span className="inline-block w-2 h-2 bg-rose-500 rounded-full" title="Sin leer"></span>}
                          </div>
                          <span className="text-base" title="Autor">{it.identity === 'yo' ? '🫒' : '🍪'}</span>
                        </div>
                        {it.html ? (
                          <div className="text-sm" dangerouslySetInnerHTML={{ __html: sanitizeHtml(it.html || '') }} />
                        ) : (
                          <MarkdownRenderer markdown={it.body || ''} />
                        )}
                      </button>
                    );
                  });
                })()}
              </div>
              <div className="flex items-center justify-between">
                <button type="button" onClick={() => setDeleteThreadConfirmation({ isOpen: true, threadId: selectedThreadId })} className="btn-link">Borrar hilo</button>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      try { markThreadRead(pairId, selectedThreadId, identity); } catch {}
                      setEditingId('');
                      setIsEditing(true);
                      setReplyThreadId(selectedThreadId);
                      setHtml('');
                      setTitle('');
                    }}
                    className="btn-primary"
                  >Responder</button>
                  <button
                    type="button"
                    onClick={() => {
                      try { markThreadRead(pairId, selectedThreadId, identity); } catch {}
                      setIsModalOpen(false);
                      setIsThreadView(false);
                      setSelectedThreadId('');
                    }}
                    className="btn-ghost"
                  >Cerrar</button>
                </div>
              </div>
            </>
          )}

          {/* Single note view (detalle) */}
          {!isEditing && !isThreadView && selectedNote && (
            <>
              {selectedNote.title ? (
                <h3 className="font-semibold text-lg">{selectedNote.title}</h3>
              ) : null}
              <div className="note-content">
                {selectedNote.html ? (
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedNote.html || '') }} />
                ) : (
                  <MarkdownRenderer markdown={selectedNote.body || ''} />
                )}
              </div>
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onDelete(selectedNote.id, selectedNote.body || '', selectedNote.html || '', selectedNote.plain || '')}
                  className="btn-link"
                >
                  Borrar
                </button>
                <div className="flex justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => {
                      try { markThreadRead(pairId, (selectedNote?.threadId || selectedNote?.id || ''), identity); } catch {}
                      setIsModalOpen(false);
                      setSelectedNote(null);
                    }}
                    className="btn-ghost"
                  >Cerrar</button>
                  <button
                    type="button"
                    onClick={() => {
                      try { markThreadRead(pairId, (selectedNote?.threadId || selectedNote?.id || ''), identity); } catch {}
                      setEditingId('');
                      setIsEditing(true);
                      setReplyThreadId(selectedNote?.threadId || selectedNote?.id || '');
                      setHtml('');
                      setTitle('');
                    }}
                    className="btn-primary"
                  >Responder</button>
                </div>
              </div>
            </>
          )}

          {/* Edit mode (crear/editar) */}
          {isEditing && (
            <form onSubmit={onSave} className="space-y-4">
              <input
                type="text"
                className="input w-full"
                placeholder="Título"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <RichTextEditor html={html} onChange={setHtml} />
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { if (selectedNote) { setIsEditing(false); } else { setIsModalOpen(false); } }} className="btn-ghost">Cancelar</button>
                <button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Guardando…' : (editingId ? 'Actualizar' : 'Guardar')}</button>
              </div>
            </form>
          )}
        </div>
      </Modal>

      {/* Overlay modal for single message detail */}
      <Modal isOpen={isMessageModalOpen} onClose={() => { setIsMessageModalOpen(false); setSelectedNote(null); setIsEditing(false); setHtml(''); setTitle(''); setEditingId(''); }}>
        <div className="p-6 space-y-4">
          {/* Single note view (detalle) */}
          {!isEditing && selectedNote && (
            <>
              {selectedNote.title ? (
                <h3 className="font-semibold text-lg">{selectedNote.title}</h3>
              ) : null}
              <div className="note-content">
                {selectedNote.html ? (
                  <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(selectedNote.html || '') }} />
                ) : (
                  <MarkdownRenderer markdown={selectedNote.body || ''} />
                )}
              </div>
              <div className="flex justify-end">
                <button type="button" onClick={() => { setIsMessageModalOpen(false); setSelectedNote(null); setEditingId(''); }} className="btn-ghost">Cerrar</button>
              </div>
            </>
          )}

          {/* Edit mode (crear/editar) within overlay */}
          {isEditing && (
            <form onSubmit={onSave} className="space-y-4">
              <input
                type="text"
                className="input w-full"
                placeholder="Título"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
              />
              <RichTextEditor html={html} onChange={setHtml} />
              {error && <p className="text-xs text-rose-600">{error}</p>}
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setIsEditing(false); }} className="btn-ghost">Cancelar</button>
                <button disabled={saving} className="btn-primary disabled:opacity-60">{saving ? 'Guardando…' : (editingId ? 'Actualizar' : 'Guardar')}</button>
              </div>
            </form>
          )}
        </div>
      </Modal>

      {/* Delete thread confirmation modal */}
      <Modal isOpen={deleteThreadConfirmation.isOpen} onClose={() => setDeleteThreadConfirmation({ isOpen: false, threadId: '' })}>
        <div className="p-6 text-center">
          <div className="text-4xl mb-4">🗑️</div>
          <h3 className="text-lg font-semibold mb-2">Borrar hilo</h3>
          <p className="text-gray-600 mb-6">Se borrarán todas las notas de este hilo. ¿Seguro?</p>
          <div className="flex gap-3 justify-center">
            <button 
              onClick={() => setDeleteThreadConfirmation({ isOpen: false, threadId: '' })}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={async () => { try { await deleteThread(pairId, deleteThreadConfirmation.threadId); } catch {}; setDeleteThreadConfirmation({ isOpen: false, threadId: '' }); setIsModalOpen(false); setIsThreadView(false); setSelectedThreadId(''); }}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Borrar hilo
            </button>
          </div>
        </div>
      </Modal>

      {/* Delete confirmation modal */}
      <Modal isOpen={deleteConfirmation.isOpen} onClose={cancelDelete}>
        <div className="p-6 text-center">
          <div className="text-4xl mb-4">🗑️</div>
          <h3 className="text-lg font-semibold mb-2">Borrar nota</h3>
          <p className="text-gray-600 mb-6">
            ¿Seguro que quieres borrar esta nota?
          </p>
          {deleteConfirmation.preview && (
            <div className="text-xs text-gray-500 mb-6 line-clamp-3">“{deleteConfirmation.preview}”</div>
          )}
          <div className="flex gap-3 justify-center">
            <button 
              onClick={cancelDelete}
              className="px-4 py-2 text-gray-600 bg-gray-100 rounded-lg hover:bg-gray-200 transition-colors"
            >
              Cancelar
            </button>
            <button 
              onClick={confirmDelete}
              className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
            >
              Borrar
            </button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
