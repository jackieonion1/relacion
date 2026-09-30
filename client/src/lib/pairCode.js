// Código de pareja: 4-12 letras/números, siempre en mayúsculas (mismo formato que pide la puerta de entrada)
export function normalizePairCode(raw = '') {
  return String(raw || '').trim().toUpperCase();
}

export function isValidPairCode(raw = '') {
  return /^[A-Z0-9]{4,12}$/.test(normalizePairCode(raw));
}
