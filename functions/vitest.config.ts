import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./src/tests/helpers/setup.ts"],
    include: ["src/tests/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary"],
      include: ["src/**/*.ts"],
      exclude: ["src/tests/**", "src/index.ts"],
    },
    testTimeout: 10000,
  },
});
