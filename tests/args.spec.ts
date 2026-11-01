// parseArgs 自测：锁住子命令分发与「值读自同一序列」的正确性。
// （回归背景：引入 add 子命令时循环体曾错读原 argv，整体错位一位:这里第一时间红。）
import { describe, expect, it } from 'vitest'
import { parseArgs, validateProjectName } from '../src/args.ts'

describe('parseArgs：子命令分发', () => {
  it('缺省 create（无子命令）', () => {
    const a = parseArgs(['@s/dsh-foo', '--type', 'host'])
    expect(a.command).toBe('create')
    expect(a.name).toBe('@s/dsh-foo')
    expect(a.type).toBe('host')
  })

  it('显式 create', () => {
    const a = parseArgs(['create', '@s/dsh-foo', '--dir', 'out'])
    expect(a.command).toBe('create')
    expect(a.name).toBe('@s/dsh-foo')
    expect(a.dir).toBe('out')
  })

  it('add：子命令之后的全部参数按同一序列取值', () => {
    const a = parseArgs(['add', '@s/dsh-bar', '--type', 'client', '--dir', '/tmp/ws', '--title', 'T', '--description', 'D', '--no-git', '--no-install'])
    expect(a.command).toBe('add')
    expect(a.name).toBe('@s/dsh-bar')
    expect(a.type).toBe('client')
    expect(a.dir).toBe('/tmp/ws')
    expect(a.title).toBe('T')
    expect(a.description).toBe('D')
    expect(a.git).toBe(false)
    expect(a.install).toBe(false)
  })

  it('add：--protocol-url 透传', () => {
    const a = parseArgs(['add', 'x', '--type', 'full', '--protocol-url', 'git@example.com:foo/bar.git'])
    expect(a.protocolUrl).toBe('git@example.com:foo/bar.git')
  })

  it('--project-name 透传（create 与 add 共用解析）', () => {
    expect(parseArgs(['@s/dsh-foo', '--project-name', 'otter-pack', '--type', 'host']).projectName).toBe('otter-pack')
    expect(parseArgs(['add', 'x', '--project-name', 'otter-pack']).projectName).toBe('otter-pack')
  })

  it('validateProjectName：目录 / 仓名形态，拒 scope 与非法字符', () => {
    expect(validateProjectName('otter-pack')).toBeUndefined()
    expect(validateProjectName('a.b_c1')).toBeUndefined()
    expect(validateProjectName('@scope/foo')).toMatch(/不合法/)
    expect(validateProjectName('-lead')).toMatch(/不合法/)
    expect(validateProjectName('大写')).toMatch(/不合法/)
    expect(validateProjectName('')).toMatch(/不合法/)
  })

  it('create：--type 非法值报错', () => {
    expect(() => parseArgs(['x', '--type', 'nope'])).toThrow(/--type/)
  })

  it('多个位置参数报错', () => {
    expect(() => parseArgs(['a', 'b'])).toThrow(/最多一个位置参数/)
  })
})
