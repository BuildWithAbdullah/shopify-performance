import scripts from './checks/scripts.mjs';
import liquid from './checks/liquid.mjs';
import assets from './checks/assets.mjs';
import criticalPath from './checks/critical-path.mjs';
import caching from './checks/caching.mjs';
import settings from './checks/settings.mjs';
import storefrontJs from './checks/storefront-js.mjs';
import { BY_ID, SEVERITIES } from './catalogue.mjs';

export const CHECKS = [scripts, liquid, assets, criticalPath, caching, settings, storefrontJs];

export const KINDS = ['page', 'liquid', 'asset-js', 'asset-css', 'headers', 'config'];

const BY_EXTENSION = {
  html: 'page',
  htm: 'page',
  liquid: 'liquid',
  js: 'asset-js',
  mjs: 'asset-js',
  css: 'asset-css',
  headers: 'headers',
  json: 'config'
};

export function kindFor(path) {
  const name = String(path).split('/').pop() || '';
  const dot = name.lastIndexOf('.');
  if (dot === -1) return null;
  const ext = name.slice(dot + 1).toLowerCase();
  return BY_EXTENSION[ext] || null;
}

export function extensionsFor(kind) {
  return Object.keys(BY_EXTENSION).filter((ext) => BY_EXTENSION[ext] === kind);
}

export const SEVERITY_RANK = { error: 3, warn: 2, notice: 1 };

export function auditOne(input) {
  if (!KINDS.includes(input.kind)) throw new Error('unknown input kind: ' + input.kind);
  const out = [];
  for (const check of CHECKS) {
    if (!check.kinds.includes(input.kind)) continue;
    for (const finding of check.run(input)) {
      const entry = BY_ID.get(finding.id);
      if (!entry) throw new Error(check.area + ' raised an id with no catalogue entry: ' + finding.id);
      if (!SEVERITIES.includes(finding.severity)) {
        throw new Error(finding.id + ' was raised at an unknown severity: ' + finding.severity);
      }
      out.push({
        id: finding.id,
        area: entry.area,
        severity: finding.severity,
        title: entry.title,
        path: input.path,
        line: Number.isFinite(finding.line) ? finding.line : 1,
        detail: finding.detail === undefined ? '' : String(finding.detail)
      });
    }
  }
  return out;
}

export function sortFindings(findings) {
  return findings.slice().sort((a, b) => {
    if (a.path !== b.path) return a.path < b.path ? -1 : 1;
    if (a.line !== b.line) return a.line - b.line;
    if (a.id !== b.id) return a.id < b.id ? -1 : 1;
    if (a.severity !== b.severity) return SEVERITY_RANK[b.severity] - SEVERITY_RANK[a.severity];
    return a.detail < b.detail ? -1 : a.detail > b.detail ? 1 : 0;
  });
}

export function summarise(findings) {
  const counts = { error: 0, warn: 0, notice: 0 };
  for (const f of findings) counts[f.severity] += 1;
  return counts;
}

export function audit(inputs) {
  const findings = [];
  for (const input of inputs) findings.push(...auditOne(input));
  const sorted = sortFindings(findings);
  return { findings: sorted, counts: summarise(sorted), inputs: inputs.length };
}

// The exact set of id@severity tokens a set of inputs produces. Every example
// in the corpus declares this set, and the suite compares it in both
// directions, so a finding the example does not expect fails as loudly as one
// it expects and does not get.
export function tokens(findings) {
  return [...new Set(findings.map((f) => f.id + '@' + f.severity))].sort();
}
