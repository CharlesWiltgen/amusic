# amusic

`amusic` is a command-line audio utility written in Deno. Its primary function is to process audio files and add AcousticID fingerprints. This allows for music identification and metadata lookup through services like MusicBrainz.

## Features

-   Generates AcousticID fingerprints for audio files.
-   Writes fingerprints to file metadata using the `ACOUSTID_FINGERPRINT` tag.
-   Checks for existing AcousticID tags and can be forced to overwrite them.

## Dependencies

The following command-line tools must be installed and available in your system's PATH:

-   **Deno**: The runtime for the script. Installation instructions can be found at [https://deno.land/](https://deno.land/).
-   **ffmpeg**: Used for writing metadata to audio files.
-   **ffprobe**: Used for reading metadata from audio files.
-   **fpcalc**: Used for generating AcousticID fingerprints.

You can typically install `ffmpeg`, `ffprobe` (which often comes with ffmpeg), and `fpcalc` (often part of a package like `acoustid-tools` or `chromaprint`) using your system's package manager (e.g., apt, brew, yum).

## Installation

1.  Ensure Deno and the other dependencies (ffmpeg, ffprobe, fpcalc) are installed.
2.  Clone this repository or download the `amusic.ts` script.

## Usage

To use `amusic`, navigate to the directory containing `amusic.ts` and run the script using `deno run`. The script uses subcommands for its different functionalities.

### `acoustid`

This command processes a single audio file to generate and embed its AcousticID fingerprint.

**Syntax:**

```bash
deno run --allow-read --allow-run --allow-write --allow-env amusic.ts acoustid <filePath> [options]
```

-   `--allow-read`: Required to read the audio file and check for system commands.
-   `--allow-run`: Required to execute `ffmpeg`, `ffprobe`, and `fpcalc`.
-   `--allow-write`: Required to write the updated audio file (if tags are added/changed) and create temporary files.
-   `--allow-env`: Required to check for system commands in PATH.
-   `<filePath>`: The path to the audio file you want to process.

**Options:**

-   `-f, --force`: Force recalculation and saving of the AcousticID fingerprint even if existing AcousticID tags are found in the file. Without this flag, files with existing tags will be skipped.

**Examples:**

1.  **Generate and add fingerprint to an audio file:**

    ```bash
    deno run --allow-read --allow-run --allow-write --allow-env amusic.ts acoustid "./path/to/your/music file.mp3"
    ```

2.  **Force overwrite of existing fingerprint:**

    ```bash
    deno run --allow-read --allow-run --allow-write --allow-env amusic.ts acoustid "./path/to/your/music file.flac" --force
    ```

## License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.
