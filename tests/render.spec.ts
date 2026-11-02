// 脚手架自测：三种类型各渲染一份到临时目录，断言文件清单、manifest 形态与占位符无残留。
// 这是「模板矩阵没断链」的最低保障：新增模板文件不进 plan、占位符改名不同步，
// 在这里第一时间红。
//
// 布局按形态走：full → workspace（根壳 + packages/<id>/，typert 硬约束）；
// host / client → single（根即插件包，安装一步到位）。add 只面向 workspace 仓。
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPlan, buildPluginPlan, buildRootPlan, renderPluginPackage, renderProject, substitutionsOf } from '../src/render.ts'
import { buildManifests, buildPackageManifest, layoutOf } from '../src/manifest.ts'
import { wireHostFaceConfig } from '../src/finalize.ts'
import type { PluginType, ScaffoldOptions } from '../src/types.ts'

const TYPES: PluginType[] = ['host', 'client', 'full']

function fakeOpts(type: PluginType, over: Partial<ScaffoldOptions> = {}): ScaffoldOptions {
  return {
    command: 'create',
    packageName: '@acme/dsh-demo',
    pluginId: 'dsh-demo',
    title: 'demo',
    description: 'demo 插件',
    type,
    targetDir: '',
    install: false,
    git: false,
    ...over,
  }
}

// ── single 布局（host / client）：根 = 插件包 ──────────────────────────────
const SINGLE_ROOT = ['.gitignore', 'README.md', 'LICENSE', 'vitest.config.ts', 'scripts/lib/manifest-deps.mjs', 'scripts/profile-add.mjs']
const SINGLE_ROOT_HOST = [...SINGLE_ROOT, 'scripts/dev-hmr.mjs']
// ── workspace 布局（full）：根壳 + 项目共用脚本 ─────────────────────────────
const WORKSPACE_ROOT = [
  '.gitignore', 'README.md', 'LICENSE', 'pnpm-workspace.yaml', 'tsconfig.json', 'vitest.config.ts',
  'scripts/lib/manifest-deps.mjs', 'scripts/sync-pack-docs.mjs', 'scripts/profile-add.mjs',
  'scripts/dev-hmr.mjs', 'tsconfig.host.json', 'scripts/ensure-protocol.mjs',
]

/** 插件包文件清单（single 落根，workspace 落 packages/<id>/；不含 package.json：
 *  manifest 程序化写，不进 plan）。 */
function expectedPluginFiles(type: PluginType): string[] {
  const common = ['tsconfig.json', 'cordis.patch.yml', 'locale/en.json', 'locale/zh.json', 'icon.svg', 'tests/setup.ts']
  const tsdown = ['tsdown.config.ts']
  const host = ['src/index.ts', 'src/config.ts']
  const client = ['src/client/index.tsx', 'tests/client-boundary.spec.ts']
  const typert = ['tsconfig.typert.json', 'src/remote.ts', 'tests/protocol-vendor.spec.ts', 'tests/typert-face-install.spec.ts']
  if (type === 'host') return [...common, ...tsdown, ...host, 'tests/bundle-shape.spec.ts']
  if (type === 'client') return [...common, ...tsdown, 'src/index.ts', ...client, 'tests/bundle-shape.spec.ts']
  return [...common, ...tsdown, ...host, ...client, ...typert, 'tests/bundle-shape.spec.ts']
}

function rootFilesOf(type: PluginType): string[] {
  if (layoutOf(type) === 'single') return type === 'host' ? SINGLE_ROOT_HOST : SINGLE_ROOT
  return WORKSPACE_ROOT
}

function render(type: PluginType): { dir: string; count: number } {
  const dir = mkdtempSync(join(tmpdir(), `create-dsh-plugin-test-${type}-`))
  const count = renderProject(fakeOpts(type, { targetDir: dir }))
  return { dir, count }
}

