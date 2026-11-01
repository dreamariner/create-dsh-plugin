#!/usr/bin/env node
// __PACKAGE_NAME__ :: dev-hmr.mjs — 把本包 lib/ 注册进本机 DSH 的 hmr watch 根
//
// 用途：开发时「保存 → pnpm dev 重建 → 实例内热重载（免重启、PID 不变）」。
//   pnpm dev:hmr            注册（幂等）
//   pnpm dev:hmr --remove   注销
//
// 机制：DSH 的 hmr 行住在本机 home patch（$DSH_HOME/cordis.patch.yml，机器本地产物，
// 不进任何 git）。本脚本只往该行 config.root 数组里增删本包自己的 lib 绝对路径，
// 不触碰 root 里的其它行（各家脚本互不干扰、各自管理自己的行）。
// 变更 watch 根需重启实例一次生效；之后的改动随 pnpm dev 重建即时热重载。
//
// 固有限制（DSH hmr 机制）：只认 change 事件（删除文件不触发 reload）、实例启动
// 窗口内的改动被丢弃、macOS FSEvents 注册窗口。client 半边不用注册：DSH 的
// client-hmr 自动盯着 lib/client.js（若存在），重建即热替换。
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { homedir } from 'node:os'

const repo = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const libDir = join(repo, 'lib')
const remove = process.argv.includes('--remove')
const dshHome = process.env.DSH_HOME || join(homedir(), '.dsh')
const homePatch = join(dshHome, 'cordis.patch.yml')

if (!remove && !existsSync(libDir)) {
  console.error('[dev-hmr] lib/ 不存在——先构建一次：pnpm build')
  process.exit(1)
}

let yaml
try {
  yaml = createRequire(join(repo, 'package.json'))('js-yaml')
} catch {
  console.error('[dev-hmr] 缺 js-yaml 依赖——先 pnpm install')
  process.exit(1)
}

let rows = []
if (existsSync(homePatch)) {
  const loaded = yaml.load(readFileSync(homePatch, 'utf8'))
  rows = Array.isArray(loaded) ? loaded : []
}
let hmr = rows.find((r) => r && r.id === 'hmr')
if (!hmr) {
  hmr = { id: 'hmr', config: { root: [] } }
  rows.push(hmr)
}
hmr.config ??= {}
if (!Array.isArray(hmr.config.root)) hmr.config.root = []

const registered = hmr.config.root.includes(libDir)
if (remove) {
  hmr.config.root = hmr.config.root.filter((r) => r !== libDir)
} else if (!registered) {
  hmr.config.root.push(libDir)
}

writeFileSync(homePatch, `${yaml.dump(rows, { lineWidth: -1 })}\n`)
if (remove) {
  console.log(registered
    ? `[dev-hmr] 已从 hmr watch 根注销：${libDir}（重启实例生效）`
    : '[dev-hmr] 本来就未注册，无需操作')
} else {
  console.log(registered
    ? `[dev-hmr] 已在 hmr watch 根中（幂等，未改动）：${libDir}`
    : `[dev-hmr] 已注册进 hmr watch 根：${libDir}\n[dev-hmr] 重启实例一次生效；之后 pnpm dev 的重建即热重载（PID 不变）`)
}
