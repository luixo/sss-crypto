import tsconfigPaths from "vite-tsconfig-paths";
import { configDefaults, defineConfig } from "vitest/config";
import type { CoverageReporter } from "vitest/node";

export default defineConfig({
	plugins: [tsconfigPaths()],
	test: {
		coverage: {
			enabled: true,
			exclude: [
				...(configDefaults.coverage.exclude ?? []),
				"__mocks__",
				"testing",
				"oxfmt.config.ts",
				"oxlint.config.ts",
			],
			reporter: [
				...(configDefaults.coverage.reporter as CoverageReporter[]),
				"json-summary",
			],
			thresholds: {
				"100": true,
			},
		},
		setupFiles: "testing/setup.ts",
		watch: false,
	},
});
