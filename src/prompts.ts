// create-dsh-plugin :: 交互层（@clack/prompts）
//
// 交互最少化：只问「包名」「类型」「目录」三个问题，其余全部从包名推导或用缺省值；
// README 引导用户生成后自行改 locale 文案与 description。

import * as p from '@clack/prompts'
import { existsSync, readdirSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import { parseArgs, validateName, type CliArgs } from './args.ts'
import { PLUGIN_TYPES, type PluginType, type ScaffoldOptions } from './types.ts'

export async function promptScaffold(argv: string[]): Promise<ScaffoldOptions> {
  const args: CliArgs = parseArgs(argv)

  const packageName = args.name ?? await askName()
  const nameError = validateName(packageName)
  if (nameError !== undefined) {
    p.cancel(nameError)
    process.exit(1)
  }

  const type = args.type ?? await askType()

  const pluginId = packageName.includes('/') ? packageName.slice(packageName.indexOf('/') + 1) : packageName
  const defaultDir = resolve(process.cwd(), pluginId)
  const targetDir = args.dir !== undefined ? resolve(process.cwd(), args.dir) : await askDir(defaultDir)

  const title = args.title ?? pluginId
  const description = args.description ?? `${pluginId}：DeepSeek Harness 插件`

  return { packageName, pluginId, type, targetDir, title, description, protocolUrl: args.protocolUrl, install: args.install, git: args.git }
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
