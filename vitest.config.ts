import type { CoverageReporter } from "vitest/node";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    watch: false,
    coverage: {
      all: true,
      enabled: true,
      reporter: [
        ...(configDefaults.coverage.reporter as CoverageReporter[]),
        "json-summary",
      ],
    },
    setupFiles: "setup.ts",
  },
});
