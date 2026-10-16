import fs from "node:fs/promises";

import { expect, test } from "vitest";

import { existingFileSchema } from "~/utils/schemas";
import { mapArgErrors, validate } from "~/utils/validation";

test("argument errors format structured path segments by their keys", () => {
	expect(
		mapArgErrors([
			{
				message: "Invalid value",
				path: ["shares", { key: 2 }, { key: Symbol("id") }],
			},
		]),
	).toBe('Arg "shares.2.Symbol(id)" error: Invalid value');
});

test("file validation preserves errors other than a missing file", async () => {
	await fs.mkdir("dir", { recursive: true });
	await fs.writeFile("dir/file", "data");
	await expect(validate(existingFileSchema, "dir/file/child")).rejects.toThrow(
		"ENOTDIR",
	);
});
