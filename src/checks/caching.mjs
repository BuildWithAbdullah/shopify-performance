import {
  scanHeaders, allValues, firstValue, lineOf, cacheControl, maxAge,
  isTextual, isDocument, isFingerprinted, normalise
} from '../scan/headers.mjs';
import { THRESHOLDS } from '../thresholds.mjs';

function expiresConflict(block) {
  const expires = firstValue(block, 'expires');
  const age = maxAge(block);
  if (expires === null || age === null) return null;
  const trimmed = expires.trim();
  if (trimmed === '0' || /^-?\d+$/.test(trimmed)) {
    return age > 0 ? 'expires is ' + trimmed + ' while max-age is ' + age : null;
  }
  const when = Date.parse(trimmed);
  if (Number.isNaN(when)) return null;
  const dateHeader = firstValue(block, 'date');
  const now = dateHeader ? Date.parse(dateHeader) : NaN;
  if (Number.isNaN(now)) return null;
  const impliedAge = Math.round((when - now) / 1000);
  if (age > 0 && impliedAge <= 0) return 'expires is not in the future while max-age is ' + age;
  if (age === 0 && impliedAge > 0) return 'max-age is zero while expires is in the future';
  return null;
}

export default {
  area: 'caching',
  kinds: ['headers'],
  run(input) {
    const out = [];
    const scan = scanHeaders(input.source);
    for (const block of scan.blocks) {
      // Only a 200 is judged. A 304 carries no body, so it cannot be
      // uncompressed, and a redirect's cache lifetime is a different question
      // from an asset's. The limit that follows is declared in tools/limits.mjs.
      if (block.status !== 200) continue;
      const document = isDocument(block);
      const age = maxAge(block);
      const cc = cacheControl(block);
      const fingerprinted = isFingerprinted(block.path);

      if (!document && fingerprinted && age !== null && age < THRESHOLDS.assetLongCacheSeconds) {
        out.push({
          id: 'asset-short-cache',
          severity: 'warn',
          line: lineOf(block, 'cache-control'),
          detail: block.path + ' max-age ' + age + ', floor ' + THRESHOLDS.assetLongCacheSeconds
        });
      }
      if (!document && age !== null && age >= THRESHOLDS.assetLongCacheSeconds && !cc.directives.immutable) {
        out.push({
          id: 'asset-cache-not-immutable',
          severity: 'notice',
          line: lineOf(block, 'cache-control'),
          detail: block.path + ' is cached for ' + age + ' seconds without immutable'
        });
      }
      if (!document && !fingerprinted && age !== null && age >= THRESHOLDS.unfingerprintedCacheCeiling) {
        out.push({
          id: 'unfingerprinted-asset-long-cache',
          severity: 'error',
          line: lineOf(block, 'cache-control'),
          detail: block.path + ' has a stable URL and max-age ' + age
        });
      }
      if (document && age !== null && age > THRESHOLDS.documentMaxAgeCeiling) {
        out.push({
          id: 'document-cached-too-long',
          severity: 'error',
          line: lineOf(block, 'cache-control'),
          detail: block.path + ' max-age ' + age + ', ceiling ' + THRESHOLDS.documentMaxAgeCeiling
        });
      }

      const encoding = firstValue(block, 'content-encoding');
      if (isTextual(block) && !encoding) {
        out.push({
          id: 'text-asset-not-compressed',
          severity: 'error',
          line: lineOf(block, 'content-type'),
          detail: block.path + ' is textual and has no content-encoding'
        });
      }
      if (encoding) {
        const vary = allValues(block, 'vary').join(',').toLowerCase();
        if (!vary.includes('accept-encoding')) {
          out.push({
            id: 'compressed-without-vary',
            severity: 'warn',
            line: lineOf(block, 'content-encoding'),
            detail: block.path + ' is compressed and does not vary on the encoding'
          });
        }
      }
      if (!document && allValues(block, 'set-cookie').length) {
        out.push({
          id: 'set-cookie-on-asset',
          severity: 'warn',
          line: lineOf(block, 'set-cookie'),
          detail: block.path + ' sets a cookie on a static response'
        });
      }

      const ccValues = allValues(block, 'cache-control');
      if (ccValues.length > 1) {
        const distinct = new Set(ccValues.map((v) => normalise(v)));
        if (distinct.size > 1) {
          out.push({
            id: 'cache-headers-conflict',
            severity: 'error',
            line: lineOf(block, 'cache-control'),
            detail: block.path + ' carries ' + distinct.size + ' different cache-control values'
          });
        }
      }
      const clash = expiresConflict(block);
      if (clash) {
        out.push({
          id: 'cache-headers-conflict',
          severity: 'error',
          line: lineOf(block, 'expires'),
          detail: block.path + ': ' + clash
        });
      }
    }
    return out;
  }
};
