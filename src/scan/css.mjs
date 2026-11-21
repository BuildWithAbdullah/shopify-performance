// A small CSS reader. It finds at-rules and declaration blocks by brace
// matching, which is enough to read font-face descriptors and import rules.

function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

function stripComments(source) {
  const out = source.split('');
  let i = 0;
  while (i < source.length) {
    if (source[i] === '/' && source[i + 1] === '*') {
      const close = source.indexOf('*/', i + 2);
      const stop = close === -1 ? source.length : close + 2;
      for (let k = i; k < stop; k += 1) if (out[k] !== '\n') out[k] = ' ';
      i = stop;
      continue;
    }
    i += 1;
  }
  return out.join('');
}

export function scanCss(source) {
  const src = String(source);
  const clean = stripComments(src);
  const rules = [];
  const imports = [];
  let i = 0;
  while (i < clean.length) {
    if (clean[i] === '@') {
      const semi = clean.indexOf(';', i);
      const brace = clean.indexOf('{', i);
      if (semi !== -1 && (brace === -1 || semi < brace)) {
        const text = clean.slice(i, semi);
        if (/^@import\b/i.test(text)) imports.push({ text: text.trim(), line: lineAt(src, i) });
        rules.push({ at: text.split(/\s/)[0].slice(1).toLowerCase(), selector: text.trim(), body: '', line: lineAt(src, i) });
        i = semi + 1;
        continue;
      }
    }
    const brace = clean.indexOf('{', i);
    if (brace === -1) break;
    let depth = 0;
    let end = brace;
    for (let k = brace; k < clean.length; k += 1) {
      if (clean[k] === '{') depth += 1;
      else if (clean[k] === '}') {
        depth -= 1;
        if (depth === 0) {
          end = k;
          break;
        }
      }
    }
    const selector = clean.slice(i, brace).trim();
    const body = clean.slice(brace + 1, end);
    rules.push({
      at: selector.startsWith('@') ? selector.split(/\s/)[0].slice(1).toLowerCase() : '',
      selector,
      body,
      line: lineAt(src, i + (clean.slice(i, brace).length - clean.slice(i, brace).trimStart().length))
    });
    i = end + 1;
  }
  return { rules, imports, source: src };
}

export function declarations(body) {
  const out = Object.create(null);
  for (const part of body.split(';')) {
    const colon = part.indexOf(':');
    if (colon === -1) continue;
    const name = part.slice(0, colon).trim().toLowerCase();
    if (!name) continue;
    out[name] = part.slice(colon + 1).trim();
  }
  return out;
}

export function fontFaces(scan) {
  return scan.rules.filter((r) => r.at === 'font-face').map((r) => ({
    line: r.line,
    decls: declarations(r.body)
  }));
}
