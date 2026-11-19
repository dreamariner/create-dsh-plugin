// 跨形态重排：旧布局判定 + 目录清理 + 用户内容不覆盖
//
// 这块的风险全在「别把用户的代码弄丢」：重排要搬目录、要删旧路径，两头都是用户
// 的东西。这里的用例把三条纪律钉死：判定、搬运（用户版占位 + 模板版备份）、清理
// （含旧布局孤儿配置）。
import { describe, expect, it } from 'vitest'
import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { cleanupRearrangedLayout, detectOldLayout, isUserContentPath, type Layout, type RearrangeInput } from '../src/rearrange.ts'
import { renderProject, substitutionsOf } from '../src/render.ts'
import type { PluginType, ScaffoldOptions } from '../src/types.ts'

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

/** 重排输入：subs 按旧布局取（与 finalize 的传法一致）。 */
function input(over: Partial<RearrangeInput> & { newType: PluginType }, oldLayout: Layout): RearrangeInput {
  return {
    pluginId: 'dsh-demo',
    packageName: '@acme/dsh-demo',
    subs: substitutionsOf(opts({ ...over, type: over.newType } as Partial<ScaffoldOptions>), oldLayout),
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
  writeFileSync(join(dir, 'tests', 'setup.ts'), '// 用户改过的隔离逻辑\n')
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

/** 造一个旧 full workspace 仓：packages/<id>/（用户内容 + patch）+ protocol + 根孤儿配置。 */
function seedWorkspaceRepo(dir: string, o: { pluginId?: string; pkgName?: string; others?: string[] } = {}): void {
  const id = o.pluginId ?? 'dsh-demo'
  const pkgName = o.pkgName ?? '@acme/dsh-demo'
  writeFileSync(join(dir, 'pnpm-workspace.yaml'), 'packages:\n  - packages/*\n')
  const pkg = join(dir, 'packages', id)
  mkdirSync(join(pkg, 'src'), { recursive: true })
  mkdirSync(join(pkg, 'tests'), { recursive: true })
  mkdirSync(join(pkg, 'locale'), { recursive: true })
  writeFileSync(join(pkg, 'src', 'index.ts'), '// 用户写的逻辑\n')
  writeFileSync(join(pkg, 'tests', 'my-tool.spec.ts'), '// 用户自己的用例\n')
  writeFileSync(join(pkg, 'locale', 'zh.json'), '{"meta":{"title":"用户改的标题"}}\n')
  writeFileSync(join(pkg, 'icon.svg'), '<svg>用户图标</svg>')
  writeFileSync(join(pkg, 'cordis.patch.yml'), `- insert:\n    - id: ${id}\n`)
  writeFileSync(join(pkg, 'package.json'), JSON.stringify({ name: pkgName, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  // 根上的单包模板面（重排渲染会先写这些）
  mkdirSync(join(dir, 'src'), { recursive: true })
  writeFileSync(join(dir, 'src', 'index.ts'), '// 新形态模板版\n')
  // 根 patch 带模板注释头（与包里用户改过的版本内容不同 → 构成冲突场景）
  writeFileSync(join(dir, 'cordis.patch.yml'), `# 自挂载 bundle patch\n- insert:\n    - id: ${id}\n`)
  writeFileSync(join(dir, 'package.json'), JSON.stringify({ name: `${id}-single`, dsh: { bundle: { patch: './cordis.patch.yml' } } }))
  // full 布局的根孤儿配置
  writeFileSync(join(dir, 'tsconfig.host.json'), '{ "references": [] }\n')
  mkdirSync(join(dir, 'scripts'), { recursive: true })
  writeFileSync(join(dir, 'scripts', 'ensure-protocol.mjs'), '// 守卫\n')
  writeFileSync(join(dir, 'scripts', 'sync-pack-docs.mjs'), '// 同步\n')
  writeFileSync(join(dir, 'scripts', 'dev-hmr.mjs'), '// hmr\n')
  // protocol submodule（目录 + 仅登记 protocol 的 .gitmodules）
  mkdirSync(join(dir, 'packages', 'protocol'), { recursive: true })
  writeFileSync(join(dir, '.gitmodules'), '[submodule "packages/protocol"]\n\tpath = packages/protocol\n\turl = git@example.com:x.git\n')
  for (const other of o.others ?? []) {
    mkdirSync(join(dir, 'packages', other), { recursive: true })
    writeFileSync(join(dir, 'packages', other, 'package.json'), '{}')
  }
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
  it('旧内容搬进 packages/<id>/，旧路径删干净；setup.ts 照用户内容搬', () => {
    const dir = tmp('rearrange-move-')
    try {
      seedSingleRepo(dir)
      // 新布局已渲染（插件包在 packages/dsh-demo/）
      mkdirSync(join(dir, 'packages', 'dsh-demo', 'src'), { recursive: true })
      writeFileSync(join(dir, 'packages', 'dsh-demo', 'src', 'index.ts'), '// 模板版\n')

      const r = cleanupRearrangedLayout(dir, input({ newType: 'full', oldPackageName: '@acme/dsh-demo' }, 'single'), 'single', 'workspace')

      expect(r.ran).toBe(true)
      // 用户的代码搬到了新位置（用户版占位）
      expect(readFileSync(join(dir, 'packages', 'dsh-demo', 'src', 'index.ts'), 'utf8')).toContain('用户写的逻辑')
      // 与新形态模板同名 → 模板版备份成 .template（两边都留）
      expect(readFileSync(join(dir, 'packages', 'dsh-demo', 'src', 'index.ts.template'), 'utf8')).toContain('模板版')
      expect(r.conflicts).toContain('src/index.ts')
      expect(existsSync(join(dir, 'packages', 'dsh-demo', 'src', 'utils.ts'))).toBe(true)
      expect(existsSync(join(dir, 'packages', 'dsh-demo', 'tests', 'my-tool.spec.ts'))).toBe(true)
      // setup.ts 是用户可编辑的测试夹具：照用户内容搬（用户改过的隔离逻辑不能丢）
      expect(readFileSync(join(dir, 'packages', 'dsh-demo', 'tests', 'setup.ts'), 'utf8')).toContain('用户改过的隔离逻辑')
      // 护栏 spec 不搬（内容随布局变，用新布局的模板版）
      expect(existsSync(join(dir, 'packages', 'dsh-demo', 'tests', 'bundle-shape.spec.ts'))).toBe(false)
      // locale / icon 冲突不备份（模板版是通用占位，备份会污染 npm 包的 files）
      expect(readFileSync(join(dir, 'packages', 'dsh-demo', 'locale', 'zh.json'), 'utf8')).toContain('用户改的标题')
      expect(existsSync(join(dir, 'packages', 'dsh-demo', 'locale', 'zh.json.template'))).toBe(false)
      expect(r.conflicts).not.toContain('locale/zh.json')
      expect(existsSync(join(dir, 'packages', 'dsh-demo', 'icon.svg.template'))).toBe(false)
      expect(readFileSync(join(dir, 'packages', 'dsh-demo', 'icon.svg'), 'utf8')).toContain('用户图标')
      // bundle patch 随身份搬运（包名没变）
      expect(r.moved).toContain('cordis.patch.yml')
      // 旧路径删干净
      for (const p of ['src', 'tests', 'locale', 'icon.svg', 'tsdown.config.ts', 'lib']) {
        expect(existsSync(join(dir, p)), `${p} 应已删除`).toBe(false)
      }
      expect(r.removed).toContain('src')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('已有 .template（上次重排的备份）不被本次覆盖', () => {
    const dir = tmp('rearrange-tpl2-')
    try {
      seedSingleRepo(dir)
      const pkg = join(dir, 'packages', 'dsh-demo')
      mkdirSync(join(pkg, 'src'), { recursive: true })
      writeFileSync(join(pkg, 'src', 'index.ts'), '// 模板版\n')
      writeFileSync(join(pkg, 'src', 'index.ts.template'), '// 上次重排的备份（用户改过）\n')

      cleanupRearrangedLayout(dir, input({ newType: 'full', oldPackageName: '@acme/dsh-demo' }, 'single'), 'single', 'workspace')
      expect(readFileSync(join(pkg, 'src', 'index.ts.template'), 'utf8')).toContain('上次重排的备份')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('包名变了 → bundle patch 不搬（旧行 id 与新 manifest 对不上），并给出告警', () => {
    const dir = tmp('rearrange-rename-')
    try {
      seedSingleRepo(dir)
      mkdirSync(join(dir, 'packages', 'dsh-demo'), { recursive: true })
      const r = cleanupRearrangedLayout(dir, input({ newType: 'full', packageName: '@acme/dsh-new', oldPackageName: '@acme/dsh-demo' }, 'single'), 'single', 'workspace')
      expect(r.moved).not.toContain('cordis.patch.yml')
      expect(r.warnings.join('\n')).toContain('cordis.patch.yml')
      expect(existsSync(join(dir, 'cordis.patch.yml'))).toBe(false) // 旧的删掉，新模板那份留着
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('旧包名读不出来（manifest 缺失 / 损坏）→ 保守不搬 patch，给出告警', () => {
    const dir = tmp('rearrange-noname-')
    try {
      seedSingleRepo(dir)
      rmSync(join(dir, 'package.json'))
      mkdirSync(join(dir, 'packages', 'dsh-demo'), { recursive: true })
      const r = cleanupRearrangedLayout(dir, input({ newType: 'full' }, 'single'), 'single', 'workspace')
      expect(r.moved).not.toContain('cordis.patch.yml')
      expect(r.warnings.join('\n')).toContain('读不出来')
      expect(existsSync(join(dir, 'cordis.patch.yml'))).toBe(false)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('cleanupRearrangedLayout：workspace → single', () => {
  it('插件包内容搬回仓根（含 patch 与模板备份），孤儿配置与 workspace 声明清干净', () => {
    const dir = tmp('rearrange-tosingle-')
    try {
      seedWorkspaceRepo(dir)
      const r = cleanupRearrangedLayout(dir, input({ newType: 'host' }, 'workspace'), 'workspace', 'single')
      expect(r.ran).toBe(true)
      // 用户的代码在仓根（用户版占位），根上的模板版备份成 .template
      expect(readFileSync(join(dir, 'src', 'index.ts'), 'utf8')).toContain('用户写的逻辑')
      expect(readFileSync(join(dir, 'src', 'index.ts.template'), 'utf8')).toContain('新形态模板版')
      expect(existsSync(join(dir, 'tests', 'my-tool.spec.ts'))).toBe(true)
      expect(readFileSync(join(dir, 'locale', 'zh.json'), 'utf8')).toContain('用户改的标题')
      // bundle patch：用户包里的版本占位，根上刚渲染的模板版备份
      expect(readFileSync(join(dir, 'cordis.patch.yml'), 'utf8')).toContain('- id: dsh-demo')
      expect(existsSync(join(dir, 'cordis.patch.yml.template'))).toBe(true)
      // workspace 声明与协议 submodule 目录清干净
      expect(existsSync(join(dir, 'packages', 'dsh-demo'))).toBe(false)
      expect(existsSync(join(dir, 'pnpm-workspace.yaml'))).toBe(false)
      expect(existsSync(join(dir, 'packages', 'protocol'))).toBe(false)
      // full 布局的根孤儿配置清干净（新形态 host 保留 dev-hmr）
      expect(existsSync(join(dir, 'tsconfig.host.json'))).toBe(false)
      expect(existsSync(join(dir, 'scripts', 'ensure-protocol.mjs'))).toBe(false)
      expect(existsSync(join(dir, 'scripts', 'sync-pack-docs.mjs'))).toBe(false)
      expect(existsSync(join(dir, 'scripts', 'dev-hmr.mjs'))).toBe(true)
      // .gitmodules 只登记了 protocol → 一并清掉
      expect(existsSync(join(dir, '.gitmodules'))).toBe(false)
      expect(r.removed).toContain('tsconfig.host.json')
      expect(r.removed).toContain('.gitmodules')
      // host 形态下搬过来的 src/remote.ts / src/client 才算死代码：本仓没有 → 无死半边告警
      expect(r.warnings.join('\n')).not.toContain('不属于它的半边')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('full → client：dev-hmr 是孤儿一并清；搬过来的旧半边代码给出死代码告警', () => {
    const dir = tmp('rearrange-toclient-')
    try {
      seedWorkspaceRepo(dir, { pluginId: 'dsh-demo', pkgName: '@acme/dsh-demo' })
      // 旧包是 full：带 remote、config（host 半边）与 client 半边
      mkdirSync(join(dir, 'packages', 'dsh-demo', 'src', 'client'), { recursive: true })
      writeFileSync(join(dir, 'packages', 'dsh-demo', 'src', 'remote.ts'), '// 用户 Remote\n')
      writeFileSync(join(dir, 'packages', 'dsh-demo', 'src', 'config.ts'), '// 用户 Config\n')
      writeFileSync(join(dir, 'packages', 'dsh-demo', 'src', 'client', 'index.tsx'), '// 用户 client\n')

      const r = cleanupRearrangedLayout(dir, input({ newType: 'client' }, 'workspace'), 'workspace', 'single')
      expect(r.ran).toBe(true)
      expect(existsSync(join(dir, 'scripts', 'dev-hmr.mjs'))).toBe(false)
      // 死半边代码搬过来了，但要明说：client 形态下 remote 与 config 是死代码，
      // src/client/ 反而是 client 半边本体，不在告警里
      expect(existsSync(join(dir, 'src', 'remote.ts'))).toBe(true)
      expect(existsSync(join(dir, 'src', 'config.ts'))).toBe(true)
      expect(r.warnings.join('\n')).toContain('src/remote.ts')
      expect(r.warnings.join('\n')).toContain('src/config.ts')
      expect(r.warnings.join('\n')).not.toContain('src/client/')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('full → host：src/client/ 与 src/remote.ts 都算死代码', () => {
    const dir = tmp('rearrange-tohost-')
    try {
      seedWorkspaceRepo(dir)
      mkdirSync(join(dir, 'packages', 'dsh-demo', 'src', 'client'), { recursive: true })
      writeFileSync(join(dir, 'packages', 'dsh-demo', 'src', 'remote.ts'), '// 用户 Remote\n')
      writeFileSync(join(dir, 'packages', 'dsh-demo', 'src', 'client', 'index.tsx'), '// 用户 client\n')
      const r = cleanupRearrangedLayout(dir, input({ newType: 'host' }, 'workspace'), 'workspace', 'single')
      expect(r.ran).toBe(true)
      expect(r.warnings.join('\n')).toContain('src/remote.ts')
      expect(r.warnings.join('\n')).toContain('src/client/')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('packages/ 里还有别的插件包 → 不清理（不替你决定删哪个），并给出告警', () => {
    const dir = tmp('rearrange-other-pkg-')
    try {
      seedWorkspaceRepo(dir, { others: ['dsh-other'] })
      const r = cleanupRearrangedLayout(dir, input({ newType: 'host' }, 'workspace'), 'workspace', 'single')
      expect(r.ran).toBe(false)
      expect(r.warnings.join('\n')).toContain('dsh-other')
      expect(existsSync(join(dir, 'packages', 'dsh-demo', 'src', 'index.ts'))).toBe(true) // 原样保留
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('packages/ 里的杂散文件也算「别的条目」→ 不清理', () => {
    const dir = tmp('rearrange-stray-')
    try {
      seedWorkspaceRepo(dir)
      writeFileSync(join(dir, 'packages', 'README.md'), '# 说明\n')
      const r = cleanupRearrangedLayout(dir, input({ newType: 'host' }, 'workspace'), 'workspace', 'single')
      expect(r.ran).toBe(false)
      expect(r.warnings.join('\n')).toContain('README.md')
      expect(existsSync(join(dir, 'packages', 'README.md'))).toBe(true)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('.gitmodules 还登记着别的 submodule → 保留并告警（protocol 目录仍随 packages 删除）', () => {
    const dir = tmp('rearrange-gitsub-')
    try {
      seedWorkspaceRepo(dir)
      writeFileSync(join(dir, '.gitmodules'), '[submodule "packages/protocol"]\n\tpath = packages/protocol\n\turl = git@example.com:p.git\n[submodule "other"]\n\tpath = other\n\turl = git@example.com:o.git\n')
      const r = cleanupRearrangedLayout(dir, input({ newType: 'host' }, 'workspace'), 'workspace', 'single')
      expect(r.ran).toBe(true)
      expect(existsSync(join(dir, '.gitmodules'))).toBe(true)
      expect(r.warnings.join('\n')).toContain('.gitmodules')
      expect(existsSync(join(dir, 'packages', 'protocol'))).toBe(false)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})

describe('未改动的模板文件：不搬运，新形态模板原位生效', () => {
  it('未动过的 host 单包 → full：演示代码被清理，full 模板（含 Remote 接线）原位生效', () => {
    const dir = tmp('rearrange-untouched-up-')
    try {
      // 旧单包仓（未改动）+ 新 full 布局渲染
      renderProject(opts({ type: 'host', targetDir: dir }))
      renderProject(opts({ type: 'full', targetDir: dir }), { preserveUserContent: true })

      const r = cleanupRearrangedLayout(dir, input({ newType: 'full', oldPackageName: '@acme/dsh-demo' }, 'single'), 'single', 'workspace')
      expect(r.ran).toBe(true)
      // 没有用户代码可搬：内容文件全被判定为未改动模板（patch 除外，身份搬运）
      expect(r.moved.filter((m) => m !== 'cordis.patch.yml')).toEqual([])
      expect(r.conflicts).toEqual([])
      // full 模板原位生效：src/index.ts 是带 Remote 接线的 full 版，不是 host 版
      const idx = readFileSync(join(dir, 'packages', 'dsh-demo', 'src', 'index.ts'), 'utf8')
      expect(idx).toContain('Remote')
      expect(existsSync(join(dir, 'packages', 'dsh-demo', 'src', 'remote.ts'))).toBe(true)
      // 旧根内容面清干净
      expect(existsSync(join(dir, 'src'))).toBe(false)
      expect(existsSync(join(dir, 'tsdown.config.ts'))).toBe(false)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('未动过的 full workspace → host：演示代码被清理，host 模板原位生效，孤儿配置清干净', () => {
    const dir = tmp('rearrange-untouched-down-')
    try {
      renderProject(opts({ type: 'full', targetDir: dir }))
      renderProject(opts({ type: 'host', targetDir: dir }), { preserveUserContent: true })

      const r = cleanupRearrangedLayout(dir, input({ newType: 'host' }, 'workspace'), 'workspace', 'single')
      expect(r.ran).toBe(true)
      expect(r.moved.filter((m) => m !== 'cordis.patch.yml')).toEqual([])
      expect(r.conflicts).toEqual([])
      // full 的演示代码（remote / client）没有搬进新仓：构建不会红
      expect(existsSync(join(dir, 'src', 'remote.ts'))).toBe(false)
      expect(existsSync(join(dir, 'src', 'client'))).toBe(false)
      // host 模板原位生效
      const idx = readFileSync(join(dir, 'src', 'index.ts'), 'utf8')
      expect(idx).not.toContain('Remote')
      expect(existsSync(join(dir, 'src', 'config.ts'))).toBe(true)
      // 孤儿配置清干净
      expect(existsSync(join(dir, 'tsconfig.host.json'))).toBe(false)
      expect(existsSync(join(dir, 'pnpm-workspace.yaml'))).toBe(false)
      expect(existsSync(join(dir, 'packages'))).toBe(false)
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('部分改动（index.ts 改过、remote.ts 没动）：index.ts 照搬，remote.ts 清理，Remote 接线断链有告警', () => {
    const dir = tmp('rearrange-partial-')
    try {
      renderProject(opts({ type: 'full', targetDir: dir }))
      const idxPath = join(dir, 'packages', 'dsh-demo', 'src', 'index.ts')
      writeFileSync(idxPath, `${readFileSync(idxPath, 'utf8')}\n// 用户加的业务逻辑\n`)
      renderProject(opts({ type: 'host', targetDir: dir }), { preserveUserContent: true })

      const r = cleanupRearrangedLayout(dir, input({ newType: 'host' }, 'workspace'), 'workspace', 'single')
      expect(r.ran).toBe(true)
      // 用户改过的 index.ts 照搬；没动过的 remote.ts 不搬
      expect(readFileSync(join(dir, 'src', 'index.ts'), 'utf8')).toContain('用户加的业务逻辑')
      expect(existsSync(join(dir, 'src', 'remote.ts'))).toBe(false)
      // index.ts 还接着 Remote：构建会红，告警把话说破
      expect(r.warnings.join('\n')).toContain('Remote 接线')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })
})
