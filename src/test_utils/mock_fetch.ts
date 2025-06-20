// Mock implementations for the global fetch function
import { returnsNext, stub } from "jsr:@std/testing/mock";

export interface MockFetchOptions {
  status?: number;
  statusText?: string;
  json?: unknown;
  text?: string;
  headers?: Record<string, string>;
}

/**
 * Creates a mock fetch stub with the specified response
 */
export function createFetchStub(options: MockFetchOptions | Error) {
  if (options instanceof Error) {
    return stub(
      globalThis,
      "fetch",
      returnsNext([Promise.reject(options)]),
    );
  }

  const { status = 200, statusText = "OK", json, text = "", headers = {} } =
    options;

  const response = new Response(
    json !== undefined ? JSON.stringify(json) : text,
    {
      status,
      statusText,
      headers: new Headers(headers),
    },
  );

  return stub(
    globalThis,
    "fetch",
    returnsNext([Promise.resolve(response)]),
  );
}

/**
 * Creates a sequence of mock fetch responses
 */
export function createFetchSequence(responses: (MockFetchOptions | Error)[]) {
  const promises = responses.map((resp) => {
    if (resp instanceof Error) {
      return Promise.reject(resp);
    }

    const { status = 200, statusText = "OK", json, text = "", headers = {} } =
      resp;

    return Promise.resolve(
      new Response(
        json !== undefined ? JSON.stringify(json) : text,
        { status, statusText, headers: new Headers(headers) },
      ),
    );
  });

  return stub(globalThis, "fetch", returnsNext(promises));
}
