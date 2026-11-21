import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import {
  run, parseArgs, renderText, renderJson, renderList, exitCodeFor,
  filterBySeverity, EXIT, FORMATS, USAGE
} from '../src/cli.mjs';
import { audit, kindFor } from '../src/audit.mjs';
import { CATALOGUE, AREAS } from '../src/catalogue.mjs';

const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

function sink() {
  const lines = [];
  return { write: (text) => lines.push(text), text: () => lines.join(''), lines };
}

function realReader() {
  return (path) => readFile(join(ROOT, path), 'utf8');
}

test('paths and defaults are parsed', () => {
  const parsed = parseArgs(['a.liquid', 'b.html']);
  assert.equal(parsed.ok, true);
  assert.deepStrictEqual(parsed.paths, ['a.liquid', 'b.html']);
  assert.equal(parsed.options.format, 'text');
  assert.equal(parsed.options.minSeverity, 'notice');
});

test('a format is accepted', () => {
  assert.equal(parseArgs(['a.liquid', '--format', 'json']).options.format, 'json');
});

test('an unknown format is refused by name', () => {
  const parsed = parseArgs(['a.liquid', '--format', 'xml']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /unknown format: xml/);
});

test('a format with no value is refused', () => {
  const parsed = parseArgs(['a.liquid', '--format']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /needs a value/);
});

test('a severity floor is accepted', () => {
  assert.equal(parseArgs(['a.liquid', '--min-severity', 'warn']).options.minSeverity, 'warn');
});

test('an unknown severity floor is refused by name', () => {
  const parsed = parseArgs(['a.liquid', '--min-severity', 'urgent']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /unknown severity: urgent/);
});

test('an unknown option is refused rather than read as a path', () => {
  const parsed = parseArgs(['a.liquid', '--quiet']);
  assert.equal(parsed.ok, false);
  assert.match(parsed.error, /unknown option/);
});

test('help and list are flags with no value', () => {
  assert.equal(parseArgs(['--help']).options.help, true);
  assert.equal(parseArgs(['--list']).options.list, true);
  assert.equal(parseArgs(['-h']).options.help, true);
});

test('both formats are declared', () => {
  assert.deepStrictEqual(FORMATS, ['text', 'json']);
});

test('the usage text names every exit code the tool returns', () => {
  for (const code of Object.values(EXIT)) assert.match(USAGE, new RegExp('\\b' + code + '\\b'));
});

test('an exit code is derived from the counts', () => {
  assert.equal(exitCodeFor({ error: 0, warn: 0, notice: 0 }), EXIT.clean);
  assert.equal(exitCodeFor({ error: 0, warn: 0, notice: 3 }), EXIT.clean);
  assert.equal(exitCodeFor({ error: 0, warn: 1, notice: 0 }), EXIT.warnings);
  assert.equal(exitCodeFor({ error: 1, warn: 9, notice: 9 }), EXIT.errors);
});

test('the severity floor removes only what is below it', () => {
  const findings = [
    { severity: 'error' }, { severity: 'warn' }, { severity: 'notice' }
  ];
  assert.equal(filterBySeverity(findings, 'notice').length, 3);
  assert.equal(filterBySeverity(findings, 'warn').length, 2);
  assert.equal(filterBySeverity(findings, 'error').length, 1);
});

test('the text output names the path, the line, the severity and the id', async () => {
  const path = 'patterns/product-count.before.liquid';
  const source = await readFile(join(ROOT, path), 'utf8');
  const result = audit([{ kind: kindFor(path), path, source }]);
  const text = renderText({ findings: result.findings, counts: result.counts, inputs: 1 });
  assert.match(text, /patterns\/product-count\.before\.liquid:1\s+warn\s+liquid-products-size-for-count/);
});

test('the text output says so when there is nothing to report', () => {
  const text = renderText({ findings: [], counts: { error: 0, warn: 0, notice: 0 }, inputs: 1 });
  assert.match(text, /no findings at or above the reporting level/);
});

test('the text output pluralises the input count', () => {
  const one = renderText({ findings: [], counts: { error: 0, warn: 0, notice: 0 }, inputs: 1 });
  const two = renderText({ findings: [], counts: { error: 0, warn: 0, notice: 0 }, inputs: 2 });
  assert.match(one, /across 1 input$/);
  assert.match(two, /across 2 inputs$/);
});

test('the json output carries the token set and the counts', async () => {
  const path = 'patterns/product-count.before.liquid';
  const source = await readFile(join(ROOT, path), 'utf8');
  const result = audit([{ kind: kindFor(path), path, source }]);
  const parsed = JSON.parse(renderJson({ findings: result.findings, counts: result.counts, inputs: 1 }));
  assert.deepStrictEqual(parsed.tokens, ['liquid-products-size-for-count@warn']);
  assert.equal(parsed.counts.warn, 1);
  assert.equal(parsed.findings[0].area, 'liquid');
});

test('the json output is valid json when there is nothing to report', () => {
  const parsed = JSON.parse(renderJson({ findings: [], counts: { error: 0, warn: 0, notice: 0 }, inputs: 0 }));
  assert.deepStrictEqual(parsed.tokens, []);
});

test('the list output names every finding and every area', () => {
  const text = renderList();
  for (const entry of CATALOGUE) assert.match(text, new RegExp(entry.id.replace(/-/g, '\\-')));
  for (const area of AREAS) assert.match(text, new RegExp(area.id));
});

