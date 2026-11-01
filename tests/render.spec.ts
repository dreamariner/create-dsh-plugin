// 脚手架自测：三种类型各渲染一份到临时目录，断言文件清单、manifest 形态与占位符无残留。
// 这是「模板矩阵没断链」的最低保障：新增模板文件不进 plan、占位符改名不同步，
// 在这里第一时间红。
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPlan, renderProject, substitutionsOf } from '../src/render.ts'
import { buildManifests, buildPackageManifest } from '../src/manifest.ts'
import type { PluginType, ScaffoldOptions } from '../src/types.ts'

const TYPES: PluginType[] = ['host', 'client', 'full']

function fakeOpts(type: PluginType): ScaffoldOptions {
  return {
    packageName: '@acme/dsh-demo',
    pluginId: 'dsh-demo',
    title: 'demo',
    description: 'demo 插件',
    type,
    targetDir: '',
    install: false,
    git: false,
  }
}

function render(type: PluginType): { dir: string; count: number } {
  const dir = mkdtempSync(join(tmpdir(), `create-dsh-plugin-test-${type}-`))
  const opts = { ...fakeOpts(type), targetDir: dir }
  const count = renderProject(opts)
  return { dir, count }
}

describe('模板矩阵（三类型 × 文件清单）', () => {
  const expected: Record<PluginType, string[]> = {
    host: [
      'package.json', 'tsconfig.json', 'tsdown.config.ts', '.gitignore', 'README.md', 'LICENSE',
      'cordis.patch.yml', 'locale/en.json', 'locale/zh.json', 'icon.svg', 'tests/setup.ts', 'vitest.config.ts',
      'src/index.ts', 'src/config.ts', 'scripts/dev-hmr.mjs', 'scripts/lib/manifest-deps.mjs',
      'tests/bundle-shape.spec.ts',
    ],
    client: [
      'package.json', 'tsconfig.json', 'tsdown.config.ts', '.gitignore', 'README.md', 'LICENSE',
      'cordis.patch.yml', 'locale/en.json', 'locale/zh.json', 'icon.svg', 'tests/setup.ts', 'vitest.config.ts',
      'src/index.ts', 'src/client/index.tsx',
      'tests/bundle-shape.spec.ts', 'tests/client-boundary.spec.ts',
    ],
    // full 是 workspace 布局：根壳 + packages/dsh-demo/（typert 生成器结构性要求
    // 被分析的包位于 <root>/packages/ 下）
    full: [
      'package.json', 'pnpm-workspace.yaml', 'tsconfig.json', 'tsconfig.host.json', 'vitest.config.ts',
      '.gitignore', 'README.md', 'LICENSE',
      'packages/dsh-demo/package.json',
      'packages/dsh-demo/tsconfig.json', 'packages/dsh-demo/tsconfig.typert.json', 'packages/dsh-demo/tsdown.config.ts',
      'packages/dsh-demo/cordis.patch.yml',
      'packages/dsh-demo/locale/en.json', 'packages/dsh-demo/locale/zh.json', 'packages/dsh-demo/icon.svg',
      'packages/dsh-demo/tests/setup.ts',
      'packages/dsh-demo/src/index.ts', 'packages/dsh-demo/src/config.ts', 'packages/dsh-demo/src/remote.ts',
      'packages/dsh-demo/src/client/index.tsx',
      'packages/dsh-demo/scripts/dev-hmr.mjs', 'packages/dsh-demo/scripts/ensure-protocol.mjs',
      'packages/dsh-demo/scripts/lib/manifest-deps.mjs',
      'packages/dsh-demo/tests/bundle-shape.spec.ts', 'packages/dsh-demo/tests/client-boundary.spec.ts',
      'packages/dsh-demo/tests/protocol-vendor.spec.ts',
    ],
  }

  for (const type of TYPES) {
    it(`${type}：计划与实际产出一致`, () => {
      const plan = buildPlan(type, 'dsh-demo').map((f) => f.to).sort()
      const want = [...expected[type].filter((f) => !f.endsWith('package.json'))].sort()
      expect(plan).toEqual(want)
    })

    it(`${type}：渲染无占位符残留、manifest 形态正确`, () => {
      const { dir, count } = render(type)
      try {
        expect(count).toBe(expected[type].length)

        // 全部文本文件无占位符残留
        const walk = (d: string): string[] => readdirSync(d, { withFileTypes: true }).flatMap((e) => {
          const p = join(d, e.name)
          return e.isDirectory() ? walk(p) : [p]
        })
        for (const f of walk(dir)) {
          if (f.endsWith('LICENSE') || f.endsWith('pnpm-lock.yaml')) continue
          const text = readFileSync(f, 'utf8')
          expect(text.match(/__(?:PACKAGE_NAME|PLUGIN_ID|TITLE|DESCRIPTION|PASCAL_NAME|SERVICE_KEY|PLUGIN_TYPE_LABEL)__/), `${f} 有占位符残留`).toBeNull()
          expect(text.match(/<!--#if/), `${f} 有未处理的条件块`).toBeNull()
        }

        // 根 manifest：full = workspace 壳；单包 = 插件 manifest 本身
        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        expect(pkg.name).toBe(type === 'full' ? '@acme/dsh-demo-workspace' : '@acme/dsh-demo')
        // full 布局：插件 manifest 在 packages/<id>/，以下插件级断言都以它为对象
        const pluginManifestPath = type === 'full' ? join(dir, 'packages/dsh-demo', 'package.json') : join(dir, 'package.json')
        const plugin = type === 'full' ? JSON.parse(readFileSync(pluginManifestPath, 'utf8')) : pkg
        if (type === 'full') {
          expect(pkg.private).toBe(true)
          expect(pkg.scripts.build).toBe('pnpm --filter @acme/dsh-demo build')
          expect(plugin.private).toBeUndefined()
          expect(plugin.engines.dsh).toMatch(/^>=0\.2\.1-rc\.3/)
        } else {
          expect(pkg.engines.dsh).toMatch(/^>=0\.2\.1-rc\.3/)
        }
        expect(plugin.dsh.bundle.patch).toBe('./cordis.patch.yml')
        // 展示元数据的导出面（官方 checklist：Plugin Manager 在不激活插件时经 exports 读取）
        expect(plugin.exports['./locale/*.json']).toBe('./locale/*.json')
        expect(plugin.exports['./icon']).toBe('./icon.svg')
        if (type === 'host') {
          expect(plugin.dsh.client).toBeUndefined()
          expect(plugin.exports['./client']).toBeUndefined()
          expect(plugin.peerDependencies['@deepseek-ai/schemastery']).toBeTypeOf('string')
          expect(plugin.scripts['dev:hmr']).toBeTypeOf('string')
          expect(plugin.devDependencies['react']).toBeUndefined()
        } else {
          expect(plugin.dsh.client.platform).toBe('web')
          expect(plugin.exports['./client']).toBe('./lib/client.js')
          expect(plugin.devDependencies['react']).toBeTypeOf('string')
        }
        if (type === 'client') {
          expect(plugin.peerDependencies).toBeUndefined()
          expect(plugin.scripts['dev:hmr']).toBeUndefined()
          expect(plugin.devDependencies['@deepseek-ai/schemastery']).toBeUndefined()
        }
        if (type === 'full') {
          // typert 接线四件套：peer + 裸精确 pin + 生成器 devDep + 生成产物导出面
          expect(plugin.peerDependencies['@deepseek-ai/dsh-typert-protocol']).toBe('>=0.2.1-rc.3 <0.3.0-0')
          expect(plugin.devDependencies['@deepseek-ai/dsh-typert-protocol']).toBe('0.2.1-rc.3')
          expect(plugin.devDependencies['@deepseek-ai/dsh-typert-generator']).toBe('0.2.1-rc.3')
          expect((plugin.exports['./typert'] as { default: string }).default).toBe('./lib/typert.host.js')
          expect((plugin.exports['./remote'] as { default: string }).default).toBe('./lib/typert.remote-client.js')
          expect(plugin.dependencies.zod).toBe('^4.4.3')
          expect(plugin.scripts.preinstall).toBe('node scripts/ensure-protocol.mjs')
          expect(plugin.scripts.test).toBeUndefined() // 测试与类型检查由根壳承载
          expect(readFileSync(join(dir, 'tsconfig.host.json'), 'utf8')).toContain('packages/protocol/src/index.ts')
          expect(readFileSync(join(dir, 'packages/dsh-demo/tsdown.config.ts'), 'utf8')).toContain('typertPlugin')
          expect(readFileSync(join(dir, 'README.md'), 'utf8')).toContain('typert：client 与 host 的类型化 RPC')
        } else {
          expect(plugin.exports['./typert']).toBeUndefined()
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
    expect(full.root).not.toBeUndefined()
    expect((full.plugin.devDependencies as Record<string, string>)['@deepseek-ai/dsh-typert-generator']).toBe('0.2.1-rc.3')
  })

  it('substitutions 覆盖全部占位符名', () => {
    const sub = substitutionsOf(fakeOpts('full'))
    expect(Object.keys(sub).sort()).toEqual(['__DESCRIPTION__', '__PACKAGE_NAME__', '__PASCAL_NAME__', '__PLUGIN_ID__', '__PLUGIN_REL__', '__PLUGIN_TYPE_LABEL__', '__SERVICE_KEY__', '__TEST_INCLUDE__', '__TEST_SETUP__', '__TITLE__'].sort())
    expect(sub.__PASCAL_NAME__).toBe('Demo') // dsh-demo → Demo
    expect(sub.__SERVICE_KEY__).toBe('demo') // dsh-demo → demo（camelCase 服务键）
    expect(sub.__PLUGIN_REL__).toBe('packages/dsh-demo')
  })

  it('条件块按类型保留或剔除', () => {
    const readme = (t: PluginType): string => {
      const dir = mkdtempSync(join(tmpdir(), `create-dsh-plugin-test-cond-${t}-`))
      try {
        renderProject({ ...fakeOpts(t), targetDir: dir })
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
      for (const f of buildPlan(type)) {
        expect(existsSync(join(import.meta.dirname, '..', 'templates', f.from)), `模板缺失：${f.from}（type=${type}）`).toBe(true)
      }
    }
  })
})