describe('模板矩阵（布局按形态走）', () => {
  for (const type of TYPES) {
    const single = layoutOf(type) === 'single'
    const pluginDir = single ? '.' : 'packages/dsh-demo'

    it(`${type}：计划与实际产出一致`, () => {
      const plan = buildPlan(type, 'dsh-demo').map((f) => f.to).sort()
      const plugin = expectedPluginFiles(type).map((f) => `${pluginDir === '.' ? '' : 'packages/dsh-demo/'}${f}`)
      // package.json 是程序化写的，不进 plan
      expect(plan).toEqual([...rootFilesOf(type), ...plugin].sort())
    })

    it(`${type}：渲染无占位符残留、manifest 形态正确`, () => {
      const { dir, count } = render(type)
      try {
        const all = [...rootFilesOf(type), ...expectedPluginFiles(type).map((f) => `${pluginDir === '.' ? '' : 'packages/dsh-demo/'}${f}`)]
        expect(count).toBe(all.length + (single ? 1 : 2)) // + manifest：single 一份（根），workspace 两份

        for (const rel of all) {
          if (rel.endsWith('LICENSE')) continue
          const text = readFileSync(join(dir, rel), 'utf8')
          expect(text.match(/__(?:PROJECT_NAME|PACKAGE_NAME|PLUGIN_ID|TITLE|DESCRIPTION|PASCAL_NAME|SERVICE_KEY|PLUGIN_REL|PLUGIN_TYPE_LABEL|MANIFEST_DEPS_REL|SELF_LINK_SUFFIX|PACKAGE_MANAGER)__/), `${rel} 有占位符残留`).toBeNull()
          expect(text.match(/<!--#if/), `${rel} 有未处理的条件块`).toBeNull()
        }

        const manifest = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        expect(manifest.packageManager).toBe('pnpm@11.7.0')

        if (single) {
          // 根 = 插件包：名字就是包名，可发布（无 private），测试/类型检查本仓承载
          expect(manifest.name).toBe('@acme/dsh-demo')
          expect(manifest.private).toBeUndefined()
          expect(manifest.scripts.build).toBe('tsdown')
          expect(manifest.scripts.prepare).toBe('tsdown') // 根=包，README/LICENSE 由 npm 自动收录
          expect(manifest.scripts.test).toBe('vitest run')
          expect(manifest.scripts.typecheck).toBe('tsc --noEmit -p tsconfig.json')
          expect(manifest.scripts['dev:hmr']).toBe(type === 'host' ? 'node scripts/dev-hmr.mjs' : undefined)
          expect(manifest.scripts['profile:add']).toBe('node scripts/profile-add.mjs')
          expect(manifest.exports['.']).toBe('./lib/index.js')
          expect(manifest.files).toContain('README.md')
          expect(manifest.dsh.bundle.patch).toBe('./cordis.patch.yml')
          // 单包没有 workspace 基建
          expect(existsSync(join(dir, 'pnpm-workspace.yaml'))).toBe(false)
          expect(existsSync(join(dir, 'packages'))).toBe(false)
          expect(existsSync(join(dir, 'scripts/sync-pack-docs.mjs'))).toBe(false)
          // vitest / tsconfig 是单包版
          expect(readFileSync(join(dir, 'vitest.config.ts'), 'utf8')).toContain("include: ['tests/**/*.spec.ts']")
          const ts = readFileSync(join(dir, 'tsconfig.json'), 'utf8')
          expect(ts).not.toContain('"extends"')
          expect(ts).toContain('"src/**/*.ts"')
          // tsdown 引用本仓 scripts（占位符已按布局替换）；client 构建不用 manifest 派生
          if (type === 'host') expect(readFileSync(join(dir, 'tsdown.config.ts'), 'utf8')).toContain("from './scripts/lib/manifest-deps.mjs'")
          // README 是单包版：方式二走 package.json 的 profile:add 自定义指令（缺省 link 仓根，无 #path: 子目录形态）
          const readme = readFileSync(join(dir, 'README.md'), 'utf8')
          expect(readme).toContain('单包布局')
          expect(readme).toContain('pnpm profile:add')
          expect(readme).not.toContain('#path:packages/')
          if (type === 'host') {
            expect(manifest.peerDependencies['@deepseek-ai/schemastery']).toBeTypeOf('string')
            expect(manifest.devDependencies['@deepseek-ai/cordis']).toBe('4.0.5')
            expect(manifest.devDependencies['react']).toBeUndefined()
            expect(manifest.exports['./client']).toBeUndefined()
            expect(manifest.dsh.client).toBeUndefined()
          } else {
            expect(manifest.peerDependencies).toBeUndefined()
            expect(manifest.dsh.client.platform).toBe('web')
            expect(manifest.exports['./client']).toBe('./lib/client.js')
            expect(manifest.devDependencies['react']).toBeTypeOf('string')
            expect(readFileSync(join(dir, 'tsdown.config.ts'), 'utf8')).toContain('EXTERNALS')
          }
        } else {
          // workspace：根壳 private、脚本 -r 转发、插件 manifest 在 packages/<id>/
          expect(manifest.name).toBe('dsh-demo-workspace')
          expect(manifest.private).toBe(true)
          expect(manifest.scripts.build).toBe('pnpm -r build')
          expect(manifest.scripts.prepare).toBe('pnpm -r build')
          expect(manifest.scripts.preinstall).toBe('node scripts/ensure-protocol.mjs')
          expect(manifest.exports).toBeUndefined()
          expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain('packages/*')
          expect(readFileSync(join(dir, 'vitest.config.ts'), 'utf8')).toContain("include: ['packages/*/tests/**/*.spec.ts']")
          expect(readFileSync(join(dir, 'tsconfig.json'), 'utf8')).toContain('"exclude": ["packages/protocol"]')
          expect(readFileSync(join(dir, 'packages/dsh-demo/tsdown.config.ts'), 'utf8')).toContain('typertPlugin')

          const plugin = JSON.parse(readFileSync(join(dir, 'packages/dsh-demo/package.json'), 'utf8'))
          expect(plugin.name).toBe('@acme/dsh-demo')
          expect(plugin.private).toBeUndefined()
          expect(plugin.scripts.prepare).toBe('tsdown && node ../../scripts/sync-pack-docs.mjs')
          expect(plugin.scripts.test).toBeUndefined() // 测试由根壳承载
          expect(plugin.files).toContain('README.md')
          expect(plugin.dsh.bundle.patch).toBe('./cordis.patch.yml')
          expect(plugin.exports['./locale/*.json']).toBe('./locale/*.json')
          expect(plugin.exports['./icon']).toBe('./icon.svg')
          expect(plugin.peerDependencies['@deepseek-ai/dsh-typert-protocol']).toBe('>=0.2.1-rc.3 <0.3.0-0')
          expect(plugin.devDependencies['@deepseek-ai/dsh-typert-protocol']).toBe('0.2.1-rc.3')
          expect(plugin.devDependencies['@deepseek-ai/dsh-typert-generator']).toBe('0.2.1-rc.3')
          expect((plugin.exports['./typert'] as { default: string }).default).toBe('./lib/typert.host.js')
          expect((plugin.exports['./remote'] as { default: string }).default).toBe('./lib/typert.remote-client.js')
          expect(plugin.dependencies.zod).toBe('^4.4.3')
          expect(readFileSync(join(dir, 'scripts/ensure-protocol.mjs'), 'utf8')).toContain('packages/protocol')
          expect(readFileSync(join(dir, 'scripts/profile-add.mjs'), 'utf8')).toContain("const NAME = '@acme/dsh-demo'")
          expect(readFileSync(join(dir, 'scripts/profile-add.mjs'), 'utf8')).toContain("SELF_SUFFIX = '/packages/dsh-demo'")
          expect(readFileSync(join(dir, 'tsconfig.host.json'), 'utf8')).toContain('packages/protocol/src/index.ts')
          expect(readFileSync(join(dir, 'packages/dsh-demo/tsconfig.typert.json'), 'utf8')).toContain('extends')
          expect(readFileSync(join(dir, 'README.md'), 'utf8')).toContain('typert：client 与 host 的类型化 RPC')
        }
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }

  it('插件 manifest 的 devDeps 按类型精确变化（host 有 schemastery+cordis，client 有 react）', () => {
    const host = buildPackageManifest({ packageName: 'a', pluginId: 'a', description: 'a', type: 'host' }) as { devDependencies: Record<string, string> }
    const client = buildPackageManifest({ packageName: 'b', pluginId: 'b', description: 'b', type: 'client' }) as { devDependencies: Record<string, string> }
    expect(host.devDependencies['@deepseek-ai/schemastery']).toBe('3.18.5')
    expect(host.devDependencies['@deepseek-ai/cordis']).toBe('4.0.5')
    expect(client.devDependencies['@deepseek-ai/schemastery']).toBeUndefined()
    expect(client.devDependencies['react']).toBe('^18.2.0')
    const full = buildManifests({ packageName: 'c', pluginId: 'c', description: 'c', type: 'full' })
    expect(full.root.name).toBe('c-workspace')
    expect((full.plugin!.devDependencies as Record<string, string>)['@deepseek-ai/dsh-typert-generator']).toBe('0.2.1-rc.3')
  })

  it('substitutions 布局感知（__PLUGIN_REL__ / __MANIFEST_DEPS_REL__）', () => {
    const subFull = substitutionsOf(fakeOpts('full'))
    expect(subFull.__PLUGIN_REL__).toBe('packages/dsh-demo')
    expect(subFull.__MANIFEST_DEPS_REL__).toBe('../../scripts/lib/manifest-deps.mjs')
    const subHost = substitutionsOf(fakeOpts('host'))
    expect(subHost.__PLUGIN_REL__).toBe('.')
    expect(subHost.__MANIFEST_DEPS_REL__).toBe('./scripts/lib/manifest-deps.mjs')
    expect(subHost.__PASCAL_NAME__).toBe('Demo')
    expect(subHost.__SERVICE_KEY__).toBe('demo')
  })

  it('single 布局没有项目名概念：projectName 被忽略，根名 = 包名', () => {
    const dir = mkdtempSync(join(tmpdir(), 'create-dsh-plugin-test-single-name-'))
    try {
      renderProject(fakeOpts('host', { projectName: 'my-otter-plugins', targetDir: dir }))
      const root = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      expect(root.name).toBe('@acme/dsh-demo') // 项目名只在 workspace 布局有意义
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('workspace 自定义项目名：根壳名跟项目名，包名不受影响', () => {
    const root = buildManifests({ packageName: '@acme/dsh-demo', pluginId: 'dsh-demo', description: 'd', type: 'full', projectName: 'my-otter-plugins' }).root as { name: string }
    expect(root.name).toBe('my-otter-plugins')
    const root2 = buildManifests({ packageName: '@acme/dsh-demo', pluginId: 'dsh-demo', description: 'd', type: 'full', projectName: 'dsh-demo' }).root as { name: string }
    expect(root2.name).toBe('dsh-demo-workspace')
  })

  it('条件块按类型保留或剔除（两份 README 模板各自成立）', () => {
    const readme = (t: PluginType): string => {
      const dir = mkdtempSync(join(tmpdir(), `create-dsh-plugin-test-cond-${t}-`))
      try {
        renderProject(fakeOpts(t, { targetDir: dir }))
        return readFileSync(join(dir, 'README.md'), 'utf8')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    }
    expect(readme('full')).toContain('typert：client 与 host 的类型化 RPC')
    expect(readme('host')).not.toContain('typert：client 与 host 的类型化 RPC')
    expect(readme('host')).toContain('pnpm dev:hmr')
    expect(readme('client')).not.toContain('pnpm dev:hmr')
    expect(readme('full')).not.toMatch(/<!--#if/)
  })

  it('plan 里的每个文件都真实存在（模板没断链）', () => {
    for (const type of TYPES) {
      for (const f of buildPlan(type, 'dsh-demo')) {
        expect(existsSync(join(import.meta.dirname, '..', 'templates', f.from)), `模板缺失：${f.from}（type=${type}）`).toBe(true)
      }
    }
  })
})

describe('add：向既有 workspace 仓追加插件包', () => {
  it('追加后插件包完整落位，根壳按通配自动覆盖（无需改根）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'create-dsh-plugin-test-add-full-'))
    try {
      renderProject(fakeOpts('full', { targetDir: dir }))
      const before = readFileSync(join(dir, 'package.json'), 'utf8')

      const n = renderPluginPackage(fakeOpts('client', {
        command: 'add',
        packageName: '@acme/dsh-bar',
        pluginId: 'dsh-bar',
        targetDir: dir,
      }))
      expect(n).toBe(1 + expectedPluginFiles('client').length) // add 只写插件 manifest + 插件文件
      expect(existsSync(join(dir, 'packages/dsh-bar/package.json'))).toBe(true)
      expect(existsSync(join(dir, 'packages/dsh-bar/src/client/index.tsx'))).toBe(true)
      expect(existsSync(join(dir, 'packages/dsh-bar/src/config.ts'))).toBe(false) // client 无 host 半边
      const added = JSON.parse(readFileSync(join(dir, 'packages/dsh-bar/package.json'), 'utf8'))
      expect(added.name).toBe('@acme/dsh-bar')
      expect(added.scripts.test).toBeUndefined() // 测试由根壳承载
      expect(readFileSync(join(dir, 'package.json'), 'utf8')).toBe(before) // 根壳不动
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('add(full) 到无 tsconfig.host.json 的仓：按模板现生成（protocol + 新插件）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'create-dsh-plugin-test-add-full1-'))
    try {
      renderProject(fakeOpts('full', { targetDir: dir }))
      rmSync(join(dir, 'tsconfig.host.json'), { force: true }) // 模拟「仓里还没有 full 聚合」
      expect(wireHostFaceConfig(dir, 'dsh-bar', 'full')).toBe('created')
      const text = readFileSync(join(dir, 'tsconfig.host.json'), 'utf8')
      expect(text).toContain('{ "path": "packages/protocol" }')
      expect(text).toContain('{ "path": "packages/dsh-bar/tsconfig.typert.json" }')
      expect(text).not.toContain('packages/dsh-demo/tsconfig.typert.json') // 非本插件的 face 不出现
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('add(full) 到 full 仓：追加第二份 face 引用，注释与既有引用原样保留', () => {
    const dir = mkdtempSync(join(tmpdir(), 'create-dsh-plugin-test-add-full2-'))
    try {
      renderProject(fakeOpts('full', { targetDir: dir }))
      const before = readFileSync(join(dir, 'tsconfig.host.json'), 'utf8')
      expect(before).toContain('//') // 模板带注释（这正是不能 JSON.parse 往返的原因）

      expect(wireHostFaceConfig(dir, 'dsh-bar', 'full')).toBe('wired')
      const after = readFileSync(join(dir, 'tsconfig.host.json'), 'utf8')
      expect(after).toContain('{ "path": "packages/protocol" },')
      expect(after).toContain('{ "path": "packages/dsh-demo/tsconfig.typert.json" },')
      expect(after).toContain('{ "path": "packages/dsh-bar/tsconfig.typert.json" }')
      expect(after).toContain('//') // 注释未丢
      // 逗号与闭合括号结构正确（数组成员恰好 3 个）
      const refs = after.slice(after.indexOf('"references"'))
      expect(refs.match(/\{ "path"/g)).toHaveLength(3)
      expect(after.indexOf('packages/dsh-bar/tsconfig.typert.json')).toBeGreaterThan(after.indexOf('packages/protocol'))
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('重复 wire 同一插件幂等（skipped，不产生重复行）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'create-dsh-plugin-test-add-idem-'))
    try {
      renderProject(fakeOpts('full', { targetDir: dir }))
      expect(wireHostFaceConfig(dir, 'dsh-bar', 'full')).toBe('wired')
      expect(wireHostFaceConfig(dir, 'dsh-bar', 'full')).toBe('skipped')
      const text = readFileSync(join(dir, 'tsconfig.host.json'), 'utf8')
      expect(text.match(/packages\/dsh-bar\/tsconfig\.typert\.json/g)).toHaveLength(1)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('非 full 形态不触碰 tsconfig.host.json', () => {
    const dir = mkdtempSync(join(tmpdir(), 'create-dsh-plugin-test-add-skip-'))
    try {
      renderProject(fakeOpts('full', { targetDir: dir }))
      const before = readFileSync(join(dir, 'tsconfig.host.json'), 'utf8')
      expect(wireHostFaceConfig(dir, 'dsh-bar', 'host')).toBe('skipped')
      expect(readFileSync(join(dir, 'tsconfig.host.json'), 'utf8')).toBe(before)
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('buildPluginPlan / buildRootPlan 可独立取用', () => {
    expect(buildPluginPlan('host', 'x').every((f) => f.to.startsWith('packages/x/'))).toBe(true) // workspace 语义（add 用）
    expect(buildRootPlan('client').map((f) => f.to)).toEqual(SINGLE_ROOT)
    expect(buildRootPlan('host').map((f) => f.to)).toEqual(SINGLE_ROOT_HOST)
    expect(buildRootPlan('full').map((f) => f.to)).toEqual(WORKSPACE_ROOT)
  })
})
