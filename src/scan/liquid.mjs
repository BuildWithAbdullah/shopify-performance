// A dependency free scanner for Liquid theme source.
//
// It finds tags and output expressions, pairs block tags with their end tags so
// a check can ask what is inside a loop, and skips the contents of comment,
// raw and schema blocks. It does not evaluate anything.

const BLOCK = new Set([
  'for', 'if', 'unless', 'case', 'capture', 'paginate', 'form', 'tablerow',
  'comment', 'raw', 'schema', 'javascript', 'stylesheet', 'style', 'liquid'
]);
const SKIP_CONTENTS = new Set(['comment', 'raw', 'schema']);

function lineAt(source, index) {
  let line = 1;
  for (let i = 0; i < index && i < source.length; i += 1) {
    if (source[i] === '\n') line += 1;
  }
  return line;
}

export function splitFilters(expr) {
  const parts = [];
  let cur = '';
  let quote = null;
  for (let i = 0; i < expr.length; i += 1) {
    const ch = expr[i];
    if (quote) {
      if (ch === quote) quote = null;
      cur += ch;
      continue;
    }
    if (ch === '"' || ch === "'") {
      quote = ch;
      cur += ch;
      continue;
    }
    if (ch === '|') {
      parts.push(cur.trim());
      cur = '';
      continue;
    }
    cur += ch;
  }
  parts.push(cur.trim());
  return { subject: parts[0], filters: parts.slice(1) };
}

export function scanLiquid(source) {
  const src = String(source);
  const tags = [];
  const outputs = [];
  const stack = [];
  let i = 0;
  let skipUntil = null;
  while (i < src.length) {
    const next = src.indexOf('{', i);
    if (next === -1) break;
    const two = src.slice(next, next + 2);
    if (two === '{%') {
      const close = src.indexOf('%}', next);
      if (close === -1) break;
      const body = src.slice(next + 2, close).replace(/^-|-$/g, '').trim();
      const space = body.search(/\s/);
      const name = (space === -1 ? body : body.slice(0, space)).toLowerCase();
      const args = space === -1 ? '' : body.slice(space).trim();
      if (skipUntil) {
        if (name === skipUntil) {
          const owner = stack.pop();
          if (owner) {
            owner.blockEnd = next;
            owner.inner = src.slice(owner.end, next);
          }
          skipUntil = null;
        }
        i = close + 2;
        continue;
      }
      const tag = {
        name,
        args,
        raw: body,
        line: lineAt(src, next),
        start: next,
        end: close + 2,
        blockEnd: -1,
        inner: '',
        depth: stack.length,
        ancestors: stack.map((t) => t.name)
      };
      tags.push(tag);
      if (name.startsWith('end')) {
        const want = name.slice(3);
        for (let k = stack.length - 1; k >= 0; k -= 1) {
          if (stack[k].name === want) {
            stack[k].blockEnd = next;
            stack[k].inner = src.slice(stack[k].end, next);
            stack.length = k;
            break;
          }
        }
        tag.depth = stack.length;
        tag.ancestors = stack.map((t) => t.name);
      } else if (BLOCK.has(name)) {
        stack.push(tag);
        if (SKIP_CONTENTS.has(name)) skipUntil = 'end' + name;
      }
      i = close + 2;
      continue;
    }
    if (two === '{{') {
      const close = src.indexOf('}}', next);
      if (close === -1) break;
      if (skipUntil) {
        i = close + 2;
        continue;
      }
      const expr = src.slice(next + 2, close).replace(/^-|-$/g, '').trim();
      const { subject, filters } = splitFilters(expr);
      outputs.push({
        expr,
        subject,
        filters,
        line: lineAt(src, next),
        start: next,
        depth: stack.length,
        ancestors: stack.map((t) => t.name)
      });
      i = close + 2;
      continue;
    }
    i = next + 1;
  }
  for (const tag of tags) {
    if (tag.blockEnd === -1 && BLOCK.has(tag.name)) tag.inner = src.slice(tag.end);
  }
  return { tags, outputs, source: src };
}

export function loops(scan) {
  return scan.tags.filter((t) => t.name === 'for' || t.name === 'tablerow');
}

export function insideLoop(item) {
  return item.ancestors.includes('for') || item.ancestors.includes('tablerow');
}

export const blockTags = () => new Set(BLOCK);
