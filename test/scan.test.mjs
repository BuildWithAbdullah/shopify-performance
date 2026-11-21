import { test } from 'node:test';
import assert from 'node:assert/strict';
import { scanHtml, byTag, inHead, collapse, rawTextTags, notTextTags } from '../src/scan/html.mjs';
import { scanLiquid, loops, insideLoop, splitFilters, blockTags } from '../src/scan/liquid.mjs';
import {
  scanJs, maskSource, argsRegion, splitArgs, callbackBody, callbackRange,
  bodyAfter, bodyRangeAfter, namedFunctionRange
} from '../src/scan/js.mjs';
import { scanCss, declarations, fontFaces } from '../src/scan/css.mjs';
import {
  scanHeaders, allValues, firstValue, cacheControl, maxAge, normalise, sameValue,
  isTextual, isDocument, isFingerprinted, lineOf
} from '../src/scan/headers.mjs';
import { readConfig, scriptTags, themeSettings, assetManifest, KINDS } from '../src/scan/config.mjs';
import { hostOf, isOwnAsset, isPlatformHost, isAllowedExampleHost } from '../src/hosts.mjs';

test('the html scanner reads a tag name and its attributes', () => {
  const scan = scanHtml('<img src="/a.jpg" alt="A" width="10">');
  assert.equal(scan.elements.length, 1);
  assert.equal(scan.elements[0].tag, 'img');
  assert.equal(scan.elements[0].attrs.src, '/a.jpg');
  assert.equal(scan.elements[0].attrs.width, '10');
});

test('an attribute name is lower cased and its value is not', () => {
  const scan = scanHtml('<img SRC="/A.jpg">');
  assert.equal(scan.elements[0].attrs.src, '/A.jpg');
});

test('a valueless attribute is present and empty', () => {
  const scan = scanHtml('<script src="/a.js" defer></script>');
  assert.ok('defer' in scan.elements[0].attrs);
  assert.equal(scan.elements[0].attrs.defer, '');
});

test('an unquoted attribute value ends at whitespace', () => {
  const scan = scanHtml('<img src=/a.jpg alt=A>');
  assert.equal(scan.elements[0].attrs.src, '/a.jpg');
  assert.equal(scan.elements[0].attrs.alt, 'A');
});

test('a quoted attribute value may hold an angle bracket', () => {
  const scan = scanHtml('<img alt="Save>20%" width="10" height="10">');
  assert.equal(scan.elements[0].attrs.alt, 'Save>20%');
  assert.equal(scan.elements[0].attrs.width, '10');
});

test('an unquoted value holding an angle bracket ends the tag, which is the declared limit', () => {
  const scan = scanHtml('<img alt=Save>20% width=10>');
  assert.equal(scan.elements[0].attrs.alt, 'Save');
  assert.ok(!('width' in scan.elements[0].attrs));
});

test('the contents of a script are not read as markup', () => {
  const scan = scanHtml('<script>var a = "<img src=x>";</script><p>after</p>');
  const tags = scan.elements.map((e) => e.tag);
  assert.deepStrictEqual(tags, ['script', 'p']);
});

test('the contents of a script are not text', () => {
  const scan = scanHtml('<script>var a = 1;</script>');
  assert.equal(scan.elements[0].text, '');
  assert.equal(scan.elements[0].inner, 'var a = 1;');
});

test('the contents of a title are raw and are still text', () => {
  const scan = scanHtml('<title>Ceramic kettle</title>');
  assert.equal(scan.elements[0].text, 'Ceramic kettle');
});

test('an element keeps its own text when a child tag sits inside it', () => {
  const scan = scanHtml('<button><span class="icon" title="Add"></span>Add to cart</button>');
  const button = scan.elements.find((e) => e.tag === 'button');
  assert.equal(button.text, 'Add to cart');
});

test('text is not counted twice when a child carries a title', () => {
  const scan = scanHtml('<button><span title="Add">Add</span></button>');
  const button = scan.elements.find((e) => e.tag === 'button');
  assert.equal(button.text, 'Add');
});

test('the raw text list and the not text list are different lists', () => {
  const raw = rawTextTags();
  const notText = notTextTags();
  assert.ok(raw.has('title'));
  assert.ok(!notText.has('title'));
  assert.ok(raw.has('script'));
  assert.ok(notText.has('script'));
});

