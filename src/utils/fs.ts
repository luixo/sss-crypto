import fs from "node:fs/promises";
import path from "node:path";

import { z } from "zod";

export const rootPath = path.resolve(
	path.dirname(new URL(import.meta.url).pathname),
	"../..",
);

export const readFileSafe = async (filename: string, ctx: z.RefinementCtx) => {
	try {
		const stats = await fs.stat(filename);
		if (!stats.isFile()) {
			ctx.issues.push({
				code: "custom",
				input: filename,
				message: `File "${filename}" is not a file.`,
			});
			return z.NEVER;
		}
	} catch (error) {
		ctx.issues.push({
			code: "custom",
			input: filename,
			message:
				typeof error === "object" &&
				error &&
				"code" in error &&
				error.code === "ENOENT"
					? `Path "${filename}" does not exist.`
					: String(error),
		});
		return z.NEVER;
	}
	return fs.readFile(filename);
};
