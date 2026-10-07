import baseConfig from "@agent-native/core/vitest-config";
import { mergeConfig } from "vitest/config";

import viteConfig from "./vite.config";

// Kept separate from vite.config.ts so the production config never imports
// vitest: `agent-native build` loads vite.config.ts in installs where vitest
// is absent.
//
// `*.integration.spec.ts` is excluded here and picked up by
// vitest.db.config.ts instead: those need a real database, and `pnpm test`
// has to stay runnable without one.
export default mergeConfig(mergeConfig(viteConfig, baseConfig), {
  test: { exclude: ["**/node_modules/**", "**/*.integration.spec.ts"] },
});
