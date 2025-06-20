export type ProcessingStatus =
  | "processed"
  | "skipped"
  | "failed"
  | "lookup_failed"
  | "no_results";

export class ProcessingStats {
  private counts: Record<string, number> = {
    processed: 0,
    skipped: 0,
    failed: 0,
    lookupFailed: 0,
    noResults: 0,
  };

  increment(status: ProcessingStatus): void {
    switch (status) {
      case "processed":
        this.counts.processed++;
        break;
      case "skipped":
        this.counts.skipped++;
        break;
      case "failed":
        this.counts.failed++;
        break;
      case "lookup_failed":
        this.counts.lookupFailed++;
        break;
      case "no_results":
        this.counts.noResults++;
        break;
    }
  }

  incrementSuccess(): void {
    this.counts.processed++;
  }

  incrementSkipped(): void {
    this.counts.skipped++;
  }

  incrementFailed(): void {
    this.counts.failed++;
  }

  printSummary(title: string = "Processing Complete", isDryRun = false): void {
    console.log(`\n--- ${title} ---`);

    if (title.includes("Easy Mode")) {
      console.log(`Files processed: ${this.counts.processed}`);
      console.log(`Skipped (already tagged): ${this.counts.skipped}`);
      console.log(`No AcoustID results found: ${this.counts.noResults}`);
      console.log(`AcoustID lookup failed: ${this.counts.lookupFailed}`);
      console.log(`Other failures: ${this.counts.failed}`);
    } else if (title.includes("Encoding")) {
      console.log(`Successfully encoded: ${this.counts.processed}`);
      console.log(`Skipped: ${this.counts.skipped}`);
      console.log(`Failed: ${this.counts.failed}`);
      console.log("-------------------------");
    } else {
      console.log(`Successfully processed: ${this.counts.processed}`);
      console.log(
        `Skipped (already tagged/force not used): ${this.counts.skipped}`,
      );
      console.log(`No AcoustID results found: ${this.counts.noResults}`);
      console.log(
        `AcoustID lookup failed (API/network issues): ${this.counts.lookupFailed}`,
      );
      console.log(
        `Other failures (e.g., file access, fpcalc): ${this.counts.failed}`,
      );
      console.log("---------------------------");
    }

    if (isDryRun) {
      console.log("\nNOTE: This was a dry run. No files were modified.");
    }
  }
}
