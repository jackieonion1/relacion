// Helpers de paginación (la consulta pide pageSize + 1 para saber si hay más sin una lectura vacía)
export function splitPage(docs = [], pageSize = 60) {
  return { page: docs.slice(0, pageSize), hasMore: docs.length > pageSize };
}

// Añade una página al final sin repetir ids (p. ej. una foto recién subida que ya está en la lista)
export function mergeUnique(prev = [], next = []) {
  const seen = new Set(prev.map((it) => it.id));
  const out = [...prev];
  for (const it of next) {
    if (!seen.has(it.id)) { seen.add(it.id); out.push(it); }
  }
  return out;
}
