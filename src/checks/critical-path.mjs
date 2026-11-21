import { scanHtml, inHead, containedIn } from '../scan/html.mjs';
import { scanCss } from '../scan/css.mjs';
import { hostOf, isOwnAsset } from '../hosts.mjs';
import { THRESHOLDS, PRELOAD_AS_EXTENSIONS } from '../thresholds.mjs';
import { extensionOf } from './assets.mjs';

function rels(el) {
  return (el.attrs.rel || '').toLowerCase().split(/\s+/).filter(Boolean);
}

function normaliseUrl(url) {
  return String(url).split('#')[0].trim();
}

function page(input, out) {
  const scan = scanHtml(input.source);
  const links = scan.elements.filter((el) => el.tag === 'link');

  const styleBlocks = scan.elements.filter((el) => el.tag === 'style' && inHead(scan, el));
  for (const el of styleBlocks) {
    const bytes = Buffer.byteLength(el.inner, 'utf8');
    if (bytes > THRESHOLDS.inlineStyleHeadBytes) {
      out.push({
        id: 'inline-critical-css-oversized',
        severity: 'warn',
        line: el.line,
        detail: bytes + ' bytes inline, budget ' + THRESHOLDS.inlineStyleHeadBytes
      });
    }
  }

  for (const el of links) {
    if (!rels(el).includes('preload')) continue;
    const as = (el.attrs.as || '').toLowerCase();
    if (!as) {
      out.push({
        id: 'preload-missing-as',
        severity: 'error',
        line: el.line,
        detail: 'preload without an as attribute'
      });
      continue;
    }
    const ext = extensionOf(el.attrs.href || '');
    const allowed = PRELOAD_AS_EXTENSIONS[as];
    if (allowed && ext && !allowed.includes(ext)) {
      out.push({
        id: 'preload-as-mismatch',
        severity: 'error',
        line: el.line,
        detail: 'as=' + as + ' for a .' + ext + ' file'
      });
    }
  }

  const hints = new Set();
  let preconnectCount = 0;
  for (const el of links) {
    const r = rels(el);
    if (r.includes('preconnect')) preconnectCount += 1;
    if (r.includes('preconnect') || r.includes('dns-prefetch')) {
      const host = hostOf(el.attrs.href || '');
      if (host) hints.add(host);
    }
  }
  if (preconnectCount > THRESHOLDS.preconnectMax) {
    const last = links.filter((el) => rels(el).includes('preconnect')).pop();
    out.push({
      id: 'preconnect-excessive',
      severity: 'warn',
      line: last ? last.line : 1,
      detail: preconnectCount + ' connection hints, budget ' + THRESHOLDS.preconnectMax
    });
  }

  const scriptHosts = new Map();
  for (const el of scan.elements) {
    if (el.tag !== 'script' || !el.attrs.src) continue;
    if (containedIn(scan, el, ['template', 'noscript'])) continue;
    if (isOwnAsset(el.attrs.src)) continue;
    const host = hostOf(el.attrs.src);
    if (host && !scriptHosts.has(host)) scriptHosts.set(host, el.line);
  }
  for (const [host, line] of scriptHosts) {
    if (!hints.has(host)) {
      out.push({
        id: 'preconnect-missing-for-script-host',
        severity: 'notice',
        line,
        detail: host + ' has no connection hint'
      });
    }
  }

  const blocking = links.filter((el) => {
    if (!rels(el).includes('stylesheet')) return false;
    if ('disabled' in el.attrs) return false;
    const media = (el.attrs.media || '').toLowerCase().trim();
    if (media === 'print') return false;
    if (!inHead(scan, el)) return false;
    return true;
  });
  if (blocking.length > THRESHOLDS.blockingStylesheetsMax) {
    out.push({
      id: 'stylesheet-count-in-head-excessive',
      severity: 'warn',
      line: blocking[blocking.length - 1].line,
      detail: blocking.length + ' blocking stylesheets, budget ' + THRESHOLDS.blockingStylesheetsMax
    });
  }

  const used = new Set();
  for (const el of scan.elements) {
    if (el.tag === 'script' && el.attrs.src) used.add(normaliseUrl(el.attrs.src));
    if (el.tag === 'img' && el.attrs.src) used.add(normaliseUrl(el.attrs.src));
    if (el.tag === 'link' && rels(el).includes('stylesheet') && el.attrs.href) used.add(normaliseUrl(el.attrs.href));
  }
  for (const el of links) {
    if (!rels(el).includes('prefetch')) continue;
    const href = normaliseUrl(el.attrs.href || '');
    if (href && used.has(href)) {
      out.push({
        id: 'prefetch-of-critical-resource',
        severity: 'warn',
        line: el.line,
        detail: 'the current page already uses this resource'
      });
    }
  }
}

function assetCss(input, out) {
  const scan = scanCss(input.source);
  for (const imp of scan.imports) {
    out.push({
      id: 'css-import-chained',
      severity: 'error',
      line: imp.line,
      detail: 'a second blocking round trip the parser cannot start early'
    });
  }
}

export default {
  area: 'critical-path',
  kinds: ['page', 'asset-css'],
  run(input) {
    const out = [];
    if (input.kind === 'page') page(input, out);
    else if (input.kind === 'asset-css') assetCss(input, out);
    return out;
  }
};
