import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config';

// Only the project's own tests: review output, worktrees and copies under
// output/ or .claude/ must never be collected as a second suite.
export default mergeConfig(viteConfig, defineConfig({
  test: { include: ['test/**/*.test.ts'] },
}));
