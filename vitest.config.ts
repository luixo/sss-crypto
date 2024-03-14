import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    watch: false,
    coverage: {
      all: true,
      enabled: true,
    },
  },
});
