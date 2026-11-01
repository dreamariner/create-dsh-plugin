// 脚手架自测：三种类型各渲染一份到临时目录，断言文件清单、manifest 形态与占位符无残留。
// 这是「模板矩阵没断链」的最低保障：新增模板文件不进 plan、占位符改名不同步，
// 在这里第一时间红。
//
// 三形态统一 workspace 布局（根壳 + packages/<id>/ 插件包）：add 追加插件的根接线
// （tsconfig.host.json 引用追加 / 按模板现生成）也在本文件覆盖。
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPlan, buildPluginPlan, buildRootPlan, renderPluginPackage, renderProject, substitutionsOf } from '../src/render.ts'
import { buildManifests, buildPackageManifest } from '../src/manifest.ts'
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

/** 三形态统一的根壳文件。根 scripts/ 是项目共用脚本的家（一仓一份）。 */
const ROOT_FILES = [
  '.gitignore', 'README.md', 'LICENSE', 'pnpm-workspace.yaml', 'tsconfig.json', 'vitest.config.ts',
  'scripts/lib/manifest-deps.mjs', 'scripts/sync-pack-docs.mjs',
]
/** host / full 的根壳额外文件（项目级 hmr 接线）。 */
const HMR_ROOT_EXTRA = ['scripts/dev-hmr.mjs']
/** full 额外的根壳文件（typert 聚合配置 + 协议声明源 preinstall 守卫）。 */
const FULL_ROOT_EXTRA = ['tsconfig.host.json', 'scripts/ensure-protocol.mjs']

function rootFilesOf(type: PluginType): string[] {
  const base = type === 'host' || type === 'full' ? [...ROOT_FILES, ...HMR_ROOT_EXTRA] : ROOT_FILES
  return type === 'full' ? [...base, ...FULL_ROOT_EXTRA] : base
}

/** 插件包文件清单（packages/<id>/ 下，不含 package.json：manifest 程序化写，不进 plan）。
 *  插件包内无 scripts/：共用脚本（hmr / 依赖策略 / 文档同步）都住根 scripts/。 */
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

function render(type: PluginType): { dir: string; count: number } {
  const dir = mkdtempSync(join(tmpdir(), `create-dsh-plugin-test-${type}-`))
  const count = renderProject(fakeOpts(type, { targetDir: dir }))
  return { dir, count }
}

const PLUGINS: Record<PluginType, string> = { host: 'packages/dsh-demo', client: 'packages/dsh-demo', full: 'packages/dsh-demo' }

