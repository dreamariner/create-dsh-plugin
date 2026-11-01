import { describe, expect, it } from 'vitest'
import { migrateRootLinkInstalls, printNextSteps } from '../src/finalize.ts'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, symlinkSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import type { ScaffoldOptions } from '../src/types.ts'

function opts(partial: Partial<ScaffoldOptions>): ScaffoldOptions {
  return {
    command: 'create',
    pluginId: 'dsh-demo',
    packageName: '@dreamariner/dsh-demo',
    projectName: undefined,
    type: 'host',
    title: 'Demo',
    description: 'demo',
    targetDir: '/tmp/whatever',
    install: false,
    git: false,
    protocolUrl: undefined,
    ...partial,
  } as ScaffoldOptions
}

/** 捕获 printNextSteps 的 stdout（它只 console.log 一整块）。 */
function capture(fn: () => void): string {
  const chunks: string[] = []
  const orig = console.log
  console.log = (...args: unknown[]) => chunks.push(args.join(' '))
  try { fn() } finally { console.log = orig }
  return chunks.join('\n')
}

const RESULT = {
  installed: true, gitInited: false, protocolSubmodule: 'added' as const,
  hostFace: 'skipped' as const, migration: { ran: false, migrated: [], errors: [] },
}

describe('printNextSteps 重排迁移报告', () => {
  it('有迁移记录 → 报告 from → to 与重启提醒', () => {
    const out = capture(() => printNextSteps(opts({}), {
      ...RESULT,
      migration: { ran: true, migrated: [{ profile: 'desktop', from: 'link:/repo', to: 'link:/repo/packages/dsh-demo', renamed: false, installed: true }], errors: [] },
    }))
    expect(out).toContain('重排迁移')
    expect(out).toContain('desktop: link:/repo → link:/repo/packages/dsh-demo')
    expect(out).toContain('重启一次才生效')
  })

  it('重排但没扫到旧安装 → 保留提示（不无声通过）', () => {
    const out = capture(() => printNextSteps(opts({}), {
      ...RESULT, migration: { ran: true, migrated: [], errors: [] },
    }))
    expect(out).toContain('没扫到')
    expect(out).toContain('静默失效')
  })

  it('非重排 → 不出现任何迁移内容', () => {
    const out = capture(() => printNextSteps(opts({}), RESULT))
    expect(out).not.toContain('重排迁移')
    expect(out).not.toContain('没扫到')
  })
})

