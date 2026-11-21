// A reader for captured HTTP response headers.
//
// The capture format is plain text so it can be produced by hand or by piping
// a client's verbose output through a filter. A block begins with a line
// starting '>>> ', then the status code on its own line, then one header per
// line. Blank lines and lines beginning '#' are ignored between blocks.

export function scanHeaders(source) {
  const lines = String(source).split(/\r?\n/);
  const blocks = [];
  let current = null;
  lines.forEach((line, idx) => {
    const n = idx + 1;
    const trimmed = line.trim();
    if (trimmed.startsWith('>>>')) {
      const rest = trimmed.slice(3).trim();
      const space = rest.indexOf(' ');
      current = {
        method: (space === -1 ? rest : rest.slice(0, space)).toUpperCase(),
        path: space === -1 ? '' : rest.slice(space + 1).trim(),
        status: 0,
        headers: Object.create(null),
        line: n
      };
      blocks.push(current);
      return;
    }
    if (!current) return;
    if (!trimmed || trimmed.startsWith('#')) return;
    if (!current.status && /^\d{3}$/.test(trimmed)) {
      current.status = Number(trimmed);
      return;
    }
    const colon = trimmed.indexOf(':');
    if (colon === -1) return;
    const name = trimmed.slice(0, colon).trim().toLowerCase();
    const value = trimmed.slice(colon + 1).trim();
    if (!name) return;
    if (!current.headers[name]) current.headers[name] = [];
    current.headers[name].push({ value, line: n });
  });
  return { blocks, source: String(source) };
}

export function allValues(block, name) {
  const entries = block.headers[name.toLowerCase()];
  return entries ? entries.map((e) => e.value) : [];
}

export function firstValue(block, name) {
  const values = allValues(block, name);
  return values.length ? values[0] : null;
}

export function lineOf(block, name) {
  const entries = block.headers[name.toLowerCase()];
  return entries && entries.length ? entries[0].line : block.line;
}

// Two values of the same header are compared after lowercasing and collapsing
// whitespace. A byte for byte comparison reports a conflict between
// 'public, max-age=60' and 'public,  max-age=60', which is not one.
export function normalise(value) {
  return String(value).toLowerCase().replace(/\s+/g, ' ').replace(/\s*,\s*/g, ',').trim();
}

export function sameValue(a, b) {
  return normalise(a) === normalise(b);
}

export function cacheControl(block) {
  const out = { directives: Object.create(null), present: false, count: 0 };
  const values = allValues(block, 'cache-control');
  out.count = values.length;
  if (!values.length) return out;
  out.present = true;
  for (const value of values) {
    for (const part of value.split(',')) {
      const piece = part.trim();
      if (!piece) continue;
      const eq = piece.indexOf('=');
      const name = (eq === -1 ? piece : piece.slice(0, eq)).toLowerCase();
      const val = eq === -1 ? true : piece.slice(eq + 1).trim().replace(/^"|"$/g, '');
      out.directives[name] = val;
    }
  }
  return out;
}

export function maxAge(block) {
  const cc = cacheControl(block);
  const raw = cc.directives['max-age'];
  if (raw === undefined || raw === true) return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

const TEXTUAL = [
  'text/', 'application/javascript', 'text/javascript', 'application/json',
  'image/svg+xml', 'application/xml'
];

export function isTextual(block) {
  const type = firstValue(block, 'content-type') || '';
  const lower = type.toLowerCase();
  return TEXTUAL.some((t) => lower.includes(t));
}

export function isDocument(block) {
  const type = (firstValue(block, 'content-type') || '').toLowerCase();
  return type.includes('text/html');
}

// A path is treated as fingerprinted when it carries a version query or a hash
// segment long enough to be content addressed.
export function isFingerprinted(path) {
  if (/[?&](v|ver|version)=/.test(path)) return true;
  return /[.-][0-9a-f]{8,}\./i.test(path);
}