describe('模板矩阵（三类型 × 统一 workspace 布局）', () => {
  for (const type of TYPES) {
    it(`${type}：计划与实际产出一致（根壳 + packages/dsh-demo/）`, () => {
      const plan = buildPlan(type, 'dsh-demo').map((f) => f.to).sort()
      const want = [...rootFilesOf(type), ...expectedPluginFiles(type).map((f) => `packages/dsh-demo/${f}`)].sort()
      expect(plan).toEqual(want)
    })

    it(`${type}：渲染无占位符残留、根壳与插件 manifest 形态正确`, () => {
      const { dir, count } = render(type)
      try {
        expect(count).toBe(2 + rootFilesOf(type).length + expectedPluginFiles(type).length)

        // 全部文本文件无占位符残留、无未处理条件块
        for (const rel of [...rootFilesOf(type), ...expectedPluginFiles(type).map((f) => `${PLUGINS[type]}/${f}`), 'package.json', `${PLUGINS[type]}/package.json`]) {
          if (rel.endsWith('LICENSE')) continue
          const text = readFileSync(join(dir, rel), 'utf8')
          expect(text.match(/__(?:PROJECT_NAME|PACKAGE_NAME|PLUGIN_ID|TITLE|DESCRIPTION|PASCAL_NAME|SERVICE_KEY|PLUGIN_REL|PLUGIN_TYPE_LABEL)__/), `${rel} 有占位符残留`).toBeNull()
          expect(text.match(/<!--#if/), `${rel} 有未处理的条件块`).toBeNull()
        }

        // 根 manifest：三形态一律是 private workspace 壳，脚本 -r 递归转发（加包不改根）
        // 根壳名跟项目名（缺省 = 插件 id），不跟包名
        const root = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        expect(root.name).toBe('dsh-demo-workspace')
        expect(root.private).toBe(true)
        expect(root.packageManager).toBe('pnpm@11.7.0')
        expect(root.scripts.build).toBe('pnpm -r build')
        expect(root.scripts.dev).toBe('pnpm -r --parallel dev')
        expect(root.scripts.prepare).toBe('pnpm -r build')
        expect(root.scripts.test).toBe('vitest run')
        expect(root.scripts.typecheck).toBe('tsc --noEmit -p tsconfig.json')
        if (type === 'host' || type === 'full') {
          // 项目级 hmr：根壳直调 scripts/dev-hmr.mjs（一仓一份，注册全部插件包 lib/）
          expect(root.scripts['dev:hmr']).toBe('node scripts/dev-hmr.mjs')
        } else {
          expect(root.scripts['dev:hmr']).toBeUndefined()
        }
        if (type === 'full') {
          // 协议声明源守卫住根壳 preinstall（发布包没有 scripts/，跟包走会崩）
          expect(root.scripts.preinstall).toBe('node scripts/ensure-protocol.mjs')
        }
        expect(root.exports).toBeUndefined()

        // 根壳：workspace 声明通配 packages/*、根 vitest 通配全部插件包、根 tsconfig
        // exclude 协议声明源（TS2717 防线）
        expect(readFileSync(join(dir, 'pnpm-workspace.yaml'), 'utf8')).toContain('packages/*')
        expect(readFileSync(join(dir, 'vitest.config.ts'), 'utf8')).toContain("include: ['packages/*/tests/**/*.spec.ts']")
        expect(readFileSync(join(dir, 'tsconfig.json'), 'utf8')).toContain('"exclude": ["packages/protocol"]')

        // 插件 manifest：测试与类型检查由根壳承载，发布面按官方 checklist
        const plugin = JSON.parse(readFileSync(join(dir, 'packages/dsh-demo/package.json'), 'utf8'))
        expect(plugin.name).toBe('@acme/dsh-demo')
        expect(plugin.private).toBeUndefined()
        expect(plugin.scripts.build).toBe('tsdown')
        expect(plugin.scripts.prepare).toBe('tsdown && node ../../scripts/sync-pack-docs.mjs') // pack/publish/git 安装三路都同步文档
        expect(plugin.scripts.prepublishOnly).toBeUndefined()
        expect(plugin.scripts['dev:hmr']).toBeUndefined() // hmr 是项目级（根壳直调一份脚本）
        expect(plugin.scripts.preinstall).toBeUndefined() // full 的守卫上移根壳
        expect(plugin.scripts.test).toBeUndefined()
        expect(plugin.scripts.typecheck).toBeUndefined()
        expect(plugin.files).toContain('README.md') // npm 只自动收录包目录内的两件
        expect(plugin.files).toContain('LICENSE')
        expect(plugin.dsh.bundle.patch).toBe('./cordis.patch.yml')
        // 展示元数据的导出面（官方 checklist：Plugin Manager 在不激活插件时经 exports 读取）
        expect(plugin.exports['./locale/*.json']).toBe('./locale/*.json')
        expect(plugin.exports['./icon']).toBe('./icon.svg')
        if (type === 'host') {
          expect(plugin.dsh.client).toBeUndefined()
          expect(plugin.exports['./client']).toBeUndefined()
          expect(plugin.peerDependencies['@deepseek-ai/schemastery']).toBeTypeOf('string')
          expect(plugin.scripts['dev:hmr']).toBeUndefined() // hmr 是项目级（根壳直调一份脚本）
          expect(plugin.devDependencies['react']).toBeUndefined()
          expect(plugin.exports['./typert']).toBeUndefined()
        } else {
          expect(plugin.dsh.client.platform).toBe('web')
          expect(plugin.exports['./client']).toBe('./lib/client.js')
          expect(plugin.devDependencies['react']).toBeTypeOf('string')
        }
        if (type === 'client') {
          expect(plugin.peerDependencies).toBeUndefined()
          expect(plugin.scripts['dev:hmr']).toBeUndefined()
          expect(plugin.devDependencies['@deepseek-ai/schemastery']).toBeUndefined()
          expect(plugin.exports['./typert']).toBeUndefined()
        }
        if (type === 'full') {
          // typert 接线四件套：peer + 裸精确 pin + 生成器 devDep + 生成产物导出面
          expect(plugin.peerDependencies['@deepseek-ai/dsh-typert-protocol']).toBe('>=0.2.1-rc.3 <0.3.0-0')
          expect(plugin.devDependencies['@deepseek-ai/dsh-typert-protocol']).toBe('0.2.1-rc.3')
          expect(plugin.devDependencies['@deepseek-ai/dsh-typert-generator']).toBe('0.2.1-rc.3')
          expect((plugin.exports['./typert'] as { default: string }).default).toBe('./lib/typert.host.js')
          expect((plugin.exports['./remote'] as { default: string }).default).toBe('./lib/typert.remote-client.js')
          expect(plugin.dependencies.zod).toBe('^4.4.3')
          expect(readFileSync(join(dir, 'scripts/ensure-protocol.mjs'), 'utf8')).toContain('packages/protocol')
          expect(readFileSync(join(dir, 'tsconfig.host.json'), 'utf8')).toContain('packages/protocol/src/index.ts')
          expect(readFileSync(join(dir, 'packages/dsh-demo/tsdown.config.ts'), 'utf8')).toContain('typertPlugin')
          expect(readFileSync(join(dir, 'packages/dsh-demo/tsconfig.typert.json'), 'utf8')).toContain('extends')
          expect(readFileSync(join(dir, 'README.md'), 'utf8')).toContain('typert：client 与 host 的类型化 RPC')
        }

        // README 的形态标签已替换
        expect(readFileSync(join(dir, 'README.md'), 'utf8')).toContain('形态：')
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
    expect((full.plugin.devDependencies as Record<string, string>)['@deepseek-ai/dsh-typert-generator']).toBe('0.2.1-rc.3')
  })

  it('substitutions 覆盖全部占位符名（__PLUGIN_REL__ 三形态统一指向 packages/<id>）', () => {
    const sub = substitutionsOf(fakeOpts('full'))
    expect(Object.keys(sub).sort()).toEqual(['__DESCRIPTION__', '__PACKAGE_NAME__', '__PASCAL_NAME__', '__PLUGIN_ID__', '__PLUGIN_REL__', '__PLUGIN_TYPE_LABEL__', '__PROJECT_NAME__', '__SERVICE_KEY__', '__TITLE__'].sort())
    expect(sub.__PASCAL_NAME__).toBe('Demo') // dsh-demo → Demo
    expect(sub.__SERVICE_KEY__).toBe('demo') // dsh-demo → demo（camelCase 服务键）
    expect(sub.__PLUGIN_REL__).toBe('packages/dsh-demo')
    expect(sub.__PROJECT_NAME__).toBe('dsh-demo') // 缺省 = 插件 id
  })

  it('自定义项目名：根壳名与 README 标题跟项目名，包名不受影响', () => {
    const dir = mkdtempSync(join(tmpdir(), 'create-dsh-plugin-test-projname-'))
    try {
      renderProject(fakeOpts('host', { projectName: 'my-otter-plugins', targetDir: dir }))
      const root = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
      // 显式项目名且 ≠ 插件 id：裸项目名，不加 -workspace 后缀（名字本身已无歧义）
      expect(root.name).toBe('my-otter-plugins')
      const plugin = JSON.parse(readFileSync(join(dir, 'packages/dsh-demo/package.json'), 'utf8'))
      expect(plugin.name).toBe('@acme/dsh-demo') // 包名不动
      const readme = readFileSync(join(dir, 'README.md'), 'utf8')
      expect(readme).toContain('# my-otter-plugins')
      expect(readme).toContain('@acme/dsh-demo')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('显式项目名 = 插件 id：与缺省同形，保留 -workspace 后缀（与插件包目录区分）', () => {
    const root = buildManifests({ packageName: '@acme/dsh-demo', pluginId: 'dsh-demo', description: 'd', type: 'client', projectName: 'dsh-demo' }).root as { name: string }
    expect(root.name).toBe('dsh-demo-workspace')
  })

  it('条件块按类型保留或剔除', () => {
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

describe('add：向既有 workspace 追加插件包', () => {
  it('追加后插件包完整落位，且根壳按通配自动覆盖（无需改根）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'create-dsh-plugin-test-add-host-'))
    try {
      renderProject(fakeOpts('host', { targetDir: dir }))
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
      expect(existsSync(join(dir, 'tsconfig.host.json'))).toBe(false) // host 仓无 typert 聚合
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('add(full) 到 host / client 仓：tsconfig.host.json 按模板现生成（protocol + 新插件）', () => {
    const dir = mkdtempSync(join(tmpdir(), 'create-dsh-plugin-test-add-full1-'))
    try {
      renderProject(fakeOpts('client', { targetDir: dir }))
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

  it('buildPluginPlan / buildRootPlan 可独立取用（add 只需要插件清单）', () => {
    expect(buildPluginPlan('host', 'x').every((f) => f.to.startsWith('packages/x/'))).toBe(true)
    expect(buildRootPlan('client').map((f) => f.to)).toEqual(ROOT_FILES)
  })})
