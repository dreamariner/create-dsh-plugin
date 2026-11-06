# AGENTS.md · __PROJECT_NAME__

> Agent 进仓先读本文：项目定位、目录结构、形态不变量、门禁与红线。人向的安装与使用说明在 [README.md](README.md)。

## 项目定位

__PACKAGE_NAME__：__DESCRIPTION__。由 create-dsh-plugin 生成的 DeepSeek Harness（DSH）插件，形态：**__PLUGIN_TYPE_LABEL__**。

## 文档机制

- 需求与迭代跟踪：[docs/issues/AGENTS.md](docs/issues/AGENTS.md)（唯一索引 / 状态真相源，新 issue 走其工作流）
- 系统现状：[docs/wiki/00-变更日志.md](docs/wiki/00-变更日志.md)（结构变化在此留时间线）

## 目录结构

<!--#if single-->
```
├── src/                # 源码
├── tests/              # 自守护栏测试（bundle 形态 / client 边界 / 导入纪律）
├── scripts/            # 项目共用：profile-add / lib/manifest-deps（host 另有 dev-hmr）
├── locale/             # 展示元数据（Plugin Manager / Settings 在不激活插件时经 exports 读取）
├── icon.svg            # 占位图标（透明底渐变拼图，替换成你的原创图形）
├── cordis.patch.yml    # 自挂载 bundle 的配置层
├── lib/                # 构建产物（不入库）
└── package.json        # manifest（files / exports / dsh 键）
```
<!--#endif-->
<!--#if workspace-->
```
├── packages/__PLUGIN_ID__/     # 插件包（src / tests / locale / icon.svg / cordis.patch.yml）
<!--#if full-->
├── packages/protocol/          # typert 协议声明源 submodule（pinned vendor，勿改内容）
<!--#endif-->
├── scripts/                    # 项目共用：profile-add / dev-hmr / sync-pack-docs / lib/manifest-deps
│                               # （full 另有 ensure-protocol）
├── lib/                        # 各包构建产物（packages/*/lib/，不入库）
├── tsconfig.host.json          # host 面聚合 tsconfig（registration + paths 重定向）
└── package.json                # 根壳 manifest（private；pnpm -r 转发构建）
```
<!--#endif-->

## 形态速记

<!--#if single-->
- 单包布局：根即插件包，npm 发布 / `dsh plugin add` / `profile:add` 都以本仓为单位。
<!--#endif-->
<!--#if workspace-->
- workspace 布局：根壳承载测试与类型检查，插件包在 `packages/__PLUGIN_ID__/`；`add` 子命令可继续追加插件，无需迁移结构。
<!--#endif-->
<!--#if host-->
- host 半边：`src/index.ts`（manifest 三件套接线 + demo tool）与 `src/config.ts`（schemastery 配置 schema），无浏览器面。
<!--#endif-->
<!--#if client-->
- client 半边：`src/client/index.tsx` 经 `dsh.client` manifest 由宿主渲染进程装载（`./client` 导出面）；`src/index.ts` 是宿主壳（空 apply，仅占 manifest 位，勿在里面写逻辑）。
<!--#endif-->
<!--#if full-->
- 双端：host 半边 `src/index.ts`（tool + Config + deps 三件套）承接数据与计算；client 半边 `src/client/index.tsx` 承接界面。
- typert face：client → host 的类型化 RPC，方法只声明在 `src/remote.ts`，构建期生成 `lib/typert.host.*`（宿主装配 wire codec）与 `lib/typert.remote-client.*`（client 侧类型化契约）。
- 协议声明源：`packages/protocol` submodule（pinned vendor，勿在本仓改它的内容）。
<!--#endif-->

## 常用命令

```sh
pnpm install        # 首次
pnpm build          # 构建（产物进 lib/，不入库）
pnpm test           # 自守护栏测试
pnpm typecheck
pnpm dev            # watch 重建
<!--#if host|full-->
pnpm dev:hmr        # host 半边热重载接线（client 半边重建即热替换）
<!--#endif-->
pnpm profile:add    # link: 安装进 ~/.dsh/profiles/desktop（缺依赖自动 install、装前自动构建、登记名单、自检）

# ── DSH 实例管理 ──
pnpm dsh:status     # 实例在跑与否 + 访问地址
pnpm dsh:start [前台|后台]   # 启动实例（打包版带 --inspect；启动前有构建门）
pnpm dsh:restart    # 优雅停止后重启（默认后台）
pnpm dsh:stop       # 优雅停止（inspector 自动应答退出；兜底属主圈定）
pnpm dsh:probe      # 连实例验证本插件装载且 active（pluginInventory/list）
```

## 红线

- **lib 不入库**：构建产物不进 git。gitignore 已按布局锚定（single = `/lib/`，workspace = `packages/*/lib/`）；勿改回裸 `lib/`，那会任意深度匹配误伤 `scripts/lib/` 共享模块，clone 出来的仓 build 直接挂。
- **发布面不含 src**：`files` 白名单与 `exports` 都不带源码；`./src/*` 是官方 client 包的 monorepo 内约定，独立发行插件无人消费。
- **DSH 版本锚 `0.2.2-rc.1`**：peerDependencies 范围与 `engines.dsh` 都锚在此，升级时同步 `package.json` 与注释。
- **依赖决策表**：peer = 外置（宿主供给同一实例，运行期共享）；dependencies = 内联自带；devDependencies = 只许 `import type`。唯一事实源是 `package.json`（`scripts/lib/manifest-deps.mjs` 派生 tsdown 三件套），源码导入纪律由 `tests/import-guard.spec.ts` 机械执行。
<!--#if host|full-->
- **schemastery 双声明**：peer（与宿主共享实例）+ dev（精确钉本仓 typecheck），缺一会装出两份实例。
- **cordis 只许 `import type { Context }`**：dev 钉版仅服务 typecheck。值导入前必须先把 cordis 升进 peerDependencies，否则 alwaysBundle 会把它内联进产物，运行期出现第二份 cordis 实例（作用域与注册表不跨副本共享，插件静默失灵；教训源自 luna-dsh 2026-10-22 事故），导入护栏会拦。
<!--#endif-->
<!--#if full-->
- **typert 纪律**：face 方法只声明在 `src/remote.ts`；协议包 devDep 必须裸精确版本（放宽会让 vendor 副本成为合法候选）；zod 必须留在 dependencies（生成产物 import 它）。
<!--#endif-->
- **实例固定经 `pnpm dsh:start` 启动**：打包版要带 `--inspect` 才有 inspector，Dock 直启的实例 stop / restart 管不了；启动前构建门失败会阻断（lib 不入库，没有旧产物可跑）。
- **行文不用破折号「——」**（zero 知识库行文规范，2026-11-01 起）。
