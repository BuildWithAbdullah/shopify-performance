// A dependency free scanner for storefront markup.
//
// It is deliberately small. It tokenises start tags, end tags and comments,
// keeps quoted attribute values intact, and treats a documented set of tags as
// raw text so that script and style bodies are never read as markup. What it
// cannot do is written down in tools/limits.mjs and proved there with a blind
// artefact and a contrast artefact.

// Contents are not parsed as markup.
const RAW_TEXT = new Set(['script', 'style', 'textarea', 'title']);
// Contents are not text a shopper can read. This is a different list from
// RAW_TEXT on purpose: a title has raw contents and those contents are text.
const NOT_TEXT = new Set(['script', 'style']);
const VOID = new Set([
  'area', 'base', 'br', 'col', 'embed', 'hr', 'img', 'input', 'link', 'meta',
  'param', 'source', 'track', 'wbr'
]);

const NAME_START = /[A-Za-z]/;

function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

function parseAttributes(chunk) {
  const attrs = Object.create(null);
  const order = [];
  let i = 0;
  while (i < chunk.length) {
    while (i < chunk.length && /[\s/]/.test(chunk[i])) i += 1;
    if (i >= chunk.length) break;
    let name = '';
    while (i < chunk.length && !/[\s=/>]/.test(chunk[i])) {
      name += chunk[i];
      i += 1;
    }
    if (!name) {
      i += 1;
      continue;
    }
    while (i < chunk.length && /\s/.test(chunk[i])) i += 1;
    let value = '';
    let had = false;
    if (chunk[i] === '=') {
      had = true;
      i += 1;
      while (i < chunk.length && /\s/.test(chunk[i])) i += 1;
      const quote = chunk[i];
      if (quote === '"' || quote === "'") {
        i += 1;
        while (i < chunk.length && chunk[i] !== quote) {
          value += chunk[i];
          i += 1;
        }
        i += 1;
      } else {
        while (i < chunk.length && !/[\s>]/.test(chunk[i])) {
          value += chunk[i];
          i += 1;
        }
      }
    }
    const key = name.toLowerCase();
    if (!(key in attrs)) order.push(key);
    attrs[key] = had ? value : '';
  }
  return { attrs, order };
}

// Reads the attribute region of a start tag, stopping at the first '>' that is
// not inside a quoted value.
function findTagEnd(source, from) {
  let i = from;
  let quote = null;
  while (i < source.length) {
    const ch = source[i];
    if (quote) {
      if (ch === quote) quote = null;
    } else if (ch === '"' || ch === "'") {
      quote = ch;
    } else if (ch === '>') {
      return i;
    }
    i += 1;
  }
  return -1;
}

function stripTags(inner) {
  let out = '';
  let i = 0;
  while (i < inner.length) {
    if (inner[i] === '<') {
      if (inner.startsWith('<!--', i)) {
        const close = inner.indexOf('-->', i);
        i = close === -1 ? inner.length : close + 3;
        continue;
      }
      const end = findTagEnd(inner, i + 1);
      i = end === -1 ? inner.length : end + 1;
      continue;
    }
    out += inner[i];
    i += 1;
  }
  return out;
}

export function collapse(text) {
  return String(text).replace(/\s+/g, ' ').trim();
}

export function scanHtml(source) {
  const src = String(source);
  const elements = [];
  const comments = [];
  const open = [];
  let i = 0;
  while (i < src.length) {
    const lt = src.indexOf('<', i);
    if (lt === -1) break;
    if (src.startsWith('<!--', lt)) {
      const close = src.indexOf('-->', lt);
      const end = close === -1 ? src.length : close + 3;
      comments.push({ text: src.slice(lt + 4, close === -1 ? src.length : close), line: lineAt(src, lt) });
      i = end;
      continue;
    }
    if (src.startsWith('</', lt)) {
      const end = findTagEnd(src, lt + 2);
      const stop = end === -1 ? src.length : end;
      const tag = src.slice(lt + 2, stop).trim().toLowerCase();
      for (let k = open.length - 1; k >= 0; k -= 1) {
        if (open[k].tag === tag) {
          const el = open[k];
          el.inner = src.slice(el.contentStart, lt);
          el.closed = true;
          open.length = k;
          break;
        }
      }
      i = stop + 1;
      continue;
    }
    if (!NAME_START.test(src[lt + 1] || '')) {
      i = lt + 1;
      continue;
    }
    const end = findTagEnd(src, lt + 1);
    if (end === -1) break;
    const body = src.slice(lt + 1, end);
    const space = body.search(/[\s/]/);
    const tag = (space === -1 ? body : body.slice(0, space)).toLowerCase();
    const attrChunk = space === -1 ? '' : body.slice(space);
    const { attrs, order } = parseAttributes(attrChunk);
    const selfClosing = /\/\s*$/.test(body) || VOID.has(tag);
    const el = {
      tag,
      attrs,
      attrOrder: order,
      line: lineAt(src, lt),
      start: lt,
      contentStart: end + 1,
      inner: '',
      closed: selfClosing,
      rawText: RAW_TEXT.has(tag),
      index: elements.length
    };
    elements.push(el);
    if (!selfClosing) {
      if (el.rawText) {
        const needle = '</' + tag;
        const close = src.toLowerCase().indexOf(needle, end + 1);
        const stop = close === -1 ? src.length : close;
        el.inner = src.slice(end + 1, stop);
        el.closed = true;
        i = stop;
        continue;
      }
      open.push(el);
    }
    i = end + 1;
  }
  for (const el of open) {
    if (!el.inner) el.inner = src.slice(el.contentStart);
  }
  for (const el of elements) {
    // The contents of a raw text element are already plain text, so they are
    // not run through the tag stripper. Script and style are the only tags
    // whose contents are not text at all.
    if (NOT_TEXT.has(el.tag)) el.text = '';
    else if (el.rawText) el.text = collapse(el.inner);
    else el.text = collapse(stripTags(el.inner));
  }
  return { elements, comments, source: src };
}

export function byTag(scan, ...tags) {
  const want = new Set(tags.map((t) => t.toLowerCase()));
  return scan.elements.filter((el) => want.has(el.tag));
}

export function inHead(scan, el) {
  const head = scan.elements.find((e) => e.tag === 'head');
  if (!head) return el.start < (scan.source.indexOf('<body') === -1 ? Infinity : scan.source.indexOf('<body'));
  return el.start > head.start && el.start < head.contentStart + head.inner.length;
}

export const rawTextTags = () => new Set(RAW_TEXT);
export const notTextTags = () => new Set(NOT_TEXT);

// Whether `el` sits inside any element with one of the named tags. Used to
// leave out markup the browser never renders: the contents of a template are
// inert, and a noscript fallback is not the image a shopper waits for.
export function containedIn(scan, el, tags) {
  return ancestorOfTag(scan, el, tags) !== null;
}

export function ancestorOfTag(scan, el, tags) {
  const want = new Set([].concat(tags));
  for (const other of scan.elements) {
    if (other === el || !want.has(other.tag)) continue;
    const from = other.contentStart;
    const to = other.contentStart + other.inner.length;
    if (el.start >= from && el.start < to) return other;
  }
  return null;
}

export function descendants(scan, parent) {
  const from = parent.contentStart;
  const to = parent.contentStart + parent.inner.length;
  return scan.elements.filter((el) => el !== parent && el.start >= from && el.start < to);
}
