import { readConfig, themeSettings, assetManifest } from '../scan/config.mjs';
import { THRESHOLDS } from '../thresholds.mjs';
import { extensionOf } from './assets.mjs';

function baseName(path) {
  const slash = String(path).lastIndexOf('/');
  return slash === -1 ? String(path) : String(path).slice(slash + 1);
}

function settings(data, out) {
  const read = themeSettings(data);
  const present = new Set(read.sections);
  for (const [key, value] of Object.entries(read.current)) {
    if (value !== true) continue;
    const needs = read.requires[key];
    if (typeof needs !== 'string' || !needs) continue;
    if (present.has(needs)) continue;
    const library = read.libraries[key];
    if (typeof library === 'string' && library) {
      out.push({
        id: 'setting-loads-unused-library',
        severity: 'error',
        line: 1,
        detail: key + ' loads ' + library + ' for the absent section ' + needs
      });
    } else {
      out.push({
        id: 'setting-enabled-for-absent-section',
        severity: 'warn',
        line: 1,
        detail: key + ' is on and the section ' + needs + ' is not rendered'
      });
    }
  }
  if (read.bytes > THRESHOLDS.settingsDataBytes) {
    out.push({
      id: 'settings-data-oversized',
      severity: 'notice',
      line: 1,
      detail: read.bytes + ' bytes, budget ' + THRESHOLDS.settingsDataBytes
    });
  }
}

function manifest(data, out) {
  const assets = assetManifest(data);
  let scriptTotal = 0;
  const referencedNames = new Set(assets.filter((a) => a.referenced).map((a) => baseName(a.path)));
  for (const asset of assets) {
    if (!asset.referenced) {
      out.push({
        id: 'asset-unreferenced',
        severity: 'notice',
        line: 1,
        detail: asset.path + ' is referenced by nothing'
      });
    }
    if (extensionOf(asset.path) === 'map') {
      out.push({
        id: 'asset-sourcemap-shipped',
        severity: 'warn',
        line: 1,
        detail: asset.path + ' publishes the unminified source'
      });
    }
    if (asset.referenced && extensionOf(asset.path) === 'js') {
      scriptTotal += asset.bytes;
      const name = baseName(asset.path);
      if (!name.includes('.min.')) {
        const twin = name.replace(/\.js$/, '.min.js');
        if (referencedNames.has(twin)) {
          out.push({
            id: 'asset-unminified-twin',
            severity: 'warn',
            line: 1,
            detail: name + ' and ' + twin + ' are both referenced'
          });
        }
      }
    }
  }
  if (scriptTotal > THRESHOLDS.scriptTotalBudget) {
    out.push({
      id: 'asset-manifest-total-over-budget',
      severity: 'error',
      line: 1,
      detail: scriptTotal + ' bytes of referenced script, budget ' + THRESHOLDS.scriptTotalBudget
    });
  }
}

export default {
  area: 'settings',
  kinds: ['config'],
  run(input) {
    const out = [];
    const read = readConfig(input.source, input.path);
    if (!read.ok) return out;
    if (read.kind === 'theme-settings') settings(read.data, out);
    else if (read.kind === 'asset-manifest') manifest(read.data, out);
    return out;
  }
};
