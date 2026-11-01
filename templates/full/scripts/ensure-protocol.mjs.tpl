#!/usr/bin/env node
// __PROJECT_NAME__ :: ensure-protocol.mjs — 仓根 preinstall 硬守卫
//
// packages/protocol（typert 协议声明源，git submodule）缺失时，pnpm install 报的
// 只是一个费解的 workspace ENOENT；这里把真因与修复命令直接给出。
// 硬错误（退出码 1）：没有声明源，typert codegen 与本仓 install 都不可能成功。
//
// ⚠ 守卫必须住仓根（private 壳，永不发布）：发布包的运行期走 npm 协议包，不需要
// 声明源；preinstall 若跟着插件包走，scripts/ 不随 tarball 分发，安装期直接
// MODULE_NOT_FOUND 崩掉（实测踩过）。
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 本脚本在 <仓根>/scripts/：向上一级是仓根
const root = dirname(dirname(fileURLToPath(import.meta.url)))
const protocol = join(root, 'packages', 'protocol', 'package.json')

if (!existsSync(protocol)) {
  console.error(
    [
      '',
      '✗ packages/protocol 未就绪：typert 协议声明源（git submodule dreamariner/dsh-typert-protocol）缺失。',
      '',
      '  修复：',
      '    git submodule update --init packages/protocol',
      '',
    ].join('\n'),
  )
  process.exit(1)
}
