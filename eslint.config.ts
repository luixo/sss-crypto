import js from "@eslint/js";
import * as airbnbPlugin from "eslint-config-airbnb-extended";
import prettierConfig from "eslint-config-prettier";
import importPlugin from "eslint-plugin-import-x";
import reactPlugin from "eslint-plugin-react";
import jsxAccessibilityPlugin from "eslint-plugin-jsx-a11y";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import eslintPluginUnicorn from "eslint-plugin-unicorn";
import vitestPlugin from "eslint-plugin-vitest";
import globals from "globals";
import { readFile } from "node:fs/promises";
import ts from "typescript-eslint";
import type { Linter } from "eslint";

const nodeVersion = await readFile(".nvmrc", "utf8");

const overridenRules = {
  name: "local/overriden",
  rules: {
    // Default option is `interface`
    "@typescript-eslint/consistent-type-definitions": ["error", "type"],
    // We use JSX fragments with `<></>` a lot
    "react/jsx-fragments": ["error", "syntax"],
    "import-x/no-extraneous-dependencies": [
      "error",
      {
        devDependencies: [
          "vitest.config.ts",
          "eslint.config.ts",
          "setup.ts",
          "utils/render.ts",
          "**/**.test.tsx",
          "__mocks__/**/*",
        ],
      },
    ],
    "@typescript-eslint/consistent-type-imports": [
      "error",
      { disallowTypeAnnotations: false },
    ],
  },
} satisfies Linter.Config;

const disabledRules = {
  name: "local/disabled",
  rules: {
    // We use mostly named exports
    "import-x/prefer-default-export": "off",
    // We know better
    "unicorn/prevent-abbreviations": "off",
    // We know better
    "unicorn/catch-error-name": "off",
    // Pretty outdated
    "react/require-default-props": "off",
    // We have typescript strict enough to have implicit boundary types
    "@typescript-eslint/explicit-module-boundary-types": "off",
    // We prefer reduce over loops
    "unicorn/no-array-reduce": "off",
    // We have typescript-driven check for exhaustiveness
    "default-case": "off",
    // Typescript handles this
    "consistent-return": "off",
    // We definitely should pass callbacks into array methods
    "unicorn/no-array-callback-reference": "off",
    // We may want to return `undefined` from functions
    "unicorn/no-useless-undefined": "off",
    // This is pretty crazy
    "unicorn/no-null": "off",
    // This has false positives where `utf-8` is actually an expected string
    "unicorn/text-encoding-identifier-case": "off",
    // We sometimes want to!
    "no-nested-ternary": "off",
  },
} satisfies Linter.Config;

export default ts.config(
  { files: ["**/*.{js,jsx,ts,tsx}"] },
  {
    languageOptions: {
      globals: globals.node,
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
      },
    },
    settings: {
      "import-x/resolver": {
        typescript: {
          project: true,
        },
      },
      node: {
        version: nodeVersion.toString(),
      },
    },
  },
  importPlugin.flatConfigs.recommended,
  importPlugin.flatConfigs.react,
  importPlugin.flatConfigs["react-native"],
  importPlugin.flatConfigs["stage-0"],
  reactHooksPlugin.configs["recommended-latest"],
  eslintPluginUnicorn.configs.recommended,
  airbnbPlugin.plugins.stylistic,
  airbnbPlugin.plugins.node,
  airbnbPlugin.configs.base.recommended,
  airbnbPlugin.rules.base.strict,
  airbnbPlugin.configs.node.recommended,
  airbnbPlugin.configs.react.recommended,
  airbnbPlugin.rules.react.strict,

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  reactPlugin.configs.flat.recommended!,

  // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
  reactPlugin.configs.flat["jsx-runtime"]!,
  js.configs.recommended,
  prettierConfig,
  jsxAccessibilityPlugin.flatConfigs.recommended,
  /* Typescript section */
  ts.configs.strictTypeChecked,
  ts.configs.stylisticTypeChecked,
  ts.configs.disableTypeChecked,
  importPlugin.flatConfigs.typescript,
  airbnbPlugin.configs.base.typescript,
  airbnbPlugin.rules.typescript.typescriptEslintStrict,
  airbnbPlugin.configs.react.typescript,
  /* Overrides section */
  overridenRules,
  disabledRules,
  // Disabling stylistic rules as it is Prettier's matter
  {
    rules: Object.fromEntries(
      // eslint-disable-next-line @typescript-eslint/no-non-null-assertion
      Object.entries(airbnbPlugin.rules.base.stylistic.rules!).map(([key]) => [
        key,
        "off" as const,
      ]),
    ),
  },
  {
    files: ["**/*.{mjs,js,jsx}"],
    ...ts.configs.disableTypeChecked,
  },
  {
    files: ["*.test.ts", "*.test.tsx"],
    plugins: {
      vitest: vitestPlugin,
    },
    rules: vitestPlugin.configs.recommended.rules,
  },
  {
    // see https://eslint.org/docs/latest/use/configure/configuration-files#globally-ignoring-files-with-ignores
    ignores: [".history/", ".yarn/", "**/coverage/"],
  },
);
