// Very small HTML sanitizer for our WYSIWYG notes.
// Whitelist approach: only allow a subset of safe tags and attributes.
export function sanitizeHtml(dirty = '') {
  const allowedTags = new Set(['B', 'STRONG', 'I', 'EM', 'U', 'S', 'BR', 'P', 'UL', 'OL', 'LI', 'A', 'SPAN', '#text']);
  const allowedAttrs = {
    A: new Set(['href', 'target', 'rel']),
    SPAN: new Set([]),
    P: new Set([]),
    UL: new Set([]),
    OL: new Set([]),
    LI: new Set([]),
    B: new Set([]),
    STRONG: new Set([]),
    I: new Set([]),
    EM: new Set([]),
    U: new Set([]),
    S: new Set([]),
  };

  const template = document.createElement('template');
  template.innerHTML = String(dirty);

  const sanitizeNode = (node) => {
    if (node.nodeType === Node.TEXT_NODE) return; // always allowed
    const tag = node.nodeName;
    if (!allowedTags.has(tag)) {
      // Replace disallowed element with its text content (flatten)
      const text = document.createTextNode(node.textContent || '');
      node.replaceWith(text);
      return;
    }

    // Clean attributes
    for (const attr of Array.from(node.attributes || [])) {
      const tagAllowed = allowedAttrs[tag] || new Set();
      if (!tagAllowed.has(attr.name)) node.removeAttribute(attr.name);
    }

    // Special handling for <a>
    if (tag === 'A') {
      let href = node.getAttribute('href') || '';
      // Normalize common bare domains like "www.example.com"
      if (/^www\./i.test(href)) href = `https://${href}`;
      // Allow http, https, mailto, tel
      if (/^(https?:\/\/|mailto:|tel:)/i.test(href)) {
        node.setAttribute('href', href);
        node.setAttribute('target', '_blank');
        node.setAttribute('rel', 'noopener');
      } else {
        node.removeAttribute('href');
      }
    }

    // Recurse children
    for (const child of Array.from(node.childNodes)) sanitizeNode(child);
  };

  for (const child of Array.from(template.content.childNodes)) sanitizeNode(child);
  return template.innerHTML;
}
