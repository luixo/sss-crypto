module.exports = {
  extends: [
    "eslint:recommended",
    "plugin:@typescript-eslint/recommended",
    "airbnb-base",
    "airbnb-typescript/base",
    "plugin:react-hooks/recommended",
    "prettier",
  ],
  parserOptions: {
    project: true,
  },
  rules: {
    "import/extensions": "off",
    "import/prefer-default-export": "off",
    "consistent-return": "off",
    // Typescript version of default-case below
    "default-case": "off",
    "@typescript-eslint/switch-exhaustiveness-check": "error",
    "import/no-extraneous-dependencies": [
      "error",
      {
        devDependencies: [
          "**/*.test.ts",
          "**/*.test.tsx",
          "vitest.config.ts",
          "utils/render.ts",
        ],
      },
    ],
  },
};
