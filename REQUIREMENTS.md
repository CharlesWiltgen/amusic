# Requirements for amusic CLI

- **No fallback to system binaries for `rsgain` and `fpcalc`.**  
  The code must always use the vendored `rsgain` and `fpcalc` binaries included under `vendor/<platform>` and should error out if those are missing.

<!--
This file captures critical runtime requirements that must not be overridden.
Refer to this file in future development to avoid reintroducing system-binary fallbacks.
-->