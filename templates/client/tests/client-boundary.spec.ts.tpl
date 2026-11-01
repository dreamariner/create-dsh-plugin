// __PACKAGE_NAME__ :: client 半边边界护栏
//
// client 产物跑在浏览器 iframe 里，Node 内建与宿主侧包一概不可用；而这类破界
// 在构建/装载期的报错离破界处很远（模块表 miss / 打包进 bundle 后运行期炸）。
// 按官方 practices 补一条硬规则：不 require 任何 @deepseek-ai/dsh-client-* 包
// （控件自己写）。护栏扫**源码**不扫产物：扫产物要求先 build，忘了 build 会
// 静默扫到旧产物；扫源码没有这个空档。
import { describe, expect, it } from 'vitest'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join } from 'node:path'

// full 布局：本 spec 在根 vitest 下跑（cwd = 仓根），client 源码在 packages/<id>/src/client；
// 单包布局时 __PLUGIN_REL__ 为空串（join 忽略空段）。
const CLIENT_DIR = join(process.cwd(), '__PLUGIN_REL__', 'src', 'client')

function sourceFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(dir)) {
    const p = join(dir, entry)
    if (statSync(p).isDirectory()) out.push(...sourceFiles(p))
    else if (/\.tsx?$/.test(entry)) out.push(p)
  }
  return out
}

const files = sourceFiles(CLIENT_DIR)

describe('client 半边边界', () => {
  it('扫到源码文件（防止目录挪走后护栏空转成绿）', () => {
    expect(files.length).toBeGreaterThan(0)
  })

  it('不 import node: 内建模块（client 跑在浏览器 iframe，没有 Node）', () => {
    for (const f of files) {
      const code = readFileSync(f, 'utf8')
      expect(code, `${f} import 了 node: 内建模块:浏览器半边不可用`).not.toMatch(/from\s+['"]node:/)
      expect(code, `${f} import 了 node: 内建模块:浏览器半边不可用`).not.toMatch(/require\(\s*['"]node:/)
    }
  })

  it('不 import 任何 @deepseek-ai/dsh-client-* 包（官方 practices：控件自己写）', () => {
    for (const f of files) {
      const code = readFileSync(f, 'utf8')
      expect(code, `${f} import 了 Harness Client 包:它们不在你的模块表请求里，且随时可能变`).not.toMatch(/['"]@deepseek-ai\/dsh-client-/)
    }
  })
})
