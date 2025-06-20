// Mock implementation for Deno.Command used across tests
import { parse as parsePath } from "jsr:@std/path";

export interface MockCommandOutput {
  code: number;
  stdout?: string;
  stderr?: string;
}

export class MockDenoCommand {
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
    this.clearLastArgs();
  }
}