test('a comment is collected and is not an element', () => {
  const scan = scanHtml('<!-- a note --><p>x</p>');
  assert.equal(scan.comments.length, 1);
  assert.equal(scan.comments[0].text.trim(), 'a note');
  assert.equal(scan.elements.length, 1);
});

test('a tag inside a comment is not an element', () => {
  const scan = scanHtml('<!-- <img src=x> --><p>x</p>');
  assert.deepStrictEqual(scan.elements.map((e) => e.tag), ['p']);
});

test('line numbers count from one', () => {
  const scan = scanHtml('<p>a</p>\n<p>b</p>');
  assert.equal(scan.elements[0].line, 1);
  assert.equal(scan.elements[1].line, 2);
});

test('a void element needs no closing tag', () => {
  const scan = scanHtml('<meta charset="utf-8"><p>x</p>');
  assert.equal(scan.elements[0].closed, true);
});

test('byTag selects every element of the named tags', () => {
  const scan = scanHtml('<link rel="x"><script src="y"></script><link rel="z">');
  assert.equal(byTag(scan, 'link').length, 2);
  assert.equal(byTag(scan, 'link', 'script').length, 3);
});

test('inHead is true for an element between the head tags', () => {
  const scan = scanHtml('<head><link rel="stylesheet" href="/a.css"></head><body><p>x</p></body>');
  const link = scan.elements.find((e) => e.tag === 'link');
  assert.equal(inHead(scan, link), true);
});

test('inHead is false for an element in the body', () => {
  const scan = scanHtml('<head><title>t</title></head><body><script src="/a.js"></script></body>');
  const script = scan.elements.find((e) => e.tag === 'script');
  assert.equal(inHead(scan, script), false);
});

test('collapse squeezes whitespace and trims', () => {
  assert.equal(collapse('  a \n  b  '), 'a b');
});

test('the liquid scanner reads a tag name and its arguments', () => {
  const scan = scanLiquid('{% for product in collection.products limit: 4 %}{% endfor %}');
  assert.equal(scan.tags[0].name, 'for');
  assert.equal(scan.tags[0].args, 'product in collection.products limit: 4');
});

test('a block tag is paired with its end tag and carries its body', () => {
  const scan = scanLiquid('{% for x in y %}INSIDE{% endfor %}');
  assert.equal(scan.tags[0].inner, 'INSIDE');
});

test('an output expression is split into a subject and filters', () => {
  const scan = scanLiquid("{{ product.title | upcase | truncate: 10 }}");
  assert.equal(scan.outputs[0].subject, 'product.title');
  assert.deepStrictEqual(scan.outputs[0].filters, ['upcase', 'truncate: 10']);
});

test('a pipe inside a quoted filter argument does not split the filters', () => {
  const { filters } = splitFilters("x | replace: '|', '-'");
  assert.deepStrictEqual(filters, ["replace: '|', '-'"]);
});

test('an output inside a loop knows its ancestors', () => {
  const scan = scanLiquid('{% for x in y %}{{ x.title }}{% endfor %}');
  assert.deepStrictEqual(scan.outputs[0].ancestors, ['for']);
  assert.equal(insideLoop(scan.outputs[0]), true);
});

test('an output outside a loop has no loop ancestor', () => {
  const scan = scanLiquid('{{ product.title }}');
  assert.equal(insideLoop(scan.outputs[0]), false);
});

test('the contents of a comment block are skipped', () => {
  const scan = scanLiquid('{% comment %}{% for x in y %}{% endfor %}{% endcomment %}{{ a }}');
  const names = scan.tags.map((t) => t.name);
  assert.deepStrictEqual(names, ['comment']);
  assert.equal(scan.outputs.length, 1);
});

test('the contents of a raw block are skipped', () => {
  const scan = scanLiquid('{% raw %}{{ not_an_output }}{% endraw %}{{ real }}');
  assert.equal(scan.outputs.length, 1);
  assert.equal(scan.outputs[0].subject, 'real');
});

test('the contents of a schema block are skipped', () => {
  const scan = scanLiquid('{% schema %}{ "name": "x" }{% endschema %}{{ a }}');
  assert.equal(scan.outputs.length, 1);
});

test('loops returns for and tablerow tags', () => {
  const scan = scanLiquid('{% for a in b %}{% endfor %}{% tablerow c in d %}{% endtablerow %}');
  assert.equal(loops(scan).length, 2);
});

