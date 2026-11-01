// create-dsh-plugin :: 交互层（@clack/prompts）
//
// 交互最少化：只问「包名」「类型」「目录」三个问题，其余全部从包名推导或用缺省值；
// README 引导用户生成后自行改 locale 文案与 description。
//
// create 与 add 共用本层：
//   create = 新建仓（问目录，要求目录为空）；
//   add    = 向既有 workspace 追加插件包（目录 = 仓根，缺省 cwd，要求是本脚手架
//            生成的 workspace 且 packages/<id> 未被占用）。

import * as p from '@clack/prompts'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs, validateName, validateProjectName, type CliArgs } from './args.ts'
import { PLUGIN_TYPES, type PluginType, type ScaffoldOptions } from './types.ts'

export async function promptScaffold(argv: string[]): Promise<ScaffoldOptions> {
  const args: CliArgs = parseArgs(argv)

  const packageName = args.name ?? await askName()
  const nameError = validateName(packageName)
  if (nameError !== undefined) {
    p.cancel(nameError)
    process.exit(1)
  }

  // 项目名：与包名解耦（目录名 / 根壳 manifest 名的来源）。缺省 = 插件 id；
  // add 模式不使用（项目名在 create 时已定）。
  const projectName = args.projectName
  if (projectName !== undefined) {
    const projectError = validateProjectName(projectName)
    if (projectError !== undefined) {
      p.cancel(projectError)
      process.exit(1)
    }
  }

  const type = args.type ?? await askType()

  const pluginId = packageName.includes('/') ? packageName.slice(packageName.indexOf('/') + 1) : packageName

  let targetDir: string
  if (args.command === 'add') {
    // add：目标是既有 workspace 仓根（--dir 指定或当前目录），做两类校验
    targetDir = args.dir !== undefined ? resolve(process.cwd(), args.dir) : process.cwd()
    const notWorkspace = workspaceProblem(targetDir, pluginId)
    if (notWorkspace !== undefined) {
      p.cancel(notWorkspace)
      process.exit(1)
    }
  } else {
    const defaultDir = resolve(process.cwd(), projectName ?? pluginId)
    targetDir = args.dir !== undefined ? resolve(process.cwd(), args.dir) : await askDir(defaultDir)
  }

  const title = args.title ?? pluginId
  const description = args.description ?? `${pluginId}：DeepSeek Harness 插件`

  return { command: args.command, projectName, packageName, pluginId, type, targetDir, title, description, protocolUrl: args.protocolUrl, install: args.install, git: args.git }
}

/** add 模式的目标校验：返回 undefined = 可以追加，返回文案 = 阻止原因。 */
function workspaceProblem(dir: string, pluginId: string): string | undefined {
  if (!existsSync(dir) || !statSync(dir).isDirectory()) return `目录不存在：${dir}`
  if (!existsSync(resolve(dir, 'pnpm-workspace.yaml')) || !existsSync(resolve(dir, 'packages'))) {
    return `${dir} 不是 create-dsh-plugin 生成的 workspace 仓（缺 pnpm-workspace.yaml 或 packages/）:add 只用于向既有仓追加插件`
  }
  if (existsSync(resolve(dir, 'packages', pluginId))) {
    return `packages/${pluginId} 已存在：这个插件已经在本仓里了`
  }
  return undefined
}

async function askName(): Promise<string> {
  const v = await p.text({
    message: '插件包名？（npm 名，可带 scope，如 @dreamariner/dsh-foo）',
    placeholder: '@dreamariner/dsh-my-plugin',
    validate: (input) => {
      if (input.trim() === '') return '包名不能为空'
      return validateName(input.trim())
    },
  })
  assertNotCancel(v)
  return (v as string).trim()
}

async function askType(): Promise<PluginType> {
  const v = await p.select({
    message: '插件形态？',
    options: PLUGIN_TYPES.map((t) => ({ value: t.value, label: t.label, hint: t.hint })),
  })
  assertNotCancel(v)
  return v as PluginType
}

async function askDir(defaultDir: string): Promise<string> {
  const v = await p.text({
    message: '生成目录？',
    placeholder: defaultDir,
    defaultValue: defaultDir,
    validate: (input) => {
      const dir = input.trim() === '' ? defaultDir : resolve(process.cwd(), input.trim())
      if (!existsSync(dir)) return undefined
      if (!statSync(dir).isDirectory()) return '同名文件已存在，换一个目录'
      if (readdirSync(dir).length > 0) return `目录 ${dir} 非空，请清空或换一个`
      return undefined
    },
  })
  assertNotCancel(v)
  return (v as string).trim() === '' ? defaultDir : resolve(process.cwd(), (v as string).trim())
}

function assertNotCancel(v: unknown): void {
  if (p.isCancel(v)) {
    p.cancel('已取消')
    process.exit(0)
  }
}
