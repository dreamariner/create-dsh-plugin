import { describe, expect, it } from 'vitest'
import { printNextSteps } from '../src/finalize.ts'
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

describe('printNextSteps 重排警告', () => {
  it('目标目录原本非空（重排既有仓）→ 输出静默失效警告与处置', () => {
    const out = capture(() => printNextSteps(opts({ type: 'full' }), {
      installed: true, gitInited: false, protocolSubmodule: 'added', hostFace: 'wired',
    }, true))
    expect(out).toContain('目标目录原本非空')
    expect(out).toContain('静默失效')
    expect(out).toContain('packages/dsh-demo')
    expect(out).toContain('"@dreamariner/dsh-demo"')
  })

  it('全新目录（缺省）→ 不出现重排警告', () => {
    const out = capture(() => printNextSteps(opts({}), {
      installed: true, gitInited: false, protocolSubmodule: 'added', hostFace: 'skipped',
    }, false))
    expect(out).not.toContain('目标目录原本非空')
  })
})
