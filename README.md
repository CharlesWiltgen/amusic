# amusic

`amusic` is a command-line music utility for the care and feeding of local music
libraries. Initially, it focuses on generating and embedding AcousticID
fingerprints.

## Features

- **AcousticID Fingerprint Generation:** Calculates and embeds the
  `ACOUSTID_FINGERPRINT` tag into your audio files locally using `fpcalc`.
- **Force Overwrite:** Optionally, users can force AcousticID fingerprints to be
  re-calculated and overwritten even for files that already have them using the
  `--force` flag.
- **Quiet Mode:** Use the `-q, --quiet` flag to suppress informational logs
  during processing. Errors and the final summary report are still displayed.
- **Summary Report:** After all files are processed, a summary is shown
  detailing the number of files successfully processed, skipped, or failed.

### AcousticID Processing Details

The script now queries the AcoustID web service using the generated fingerprint and a user-provided API key.
It retrieves and embeds the `ACOUSTID_ID` (the UUID from the AcoustID database).
It does NOT yet fetch or embed any other metadata (like track title, artist, album) from the AcoustID database, but this is a potential future enhancement.

## Dependencies

The following command-line tools must be installed and available in the system's
PATH:

- **Deno**: The runtime for the script. Installation instructions can be found
  at [https://deno.land/](https://deno.land/).
- **ffmpeg**: Used for reading and writing metadata to audio files.
- **ffprobe**: Used for reading metadata from audio files (often included with
  `ffmpeg`).
- **fpcalc**: Used for generating AcousticID fingerprints. This is typically
  provided by the `chromaprint-tools` package (or `libchromaprint-tools` on some
  systems). Older distributions might have it in `acoustid-tools`.

The script actively checks for the presence of `ffmpeg`, `ffprobe`, and `fpcalc` at runtime using its `ensureCommandExists` function. Future work could explore WebAssembly (WASM) or pure JavaScript alternatives for `fpcalc` to minimize external binary dependencies and simplify the setup process for users.

You can usually install these dependencies using your system's package manager.
For example, on Debian/Ubuntu:

```bash
sudo apt-get update
sudo apt-get install -y ffmpeg chromaprint-tools
```

On macOS (using Homebrew):

```bash
brew install ffmpeg chromaprint
```

## Installation

1. Ensure Deno and the other dependencies (ffmpeg, ffprobe, fpcalc) are
   installed.
2. Clone this repository or download the `amusic.ts` script.

## Usage

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

- `-f, --force`: Force recalculation and saving of the AcousticID fingerprint
  even if existing AcousticID tags are found in the file. Without this flag,
  files with existing tags will be skipped.
- `-q, --quiet`: Suppress informational output during processing. Error messages
  and the final summary report will still be displayed.

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

## Future Enhancements

Here are some potential next steps for `amusic`:

- Fetching and embedding richer metadata (e.g., track title, artist, album) from the AcoustID database or other music metadata services.
- Investigating and potentially integrating a WebAssembly (WASM) or pure JavaScript version of `fpcalc` to reduce reliance on external binary dependencies and simplify user setup.
- Adding support for other relevant music metadata services or databases.
- Implementing more advanced batch processing options or developing a library mode for programmatic use.

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
