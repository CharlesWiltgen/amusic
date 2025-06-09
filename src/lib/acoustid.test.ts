// @ts-nocheck: Complex mocking setup
import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "jsr:@std/assert";
import { returnsNext, stub } from "jsr:@std/testing/mock";
import {
  generateFingerprint,
  hasAcousticIDTags,
  // writeAcousticIDFingerprint, // Replaced by writeAcoustIDTags
  lookupFingerprint,
  writeAcoustIDTags,
} from "./acoustid.ts";
import { parse as parsePath } from "jsr:@std/path";

// Helper to mock Deno.Command
interface MockCommandOutput {
  code: number;
  stdout?: string;
  stderr?: string;
}

class MockDenoCommand {
  static commandMocks: Map<string, MockCommandOutput[]> = new Map();
  private static originalDenoCommand: typeof Deno.Command | null = null;
  public static lastCommandArgs: Map<string, string[]> = new Map(); // Store last args

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
    this.clearLastArgs(); // Clear args at setup

    // deno-lint-ignore no-explicit-any
    Deno.Command = function (command: string, options?: any): Deno.Command {
      const commandBase = parsePath(command).name;
      // Store arguments
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
          // Simulate a short delay, closer to real command execution
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
        outputSync: () => { // Not used by the functions under test but good to have
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
  // Setup and teardown for Deno.Command mocking
  await t.step("Setup Mocks", () => MockDenoCommand.setup());

  // Individual test suites
  await t.step("hasAcousticIDTags", async (tInner) => {
    // These tests remain largely the same, as hasAcousticIDTags functionality hasn't changed.
    await tInner.step("should return true if ffprobe finds tags", async () => {
      MockDenoCommand.addMock("ffprobe", {
        code: 0,
        stdout: "ACOUSTID_FINGERPRINT=somefingerprint\nACOUSTID_ID=someid",
      });
      const result = await hasAcousticIDTags("test.mp3");
      assertEquals(result, true);
    });

    await tInner.step(
      "should return false if ffprobe finds no tags (empty stdout, code 0)",
      async () => {
        MockDenoCommand.addMock("ffprobe", { code: 0, stdout: "" });
        const result = await hasAcousticIDTags("test.mp3");
        assertEquals(result, false);
      },
    );

    // Add more hasAcousticIDTags tests if necessary, or keep as is if comprehensive enough.
    // For brevity, assuming existing tests are sufficient.
    // ... (other hasAcousticIDTags tests from original)
    await tInner.step(
      "should return false if ffprobe finds no tags (empty stdout, code 1, known message)",
      async () => {
        MockDenoCommand.addMock("ffprobe", {
          code: 1,
          stdout: "",
          stderr: "test.mp3: Invalid argument",
        });
        const result = await hasAcousticIDTags("test.mp3");
        assertEquals(result, false);
      },
    );

    await tInner.step(
      "should return false if ffprobe finds no tags (empty stdout, code 1, no stream message)",
      async () => {
        MockDenoCommand.addMock("ffprobe", {
          code: 1,
          stdout: "",
          stderr: "filePath does not contain any stream",
        });
        const result = await hasAcousticIDTags("test.mp3");
        assertEquals(result, false);
      },
    );

    await tInner.step(
      "should return false and log warning on ffprobe error (unexpected)",
      async () => {
        MockDenoCommand.addMock("ffprobe", {
          code: 1, // Or any non-zero other than typical "no tags"
          stderr: "Some other ffprobe error",
        });
        // const consoleWarnStub = stub(console, "warn"); // Original code has this commented out
        try {
          const result = await hasAcousticIDTags("test.mp3");
          assertEquals(result, false);
        } finally {
          // consoleWarnStub.restore();
          MockDenoCommand.commandMocks.set("ffprobe", []);
        }
      },
    );
  });

  await t.step("generateFingerprint", async (tInner) => {
    // These tests remain largely the same.
    await tInner.step(
      "should return fingerprint string on fpcalc success",
      async () => {
        const expectedFingerprint = "dummyfingerprint123";
        MockDenoCommand.addMock("fpcalc", {
          code: 0,
          stdout: `DURATION=180\nFINGERPRINT=${expectedFingerprint}\n`,
        });
        const result = await generateFingerprint("test.mp3");
        assertEquals(result, expectedFingerprint);
      },
    );

    await tInner.step(
      "should return null and log error on fpcalc failure",
      async () => {
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
            "Could not parse fingerprint",
          );
        } finally {
          consoleErrorStub.restore();
          MockDenoCommand.commandMocks.set("fpcalc", []);
        }
      },
    );
  });

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

