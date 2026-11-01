// create-dsh-plugin :: --help 文案

export function runHelp(): void {
  console.log(`
@dreamariner/create-dsh-plugin · DeepSeek Harness 插件脚手架

用法：
  npx @dreamariner/create-dsh-plugin [name] [options]

参数：
  name                 插件 npm 包名（可带 scope，如 @dreamariner/dsh-foo）
  --type <t>           插件形态：host（纯 Node 半边）| client（纯浏览器半边）| full（双端）
  --dir <dir>          生成目录（默认：当前目录下以插件 id 命名）
  --title <t>          人读名（默认：插件 id；写入 locale 的 meta.title）
  --description <d>    一句话描述（默认：模板文案，建议生成后修改）
  --no-install         生成后不自动 pnpm install
  --no-git             生成后不 git init（目标已在 git 仓内时自动跳过）
  -h, --help           本说明

生成内容：
  · pnpm 工程（packageManager 固定 pnpm@11.7.0）
  · tsdown 构建：host 半边 lib/index.js（ESM），client 半边 lib/client.js（CJS + 模块表外置）
  · 自挂载 bundle（cordis.patch.yml + dsh.bundle 声明）
  · 展示元数据（locale/en.json、locale/zh.json、icon.svg，官方 checklist 要求项）
  · 开发循环：pnpm dev（watch）、pnpm dev:hmr（宿主半边 hmr 接线，client 半边自动热替换）
  · 发布配置：prepare 自动构建 + files 白名单 + access=public
  · 自守护栏测试（bundle 形态 / client 边界）

文档：https://github.com/dreamariner/create-dsh-plugin
`)
}
