# @dreamariner/create-dsh-plugin

DeepSeek Harness（DSH）插件脚手架：一键创建**可发布、可安装、可热重载**的插件项目。

```sh
npx @dreamariner/create-dsh-plugin
# 或带参数：
npx @dreamariner/create-dsh-plugin @dreamariner/dsh-foo --type full
```

未发布的包也能从 git 直跑（pnpm 会先跑 prepare 构建）：

```sh
pnpm dlx github:dreamariner/create-dsh-plugin @dreamariner/dsh-foo --type host
```

## 三种插件形态

| 形态 | 产物 | 宿主半边 | 浏览器半边 | 典型例子 |
|------|------|----------|-----------|---------|
| `host` | `lib/index.js`（ESM） | tool / systemPrompt / provider / listener | 无 | 联网搜索 provider |
| `client` | `lib/client.js`（CJS + `__ModuleLoader__` 包装） | 装载壳（空 `apply`，官方 decoration 形态） | 槽位 / 面板 / 装饰（React） | 输入框装饰、UI 扩展 |
| `full` | 两份产物一次构建 + typert codegen | 完整宿主能力 + Typert Remote | 完整 UI | 记忆面板、排版预览 |

`full` 是 workspace 布局（根壳 + `packages/<id>/` 插件包 + `packages/protocol/` 声明源
submodule）：typert 生成器结构性要求被分析的包位于 `<root>/packages/` 下，单包布局
无法满足。生成时自动挂载协议声明源 submodule（私有仓，需相应访问权限；可用
`--protocol-url` 换 URL）。

交互只问三个问题（包名 / 形态 / 目录），其余从包名推导，`--help` 看全部参数。

## 生成内容（每项都有依据）

- **pnpm 工程**：`packageManager` 固定 pnpm@11.7.0，`prepare` 自动构建（git 安装即装即用）
- **typert codegen 全链路（full）**：`packages/protocol` submodule（协议声明源）+
  `tsconfig.host.json` 聚合（registration + paths 重定向）+ 插件级 `tsconfig.typert.json`
  face program + `typertPlugin`（生成 `lib/typert.host.*` 与 `lib/typert.remote-client.*`）+
  manifest 四件套（peer / 裸精确 pin / 生成器 devDep / files 显式产物清单，生成器硬性校验）+
  preinstall submodule 守卫 + 消费端护栏 spec；升级流程与 client 侧 `$mount` 接法见生成项目 README
- **tsdown 构建**：host 段 `deps` 三件套从 manifest 派生（不变式 I1/I2：peer 外置宿主供给、
  dependencies 内联、devDependencies 只许 import type）；client 段 CJS + banner/footer
  包装，`EXTERNALS`（react 系）走宿主渲染进程模块表，`onlyImport` 把模块表 miss 前移成构建期红
- **自挂载 bundle**：`cordis.patch.yml`（`- insert:` 自挂载）+ manifest 的 `dsh.bundle.patch`
  声明，`dsh plugin add` 即装即挂
- **展示元数据**：`locale/{en,zh}.json` + `icon.svg`（官方 checklist 要求项，Plugin Manager
  与 Settings 在不激活插件时就读它们）
- **开发循环**：`pnpm dev`（watch 重建，full 形态数组配置同时 watch 两端）+ `pnpm dev:hmr`
  （host 半边注册进本机 home patch 的 hmr watch 根；client 半边由 DSH 的 client-hmr 自动热替换）
- **发布配置**：`files` 白名单 + `publishConfig.access=public` + `engines.dsh` 版本范围
- **自守护栏**：bundle 形态（dsh.bundle 声明 / files 白名单 / 自挂载行写法）、client 边界
  （不 import `node:`、不 import 任何 `@deepseek-ai/dsh-client-*` 包）

## 设计依据

- DSH 官方 skill `cordis-plugin-development`（templates/decoration + references 的
  ui-plugin / host-plugin / practices：client 模块形态、dsh.client 三字段、槽位选择、
  「不 require Harness Client 包」等硬规则）
- `dreamariner/dsh-web-search-minimax`：已验证 npm 可发布、git 可安装的完整 host 先例
- 双端插件的构建与护栏形态：同代 DSH 外部插件仓的实战沉淀
- DSH 版本锚：`0.2.1-rc.3`（`src/manifest.ts` 的 `DSH_VERSION`）

## 开发本仓

```sh
pnpm install
pnpm test        # 模板矩阵自测（三类型渲染 + manifest 形态 + 占位符无残留）
pnpm typecheck
pnpm build       # 单文件 bin（lib/index.js，shebang 保留 + 依赖全量内联）
```

本地试跑：`node lib/index.js <name> --type <t> --dir <dir> --no-install --no-git`。

改模板后跑三件套：自测（文件清单断言会拦「加了模板忘了进 plan」）→ 本地生成三种类型
→ 生成项目里跑 `pnpm install && pnpm build && pnpm typecheck && pnpm test`。

## 发布

```sh
pnpm publish     # prepare 构建后打包；scoped 包已配 access=public
```

发布后：`npx @dreamariner/create-dsh-plugin`。
