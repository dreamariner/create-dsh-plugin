// 跨形态重排：旧布局判定 + 目录清理 + 用户内容不覆盖
//
// 这块的风险全在「别把用户的代码弄丢」：重排要搬目录、要删旧路径，两头都是用户
// 的东西。这里的用例把三条纪律钉死：判定、搬运（用户版覆盖模板版）、清理。
import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupRearrangedLayout, detectOldLayout, isUserContentPath } from '../src/rearrange.ts'
import { renderProject } from '../src/render.ts'
import type { ScaffoldOptions } from '../src/types.ts'

function tmp(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix))
}

function opts(over: Partial<ScaffoldOptions> = {}): ScaffoldOptions {
  return {
    command: 'create',
    packageName: '@acme/dsh-demo',
    pluginId: 'dsh-demo',
    title: 'demo',
    description: 'demo 插件',
    type: 'host',
    targetDir: '',
    install: false,
    git: false,
    ...over,
  }
}

/** 造一个「已被用户改过的」单包仓：src/index.ts 里是用户逻辑，不是模板。 */
function seedSingleRepo(dir: string): void {
  mkdirSync(join(dir, 'src'), { recursive: true })
  mkdirSync(join(dir, 'tests'), { recursive: true })
  mkdirSync(join(dir, 'locale'), { recursive: true })
  writeFileSync(join(dir, 'src', 'index.ts'), '// 用户写的逻辑\n')
  writeFileSync(join(dir, 'src', 'utils.ts'), '// 用户自己的文件\n')
  writeFileSync(join(dir, 'tests', 'my-tool.spec.ts'), '// 用户自己的用例\n')
  writeFileSync(join(dir, 'tests', 'bundle-shape.spec.ts'), '// 模板护栏（单包版）\n')
  writeFileSync(join(dir, 'locale', 'zh.json'), '{"meta":{"title":"用户改的标题"}}\n')
  writeFileSync(join(dir, 'icon.svg'), '<svg>用户图标</svg>')
  writeFileSync(join(dir, 'cordis.patch.yml'), '- insert:\n    - id: dsh-demo\n')
  writeFileSync(join(dir, 'tsdown.config.ts'), '// 旧单配置\n')
  mkdirSync(join(dir, 'lib'), { recursive: true })
  writeFileSync(join(dir, 'lib', 'index.js'), '// 旧产物\n')
  writeFileSync(join(dir, 'package.json'), JSON.stringify({
    name: '@acme/dsh-demo', version: '0.1.0',
    dsh: { bundle: { patch: './cordis.patch.yml' } },
  }, null, 2) + '\n')
}

