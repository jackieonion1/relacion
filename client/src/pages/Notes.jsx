import React, { useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import Modal from '../components/Modal';
import RichTextEditor from '../components/RichTextEditor';
import MarkdownRenderer from '../components/MarkdownRenderer';
import { addNote, deleteNote, listenNotes, updateNote } from '../lib/notes';
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
        await addNote(pairId, { html: clean, plain, title: titleTrim }, identity);
      }
      setHtml('');
      setEditingId('');
      setSelectedNote(null);
      setIsEditing(false);
      setTitle('');
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

  function openNote(n) {
    const initialHtml = n.html ? sanitizeHtml(n.html) : (n.body ? sanitizeHtml((n.body || '').replace(/[\*#_`\[\]\(\)]/g, '')) : '');
    setHtml(initialHtml);
    setEditingId(n.id);
    setSelectedNote(n);
    setTitle(n.title || '');
    setIsEditing(false); // start in view mode
    setError('');
    setIsModalOpen(true);
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

  return (
    <div className="space-y-4">
      <h2 className="text-lg font-semibold text-rose-600">Notas</h2>

      {/* Grid 2 x n */}
      {loading ? (
        <div className="card text-gray-500 text-sm">Cargando…</div>
      ) : notes.length === 0 ? (
        <div className="card text-gray-500 text-sm">Aún no hay notas.</div>
      ) : (
        <div className="masonry pb-20">
          {notes.map((n) => (
            <div key={n.id} className="card p-3 flex flex-col">
              <div className="flex-1 min-h-[40px] note-content note-card cursor-pointer" onClick={() => openNote(n)}>
                {n.title ? (
                  <div className="title-sm mb-1">{n.title}</div>
                ) : null}
                <div className="note-snippet">
                  {n.html ? (
                    <div dangerouslySetInnerHTML={{ __html: sanitizeHtml(n.html) }} />
                  ) : (
                    <MarkdownRenderer markdown={n.body || ''} />
                  )}
                </div>
              </div>
              <div className="flex justify-end mt-2">
                <button onClick={() => onDelete(n.id, n.body || '', n.html || '', n.plain || '')} className="btn-link text-sm">Borrar</button>
              </div>
            </div>
          ))}
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
      <Modal isOpen={isModalOpen} onClose={() => { setIsModalOpen(false); setEditingId(''); setHtml(''); setError(''); setSelectedNote(null); setIsEditing(false); setTitle(''); }}>
        <div className="p-6 space-y-4">
          {/* View mode (detalle) */}
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
              <div className="flex items-center justify-between">
                <button
                  type="button"
                  onClick={() => onDelete(selectedNote.id, selectedNote.body || '', selectedNote.html || '', selectedNote.plain || '')}
                  className="btn-link"
                >
                  Borrar
                </button>
                <div className="flex justify-end gap-2">
                  <button type="button" onClick={() => { setIsModalOpen(false); setSelectedNote(null); }} className="btn-ghost">Cerrar</button>
                  <button type="button" onClick={() => { setIsEditing(true); }} className="btn-primary">Editar</button>
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