  await t.step("writeAcoustIDTags", async (tInner) => {
    let makeTempDirStub: ReturnType<typeof stub> | undefined;
    let renameStub: ReturnType<typeof stub> | undefined;
    let removeStub: ReturnType<typeof stub> | undefined;
    let consoleErrorStub: ReturnType<typeof stub> | undefined;
    const tempDirName = "/tmp/fake_temp_dir_amusic_tagger_XYZ"; // Unique name
    const inputFilePath = "testfile.ogg"; // Different extension for variety
    const fingerprint = "testFP123abc";
    const acoustID = "acoustID_UUID_here";

    const resetWriteStubsAndMocks = () => {
      if (makeTempDirStub) {
        makeTempDirStub.restore();
        makeTempDirStub = undefined;
      }
      if (renameStub) {
        renameStub.restore();
        renameStub = undefined;
      }
      if (removeStub) {
        removeStub.restore();
        removeStub = undefined;
      }
      if (consoleErrorStub) {
        consoleErrorStub.restore();
        consoleErrorStub = undefined;
      }
      MockDenoCommand.commandMocks.set("ffmpeg", []); // Clear ffmpeg specific mocks
      // Stub ffprobe to return empty tags so writeAcoustIDTags can reapply none
      MockDenoCommand.commandMocks.set(
        "ffprobe",
        [{ code: 0, stdout: '{"format":{"tags":{}}}' }],
      );
      MockDenoCommand.clearLastArgs(); // Clear stored arguments
    };

    await tInner.step(
      "should return true, call ffmpeg with both tags, and cleanup",
      async () => {
        resetWriteStubsAndMocks();
        makeTempDirStub = stub(
          Deno,
          "makeTempDir",
          returnsNext([tempDirName]),
        );
        renameStub = stub(Deno, "rename", returnsNext([Promise.resolve()]));
        removeStub = stub(Deno, "remove", returnsNext([Promise.resolve()]));
        MockDenoCommand.addMock("ffmpeg", { code: 0 });

        const result = await writeAcoustIDTags(
          inputFilePath,
          fingerprint,
          acoustID,
        );

        assertEquals(result, true);
        assertEquals(makeTempDirStub.calls.length, 1);
        const ffmpegArgs = MockDenoCommand.getLastArgs("ffmpeg");
        assertExists(ffmpegArgs);
        assertStringIncludes(
          ffmpegArgs!.join(" "),
          `ACOUSTID_FINGERPRINT=${fingerprint}`,
        );
        assertStringIncludes(ffmpegArgs!.join(" "), `ACOUSTID_ID=${acoustID}`);
        assertStringIncludes(ffmpegArgs!.join(" "), `-i ${inputFilePath}`);
        assertStringIncludes(
          ffmpegArgs!.join(" "),
          `${tempDirName}/${parsePath(inputFilePath).name}_tagged${
            parsePath(inputFilePath).ext
          }`,
        );
        assertEquals(renameStub.calls.length, 1);
        assertEquals(removeStub.calls.length, 1);
        assertEquals(removeStub.calls[0].args[0], tempDirName);
        resetWriteStubsAndMocks();
      },
    );

    await tInner.step(
      "should return false on ffmpeg failure, log error, and cleanup",
      async () => {
        resetWriteStubsAndMocks();
        makeTempDirStub = stub(
          Deno,
          "makeTempDir",
          returnsNext([tempDirName]),
        );
        removeStub = stub(Deno, "remove", returnsNext([Promise.resolve()]));
        consoleErrorStub = stub(console, "error");
        MockDenoCommand.addMock("ffmpeg", {
          code: 1,
          stderr: "ffmpeg major failure",
        });

        const result = await writeAcoustIDTags(
          inputFilePath,
          fingerprint,
          acoustID,
        );

        assertEquals(result, false);
        assertEquals(makeTempDirStub.calls.length, 1);
        assertEquals(consoleErrorStub.calls.length, 1);
        assertStringIncludes(
          consoleErrorStub.calls[0].args[0],
          "ffmpeg error: ffmpeg major failure",
        );
        assertEquals(removeStub.calls.length, 1);
        assertEquals(removeStub.calls[0].args[0], tempDirName);
        resetWriteStubsAndMocks();
      },
    );

    await tInner.step(
      "should return false if rename fails, log error, and cleanup",
      async () => {
        resetWriteStubsAndMocks();
        makeTempDirStub = stub(
          Deno,
          "makeTempDir",
          returnsNext([tempDirName]),
        );
        renameStub = stub(
          Deno,
          "rename",
          returnsNext([Promise.reject(new Error("custom rename error"))]),
        );
        removeStub = stub(Deno, "remove", returnsNext([Promise.resolve()]));
        consoleErrorStub = stub(console, "error");
        MockDenoCommand.addMock("ffmpeg", { code: 0 }); // ffmpeg succeeds

        const result = await writeAcoustIDTags(
          inputFilePath,
          fingerprint,
          acoustID,
        );

        assertEquals(result, false);
        assertEquals(makeTempDirStub.calls.length, 1);
        assertEquals(renameStub.calls.length, 1);
        assertEquals(consoleErrorStub.calls.length, 1);
        assertStringIncludes(
          consoleErrorStub.calls[0].args[0],
          "Error replacing original file",
        );
        assertStringIncludes(
          consoleErrorStub.calls[0].args[0],
          "custom rename error",
        );
        assertEquals(removeStub.calls.length, 1);
        assertEquals(removeStub.calls[0].args[0], tempDirName);
        resetWriteStubsAndMocks();
      },
    );

    // Optional: Test for Deno.remove failure during cleanup (similar to original)
    await tInner.step("should warn if tempDir removal fails", async () => {
      resetWriteStubsAndMocks();
      makeTempDirStub = stub(Deno, "makeTempDir", returnsNext([tempDirName]));
      MockDenoCommand.addMock("ffmpeg", { code: 1, stderr: "ffmpeg error" }); // ffmpeg fails
      removeStub = stub(
        Deno,
        "remove",
        returnsNext([Promise.reject(new Error("temp dir remove failed"))]),
      );
      consoleErrorStub = stub(console, "error"); // For ffmpeg
      const consoleWarnStub = stub(console, "warn"); // For Deno.remove

      const result = await writeAcoustIDTags(
        inputFilePath,
        fingerprint,
        acoustID,
      );
      assertEquals(result, false);
      assertEquals(consoleWarnStub.calls.length, 1);
      assertStringIncludes(
        consoleWarnStub.calls[0].args[0],
        `Could not remove temp dir ${tempDirName}`,
      );

      consoleWarnStub.restore();
      resetWriteStubsAndMocks();
    });
  });

  // No direct tests for processAcoustIDTagging yet based on original structure.
  // If added, they would go here, likely mocking generateFingerprint, lookupFingerprint, and writeAcoustIDTags.

  await t.step("Restore Mocks", () => {
    MockDenoCommand.restore();
  });
});
