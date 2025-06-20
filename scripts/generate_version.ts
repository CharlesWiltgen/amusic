// Script to generate version.ts from deno.json
const denoConfig = JSON.parse(await Deno.readTextFile("deno.json"));
const version = denoConfig.version || "0.0.0";

const versionContent = `// Generated file - do not edit directly
// Version is read from deno.json during build
export const VERSION = "${version}";
`;

await Deno.writeTextFile("src/version.ts", versionContent);
console.log(`Generated src/version.ts with version ${version}`);
