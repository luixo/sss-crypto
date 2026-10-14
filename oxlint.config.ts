import { getLintConfig } from "@luixo/configs";

export default getLintConfig({
	env: {
		node: true,
	},
	ignorePatterns: ["**/coverage/"],
	overrides: [
		{
			files: ["__mocks__/**"],
			rules: {
				"import/no-default-export": "off",
			},
		},
	],
	rules: {
		// We use a lot of magic numbers throughout the project
		"eslint/no-magic-numbers": "off",
		// We're using node extensively
		"import/no-nodejs-modules": "off",
		// We're not publishing this as a package
		"node/no-top-level-await": "off",
		// We don't have translations yet
		"react/jsx-no-literals": "off",
		// We do use type annoations for imports
		"typescript/consistent-type-imports": [
			"error",
			{ disallowTypeAnnotations: false },
		],
		// We're using "test" here
		"vitest/consistent-test-it": ["error", { fn: "test" }],
		// Custom expects
		"vitest/expect-expect": [
			"error",
			{ assertFunctionNames: ["expect", "expectDecryptionError"] },
		],
		// We interpolate text in snapshots
		"vitest/no-interpolation-in-snapshots": "off",
		// We're ok without describes
		"vitest/require-top-level-describe": "off",
	},
});
