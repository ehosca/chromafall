// Central font stacks so every scene pulls from one place. @font-face rules
// live in src/styles/fonts.css (imported by main.ts); BootScene blocks the
// boot until these have loaded so canvas text never renders in the fallback.
//
//   DISPLAY — Orbitron, the synthwave marquee. Titles + big CTAs only; it's a
//             wide geometric face that reads poorly below ~18px.
//   UI      — Rajdhani, condensed techno sans. HUD, labels, buttons, body.
//
// Quoted family names + system fallbacks so a font load failure degrades to
// something sane rather than serif.
export const FONT_DISPLAY = "'Orbitron', 'Segoe UI', sans-serif";
export const FONT_UI = "'Rajdhani', 'Segoe UI', sans-serif";
