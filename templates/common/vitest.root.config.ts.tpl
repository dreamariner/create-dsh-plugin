// __PACKAGE_NAME__ :: 单测配置（workspace 根：include 通配全部插件包与协议声明源）
import { existsSync, readdirSync } from 'node:fs'
import { join } from 'node:path'
import { defineConfig } from 'vitest/config'

// ⚠ setupFiles 不吃 glob（写 'packages/*/tests/setup.ts' 会被当成字面路径直接
//   ENOENT），这里按目录展开：每个带 tests/setup.ts 的插件包一份。多份 setup
//   重复设置 DSH_HOME 幂等无害（各自 mkdtemp 各自清理）。
const ROOT = import.meta.dirname
const setupFiles = existsSync(join(ROOT, 'packages'))
  ? readdirSync(join(ROOT, 'packages'), { withFileTypes: true })
      .filter((e) => e.isDirectory() && existsSync(join(ROOT, 'packages', e.name, 'tests', 'setup.ts')))
      .map((e) => `packages/${e.name}/tests/setup.ts`)
  : []

export default defineConfig({
  test: {
    // 通配全部插件包（add 新插件无需改本文件）；packages/protocol 的自守 spec
    // 也一并收编（DSH_CHECKOUT 缺席时其逐字节同步断言自动 skip）
    include: ['packages/*/tests/**/*.spec.ts'],
    environment: 'node',
    setupFiles,
    testTimeout: 60_000,
  },
})