describe('detectOldLayout', () => {
  it('单包仓（根 manifest 带 dsh.bundle）→ single', () => {
    const dir = tmp('rearrange-single-')
    try {
      seedSingleRepo(dir)
      expect(detectOldLayout(dir)).toBe('single')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('workspace 仓（有 pnpm-workspace.yaml + packages/）→ workspace', () => {
    const dir = tmp('rearrange-ws-')
    try {
      writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
      mkdirSync(join(dir, 'packages', 'dsh-demo'), { recursive: true })
      expect(detectOldLayout(dir)).toBe('workspace')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('不是脚手架生成的仓 → undefined（不动用户的目录）', () => {
    const dir = tmp('rearrange-other-')
    try {
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: 'not-a-plugin' }))
      expect(detectOldLayout(dir)).toBeUndefined()
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('isUserContentPath', () => {
  it('src/ tests/ locale/ 与 icon.svg 属用户内容面', () => {
    expect(isUserContentPath('src/index.ts')).toBe(true)
    expect(isUserContentPath('packages/dsh-demo/tests/x.spec.ts')).toBe(true)
    expect(isUserContentPath('locale/zh.json')).toBe(true)
    expect(isUserContentPath('icon.svg')).toBe(true)
  })

  it('配置面不算用户内容面', () => {
    expect(isUserContentPath('package.json')).toBe(false)
    expect(isUserContentPath('tsdown.config.ts')).toBe(false)
    expect(isUserContentPath('docs/issues/AGENTS.md')).toBe(false)
  })
})

describe('重排渲染：不覆盖用户内容面', () => {
  it('目标已存在 src/index.ts → 保留用户的版本，模板只补缺失的', () => {
    const dir = tmp('rearrange-render-')
    try {
      renderProject(opts({ targetDir: dir }))
      writeFileSync(join(dir, 'src', 'index.ts'), '// 用户写的逻辑\n')
      renderProject(opts({ targetDir: dir }), { preserveUserContent: true })
      expect(readFileSync(join(dir, 'src', 'index.ts'), 'utf8')).toContain('用户写的逻辑')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('不传 preserveUserContent（新建仓）→ 模板照常写', () => {
    const dir = tmp('rearrange-render2-')
    try {
      renderProject(opts({ targetDir: dir }))
      writeFileSync(join(dir, 'src', 'index.ts'), '// 用户写的逻辑\n')
      renderProject(opts({ targetDir: dir }))
      expect(readFileSync(join(dir, 'src', 'index.ts'), 'utf8')).not.toContain('用户写的逻辑')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('cleanupRearrangedLayout：single → workspace', () => {
  it('旧内容搬进 packages/<id>/，旧路径删干净', () => {
    const dir = tmp('rearrange-move-')
    try {
      seedSingleRepo(dir)
      // 新布局已渲染（插件包在 packages/dsh-demo/）
      mkdirSync(join(dir, 'packages', 'dsh-demo', 'src'), { recursive: true })
      writeFileSync(join(dir, 'packages', 'dsh-demo', 'src', 'index.ts'), '// 模板版\n')

      const r = cleanupRearrangedLayout(dir, { pluginId: 'dsh-demo', packageName: '@acme/dsh-demo', oldPackageName: '@acme/dsh-demo' }, 'single', 'workspace')

      expect(r.ran).toBe(true)
      // 用户的代码搬到了新位置（用户版占位）
      expect(readFileSync(join(dir, 'packages', 'dsh-demo', 'src', 'index.ts'), 'utf8')).toContain('用户写的逻辑')
      // 与新形态模板同名 → 模板版备份成 .template（两边都留）
      expect(readFileSync(join(dir, 'packages', 'dsh-demo', 'src', 'index.ts.template'), 'utf8')).toContain('模板版')
      expect(r.conflicts).toContain('src/index.ts')
      expect(existsSync(join(dir, 'packages', 'dsh-demo', 'src', 'utils.ts'))).toBe(true)
      expect(existsSync(join(dir, 'packages', 'dsh-demo', 'tests', 'my-tool.spec.ts'))).toBe(true)
      expect(readFileSync(join(dir, 'packages', 'dsh-demo', 'locale', 'zh.json'), 'utf8')).toContain('用户改的标题')
      expect(readFileSync(join(dir, 'packages', 'dsh-demo', 'icon.svg'), 'utf8')).toContain('用户图标')
      // 护栏 spec 不搬（内容随布局变，用新布局的模板版）
      expect(existsSync(join(dir, 'packages', 'dsh-demo', 'tests', 'bundle-shape.spec.ts'))).toBe(false)
      // 旧路径删干净
      for (const p of ['src', 'tests', 'locale', 'icon.svg', 'tsdown.config.ts', 'lib']) {
        expect(existsSync(join(dir, p)), `${p} 应已删除`).toBe(false)
      }
      expect(r.removed).toContain('src')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('包名变了 → bundle patch 不搬（旧行 id 与新 manifest 对不上），并给出告警', () => {
    const dir = tmp('rearrange-rename-')
    try {
      seedSingleRepo(dir)
      mkdirSync(join(dir, 'packages', 'dsh-demo'), { recursive: true })
      const r = cleanupRearrangedLayout(dir, { pluginId: 'dsh-demo', packageName: '@acme/dsh-new', oldPackageName: '@acme/dsh-demo' }, 'single', 'workspace')
      expect(r.moved).not.toContain('cordis.patch.yml')
      expect(r.warnings.join('\n')).toContain('cordis.patch.yml')
      expect(existsSync(join(dir, 'cordis.patch.yml'))).toBe(false) // 旧的删掉，新模板那份留着
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('cleanupRearrangedLayout：workspace → single', () => {
  it('插件包内容搬回仓根，packages/<id> 与 workspace 声明删干净', () => {
    const dir = tmp('rearrange-tosingle-')
    try {
      writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
      const pkg = join(dir, 'packages', 'dsh-demo')
      mkdirSync(join(pkg, 'src'), { recursive: true })
      mkdirSync(join(pkg, 'packages', 'protocol'), { recursive: true })
      writeFileSync(join(pkg, 'src', 'index.ts'), '// 用户的逻辑\n')
      writeFileSync(join(pkg, 'package.json'), '{"name":"@acme/dsh-demo"}\n')

      const r = cleanupRearrangedLayout(dir, { pluginId: 'dsh-demo', packageName: '@acme/dsh-demo' }, 'workspace', 'single')
      expect(r.ran).toBe(true)
      expect(readFileSync(join(dir, 'src', 'index.ts'), 'utf8')).toContain('用户的逻辑')
      expect(existsSync(join(dir, 'packages', 'dsh-demo'))).toBe(false)
      expect(existsSync(join(dir, 'pnpm-workspace.yaml'))).toBe(false)
      expect(existsSync(join(dir, 'packages', 'protocol'))).toBe(false) // 协议 submodule 也随之清掉
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('packages/ 里还有别的插件包 → 不清理（不替你决定删哪个），并给出告警', () => {
    const dir = tmp('rearrange-other-pkg-')
    try {
      writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
      mkdirSync(join(dir, 'packages', 'dsh-demo', 'src'), { recursive: true })
      mkdirSync(join(dir, 'packages', 'dsh-other', 'src'), { recursive: true })
      writeFileSync(join(dir, 'packages', 'dsh-demo', 'src', 'index.ts'), '// 用户的逻辑\n')

      const r = cleanupRearrangedLayout(dir, { pluginId: 'dsh-demo', packageName: '@acme/dsh-demo' }, 'workspace', 'single')
      expect(r.ran).toBe(false)
      expect(r.warnings.join('\n')).toContain('dsh-other')
      expect(existsSync(join(dir, 'packages', 'dsh-demo', 'src', 'index.ts'))).toBe(true) // 原样保留
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
