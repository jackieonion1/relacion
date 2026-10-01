// Lyrics and subtitle parsing for the player: cues are { start, end, text, tokens? } in seconds

// m:ss of a duration in seconds
export function fmtDuration(secs) {
  const s = Math.max(0, Math.floor(secs || 0));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${m}:${r.toString().padStart(2, '0')}`;
}

// Word timings of a cue: its own tokens, or its words spread evenly across the cue
export function getTokensForCue(c) {
  if (!c) return [];
  if (c.tokens && c.tokens.length) return c.tokens;
  // Fallback: evenly distribute words across cue duration
  const dur = Math.max(0.2, (c.end || (c.start + 2)) - c.start);
  const parts = (c.text || '').split(/(\s+)/); // keep spaces
  const words = parts.filter((p) => p.length > 0);
  const step = dur / Math.max(1, words.length);
  let t = c.start;
  return words.map((w) => {
    const tok = { start: t, end: t + step, text: w };
    t += step;
    return tok;
  });
}

export function parseTimeStamp(ts) {
  // supports mm:ss.xx, hh:mm:ss,ms or hh:mm:ss.ms
  if (!ts) return 0;
  const t = ts.trim();
  if (/^\d{1,2}:\d{2}(?:[\.:]\d{1,3})?$/.test(t)) {
    const [m, s] = t.split(':');
    const [sec, frac = '0'] = s.split(/[\.:]/);
    return (+m) * 60 + (+sec) + (+(`0.${frac}`));
  }
  const m = t.match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{2})(?:[\.,](\d{1,3}))?/);
  if (m) {
    const hh = +(m[1] || 0), mm = +m[2], ss = +m[3], ms = +(m[4] || 0);
    return hh * 3600 + mm * 60 + ss + (ms / 1000);
  }
  return 0;
}

export function parseLRC(text) {
  const lines = (text || '').split(/\r?\n/);
  const cues = [];
  for (const ln of lines) {
    // Find line timestamps like [mm:ss.xx]
    const lineTags = Array.from(ln.matchAll(/\[(\d{1,2}:\d{2}(?:[\.:]\d{1,2})?)\]/g));
    const content = ln.replace(/^(?:\[[^\]]+\])+\s*/, '');

    // Enhanced LRC per-word tokens like <mm:ss.xx>
    const tokenMatches = Array.from(content.matchAll(/<(\d{1,2}:\d{2}(?:[\.:]\d{1,2})?)>/g));
    if (tokenMatches.length > 0) {
      const tokens = [];
      // If there is leading text before the first <time> token, create a token for it using the line timestamp
      const firstMatch = tokenMatches[0];
      if (firstMatch && firstMatch.index > 0) {
        const leadText = content.slice(0, firstMatch.index);
        const lineStart = lineTags[0] ? parseTimeStamp(lineTags[0][1]) : parseTimeStamp(firstMatch[1]);
        tokens.push({ start: lineStart, end: Infinity, text: leadText });
      }
      for (let i = 0; i < tokenMatches.length; i++) {
        const m = tokenMatches[i];
        const start = parseTimeStamp(m[1]);
        const startIdx = m.index + m[0].length;
        const endIdx = (i + 1 < tokenMatches.length) ? tokenMatches[i + 1].index : content.length;
        const textChunk = content.slice(startIdx, endIdx);
        tokens.push({ start, end: Infinity, text: textChunk });
      }
      const firstStart = tokens.length ? tokens[0].start : (lineTags[0] ? parseTimeStamp(lineTags[0][1]) : 0);
      cues.push({ start: firstStart, end: Infinity, text: content.replace(/<\d{1,2}:\d{2}(?:[\.:]\d{1,2})?>/g, ''), tokens });
      continue;
    }

    // Regular line-level LRC
    for (const tg of lineTags) {
      const start = parseTimeStamp(tg[1]);
      cues.push({ start, end: Infinity, text: content });
    }
  }
  cues.sort((a, b) => a.start - b.start);
  for (let i = 0; i < cues.length; i++) {
    const nextStart = (i + 1 < cues.length) ? cues[i + 1].start : Infinity;
    cues[i].end = Math.max(cues[i].start, (isFinite(nextStart) ? nextStart - 0.01 : cues[i].start + 3600));
    if (cues[i].tokens && cues[i].tokens.length) {
      const toks = cues[i].tokens;
      toks.sort((a, b) => a.start - b.start);
      for (let j = 0; j < toks.length; j++) {
        const tNext = (j + 1 < toks.length) ? toks[j + 1].start : cues[i].end;
        toks[j].end = Math.max(toks[j].start, tNext - 0.01);
      }
    }
  }
  return cues;
}

export function parseSRTorVTT(text) {
  const cues = [];
  const norm = (text || '').replace(/\r/g, '').replace(/^WEBVTT.*?\n\n/, '');
  const blocks = norm.split(/\n\n+/);
  for (const b of blocks) {
    const lines = b.split(/\n/).filter(Boolean);
    if (!lines.length) continue;
    const timeIdx = lines[0].includes('-->') ? 0 : 1;
    const timeLine = lines[timeIdx] || '';
    const m = timeLine.match(/(\d{1,2}:\d{2}:\d{2}[\.,]\d{1,3}|\d{1,2}:\d{2}[\.,]\d{1,3})\s*-->\s*(\d{1,2}:\d{2}:\d{2}[\.,]\d{1,3}|\d{1,2}:\d{2}[\.,]\d{1,3})/);
    if (!m) continue;
    const start = parseTimeStamp(m[1]);
    const end = parseTimeStamp(m[2]);
    const content = lines.slice(timeIdx + 1).join('\n').trim();
    cues.push({ start, end, text: content });
  }
  cues.sort((a, b) => a.start - b.start);
  return cues;
}

// Cues of a subtitles file by its extension (lrc, srt, vtt); anything else is one line every 3 s
export function parseSubtitles(type, text) {
  const ext = (type || '').toLowerCase();
  if (ext === 'lrc') return parseLRC(text);
  if (ext === 'srt' || ext === 'vtt') return parseSRTorVTT(text);
  // Fallback: split lines
  return (text || '').split(/\r?\n/).filter(Boolean).map((t, i) => ({ start: i * 3, end: (i + 1) * 3, text: t }));
}
