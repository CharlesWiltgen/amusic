export type SkipReason =
  | "already_m4a"
  | "lossy_format"
  | "output_exists";

export class EncodingStats {
  private counts = {
    processed: 0,
    failed: 0,
    skipReasons: {
      already_m4a: 0,
      lossy_format: 0,
      output_exists: 0,
    },
  };

  incrementSuccess(): void {
    this.counts.processed++;
  }

  incrementFailed(): void {
    this.counts.failed++;
  }

  incrementSkipped(reason: SkipReason): void {
    this.counts.skipReasons[reason]++;
  }

  get totalSkipped(): number {
    return Object.values(this.counts.skipReasons).reduce(
      (sum, count) => sum + count,
      0,
    );
  }

  printSummary(title: string = "Encoding Complete", isDryRun = false): void {
    console.log(`\n--- ${title} ---`);
    console.log(`Successfully encoded: ${this.counts.processed}`);

    // Show detailed skip breakdown
    const skipped = this.totalSkipped;
    if (skipped > 0) {
      console.log(`Files skipped: ${skipped}`);

      if (this.counts.skipReasons.already_m4a > 0) {
        console.log(
          `  Already M4A format: ${this.counts.skipReasons.already_m4a}`,
        );
      }
      if (this.counts.skipReasons.lossy_format > 0) {
        console.log(
          `  Lossy format (use --force-lossy-transcodes): ${this.counts.skipReasons.lossy_format}`,
        );
      }
      if (this.counts.skipReasons.output_exists > 0) {
        console.log(
          `  Output already exists: ${this.counts.skipReasons.output_exists}`,
        );
      }
    } else {
      console.log(`Files skipped: 0`);
    }

    console.log(`Failed: ${this.counts.failed}`);
    console.log("-------------------------");

    if (isDryRun) {
      console.log("\nNOTE: This was a dry run. No files were modified.");
    }
  }
}
