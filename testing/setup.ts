import fs from "node:fs/promises";

import { cleanup } from "ink-testing-library";
import { act } from "react";
import { afterEach, vi } from "vitest";

Object.assign(globalThis, { IS_REACT_ACT_ENVIRONMENT: true });

vi.mock(import("node:fs"));
vi.mock(import("node:fs/promises"));

afterEach(async () => {
	// oxlint-disable-next-line typescript/require-await
	await act(async () => cleanup());
	await fs.rm("/", { force: true, recursive: true });
});
