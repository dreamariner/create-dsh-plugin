// 脚手架自测：三种类型各渲染一份到临时目录，断言文件清单、manifest 形态与占位符无残留。
// 这是「模板矩阵没断链」的最低保障：新增模板文件不进 plan、占位符改名不同步，
// 在这里第一时间红。
import { describe, expect, it } from 'vitest'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { buildPlan, renderProject, substitutionsOf } from '../src/render.ts'
import { buildManifest } from '../src/manifest.ts'
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
    full: [
      'package.json', 'tsconfig.json', 'tsdown.config.ts', '.gitignore', 'README.md', 'LICENSE',
      'cordis.patch.yml', 'locale/en.json', 'locale/zh.json', 'icon.svg', 'tests/setup.ts', 'vitest.config.ts',
      'src/index.ts', 'src/config.ts', 'src/client/index.tsx', 'scripts/dev-hmr.mjs', 'scripts/lib/manifest-deps.mjs',
      'tests/bundle-shape.spec.ts', 'tests/client-boundary.spec.ts',
    ],
  }

  for (const type of TYPES) {
    it(`${type}：计划与实际产出一致`, () => {
      const plan = buildPlan(type).map((f) => f.to).sort()
      const want = [...expected[type].filter((f) => f !== 'package.json')].sort()
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
          expect(text.match(/__(?:PACKAGE_NAME|PLUGIN_ID|TITLE|DESCRIPTION|PASCAL_NAME|PLUGIN_TYPE_LABEL)__/), `${f} 有占位符残留`).toBeNull()
        }

        const pkg = JSON.parse(readFileSync(join(dir, 'package.json'), 'utf8'))
        expect(pkg.name).toBe('@acme/dsh-demo')
        expect(pkg.private).toBeUndefined()
        expect(pkg.engines.dsh).toMatch(/^>=0\.2\.1-rc\.3/)
        expect(pkg.dsh.bundle.patch).toBe('./cordis.patch.yml')
        if (type === 'host') {
          expect(pkg.dsh.client).toBeUndefined()
          expect(pkg.exports['./client']).toBeUndefined()
          expect(pkg.peerDependencies['@deepseek-ai/schemastery']).toBeTypeOf('string')
          expect(pkg.scripts['dev:hmr']).toBeTypeOf('string')
          expect(pkg.devDependencies['react']).toBeUndefined()
        } else {
          expect(pkg.dsh.client.platform).toBe('web')
          expect(pkg.exports['./client']).toBe('./lib/client.js')
          expect(pkg.devDependencies['react']).toBeTypeOf('string')
        }
        if (type === 'client') {
          expect(pkg.peerDependencies).toBeUndefined()
          expect(pkg.scripts['dev:hmr']).toBeUndefined()
          expect(pkg.devDependencies['@deepseek-ai/schemastery']).toBeUndefined()
        }

        // README 的形态标签已替换
        expect(readFileSync(join(dir, 'README.md'), 'utf8')).toContain('形态：')
      } finally {
        rmSync(dir, { recursive: true, force: true })
      }
    })
  }

  it('buildManifest 的 devDeps 按类型精确变化（host 有 schemastery+cordis，client 有 react）', () => {
    const host = buildManifest({ packageName: 'a', pluginId: 'a', description: 'a', type: 'host' }) as { devDependencies: Record<string, string> }
    const client = buildManifest({ packageName: 'b', pluginId: 'b', description: 'b', type: 'client' }) as { devDependencies: Record<string, string> }
    expect(host.devDependencies['@deepseek-ai/schemastery']).toBe('3.18.5')
    expect(host.devDependencies['@deepseek-ai/cordis']).toBe('4.0.5')
    expect(client.devDependencies['@deepseek-ai/schemastery']).toBeUndefined()
    expect(client.devDependencies['react']).toBe('^18.2.0')
  })

  it('substitutions 覆盖全部占位符名', () => {
    const sub = substitutionsOf(fakeOpts('full'))
    expect(Object.keys(sub).sort()).toEqual(['__DESCRIPTION__', '__PACKAGE_NAME__', '__PASCAL_NAME__', '__PLUGIN_ID__', '__PLUGIN_TYPE_LABEL__', '__TITLE__'].sort())
    expect(sub.__PASCAL_NAME__).toBe('Demo') // dsh-demo → Demo
  })

  it('plan 里的每个文件都真实存在（模板没断链）', () => {
    for (const type of TYPES) {
      for (const f of buildPlan(type)) {
        expect(existsSync(join(import.meta.dirname, '..', 'templates', f.from)), `模板缺失：${f.from}（type=${type}）`).toBe(true)
      }
    }
  })
})
