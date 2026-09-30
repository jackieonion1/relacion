import { sanitizeHtml, htmlToPlain } from './sanitize';

describe('sanitizeHtml: saltos de línea', () => {
  test('convierte los <div> que mete Enter en <p> en vez de aplanarlos', () => {
    expect(sanitizeHtml('hola<div>segunda</div><div>tercera</div>'))
      .toBe('hola<p>segunda</p><p>tercera</p>');
  });

  test('mantiene las líneas vacías (<div><br></div>) y el formato interno', () => {
    expect(sanitizeHtml('<div>uno</div><div><br></div><div><b>tres</b></div>'))
      .toBe('<p>uno</p><p><br></p><p><b>tres</b></p>');
  });

  test('es idempotente (se sanitiza al guardar y otra vez al pintar)', () => {
    const once = sanitizeHtml('a<div>b</div><div><i>c</i></div>');
    expect(sanitizeHtml(once)).toBe(once);
  });

  test('conserva <br>, <p> y listas', () => {
    const html = '<p>a<br>b</p><ul><li>x</li></ul>';
    expect(sanitizeHtml(html)).toBe(html);
  });
});

describe('sanitizeHtml: seguridad', () => {
  test('un <div> no se lleva por delante la limpieza de sus hijos', () => {
    const out = sanitizeHtml('<div onclick="x()"><img src=x onerror="alert(1)"><script>alert(2)</script>ok</div>');
    expect(out).not.toMatch(/<img|<script|onerror|onclick/i);
    expect(out).toContain('ok');
  });

  test('quita atributos peligrosos de las etiquetas permitidas', () => {
    const out = sanitizeHtml('<p onmouseover="x()" style="color:red">a</p><span onclick="x()">b</span>');
    expect(out).toBe('<p>a</p><span>b</span>');
  });

  test('elimina hrefs que no sean http, https, mailto o tel', () => {
    const out = sanitizeHtml('<a href="javascript:alert(1)">x</a><a href="data:text/html,hola">y</a>');
    expect(out).not.toMatch(/javascript:|data:/i);
  });

  test('deja los enlaces válidos con target y rel', () => {
    const doc = document.createElement('div');
    doc.innerHTML = sanitizeHtml('<a href="https://example.com" onclick="x()">x</a>');
    const a = doc.querySelector('a');
    expect(a.getAttribute('href')).toBe('https://example.com');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener');
    expect(a.getAttribute('onclick')).toBeNull();
  });

  test('las etiquetas no permitidas quedan como texto escapado, no como HTML', () => {
    const out = sanitizeHtml('<div><script>alert(1)</script><iframe src="//evil"></iframe></div>');
    expect(out).not.toMatch(/<script|<iframe/i);
  });
});

describe('htmlToPlain', () => {
  test('una línea por bloque y por <br>', () => {
    expect(htmlToPlain('<p>uno</p><p>dos</p>')).toBe('uno\ndos');
    expect(htmlToPlain('uno<br>dos')).toBe('uno\ndos');
    expect(htmlToPlain('<ul><li>a</li><li>b</li></ul>')).toBe('a\nb');
  });

  test('no acumula más de una línea en blanco seguida', () => {
    expect(htmlToPlain('<p>a</p><p><br></p><p><br></p><p><br></p><p>b</p>')).toBe('a\n\nb');
  });
});
