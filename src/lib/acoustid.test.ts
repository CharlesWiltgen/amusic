// @ts-nocheck: Complex mocking setup
import {
  assert,
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "jsr:@std/assert";
import { returnsNext, stub } from "jsr:@std/testing/mock";
import { parse as parsePath } from "jsr:@std/path";

// Helper to mock Deno.Command for fpcalc
interface MockCommandOutput {
  code: number;
  stdout?: string;
  stderr?: string;
}

class MockDenoCommand {
  static commandMocks: Map<string, MockCommandOutput[]> = new Map();
  private static originalDenoCommand: typeof Deno.Command | null = null;
  public static lastCommandArgs: Map<string, string[]> = new Map();

  static addMock(commandName: string, output: MockCommandOutput) {
    const mocks = this.commandMocks.get(commandName) || [];
    mocks.push(output);
    this.commandMocks.set(commandName, mocks);
  }

  static clearLastArgs() {
    this.lastCommandArgs.clear();
  }

  static getLastArgs(commandName: string): string[] | undefined {
    return this.lastCommandArgs.get(commandName);
  }

  static setup() {
    if (this.originalDenoCommand === null) {
      this.originalDenoCommand = Deno.Command;
    }
    this.clearLastArgs();

    // deno-lint-ignore no-explicit-any
    Deno.Command = function (command: string, options?: any): Deno.Command {
      const commandBase = parsePath(command).name;
      MockDenoCommand.lastCommandArgs.set(commandBase, options?.args || []);

      const mockOutputs = MockDenoCommand.commandMocks.get(commandBase);
      if (!mockOutputs || mockOutputs.length === 0) {
        throw new Error(
          `No mock output provided for command: ${commandBase} (full: ${command})`,
        );
      }
      const nextOutput = mockOutputs.shift()!;

      return {
        output: async () => {
          await new Promise((resolve) => setTimeout(resolve, 0));
          return Promise.resolve({
            code: nextOutput.code,
            stdout: nextOutput.stdout
              ? new TextEncoder().encode(nextOutput.stdout)
              : new Uint8Array(),
            stderr: nextOutput.stderr
              ? new TextEncoder().encode(nextOutput.stderr)
              : new Uint8Array(),
            success: nextOutput.code === 0,
            signal: null,
          });
        },
        outputSync: () => {
          return {
            code: nextOutput.code,
            stdout: nextOutput.stdout
              ? new TextEncoder().encode(nextOutput.stdout)
              : new Uint8Array(),
            stderr: nextOutput.stderr
              ? new TextEncoder().encode(nextOutput.stderr)
              : new Uint8Array(),
            success: nextOutput.code === 0,
            signal: null,
          };
        },
        spawn: () => {
          throw new Error("spawn not implemented in mock");
        },
        stdin: {
          getWriter: () => {
            throw new Error("stdin.getWriter not implemented in mock");
          },
        },
        stdout: { readable: new ReadableStream() },
        stderr: { readable: new ReadableStream() },
        pid: 1234,
        status: Promise.resolve({ success: true, code: 0, signal: null }),
        kill: () => {},
      } as unknown as Deno.Command;
    } as unknown as typeof Deno.Command;
  }

  static restore() {
    if (this.originalDenoCommand) {
      Deno.Command = this.originalDenoCommand;
      this.originalDenoCommand = null;
    }
    this.commandMocks.clear();
  }
}

// --- Test Suites ---
Deno.test("Acoustid Tests", async (t) => {
  // Setup mocks
  await t.step("Setup Mocks", () => {
    MockDenoCommand.setup();
  });

  // Test generateFingerprint directly from acoustid module
  await t.step("generateFingerprint", async (tInner) => {
    await tInner.step(
      "should return fingerprint string on fpcalc success",
      async () => {
        const { generateFingerprint } = await import("./acoustid.ts");
        const expectedFingerprint = "dummyfingerprint123";
        MockDenoCommand.addMock("fpcalc", {
          code: 0,
          stdout: JSON.stringify({
            duration: 180,
            fingerprint: expectedFingerprint,
          }),
        });
        const result = await generateFingerprint("test.mp3");
        assertEquals(result, expectedFingerprint);

        // Check that -json flag was used
        const args = MockDenoCommand.getLastArgs("fpcalc");
        assertExists(args);
        assertEquals(args[0], "-json");
      },
    );

    await tInner.step(
      "should return null and log error on fpcalc failure",
      async () => {
        const { generateFingerprint } = await import("./acoustid.ts");
        MockDenoCommand.addMock("fpcalc", {
          code: 1,
          stderr: "fpcalc failed miserably",
        });
        const consoleErrorStub = stub(console, "error");
        try {
          const result = await generateFingerprint("test.mp3");
          assertEquals(result, null);
          assertEquals(consoleErrorStub.calls.length, 1);
          assertStringIncludes(
            consoleErrorStub.calls[0].args[0],
            "fpcalc error: fpcalc failed miserably",
          );
        } finally {
          consoleErrorStub.restore();
          MockDenoCommand.commandMocks.set("fpcalc", []);
        }
      },
    );

    await tInner.step(
      "should return null and log error on malformed fpcalc output",
      async () => {
        const { generateFingerprint } = await import("./acoustid.ts");
        MockDenoCommand.addMock("fpcalc", {
          code: 0,
          stdout: "WRONG_OUTPUT_FORMAT",
        });
        const consoleErrorStub = stub(console, "error");
        try {
          const result = await generateFingerprint("test.mp3");
          assertEquals(result, null);
          assertEquals(consoleErrorStub.calls.length, 1);
          assertStringIncludes(
            consoleErrorStub.calls[0].args[0],
            "Could not parse fpcalc JSON output:",
          );
        } finally {
          consoleErrorStub.restore();
          MockDenoCommand.commandMocks.set("fpcalc", []);
        }
      },
    );

    await tInner.step(
      "should return null if JSON is valid but fingerprint is missing",
      async () => {
        const { generateFingerprint } = await import("./acoustid.ts");
        MockDenoCommand.addMock("fpcalc", {
          code: 0,
          stdout: JSON.stringify({
            duration: 180,
            // fingerprint is missing
          }),
        });
        const consoleErrorStub = stub(console, "error");
        try {
          const result = await generateFingerprint("test.mp3");
          assertEquals(result, null);
          assertEquals(consoleErrorStub.calls.length, 1);
          assertStringIncludes(
            consoleErrorStub.calls[0].args[0],
            "No fingerprint found in fpcalc JSON output",
          );
        } finally {
          consoleErrorStub.restore();
          MockDenoCommand.commandMocks.set("fpcalc", []);
        }
      },
    );
  });

  // Test lookupFingerprint
  await t.step("lookupFingerprint", async (tInner) => {
    let fetchStub: ReturnType<typeof stub> | undefined;
    let consoleErrorStub: ReturnType<typeof stub> | undefined;
    const testApiKey = "testkey";
    const testFingerprint = "testfp";
    const testDuration = 180;

    const resetLookupStubs = () => {
      if (fetchStub) {
        fetchStub.restore();
        fetchStub = undefined;
      }
      if (consoleErrorStub) {
        consoleErrorStub.restore();
        consoleErrorStub = undefined;
      }
    };

    await tInner.step("should return parsed data on API success", async () => {
      const { lookupFingerprint } = await import("./acoustid.ts");
      resetLookupStubs();
      const mockResponse = {
        status: "ok",
        results: [{ id: "uuid1", score: 0.95 }],
      };
      fetchStub = stub(
        globalThis,
        "fetch",
        returnsNext([
          Promise.resolve(
            new Response(JSON.stringify(mockResponse), { status: 200 }),
          ),
        ]),
      );
      const result = await lookupFingerprint(
        testFingerprint,
        testDuration,
        testApiKey,
      );
      assertEquals(result, mockResponse);
      assertEquals(fetchStub.calls.length, 1);
      const url = fetchStub.calls[0].args[0] as string;
      assertStringIncludes(url, `client=${testApiKey}`);
      assertStringIncludes(url, `duration=${testDuration}`);
      assertStringIncludes(url, `fingerprint=${testFingerprint}`);
      resetLookupStubs();
    });

    await tInner.step(
      "should return {results: []} when API returns no results",
      async () => {
        const { lookupFingerprint } = await import("./acoustid.ts");
        resetLookupStubs();
        const mockResponse = { status: "ok", results: [] };
        fetchStub = stub(
          globalThis,
          "fetch",
          returnsNext([
            Promise.resolve(
              new Response(JSON.stringify(mockResponse), { status: 200 }),
            ),
          ]),
        );
        const result = await lookupFingerprint(
          testFingerprint,
          testDuration,
          testApiKey,
        );
        assertEquals(result, { results: [] });
        assertEquals(fetchStub.calls.length, 1);
        resetLookupStubs();
      },
    );

    await tInner.step(
      "should return null and log on API error (JSON status error)",
      async () => {
        const { lookupFingerprint } = await import("./acoustid.ts");
        resetLookupStubs();
        const mockResponse = {
          status: "error",
          error: { message: "Invalid API key" },
        };
        fetchStub = stub(
          globalThis,
          "fetch",
          returnsNext([
            Promise.resolve(
              new Response(JSON.stringify(mockResponse), { status: 200 }),
            ),
          ]),
        );
        consoleErrorStub = stub(console, "error");
        const result = await lookupFingerprint(
          testFingerprint,
          testDuration,
          testApiKey,
        );
        assertEquals(result, null);
        assertEquals(fetchStub.calls.length, 1);
        assertEquals(consoleErrorStub.calls.length, 1);
        assertStringIncludes(
          consoleErrorStub.calls[0].args[0],
          "AcoustID API returned error: Invalid API key",
        );
        resetLookupStubs();
      },
    );

    await tInner.step(
      "should return null and log on API error (HTTP error)",
      async () => {
        const { lookupFingerprint } = await import("./acoustid.ts");
        resetLookupStubs();
        fetchStub = stub(
          globalThis,
          "fetch",
          returnsNext([
            Promise.resolve(
              new Response("Internal Server Error", {
                status: 500,
                statusText: "Server Error",
              }),
            ),
          ]),
        );
        consoleErrorStub = stub(console, "error");
        const result = await lookupFingerprint(
          testFingerprint,
          testDuration,
          testApiKey,
        );
        assertEquals(result, null);
        assertEquals(fetchStub.calls.length, 1);
        assertEquals(consoleErrorStub.calls.length, 1);
        assertStringIncludes(
          consoleErrorStub.calls[0].args[0],
          "AcoustID API error: 500 Server Error",
        );
        resetLookupStubs();
      },
    );

    await tInner.step(
      "should return null and log on network error",
      async () => {
        const { lookupFingerprint } = await import("./acoustid.ts");
        resetLookupStubs();
        fetchStub = stub(
          globalThis,
          "fetch",
          returnsNext([
            Promise.reject(new Error("Network connection failed")),
          ]),
        );
        consoleErrorStub = stub(console, "error");
        const result = await lookupFingerprint(
          testFingerprint,
          testDuration,
          testApiKey,
        );
        assertEquals(result, null);
        assertEquals(fetchStub.calls.length, 1);
        assertEquals(consoleErrorStub.calls.length, 1);
        assertStringIncludes(
          consoleErrorStub.calls[0].args[0],
          "Error during AcoustID API request: Network connection failed",
        );
        resetLookupStubs();
      },
    );

    await tInner.step(
      "should return null and log if API key is missing",
      async () => {
        const { lookupFingerprint } = await import("./acoustid.ts");
        resetLookupStubs();
        consoleErrorStub = stub(console, "error");
        const result = await lookupFingerprint(
          testFingerprint,
          testDuration,
          "",
        ); // Empty API key
        assertEquals(result, null);
        assertEquals(consoleErrorStub.calls.length, 1);
        assertStringIncludes(
          consoleErrorStub.calls[0].args[0],
          "AcoustID API key is required",
        );
        resetLookupStubs();
      },
    );
  });

  // Test processAcoustIDTagging integration with minimal mocking
  await t.step("processAcoustIDTagging", async (tInner) => {
    await tInner.step("should handle file not found", async () => {
      const { processAcoustIDTagging } = await import("./acoustid.ts");
      const statStub = stub(
        Deno,
        "stat",
        returnsNext([
          Promise.reject(new Error("File not found")),
        ]),
      );

      const consoleErrorStub = stub(console, "error");
      try {
        const result = await processAcoustIDTagging(
          "nonexistent.mp3",
          "apikey123",
          false,
          true, // quiet
          false,
        );

        assertEquals(result, "failed");
        assertEquals(consoleErrorStub.calls.length, 1);
        assertStringIncludes(
          consoleErrorStub.calls[0].args[0],
          "File not found",
        );
      } finally {
        statStub.restore();
        consoleErrorStub.restore();
      }
    });

    await tInner.step("should handle non-file path", async () => {
      const { processAcoustIDTagging } = await import("./acoustid.ts");
      const statStub = stub(
        Deno,
        "stat",
        returnsNext([
          Promise.resolve({ isFile: false } as Deno.FileInfo),
        ]),
      );

      const consoleErrorStub = stub(console, "error");
      try {
        const result = await processAcoustIDTagging(
          "somedir",
          "apikey123",
          false,
          true, // quiet
          false,
        );

        assertEquals(result, "failed");
        assertEquals(consoleErrorStub.calls.length, 1);
        assertStringIncludes(
          consoleErrorStub.calls[0].args[0],
          'Path "somedir" is not a file',
        );
      } finally {
        statStub.restore();
        consoleErrorStub.restore();
      }
    });

    await tInner.step(
      "should handle fingerprint generation failure",
      async () => {
        const { processAcoustIDTagging } = await import("./acoustid.ts");
        const statStub = stub(
          Deno,
          "stat",
          returnsNext([
            Promise.resolve({ isFile: true } as Deno.FileInfo),
          ]),
        );

        // Mock hasAcoustIDTags by mocking getAcoustIDTags
        const readFileStub = stub(
          Deno,
          "readFile",
          returnsNext([
            Promise.resolve(new Uint8Array([0, 1, 2, 3])), // For hasAcoustIDTags check
            Promise.resolve(new Uint8Array([0, 1, 2, 3])), // For any other read
          ]),
        );

        // Mock fpcalc failure
        MockDenoCommand.addMock("fpcalc", {
          code: 1,
          stderr: "fpcalc error",
        });

        const consoleErrorStub = stub(console, "error");
        const consoleLogStub = stub(console, "log");
        try {
          const result = await processAcoustIDTagging(
            "test.mp3",
            "apikey123",
            false,
            false, // not quiet
            false,
          );

          assertEquals(result, "failed");
          // Should have errors from fpcalc and from the main function
          assert(consoleErrorStub.calls.length >= 1);
          // Should log that fingerprint generation failed
          const logCalls = consoleLogStub.calls.map((c) => c.args[0]);
          assert(
            logCalls.some((msg) =>
              msg.includes("WARNING: Could not generate fingerprint")
            ),
          );
        } finally {
          statStub.restore();
          readFileStub.restore();
          consoleErrorStub.restore();
          consoleLogStub.restore();
        }
      },
    );
  });

  // Restore mocks
  await t.step("Restore Mocks", () => {
    MockDenoCommand.restore();
  });
});
