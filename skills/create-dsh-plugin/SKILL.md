---
name: create-dsh-plugin
description: DeepSeek Harness（DSH）插件脚手架使用技能。当用户要新建 DSH 插件项目、向既有插件仓追加插件、把插件安装进 DSH profile、或在插件形态（host / client / full）之间迁移时使用本技能。覆盖形态选型判据、生成命令、生成后清单与红线。
---

# create-dsh-plugin · DSH 插件脚手架使用技能

## 什么时候用

- 用户说「建一个 DSH 插件」「写个 xxx 的插件」「新插件项目」
- 既有 workspace 插件仓要追加第二个插件
- 插件要从 host 升级成 full（或反向重排）
- 插件写完了要装进 profile 验收

不适用：改 DSH 内核本身、写非插件的普通 npm 包。

## 前置条件

- node ≥ 20、pnpm（生成项目由 `packageManager` 钉版）
- 运行方式：`npx @dreamariner/create-dsh-plugin`（npm 已发布）；本仓开发态用 `pnpm dlx <本仓路径>` 或直接 `node lib/index.js`

## 第一步：形态选型（唯一需要动脑的决策）

| 形态 | 判据 | 生成布局 |
|---|---|---|
| `host` | 纯 Node 半边：Agent tool、search provider、数据计算、文件处理，无界面 | 单包（根即插件包） |
| `client` | 纯浏览器半边：只加 UI（面板 / 浮层 / 设置项），无宿主进程逻辑 | 单包 |
| `full` | 双端都要，且 client 需要调用宿主进程能力（走 typert 类型化 RPC） | workspace（结构性要求，typert 生成器只认 `<root>/packages/`） |

拿不准时问一句「要不要界面？界面要不要调宿主能力？」：都不要 → host；只要界面 → client；两者都要 → full。
host 仓以后长出界面，用「跨形态重排」升级，不用重建。

## 第二步：生成

```sh
# 新建（交互只问三个问题：包名 / 形态 / 目录；全给参则零交互）
npx @dreamariner/create-dsh-plugin @dreamariner/dsh-foo --type host --dir ./dsh-foo

# 向既有 workspace 仓追加插件（在仓根执行；full 仓才支持 add）
npx @dreamariner/create-dsh-plugin add @dreamariner/dsh-bar --type client

# 跨形态重排（如 host 单包 → full workspace；本机 profile 里的旧 link 装法自动迁移）
npx @dreamariner/create-dsh-plugin @dreamariner/dsh-foo --type full --dir ./dsh-foo
```

full 形态会自动挂协议声明源 submodule（`packages/protocol`，`--protocol-url` 可换源）。

## 第三步：生成后清单（顺序执行）

```sh
cd <项目目录>
pnpm install          # full 仓缺 submodule 时 preinstall 守卫会给指引
pnpm test && pnpm typecheck && pnpm build    # 三门禁，全绿再动第一行业务代码
```

1. **三门禁绿**后再开发；生成项目的测试是自守护栏（bundle 形态 / client 边界 / typert face 安装态）
2. **换图标**：包根 `icon.svg` 是渐变拼图占位图（透明底，对齐内置插件风格），换成原创图形；约束：SVG/PNG/JPEG/WebP，≤ 256 KiB，不出包目录
3. **读 AGENTS.md**：项目定位、形态不变量、门禁与红线都在里面，Agent 后续会话以它为进仓入口
4. **文档机制**：新需求走 `docs/issues/`（cp `_template.md`、编号自增、索引表追加，工作流见其 AGENTS.md）；结构性变更在 `docs/wiki/00-变更日志.md` 留时间线
5. **写业务代码前先跑通 hello 层**：host 看 `src/index.ts` 的 demo tool，client 看 `src/client/index.tsx`，full 看 `src/remote.ts` 的 face 方法

## 第四步：装进 DSH 验收

```sh
pnpm profile:add           # link: 本仓进 ~/.dsh/profiles/desktop（缺依赖自动 install、装前构建、登记名单、自检）
pnpm profile:add --npm     # 发布后：从 npm 装
```

- desktop profile 由 Electron 应用专属管理，`dsh plugin add` 的官方 reconcile 触达不到，所以脚本自带全套动作
- 装完**重启实例一次**生效；不出现就查 `plugin.log`
- headless 场景（非 desktop profile）：`dsh plugin --profile <name> add <npm 包名>`

## 红线与坑

- **gitignore 锚定**：`lib/` 规则必须是 `/lib/`（单包）或 `packages/*/lib/`（workspace）。裸 `lib/` 会任意深度匹配、`git add` 时静默跳过 `scripts/lib/manifest-deps.mjs`，clone 出来的仓 build 必挂。**0.1.0 版脚手架生成的仓是裸 `lib/`，手动锚定一次**（0.1.1 起已修）
- **发布面无 src**：`files` 与 `exports` 不带源码是收口后的口径（0.1.0 生成的仓带 src，升级后手动收一次）
- **DSH 版本锚 `0.2.1-rc.3`**：peer 范围与 engines 锚在此，升级 DSH 时同步
- **typert 纪律（full）**：face 方法只声明在 `src/remote.ts`；协议包 devDep 必须裸精确版本（放宽会让 vendor 副本成为合法候选）；zod 必须留在 dependencies（生成产物 import 它）
- **行文不用破折号「——」**（zero 知识库行文规范）

## 参考

- 仓根 [README.md](../../README.md)：三形态矩阵、生成内容依据、设计依据
- 生成的项目内 [AGENTS.md](AGENTS.md)：Agent 进仓入口（每次进仓先读）
- 上游：[dreamariner/create-dsh-plugin](https://github.com/dreamariner/create-dsh-plugin)
