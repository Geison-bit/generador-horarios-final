// vite.config.js
import { defineConfig } from "vitest/config";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    setupFiles: "./tests/setup.js",

    // Evita errores JSX en tests
    environmentMatchGlobs: [
      ["**/*.test.{js,jsx,ts,tsx}", "jsdom"]
    ]
  }
});
