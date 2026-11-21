import { scanHtml, containedIn, ancestorOfTag, descendants } from '../scan/html.mjs';
import { scanCss, fontFaces } from '../scan/css.mjs';
import { readConfig, assetManifest } from '../scan/config.mjs';
import { THRESHOLDS, IMAGE_EXTENSIONS } from '../thresholds.mjs';

export function extensionOf(url) {
  const path = String(url).split('#')[0].split('?')[0];
  const dot = path.lastIndexOf('.');
  if (dot === -1) return '';
  return path.slice(dot + 1).toLowerCase();
}

function fontUrls(decls) {
  const src = decls.src || '';
  const found = [];
  const re = /url\(\s*(['"]?)([^'")]+)\1\s*\)/g;
  let m;
  while ((m = re.exec(src)) !== null) found.push(m[2].trim());
  return found;
}

function baseName(url) {
  const path = String(url).split('#')[0].split('?')[0];
  const slash = path.lastIndexOf('/');
  return slash === -1 ? path : path.slice(slash + 1);
}

// An image inside a picture element whose sources already offer widths or
// media conditions is not an image with one source for every screen.
function pictureCovers(scan, el) {
  const picture = ancestorOfTag(scan, el, 'picture');
  if (!picture) return false;
  return descendants(scan, picture).some(
    (child) => child.tag === 'source' && (/\d+w\b/.test(child.attrs.srcset || '') || child.attrs.media)
  );
}

function page(input, out) {
  const scan = scanHtml(input.source);
  // The contents of a template are never rendered and a noscript fallback is
  // not the image the first paint waits for, so neither is counted.
  const INERT = ['template', 'noscript'];
  const images = scan.elements.filter((el) => el.tag === 'img' && !containedIn(scan, el, INERT));

  images.forEach((el, position) => {
    const hasWidth = 'width' in el.attrs && el.attrs.width !== '';
    const hasHeight = 'height' in el.attrs && el.attrs.height !== '';
    const style = (el.attrs.style || '').toLowerCase();
    const sized = hasWidth && hasHeight;
    if (!sized && !style.includes('aspect-ratio')) {
      out.push({
        id: 'image-without-dimensions',
        severity: 'warn',
        line: el.line,
        detail: 'image ' + (position + 1) + ' has no intrinsic size'
      });
    }
    const loading = (el.attrs.loading || '').toLowerCase();
    if (position === 0 && loading === 'lazy') {
      out.push({
        id: 'image-hero-lazy',
        severity: 'error',
        line: el.line,
        detail: 'the first image in document order is lazy'
      });
    }
    if (position >= THRESHOLDS.foldImageIndex && loading !== 'lazy') {
      out.push({
        id: 'image-missing-lazy',
        severity: 'warn',
        line: el.line,
        detail: 'image ' + (position + 1) + ' is past the first screen and loads eagerly'
      });
    }
    if (el.attrs.src && !el.attrs.srcset && !el.attrs['data-srcset'] && !pictureCovers(scan, el)) {
      out.push({
        id: 'image-without-srcset',
        severity: 'notice',
        line: el.line,
        detail: 'image ' + (position + 1) + ' has one source for every screen'
      });
    }
  });

  // A face declared in a style block low down the document still applies to the
  // page, so every style block is read here. Only the critical path check cares
  // where the block sits, because only a block in the head blocks the paint.
  const styles = scan.elements.filter((el) => el.tag === 'style');
  const faces = [];
  for (const el of styles) {
    for (const face of fontFaces(scanCss(el.inner))) {
      faces.push({ line: el.line, urls: fontUrls(face.decls), decls: face.decls });
    }
  }
  const preloads = scan.elements.filter(
    (el) => el.tag === 'link' && (el.attrs.rel || '').toLowerCase().split(/\s+/).includes('preload')
  );
  const fontPreloads = preloads.filter((el) => (el.attrs.as || '').toLowerCase() === 'font');

  for (const face of faces) {
    if (!face.decls['font-display']) {
      out.push({
        id: 'font-face-without-display',
        severity: 'warn',
        line: face.line,
        detail: 'no font-display descriptor'
      });
    }
    if (face.urls.length && !face.urls.some((u) => extensionOf(u) === 'woff2')) {
      out.push({
        id: 'font-face-without-woff2',
        severity: 'notice',
        line: face.line,
        detail: 'formats offered: ' + face.urls.map((u) => extensionOf(u) || 'unknown').join(', ')
      });
    }
    for (const url of face.urls) {
      const name = baseName(url);
      const preloaded = fontPreloads.some((el) => baseName(el.attrs.href || '') === name);
      if (!preloaded && extensionOf(url) === 'woff2') {
        out.push({
          id: 'font-not-preloaded',
          severity: 'notice',
          line: face.line,
          detail: name + ' is discovered only after the style block is parsed'
        });
      }
    }
  }

  const faceNames = new Set();
  for (const face of faces) for (const url of face.urls) faceNames.add(baseName(url));
  for (const el of fontPreloads) {
    const name = baseName(el.attrs.href || '');
    if (!name) continue;
    if (!faceNames.has(name)) {
      out.push({
        id: 'font-preload-unused',
        severity: 'warn',
        line: el.line,
        detail: name + ' is preloaded and named by no font face'
      });
    }
  }
}

function assetCss(input, out) {
  const scan = scanCss(input.source);
  for (const face of fontFaces(scan)) {
    if (!face.decls['font-display']) {
      out.push({
        id: 'font-face-without-display',
        severity: 'warn',
        line: face.line,
        detail: 'no font-display descriptor'
      });
    }
    const urls = fontUrls(face.decls);
    if (urls.length && !urls.some((u) => extensionOf(u) === 'woff2')) {
      out.push({
        id: 'font-face-without-woff2',
        severity: 'notice',
        line: face.line,
        detail: 'formats offered: ' + urls.map((u) => extensionOf(u) || 'unknown').join(', ')
      });
    }
  }
}

function config(input, out) {
  const read = readConfig(input.source, input.path);
  if (!read.ok || read.kind !== 'asset-manifest') return;
  for (const asset of assetManifest(read.data)) {
    if (!IMAGE_EXTENSIONS.includes(extensionOf(asset.path))) continue;
    if (asset.bytes > THRESHOLDS.assetImageBytes) {
      out.push({
        id: 'asset-oversized-image',
        severity: 'warn',
        line: 1,
        detail: asset.path + ' is ' + asset.bytes + ' bytes, budget ' + THRESHOLDS.assetImageBytes
      });
    }
  }
}

export default {
  area: 'assets',
  kinds: ['page', 'asset-css', 'config'],
  run(input) {
    const out = [];
    if (input.kind === 'page') page(input, out);
    else if (input.kind === 'asset-css') assetCss(input, out);
    else if (input.kind === 'config') config(input, out);
    return out;
  }
};
