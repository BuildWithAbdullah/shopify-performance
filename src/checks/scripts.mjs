import { scanHtml, inHead, containedIn } from '../scan/html.mjs';
import { scanJs, argsRegion, splitArgs } from '../scan/js.mjs';
import { readConfig, scriptTags } from '../scan/config.mjs';
import { hostOf, isOwnAsset } from '../hosts.mjs';
import { THRESHOLDS, LIBRARY_FAMILIES } from '../thresholds.mjs';

function pathPart(url) {
  const text = String(url);
  const noScheme = text.replace(/^[a-z][a-z0-9+.-]*:/i, '').replace(/^\/\//, '');
  const slash = noScheme.indexOf('/');
  const withQuery = slash === -1 ? '' : noScheme.slice(slash);
  return withQuery.split('#')[0];
}

function familyOf(url) {
  const file = pathPart(url) || String(url);
  for (const { family, pattern } of LIBRARY_FAMILIES) {
    if (pattern.test(file)) return family;
  }
  return null;
}

function page(input, out) {
  const scan = scanHtml(input.source);
  // A script inside a template is never run, so it is not weight on the page.
  const scripts = scan.elements.filter(
    (el) => el.tag === 'script' && !containedIn(scan, el, ['template', 'noscript'])
  );
  const withSrc = scripts.filter((el) => el.attrs.src);

  for (const el of scripts) {
    if (!el.attrs.src) continue;
    if (!inHead(scan, el)) continue;
    if ('defer' in el.attrs || 'async' in el.attrs) continue;
    if ((el.attrs.type || '').toLowerCase() === 'module') continue;
    const own = isOwnAsset(el.attrs.src);
    out.push({
      id: 'script-blocking-in-head',
      severity: own ? 'warn' : 'error',
      line: el.line,
      detail: (own ? 'theme asset ' : 'third party ') + (hostOf(el.attrs.src) || 'relative URL')
    });
  }

  const seen = new Map();
  for (const el of withSrc) {
    const key = (hostOf(el.attrs.src) || '') + pathPart(el.attrs.src).split('?')[0];
    if (seen.has(key)) {
      out.push({
        id: 'script-duplicate-source',
        severity: 'warn',
        line: el.line,
        detail: 'also loaded on line ' + seen.get(key)
      });
    } else {
      seen.set(key, el.line);
    }
  }

  const families = new Map();
  for (const el of withSrc) {
    const family = familyOf(el.attrs.src);
    if (!family) continue;
    const key = (hostOf(el.attrs.src) || '') + pathPart(el.attrs.src);
    const already = families.get(family);
    if (already && already.key !== key) {
      out.push({
        id: 'script-library-duplicated',
        severity: 'error',
        line: el.line,
        detail: family + ' is already loaded on line ' + already.line
      });
    } else if (!already) {
      families.set(family, { key, line: el.line });
    }
  }

  for (const el of scripts) {
    if (el.attrs.src) continue;
    if (!inHead(scan, el)) continue;
    const type = (el.attrs.type || '').toLowerCase();
    if (type && type !== 'text/javascript' && type !== 'module' && type !== 'application/javascript') continue;
    const bytes = Buffer.byteLength(el.inner, 'utf8');
    if (bytes > THRESHOLDS.inlineScriptHeadBytes) {
      out.push({
        id: 'script-inline-large-in-head',
        severity: 'warn',
        line: el.line,
        detail: bytes + ' bytes inline, budget ' + THRESHOLDS.inlineScriptHeadBytes
      });
    }
  }

  const parked = scripts.filter((el) => {
    const type = (el.attrs.type || '').toLowerCase();
    return type === 'text/plain' || type === 'text/template' || 'data-src' in el.attrs;
  });
  if (parked.length) {
    const inline = scripts.filter((el) => !el.attrs.src).map((el) => el.inner).join('\n');
    const js = scanJs(inline);
    const activates = js.find(/setAttribute\s*\(|dataset\s*\.\s*src|getAttribute\s*\(|createElement\s*\(|\.type\s*=/).length > 0;
    if (!activates) {
      for (const el of parked) {
        out.push({
          id: 'script-parked-without-activation',
          severity: 'notice',
          line: el.line,
          detail: 'nothing in the document turns it into a running script'
        });
      }
    }
  }
}

function assetJs(input, out) {
  const js = scanJs(input.source);
  for (const call of js.calls('open')) {
    const region = argsRegion(js.masked, call.index + 'open'.length - 1);
    const args = splitArgs(js.masked, region);
    if (args.length < 3) continue;
    const third = js.source.slice(args[2].start, args[2].end).trim();
    if (third === 'false') {
      out.push({
        id: 'script-sync-xhr',
        severity: 'error',
        line: call.line,
        detail: 'the third argument of open is false'
      });
    }
  }
  for (const call of js.calls('write')) {
    if (!call.member) continue;
    const before = js.masked.slice(Math.max(0, call.index - 40), call.index);
    if (!/document\s*\.\s*$/.test(before)) continue;
    out.push({
      id: 'script-document-write',
      severity: 'error',
      line: call.line,
      detail: 'markup written into the parser'
    });
  }
}

function config(input, out) {
  const read = readConfig(input.source, input.path);
  if (!read.ok || read.kind !== 'script-tags') return;
  for (const tag of scriptTags(read.data)) {
    const scope = tag.displayScope.toLowerCase();
    const purpose = tag.purpose.toLowerCase();
    const narrow = purpose.includes('order status') || purpose.includes('order-status') || purpose.includes('checkout');
    if (narrow && (scope === 'all' || scope === 'online_store' || scope === '')) {
      out.push({
        id: 'script-tag-api-scope-too-wide',
        severity: 'warn',
        line: 1,
        detail: 'entry ' + tag.index + ' serves the order status page and runs everywhere'
      });
    }
    if (!tag.appInstalled) {
      out.push({
        id: 'script-tag-api-stale-app',
        severity: 'error',
        line: 1,
        detail: 'entry ' + tag.index + ' belongs to an app that is not installed'
      });
    }
  }
}

export default {
  area: 'scripts',
  kinds: ['page', 'asset-js', 'config'],
  run(input) {
    const out = [];
    if (input.kind === 'page') page(input, out);
    else if (input.kind === 'asset-js') assetJs(input, out);
    else if (input.kind === 'config') config(input, out);
    return out;
  }
};
