// Copies the Avalon lobby's CSS out of the live Avalon app (read-only), scoped under `.avalon`,
// so Jackdaw's Avalon lobby looks exactly like the real one. Rerun after Avalon's look changes:
//
//   node packages/games/avalon/scripts/copy-lobby-css.mjs <path to the avalon repo>
//
// It writes src/ui/avalon-copied.css. Layout, fonts and motion live in src/ui/avalon-lobby.css.
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = process.argv[2];
if (!repo) throw new Error('Pass the path to the Avalon repo.');
const out = join(dirname(fileURLToPath(import.meta.url)), '../src/ui/avalon-copied.css');

// The classes the lobby uses (Lobby.js, RoundTable.js, Fan.js, Avatar.js).
const KEEP = new Set(
  `eyebrow good-text evil-text small muted btn btn-primary btn-ghost btn-lg btn-sm fan fan-sm
  fan-lg fan-card fan-art fan-name hand hand-inner hand-title hand-text table-wrap table-top
  table-center center-kicker center-code center-line seat-node avatar avatar-icon badge-icon
  badge-leader seat-name seat-you seat-tag tag-plain house-note settings setting setting-label
  setting-value setting-select setting-switch setting-switch-knob setting-checks setting-check
  bubble`.split(/\s+/),
);
const KEYFRAMES = ['deal', 'pop', 'rise', 'bubble', 'glow', 'fade'];
const FONTS = {
  'var(--font-heading)': 'var(--ff-av-heading)',
  'var(--font-plaque)': 'var(--ff-plaque)',
  'var(--font-body)': 'var(--ff-body)',
  'var(--font-blackletter)': 'var(--ff-av-blackletter)',
  'var(--font-display)': 'var(--ff-av-display)',
};
// Sizing that follows the app's viewport layout is replaced in avalon-lobby.css.
const DROP = { '.avalon .hand': ['width', 'margin-top'] };

const stripComments = (css) => css.replace(/\/\*[\s\S]*?\*\//g, '');

/** Top-level [prelude, body] pairs. */
function blocks(css) {
  const out = [];
  let i = 0;
  while (i < css.length) {
    const j = css.indexOf('{', i);
    if (j < 0) break;
    let depth = 1;
    let k = j + 1;
    while (depth && k < css.length) {
      if (css[k] === '{') depth++;
      else if (css[k] === '}') depth--;
      k++;
    }
    out.push([css.slice(i, j).trim(), css.slice(j + 1, k - 1)]);
    i = k;
  }
  return out;
}

function splitList(sel) {
  const parts = [];
  let depth = 0;
  let cur = '';
  for (const ch of sel) {
    if (ch === '(') depth++;
    if (ch === ')') depth--;
    if (ch === ',' && depth === 0) {
      parts.push(cur.trim());
      cur = '';
    } else cur += ch;
  }
  parts.push(cur.trim());
  return parts.filter(Boolean);
}

const classesOk = (sel) =>
  [...sel.matchAll(/\.([a-zA-Z][\w-]*)/g)].every(
    ([, c]) => KEEP.has(c) || c.startsWith('is-') || c.startsWith('ring-'),
  );

/** Keep only kept classes inside :is(...); null if nothing is left. */
function filterIs(sel) {
  let empty = false;
  const out = sel.replace(/:is\(([^()]*)\)/g, (_, list) => {
    const items = splitList(list).filter(classesOk);
    if (!items.length) empty = true;
    return `:is(${items.join(', ')})`;
  });
  return empty ? null : out;
}

function scope(raw, printed) {
  const sel = raw.trim();
  if (/^(html|body|\*|\.landscape|\.scene|\.home|\.sr-only|\.phase-)/.test(sel)) return null;
  if (printed) {
    if (!sel.startsWith('[data-printed]')) return null;
    const rest = filterIs(sel.slice('[data-printed]'.length).trim());
    if (rest === null || !/\.[a-zA-Z]/.test(rest) || !classesOk(rest)) return null;
    return `.avalon[data-printed] ${rest}`;
  }
  if (sel.startsWith(':')) return null;
  const kept = filterIs(sel);
  if (kept === null || !/\.[a-zA-Z]/.test(kept) || !classesOk(kept)) return null;
  return `.avalon ${kept}`;
}

function fixBody(body, sel) {
  let b = body;
  for (const name of KEYFRAMES)
    b = b.replace(new RegExp(`(animation(?:-name)?:\\s*)${name}\\b`, 'g'), `$1av-${name}`);
  for (const [from, to] of Object.entries(FONTS)) b = b.split(from).join(to);
  const drop = DROP[sel];
  if (drop)
    b = b
      .split('\n')
      .filter((l) => !drop.includes(l.split(':')[0].trim()))
      .join('\n');
  return b;
}

function fmt(sels, body) {
  const lines = body
    .split('\n')
    .map((l) => l.trim())
    .filter(Boolean);
  return `${sels.join(',\n')} {\n${lines.map((l) => `  ${l}`).join('\n')}\n}\n`;
}

function rules(css, printed) {
  const out = [];
  for (const [prelude, body] of blocks(stripComments(css))) {
    if (prelude.startsWith('@keyframes')) {
      const name = prelude.split(/\s+/)[1];
      if (KEYFRAMES.includes(name)) out.push(`@keyframes av-${name} {${body}}\n`);
      continue;
    }
    if (prelude.startsWith('@')) continue; // viewport and motion: avalon-lobby.css
    if (prelude === ':root') {
      out.push(fmt(['.avalon'], fixBody(body)));
      continue;
    }
    if (prelude === '[data-printed]') {
      out.push(fmt(['.avalon[data-printed]'], fixBody(body)));
      continue;
    }
    const sels = splitList(prelude)
      .map((s) => scope(s, printed))
      .filter(Boolean);
    if (sels.length) out.push(fmt(sels, fixBody(body, sels.length === 1 ? sels[0] : '')));
  }
  return out;
}

const read = (f) => readFileSync(join(repo, f), 'utf8');
const parts = [
  '/* Generated by scripts/copy-lobby-css.mjs from the Avalon app (C:\\Users\\KBITK\\OneDrive\\Desktop\\avalon).\n' +
    '   Do not edit by hand: change the app, then rerun the script. Night is app/globals.css;\n' +
    '   Parchment (by day) is app/themes.css, under [data-printed]. */\n',
  ...rules(read('app/globals.css'), false),
  ...rules(read('app/themes.css'), true),
];
writeFileSync(out, parts.join('\n'));
console.log(`wrote ${parts.length - 1} rules to ${out}`);