describe('migrateRootLinkInstalls', () => {
  function scenario() {
    const home = mkdtempSync(join(tmpdir(), 'mig-home-'))
    const repo = mkdtempSync(join(tmpdir(), 'mig-repo-'))
    const profile = join(home, 'profiles', 'desktop')
    mkdirSync(join(profile, 'node_modules', '@dreamariner'), { recursive: true })
    // 旧装法：link:<repo根>，目标 manifest 是根壳（无 dsh.bundle）
    writeFileSync(join(repo, 'package.json'), JSON.stringify({ name: 'dsh-demo-workspace' }))
    symlinkSync(repo, join(profile, 'node_modules', '@dreamariner', 'dsh-demo'))
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'profile',
      dependencies: { '@dreamariner/dsh-demo': `link:${repo}` },
      dsh: { profile: { bundles: ['@dreamariner/dsh-demo'] } },
    }, null, 2) + '\n')
    return { home, repo, manifestPath: join(profile, 'package.json') }
  }

  it('包名沿用：只改依赖值指向 packages/<id>', () => {
    const s = scenario()
    try {
      const report = migrateRootLinkInstalls(
        opts({ targetDir: s.repo, pluginId: 'dsh-demo', packageName: '@dreamariner/dsh-demo', type: 'full' }),
        s.home, false,
      )
      expect(report.migrated).toHaveLength(1)
      expect(report.migrated[0]).toMatchObject({ profile: 'desktop', renamed: false, to: `link:${s.repo}/packages/dsh-demo` })
      const m = JSON.parse(readFileSync(s.manifestPath, 'utf8'))
      expect(m.dependencies['@dreamariner/dsh-demo']).toBe(`link:${s.repo}/packages/dsh-demo`)
      expect(m.dsh.profile.bundles).toEqual(['@dreamariner/dsh-demo'])
    } finally { rmSync(s.home, { recursive: true, force: true }); rmSync(s.repo, { recursive: true, force: true }) }
  })

  it('包名变了（重排改了根名）：dependencies 键 + bundles 名单一起改名', () => {
    const s = scenario()
    try {
      const report = migrateRootLinkInstalls(
        opts({ targetDir: s.repo, pluginId: 'dsh-demo', packageName: '@dreamariner/dsh-demo-x', type: 'full' }),
        s.home, false,
      )
      expect(report.migrated[0]).toMatchObject({ renamed: true })
      const m = JSON.parse(readFileSync(s.manifestPath, 'utf8'))
      expect(m.dependencies['@dreamariner/dsh-demo']).toBeUndefined()
      expect(m.dependencies['@dreamariner/dsh-demo-x']).toBe(`link:${s.repo}/packages/dsh-demo`)
      expect(m.dsh.profile.bundles).toEqual(['@dreamariner/dsh-demo-x'])
    } finally { rmSync(s.home, { recursive: true, force: true }); rmSync(s.repo, { recursive: true, force: true }) }
  })

  it('toRoot（回迁单包）：子路径 link 改回仓根，包名沿用', () => {
    const home = mkdtempSync(join(tmpdir(), 'mig-home2-'))
    const repo = mkdtempSync(join(tmpdir(), 'mig-repo2-'))
    const profile = join(home, 'profiles', 'desktop')
    // 旧 workspace 布局的装法：link:<repo>/packages/dsh-demo
    mkdirSync(join(repo, 'packages', 'dsh-demo'), { recursive: true })
    mkdirSync(join(profile, 'node_modules', '@dreamariner'), { recursive: true })
    symlinkSync(join(repo, 'packages', 'dsh-demo'), join(profile, 'node_modules', '@dreamariner', 'dsh-demo'))
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'profile',
      dependencies: { '@dreamariner/dsh-demo': `link:${repo}/packages/dsh-demo` },
      dsh: { profile: { bundles: ['@dreamariner/dsh-demo'] } },
    }, null, 2) + '\n')
    try {
      const report = migrateRootLinkInstalls(
        opts({ targetDir: repo, pluginId: 'dsh-demo', packageName: '@dreamariner/dsh-demo', type: 'host' }),
        home, false,
      )
      expect(report.migrated).toHaveLength(1)
      expect(report.migrated[0]).toMatchObject({ profile: 'desktop', renamed: false, to: `link:${repo}` })
      const m = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
      expect(m.dependencies['@dreamariner/dsh-demo']).toBe(`link:${repo}`)
      expect(m.dsh.profile.bundles).toEqual(['@dreamariner/dsh-demo'])
    } finally { rmSync(home, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true }) }
  })

  it('toRoot（回迁单包）：包名变了连键与 bundles 一起改', () => {
    const home = mkdtempSync(join(tmpdir(), 'mig-home3-'))
    const repo = mkdtempSync(join(tmpdir(), 'mig-repo3-'))
    const profile = join(home, 'profiles', 'desktop')
    mkdirSync(join(repo, 'packages', 'dsh-demo'), { recursive: true })
    mkdirSync(join(profile, 'node_modules', '@dreamariner'), { recursive: true })
    symlinkSync(join(repo, 'packages', 'dsh-demo'), join(profile, 'node_modules', '@dreamariner', 'dsh-demo'))
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'profile',
      dependencies: { '@dreamariner/dsh-demo': `link:${repo}/packages/dsh-demo` },
      dsh: { profile: { bundles: ['@dreamariner/dsh-demo'] } },
    }, null, 2) + '\n')
    try {
      const report = migrateRootLinkInstalls(
        opts({ targetDir: repo, pluginId: 'dsh-demo', packageName: '@dreamariner/dsh-demo-v2', type: 'client' }),
        home, false,
      )
      expect(report.migrated[0]).toMatchObject({ renamed: true })
      const m = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
      expect(m.dependencies['@dreamariner/dsh-demo']).toBeUndefined()
      expect(m.dependencies['@dreamariner/dsh-demo-v2']).toBe(`link:${repo}`)
      expect(m.dsh.profile.bundles).toEqual(['@dreamariner/dsh-demo-v2'])
    } finally { rmSync(home, { recursive: true, force: true }); rmSync(repo, { recursive: true, force: true }) }
  })

  it('link 指向别处的不动', () => {
    const home = mkdtempSync(join(tmpdir(), 'mig-home-'))
    const other = mkdtempSync(join(tmpdir(), 'mig-other-'))
    const profile = join(home, 'profiles', 'desktop')
    mkdirSync(profile, { recursive: true })
    writeFileSync(join(profile, 'package.json'), JSON.stringify({
      name: 'profile', dependencies: { '@dreamariner/dsh-demo': `link:${other}` },
    }))
    try {
      const report = migrateRootLinkInstalls(
        opts({ targetDir: join(tmpdir(), 'mig-repo-absent'), pluginId: 'dsh-demo', packageName: '@dreamariner/dsh-demo', type: 'full' }),
        home, false,
      )
      expect(report.migrated).toHaveLength(0)
      expect(report.errors).toHaveLength(0)
      const m = JSON.parse(readFileSync(join(profile, 'package.json'), 'utf8'))
      expect(m.dependencies['@dreamariner/dsh-demo']).toBe(`link:${other}`)
    } finally { rmSync(home, { recursive: true, force: true }); rmSync(other, { recursive: true, force: true }) }
  })
})