test('whitespace control markers are stripped from a tag body', () => {
  const scan = scanLiquid('{%- assign a = 1 -%}');
  assert.equal(scan.tags[0].name, 'assign');
  assert.equal(scan.tags[0].args, 'a = 1');
});

test('the block tag list holds the tags that need an end tag', () => {
  const blocks = blockTags();
  assert.ok(blocks.has('for'));
  assert.ok(blocks.has('paginate'));
  assert.ok(!blocks.has('assign'));
});

test('the mask replaces a string body and keeps every offset', () => {
  const source = 'const a = "hello";';
  const masked = maskSource(source);
  assert.equal(masked.length, source.length);
  assert.ok(!masked.includes('hello'));
  assert.ok(masked.startsWith('const a = '));
});

test('the mask keeps newlines so line numbers survive', () => {
  const masked = maskSource('const a = `one\ntwo`;');
  assert.equal(masked.split('\n').length, 2);
});

test('the mask removes a line comment', () => {
  const masked = maskSource('// fetch(x)\nconst a = 1;');
  assert.ok(!masked.includes('fetch'));
});

test('the mask removes a block comment', () => {
  const masked = maskSource('/* fetch(x) */ const a = 1;');
  assert.ok(!masked.includes('fetch'));
});

test('the mask removes a regular expression body', () => {
  const masked = maskSource('const re = /fetch\\(/;');
  assert.ok(!masked.includes('fetch'));
});

test('a division is not read as a regular expression', () => {
  const masked = maskSource('const a = b / c; const d = 2;');
  assert.ok(masked.includes('const d = 2;'));
});

test('a call written inside a string is not a call', () => {
  const js = scanJs('const fake = "fetch(1)"; fetch(2);');
  assert.equal(js.calls('fetch').length, 1);
});

test('a member call is marked as one', () => {
  const js = scanJs('a.write(1); write(2);');
  const calls = js.calls('write');
  assert.equal(calls.length, 2);
  assert.equal(calls[0].member, true);
  assert.equal(calls[1].member, false);
});

test('a call whose name is a suffix of another name is not matched', () => {
  const js = scanJs('prefetch(1);');
  assert.equal(js.calls('fetch').length, 0);
});

test('argsRegion finds the parentheses of a call', () => {
  const js = scanJs('f(1, 2);');
  const region = argsRegion(js.masked, 0);
  assert.equal(js.source.slice(region.start, region.end), '1, 2');
});

test('argsRegion is not closed early by a parenthesis in a string', () => {
  const js = scanJs('f(")", 2);');
  const region = argsRegion(js.masked, 0);
  assert.equal(splitArgs(js.masked, region).length, 2);
});

test('splitArgs does not split inside a nested call', () => {
  const js = scanJs('f(g(1, 2), 3);');
  const args = splitArgs(js.masked, argsRegion(js.masked, 0));
  assert.equal(args.length, 2);
});

test('callbackBody returns the body of an inline function', () => {
  const js = scanJs('f(function () { inside(); });');
  const args = splitArgs(js.masked, argsRegion(js.masked, 0));
  assert.ok(callbackBody(js.masked, args[0]).includes('inside('));
});

test('callbackRange returns a range that reads the same in both copies', () => {
  const js = scanJs('f(() => { go("/cart.js"); });');
  const args = splitArgs(js.masked, argsRegion(js.masked, 0));
  const range = callbackRange(js.masked, args[0]);
  assert.ok(js.source.slice(range.start, range.end).includes('/cart.js'));
  assert.ok(!js.masked.slice(range.start, range.end).includes('/cart.js'));
});

test('bodyRangeAfter returns null when the braces do not balance', () => {
  assert.equal(bodyRangeAfter('function x() { ', 0), null);
  assert.equal(bodyAfter('function x() { ', 0), '');
});

test('namedFunctionRange finds a function declaration', () => {
  const js = scanJs('function go() { inside(); }');
  const range = namedFunctionRange(js.masked, 'go');
  assert.ok(js.masked.slice(range.start, range.end).includes('inside('));
});

test('namedFunctionRange finds a variable holding a function', () => {
  const js = scanJs('const go = () => { inside(); };');
  const range = namedFunctionRange(js.masked, 'go');
  assert.ok(js.masked.slice(range.start, range.end).includes('inside('));
});

