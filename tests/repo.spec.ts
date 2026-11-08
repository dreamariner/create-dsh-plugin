// repo.ts 自测：URL 归一化矩阵、scope 推导、三字段优先级链与「origin 属于外层仓不认」。
// 市场展示字段的来源规则在这里锁死（flag > origin > scope；解析不了宁缺毋滥）。
import { describe, expect, it } from 'vitest'
import { spawnSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, rmSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { normalizeRepoUrl, readOriginUrl, repoFromScope, resolveRepoFields } from '../src/repo.ts'

describe('normalizeRepoUrl：任意 git URL → https 网页 URL', () => {
  it('https 与 git+ 前缀、.git 尾巴', () => {
    expect(normalizeRepoUrl('https://github.com/o/r.git')).toBe('https://github.com/o/r')
    expect(normalizeRepoUrl('git+https://github.com/o/r.git')).toBe('https://github.com/o/r')
  })

  it('scp 形式（含未知 host 的自建 git 服务）与 ssh://', () => {
    expect(normalizeRepoUrl('git@github.com:o/r.git')).toBe('https://github.com/o/r')
    expect(normalizeRepoUrl('git@git.example.com:dreamariner/foo.git')).toBe('https://git.example.com/dreamariner/foo')
    expect(normalizeRepoUrl('ssh://git@git.example.com/dreamariner/foo.git')).toBe('https://git.example.com/dreamariner/foo')
  })

  it('github shorthand 与凭据 / query / committish 剥离', () => {
    expect(normalizeRepoUrl('github:o/r')).toBe('https://github.com/o/r')
    expect(normalizeRepoUrl('https://user:pass@gitlab.com/g/r?x=1#semver:^1')).toBe('https://gitlab.com/g/r')
  })

  it('解析不出两段路径的 http(s) 页面 → undefined', () => {
    expect(normalizeRepoUrl('')).toBeUndefined()
    expect(normalizeRepoUrl('https://github.com/o')).toBeUndefined()
    expect(normalizeRepoUrl('ftp://github.com/o/r')).toBeUndefined()
    expect(normalizeRepoUrl('ext::ssh://example.com/r')).toBeUndefined()
  })
})

describe('repoFromScope：包名 scope 推导', () => {
  it('带 scope → github 地址（公开面默认 GitHub）', () => {
    expect(repoFromScope('@dreamariner/dsh-foo')).toBe('https://github.com/dreamariner/dsh-foo')
  })

  it('无 scope → undefined', () => {
    expect(repoFromScope('dsh-foo')).toBeUndefined()
  })
})

describe('readOriginUrl：仅当目标 = 仓库顶层才认', () => {
  function tmpRepo(origin?: string): string {
    const dir = mkdtempSync(join(tmpdir(), 'create-dsh-plugin-repo-'))
    const g = (args: string[]): void => {
      spawnSync('git', ['-C', dir, ...args], { encoding: 'utf8' })
    }
    g(['init', '-q'])
    g(['config', 'user.email', 't@t'])
    g(['config', 'user.name', 'T'])
    if (origin !== undefined) g(['remote', 'add', 'origin', origin])
    return dir
  }

  it('仓库顶层：读到 origin', () => {
    const dir = tmpRepo('git@github.com:o/r.git')
    try {
      expect(readOriginUrl(dir)).toBe('git@github.com:o/r.git')
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })

  it('外层仓的子目录：origin 属于外层项目，不认（如在别的仓里生成）', () => {
    const parent = tmpRepo('git@github.com:parent/repo.git')
    try {
      const child = join(parent, 'packages', 'fresh')
      mkdirSync(child, { recursive: true })
      expect(readOriginUrl(child)).toBeUndefined()
    } finally {
      rmSync(parent, { recursive: true, force: true })
    }
  })

  it('不在 git 仓里（create 全新目录）：undefined', () => {
    const dir = mkdtempSync(join(tmpdir(), 'create-dsh-plugin-nogit-'))
    try {
      expect(readOriginUrl(dir)).toBeUndefined()
    } finally {
      rmSync(dir, { recursive: true, force: true })
    }
  })
})

describe('resolveRepoFields：优先级链', () => {
  const base = { packageName: '@dreamariner/dsh-foo', targetDir: '/tmp/whatever' }

  it('flag > origin > scope；homepage 缺省跟随 repository', () => {
    const readers = { readOriginUrl: () => 'git@gitlab.com:g/r.git', readGitAuthor: () => 'Jianan' }
    const byFlag = resolveRepoFields({ ...base, repository: 'github:o/r', homepage: 'https://ex.com', author: 'Lin' }, readers)
    expect(byFlag).toEqual({ author: 'Lin', homepage: 'https://ex.com', repository: 'https://github.com/o/r' })
    const byOrigin = resolveRepoFields(base, readers)
    expect(byOrigin).toEqual({ author: 'Jianan', homepage: 'https://gitlab.com/g/r', repository: 'https://gitlab.com/g/r' })
  })

  it('origin 缺失 → scope 推导；无 scope → 三字段全省略', () => {
    const noOrigin = { readOriginUrl: () => undefined, readGitAuthor: () => undefined }
    expect(resolveRepoFields(base, noOrigin)).toEqual({
      homepage: 'https://github.com/dreamariner/dsh-foo',
      repository: 'https://github.com/dreamariner/dsh-foo',
    })
    expect(resolveRepoFields({ ...base, packageName: 'dsh-foo' }, noOrigin)).toEqual({})
  })

  it('origin 读到但解析不了：不用 scope 猜（仓已托管在别处），宁缺毋滥', () => {
    const weird = { readOriginUrl: () => 'ext::ssh://example.com/r', readGitAuthor: () => undefined }
    expect(resolveRepoFields(base, weird)).toEqual({})
  })

  it('author：空串 flag 视同未给退 git config；flag 值去首尾空白', () => {
    const readers = { readOriginUrl: () => undefined, readGitAuthor: () => 'Jianan' }
    expect(resolveRepoFields({ ...base, author: '  ' }, readers).author).toBe('Jianan')
    expect(resolveRepoFields({ ...base, author: ' Lin ' }, readers).author).toBe('Lin')
  })

  it('flag 非法直接报错（渲染开始前暴露，不静默省略）', () => {
    const readers = { readOriginUrl: () => undefined, readGitAuthor: () => undefined }
    expect(() => resolveRepoFields({ ...base, repository: 'not a url' }, readers)).toThrow(/--repository/)
    expect(() => resolveRepoFields({ ...base, homepage: 'ftp://ex.com' }, readers)).toThrow(/--homepage/)
  })
})
