// __PACKAGE_NAME__ :: typert 协议声明源（packages/protocol）的消费端护栏
//
// packages/protocol 是共享仓 dreamariner/dsh-typert-protocol 的 submodule 挂载点：
// @deepseek-ai/dsh-typert-protocol 的 pinned-source vendor，只服务构建期
// （typert 生成器的 workspace registration），运行期一律走 npm 那份。
// 「只在构建期」靠两件事维持，任何一件被破坏都不报错、只是插件凭空消失：
//   ① vendor 版本带 -vendor.0 后缀，不等于本包 devDependencies 的精确 pin
//      （0.2.2-rc.1）→ pnpm 只能从 registry 取，linkWorkspacePackages 不会把
//      运行期链接到 vendor 副本；
//      ⚠️ vendor 版本其实满足 peer 范围（semver prerelease 细节：'rc.3-vendor.0'
//      比 'rc.3' 「更新」）:所以真正的防线是「devDep 用裸精确版本」，第 4 条断言。
//   ② tsconfig.host.json 的 paths 重定向只对生成器 face program 生效。
// 本护栏把这两件事 + 「跟得上 npm 版本」变成静态断言；与上游源码的逐字节同步
// 由共享仓自己的自守 spec 管（packages/protocol/tests/protocol-vendor.spec.ts）。
import { describe, expect, it } from 'vitest'
import { existsSync, readFileSync, realpathSync } from 'node:fs'
import { createRequire } from 'node:module'
import { join, sep } from 'node:path'

const ROOT = process.cwd()
// 本 spec 在根 vitest 下跑（cwd = 仓根）：vendor 挂载点在 packages/protocol，
// 消费者包（协议包 devDep 的锚点）在 packages/<id>/。
const VENDOR_DIR = join(ROOT, 'packages', 'protocol')
const PKG = join(ROOT, '__PLUGIN_REL__')
const VENDOR_SUFFIX = /-vendor\.\d+$/
const baseVersion = (version: string): string => version.replace(VENDOR_SUFFIX, '')

function readManifest(path: string): Record<string, any> {
  return JSON.parse(readFileSync(path, 'utf8'))
}

/** Node 真实解析到的协议包路径（与运行期一致）；未安装时返回 null。 */
function resolvedProtocol(): string | null {
  const anchor = join(PKG, 'package.json')
  if (!existsSync(anchor)) return null
  try {
    return realpathSync(createRequire(anchor).resolve('@deepseek-ai/dsh-typert-protocol/package.json'))
  } catch {
    return null
  }
}

describe('typert 协议声明源（packages/protocol）', () => {
  it('submodule 已就位且 manifest 可读（缺失时先跑 preinstall 指引的 submodule update）', () => {
    const vendor = readManifest(join(VENDOR_DIR, 'package.json'))
    expect(vendor.name).toBe('@deepseek-ai/dsh-typert-protocol')
  })

  it('vendor 版本带 -vendor.N 后缀（使其不满足本包 devDep 的精确 pin）', () => {
    const vendor = readManifest(join(VENDOR_DIR, 'package.json'))
    expect(
      VENDOR_SUFFIX.test(vendor.version),
      `vendor 版本 ${vendor.version} 缺少 -vendor.N 后缀:一旦变成裸版本号，`
      + 'linkWorkspacePackages 会把运行期链接到 vendor 副本；它没有 lib/ 产物，'
      + '插件的 import 解析到它就会加载失败 → 插件凭空消失（不抛错、不进日志）',
    ).toBe(true)
  })

  it('vendor 跟得上 npm 版本（主段一致）', () => {
    const resolved = resolvedProtocol()
    if (resolved === null) {
      console.warn('[protocol-vendor] 跳过：未安装协议包（裸 clone / CI）')
      return
    }
    const vendor = readManifest(join(VENDOR_DIR, 'package.json'))
    expect(baseVersion(vendor.version)).toBe(readManifest(resolved).version)
  })

  it('运行期解析不落在 vendor 副本上（构建期 / 运行期两份物理隔离）', () => {
    const resolved = resolvedProtocol()
    if (resolved === null) {
      console.warn('[protocol-vendor] 跳过：未安装协议包（裸 clone / CI）')
      return
    }
    expect(
      resolved.startsWith(VENDOR_DIR + sep),
      `运行期协议包解析到了 vendor 副本：${resolved}`,
    ).toBe(false)
    expect(readManifest(resolved).version).not.toMatch(VENDOR_SUFFIX)
  })

  it('本包把协议包 pin 成裸精确版本:放宽成范围就会让 vendor 副本变成合法候选', () => {
    const pkg = readManifest(join(PKG, 'package.json'))
    const spec = (pkg.devDependencies ?? {})['@deepseek-ai/dsh-typert-protocol']
    expect(spec, 'devDependencies 缺协议包 pin').toBeTypeOf('string')
    expect(
      spec as string,
      `协议包被 pin 成 ${spec}:必须是裸精确版本（不含 ^ ~ >= 等范围符号），`
      + '否则 vendor 副本（它满足 peer 范围）会成为合法候选，运行期可能被链到没有产物的 vendor',
    ).toMatch(/^\d+\.\d+\.\d+(?:-[\w.]+)?$/)
    const vendor = readManifest(join(VENDOR_DIR, 'package.json'))
    expect(spec as string).not.toBe(vendor.version)
  })

  it('vendor 副本不参与产物生成：无 ./typert 导出面、无 build 脚本、无 lib/ 产物', () => {
    const vendor = readManifest(join(VENDOR_DIR, 'package.json'))
    expect(Object.keys(vendor.exports ?? {})).not.toContain('./typert')
    expect((vendor.scripts ?? {}).build).toBeUndefined()
    expect(existsSync(join(VENDOR_DIR, 'lib'))).toBe(false)
  })
})
