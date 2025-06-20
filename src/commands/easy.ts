import type { CommandOptions } from "../types/command.ts";
import { easyCommandWithFolderAPI } from "./easy_folder.ts";

export function easyCommand(
  options: CommandOptions,
  library: string,
): Promise<void> {
  // Use the new Folder API version for better performance
  return easyCommandWithFolderAPI(options, library);
}