test('namedFunctionRange refuses a name that is not an identifier', () => {
  const js = scanJs('const go = 1;');
  assert.equal(namedFunctionRange(js.masked, 'wrap(go)'), null);
});

test('js.find reports a line number for each match', () => {
  const js = scanJs('a;\nfor (;;) {}\n');
  const found = js.find(/for\s*\(/);
  assert.equal(found.length, 1);
  assert.equal(found[0].line, 2);
});

test('the css reader finds a declaration block and its selector', () => {
  const scan = scanCss('body { color: red; }');
  assert.equal(scan.rules[0].selector, 'body');
  assert.equal(declarations(scan.rules[0].body).color, 'red');
});

test('the css reader drops a comment before reading declarations', () => {
  const scan = scanCss('body { /* color: blue; */ color: red; }');
  const decls = declarations(scan.rules[0].body);
  assert.equal(decls.color, 'red');
});

test('the css reader finds an import rule', () => {
  const scan = scanCss('@import url("/a.css");\nbody { color: red; }');
  assert.equal(scan.imports.length, 1);
});

test('the css reader finds a font face and its descriptors', () => {
  const scan = scanCss('@font-face { font-family: "A"; src: url("/a.woff2") format("woff2"); font-display: swap; }');
  const faces = fontFaces(scan);
  assert.equal(faces.length, 1);
  assert.equal(faces[0].decls['font-display'], 'swap');
});

test('a nested at rule does not lose the rule after it', () => {
  const scan = scanCss('@media (min-width: 750px) { body { color: red; } }\np { color: blue; }');
  const selectors = scan.rules.map((r) => r.selector);
  assert.ok(selectors.indexOf('p') > -1);
});

test('the headers reader splits a capture into blocks', () => {
  const scan = scanHeaders('>>> GET /a.js\n200\ncache-control: no-store\n\n>>> GET /b.css\n200\n');
  assert.equal(scan.blocks.length, 2);
  assert.equal(scan.blocks[0].path, '/a.js');
  assert.equal(scan.blocks[0].method, 'GET');
  assert.equal(scan.blocks[0].status, 200);
});

test('a header name is lower cased and its value is kept as written', () => {
  const scan = scanHeaders('>>> GET /a.js\n200\nCache-Control: Public, Max-Age=60\n');
  assert.equal(firstValue(scan.blocks[0], 'cache-control'), 'Public, Max-Age=60');
});

test('a repeated header keeps every value', () => {
  const scan = scanHeaders('>>> GET /a.js\n200\nvary: Accept\nvary: Accept-Encoding\n');
  assert.deepStrictEqual(allValues(scan.blocks[0], 'vary'), ['Accept', 'Accept-Encoding']);
});

test('a comment line inside a block is ignored', () => {
  const scan = scanHeaders('>>> GET /a.js\n200\n# a note\ncache-control: no-store\n');
  assert.equal(firstValue(scan.blocks[0], 'cache-control'), 'no-store');
});

test('cache control directives are parsed with and without values', () => {
  const scan = scanHeaders('>>> GET /a.js\n200\ncache-control: public, max-age=60, immutable\n');
  const cc = cacheControl(scan.blocks[0]);
  assert.equal(cc.directives['max-age'], '60');
  assert.equal(cc.directives.immutable, true);
  assert.equal(maxAge(scan.blocks[0]), 60);
});

test('maxAge is null when there is no cache header', () => {
  const scan = scanHeaders('>>> GET /a.js\n200\ncontent-type: text/javascript\n');
  assert.equal(maxAge(scan.blocks[0]), null);
});

test('two values of one header are compared after lowercasing and collapsing', () => {
  assert.equal(sameValue('public, max-age=60', 'PUBLIC,  max-age=60'), true);
  assert.equal(normalise('a ,  b'), 'a,b');
});

test('two genuinely different values are not the same value', () => {
  assert.equal(sameValue('no-cache', 'public, max-age=60'), false);
});

test('a textual content type is recognised', () => {
  const scan = scanHeaders('>>> GET /a.js\n200\ncontent-type: text/javascript\n');
  assert.equal(isTextual(scan.blocks[0]), true);
});

test('an image content type is not textual and svg is', () => {
  const png = scanHeaders('>>> GET /a.png\n200\ncontent-type: image/png\n');
  const svg = scanHeaders('>>> GET /a.svg\n200\ncontent-type: image/svg+xml\n');
  assert.equal(isTextual(png.blocks[0]), false);
  assert.equal(isTextual(svg.blocks[0]), true);
});

test('a document is recognised by its content type', () => {
  const scan = scanHeaders('>>> GET /p\n200\ncontent-type: text/html; charset=utf-8\n');
  assert.equal(isDocument(scan.blocks[0]), true);
});

test('lineOf points at the header asked for and falls back to the block', () => {
  const scan = scanHeaders('>>> GET /a.js\n200\ncache-control: no-store\n');
  assert.equal(lineOf(scan.blocks[0], 'cache-control'), 3);
  assert.equal(lineOf(scan.blocks[0], 'vary'), 1);
});

test('a version query makes a path fingerprinted', () => {
  assert.equal(isFingerprinted('/assets/theme.css?v=123'), true);
});

test('a long hex segment makes a path fingerprinted', () => {
  assert.equal(isFingerprinted('/assets/theme.a1b2c3d4e5f6.css'), true);
});

test('a plain path is not fingerprinted', () => {
  assert.equal(isFingerprinted('/assets/theme.css'), false);
});

test('a config file without a kind field is a usage error', () => {
  const read = readConfig('{"a":1}', 'x.json');
  assert.equal(read.ok, false);
  assert.match(read.error, /no shopify_perf_input/);
});

test('a config file naming an unknown kind is a usage error', () => {
  const read = readConfig('{"shopify_perf_input":"nope"}', 'x.json');
  assert.equal(read.ok, false);
  assert.match(read.error, /unknown kind/);
});

test('invalid json is a usage error naming the file', () => {
  const read = readConfig('{', 'broken.json');
  assert.equal(read.ok, false);
  assert.match(read.error, /broken.json/);
});

test('a json array is not an accepted config shape', () => {
  const read = readConfig('[]', 'x.json');
  assert.equal(read.ok, false);
});

test('every accepted kind is listed', () => {
  assert.deepStrictEqual(KINDS, ['script-tags', 'theme-settings', 'asset-manifest']);
});

test('a script tag entry defaults to installed and reads its scope', () => {
  const read = readConfig('{"shopify_perf_input":"script-tags","script_tags":[{"src":"//a.example.com/x.js","display_scope":"all"}]}', 'x.json');
  const tags = scriptTags(read.data);
  assert.equal(tags[0].appInstalled, true);
  assert.equal(tags[0].displayScope, 'all');
});

test('theme settings measures the compact serialisation', () => {
  const text = '{"shopify_perf_input":"theme-settings","current":{"a":true}}';
  const read = readConfig(text, 'x.json');
  assert.equal(themeSettings(read.data).bytes, JSON.stringify(read.data).length);
});

test('an asset manifest entry defaults to referenced', () => {
  const read = readConfig('{"shopify_perf_input":"asset-manifest","assets":[{"path":"a.js","bytes":1}]}', 'x.json');
  assert.equal(assetManifest(read.data)[0].referenced, true);
});

test('hostOf reads a host from an absolute and a protocol relative url', () => {
  assert.equal(hostOf('https://cdn.example.com/a.js'), 'cdn.example.com');
  assert.equal(hostOf('//cdn.example.com/a.js'), 'cdn.example.com');
});

test('hostOf returns nothing for a relative url', () => {
  assert.equal(hostOf('/assets/theme.js'), '');
});

test('hostOf drops a port and a user part', () => {
  assert.equal(hostOf('https://user@cdn.example.com:8443/a.js'), 'cdn.example.com');
});

test('a relative asset and the platform asset host are own assets', () => {
  assert.equal(isOwnAsset('/assets/theme.js'), true);
  assert.equal(isOwnAsset('https://cdn.shopify.com/s/files/a.js'), true);
  assert.equal(isOwnAsset('https://widget.example.net/a.js'), false);
});

test('the platform host list is the only list of real hosts', () => {
  assert.equal(isPlatformHost('cdn.shopify.com'), true);
  assert.equal(isPlatformHost('widget.example.net'), false);
});

test('an allowed example host is a documentation domain, a test name or a platform host', () => {
  assert.equal(isAllowedExampleHost('widget.example.net'), true);
  assert.equal(isAllowedExampleHost('shop.example.test'), true);
  assert.equal(isAllowedExampleHost('cdn.shopify.com'), true);
  assert.equal(isAllowedExampleHost('a-real-store.myshopify.com'), false);
});
