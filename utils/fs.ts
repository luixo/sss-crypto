import fs from "node:fs/promises";
import path from "node:path";
import z from "zod";

export const rootPath = path.resolve(
  path.dirname(new URL(import.meta.url).pathname),
  "..",
);

export const readFileSafe = async (filename: string, ctx: z.RefinementCtx) => {
  try {
    const stats = await fs.stat(filename);
    if (!stats.isFile()) {
      ctx.issues.push({
        code: "custom",
        message: `File "${filename}" is not a file.`,
        input: filename,
      });
      return z.NEVER;
    }
  } catch (e) {
    ctx.issues.push({
      code: "custom",
      message:
        typeof e === "object" && e && "code" in e && e.code === "ENOENT"
          ? /* c8 ignore next 2 */
            `Path "${filename}" does not exist.`
          : String(e),
      input: filename,
    });
    return z.NEVER;
  }
  return fs.readFile(filename);
};
