/**
 * Database integration tests.
 *
 * Kept in its own config so `pnpm test` stays a fast, dependency-free unit run:
 * these suites need a reachable Postgres and would otherwise fail on any
 * machine that has not configured one.
 *
 * Deliberately does *not* extend `vite.config.ts`. That config mounts the
 * `agentNative` plugin, which boots the whole application server — nitro, MCP,
 * a PTY, Sentry and the OpenTelemetry SDK — for what is a plain server test
 * run. Beyond being slow, Sentry's transitive OpenTelemetry ESM build cannot be
 * loaded by Node, so booting it turns every suite into a load error. These
 * tests only need the TypeScript path alias.
 *
 * Single-threaded on purpose. Suites share one test database and reset it by
 * truncation, so parallel files would wipe each other's rows mid-assertion.
 */
import { fileURLToPath } from "node:url";

import baseConfig from "@agent-native/core/vitest-config";
import { defineConfig, mergeConfig } from "vitest/config";

export default mergeConfig(
  baseConfig,
  defineConfig({
    resolve: {
      alias: [
        {
          find: /^@\//,
          replacement: fileURLToPath(new URL("./app/", import.meta.url)),
        },
      ],
    },
    test: {
      include: ["server/**/*.integration.spec.ts"],
      setupFiles: ["./server/testing/setup.ts"],
      fileParallelism: false,
      maxWorkers: 1,
      minWorkers: 1,
      // Migrations plus a cold Neon connection on the first suite.
      testTimeout: 30_000,
      hookTimeout: 60_000,
    },
  }),
);
