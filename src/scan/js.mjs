// A call scanner for theme JavaScript, built on a masked copy of the source.
//
// Every string literal, template literal, regular expression and comment is
// replaced by a run of placeholder characters of the same length, so offsets
// and line numbers still line up while nothing inside a quoted string can be
// mistaken for code. That is what stops a test which builds fake modules out
// of string literals from reporting those strings as real calls.

const PLACEHOLDER = '\u0000';

function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

function regexAllowedBefore(masked, index) {
  for (let i = index - 1; i >= 0; i -= 1) {
    const ch = masked[i];
    if (/\s/.test(ch)) continue;
    if (ch === PLACEHOLDER) return false;
    return !/[A-Za-z0-9_$)\]]/.test(ch);
  }
  return true;
}

export function maskSource(source) {
  const src = String(source);
  const out = src.split('');
  const blank = (from, to) => {
    for (let k = from; k < to && k < out.length; k += 1) {
      if (out[k] !== '\n') out[k] = PLACEHOLDER;
    }
  };
  let i = 0;
  while (i < src.length) {
    const ch = src[i];
    if (ch === '/' && src[i + 1] === '/') {
      const nl = src.indexOf('\n', i);
      const stop = nl === -1 ? src.length : nl;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === '/' && src[i + 1] === '*') {
      const close = src.indexOf('*/', i + 2);
      const stop = close === -1 ? src.length : close + 2;
      blank(i, stop);
      i = stop;
      continue;
    }
    if (ch === '"' || ch === "'" || ch === '`') {
      let k = i + 1;
      while (k < src.length) {
        if (src[k] === '\\') {
          k += 2;
          continue;
        }
        if (src[k] === ch) break;
        k += 1;
      }
      blank(i, Math.min(k + 1, src.length));
      i = Math.min(k + 1, src.length);
      continue;
    }
    if (ch === '/' && regexAllowedBefore(out.join(''), i)) {
      let k = i + 1;
      let klass = false;
      let ok = false;
      while (k < src.length) {
        const c = src[k];
        if (c === '\\') {
          k += 2;
          continue;
        }
        if (c === '\n') break;
        if (klass) {
          if (c === ']') klass = false;
        } else if (c === '[') {
          klass = true;
        } else if (c === '/') {
          ok = true;
          break;
        }
        k += 1;
      }
      if (ok) {
        let end = k + 1;
        while (end < src.length && /[a-z]/.test(src[end])) end += 1;
        blank(i, end);
        i = end;
        continue;
      }
    }
    i += 1;
  }
  return out.join('');
}

export function scanJs(source) {
  const src = String(source);
  const masked = maskSource(src);
  const scan = {
    source: src,
    masked,
    lineAt: (index) => lineAt(src, index),
    textAt: (index, length) => src.slice(index, index + length)
  };
  scan.calls = (name) => {
    const found = [];
    const needle = name + '(';
    let from = 0;
    for (;;) {
      const at = masked.indexOf(needle, from);
      if (at === -1) break;
      from = at + 1;
      const before = masked[at - 1];
      if (before && /[A-Za-z0-9_$]/.test(before)) continue;
      found.push({ name, index: at, line: lineAt(src, at), member: before === '.' });
      }
    return found;
  };
  scan.members = (name) => scan.calls(name).filter((c) => c.member);
  scan.find = (pattern) => {
    const re = new RegExp(pattern.source, pattern.flags.includes('g') ? pattern.flags : pattern.flags + 'g');
    const found = [];
    let m;
    while ((m = re.exec(masked)) !== null) {
      found.push({ index: m.index, line: lineAt(src, m.index), length: m[0].length, groups: m.slice(1) });
      if (m[0].length === 0) re.lastIndex += 1;
    }
    return found;
  };
  return scan;
}

// The region of masked source that belongs to the function body starting at or
// after `index`, found by matching braces. Returns null when the braces do not
// balance, which a caller must treat as "cannot tell".
export function bodyRangeAfter(masked, index) {
  const open = masked.indexOf('{', index);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < masked.length; i += 1) {
    if (masked[i] === '{') depth += 1;
    else if (masked[i] === '}') {
      depth -= 1;
      if (depth === 0) return { start: open + 1, end: i };
    }
  }
  return null;
}

export function bodyAfter(masked, index) {
  const range = bodyRangeAfter(masked, index);
  return range ? masked.slice(range.start, range.end) : '';
}

// The parenthesised argument region of a call whose name begins at `index`.
// The search runs over masked source so a parenthesis inside a string cannot
// close the region early. Returns null when the parentheses do not balance,
// which a caller must treat as "cannot tell" rather than as "no arguments".
export function argsRegion(masked, index) {
  const open = masked.indexOf('(', index);
  if (open === -1) return null;
  let depth = 0;
  for (let i = open; i < masked.length; i += 1) {
    const ch = masked[i];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') {
      depth -= 1;
      if (depth === 0) return { start: open + 1, end: i };
    }
  }
  return null;
}

export function splitArgs(masked, region) {
  if (!region) return [];
  const out = [];
  let depth = 0;
  let start = region.start;
  for (let i = region.start; i < region.end; i += 1) {
    const ch = masked[i];
    if (ch === '(' || ch === '[' || ch === '{') depth += 1;
    else if (ch === ')' || ch === ']' || ch === '}') depth -= 1;
    else if (ch === ',' && depth === 0) {
      out.push({ start, end: i });
      start = i + 1;
    }
  }
  if (start < region.end) out.push({ start, end: region.end });
  return out;
}

// The region of the function body that starts inside `arg`. Handles both a
// brace body and a concise arrow body. A range rather than a string, because a
// caller that needs to read a URL out of the body has to look at the original
// source, where string contents are still present, while a caller looking for
// calls has to look at the masked copy. Returning only the masked text is how
// the cart polling check came to miss its own example.
export function callbackRange(masked, arg) {
  if (!arg) return null;
  const slice = masked.slice(arg.start, arg.end);
  const brace = slice.indexOf('{');
  if (brace !== -1) {
    const range = bodyRangeAfter(masked, arg.start + brace);
    if (range) return range;
  }
  const arrow = slice.indexOf('=>');
  if (arrow !== -1) return { start: arg.start + arrow + 2, end: arg.end };
  return { start: arg.start, end: arg.end };
}

export function callbackBody(masked, arg) {
  const range = callbackRange(masked, arg);
  return range ? masked.slice(range.start, range.end) : '';
}

// The body region of a named function or of a variable holding a function.
export function namedFunctionRange(masked, name) {
  if (!/^[A-Za-z_$][A-Za-z0-9_$]*$/.test(name)) return null;
  const re = new RegExp('function\\s+' + name + '\\s*\\(|(?:const|let|var)\\s+' + name + '\\s*=');
  const at = masked.search(re);
  if (at === -1) return null;
  return bodyRangeAfter(masked, at);
}
