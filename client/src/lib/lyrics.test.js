import { fmtDuration, getTokensForCue, parseLRC, parseSRTorVTT, parseSubtitles, parseTimeStamp } from './lyrics';

describe('fmtDuration', () => {
  test('minutos y segundos con dos cifras, sin negativos ni decimales', () => {
    expect(fmtDuration(0)).toBe('0:00');
    expect(fmtDuration(65.9)).toBe('1:05');
    expect(fmtDuration(3600)).toBe('60:00');
    expect(fmtDuration(-3)).toBe('0:00');
    expect(fmtDuration(undefined)).toBe('0:00');
    expect(fmtDuration(NaN)).toBe('0:00');
  });
});

describe('parseTimeStamp', () => {
  test('lee mm:ss.xx de LRC y hh:mm:ss,ms de SRT/VTT', () => {
    expect(parseTimeStamp('01:02.5')).toBeCloseTo(62.5);
    expect(parseTimeStamp('01:02.05')).toBeCloseTo(62.05);
    expect(parseTimeStamp('1:02')).toBe(62);
    expect(parseTimeStamp('00:01:02,250')).toBeCloseTo(62.25);
    expect(parseTimeStamp('01:00:00.000')).toBe(3600);
    expect(parseTimeStamp('')).toBe(0);
    expect(parseTimeStamp('nada')).toBe(0);
  });
});

describe('parseLRC', () => {
  test('una línea por marca, ordenadas, y cada una acaba justo antes de la siguiente', () => {
    const cues = parseLRC('[ar:Alguien]\n[00:10.00]Segunda\n[00:05.00]Primera\n[00:20.00][00:30.00]Estribillo');
    expect(cues.map((c) => [c.start, c.text])).toEqual([[5, 'Primera'], [10, 'Segunda'], [20, 'Estribillo'], [30, 'Estribillo']]);
    expect(cues[0].end).toBeCloseTo(9.99);
    expect(cues[3].end).toBe(30 + 3600);
  });

  test('LRC mejorado: palabra a palabra con <mm:ss.xx>, y el texto de antes va con la marca de línea', () => {
    const [cue] = parseLRC('[00:01.00]Hola <00:02.00>mi <00:03.00>amor');
    expect(cue.start).toBe(1);
    expect(cue.text).toBe('Hola mi amor');
    expect(cue.tokens.map((t) => [t.start, t.text])).toEqual([[1, 'Hola '], [2, 'mi '], [3, 'amor']]);
    expect(cue.tokens[0].end).toBeCloseTo(1.99);
    expect(cue.tokens[2].end).toBeCloseTo(cue.end - 0.01);
  });

  test('líneas sin marca no salen', () => {
    expect(parseLRC('sin marca\n\n')).toEqual([]);
  });
});

describe('parseSRTorVTT', () => {
  test('SRT con número de bloque y texto en varias líneas', () => {
    const cues = parseSRTorVTT('1\r\n00:00:01,000 --> 00:00:02,500\r\nHola\r\nmundo\r\n\r\n2\r\n00:00:03,000 --> 00:00:04,000\r\nAdiós\r\n');
    expect(cues).toEqual([{ start: 1, end: 2.5, text: 'Hola\nmundo' }, { start: 3, end: 4, text: 'Adiós' }]);
  });

  test('VTT con cabecera y tiempos mm:ss.ms', () => {
    const cues = parseSRTorVTT('WEBVTT\n\n00:04.000 --> 00:05.000\nDos\n\n00:01.000 --> 00:02.000\nUno');
    expect(cues).toEqual([{ start: 1, end: 2, text: 'Uno' }, { start: 4, end: 5, text: 'Dos' }]);
  });
});

describe('parseSubtitles', () => {
  test('elige el parser por la extensión, sin importar mayúsculas', () => {
    expect(parseSubtitles('LRC', '[00:01.00]a')[0].text).toBe('a');
    expect(parseSubtitles('vtt', 'WEBVTT\n\n00:01.000 --> 00:02.000\nb')[0].text).toBe('b');
  });

  test('cualquier otra cosa es una línea cada 3 segundos', () => {
    expect(parseSubtitles('txt', 'uno\n\ndos')).toEqual([{ start: 0, end: 3, text: 'uno' }, { start: 3, end: 6, text: 'dos' }]);
  });
});

describe('getTokensForCue', () => {
  test('usa las palabras con tiempo si las hay', () => {
    const tokens = [{ start: 1, end: 2, text: 'ya' }];
    expect(getTokensForCue({ start: 1, end: 2, text: 'ya', tokens })).toBe(tokens);
  });

  test('si no, reparte las palabras (y los espacios) a partes iguales', () => {
    const tokens = getTokensForCue({ start: 10, end: 13, text: 'te quiero' });
    expect(tokens.map((t) => t.text)).toEqual(['te', ' ', 'quiero']);
    expect(tokens.map((t) => t.start)).toEqual([10, 11, 12]);
    expect(tokens[2].end).toBe(13);
  });

  test('sin cue no hay palabras', () => {
    expect(getTokensForCue(null)).toEqual([]);
  });
});
