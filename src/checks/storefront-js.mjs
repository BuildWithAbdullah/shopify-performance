import {
  scanJs, argsRegion, splitArgs, callbackRange, namedFunctionRange, bodyRangeAfter
} from '../scan/js.mjs';

const PASSIVE_EVENTS = ['scroll', 'touchstart', 'touchmove', 'wheel', 'mousewheel'];
const KEYSTROKE_EVENTS = ['input', 'keyup', 'keydown', 'keypress'];
const THROTTLES = /\b(setTimeout|requestAnimationFrame|throttle|debounce|requestIdleCallback)\s*\(/;
const LAYOUT_READS = /\.\s*(offsetHeight|offsetTop|offsetWidth|offsetLeft|clientHeight|clientWidth|scrollHeight|scrollTop|getBoundingClientRect)\b/;
const STYLE_WRITES = /\.\s*style\s*\.\s*[A-Za-z-]+\s*=|\.\s*style\s*\.\s*setProperty\s*\(|\.\s*classList\s*\.\s*(add|remove|toggle)\s*\(/;
const REQUESTS = /\bfetch\s*\(|\bXMLHttpRequest\b|\.\s*ajax\s*\(/;
const CART_PATHS = /\/cart(\.js|\.json|\/)?/;
const DOM_QUERIES = ['querySelector', 'querySelectorAll', 'getElementById', 'getElementsByClassName'];

// A handler given to a call: either written inline, or named and defined
// elsewhere in the same file. Both are returned as a region, so a check can
// read the masked text for calls and the original text for URLs.
function handlerRegion(js, arg) {
  if (!arg) return null;
  const inline = callbackRange(js.masked, arg);
  const text = js.masked.slice(arg.start, arg.end);
  if (/[{=]/.test(text)) return inline;
  const name = js.source.slice(arg.start, arg.end).trim();
  return namedFunctionRange(js.masked, name) || inline;
}

function regionText(js, region) {
  if (!region) return { masked: '', source: '' };
  return {
    masked: js.masked.slice(region.start, region.end),
    source: js.source.slice(region.start, region.end)
  };
}

function listeners(js) {
  const out = [];
  for (const call of js.calls('addEventListener')) {
    const region = argsRegion(js.masked, call.index);
    if (!region) continue;
    const args = splitArgs(js.masked, region);
    if (!args.length) continue;
    const rawEvent = js.source.slice(args[0].start, args[0].end).trim();
    const quoted = /^['"`]/.test(rawEvent);
    const body = handlerRegion(js, args[1]);
    out.push({
      event: quoted ? rawEvent.replace(/^['"`]|['"`]$/g, '').toLowerCase() : '',
      line: call.line,
      options: args.length > 2 ? js.source.slice(args[2].start, args[2].end) : '',
      text: regionText(js, body)
    });
  }
  return out;
}

export default {
  area: 'storefront-js',
  kinds: ['asset-js'],
  run(input) {
    const out = [];
    const js = scanJs(input.source);
    const intervals = js.calls('setInterval');

    for (const call of intervals) {
      const region = argsRegion(js.masked, call.index);
      const args = splitArgs(js.masked, region);
      const body = regionText(js, handlerRegion(js, args[0]));
      if (REQUESTS.test(body.masked) && CART_PATHS.test(body.source)) {
        out.push({
          id: 'cart-endpoint-polled',
          severity: 'error',
          line: call.line,
          detail: 'a timer requests the cart on an interval'
        });
      }
    }

    const all = listeners(js);
    for (const listener of all) {
      const body = listener.text;
      if (KEYSTROKE_EVENTS.includes(listener.event) && REQUESTS.test(body.masked) && !THROTTLES.test(body.masked)) {
        out.push({
          id: 'search-input-without-debounce',
          severity: 'error',
          line: listener.line,
          detail: 'the ' + listener.event + ' handler requests on every keystroke'
        });
      }
      // Declaring the option and setting it to false is not passive. Reading
      // only for the word means a listener that explicitly opts out of passive
      // behaviour is the one case the check misses.
      const declaresPassive = /passive/.test(listener.options) && !/passive\s*:\s*false/.test(listener.options);
      if (PASSIVE_EVENTS.includes(listener.event) && !declaresPassive) {
        out.push({
          id: 'listener-not-passive',
          severity: 'warn',
          line: listener.line,
          detail: 'the ' + listener.event + ' listener does not pass the passive option'
        });
      }
      if (listener.event === 'resize' && !THROTTLES.test(body.masked)) {
        out.push({
          id: 'resize-handler-without-throttle',
          severity: 'warn',
          line: listener.line,
          detail: 'the resize handler runs on every event'
        });
      }
      const write = body.masked.search(STYLE_WRITES);
      if (write !== -1 && LAYOUT_READS.test(body.masked.slice(write))) {
        out.push({
          id: 'layout-read-after-write-in-handler',
          severity: 'error',
          line: listener.line,
          detail: 'the handler writes style and then reads layout'
        });
      }
    }

    const fetchCalls = js.calls('fetch').filter((c) => !c.member);
    const repeated = all.length > 0 || intervals.length > 0;
    if (fetchCalls.length && repeated && !/AbortController/.test(js.masked)) {
      for (const call of fetchCalls) {
        out.push({
          id: 'fetch-without-abort',
          severity: 'warn',
          line: call.line,
          detail: 'no abort controller anywhere in the file'
        });
      }
    }

    for (const call of js.calls('parseFromString')) {
      if (/sections=/.test(js.source)) continue;
      out.push({
        id: 'full-page-fetch-for-section',
        severity: 'warn',
        line: call.line,
        detail: 'a whole document is parsed to take one fragment out'
      });
    }

    for (const start of js.find(/\b(for|while)\s*\(/)) {
      const head = argsRegion(js.masked, start.index);
      const body = bodyRangeAfter(js.masked, head ? head.end : start.index);
      if (!body) continue;
      const text = js.masked.slice(body.start, body.end);
      const queries = DOM_QUERIES.some((name) => new RegExp('\\.\\s*' + name + '\\s*\\(').test(text));
      if (queries) {
        out.push({
          id: 'dom-query-in-loop',
          severity: 'notice',
          line: start.line,
          detail: 'the loop body walks the document on every iteration'
        });
      }
    }
    return out;
  }
};
