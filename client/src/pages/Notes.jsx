import React, { useEffect, useId, useMemo, useRef, useState } from 'react';
import Sheet from '../components/Sheet';
import Button from '../components/Button';
import Icon from '../components/Icon';
import NoteCard from '../components/NoteCard';
import NoteThread, { NoteBody } from '../components/NoteThread';
import RichTextEditor from '../components/RichTextEditor';
import { addNote, deleteNote, listenNotes, deleteThread, markThreadRead } from '../lib/notes';
import { sanitizeHtml, htmlToPlain } from '../lib/sanitize';
import { authorEmoji, noteMillis, noteWhen } from '../lib/noteText';
import { registrarActividad, borrarActividad } from '../lib/actividad';

export default function Notes() {
  const pairId = useMemo(() => localStorage.getItem('pairId') || '', []);
  const identity = useMemo(() => localStorage.getItem('identity') || 'yo', []);
  const [notes, setNotes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState(false);
  const [listenKey, setListenKey] = useState(0); // bump to subscribe again after an error
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [html, setHtml] = useState('');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(''); // write rejected after the sheet was closed, or a delete that failed
  const [deleteConfirmation, setDeleteConfirmation] = useState({ isOpen: false, id: '', preview: '' });
  const [selectedNote, setSelectedNote] = useState(null); // note object when viewing/editing existente
  const [isEditing, setIsEditing] = useState(false); // controls modal mode
  const [title, setTitle] = useState('');
  const [replyThreadId, setReplyThreadId] = useState('');
  const [isThreadView, setIsThreadView] = useState(false);
  const [selectedThreadId, setSelectedThreadId] = useState('');
  const [deleteThreadConfirmation, setDeleteThreadConfirmation] = useState({ isOpen: false, threadId: '' });
  const [isMessageModalOpen, setIsMessageModalOpen] = useState(false);
  const [optionsOpen, setOptionsOpen] = useState(false);
  const titleId = useId();

  useEffect(() => {
    // Sync unsubscribe; without a session yet it reports an error but still subscribes when the session arrives
    const unsub = listenNotes(pairId, { max: 200 }, (list) => {
      setNotes(list);
      setLoadError(false);
      setLoading(false);
    }, () => {
      setLoadError(true);
      setLoading(false);
    });
    return () => { try { unsub(); } catch {} };
  }, [pairId, listenKey]);

  // Leaving Notas with the sheet open (back, another tab, a notification) unmounts the page without any of the
  // five exits: the thread being read is marked read on the way out too
  const readingThreadId = isModalOpen && !isEditing
    ? (isThreadView ? selectedThreadId : (selectedNote?.threadId || selectedNote?.id || ''))
    : '';
  const readingRef = useRef('');
  useEffect(() => { readingRef.current = readingThreadId; }, [readingThreadId]);
  useEffect(() => () => {
    const tid = readingRef.current;
    if (tid) { try { markThreadRead(pairId, tid, identity); } catch {} }
  }, [pairId, identity]);

  async function onSave(e) {
    e.preventDefault();
    if (!html || !html.replace(/<[^>]*>/g, '').trim()) {
      setError('Escribe algo para la nota.');
      return;
    }
    setSaving(true);
    setError('');
    setNotice('');
    try {
      const clean = sanitizeHtml(html);
      const plain = htmlToPlain(clean);
      const titleTrim = (title || '').trim();
      // Only waits for the write to be queued, not for the server ack (offline it never arrives)
      const { id, committed } = await addNote(pairId, { html: clean, plain, title: titleTrim }, identity, { threadId: replyThreadId || '' });
      registrarActividad(pairId, identity, 'nota', { ref: { noteId: id, threadId: replyThreadId || id }, clave: id, texto: titleTrim || plain });
      // If the server ends up rejecting it the listener drops the note: say so instead of losing it silently
      committed.catch(() => {
        setNotice(`No se pudo guardar la nota${titleTrim ? ` "${titleTrim}"` : ''}.`);
      });
      setHtml('');
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
      borrarActividad(pairId, 'nota', { clave: id }); // its aviso goes with it
      // If we were viewing this note in the modal, close it and reset state
      if (selectedNote && selectedNote.id === id) {
        setIsModalOpen(false);
        setSelectedNote(null);
        setIsEditing(false);
        setHtml('');
        setTitle('');
      }
      setDeleteConfirmation({ isOpen: false, id: '', preview: '' });
    } catch (e) {
      setNotice('No se pudo borrar la nota.');
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
    setHtml('');
    setTitle('');
    setIsEditing(false);
    setError('');
    setIsModalOpen(true);
  }

  function openSingle(only) {
    setSelectedNote(only);
    setIsThreadView(false);
    setIsEditing(false);
    setHtml('');
    setTitle(only?.title || '');
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
    setHtml('');
    setIsEditing(true);
    setError('');
    setTitle('');
    // A reply cancelled with «Cancelar» left these set, and the next new note went into that thread
    setReplyThreadId('');
    setIsThreadView(false);
    setSelectedThreadId('');
    setIsModalOpen(true);
  }

  // Exit: scrim or Escape. Marks read whatever was open (thread or single note)
  function closeNoteSheet() {
    try {
      if (isThreadView && selectedThreadId) {
        markThreadRead(pairId, selectedThreadId, identity);
      } else if (selectedNote) {
        const tid = selectedNote.threadId || selectedNote.id || '';
        if (tid) markThreadRead(pairId, tid, identity);
      }
    } catch {}
    setIsModalOpen(false); setHtml(''); setError(''); setSelectedNote(null); setIsEditing(false); setTitle('');
    setReplyThreadId(''); setIsThreadView(false); setSelectedThreadId(''); setIsMessageModalOpen(false);
  }

  function askDeleteOpen() {
    setOptionsOpen(false);
    if (isThreadView) {
      // The notes of the thread now: their avisos go with it
      setDeleteThreadConfirmation({ isOpen: true, threadId: selectedThreadId, ids: notes.filter((n) => (n.threadId || n.id) === selectedThreadId).map((n) => n.id) });
    } else if (selectedNote) {
      onDelete(selectedNote.id, selectedNote.body || '', selectedNote.html || '', selectedNote.plain || '');
    }
  }

  // Group notes by threadId and compute ordering/unread
  const threads = useMemo(() => {
    const map = new Map();
    for (const n of notes) {
      const tid = n.threadId || n.id;
      if (!map.has(tid)) map.set(tid, []);
      map.get(tid).push(n);
    }
    const list = Array.from(map.entries()).map(([threadId, items]) => {
      items.sort((a, b) => noteMillis(a) - noteMillis(b));
      const latest = items[items.length - 1];
      const unread = items.some((it) => Array.isArray(it.unreadFor) && it.unreadFor.includes(identity));
      return { threadId, items, latest, unread };
    });
    list.sort((a, b) => noteMillis(b.latest) - noteMillis(a.latest));
    return list;
  }, [notes, identity]);

  const openThreadData = isThreadView ? threads.find((x) => x.threadId === selectedThreadId) : null;
  const threadCount = openThreadData ? openThreadData.items.length : 0;
  const readingTitle = isThreadView ? openThreadData?.items[0]?.title : selectedNote?.title;

  return (
    // Own 16 px gutter: with R2 the shell's <main> has no padding on this route (bottom room for the bar is the shell's)
    <div className="flex flex-col gap-4 px-4 pb-6">
      <header className="flex items-end justify-between gap-3 pt-1.5 pl-1">
        <h1 className="serif text-4xl leading-[1.05] font-normal tracking-[-0.01em]">Notas</h1>
        <Button icon="editar" onClick={startNewNote}>Escribir</Button>
      </header>

      {notice && (
        <div role="status" className="card flex items-center justify-between gap-3 py-2 pr-2 text-[15px] text-ink">
          <span>{notice}</span>
          <Button icon="cerrar" label="Cerrar aviso" onClick={() => setNotice('')} />
        </div>
      )}
      {loadError && (
        <section role="alert" className="flex items-center justify-between gap-3 py-3 pl-4 pr-3 rounded-hero bg-sunk">
          <p className="text-[15px] text-ink">No se pudieron cargar las notas.</p>
          <Button variant="sec" onClick={() => { setLoadError(false); setListenKey((k) => k + 1); }}>Reintentar</Button>
        </section>
      )}

      {loading ? (
        <div aria-label="Cargando notas" className="flex flex-col gap-2.5">
          <span className="block h-[142px] rounded-tarjeta bg-sunk animate-pulse" />
          <span className="block h-[142px] rounded-tarjeta bg-sunk animate-pulse" />
          <span className="block h-[142px] rounded-tarjeta bg-sunk animate-pulse" />
        </div>
      ) : notes.length === 0 ? (
        !loadError && (
          <section className="flex flex-col items-center gap-2.5 py-9 px-6 rounded-hero border-[1.5px] border-dashed border-line text-center">
            <h2 className="serif text-[26px] font-normal">Ninguna nota todavía</h2>
            <p className="max-w-[260px] text-[15px] text-ink-2 text-pretty">Una lista, una receta, algo que no quieres que se te olvide decir.</p>
            <Button size="m" onClick={startNewNote}>Escribir la primera</Button>
          </section>
        )
      ) : (
        <div className="flex flex-col gap-2.5">
          {threads.map((t) => (
            <NoteCard key={t.threadId} thread={t} onOpen={() => (t.items.length > 1 ? openThread(t) : openSingle(t.items[0]))} />
          ))}
        </div>
      )}

      {/* The note sheet: thread, single note or editor. Its five exits mark the thread read (plan F10) */}
      <Sheet isOpen={isModalOpen} onClose={closeNoteSheet} label={!isEditing && !readingTitle ? 'Nota' : undefined}>
        {/* Thread view */}
        {!isEditing && isThreadView && (
          <NoteThread
            items={openThreadData ? openThreadData.items : []}
            identity={identity}
            countLabel={`${threadCount} ${threadCount === 1 ? 'nota' : 'notas'}`}
            unread={!!openThreadData?.unread}
            onOptions={() => setOptionsOpen(true)}
            onOpenMessage={openNoteMessage}
            onReply={() => {
              try { markThreadRead(pairId, selectedThreadId, identity); } catch {}
              setIsEditing(true);
              setReplyThreadId(selectedThreadId);
              setHtml('');
              setTitle('');
            }}
            onBack={() => {
              try { markThreadRead(pairId, selectedThreadId, identity); } catch {}
              setIsModalOpen(false);
              setIsThreadView(false);
              setSelectedThreadId('');
            }}
          />
        )}

        {/* Single note view (detalle) */}
        {!isEditing && !isThreadView && selectedNote && (
          <NoteThread
            items={[selectedNote]}
            identity={identity}
            countLabel=""
            unread={false}
            onOptions={() => setOptionsOpen(true)}
            onOpenMessage={openNoteMessage}
            onBack={() => {
              try { markThreadRead(pairId, (selectedNote?.threadId || selectedNote?.id || ''), identity); } catch {}
              setIsModalOpen(false);
              setSelectedNote(null);
            }}
            onReply={() => {
              try { markThreadRead(pairId, (selectedNote?.threadId || selectedNote?.id || ''), identity); } catch {}
              setIsEditing(true);
              setReplyThreadId(selectedNote?.threadId || selectedNote?.id || '');
              setHtml('');
              setTitle('');
            }}
          />
        )}

        {/* Editor: new note or reply, both with the optional title */}
        {isEditing && (
          <form onSubmit={onSave} className="flex flex-col gap-3 px-5 pt-1 pb-[34px]">
            <div className="grid grid-cols-[1fr_auto_1fr] items-center gap-2">
              <Button
                variant="txt"
                onClick={() => { if (selectedNote) { setIsEditing(false); } else { setIsModalOpen(false); } }}
                className="justify-self-start px-1 text-base text-ink-2"
              >Cancelar</Button>
              <h2 className="etiqueta">{replyThreadId ? 'Respuesta' : 'Nueva nota'}</h2>
              <Button type="submit" busy={saving} busyText="Publicando…" className="justify-self-end">Publicar</Button>
            </div>
            <p className="flex items-center gap-2 text-[13px] text-ink-2">
              <span className="inline-flex items-center justify-center size-7 rounded-full bg-sunk text-[15px] leading-none">{authorEmoji(identity)}</span>
              Escribes tú
            </p>
            <label htmlFor={titleId} className="sr-only">Título (opcional)</label>
            <input
              id={titleId}
              type="text"
              placeholder="Título"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="serif w-full p-0 border-0 bg-transparent text-[32px] leading-[1.15] text-ink outline-hidden placeholder:text-ink-2"
            />
            <RichTextEditor html={html} onChange={setHtml} />
            {error && <p role="alert" className="text-sm text-danger">{error}</p>}
          </form>
        )}
      </Sheet>

      {/* One reply on its own, above the thread: only «Cerrar» */}
      <Sheet isOpen={isMessageModalOpen} onClose={() => { setIsMessageModalOpen(false); setSelectedNote(null); setIsEditing(false); setHtml(''); setTitle(''); }}>
        {!isEditing && selectedNote && (
          <div className="flex flex-col gap-3 px-5 pt-2 pb-[34px]">
            <p className="text-[13px] text-ink-2">
              {authorEmoji(selectedNote.identity) && <>{authorEmoji(selectedNote.identity)} · </>}{noteWhen(selectedNote)}
            </p>
            {selectedNote.title && <h2 className="serif text-[26px] leading-[1.15] font-normal break-words">{selectedNote.title}</h2>}
            <NoteBody note={selectedNote} className="pb-2 text-[17px] leading-[1.55]" />
            <Button variant="sec" size="l" onClick={() => { setIsMessageModalOpen(false); setSelectedNote(null); }}>Cerrar</Button>
          </div>
        )}
      </Sheet>

      {/* Nota-opciones: only «Borrar» (Q4: no editing, no deleting a single reply) */}
      <Sheet isOpen={optionsOpen} onClose={() => setOptionsOpen(false)} label="Opciones de la nota">
        <div className="flex flex-col px-3 pt-2 pb-[34px]">
          <button
            type="button"
            onClick={askDeleteOpen}
            className="flex items-center gap-3.5 min-h-14 px-3 rounded-control text-base font-semibold text-danger active:bg-sunk"
          >
            <Icon name="borrar" />Borrar nota
          </button>
        </div>
      </Sheet>

      {/* Delete thread confirmation */}
      <Sheet isOpen={deleteThreadConfirmation.isOpen} onClose={() => setDeleteThreadConfirmation({ isOpen: false, threadId: '' })}>
        <div className="flex flex-col gap-1.5 px-5 pt-2 pb-[34px]">
          <h2 className="serif text-[26px] leading-[1.15] font-normal">¿Borrar esta nota?</h2>
          <p className="pb-3.5 text-[15px] text-ink-2">Se borra con sus respuestas, para los dos. No se puede deshacer.</p>
          <Button
            variant="dan"
            size="l"
            onClick={async () => { try { await deleteThread(pairId, deleteThreadConfirmation.threadId); (deleteThreadConfirmation.ids || []).forEach((id) => borrarActividad(pairId, 'nota', { clave: id })); } catch {}; setDeleteThreadConfirmation({ isOpen: false, threadId: '' }); setIsModalOpen(false); setIsThreadView(false); setSelectedThreadId(''); }}
          >Borrar nota</Button>
          <Button variant="txt" size="l" onClick={() => setDeleteThreadConfirmation({ isOpen: false, threadId: '' })}>Cancelar</Button>
        </div>
      </Sheet>

      {/* Delete single note confirmation */}
      <Sheet isOpen={deleteConfirmation.isOpen} onClose={cancelDelete}>
        <div className="flex flex-col gap-1.5 px-5 pt-2 pb-[34px]">
          <h2 className="serif text-[26px] leading-[1.15] font-normal">¿Borrar esta nota?</h2>
          {deleteConfirmation.preview && (
            <p className="py-1 text-[15px] text-ink line-clamp-3 break-words">“{deleteConfirmation.preview}”</p>
          )}
          <p className="pb-3.5 text-[15px] text-ink-2">Se borra para los dos. No se puede deshacer.</p>
          <Button variant="dan" size="l" onClick={confirmDelete}>Borrar nota</Button>
          <Button variant="txt" size="l" onClick={cancelDelete}>Cancelar</Button>
        </div>
      </Sheet>
    </div>
  );
}
