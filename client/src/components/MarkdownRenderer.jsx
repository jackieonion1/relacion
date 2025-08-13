import React from 'react';

function escapeHtml(str = '') {
  return String(str)
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;');
}

function renderInline(text) {
  let s = escapeHtml(text);
  // Links: [text](http...)
  s = s.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, '<a href="$2" target="_blank" rel="noopener" class="text-rose-600 underline">$1<\/a>');
  // Bold: **text**
  s = s.replace(/\*\*([^*]+)\*\*/g, '<strong>$1<\/strong>');
  // Italic: *text* (not **)
  s = s.replace(/(^|[^*])\*([^*]+)\*/g, '$1<em>$2<\/em>');
  // Italic: _text_
  s = s.replace(/(^|[^_])_([^_]+)_/g, '$1<em>$2<\/em>');
  return s;
}

function toHtml(md = '') {
  const lines = String(md).replaceAll('\r\n', '\n').split('\n');
  let html = '';
  let listType = null; // 'ul' | 'ol'

  const closeList = () => {
    if (listType) {
      html += `</${listType}>`;
      listType = null;
    }
  };

  for (let raw of lines) {
    const line = raw.trimEnd();
    if (!line.trim()) {
      closeList();
      continue;
    }

    // Headings #, ## (map to h3/h4 for consistency)
    if (/^##\s+/.test(line)) {
      closeList();
      html += `<h4 class="font-semibold text-gray-900 mb-1">${renderInline(line.replace(/^##\s+/, ''))}</h4>`;
      continue;
    }
    if (/^#\s+/.test(line)) {
      closeList();
      html += `<h3 class="font-semibold text-gray-900 mb-1">${renderInline(line.replace(/^#\s+/, ''))}</h3>`;
      continue;
    }

    // Ordered list
    const olMatch = line.match(/^\d+\.\s+(.+)/);
    if (olMatch) {
      if (listType !== 'ol') {
        closeList();
        listType = 'ol';
        html += '<ol class="list-decimal list-inside space-y-1 mb-2">';
      }
      html += `<li>${renderInline(olMatch[1])}</li>`;
      continue;
    }

    // Unordered list
    const ulMatch = line.match(/^[-*]\s+(.+)/);
    if (ulMatch) {
      if (listType !== 'ul') {
        closeList();
        listType = 'ul';
        html += '<ul class="list-disc list-inside space-y-1 mb-2">';
      }
      html += `<li>${renderInline(ulMatch[1])}</li>`;
      continue;
    }

    // Paragraph
    closeList();
    html += `<p class="mb-2 leading-relaxed">${renderInline(line)}</p>`;
  }

  closeList();
  return html;
}

export default function MarkdownRenderer({ markdown }) {
  const __html = toHtml(markdown || '');
  return (
    <div className="prose prose-sm max-w-none" dangerouslySetInnerHTML={{ __html }} />
  );
}
