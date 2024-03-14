import * as fs from "node:fs/promises";

export const readFileSafe = async (
  path: string,
  generateTitle: () => string,
) => {
  try {
    const stats = await fs.stat(path);
    if (!stats.isFile()) {
      throw new Error(`${generateTitle()} is not a file.`);
    }
  } catch (e) {
    if (typeof e === "object" && e && "code" in e && e.code === "ENOENT") {
      throw new Error(`${generateTitle()} does not exist.`);
    }
    throw e;
  }
  const content = await fs.readFile(path);
  return content;
};
