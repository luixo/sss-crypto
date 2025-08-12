import { afterEach, vi } from "vitest";
import fs from "node:fs/promises";

vi.mock("node:fs");
vi.mock("node:fs/promises");

afterEach(async () => {
  await fs.rm("/", { recursive: true, force: true });
});
