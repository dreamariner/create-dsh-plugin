// __PACKAGE_NAME__ :: 单测配置（workspace 根：收全部插件包与协议声明源的 spec）
import { defineConfig } from 'vitest/config'

export default defineConfig({
  test: {
    include: ['packages/*/tests/**/*.spec.ts'],
    environment: 'node',
    // 全局隔离护栏：DSH_HOME 指向临时目录（见 packages/<插件 id>/tests/setup.ts）
    setupFiles: ['packages/__PLUGIN_ID__/tests/setup.ts'],
    testTimeout: 60_000,
  },
})
