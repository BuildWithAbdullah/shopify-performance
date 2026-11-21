// Every artefact in the repository with the exact set of id@severity tokens it
// is declared to produce. One list, used by the suite, by the verifier, by the
// tool that runs the real binary and by the tool that runs the checkers, so the
// binary and the library are held to the same expectations.

import { PAIRS, pairFiles } from './pairs.mjs';
import { FIXTURES, fixturePath } from './fixtures.mjs';
import { LIMITS, limitFiles } from './limits.mjs';

export function corpusCases() {
  const out = [];
  for (const pair of PAIRS) {
    const files = pairFiles(pair);
    out.push({ group: 'pair', slug: pair.slug, side: 'before', path: files.before, expected: pair.expected.slice().sort() });
    out.push({ group: 'pair', slug: pair.slug, side: 'after', path: files.after, expected: pair.residual.slice().sort() });
  }
  for (const fixture of FIXTURES) {
    out.push({ group: 'fixture', slug: fixture.file, side: 'only', path: fixturePath(fixture), expected: fixture.expected.slice().sort() });
  }
  for (const limit of LIMITS) {
    const files = limitFiles(limit);
    out.push({ group: 'limit', slug: limit.slug, side: 'blind', path: files.blind, expected: limit.blindExpected.slice().sort() });
    out.push({ group: 'limit', slug: limit.slug, side: 'contrast', path: files.contrast, expected: limit.contrastExpected.slice().sort() });
  }
  return out;
}

export const SEVERITY_EXIT = { error: 2, warn: 1, notice: 0 };

// The exit code a case is expected to produce, derived from its declared token
// set and the severity table rather than from a list kept beside the tool. A
// list would have to be edited whenever a token set changed, and would then be
// wrong in exactly the cases that matter.
export function expectedExit(expected) {
  let worst = 0;
  for (const token of expected) {
    const severity = token.split('@')[1];
    const code = SEVERITY_EXIT[severity];
    if (code === undefined) throw new Error('no exit code for severity ' + severity);
    if (code > worst) worst = code;
  }
  return worst;
}

export function sameSet(a, b) {
  const left = a.slice().sort();
  const right = b.slice().sort();
  return left.length === right.length && left.every((value, i) => value === right[i]);
}

export function describeDifference(actual, expected) {
  const extra = actual.filter((t) => !expected.includes(t));
  const missing = expected.filter((t) => !actual.includes(t));
  const parts = [];
  if (extra.length) parts.push('reported and not expected: ' + extra.join(', '));
  if (missing.length) parts.push('expected and not reported: ' + missing.join(', '));
  return parts.join('; ') || 'the sets differ in order only';
}
