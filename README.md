# amusic

`amusic` is a command-line music utility for the care and feeding of local music
libraries.

Initially inspired by `rsgain` (especially its `easy` mode), its early evolution
is focused on augmenting its capabilities with generating and embedding AcoustID
fingerprints.

## Features

- **ReplayGain generation** — Calculates and embeds ReplayGain metadata. This
  helps audio players avoid the common problem of having to manually adjust
  volume levels between tracks when playing audio from albums that have been
  mastered at different loudness levels.
- **AcoustID Fingerprint Generation** — Calculates and embeds an AcoustID
  fingerprint (`ACOUSTID_FINGERPRINT` tag). This uniquely identifies an audio
  file (typically a music track), which will later help associate the audio file
  with metadata including Title, Artist, Album, and lots more.
- **Force Overwrite** — Optionally, users can force AcoustID fingerprints to be
  re-calculated and overwritten even for files that already have them using the
  `--force` flag.
- **Quiet Mode** — Use the `-q`/`--quiet` flag to suppress detail displayed
  during processing. Errors and the final summary report are still displayed.
- **Summary Report** — After all files are processed, a summary is shown
  detailing the number of files successfully processed, skipped, or failed.

### To Do

- 🚧 **Apple SoundCheck generation** — Calculates and embeds Apple SoundCheck
  metadata, which is Apple’s equivalent of ReplayGain.
- 🚧 **Ultra high-quality AAC encoding** — On macOS, `amusic` will be able to
  encode lossless audio (FLAC, WAV) to audibly-transparent `.m4a` files.

### AcoustID Processing Details

The script queries the AcoustID web service using the generated fingerprint and
an AcoustID API key. You can provide your API key via the `--api-key <key>`
option or by setting the `ACOUSTID_API_KEY` environment variable:

```bash
# Set your key in the environment (once per session)
export ACOUSTID_API_KEY=your_api_key_here

# Then run without repeating the flag:
deno run --allow-read --allow-run --allow-write --allow-env src/amusic.ts \
  <file1> [file2 ...]
```

Alternatively, you can pass the key directly:

```bash
deno run --allow-read --allow-run --allow-write --allow-env src/amusic.ts \
  --api-key $ACOUSTID_API_KEY <file1> [file2 ...]
```

It retrieves and embeds the `ACOUSTID_ID` (the UUID from the AcoustID database);
it does NOT fetch or embed other metadata (like track title, artist, album), but
this may be supported in a future release.

## Dependencies

The following command-line tools must be installed and available in the system's
PATH (except for **fpcalc** and **rsgain**, which are provided in the `vendor`
directory for supported platforms):

- **Deno**: The runtime for the script. Installation instructions can be found
  at [https://deno.land/](https://deno.land/).
- **ffmpeg**: Used for reading and writing metadata to audio files.
- **ffprobe**: Used for reading metadata from audio files (often included with
  `ffmpeg`).
- **fpcalc**: Used for generating AcoustID fingerprints. A native binary is
  included in the `vendor` directory; no separate installation is required.
- **rsgain**: Used for ReplayGain analysis and metadata tagging. A native binary
  is included in the `vendor` directory; no separate installation is required.

The script actively checks for the presence of `ffmpeg`, `ffprobe`, and `fpcalc`
at runtime using its `ensureCommandExists` function. Future work could explore
WebAssembly (WASM) or pure JavaScript alternatives for `fpcalc` to minimize
external binary dependencies and simplify the setup process for users.

You can install the remaining dependencies (`ffmpeg`, `ffprobe`, and `rsgain`,
if needed) using your system's package manager. For example, on Debian/Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg
```

On macOS (using Homebrew):

```bash
brew install ffmpeg
```

## Installation

1. Ensure Deno and the other dependencies (ffmpeg, ffprobe) are installed.
2. Clone this repository or download the `amusic.ts` script.
3. (Optional) Build a standalone executable (includes the platform-specific
   vendor binaries):

   ```bash
   deno task build
   ```

## Usage

> **Note:** If you've built a standalone executable using `deno task build`, you
> can run it directly from `dist/amusic`:

```bash
./dist/amusic [options] <file1> [file2 ...]
```

To use `amusic`, navigate to the directory containing `amusic.ts` and run the
script using `deno run`. Provide the paths to the audio files you want to
process as arguments.

**Syntax:**

```bash
deno run --allow-read --allow-run --allow-write --allow-env amusic.ts [options] <file1> [file2 ...]
```

- `--allow-read`: Required to read audio files and check for system commands.
- `--allow-run`: Required to execute external tools like `ffmpeg`, `ffprobe`,
  and `fpcalc`.
- `--allow-write`: Required to write updated audio files (if tags are
  added/changed) and for temporary file creation by external tools.
- `--allow-env`: Required for certain Deno operations like `Deno.makeTempDir`
  and checking for system commands in PATH.
- `<file1> [file2 ...]`: One or more paths to audio files to be processed.

**Options:**

- `-f, --force`: Force recalculation and saving of the AcoustID fingerprint even
  if existing AcoustID tags are found in the file. Without this flag, files with
  existing tags will be skipped.
- `-q, --quiet`: Suppress informational output during processing. Error messages
  and the final summary report will still be displayed.
- `--show-tags`: Display existing `ACOUSTID_ID` and `ACOUSTID_FINGERPRINT` tags
  for the specified files and then exit. This option does not modify files or
  perform any online lookups.
- `--dry-run`: Simulate the entire tagging process, including fingerprint
  generation and AcoustID API lookups (if an `--api-key` is provided), but do
  not make any actual changes to the audio files. This is useful for testing or
  previewing what actions would be performed. A notice will be shown in the
  summary report if a dry run was performed.

After processing all files, a summary report is displayed, showing the number of
files successfully processed, skipped, and failed.

**Examples:**

1. **Generate and add fingerprint to an audio file:**

   ```bash
   deno run --allow-read --allow-run --allow-write --allow-env amusic.ts "./path/to/your/music file.mp3"
   ```

2. **Process multiple files, one of them with forced overwrite:**

   ```bash
   deno run --allow-read --allow-run --allow-write --allow-env amusic.ts --force "./path/to/your/music file.flac" "./another/audio.ogg"
   ```

3. **Process a file in quiet mode:**
   ```bash
   deno run --allow-read --allow-run --allow-write --allow-env amusic.ts --quiet "./path/to/quiet_process.mp3"
   ```

4. **Perform a lookup using the environment variable (preferred):**
   ```bash
   export ACOUSTID_API_KEY=your_api_key_here
   deno run --allow-read --allow-run --allow-write --allow-env amusic.ts \
     ./path/to/your/music/file.mp3
   ```

5. **Easy Mode: Process a music library organized by album folders. Calculates ReplayGain for each album and AcousticID for each track:**
   ```bash
   deno run --allow-read --allow-run --allow-write --allow-env amusic.ts easy /path/to/music/library --api-key $ACOUSTID_API_KEY
   ```

## Contributing

Contributions are welcome! If you'd like to help improve `amusic` or add new
features, please feel free to:

- Report a bug or suggest a feature by opening an issue.
- Check existing issues for ideas or ongoing discussions.
- Submit a pull request with your improvements.

When contributing code, please ensure you run `deno fmt` and `deno lint` before
submitting.

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file
for details.
