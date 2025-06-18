# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Overview

`amusic` is a Deno-based command-line music utility that serves as a showcase for taglib-wasm. It demonstrates taglib-wasm's capabilities by processing audio files to calculate/embed ReplayGain metadata and AcoustID fingerprints. The primary objective of amusic is to showcase taglib-wasm's universal audio metadata handling capabilities.

## Key Dependencies

- **Taglib-Wasm** (https://github.com/CharlesWiltgen/taglib-wasm): Universal audio metadata library for all tag reading/writing operations
  - Import: `import { TagLib } from "npm:taglib-wasm@latest";`
  - API: Uses `TagLib.initialize()` for initialization and `taglib.open(fileData, filename)` for file operations
  - Handles all audio formats transparently (MP3, M4A/MP4, FLAC, OGG, WAV, etc.)
  - No external binary dependencies for metadata operations
  - **Working Version**: v0.3.20+ works correctly with Deno
  - **Key Features Leveraged**:
    - AcoustID fingerprint/ID reading and writing (`getAcoustIdFingerprint()`, `setAcoustIdFingerprint()`)
    - ReplayGain tag support (`getReplayGainTrackGain()`, `setReplayGainTrackGain()`, etc.)
    - MusicBrainz ID support (`getMusicBrainzTrackId()`, etc.)
    - Comprehensive metadata reading (title, artist, album, year, genre, comment, track)
    - Audio properties (duration, bitrate, sample rate, channels, format via `audioProperties()`)
    - Cover art detection (`getPictures()`)
  - **Important**: Must call `save()` then `getFileBuffer()` and write to disk with `Deno.writeFile()`

## Development Commands

### Build
```bash
# Build standalone executable (includes platform-specific vendor binaries)
deno task build
# This creates dist/amusic and automatically removes quarantine attributes + performs ad-hoc code signing on macOS
```

### Testing
```bash
# Run all tests
deno test --allow-read --allow-run --allow-write --allow-env

# Run a specific test file
deno test --allow-read --allow-run --allow-write --allow-env src/amusic.test.ts

# Run tests with pattern matching
deno test --allow-read --allow-run --allow-write --allow-env --filter "acoustid"
```

### Formatting and Linting
```bash
# Format code
deno fmt

# Check formatting
deno fmt --check

# Run linter
deno lint
```

### Running the Tool
```bash
# Run from source
deno run --allow-read --allow-run --allow-write --allow-env src/amusic.ts [options] <files>

# Run built executable
./dist/amusic [options] <files>

# Easy mode (process entire library organized by album folders)
deno run --allow-read --allow-run --allow-write --allow-env src/amusic.ts easy /path/to/music/library --api-key $ACOUSTID_API_KEY
```

## Architecture

### Core Components

1. **Main Entry (src/amusic.ts)**: 
   - CLI interface using Cliffy command framework
   - Two modes: basic file processing and "easy" mode for album-organized libraries
   - Handles command-line parsing, file discovery, and orchestrates processing

2. **AcoustID Module (src/lib/acoustid.ts)**:
   - Fingerprint generation using vendored `fpcalc` binary
   - AcoustID API integration for fingerprint lookups
   - Tag reading/writing via Taglib-Wasm

3. **ReplayGain Module (src/lib/replaygain.ts)**:
   - Album-level ReplayGain calculation using vendored `rsgain` binary
   - Processes entire directories as albums

4. **Tagging Module (src/lib/tagging.ts)**:
   - Uses Taglib-Wasm (https://github.com/CharlesWiltgen/taglib-wasm) for all tag reading/writing
   - Supports all major audio formats: MP3, M4A/MP4, FLAC, OGG, WAV, etc.
   - Handles format-specific metadata transparently
   - Provides comprehensive metadata reading including:
     - Standard tags (title, artist, album, year, genre, etc.)
     - Audio properties (bitrate, sample rate, duration, channels)
     - Extended tags (AcoustID, MusicBrainz IDs, ReplayGain)
     - Cover art detection

5. **Vendor Tools (src/lib/vendor_tools.ts)**:
   - Platform-specific binary resolution (macos-arm64, macos-x86_64, linux-x86_64, windows-x86_64)
   - **CRITICAL**: Always uses vendored binaries, never falls back to system binaries
   - Supported tools: fpcalc, rsgain

### Key Design Decisions

- **Vendored Binaries**: External tools (fpcalc, rsgain) are included in `src/vendor/<platform>/` to ensure consistency and avoid system dependency issues
- **Taglib-Wasm for Metadata**: All tag reading/writing is handled by Taglib-Wasm, providing consistent cross-platform metadata handling
- **Atomic Operations**: Uses temporary files when writing tags to prevent data loss
- **Album Processing**: In easy mode, processes albums as units for proper ReplayGain calculation
- **API Key Handling**: Supports both environment variable (`ACOUSTID_API_KEY`) and command-line flag

### File Processing Flow

1. Check for existing AcoustID tags (skip if present unless --force)
2. Generate fingerprint using fpcalc
3. Look up fingerprint via AcoustID API (if API key provided)
4. Write ACOUSTID_ID and ACOUSTID_FINGERPRINT tags using Taglib-Wasm
5. For easy mode: Calculate ReplayGain per album before AcoustID processing

## Important Constraints

- **No System Binary Fallback**: Per REQUIREMENTS.md, the code must ALWAYS use vendored binaries and error if missing
- **Supported Audio Formats**: mp3, flac, ogg, m4a, wav (and more via Taglib-Wasm)
- **Platform Support**: macOS (arm64/x86_64), Linux (x86_64), Windows (x86_64)
- **External Dependencies**: None required - Taglib-Wasm handles all metadata operations

## Testing Approach

Tests use mocking for external command execution and file operations. Test files are organized with sample audio files in `test_run_files/` for different scenarios (basic processing, force overwrite, dry run, etc.).

## Project Guidelines

- Never credit Claude in commits (handled separately by project maintainer)