test('the list output states the catalogue size', () => {
  assert.match(renderList(), new RegExp(CATALOGUE.length + ' findings across ' + AREAS.length + ' areas'));
});

test('the list output states the severities of every finding', () => {
  const text = renderList();
  for (const entry of CATALOGUE) {
    assert.match(text, new RegExp('\\[' + entry.severities.join(' ') + '\\]'));
  }
});

test('running with no paths is a usage error', async () => {
  const out = sink();
  const err = sink();
  const code = await run({ argv: [], stdout: out, stderr: err, readFile: realReader() });
  assert.equal(code, EXIT.usage);
  assert.match(err.text(), /no input paths given/);
});

test('running with a bad option prints the usage text', async () => {
  const out = sink();
  const err = sink();
  const code = await run({ argv: ['--nope'], stdout: out, stderr: err, readFile: realReader() });
  assert.equal(code, EXIT.usage);
  assert.match(err.text(), /shopify-perf <path>/);
});

test('help prints the usage text and exits clean', async () => {
  const out = sink();
  const err = sink();
  const code = await run({ argv: ['--help'], stdout: out, stderr: err, readFile: realReader() });
  assert.equal(code, EXIT.clean);
  assert.match(out.text(), /Exit codes:/);
  assert.equal(err.text(), '');
});

test('the list flag prints the catalogue and exits clean', async () => {
  const out = sink();
  const err = sink();
  const code = await run({ argv: ['--list'], stdout: out, stderr: err, readFile: realReader() });
  assert.equal(code, EXIT.clean);
  assert.match(out.text(), new RegExp(CATALOGUE.length + ' findings'));
});

test('a path whose kind cannot be told is an input error', async () => {
  const out = sink();
  const err = sink();
  const code = await run({ argv: ['notes.txt'], stdout: out, stderr: err, readFile: realReader() });
  assert.equal(code, EXIT.unreadable);
  assert.match(err.text(), /cannot tell what kind of input/);
});

test('a path that cannot be read is an input error naming the file', async () => {
  const out = sink();
  const err = sink();
  const code = await run({
    argv: ['missing.liquid'],
    stdout: out,
    stderr: err,
    readFile: () => Promise.reject(new Error('no such file'))
  });
  assert.equal(code, EXIT.unreadable);
  assert.match(err.text(), /cannot read missing.liquid: no such file/);
});

test('a clean input exits zero in both formats', async () => {
  for (const format of FORMATS) {
    const out = sink();
    const err = sink();
    const code = await run({
      argv: ['patterns/product-count.after.liquid', '--format', format],
      stdout: out,
      stderr: err,
      readFile: realReader()
    });
    assert.equal(code, EXIT.clean, format);
  }
});

test('an input with a warning exits one in both formats', async () => {
  for (const format of FORMATS) {
    const out = sink();
    const err = sink();
    const code = await run({
      argv: ['patterns/product-count.before.liquid', '--format', format],
      stdout: out,
      stderr: err,
      readFile: realReader()
    });
    assert.equal(code, EXIT.warnings, format);
  }
});

test('an input with an error exits two in both formats', async () => {
  for (const format of FORMATS) {
    const out = sink();
    const err = sink();
    const code = await run({
      argv: ['patterns/all-products-loop.before.liquid', '--format', format],
      stdout: out,
      stderr: err,
      readFile: realReader()
    });
    assert.equal(code, EXIT.errors, format);
  }
});

test('the severity floor changes what is printed and not the exit code', async () => {
  const path = 'patterns/collection-loop-limit.before.liquid';
  const low = sink();
  const high = sink();
  const codeLow = await run({ argv: [path, '--format', 'json'], stdout: low, stderr: sink(), readFile: realReader() });
  const codeHigh = await run({
    argv: [path, '--format', 'json', '--min-severity', 'error'],
    stdout: high,
    stderr: sink(),
    readFile: realReader()
  });
  assert.equal(codeLow, codeHigh);
  const parsedLow = JSON.parse(low.text());
  const parsedHigh = JSON.parse(high.text());
  assert.ok(parsedHigh.findings.length < parsedLow.findings.length);
  assert.equal(parsedHigh.findings.every((f) => f.severity === 'error'), true);
});

test('several inputs are audited in one run and counted', async () => {
  const out = sink();
  const code = await run({
    argv: [
      'patterns/product-count.before.liquid',
      'patterns/all-products-loop.before.liquid',
      '--format',
      'json'
    ],
    stdout: out,
    stderr: sink(),
    readFile: realReader()
  });
  assert.equal(code, EXIT.errors);
  const parsed = JSON.parse(out.text());
  assert.equal(parsed.inputs, 2);
  assert.equal(parsed.findings.length, 2);
});

test('the first unreadable input stops the run before any output', async () => {
  const out = sink();
  const err = sink();
  const code = await run({
    argv: ['patterns/product-count.before.liquid', 'notes.txt'],
    stdout: out,
    stderr: err,
    readFile: realReader()
  });
  assert.equal(code, EXIT.unreadable);
  assert.equal(out.text(), '');
});

test('output always ends with exactly one newline', async () => {
  const out = sink();
  await run({
    argv: ['patterns/product-count.before.liquid'],
    stdout: out,
    stderr: sink(),
    readFile: realReader()
  });
  const text = out.text();
  assert.equal(text.endsWith('\n'), true);
  assert.equal(text.endsWith('\n\n'), false);
});
