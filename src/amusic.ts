import { setupCLI } from "./cli/cli.ts";

if (import.meta.main) {
  const program = setupCLI();
  await program.parse(Deno.args);
}
