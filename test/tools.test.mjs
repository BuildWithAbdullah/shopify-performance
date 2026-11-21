import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile, mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
import { parseIgnore, decide, trackedFiles, isTextFile } from '../tools/tracked.mjs';
import { testFilesFrom } from '../tools/count-tests.mjs';
import { countBranches, countLines, measure, check as checkEntry, BUDGET } from '../tools/entry-thin.mjs';
import { renderFindings, renderLimits, stale, DOCUMENTS } from '../tools/gen-docs.mjs';
import { tokensFromJson, tokensFromText, runBinary } from '../tools/exit-codes.mjs';
import { verdict } from '../tools/audit-verdicts.mjs';
import { CLAIMS, statedOnOneLine } from '../tools/verify.mjs';
import { CATALOGUE } from '../src/catalogue.mjs';
import { LIMITS } from '../tools/limits.mjs';
import { maskSource } from '../src/scan/js.mjs';

const run = promisify(execFile);
const ROOT = dirname(dirname(fileURLToPath(import.meta.url)));

test('a comment and a blank line are not rules', () => {
  assert.equal(parseIgnore('# a note\n\nnode_modules/\n').length, 1);
});

test('a negation is recorded as one', () => {
  const rules = parseIgnore('*.log\n!keep.log\n');
  assert.equal(rules.length, 2);
  assert.equal(rules[1].negated, true);
});

test('a trailing slash marks a directory rule', () => {
  assert.equal(parseIgnore('build/\n')[0].dirOnly, true);
});

test('a plain name matches at any depth', () => {
  const rules = parseIgnore('*.log\n');
  assert.equal(decide(rules, 'a.log', false), true);
  assert.equal(decide(rules, 'deep/inside/a.log', false), true);
});

test('a later negation wins over an earlier exclusion', () => {
  const rules = parseIgnore('*.log\n!keep.log\n');
  assert.equal(decide(rules, 'a.log', false), true);
  assert.equal(decide(rules, 'keep.log', false), false);
});

test('an earlier negation loses to a later exclusion', () => {
  const rules = parseIgnore('!keep.log\n*.log\n');
  assert.equal(decide(rules, 'keep.log', false), true);
});

test('a directory rule excludes what is under it', () => {
  const rules = parseIgnore('build/\n');
  assert.equal(decide(rules, 'build/out.js', false), true);
  assert.equal(decide(rules, 'src/out.js', false), false);
});

test('a path is filtered on its basename and not on a substring', () => {
  // A substring filter over a path also excludes .github and .gitignore, which
  // is a bug that cost a whole perturbation suite once.
  const rules = parseIgnore('.git/\n');
  assert.equal(decide(rules, '.github/workflows/ci.yml', false), false);
  assert.equal(decide(rules, '.gitignore', false), false);
});

