import { expect, test } from "vitest";

import { mapArgErrors } from "~/utils/validation";

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
