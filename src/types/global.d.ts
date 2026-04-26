// Build-time replaced constants. See vite.config.ts `define` block for how
// these get injected, and the GitHub Actions workflow for how the value is
// sourced from the Release tag in CI.

/** App version string. Either a GitHub Release tag (e.g. "v0.2.0") in CI, or
 *  "v{package.json#version}-dev" locally. Replaced as a literal at build time. */
declare const __APP_VERSION__: string;
