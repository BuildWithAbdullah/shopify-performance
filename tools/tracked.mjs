// Which files git would track, worked out from .gitignore.
//
// A verifier that counts text files has to read .gitignore, or it counts
// node_modules. Negated rules are supported with last match wins, including
// the case where a negation cannot re-include a file that sits inside an
// excluded directory. CI checks the result against git ls-files on a tree
// built for the purpose.

import { readdir, readFile, stat } from 'node:fs/promises';
import { join, relative, sep } from 'node:path';

function toRegExp(pattern) {
  let body = '';
  for (let i = 0; i < pattern.length; i += 1) {
    const ch = pattern[i];
    if (ch === '*') {
      if (pattern[i + 1] === '*') {
        body += '.*';
        i += 1;
        if (pattern[i + 1] === '/') i += 1;
      } else {
        body += '[^/]*';
      }
    } else if (ch === '?') body += '[^/]';
    else if ('\\^$.|+()[]{}'.includes(ch)) body += '\\' + ch;
    else body += ch;
  }
  return new RegExp('^' + body + '$');
}

export function parseIgnore(text) {
  const rules = [];
  for (const raw of String(text).split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || line.startsWith('#')) continue;
    let pattern = line;
    let negated = false;
    if (pattern.startsWith('!')) {
      negated = true;
      pattern = pattern.slice(1);
    }
    let dirOnly = false;
    if (pattern.endsWith('/')) {
      dirOnly = true;
      pattern = pattern.slice(0, -1);
    }
    const anchored = pattern.includes('/');
    rules.push({ pattern, negated, dirOnly, anchored, re: toRegExp(pattern.replace(/^\//, '')) });
  }
  return rules;
}

// Decides one path against the rules. Last match wins, which is what git does,
// so a negation later in the file can re-include a path an earlier rule
// excluded.
export function decide(rules, path, isDir) {
  let ignored = false;
  for (const rule of rules) {
    if (rule.dirOnly && !isDir) {
      const segments = path.split('/');
      const matchesSegment = segments.slice(0, -1).some((part) => rule.re.test(part));
      if (!matchesSegment) continue;
      ignored = !rule.negated;
      continue;
    }
    const candidates = rule.anchored ? [path] : [path, ...path.split('/')];
    if (candidates.some((candidate) => rule.re.test(candidate))) {
      ignored = !rule.negated;
    }
  }
  return ignored;
}

export async function trackedFiles(root) {
  let rules = [];
  try {
    rules = parseIgnore(await readFile(join(root, '.gitignore'), 'utf8'));
  } catch {
    rules = [];
  }
  const out = [];
  const walk = async (dir) => {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
      const full = join(dir, entry.name);
      const rel = relative(root, full).split(sep).join('/');
      if (entry.name === '.git') continue;
      const isDir = entry.isDirectory();
      // A path inside an excluded directory stays excluded: git never looks
      // inside it, so a negation cannot bring one of its files back.
      if (decide(rules, rel, isDir)) continue;
      if (isDir) await walk(full);
      else out.push(rel);
    }
  };
  await walk(root);
  out.sort();
  return out;
}

export async function isTextFile(path) {
  const info = await stat(path);
  if (!info.isFile()) return false;
  const buffer = await readFile(path);
  return !buffer.includes(0);
}
