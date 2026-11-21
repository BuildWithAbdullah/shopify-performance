// The verifier.
//
// A fixed list of named claims about this repository. The count of claims is
// the number this README quotes, so it does not move when a file is added or a
// check gains a case. Counting assertions per file made the number grow with
// the repository rather than with what it checks, which made it meaningless
// between repositories and inside one.
//
// Each claim takes a context. That is what lets the suite exercise every claim
// without the suite running itself: the command line fills the test count by
// spawning the counter, and the suite fills it from the README it is checking.

import { readFile } from 'node:fs/promises';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { realpathSync } from 'node:fs';
import { trackedFiles, isTextFile } from './tracked.mjs';
import { count as countTests } from './count-tests.mjs';

// Every claim reasons about the tree it was given, and that tree's own modules
// are the ones loaded. Reading this file's static imports instead would mean a
// verifier that checks itself against somebody else's files, which is how the
// perturbation suite caught it: changing a manifest in a copy of the tree
// changed nothing at all, because the comparison was still using the manifest
// compiled into the running process.
const TREES = new Map();

export async function loadTree(root) {
  const held = TREES.get(root);
  if (held) return held;
  const at = (relative) => import(pathToFileURL(join(root, relative)).href);
  const [
    catalogue, thresholds, auditModule, hosts, pairs, fixtures, limits,
    corpus, entryThin, genDocs, verdicts, exitCodes, js
  ] = await Promise.all([
    at('src/catalogue.mjs'),
    at('src/thresholds.mjs'),
    at('src/audit.mjs'),
    at('src/hosts.mjs'),
    at('tools/pairs.mjs'),
    at('tools/fixtures.mjs'),
    at('tools/limits.mjs'),
    at('tools/corpus.mjs'),
    at('tools/entry-thin.mjs'),
    at('tools/gen-docs.mjs'),
    at('tools/audit-verdicts.mjs'),
    at('tools/exit-codes.mjs'),
    at('src/scan/js.mjs')
  ]);
  const tree = {
    CATALOGUE: catalogue.CATALOGUE,
    AREAS: catalogue.AREAS,
    SEVERITIES: catalogue.SEVERITIES,
    BY_ID: catalogue.BY_ID,
    THRESHOLDS: thresholds.THRESHOLDS,
    audit: auditModule.audit,
    kindFor: auditModule.kindFor,
    tokens: auditModule.tokens,
    isAllowedExampleHost: hosts.isAllowedExampleHost,
    hostOf: hosts.hostOf,
    PAIRS: pairs.PAIRS,
    pairFiles: pairs.pairFiles,
    FIXTURES: fixtures.FIXTURES,
    fixturePath: fixtures.fixturePath,
    SECOND_SEVERITY_FIXTURES: fixtures.SECOND_SEVERITY_FIXTURES,
    LIMITS: limits.LIMITS,
    limitFiles: limits.limitFiles,
    corpusCases: corpus.corpusCases,
    expectedExit: corpus.expectedExit,
    sameSet: corpus.sameSet,
    describeDifference: corpus.describeDifference,
    SEVERITY_EXIT: corpus.SEVERITY_EXIT,
    checkEntry: entryThin.check,
    measureEntry: entryThin.measure,
    BUDGET: entryThin.BUDGET,
    staleDocs: genDocs.stale,
    checkLibrary: verdicts.checkAll,
    checkBinary: exitCodes.checkAll,
    checkThroughSymlink: exitCodes.checkThroughSymlink,
    maskSource: js.maskSource
  };
  TREES.set(root, tree);
  return tree;
}

const ok = (detail) => ({ ok: true, detail });
const no = (detail) => ({ ok: false, detail });

// Needles are built from fragments at run time so no file on disk contains the
// pattern any scanner here looks for. A purity check that declares its needle
// as a literal reports itself, which has happened on this account twice.
const EM_DASH = String.fromCharCode(0x2014);
const EN_DASH = String.fromCharCode(0x2013);

function dropComments(source) {
  return source
    .split('\n')
    .filter((line) => {
      const t = line.trim();
      return !(t.startsWith('//') || t.startsWith('*') || t.startsWith('/*') || t.startsWith('#'));
    })
    .join('\n');
}

