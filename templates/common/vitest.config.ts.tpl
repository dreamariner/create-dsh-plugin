// __PACKAGE_NAME__ :: 单测配置
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['tests/**/*.spec.ts'],
    environment: 'node',
    // 全局隔离护栏：DSH_HOME 指向临时目录（见 tests/setup.ts）
    setupFiles: ['./tests/setup.ts'],
    testTimeout: 60_000,
  },
})
