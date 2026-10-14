import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";
import type { CoverageReporter } from "vitest/node";

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		watch: false,
		coverage: {
			exclude: [
				...(configDefaults.coverage.exclude ?? []),
				"__mocks__",
				"testing",
				"oxfmt.config.ts",
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
