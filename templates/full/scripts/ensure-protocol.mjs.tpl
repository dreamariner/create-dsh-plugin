#!/usr/bin/env node
// __PACKAGE_NAME__ :: ensure-protocol.mjs - preinstall 硬守卫
//
// packages/protocol（typert 协议声明源，git submodule）缺失时，pnpm install 报的
// 只是一个费解的 workspace ENOENT；这里把真因与修复命令直接给出。
// 硬错误（退出码 1）：没有声明源，typert codegen 与本仓 install 都不可能成功。
import { existsSync } from 'node:fs'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

// 本脚本在 packages/<id>/scripts/（full 布局）：向上三级到 workspace 根
// （scripts → packages/<id> → packages → 根）
const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..')
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
