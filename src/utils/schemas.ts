import z from "zod";
import type { KeyObject } from "node:crypto";
import fs from "node:fs/promises";

import path from "node:path";
import { readFileSafe, rootPath } from "./fs";
import { parsePublicKey } from "./crypto";

export const fileSchema = z.string();
export const existingFileSchema = fileSchema.transform(readFileSafe);
export const thresholdSchema = z.coerce.number().min(2);
export const sharesSchema = z.coerce.number().min(2);
export const newSharesAmountSchema = z.number().min(1).max(10).optional();

export const publicKeyTransform = async (
  buffer: Buffer,
  ctx: z.RefinementCtx,
): Promise<KeyObject> => {
  try {
    return parsePublicKey(buffer);
  } catch (e) {
    if (
      typeof e === "object" &&
      e &&
      "code" in e &&
      e.code === "ERR_OSSL_UNSUPPORTED"
    ) {
      ctx.issues.push({
        code: "custom",
        message: "Can't read public key, probably data is corrupted.",
        input: buffer,
      });
      /* c8 ignore next 7 */
    } else {
      ctx.issues.push({
        code: "custom",
        message: String(e),
        input: buffer,
      });
    }
    return z.NEVER;
  }
};
export const localFileTransform = async (
  filename: string,
  ctx: z.RefinementCtx,
) => {
  const relativePath = path.relative(rootPath, path.resolve(filename));
  if (relativePath.startsWith("..")) {
    ctx.issues.push({
      code: "custom",
      message: `Public key only can be written in a current directory.`,
      input: filename,
    });
    return z.NEVER;
  }
  return filename;
};
export const notDirectoryTransform = async (
  filename: string,
  ctx: z.RefinementCtx,
) => {
  const relativePath = path.relative(rootPath, path.resolve(filename));
  try {
    const stats = await fs.stat(relativePath);
    if (stats.isDirectory()) {
      ctx.issues.push({
        code: "custom",
        message: `Public key path should not be a directory.`,
        input: filename,
      });
      return z.NEVER;
    }
    return filename;
  } catch {
    return filename;
  }
};
