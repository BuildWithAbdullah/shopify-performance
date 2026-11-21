// One fixture per reason the pattern pairs do not reach, and no more.
//
// A fixture that reaches a reason a pair already reaches is two artefacts for
// one reason, so test/corpus.test.mjs refuses it. The only allowed overlap is a
// fixture written to produce the second severity of a finding that declares
// two, and those are named in SECOND_SEVERITY_FIXTURES rather than permitted in
// general. That list is currently empty: the one finding with two severities
// reaches both of them through a pair.

export const FIXTURES = [
  {
    file: 'font-woff-only.css',
    expected: ['font-face-without-woff2@notice'],
    reason: 'A face offering only the older compressed format. The font pairs all ship the newer one, so no pair reaches this.'
  },
  {
    file: 'inline-critical-css-huge.html',
    expected: ['inline-critical-css-oversized@warn'],
    reason: 'An inline critical block past the budget. A pair would mean committing two files of this size to make one point.'
  },
  {
    file: 'immutable-missing.headers',
    expected: ['asset-cache-not-immutable@notice'],
    reason: 'A year long lifetime with no immutable directive. Every corrected capture in the pairs sets both, so no pair reaches it.'
  },
  {
    file: 'settings-bloat.json',
    expected: ['settings-data-oversized@notice'],
    reason: 'A settings file past the size budget, carrying presets for sections no live template renders. The size is measured on the compact serialisation, which is smaller than the formatted file on disk.'
  }
];

export const SECOND_SEVERITY_FIXTURES = [];

export function fixturePath(fixture) {
  return 'fixtures/' + fixture.file;
}
