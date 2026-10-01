import React from 'react';
import { render } from '@testing-library/react';
import MarkdownRenderer from './MarkdownRenderer';

const html = (markdown) => render(<MarkdownRenderer markdown={markdown} />).container.firstChild.innerHTML;
const P = 'class="mb-2 leading-relaxed"';

describe('MarkdownRenderer: lo que se ve no cambia', () => {
  test('enlace con parámetros (&) sigue apuntando a la misma URL', () => {
    const { container } = render(<MarkdownRenderer markdown="[web](https://example.com/a?x=1&y=2)" />);
    const a = container.querySelector('a');
    expect(a.getAttribute('href')).toBe('https://example.com/a?x=1&y=2');
    expect(a.textContent).toBe('web');
    expect(container.firstChild.innerHTML).toBe(
      `<p ${P}><a href="https://example.com/a?x=1&amp;y=2" target="_blank" rel="noopener" class="text-rose-600 underline">web</a></p>`
    );
  });

  test('emoji y negrita', () => {
    expect(html('Hola 🍪🫒 **amor**')).toBe(`<p ${P}>Hola 🍪🫒 <strong>amor</strong></p>`);
  });

  test('saltos de línea: un párrafo por línea y listas', () => {
    expect(html('uno\n\ndos\n- a\n- b')).toBe(
      `<p ${P}>uno</p><p ${P}>dos</p><ul class="list-disc list-inside space-y-1 mb-2"><li>a</li><li>b</li></ul>`
    );
  });

  test('las comillas en el texto se leen igual', () => {
    const { container } = render(<MarkdownRenderer markdown={`Dijo "hola" y it's & <b>`} />);
    expect(container.textContent).toBe(`Dijo "hola" y it's & <b>`);
    expect(container.querySelector('b')).toBeNull();
  });
});

describe('MarkdownRenderer: seguridad', () => {
  test('una comilla doble en la URL no abre atributos nuevos', () => {
    const { container } = render(<MarkdownRenderer markdown={'[x](https://a.com/"onmouseover="alert(1)"autofocus=")'} />);
    expect(container.querySelectorAll('[onmouseover],[autofocus]')).toHaveLength(0);
    expect(Array.from(container.querySelector('a').attributes).map((at) => at.name).sort()).toEqual(['class', 'href', 'rel', 'target']);
  });

  test('una comilla simple en la URL tampoco', () => {
    const { container } = render(<MarkdownRenderer markdown={"[x](https://a.com/'onmouseover='alert(1)')"} />);
    expect(container.querySelectorAll('[onmouseover]')).toHaveLength(0);
  });
});
