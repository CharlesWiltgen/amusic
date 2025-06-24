export class EncodingSpinner {
  private totalFiles: number;
  private completedFiles: number;
  private intervalId: number | null = null;
  private spinnerFrames = ["⠋", "⠙", "⠹", "⠸", "⠼", "⠴", "⠦", "⠧", "⠇", "⠏"];
  private currentFrame = 0;

  constructor(totalFiles: number) {
    this.totalFiles = totalFiles;
    this.completedFiles = 0;
  }

  start(): void {
    if (this.intervalId) return;

    // Hide cursor
    Deno.stdout.writeSync(new TextEncoder().encode("\x1b[?25l"));

    this.intervalId = setInterval(() => {
      this.render();
    }, 80);
    this.render();
  }

  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }

    // Clear the spinner line and show cursor
    Deno.stdout.writeSync(new TextEncoder().encode("\r\x1b[K\x1b[?25h"));
  }

  incrementCompleted(): void {
    this.completedFiles++;
  }

  private render(): void {
    const frame = this.spinnerFrames[this.currentFrame];
    this.currentFrame = (this.currentFrame + 1) % this.spinnerFrames.length;

    const message =
      `${frame} Encoding... (${this.completedFiles}/${this.totalFiles} complete)`;

    // Clear line and write new message
    Deno.stdout.writeSync(new TextEncoder().encode(`\r\x1b[K${message}`));
  }
}
