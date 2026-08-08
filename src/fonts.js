const FONT_NAME = "Caveat";

const FONT_HREF =
  "https://fonts.googleapis.com/css2?family=Caveat:wght@400;600&display=swap";

const MARKER = "data-freehand-font";

let requested = false;

/**
 * Load the handwriting webfont once per page.
 *
 * Without this the notes ask for a font nobody loaded and fall back to the
 * generic `cursive` family — Apple Chancery on macOS, a calligraphic serif that
 * does not read as handwriting at all. Consuming apps have no reason to know
 * they need to load Caveat, so the library does it itself.
 *
 * Skipped when the host already provides the family, and disabled entirely with
 * `autoLoadFont: false` for strict-CSP apps that self-host.
 */
export function ensureHandwrittenFont() {
  if (requested) return;
  if (typeof document === "undefined" || !document.head) return;
  requested = true;

  // Already available — self-hosted @font-face, next/font, or a second doodle
  try {
    if (document.fonts?.check?.(`600 19px "${FONT_NAME}"`)) return;
  } catch {
    /* older engines throw on an unfamiliar font shorthand */
  }

  if (document.querySelector(`link[${MARKER}]`)) return;

  const link = document.createElement("link");
  link.rel = "stylesheet";
  link.href = FONT_HREF;
  link.setAttribute(MARKER, "");
  document.head.appendChild(link);
}

/** Test seam — lets a suite exercise the injection more than once. */
export function resetHandwrittenFont() {
  requested = false;
}
