// create-dsh-plugin :: --help 文案

export function runHelp(): void {
  console.log(`
@dreamariner/create-dsh-plugin · DeepSeek Harness 插件脚手架

用法：
  npx @dreamariner/create-dsh-plugin [add] [name] [options]

子命令：
  create（缺省）        新建插件仓（workspace：根壳 + packages/<id>/ 默认插件）
  add                   向既有仓追加一个插件包（在仓根执行；--dir 指定仓根）
                        full 形态自动补协议 submodule 与 tsconfig.host.json 接线

参数：
  name                 插件 npm 包名（可带 scope，如 @dreamariner/dsh-foo）
  --project-name <n>   项目名（create：生成目录名与根壳 manifest 名的来源；缺省 =
                       插件 id，根壳名 <id>-workspace；显式给出且 ≠ 插件 id 时
                       根壳名 = 裸项目名，不加后缀）。与包名解耦：多插件项目的
                       项目名一般不该是第一个插件的名字。add 模式不使用
  --type <t>           插件形态：host（纯 Node 半边）| client（纯浏览器半边）| full（双端）
  --dir <dir>          create：生成目录（默认：当前目录下以插件 id 命名）
                       add：workspace 仓根（默认：当前目录）
  --title <t>          人读名（默认：插件 id；写入 locale 的 meta.title）
  --description <d>    一句话描述（默认：模板文案，建议生成后修改）
  --protocol-url <u>   typert 协议声明源共享仓的 git URL（full 形态自动挂 submodule 用；
                       默认 git@github.com:dreamariner/dsh-typert-protocol.git）
  --no-install         生成后不自动 pnpm install
  --no-git             create：生成后不 git init（目标已在 git 仓内时自动跳过）
  -h, --help           本说明

生成内容：
  · pnpm workspace（packageManager 固定 pnpm@11.7.0）：默认一个插件包，add 可继续
    追加任意多个，根壳脚本 pnpm -r 递归转发，加包不改根
  · tsdown 构建：host 半边 lib/index.js（ESM），client 半边 lib/client.js（CJS + 模块表外置）
  · 自挂载 bundle（cordis.patch.yml + dsh.bundle 声明）
  · 展示元数据（locale/en.json、locale/zh.json、icon.svg，官方 checklist 要求项）
  · 开发循环：pnpm dev（watch）、pnpm dev:hmr（宿主半边 hmr 接线，client 半边自动热替换）
  · 发布配置：prepare 自动构建 + files 白名单 + access=public（每个插件包独立发布）
  · full 形态：dsh-typert-protocol submodule + typert codegen 全链路（face 配置 /
    remote 契约模板 / 消费端护栏）
  · 自守护栏测试（bundle 形态 / client 边界 / 协议消费端）

文档：https://github.com/dreamariner/create-dsh-plugin
`)
}
