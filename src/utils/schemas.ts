import type { KeyObject } from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

import { parsePublicKey } from "./crypto";
import { readFileSafe, rootPath } from "./fs";

export const fileSchema = z.string();
export const existingFileSchema = fileSchema.transform(readFileSafe);
export const thresholdSchema = z.coerce.number().min(2);
export const sharesSchema = z.coerce.number().min(2);
export const newSharesAmountSchema = z.number().min(1).max(10).optional();

export const publicKeyTransform = (
	buffer: Buffer,
	ctx: z.RefinementCtx,
): KeyObject => {
	try {
		return parsePublicKey(buffer);
	} catch (error) {
		if (
			typeof error === "object" &&
			error &&
			"code" in error &&
			error.code === "ERR_OSSL_UNSUPPORTED"
		) {
			ctx.issues.push({
				code: "custom",
				input: buffer,
				message: "Can't read public key, probably data is corrupted.",
			});
		} else {
			ctx.issues.push({
				code: "custom",
				input: buffer,
				message: String(error),
			});
		}
		return z.NEVER;
	}
};
export const localFileTransform = (filename: string, ctx: z.RefinementCtx) => {
	const relativePath = path.relative(rootPath, path.resolve(filename));
	if (relativePath.startsWith("..")) {
		ctx.issues.push({
			code: "custom",
			input: filename,
			message: `Public key only can be written in a current directory.`,
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
				input: filename,
				message: `Public key path should not be a directory.`,
			});
			return z.NEVER;
		}
		return filename;
	} catch {
		return filename;
	}
};
