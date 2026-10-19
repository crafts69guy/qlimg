import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: { inkdrop: fileURLToPath(new URL("./test/inkdrop-stub.ts", import.meta.url)) },
  },
  test: {
    environment: "happy-dom",
    include: ["src/**/*.test.{ts,tsx}"],
    coverage: {
      provider: "v8",
      include: ["src/**"],
      exclude: ["src/**/*.test.*", "src/**/*.d.ts"],
      thresholds: { lines: 98, branches: 98, functions: 98, statements: 98 },
    },
  },
});
