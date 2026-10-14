import fs from "node:fs/promises";

import { afterEach, vi } from "vitest";

vi.mock("node:fs");
vi.mock("node:fs/promises");

afterEach(async () => {
	await fs.rm("/", { recursive: true, force: true });
});
