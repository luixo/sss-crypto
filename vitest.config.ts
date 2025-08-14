import type { CoverageReporter } from "vitest/node";
import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    watch: false,
    coverage: {
      exclude: [
        ...(configDefaults.coverage.exclude ?? []),
        "__mocks__",
        "testing",
      ],
      all: true,
      enabled: true,
      reporter: [
        ...(configDefaults.coverage.reporter as CoverageReporter[]),
        "json-summary",
      ],
    },
    setupFiles: "testing/setup.ts",
  },
});
