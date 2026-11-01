#!/usr/bin/env node
// @dreamariner/create-dsh-plugin —— DSH 插件脚手架
//
// 用法：
//   npx @dreamariner/create-dsh-plugin [name] [--type host|client|full] [--dir <dir>]
//                                       [--title <t>] [--description <d>]
//                                       [--no-install] [--no-git]
//
// 生成的项目：pnpm 工程 + tsdown 双端构建（host: lib/index.js / client: lib/client.js）
// + 自挂载 bundle + watch（pnpm dev）+ hmr 接线（host 半边）+ npm 发布配置。
// 模板形态来源：DSH 官方 cordis-plugin-development skill（decoration / host-plugin）
// 与 dreamariner/dsh-web-search-minimax（已验证可发布、可安装的完整先例）。

import { cancel, intro, note, outro, spinner } from '@clack/prompts'
import { runHelp } from './help.ts'
import { promptScaffold } from './prompts.ts'
import { renderProject } from './render.ts'
import { PROTOCOL_REPO_URL, finalize, printNextSteps } from './finalize.ts'
import type { ScaffoldOptions } from './types.ts'

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.includes('-h') || argv.includes('--help')) {
    runHelp()
    return
  }

  intro('create-dsh-plugin · DeepSeek Harness 插件脚手架')

  const opts: ScaffoldOptions = await promptScaffold(argv)

  const s = spinner()
  s.start('生成项目文件')
  let files = 0
  try {
    files = renderProject(opts)
  } catch (e) {
    s.stop('生成失败')
    cancel(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
  s.stop(`已写入 ${files} 个文件`)

  const result = finalize(opts)

  note(
    [
      `形态：${opts.type}（host: ${opts.type !== 'client' ? 'lib/index.js' : '空壳'}`
      + `${opts.type !== 'host' ? ' / client: lib/client.js' : ''}）`,
      `包名：${opts.packageName}`,
      `插件行 id：${opts.pluginId}`,
      ...(opts.type === 'full' ? [`协议声明源：${opts.protocolUrl ?? PROTOCOL_REPO_URL}`] : []),
    ].join('\n'),
    '项目概况',
  )

  printNextSteps(opts, result)
  outro('完成')
}

main().catch((e: unknown) => {
  cancel(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
