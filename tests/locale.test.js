import { test, afterEach } from "node:test";
import assert from "node:assert/strict";
import {
  isLocaleMap,
  isRtlText,
  matchLocale,
  normalizeTag,
  preferredLocales,
  resolveLocalizedText,
} from "../src/locale.js";
import { mergeOptions } from "../src/utils.js";
import { renderAnnotation } from "../src/annotations.js";

/** `navigator` is a getter on globalThis, so it has to be redefined. */
function stubLanguages(languages) {
  Object.defineProperty(globalThis, "navigator", {
    value: { languages, language: languages[0] },
    configurable: true,
    writable: true,
  });
}

/**
 * Enough of the DOM to build and measure a note, recording every element so a
 * test can read back the text that was actually written.
 */
function stubDom() {
  const elements = [];

  globalThis.document = {
    createElementNS: () => {
      const element = {
        attrs: {},
        textContent: "",
        setAttribute(name, value) {
          this.attrs[name] = value;
        },
        setAttributeNS(_ns, name, value) {
          this.attrs[name] = value;
        },
        appendChild() {},
      };
      elements.push(element);
      return element;
    },
  };

  return { svg: { appendChild() {} }, elements };
}

const ELEMENT = { x: 200, y: 200, width: 160, height: 60, radius: 8 };
const STYLE = { color: "#fff", opacity: 0.9, strokeWidth: 1.4, roughness: 1.4 };

/** Draw a note and report what it says, plus the text element's attributes. */
function draw(noteOptions) {
  const { svg, elements } = stubDom();
  const result = renderAnnotation(svg, ELEMENT, noteOptions, STYLE, 1);
  const text = elements
    .filter((element) => element.textContent)
    .map((element) => element.textContent)
    .join(" ");

  return { text, attrs: elements[1]?.attrs ?? {}, result };
}

afterEach(() => {
  delete globalThis.document;
  delete globalThis.navigator;
});

test("a note is written in the language the system asks for", () => {
  stubLanguages(["fr-FR", "en-US"]);

  const { text } = draw({
    text: { en: "start chat", fr: "démarrer le chat", de: "chat starten" },
  });

  assert.equal(text, "démarrer le chat");
});

test("languages are tried in the order the system prefers them", () => {
  // No Japanese on offer, so the second choice answers rather than the first
  // key in the map - a visitor's ranking is a ranking, not a single language.
  stubLanguages(["ja", "de", "en"]);

  const { text } = draw({ text: { en: "hi", de: "hallo", es: "hola" } });
  assert.equal(text, "hallo");
});

test("a region is dropped before a language is given up on", () => {
  stubLanguages(["pt-BR"]);
  assert.equal(resolveLocalizedText({ pt: "olá", en: "hi" }).text, "olá");

  // The other way round too: asked for plain `pt`, served the Brazilian one
  stubLanguages(["pt"]);
  assert.equal(resolveLocalizedText({ "pt-BR": "olá", en: "hi" }).text, "olá");
});

test("a regional sibling beats another language entirely", () => {
  stubLanguages(["en-AU"]);

  assert.equal(
    resolveLocalizedText({ fr: "salut", "en-GB": "hiya" }).text,
    "hiya",
  );
});

test("script is held on to longer than region", () => {
  // `zh-Hant-TW` has no exact entry: traditional Chinese is still right, and
  // simplified is not, so the script subtag outranks the bare language.
  assert.equal(
    matchLocale(["zh-Hans", "zh-Hant"], ["zh-hant-tw"]),
    1,
  );
});

test("tags are matched regardless of case or separator", () => {
  stubLanguages(["PT_br"]);

  assert.equal(normalizeTag("PT_br"), "pt-br");
  assert.equal(resolveLocalizedText({ "pt-BR": "olá", en: "hi" }).text, "olá");
});

test("an unknown language falls back to the declared default", () => {
  stubLanguages(["is"]);

  const resolved = resolveLocalizedText({
    en: "start chat",
    fr: "démarrer",
    default: "chat",
  });

  assert.equal(resolved.text, "chat");
  // The default is nobody's language in particular, so none is reported
  assert.equal(resolved.locale, null);
});

test("with no default, the first translation written stands in", () => {
  stubLanguages(["is"]);

  const resolved = resolveLocalizedText({ en: "start chat", fr: "démarrer" });
  assert.equal(resolved.text, "start chat");
  assert.equal(resolved.locale, "en");
});

test("an explicit locale overrides the system", () => {
  stubLanguages(["en-US"]);

  const { text } = draw({
    text: { en: "start chat", hi: "चैट शुरू करें" },
    locale: "hi",
  });

  assert.equal(text, "चैट शुरू करें");
});

test("the locale option reaches the note through mergeOptions", () => {
  const options = mergeOptions({
    note: { text: { en: "hi", fr: "salut" }, position: "top" },
    locale: "fr",
  });

  assert.equal(options.note.locale, "fr");

  // A note may also carry its own, which wins over the shared setting
  const own = mergeOptions({
    note: { text: { en: "hi" }, locale: ["de", "en"] },
    locale: "fr",
  });
  assert.deepEqual(own.note.locale, ["de", "en"]);
});

