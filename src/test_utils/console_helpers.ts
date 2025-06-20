// Console mocking helpers for tests
import { stub } from "jsr:@std/testing/mock";

export interface ConsoleCapture {
  logs: string[];
  errors: string[];
  warns: string[];
  // deno-lint-ignore no-explicit-any
  logStub: any;
  // deno-lint-ignore no-explicit-any
  errorStub: any;
  // deno-lint-ignore no-explicit-any
  warnStub: any;
}

/**
 * Captures console output and returns stubs and captured messages
 */
export function captureConsole(): ConsoleCapture {
  const logs: string[] = [];
  const errors: string[] = [];
  const warns: string[] = [];

  const logStub = stub(console, "log", (...args: unknown[]) => {
    logs.push(args.map(String).join(" "));
  });

  const errorStub = stub(console, "error", (...args: unknown[]) => {
    errors.push(args.map(String).join(" "));
  });

  const warnStub = stub(console, "warn", (...args: unknown[]) => {
    warns.push(args.map(String).join(" "));
  });

  return {
    logs,
    errors,
    warns,
    logStub,
    errorStub,
    warnStub,
  };
}

/**
 * Restores console methods from a ConsoleCapture
 */
export function restoreConsole(capture: ConsoleCapture): void {
  capture.logStub.restore();
  capture.errorStub.restore();
  capture.warnStub.restore();
}

/**
 * Creates a simple console stub that doesn't capture output
 */
export function stubConsole(method: "log" | "error" | "warn" = "log") {
  return stub(console, method);
}
