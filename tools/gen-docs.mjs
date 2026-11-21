// Generates the two documents that would otherwise go stale.
//
// A paragraph saying a checker cannot see something still reads correctly after
// the checker learns to see it, and a reader then trusts a caveat that is no
// longer true. So the finding list and the limits document are generated from
// the manifests, and CI fails if either file on disk differs from what the
// manifests would produce now.

import { readFile, writeFile } from 'node:fs/promises';
import { join, dirname } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { CATALOGUE, AREAS, SEVERITIES } from '../src/catalogue.mjs';
import { LIMITS, countByKind } from './limits.mjs';
import { corpusCases } from './corpus.mjs';

function reachIndex() {
  const index = new Map();
  for (const item of corpusCases()) {
    if (item.group === 'limit') continue;
    for (const token of item.expected) {
      const id = token.split('@')[0];
      if (!index.has(id)) index.set(id, new Set());
      index.get(id).add(item.group === 'pair' ? 'patterns/' + item.slug : 'fixtures/' + item.slug);
    }
  }
  return index;
}

export function renderFindings() {
  const reach = reachIndex();
  const lines = [];
  lines.push('# Findings');
  lines.push('');
  lines.push('Generated from `src/catalogue.mjs` by `tools/gen-docs.mjs`. Do not edit by hand:');
  lines.push('CI compares this file against the manifest and fails if they differ.');
  lines.push('');
  lines.push(
    CATALOGUE.length + ' findings across ' + AREAS.length + ' areas. One entry per reason, ' +
    'not one per check. The severity column is the complete set the finding can be ' +
    'emitted at, and the suite compares that set against a real run in both directions.'
  );
  lines.push('');
  for (const area of AREAS) {
    const entries = CATALOGUE.filter((e) => e.area === area.id);
    lines.push('## ' + area.title);
    lines.push('');
    lines.push(area.id + ', ' + entries.length + ' findings.');
    lines.push('');
    for (const entry of entries) {
      lines.push('### ' + entry.id);
      lines.push('');
      lines.push('Severities: ' + entry.severities.join(', ') + '.');
      lines.push('');
      lines.push(entry.title + '.');
      lines.push('');
      lines.push(entry.why);
      lines.push('');
      lines.push('Fix: ' + entry.fix);
      lines.push('');
      const where = reach.has(entry.id) ? [...reach.get(entry.id)].sort() : [];
      lines.push('Reached by: ' + (where.length ? where.join(', ') : 'nothing, which fails the build') + '.');
      lines.push('');
    }
  }
  return lines.join('\n');
}

export function renderLimits() {
  const counts = countByKind();
  const lines = [];
  lines.push('# Limits');
  lines.push('');
  lines.push('Generated from `tools/limits.mjs` by `tools/gen-docs.mjs`. Do not edit by hand:');
  lines.push('CI compares this file against the manifest and fails if they differ.');
  lines.push('');
  lines.push(
    LIMITS.length + ' declared limits: ' + counts.hides + ' that hide a problem and ' +
    counts.manufactures + ' that manufacture a finding. Each one carries two artefacts in ' +
    '`limits/`, and both halves of its meaning are asserted.'
  );
  lines.push('');
  lines.push(
    'For a limit that hides: the blind artefact must not report the named finding, and the ' +
    'contrast artefact, which is the same problem written in the form the tool does read, ' +
    'must report it. A contrast case that reported nothing would prove nothing, because a ' +
    'file with no problem in it also reports nothing.'
  );
  lines.push('');
  lines.push(
    'For a limit that manufactures: the blind artefact must report the named finding, and ' +
    'the contrast artefact, which is the same thing written in the form the tool reads ' +
    'correctly, must be completely clean.'
  );
  lines.push('');
  for (const limit of LIMITS) {
    lines.push('## ' + limit.title);
    lines.push('');
    lines.push('Kind: ' + limit.kind + '. Finding: `' + limit.target + '`.');
    lines.push('');
    lines.push(limit.text);
    lines.push('');
    lines.push('Blind artefact: `limits/' + limit.slug + '.blind.' + limit.ext + '`, which reports ' +
      (limit.blindExpected.length ? limit.blindExpected.join(', ') : 'nothing') + '.');
    lines.push('');
    lines.push('Contrast artefact: `limits/' + limit.slug + '.contrast.' + limit.ext + '`, which reports ' +
      (limit.contrastExpected.length ? limit.contrastExpected.join(', ') : 'nothing') + '.');
    lines.push('');
  }
  lines.push('## Severities');
  lines.push('');
  lines.push('A finding is emitted at one of ' + SEVERITIES.join(', ') + '.');
  lines.push('');
  return lines.join('\n');
}

export const DOCUMENTS = [
  { path: 'docs/FINDINGS.md', render: renderFindings },
  { path: 'docs/LIMITS.md', render: renderLimits }
];

export async function write(root) {
  for (const doc of DOCUMENTS) {
    await writeFile(join(root, doc.path), doc.render() + '\n', 'utf8');
  }
  return DOCUMENTS.map((d) => d.path);
}

export async function stale(root) {
  const out = [];
  for (const doc of DOCUMENTS) {
    let onDisk = '';
    try {
      onDisk = await readFile(join(root, doc.path), 'utf8');
    } catch {
      out.push(doc.path + ' is missing');
      continue;
    }
    if (onDisk !== doc.render() + '\n') out.push(doc.path + ' does not match the manifest');
  }
  return out;
}

const invokedDirectly = (() => {
  if (!process.argv[1]) return false;
  try {
    return pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url;
  } catch {
    return false;
  }
})();

if (invokedDirectly) {
  const root = dirname(dirname(fileURLToPath(import.meta.url)));
  if (process.argv.includes('--check')) {
    const problems = await stale(root);
    for (const problem of problems) process.stdout.write('  ' + problem + '\n');
    process.stdout.write(problems.length ? 'the generated documents are stale\n' : 'the generated documents are current\n');
    process.exitCode = problems.length ? 1 : 0;
  } else {
    const written = await write(root);
    process.stdout.write('wrote ' + written.join(' and ') + '\n');
  }
}