test("a bare map of languages is a note, not a note config", () => {
  const options = mergeOptions({ note: { en: "hi", fr: "salut" } });

  assert.deepEqual(options.note.text, { en: "hi", fr: "salut" });
  assert.equal(options.note.position, "top-right");
});

test("a note config is never mistaken for a map of languages", () => {
  // Every key would have to look like a language tag, and these do not - a
  // partial config used to be readable as `{ position: "top" }` in "position"
  assert.equal(isLocaleMap({ position: "top" }), false);
  assert.equal(isLocaleMap({ text: "hi", position: "top" }), false);
  assert.equal(isLocaleMap({ text: "hi", underline: false }), false);
  assert.equal(isLocaleMap({}), false);
  assert.equal(isLocaleMap("hi"), false);

  assert.equal(isLocaleMap({ en: "hi" }), true);
  assert.equal(isLocaleMap({ "pt-BR": "olá", default: "hi" }), true);

  const options = mergeOptions({ note: { position: "top" } });
  assert.equal(options.note.text, undefined);
  assert.equal(options.note.position, "top");
});

test("a plain string note is untouched by any of this", () => {
  stubLanguages(["fr-FR"]);

  const resolved = resolveLocalizedText("start chat");
  assert.equal(resolved.text, "start chat");
  assert.equal(resolved.locale, null);

  assert.equal(draw({ text: "start chat" }).text, "start chat");
});

test("a note with nothing to say is not drawn", () => {
  assert.equal(draw({ text: {} }).result, null);
  assert.equal(draw({ text: null }).result, null);
  assert.equal(draw(null).result, null);
});

test("the language actually drawn is declared on the text", () => {
  stubLanguages(["fr-CA"]);

  const { attrs } = draw({ text: { en: "start chat", "fr-FR": "démarrer" } });
  assert.equal(attrs["xml:lang"], "fr-fr");

  // A plain string carries no language of its own, so none is claimed
  assert.equal(draw({ text: "start chat" }).attrs["xml:lang"], undefined);
});

test("an explicit locale is preferred over the system, then the document", () => {
  stubLanguages(["en-US", "en"]);
  globalThis.document = { documentElement: { lang: "de" } };

  assert.deepEqual(preferredLocales("fr"), ["fr", "en-us", "en", "de"]);
  assert.deepEqual(preferredLocales(["fr", "es"]), [
    "fr",
    "es",
    "en-us",
    "en",
    "de",
  ]);
  assert.deepEqual(preferredLocales(null), ["en-us", "en", "de"]);
});

test("the page's own language is a last resort, not a first choice", () => {
  // A German page visited by an English reader shows English where it can
  stubLanguages(["en"]);
  globalThis.document = { documentElement: { lang: "de" } };

  assert.equal(resolveLocalizedText({ de: "hallo", en: "hi" }).text, "hi");

  // and German when it cannot
  assert.equal(resolveLocalizedText({ de: "hallo", fr: "salut" }).text, "hallo");
});

test("a note in a right-to-left script is laid out right to left", () => {
  stubLanguages(["ar"]);

  const { attrs, result } = draw({
    text: { en: "start chat", ar: "ابدأ الدردشة" },
  });

  assert.equal(attrs.direction, "rtl");
  assert.equal(attrs["unicode-bidi"], "embed");

  // `text-anchor` is direction-relative: the line is anchored where it starts,
  // which for right-to-left text is its right edge, and that anchor sits on the
  // far side of the box so the line fills leftward into it. Asking for `end`
  // instead anchors the *left* edge and runs the text off to the right of the
  // box, leaving the underline behind on its own.
  assert.equal(attrs["text-anchor"], "start");

  const x = Number(attrs.x);
  assert.ok(x > result.box.x + result.box.width / 2, "anchored on the far side");
  assert.ok(x <= result.box.x + result.box.width, "and not past the box");
});

test("the same note in English is left alone", () => {
  stubLanguages(["en"]);

  const { attrs, result } = draw({
    text: { en: "start chat", ar: "ابدأ الدردشة" },
  });

  assert.equal(attrs.direction, undefined);
  assert.equal(attrs["unicode-bidi"], undefined);
  assert.equal(attrs["text-anchor"], "start");

  // Same anchor, near side of the box - left to right fills the other way
  const x = Number(attrs.x);
  assert.ok(x < result.box.x + result.box.width / 2, "anchored on the near side");
  assert.ok(x >= result.box.x, "and not before the box");
});

test("direction is read off the text, not the locale it came from", () => {
  // First strong character decides, the rule behind `dir="auto"`
  assert.equal(isRtlText("ابدأ الدردشة"), true);
  assert.equal(isRtlText("שלום"), true);
  assert.equal(isRtlText("start chat"), false);
  assert.equal(isRtlText("नमस्ते"), false);
  assert.equal(isRtlText("chat ابدأ"), false);
  assert.equal(isRtlText("♡ ابدأ"), true);
  assert.equal(isRtlText(""), false);

  // so an unlabelled Arabic string still reads correctly
  assert.equal(draw({ text: "ابدأ الدردشة" }).attrs.direction, "rtl");
});
