import { fileURLToPath } from "node:url";

import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: {
    alias: {
      /*
       * The server-only poison import throws outside a React Server bundle.
       * Tests exercise server modules directly, so it resolves to an inert
       * stub here — the AD-1 guarantee is enforced by Next builds, not tests.
       */
      "server-only": fileURLToPath(
        new URL("./tests/stubs/server-only.ts", import.meta.url),
      ),
      "@": fileURLToPath(new URL(".", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
  },
});