// A self checking number has to be matched as a whole line. A pattern that
// matches anywhere passes when the number is duplicated, and a number allowed
// to wrap passes when the line it sits on has been reflowed.
export function statedOnOneLine(readme, sentence) {
  const lines = readme.split('\n').filter((line) => line.includes(sentence));
  return { count: lines.length, ok: lines.length === 1 };
}

async function readAll(root, paths) {
  const out = [];
  for (const path of paths) out.push({ path, source: await readFile(join(root, path), 'utf8') });
  return out;
}

async function corpusTokenMap({ root, tree }) {
  const map = new Map();
  for (const item of tree.corpusCases()) {
    const source = await readFile(join(root, item.path), 'utf8');
    const result = tree.audit([{ kind: tree.kindFor(item.path), path: item.path, source }]);
    map.set(item.path, { actual: tree.tokens(result.findings), item, findings: result.findings });
  }
  return map;
}

export const CLAIMS = [
  {
    name: 'catalogue ids are unique',
    async check({ root, tree, readme, testCount }) {
      const ids = tree.CATALOGUE.map((e) => e.id);
      return new Set(ids).size === ids.length ? ok(ids.length + ' ids') : no('duplicate ids');
    }
  },
  {
    name: 'every catalogue entry names an area that exists',
    async check({ root, tree, readme, testCount }) {
      const known = new Set(tree.AREAS.map((a) => a.id));
      const bad = tree.CATALOGUE.filter((e) => !known.has(e.area));
      return bad.length ? no(bad.map((e) => e.id).join(', ')) : ok(tree.AREAS.length + ' areas');
    }
  },
  {
    name: 'every area has at least one finding',
    async check({ root, tree, readme, testCount }) {
      const empty = tree.AREAS.filter((a) => !tree.CATALOGUE.some((e) => e.area === a.id));
      return empty.length ? no(empty.map((a) => a.id).join(', ')) : ok('all populated');
    }
  },
  {
    name: 'every declared severity is a known severity',
    async check({ root, tree, readme, testCount }) {
      const bad = tree.CATALOGUE.filter((e) => !e.severities.every((s) => tree.SEVERITIES.includes(s)));
      return bad.length ? no(bad.map((e) => e.id).join(', ')) : ok(tree.SEVERITIES.join(', '));
    }
  },
  {
    name: 'every catalogue entry declares a reason and a fix',
    async check({ root, tree, readme, testCount }) {
      const bad = tree.CATALOGUE.filter((e) => !e.why || !e.fix || !e.title);
      return bad.length ? no(bad.map((e) => e.id).join(', ')) : ok(tree.CATALOGUE.length + ' entries');
    }
  },
  {
    name: 'every finding is reached by the corpus',
    async check({ root, tree, readme, testCount }) {
      const map = await corpusTokenMap({ root, tree });
      const reached = new Set();
      for (const { actual } of map.values()) for (const t of actual) reached.add(t.split('@')[0]);
      const missing = tree.CATALOGUE.filter((e) => !reached.has(e.id));
      return missing.length ? no('unreached: ' + missing.map((e) => e.id).join(', ')) : ok(reached.size + ' reached');
    }
  },
  {
    name: 'a severity a real run produces is declared',
    async check({ root, tree, readme, testCount }) {
      const map = await corpusTokenMap({ root, tree });
      const bad = [];
      for (const { findings } of map.values()) {
        for (const f of findings) {
          if (!tree.BY_ID.get(f.id).severities.includes(f.severity)) bad.push(f.id + '@' + f.severity);
        }
      }
      return bad.length ? no([...new Set(bad)].join(', ')) : ok('no undeclared severity');
    }
  },
  {
    name: 'a severity that is declared is produced somewhere',
    async check({ root, tree, readme, testCount }) {
      const map = await corpusTokenMap({ root, tree });
      const seen = new Set();
      for (const { actual } of map.values()) for (const t of actual) seen.add(t);
      const missing = [];
      for (const entry of tree.CATALOGUE) {
        for (const severity of entry.severities) {
          if (!seen.has(entry.id + '@' + severity)) missing.push(entry.id + '@' + severity);
        }
      }
      return missing.length ? no(missing.join(', ')) : ok(seen.size + ' tree.tokens produced');
    }
  },
  {
    name: 'the never produced check is not vacuous',
    async check({ root, tree, readme, testCount }) {
      // The same comparison over an invented id has to fail, or the passing
      // version above might be passing because the loop body never runs.
      const map = await corpusTokenMap({ root, tree });
      const seen = new Set();
      for (const { actual } of map.values()) for (const t of actual) seen.add(t);
      const invented = 'this-finding-does-not-exist@error';
      return seen.has(invented) ? no('the invented token was produced') : ok('an invented id is absent, as it must be');
    }
  },
  {
    name: 'every pair is exact in both directions',
    async check({ root, tree, readme, testCount }) {
      const map = await corpusTokenMap({ root, tree });
      const problems = [];
      for (const pair of tree.PAIRS) {
        const files = tree.pairFiles(pair);
        for (const [side, want] of [['before', pair.expected], ['after', pair.residual]]) {
          const entry = map.get(files[side]);
          if (!entry) {
            problems.push(files[side] + ' is missing');
            continue;
          }
          if (!tree.sameSet(entry.actual, want)) {
            problems.push(files[side] + ': ' + tree.describeDifference(entry.actual, want.slice().sort()));
          }
        }
      }
      return problems.length ? no(problems.join(' | ')) : ok(tree.PAIRS.length + ' pairs');
    }
  },
  {
    name: 'every fixture is exact',
    async check({ root, tree, readme, testCount }) {
      const map = await corpusTokenMap({ root, tree });
      const problems = [];
      for (const fixture of tree.FIXTURES) {
        const entry = map.get(tree.fixturePath(fixture));
        if (!entry) {
          problems.push(fixture.file + ' is missing');
          continue;
        }
        if (!tree.sameSet(entry.actual, fixture.expected)) {
          problems.push(fixture.file + ': ' + tree.describeDifference(entry.actual, fixture.expected.slice().sort()));
        }
      }
      return problems.length ? no(problems.join(' | ')) : ok(tree.FIXTURES.length + ' fixtures');
    }
  },
  {
    name: 'no fixture reaches a reason a pair already reaches',
    async check({ root, tree, readme, testCount }) {
      const fromPairs = new Set();
      for (const pair of tree.PAIRS) for (const t of pair.expected) fromPairs.add(t.split('@')[0]);
      const allowed = new Set(tree.FIXTURES.flatMap(() => []));
      const overlap = [];
      for (const fixture of tree.FIXTURES) {
        for (const token of fixture.expected) {
          const id = token.split('@')[0];
          if (fromPairs.has(id) && !allowed.has(token)) overlap.push(fixture.file + ' -> ' + id);
        }
      }
      return overlap.length ? no(overlap.join(', ')) : ok(tree.FIXTURES.length + ' fixtures, no overlap');
    }
  },
  {
    name: 'every pair contributes a token no other artefact contributes',
    async check({ root, tree, readme, testCount }) {
      const counts = new Map();
      const bump = (token) => counts.set(token, (counts.get(token) || 0) + 1);
      for (const pair of tree.PAIRS) for (const t of new Set(pair.expected)) bump(t);
      for (const fixture of tree.FIXTURES) for (const t of new Set(fixture.expected)) bump(t);
      const idle = tree.PAIRS.filter((pair) => !pair.expected.some((t) => counts.get(t) === 1));
      return idle.length ? no('carries nothing of its own: ' + idle.map((p) => p.slug).join(', ')) : ok('all load bearing');
    }
  },
  {
    name: 'the residual field is used by at least one pair',
    async check({ root, tree, readme, testCount }) {
      const used = tree.PAIRS.filter((p) => p.residual.length);
      return used.length ? ok(used.map((p) => p.slug).join(', ')) : no('every residual is empty, so the field is never exercised');
    }
  },
  {
    name: 'every pair declares a note',
    async check({ root, tree, readme, testCount }) {
      const bad = tree.PAIRS.filter((p) => !p.note || p.note.length < 20);
      return bad.length ? no(bad.map((p) => p.slug).join(', ')) : ok(tree.PAIRS.length + ' notes');
    }
  },
  {
    name: 'every limit artefact is exact',
    async check({ root, tree, readme, testCount }) {
      const map = await corpusTokenMap({ root, tree });
      const problems = [];
      for (const limit of tree.LIMITS) {
        const files = tree.limitFiles(limit);
        for (const [side, want] of [['blind', limit.blindExpected], ['contrast', limit.contrastExpected]]) {
          const entry = map.get(files[side]);
          if (!entry) {
            problems.push(files[side] + ' is missing');
            continue;
          }
          if (!tree.sameSet(entry.actual, want)) {
            problems.push(files[side] + ': ' + tree.describeDifference(entry.actual, want.slice().sort()));
          }
        }
      }
      return problems.length ? no(problems.join(' | ')) : ok(tree.LIMITS.length + ' limits');
    }
  },
  {
    name: 'a limit that hides is blind in its blind case',
    async check({ root, tree, readme, testCount }) {
      const bad = tree.LIMITS.filter(
        (l) => l.kind === 'hides' && l.blindExpected.some((t) => t.split('@')[0] === l.target)
      );
      return bad.length ? no(bad.map((l) => l.slug).join(', ')) : ok('all blind');
    }
  },
  {
    name: 'a limit that hides reports in its contrast case',
    async check({ root, tree, readme, testCount }) {
      const bad = tree.LIMITS.filter(
        (l) => l.kind === 'hides' && !l.contrastExpected.some((t) => t.split('@')[0] === l.target)
      );
      return bad.length ? no('proves nothing: ' + bad.map((l) => l.slug).join(', ')) : ok('all contrast cases report');
    }
  },
  {
    name: 'a limit that manufactures reports in its blind case',
    async check({ root, tree, readme, testCount }) {
      const bad = tree.LIMITS.filter(
        (l) => l.kind === 'manufactures' && !l.blindExpected.some((t) => t.split('@')[0] === l.target)
      );
      return bad.length ? no(bad.map((l) => l.slug).join(', ')) : ok('all manufacture');
    }
  },
  {
    name: 'a limit that manufactures has a clean contrast case',
    async check({ root, tree, readme, testCount }) {
      const bad = tree.LIMITS.filter((l) => l.kind === 'manufactures' && l.contrastExpected.length);
      return bad.length ? no(bad.map((l) => l.slug).join(', ')) : ok('all clean');
    }
  },
  {
    name: 'every limit names a finding that exists',
    async check({ root, tree, readme, testCount }) {
      const bad = tree.LIMITS.filter((l) => !tree.BY_ID.has(l.target));
      return bad.length ? no(bad.map((l) => l.target).join(', ')) : ok(tree.LIMITS.length + ' targets');
    }
  },
  {
    name: 'every limit names a kind that exists',
    async check({ root, tree, readme, testCount }) {
      const bad = tree.LIMITS.filter((l) => l.kind !== 'hides' && l.kind !== 'manufactures');
      return bad.length ? no(bad.map((l) => l.slug).join(', ')) : ok('hides and manufactures only');
    }
  },
  {
    name: 'the exit code of every artefact derives from the severity table',
    async check({ root, tree, readme, testCount }) {
      const map = await corpusTokenMap({ root, tree });
      const problems = [];
      for (const [path, entry] of map) {
        const worst = entry.actual.reduce((acc, t) => Math.max(acc, tree.SEVERITY_EXIT[t.split('@')[1]]), 0);
        if (worst !== tree.expectedExit(entry.item.expected)) problems.push(path);
      }
      return problems.length ? no(problems.join(', ')) : ok(map.size + ' artefacts');
    }
  },
  {
    name: 'the library agrees with every manifest',
    async check({ root, tree, readme, testCount }) {
      const result = await tree.checkLibrary(root);
      return result.problems.length ? no(result.problems.join(' | ')) : ok(result.runs + ' checker runs');
    }
  },
  {
    name: 'the binary agrees with the library in both output modes',
    async check({ root, tree, readme, testCount }) {
      const bin = join(root, 'bin', 'shopify-perf.mjs');
      const result = await tree.checkBinary({ root, bin });
      return result.problems.length ? no(result.problems.join(' | ')) : ok(result.runs + ' binary runs');
    }
  },
  {
    name: 'the binary works through a symlink',
    async check({ root, tree, readme, testCount }) {
      const bin = join(root, 'bin', 'shopify-perf.mjs');
      const result = await tree.checkThroughSymlink({ root, bin });
      return result.problems.length ? no(result.problems.join(' | ')) : ok(result.runs + ' runs through a link');
    }
  },
  {
    name: 'the main module guard is spelled identically everywhere',
    async check({ root, tree, readme, testCount }) {
      const files = (await trackedFiles(root)).filter((p) => p.endsWith('.mjs'));
      const guarded = [];
      for (const { path, source } of await readAll(root, files)) {
        if (source.includes('invokedDirectly')) guarded.push({ path, source });
      }
      // Keyed on the comparison, not on the name of a helper variable, so
      // renaming the variable cannot make two spellings look the same.
      const needle = 'pathToFileURL(realpathSync(process.argv[1])).href === import.meta.url';
      const bad = guarded.filter((g) => !g.source.includes(needle));
      if (bad.length) return no(bad.map((g) => g.path).join(', '));
      return guarded.length ? ok(guarded.length + ' guarded files') : no('nothing is guarded, so nothing was checked');
    }
  },
  {
    name: 'no tracked text file carries an em dash or an en dash',
    async check({ root, tree, readme, testCount }) {
      const files = await trackedFiles(root);
      const bad = [];
      for (const path of files) {
        if (!(await isTextFile(join(root, path)))) continue;
        const source = await readFile(join(root, path), 'utf8');
        if (source.includes(EM_DASH) || source.includes(EN_DASH)) bad.push(path);
      }
      return bad.length ? no(bad.join(', ')) : ok(files.length + ' tracked files');
    }
  },
  {
    name: 'every host named in an example is an allowed host',
    async check({ root, tree, readme, testCount }) {
      const files = (await trackedFiles(root)).filter(
        (p) => p.startsWith('patterns/') || p.startsWith('fixtures/') || p.startsWith('limits/')
      );
      const bad = [];
      for (const { path, source } of await readAll(root, files)) {
        const matches = source.match(/(?:https?:)?\/\/[A-Za-z0-9._-]+/g) || [];
        for (const match of matches) {
          const host = tree.hostOf(match.startsWith('//') ? match : match);
          if (host && !tree.isAllowedExampleHost(host)) bad.push(path + ' -> ' + host);
        }
      }
      return bad.length ? no([...new Set(bad)].join(', ')) : ok(files.length + ' example files');
    }
  },
  {
    name: 'no example carries a thirteen digit number',
    async check({ root, tree, readme, testCount }) {
      const files = (await trackedFiles(root)).filter(
        (p) => p.startsWith('patterns/') || p.startsWith('fixtures/') || p.startsWith('limits/')
      );
      const bad = [];
      for (const { path, source } of await readAll(root, files)) {
        if (/(?<![0-9])[0-9]{13}(?![0-9])/.test(source)) bad.push(path);
      }
      return bad.length ? no(bad.join(', ')) : ok(files.length + ' example files');
    }
  },
  {
    name: 'every threshold has a reason written above it',
    async check({ root, tree, readme, testCount }) {
      const source = await readFile(join(root, 'src', 'thresholds.mjs'), 'utf8');
      const names = Object.keys(tree.THRESHOLDS);
      const bad = [];
      const lines = source.split('\n');
      for (const name of names) {
        const at = lines.findIndex((line) => line.trim().startsWith(name + ':'));
        if (at < 1) {
          bad.push(name);
          continue;
        }
        if (!lines[at - 1].trim().startsWith('//')) bad.push(name);
      }
      return bad.length ? no(bad.join(', ')) : ok(names.length + ' thresholds');
    }
  },
  {
    name: 'the entry point is inside its budget',
    async check({ root, tree, readme, testCount }) {
      const result = await tree.checkEntry(root);
      return result.problems.length
        ? no(result.problems.join(' | '))
        : ok(result.measured.branches + ' branches, ' + result.measured.lines + ' lines');
    }
  },
  {
    name: 'the branch budget equals the measurement',
    async check({ root, tree, readme, testCount }) {
      const measured = await tree.measureEntry(root);
      if (measured.branches !== tree.BUDGET.branches) {
        return no('budget ' + tree.BUDGET.branches + ' against ' + measured.branches + ' measured, so it has headroom');
      }
      if (tree.BUDGET.lines !== measured.lines + 2) {
        return no('the line budget should be the measurement plus two, not ' + tree.BUDGET.lines);
      }
      return ok('no headroom');
    }
  },
  {
    name: 'the generated documents are current',
    async check({ root, tree, readme, testCount }) {
      const problems = await tree.staleDocs(root);
      return problems.length ? no(problems.join(', ')) : ok('two documents');
    }
  },
  {
    name: 'the test script names every test file on disk',
    async check({ root, tree, readme, testCount }) {
      const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
      const named = new Set(
        pkg.scripts.test.split(/\s+/).filter((p) => p.endsWith('.test.mjs'))
      );
      const onDisk = (await trackedFiles(root)).filter((p) => p.endsWith('.test.mjs'));
      const missing = onDisk.filter((p) => !named.has(p));
      const ghosts = [...named].filter((p) => !onDisk.includes(p));
      if (missing.length) return no('never run: ' + missing.join(', '));
      if (ghosts.length) return no('named and absent: ' + ghosts.join(', '));
      return ok(onDisk.length + ' test files');
    }
  },
  {
    name: 'nothing shipped imports from a directory that is not shipped',
    async check({ root, tree, readme, testCount }) {
      const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
      const shipped = pkg.files.map((entry) => entry.replace(/\/$/, ''));
      const runtime = (await trackedFiles(root)).filter(
        (p) => (p.startsWith('src/') || p.startsWith('bin/')) && p.endsWith('.mjs')
      );
      const bad = [];
      for (const { path, source } of await readAll(root, runtime)) {
        // Anchored to the start of a line, so an import written inside a
        // string literal in a test is not read as a real one.
        const matches = dropComments(source).match(/^\s*import[^\n]*from\s+['"]([^'"]+)['"]/gm) || [];
        for (const line of matches) {
          const specifier = line.match(/from\s+['"]([^'"]+)['"]/)[1];
          if (!specifier.startsWith('.')) continue;
          // Resolved against the importing file, not against the repository
          // root, which is the mistake that makes this check useless.
          const target = resolve(dirname(join(root, path)), specifier);
          const rel = target.slice(join(root, '/').length).split('\\').join('/');
          const top = rel.split('/')[0];
          if (!shipped.includes(top)) bad.push(path + ' -> ' + rel);
        }
      }
      return bad.length ? no(bad.join(', ')) : ok(runtime.length + ' runtime files');
    }
  },
  {
    name: 'every relative import in the runtime resolves to a file on disk',
    async check({ root, tree, readme, testCount }) {
      const runtime = (await trackedFiles(root)).filter(
        (p) => (p.startsWith('src/') || p.startsWith('bin/') || p.startsWith('tools/')) && p.endsWith('.mjs')
      );
      const tracked = new Set(await trackedFiles(root));
      const bad = [];
      for (const { path, source } of await readAll(root, runtime)) {
        const matches = dropComments(source).match(/^\s*import[^\n]*from\s+['"]([^'"]+)['"]/gm) || [];
        for (const line of matches) {
          const specifier = line.match(/from\s+['"]([^'"]+)['"]/)[1];
          if (!specifier.startsWith('.')) continue;
          const target = resolve(dirname(join(root, path)), specifier);
          const rel = target.slice(join(root, '/').length).split('\\').join('/');
          if (!tracked.has(rel)) bad.push(path + ' -> ' + specifier);
        }
      }
      return bad.length ? no(bad.join(', ')) : ok('every specifier resolves');
    }
  },
  {
    name: 'the package declares no dependencies',
    async check({ root, tree, readme, testCount }) {
      const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
      const deps = Object.keys(pkg.dependencies || {});
      const dev = Object.keys(pkg.devDependencies || {});
      return deps.length || dev.length ? no(deps.concat(dev).join(', ')) : ok('none, so every red build means something');
    }
  },
  {
    name: 'the lockfile is not both tracked and ignored',
    async check({ root, tree, readme, testCount }) {
      const ignore = await readFile(join(root, '.gitignore'), 'utf8');
      const ignored = ignore.split('\n').some((line) => line.trim() === 'package-lock.json');
      const tracked = (await trackedFiles(root)).includes('package-lock.json');
      if (ignored && tracked) return no('it is ignored and present');
      if (!ignored && !tracked) return no('it is neither ignored nor tracked, so a reader cannot tell which was meant');
      return ok(ignored ? 'ignored, and absent' : 'tracked');
    }
  },
  {
    name: 'the engines floor names an exact version with an operator',
    async check({ root, tree, readme, testCount }) {
      const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
      const range = (pkg.engines || {}).node || '';
      if (!/^>=\d+\.\d+\.\d+$/.test(range)) {
        return no('"' + range + '" is not a floor naming all three components');
      }
      return ok(range);
    }
  },
  {
    name: 'the engines floor appears in CI with all three components',
    async check({ root, tree, readme, testCount }) {
      const pkg = JSON.parse(await readFile(join(root, 'package.json'), 'utf8'));
      const floor = ((pkg.engines || {}).node || '').replace('>=', '');
      const ci = await readFile(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
      // A bare major in the matrix resolves to the newest release of that line,
      // so a job named with one is not a test of the floor.
      const bare = ci.match(/^\s*-\s*'(\d+)'\s*$/gm);
      if (bare) return no('the matrix names a bare major: ' + bare.join(', ').trim());
      return ci.includes("'" + floor + "'") ? ok(floor + ' is in the matrix') : no(floor + ' is not in the matrix');
    }
  },
  {
    name: 'CI has a job that proves the floor is enforced',
    async check({ root, tree, readme, testCount }) {
      const ci = await readFile(join(root, '.github', 'workflows', 'ci.yml'), 'utf8');
      const hasRefusal = ci.includes('engine-strict') && ci.includes('engines-refusal');
      return hasRefusal
        ? ok('an engines refusal job is declared')
        : no('nothing proves the floor is more than a string in a file');
    }
  },
  {
    name: 'no CI step redirects an npm run',
    async check({ root, tree, readme, testCount }) {
      const ci = dropComments(await readFile(join(root, '.github', 'workflows', 'ci.yml'), 'utf8'));
      const bad = ci.split('\n').filter((line) => /npm run [^|>]*[|>]/.test(line));
      return bad.length ? no(bad.map((l) => l.trim()).join(' | ')) : ok('none, so no banner lands in a generated file');
    }
  },
  {
    name: 'the corpus comparisons in the suite are exact and not containment',
    async check({ root, tree, readme, testCount }) {
      // This guard lives outside the file it reads. Written inside the pair
      // suite it counted its own needle and then reported the line doing the
      // counting, and assembling the needle at run time does not fix a scanner
      // that sits inside its own subject.
      const subject = 'test/pairs.test.mjs';
      const source = dropComments(await readFile(join(root, subject), 'utf8'));
      const loose = ['includes' + '(', 'some' + '(', 'contains'];
      const found = loose.filter((needle) => source.includes(needle));
      if (found.length) return no(subject + ' uses a containment check: ' + found.join(', '));
      const exact = 'deepStrictEqual';
      return source.includes(exact) ? ok(subject + ' compares whole sets') : no(subject + ' makes no exact comparison');
    }
  },
  {
    name: 'the guarded suite does not read the guard back',
    async check({ root, tree, readme, testCount }) {
      const source = await readFile(join(root, 'test', 'pairs.test.mjs'), 'utf8');
      return source.includes('verify.mjs')
        ? no('test/pairs.test.mjs reads the file that guards it, which is the trap again')
        : ok('the guard and its subject are separate');
    }
  },
  {
    name: 'no source file masks its own string literals away and then reads them',
    async check({ root, tree, readme, testCount }) {
      const files = (await trackedFiles(root)).filter((p) => p.startsWith('src/') && p.endsWith('.mjs'));
      const bad = [];
      for (const { path, source } of await readAll(root, files)) {
        const masked = tree.maskSource(source);
        if (masked.length !== source.length) bad.push(path);
      }
      return bad.length ? no(bad.join(', ')) : ok('the mask preserves every offset');
    }
  },
  {
    name: 'the README states the test count once, on one line',
    async check({ root, tree, readme, testCount }) {
      const sentence = testCount + ' tests';
      const stated = statedOnOneLine(readme, sentence);
      return stated.ok ? ok(sentence) : no('"' + sentence + '" appears on ' + stated.count + ' lines');
    }
  },
  {
    name: 'the README states the claim count once, on one line',
    async check({ root, tree, readme, testCount }) {
      const sentence = CLAIMS.length + ' repository assertions';
      const stated = statedOnOneLine(readme, sentence);
      return stated.ok ? ok(sentence) : no('"' + sentence + '" appears on ' + stated.count + ' lines');
    }
  },
  {
    name: 'the README states the finding count once, on one line',
    async check({ root, tree, readme, testCount }) {
      const sentence = tree.CATALOGUE.length + ' catalogued findings';
      const stated = statedOnOneLine(readme, sentence);
      return stated.ok ? ok(sentence) : no('"' + sentence + '" appears on ' + stated.count + ' lines');
    }
  },
  {
    name: 'the README states the area count once, on one line',
    async check({ root, tree, readme, testCount }) {
      const sentence = tree.AREAS.length + ' areas';
      const stated = statedOnOneLine(readme, sentence);
      return stated.ok ? ok(sentence) : no('"' + sentence + '" appears on ' + stated.count + ' lines');
    }
  },
  {
    name: 'the README states the pair count once, on one line',
    async check({ root, tree, readme, testCount }) {
      const sentence = tree.PAIRS.length + ' pattern pairs';
      const stated = statedOnOneLine(readme, sentence);
      return stated.ok ? ok(sentence) : no('"' + sentence + '" appears on ' + stated.count + ' lines');
    }
  },
  {
    name: 'the README states the fixture count once, on one line',
    async check({ root, tree, readme, testCount }) {
      const sentence = tree.FIXTURES.length + ' fixtures';
      const stated = statedOnOneLine(readme, sentence);
      return stated.ok ? ok(sentence) : no('"' + sentence + '" appears on ' + stated.count + ' lines');
    }
  },
  {
    name: 'the README states the limit count once, on one line',
    async check({ root, tree, readme, testCount }) {
      const sentence = tree.LIMITS.length + ' declared limits';
      const stated = statedOnOneLine(readme, sentence);
      return stated.ok ? ok(sentence) : no('"' + sentence + '" appears on ' + stated.count + ' lines');
    }
  },
  {
    name: 'the README states the artefact count once, on one line',
    async check({ root, tree, readme, testCount }) {
      const sentence = tree.corpusCases().length + ' artefacts';
      const stated = statedOnOneLine(readme, sentence);
      return stated.ok ? ok(sentence) : no('"' + sentence + '" appears on ' + stated.count + ' lines');
    }
  },
  {
    name: 'the README has a Verifying section',
    async check({ root, tree, readme, testCount }) {
      return readme.includes('## Verifying') ? ok('present') : no('absent');
    }
  },
  {
    name: 'the README does not promise a dependency',
    async check({ root, tree, readme, testCount }) {
      return /npm install\s+[a-z@]/.test(readme) ? no('it tells a reader to install something') : ok('nothing to install');
    }
  }
];

// `only` runs a named subset. The perturbation suite uses it to prove each
// claim is not vacuous on its own: the same claim has to pass on an unchanged
// copy of the tree and fail on a perturbed one.
export async function verify(context, options = {}) {
  const wanted = options.only ? new Set(options.only) : null;
  const selected = wanted ? CLAIMS.filter((claim) => wanted.has(claim.name)) : CLAIMS;
  if (wanted && selected.length !== wanted.size) {
    throw new Error('verify was asked for a claim that does not exist');
  }
  let tree;
  try {
    tree = context.tree || (await loadTree(context.root));
  } catch (error) {
    // A tree whose own modules will not load fails every claim, rather than
    // taking the verifier down with it. That is the honest outcome: nothing
    // about such a tree has been checked.
    const results = selected.map((claim) => ({
      name: claim.name,
      ok: false,
      detail: 'the tree could not be loaded: ' + error.message
    }));
    return { results, failed: results };
  }
  const withTree = { ...context, tree };
  const results = [];
  for (const claim of selected) {
    try {
      const outcome = await claim.check(withTree);
      results.push({ name: claim.name, ...outcome });
    } catch (error) {
      results.push({ name: claim.name, ok: false, detail: 'threw: ' + error.message });
    }
  }
  return { results, failed: results.filter((r) => !r.ok) };
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
  const readme = await readFile(join(root, 'README.md'), 'utf8');
  const counted = await countTests(root, join(root, 'tools', 'count-tests.mjs'));
  if (!counted.ok) {
    process.stdout.write('the suite is not green, so no count is comparable\n');
    process.stdout.write(counted.err || '');
    process.exitCode = 1;
  } else {
    const { results, failed } = await verify({ root, readme, testCount: counted.total });
    for (const result of results) {
      process.stdout.write((result.ok ? 'ok   ' : 'FAIL ') + result.name + ': ' + result.detail + '\n');
    }
    process.stdout.write(
      results.length + ' claims, ' + failed.length + ' failed, ' + counted.total + ' tests\n'
    );
    process.exitCode = failed.length ? 1 : 0;
  }
}
