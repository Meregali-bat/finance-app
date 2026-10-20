import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

// O mesmo "@/" do tsconfig, para os módulos que importam por ele.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
});
