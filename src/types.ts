// create-dsh-plugin :: 共享类型

/** 插件形态：host = 纯 Node 半边；client = 纯浏览器半边（宿主壳空 apply）；full = 双端。 */
export type PluginType = 'host' | 'client' | 'full'

/** 子命令：create = 新建仓（根壳 + 默认插件）；add = 向既有 workspace 追加插件包。 */
export type Command = 'create' | 'add'

/** 一次脚手架运行的全部输入（交互 + 参数归并后的最终值）。 */
export interface ScaffoldOptions {
  /** create | add（缺省 create） */
  command: Command
  /** 项目名（目录名 / 根壳 manifest 名的来源）：create 缺省 = pluginId，可
   *  --project-name 自定义。与包名解耦：多插件项目的项目名一般不该是第一个
   *  插件的名字。add 模式不使用（项目名在 create 时已定）。 */
  projectName?: string
  /** npm 包名（可带 scope，如 @dreamariner/dsh-foo） */
  packageName: string
  /** cordis 插件行 id（包名去 scope） */
  pluginId: string
  /** 人读名（locale 的 meta.title / client 徽标文案） */
  title: string
  /** 一句话描述（meta.description / manifest description） */
  description: string
  type: PluginType
  /** 工作目录（绝对路径）：create = 生成目标目录；add = 既有 workspace 仓根 */
  targetDir: string
  /** typert 协议声明源共享仓 git URL（full 形态挂 submodule 用；缺省用内置默认） */
  protocolUrl?: string
  /** 生成后自动 pnpm install */
  install: boolean
  /** 生成后 git init（目标已在 git 仓内时自动跳过） */
  git: boolean
}

/** 渲染计划里的一条文件动作。 */
export interface RenderFile {
  /** 相对 templates/ 的源文件（.tpl 结尾 = 需要占位符替换并剥后缀） */
  from: string
  /** 相对 targetDir 的目标路径 */
  to: string
}

export const PLUGIN_TYPES: ReadonlyArray<{ value: PluginType; label: string; hint: string }> = [
  {
    value: 'host',
    label: 'host · 纯 Node 半边',
    hint: '注册 tool / systemPrompt / provider 等宿主能力，无浏览器 UI（示例：搜索 provider）',
  },
  {
    value: 'client',
    label: 'client · 纯浏览器半边',
    hint: 'Web UI 扩展（槽位 / 面板 / 装饰），宿主半边只是装载壳（官方 decoration 形态）',
  },
  {
    value: 'full',
    label: 'full · host + client 双端',
    hint: 'Node 能力 + 浏览器 UI 各一份产物（示例：记忆面板、排版预览）',
  },
]
