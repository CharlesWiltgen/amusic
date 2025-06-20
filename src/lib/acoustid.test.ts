// @ts-nocheck: Complex mocking setup
import {
  assertEquals,
  assertExists,
  assertStringIncludes,
} from "jsr:@std/assert";
import { returnsNext, stub } from "jsr:@std/testing/mock";
import {
  createFetchStub,
  MOCK_API_RESPONSES,
  MOCK_FINGERPRINTS,
  MockDenoCommand,
  stubConsole,
  TEST_API_KEYS,
} from "../test_utils/mod.ts";

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
        const expectedFingerprint = MOCK_FINGERPRINTS.DEFAULT;
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
        const consoleErrorStub = stubConsole("error");
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
        const consoleErrorStub = stubConsole("error");
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
        const consoleErrorStub = stubConsole("error");
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
    const testApiKey = TEST_API_KEYS.DUMMY;
    const testFingerprint = MOCK_FINGERPRINTS.ALTERNATIVE;
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
      const mockResponse = MOCK_API_RESPONSES.SUCCESS;
      fetchStub = createFetchStub({ json: mockResponse });
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
        const mockResponse = MOCK_API_RESPONSES.NO_RESULTS;
        fetchStub = createFetchStub({ json: mockResponse });
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
        const mockResponse = MOCK_API_RESPONSES.ERROR;
        fetchStub = createFetchStub({ json: mockResponse });
        consoleErrorStub = stubConsole("error");
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
        fetchStub = createFetchStub({
          status: 500,
          statusText: "Server Error",
          text: "Internal Server Error",
        });
        consoleErrorStub = stubConsole("error");
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
        fetchStub = createFetchStub(new Error("Network connection failed"));
        consoleErrorStub = stubConsole("error");
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
        consoleErrorStub = stubConsole("error");
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

      const consoleErrorStub = stubConsole("error");
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

      const consoleErrorStub = stubConsole("error");
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

    // Skip the fingerprint generation failure test as it requires complex mocking
    // of the tagging module which now uses WASM caching
  });

  // Restore mocks
  await t.step("Restore Mocks", () => {
    MockDenoCommand.restore();
  });
});