test('the tracked list agrees with git on a tree built for the purpose', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shopify-perf-track-'));
  try {
    await mkdir(join(dir, 'src'), { recursive: true });
    await mkdir(join(dir, 'build'), { recursive: true });
    await mkdir(join(dir, 'build', 'keep'), { recursive: true });
    await writeFile(join(dir, '.gitignore'), '*.log\n!keep.log\nbuild/\n!build/keep/\n');
    await writeFile(join(dir, 'a.log'), 'x');
    await writeFile(join(dir, 'keep.log'), 'x');
    await writeFile(join(dir, 'src', 'a.mjs'), 'x');
    await writeFile(join(dir, 'build', 'out.js'), 'x');
    await writeFile(join(dir, 'build', 'keep', 'kept.js'), 'x');
    await run('git', ['init', '-q'], { cwd: dir });
    await run('git', ['add', '-A'], { cwd: dir });
    const { stdout } = await run('git', ['ls-files'], { cwd: dir });
    const fromGit = stdout.split('\n').filter(Boolean).sort();
    const fromTool = await trackedFiles(dir);
    assert.deepStrictEqual(fromTool, fromGit);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('a negation cannot re-include a file inside an excluded directory', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shopify-perf-track2-'));
  try {
    await mkdir(join(dir, 'build'), { recursive: true });
    await writeFile(join(dir, '.gitignore'), 'build/\n!build/out.js\n');
    await writeFile(join(dir, 'build', 'out.js'), 'x');
    await writeFile(join(dir, 'kept.js'), 'x');
    await run('git', ['init', '-q'], { cwd: dir });
    await run('git', ['add', '-A'], { cwd: dir });
    const { stdout } = await run('git', ['ls-files'], { cwd: dir });
    const fromGit = stdout.split('\n').filter(Boolean).sort();
    assert.deepStrictEqual(await trackedFiles(dir), fromGit);
    assert.deepStrictEqual(fromGit, ['.gitignore', 'kept.js']);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the tracked list of this repository holds no ignored directory', async () => {
  const files = await trackedFiles(ROOT);
  assert.equal(files.filter((p) => p.startsWith('node_modules/')).length, 0);
  assert.equal(files.filter((p) => p === 'package-lock.json').length, 0);
});

test('a text file is recognised and a file with a zero byte is not', async () => {
  const dir = await mkdtemp(join(tmpdir(), 'shopify-perf-text-'));
  try {
    await writeFile(join(dir, 'a.txt'), 'plain');
    await writeFile(join(dir, 'b.bin'), Buffer.from([0x01, 0x00, 0x02]));
    assert.equal(await isTextFile(join(dir, 'a.txt')), true);
    assert.equal(await isTextFile(join(dir, 'b.bin')), false);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('the test file list comes out of the script and drops flags', () => {
  const files = testFilesFrom('node --test --test-reporter=tools/count-tests.mjs test/a.test.mjs test/b.test.mjs');
  assert.deepStrictEqual(files, ['test/a.test.mjs', 'test/b.test.mjs']);
});

test('the test file list drops a tool path that is not a test', () => {
  const files = testFilesFrom('node --test tools/count-tests.mjs test/a.test.mjs');
  assert.deepStrictEqual(files, ['test/a.test.mjs']);
});

test('branches are counted on masked source so a string cannot add one', () => {
  assert.equal(countBranches('const a = "if (x)";\n'), 0);
});

test('a comment line does not add a branch', () => {
  assert.equal(countBranches('// if (x) and a ? b\nconst a = 1;\n'), 0);
});

test('every branching form is counted', () => {
  assert.equal(countBranches('if (a) b;\n'), 1);
  assert.equal(countBranches('const x = a ? b : c;\n'), 1);
  assert.equal(countBranches('const x = a && b;\n'), 1);
  assert.equal(countBranches('const x = a || b;\n'), 1);
  assert.equal(countBranches('try { a(); } catch { b(); }\n'), 1);
});

test('blank lines are not counted as lines', () => {
  assert.equal(countLines('a\n\n\nb\n'), 2);
});

test('the entry point is inside its budget', async () => {
  const result = await checkEntry(ROOT);
  assert.deepStrictEqual(result.problems, []);
});

test('the branch budget has no headroom', async () => {
  const measured = await measure(ROOT);
  assert.equal(BUDGET.branches, measured.branches);
});

test('the line budget is the measurement plus two lines of slack', async () => {
  const measured = await measure(ROOT);
  assert.equal(BUDGET.lines, measured.lines + 2);
});

test('the generated finding list names every catalogued finding', () => {
  const text = renderFindings();
  for (const entry of CATALOGUE) assert.match(text, new RegExp('### ' + entry.id.replace(/-/g, '\\-')));
});

test('the generated finding list says where every finding is reached', () => {
  const text = renderFindings();
  assert.equal(/Reached by: nothing/.test(text), false);
});

test('the generated limits document names every limit and its kind', () => {
  const text = renderLimits();
  for (const limit of LIMITS) {
    assert.match(text, new RegExp('## ' + limit.title.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
    assert.match(text, new RegExp('Kind: ' + limit.kind));
  }
});

test('the generated documents on disk match the manifests', async () => {
  assert.deepStrictEqual(await stale(ROOT), []);
});

test('both generated documents are declared', () => {
  assert.deepStrictEqual(DOCUMENTS.map((d) => d.path), ['docs/FINDINGS.md', 'docs/LIMITS.md']);
});

test('the token set read from text output matches the one read from json', async () => {
  const bin = join(ROOT, 'bin', 'shopify-perf.mjs');
  const path = 'patterns/collection-loop-limit.before.liquid';
  const asText = await runBinary({ bin, args: [path, '--format', 'text'], cwd: ROOT });
  const asJson = await runBinary({ bin, args: [path, '--format', 'json'], cwd: ROOT });
  assert.deepStrictEqual(tokensFromText(asText.out), tokensFromJson(asJson.out));
});

test('the real binary exits as the severity table says', async () => {
  const bin = join(ROOT, 'bin', 'shopify-perf.mjs');
  const clean = await runBinary({ bin, args: ['patterns/product-count.after.liquid'], cwd: ROOT });
  const warn = await runBinary({ bin, args: ['patterns/product-count.before.liquid'], cwd: ROOT });
  const error = await runBinary({ bin, args: ['patterns/all-products-loop.before.liquid'], cwd: ROOT });
  assert.equal(clean.code, 0);
  assert.equal(warn.code, 1);
  assert.equal(error.code, 2);
});

test('the library verdict agrees with the manifest for one case', async () => {
  const result = await verdict({
    root: ROOT,
    item: { path: 'patterns/product-count.before.liquid', expected: ['liquid-products-size-for-count@warn'] }
  });
  assert.equal(result.ok, true, result.reason);
});

test('the library verdict refuses a manifest that is wrong', async () => {
  const result = await verdict({
    root: ROOT,
    item: { path: 'patterns/product-count.before.liquid', expected: [] }
  });
  assert.equal(result.ok, false);
});

test('a stated number has to appear on exactly one line', () => {
  assert.equal(statedOnOneLine('a\n7 tests\nb\n', '7 tests').ok, true);
  assert.equal(statedOnOneLine('a\n7 tests\n7 tests\n', '7 tests').ok, false);
  assert.equal(statedOnOneLine('a\nb\n', '7 tests').ok, false);
});

test('a number allowed to wrap is not stated on one line', () => {
  assert.equal(statedOnOneLine('it has 7\ntests\n', '7 tests').ok, false);
});

test('every claim has a name and a check', () => {
  for (const claim of CLAIMS) {
    assert.equal(typeof claim.name, 'string');
    assert.ok(claim.name.length > 10, claim.name);
    assert.equal(typeof claim.check, 'function');
  }
});

test('no two claims share a name', () => {
  const names = CLAIMS.map((c) => c.name);
  assert.equal(new Set(names).size, names.length);
});

test('the suite that is guarded does not read the file that guards it', async () => {
  const source = await readFile(join(ROOT, 'test', 'pairs.test.mjs'), 'utf8');
  assert.equal(/verify\.mjs/.test(source), false);
});

test('the guarded suite makes an exact comparison and no containment check', async () => {
  const source = await readFile(join(ROOT, 'test', 'pairs.test.mjs'), 'utf8');
  const body = source.split('\n').filter((line) => !line.trim().startsWith('//')).join('\n');
  const loose = ['includes' + '(', 'some' + '(', 'contains'];
  for (const needle of loose) assert.equal(body.indexOf(needle), -1, needle);
  assert.ok(body.indexOf('deepStrictEqual') > -1);
});

test('the mask keeps the length of every runtime source file', async () => {
  const files = (await trackedFiles(ROOT)).filter((p) => p.startsWith('src/') && p.endsWith('.mjs'));
  assert.ok(files.length > 5);
  for (const path of files) {
    const source = await readFile(join(ROOT, path), 'utf8');
    assert.equal(maskSource(source).length, source.length, path);
  }
});
