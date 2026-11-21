// Readers for the two inputs that are configuration rather than code.
//
// A theme audit that reads only Liquid and markup cannot see an app script
// injected through the script tag API, and cannot see a theme setting that is
// switched on for a section no template renders. Both are declared here with
// an explicit kind field so a malformed file is a usage error rather than a
// silently empty audit.

export const KINDS = ['script-tags', 'theme-settings', 'asset-manifest'];

export function readConfig(source, label = 'input') {
  let parsed;
  try {
    parsed = JSON.parse(String(source));
  } catch (err) {
    return { ok: false, error: label + ' is not valid JSON: ' + err.message };
  }
  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return { ok: false, error: label + ' must be a JSON object' };
  }
  const kind = parsed.shopify_perf_input;
  if (typeof kind !== 'string') {
    return { ok: false, error: label + ' has no shopify_perf_input field naming its kind' };
  }
  if (!KINDS.includes(kind)) {
    return { ok: false, error: label + ' names an unknown kind: ' + kind };
  }
  return { ok: true, kind, data: parsed };
}

export function scriptTags(data) {
  const list = Array.isArray(data.script_tags) ? data.script_tags : [];
  return list.map((entry, i) => ({
    index: i,
    src: typeof entry.src === 'string' ? entry.src : '',
    event: typeof entry.event === 'string' ? entry.event : '',
    displayScope: typeof entry.display_scope === 'string' ? entry.display_scope : '',
    purpose: typeof entry.purpose === 'string' ? entry.purpose : '',
    appInstalled: entry.app_installed !== false,
    cache: entry.cache === true
  }));
}

export function themeSettings(data) {
  const current = data.current && typeof data.current === 'object' ? data.current : {};
  const sections = Array.isArray(data.sections_present) ? data.sections_present.filter((s) => typeof s === 'string') : [];
  const requires = data.setting_requires_section && typeof data.setting_requires_section === 'object'
    ? data.setting_requires_section
    : {};
  const libraries = data.setting_loads_library && typeof data.setting_loads_library === 'object'
    ? data.setting_loads_library
    : {};
  return { current, sections, requires, libraries, bytes: JSON.stringify(data).length };
}

export function assetManifest(data) {
  const list = Array.isArray(data.assets) ? data.assets : [];
  return list.map((entry, i) => ({
    index: i,
    path: typeof entry.path === 'string' ? entry.path : '',
    bytes: Number.isFinite(entry.bytes) ? entry.bytes : 0,
    referenced: entry.referenced !== false
  }));
}
