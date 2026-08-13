/**
 * Language handling for handwritten notes.
 *
 * A note's text may be a plain string or a map of BCP-47 tags to strings. The
 * map is resolved against the languages the visitor actually reads - the
 * browser's preference list, which mirrors the operating system setting - so an
 * app writes the note once and each visitor gets their own language by default.
 */

/** Key that answers for any language the map does not cover. */
const DEFAULT_KEY = "default";

/**
 * A key that could plausibly be a language tag: a 2-3 letter primary subtag
 * followed by any script, region or variant subtags. Deliberately strict about
 * that first subtag - it is what tells a locale map apart from a note options
 * object, whose keys (`text`, `position`, `offset`, `underline`) are all longer.
 */
const LANGUAGE_TAG = /^[a-z]{2,3}(-[a-z0-9]{2,8})*$/i;

// Strong right-to-left characters: Hebrew, Arabic, Syriac, Thaana, N'Ko and the
// Arabic presentation forms.
const RTL_STRONG = /[֑-߿יִ-﷿ﹰ-ﻼ]/;

// Strong left-to-right characters: Latin, Greek, Cyrillic, Armenian, and the
// Indic-through-CJK range. Enough to tell which script opens a short note.
const LTR_STRONG =
  /[A-Za-zÀ-֏ऀ-῿Ⰰ-퟿豈-ﬗＡ-Ｚａ-ｚ]/;

/**
 * Case-folded tag with `_` separators normalised, e.g. `pt_BR` -> `pt-br`.
 * @param {unknown} tag
 * @returns {string}
 */
export function normalizeTag(tag) {
  if (typeof tag !== "string") return "";
  return tag.trim().replace(/_/g, "-").toLowerCase();
}

/**
 * Is this a map of language tags to strings rather than a note options object?
 *
 * Every key has to look like a language tag for the answer to be yes, so a
 * partial note config - `{ position: "top" }` - is never mistaken for one.
 *
 * @param {unknown} value
 * @returns {boolean}
 */
export function isLocaleMap(value) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;

  const entries = Object.entries(value);
  if (!entries.length) return false;

  return entries.every(([key, text]) => {
    if (typeof text !== "string") return false;
    const tag = normalizeTag(key);
    return tag === DEFAULT_KEY || LANGUAGE_TAG.test(tag);
  });
}

/**
 * Languages the visitor reads, most wanted first.
 *
 * An explicit `locale` wins outright - an app that runs its own i18n knows
 * better than the browser. Otherwise this is the OS language list, and finally
 * whatever the document declares itself to be written in.
 *
 * @param {string | string[] | null | undefined} [override]
 * @returns {string[]}
 */
export function preferredLocales(override) {
  const tags = [];

  const add = (value) => {
    const tag = normalizeTag(value);
    if (tag && !tags.includes(tag)) tags.push(tag);
  };

  if (Array.isArray(override)) override.forEach(add);
  else add(override);

  const nav = typeof navigator === "undefined" ? null : navigator;
  if (nav) {
    if (Array.isArray(nav.languages)) nav.languages.forEach(add);
    add(nav.language);
  }

  if (typeof document !== "undefined") add(document.documentElement?.lang);

  return tags;
}

/**
 * Best of `tags` for a visitor who asked for `preferred`, by index.
 *
 * Each wanted language is exhausted before moving to the next one, so a
 * `fr, en` visitor takes any French on offer over the English original.
 *
 * @param {string[]} tags language tags to choose from
 * @param {string[]} preferred wanted languages, most wanted first
 * @returns {number} index into `tags`, or `-1` for no match at all
 */
export function matchLocale(tags, preferred) {
  const available = tags.map(normalizeTag);

  for (const want of preferred) {
    // Drop one subtag at a time, so `zh-Hant-TW` settles for `zh-Hant` - still
    // the right script - before falling back to a bare `zh`.
    let tag = want;
    while (tag) {
      const exact = available.indexOf(tag);
      if (exact !== -1) return exact;

      const cut = tag.lastIndexOf("-");
      tag = cut > 0 ? tag.slice(0, cut) : "";
    }

    // Nothing on offer is a less specific form of what was asked for, so take a
    // sibling of the same language instead: `fr-CA` reads `fr-FR` happily.
    const base = want.split("-")[0];
    const sibling = available.findIndex((key) => key.split("-")[0] === base);
    if (sibling !== -1) return sibling;
  }

  return -1;
}

/**
 * The string to write, and the language it turned out to be in.
 *
 * A plain string passes straight through - it carries no language of its own,
 * so there is nothing to resolve and nothing to report.
 *
 * @param {unknown} text a string, or a map of language tags to strings
 * @param {string | string[] | null} [locale] override for the visitor's languages
 * @returns {{ text: string, locale: string | null }}
 */
export function resolveLocalizedText(text, locale = null) {
  if (typeof text === "string") return { text, locale: null };
  if (!isLocaleMap(text)) return { text: "", locale: null };

  const keys = Object.keys(text);
  const tags = keys.filter((key) => normalizeTag(key) !== DEFAULT_KEY);

  const index = matchLocale(tags, preferredLocales(locale));
  if (index !== -1) {
    return { text: text[tags[index]], locale: normalizeTag(tags[index]) };
  }

  // No language the visitor reads is on offer. Fall back to the declared
  // default, or failing that to the first translation written - the one the
  // author reached for first, which is as close to an original as we have.
  const fallback = keys.find((key) => normalizeTag(key) === DEFAULT_KEY);
  if (fallback) return { text: text[fallback], locale: null };

  return { text: text[keys[0]], locale: normalizeTag(keys[0]) };
}

/**
 * Does this text read right to left?
 *
 * The first strong directional character decides, which is the rule behind
 * HTML's `dir="auto"`. SVG has no `auto`, so the note works it out itself.
 *
 * @param {unknown} text
 * @returns {boolean}
 */
export function isRtlText(text) {
  if (typeof text !== "string") return false;

  const rtl = text.search(RTL_STRONG);
  if (rtl === -1) return false;

  const ltr = text.search(LTR_STRONG);
  return ltr === -1 || rtl < ltr;
}
