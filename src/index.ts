#!/usr/bin/env node
// @dreamariner/create-dsh-plugin : DSH 插件脚手架
//
// 用法：
//   npx @dreamariner/create-dsh-plugin [add] [name] [--type host|client|full] [--dir <dir>]
//                                       [--title <t>] [--description <d>]
//                                       [--no-install] [--no-git]
//
// create（缺省）：新建插件仓 : pnpm workspace（根壳 + packages/<id>/ 默认插件）
//   + tsdown 双端构建 + 自挂载 bundle + watch / hmr 接线 + npm 发布配置；
//   full 形态自动挂协议声明源 submodule 并接好 typert codegen 全链路。
// add：向既有仓追加插件包（full 额外做协议 submodule 与 tsconfig.host.json 接线），
//   一仓多插件：根壳 -r 转发，追加无需迁移结构。
// 模板形态来源：DSH 官方 cordis-plugin-development skill（decoration / host-plugin）
// 与 dreamariner/dsh-web-search-minimax（已验证可发布、可安装的完整先例）。

import { cancel, intro, note, outro, spinner } from '@clack/prompts'
import { runHelp } from './help.ts'
import { promptScaffold } from './prompts.ts'
import { renderPluginPackage, renderProject } from './render.ts'
import { PROTOCOL_REPO_URL, finalize, printNextSteps } from './finalize.ts'

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  if (argv.includes('-h') || argv.includes('--help')) {
    runHelp()
    return
  }

  const isAdd = argv[0] === 'add'
  intro(isAdd ? 'create-dsh-plugin · 追加插件包' : 'create-dsh-plugin · DeepSeek Harness 插件脚手架')

  const opts = await promptScaffold(argv)

  const s = spinner()
  s.start(isAdd ? '生成插件包' : '生成项目文件')
  let files = 0
  try {
    files = isAdd ? renderPluginPackage(opts) : renderProject(opts)
  } catch (e) {
    s.stop('生成失败')
    cancel(e instanceof Error ? e.message : String(e))
    process.exit(1)
  }
  s.stop(`已写入 ${files} 个文件`)

  const result = finalize(opts)

  note(
    [
      `模式：${opts.command}`,
      `形态：${opts.type}（host: ${opts.type !== 'client' ? 'lib/index.js' : '空壳'}`
      + `${opts.type !== 'host' ? ' / client: lib/client.js' : ''}）`,
      `包名：${opts.packageName}`,
      `插件行 id：${opts.pluginId}`,
      `位置：${isAdd ? `packages/${opts.pluginId}` : opts.targetDir}`,
      ...(opts.type === 'full' ? [`协议声明源：${opts.protocolUrl ?? PROTOCOL_REPO_URL}`] : []),
    ].join('\n'),
    '概况',
  )

  printNextSteps(opts, result)
  outro('完成')
}

main().catch((e: unknown) => {
  cancel(e instanceof Error ? e.message : String(e))
  process.exit(1)
})
