// __PACKAGE_NAME__ :: typert 面的安装态护栏
//
// typert.host.js / typert.remote-client.js 由 typertPlugin 生成，顶部 import zod。
// zod 若不在 **dependencies**（devDep 或缺失），本仓里跑测试照样绿（devDep 也会
// link 进包的 node_modules），但 profile / npm 安装态下解析不到：typert-loader
// 注册 face 失败。desktop 侧 typert-loader 属 required → boot() 整体销毁，症状
// 极其隐蔽：settings/describe 等核心 RPC 全部报「strict definition was
// withdrawn」、窗口无法打开，而本插件自身的报错一行都看不见（2026-11 实机事故）。
//
// 守不住生成产物内容（那是生成器的责任），守得住 manifest 形态：
// 声明了 ./typert 导出 ⇒ zod 必须是 dependencies 成员，且产物真实存在。
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync } from 'node:fs'
import { join } from 'node:path'

const ROOT = process.cwd()
// 本 spec 在根 vitest 下跑（cwd = 仓根），插件包在 packages/<id>/
const PKG = join(ROOT, '__PLUGIN_REL__')
const manifest = JSON.parse(readFileSync(join(PKG, 'package.json'), 'utf8'))

describe('typert 面安装态护栏', () => {
  it('声明 ./typert 导出 ⇒ zod 在 dependencies（typert 生成产物 import 它）', () => {
    expect(manifest.exports).toHaveProperty('./typert')
    const zod = manifest.dependencies?.zod
    expect(zod, 'zod 必须在 dependencies：typert.host.js / typert.remote-client.js 顶部 import 它，'
      + '放 devDeps 会在 profile / npm 安装态解析不到（desktop 下 typert-loader 是 required，'
      + '注册失败会让整个 boot 销毁）').toEqual(expect.any(String))
  })

  it('./typert 指向的生成产物真实存在（缺了先 pnpm build）', () => {
    const target = manifest.exports['./typert']
    const file = typeof target === 'string' ? target : (target?.import ?? target?.default)
    expect(file, './typert 导出必须指向文件').toEqual(expect.any(String))
    expect(existsSync(join(PKG, file!)), `${file} 不存在（先 pnpm build）`).toBe(true)
  })
})
