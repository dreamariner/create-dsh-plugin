// create-dsh-plugin :: sync-pack-docs.mjs — 把仓根 README / LICENSE 同步进插件包目录
//
// npm 只在「包目录内」自动收录 README 与 LICENSE：workspace 布局下这两份文件住在
// 仓根，不拷贝就进不了 tarball（npm 页面没文档、license 字段没有文本）。
// 挂在各插件包的 prepare（pack / publish / git 安装三条路都会跑），产物被根
// .gitignore 忽略：真源永远在仓根，避免双真源漂移。
//
// 项目共用脚本（<仓根>/scripts/）：包目录取 argv[2]，缺省 = 当前目录
// （pnpm 跑包脚本时 cwd = 包目录，各包 prepare 里直接 `node ../../scripts/sync-pack-docs.mjs`）。
import { copyFileSync, existsSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

// 本脚本在 <仓根>/scripts/：向上一级就是仓根
const root = join(dirname(fileURLToPath(import.meta.url)), '..')
const pkgDir = resolve(process.argv[2] ?? process.cwd())

for (const name of ['README.md', 'LICENSE']) {
  const src = join(root, name)
  if (existsSync(src)) copyFileSync(src, join(pkgDir, name))
}
