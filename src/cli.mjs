// Every decision the command line tool makes lives here. The entry point in
// bin/ is wiring: it supplies the streams and the file reader and nothing
// else. tools/entry-thin.mjs fails the build if a decision moves back into it.

import { audit, kindFor, tokens, SEVERITY_RANK } from './audit.mjs';
import { CATALOGUE, AREAS } from './catalogue.mjs';

export const EXIT = {
  clean: 0,
  warnings: 1,
  errors: 2,
  usage: 64,
  unreadable: 65
};

export const FORMATS = ['text', 'json'];

export const USAGE = [
  'shopify-perf <path>... [options]',
  '',
  'Options:',
  '  --format text|json      output shape, default text',
  '  --min-severity LEVEL    report at this level and above, default notice',
  '  --list                  print the finding catalogue and exit',
  '  --help                  print this text and exit',
  '',
  'Exit codes:',
  '  0  nothing at or above the reporting level',
  '  1  warnings only',
  '  2  at least one error',
  '  64 the arguments could not be understood',
  '  65 an input could not be read or understood'
].join('\n');

export function parseArgs(argv) {
  const paths = [];
  const options = { format: 'text', minSeverity: 'notice', list: false, help: false };
  for (let i = 0; i < argv.length; i += 1) {
    const arg = argv[i];
    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }
    if (arg === '--list') {
      options.list = true;
      continue;
    }
    if (arg === '--format' || arg === '--min-severity') {
      const value = argv[i + 1];
      if (value === undefined) return { ok: false, error: arg + ' needs a value' };
      i += 1;
      if (arg === '--format') {
        if (!FORMATS.includes(value)) return { ok: false, error: 'unknown format: ' + value };
        options.format = value;
      } else {
        if (!Object.prototype.hasOwnProperty.call(SEVERITY_RANK, value)) {
          return { ok: false, error: 'unknown severity: ' + value };
        }
        options.minSeverity = value;
      }
      continue;
    }
    if (arg.startsWith('--')) return { ok: false, error: 'unknown option: ' + arg };
    paths.push(arg);
  }
  return { ok: true, paths, options };
}

export function renderList() {
  const lines = [];
  for (const area of AREAS) {
    const entries = CATALOGUE.filter((e) => e.area === area.id);
    lines.push(area.id + '  ' + area.title + '  (' + entries.length + ')');
    for (const entry of entries) {
      lines.push('  ' + entry.id + '  [' + entry.severities.join(' ') + ']  ' + entry.title);
    }
  }
  lines.push('');
  lines.push(CATALOGUE.length + ' findings across ' + AREAS.length + ' areas');
  return lines.join('\n');
}

export function renderText(result) {
  const lines = [];
  for (const f of result.findings) {
    lines.push(
      f.path + ':' + f.line + '  ' + f.severity.padEnd(6) + '  ' + f.id + (f.detail ? '  ' + f.detail : '')
    );
  }
  if (!result.findings.length) lines.push('no findings at or above the reporting level');
  lines.push('');
  lines.push(
    result.counts.error + ' error, ' + result.counts.warn + ' warn, ' + result.counts.notice +
    ' notice across ' + result.inputs + ' input' + (result.inputs === 1 ? '' : 's')
  );
  return lines.join('\n');
}

export function renderJson(result) {
  return JSON.stringify(
    {
      inputs: result.inputs,
      counts: result.counts,
      tokens: tokens(result.findings),
      findings: result.findings.map((f) => ({
        id: f.id,
        area: f.area,
        severity: f.severity,
        path: f.path,
        line: f.line,
        title: f.title,
        detail: f.detail
      }))
    },
    null,
    2
  );
}

export function exitCodeFor(counts) {
  if (counts.error > 0) return EXIT.errors;
  if (counts.warn > 0) return EXIT.warnings;
  return EXIT.clean;
}

export function filterBySeverity(findings, minSeverity) {
  const floor = SEVERITY_RANK[minSeverity];
  return findings.filter((f) => SEVERITY_RANK[f.severity] >= floor);
}

export async function run({ argv, stdout, stderr, readFile }) {
  const write = (stream, text) => stream.write(text.endsWith('\n') ? text : text + '\n');
  const parsed = parseArgs(argv);
  if (!parsed.ok) {
    write(stderr, parsed.error);
    write(stderr, USAGE);
    return EXIT.usage;
  }
  if (parsed.options.help) {
    write(stdout, USAGE);
    return EXIT.clean;
  }
  if (parsed.options.list) {
    write(stdout, renderList());
    return EXIT.clean;
  }
  if (!parsed.paths.length) {
    write(stderr, 'no input paths given');
    write(stderr, USAGE);
    return EXIT.usage;
  }
  const inputs = [];
  for (const path of parsed.paths) {
    const kind = kindFor(path);
    if (!kind) {
      write(stderr, 'cannot tell what kind of input this is: ' + path);
      return EXIT.unreadable;
    }
    let source;
    try {
      source = await readFile(path);
    } catch (err) {
      write(stderr, 'cannot read ' + path + ': ' + err.message);
      return EXIT.unreadable;
    }
    inputs.push({ kind, path, source });
  }
  const whole = audit(inputs);
  const findings = filterBySeverity(whole.findings, parsed.options.minSeverity);
  const result = { findings, counts: whole.counts, inputs: inputs.length };
  write(stdout, parsed.options.format === 'json' ? renderJson(result) : renderText(result));
  return exitCodeFor(whole.counts);
}
