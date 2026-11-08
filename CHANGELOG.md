# 变更日志（Changelog）

本仓所有显著变更记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)（0.x 阶段 minor 允许破坏性变更）。

## [0.3.0] - 2026-11-08

### 新增

- 生成物的插件 manifest 按需写入 `author` / `homepage` / `repository` 三个市场展示字段（官方
  plugin-market-generator 收录时读取且无兜底，缺失则 Discover 卡片留白）。来源链：
  显式 flag > git origin remote（仅当目标 = 仓库顶层）> 包名 scope 推 github 地址；都没有则省略
- 新增 `--author` / `--homepage` / `--repository` 三个参数；取值与归一化逻辑住新模块 `src/repo.ts`
  （读取器注入，可测）。URL 一律先归一化成 https 网页 URL（官方生成器解析不了未知 host 的 scp 形式）；
  `homepage` 缺省跟随 `repository`；`author` 缺省取 git config user.name
- workspace 布局自动带 `repository.directory = packages/<id>`；add 路径恒带

### 修复

- 发版审计①：`import-guard.spec.ts` 模板的 `isTypeOnlyBinding` 改用 `isNamedImports` /
  `isNamedExports` 守卫窄化（AST 联合形状随 TS 小版本变化，TS 5.9.3 下生成项目 typecheck 红）
- 发版审计②：`substitutionsOf` 显式接受布局参数（add 追加 host / client 插件时占位符误按 single
  推导：护栏 spec 找错 manifest 与源码目录、host 的 tsdown 断链 `pnpm -r build`）+3 回归测试

### 变更

- DSH 版本锚三处同步 `0.2.1-rc.3` → `0.2.2-rc.1`（README / SKILL / manifest 注释，随 0.2.0 起的实际锚值）

## [0.2.0] - 2026-11-06

> 此版本未发布到 npm（只存在于 git），其内容随 0.3.0 一起交付。

### 新增

- 生成项目自带文档机制：`docs/issues/`（需求单模板与索引）与 `docs/wiki/00-变更日志.md`
- 生成项目自带 `AGENTS.md`（Agent 进仓入口），按插件形态完整分化；条件块引擎换栈式配对（支持嵌套）
- 新增脚手架使用技能 `skills/create-dsh-plugin/SKILL.md`（形态选型判据、生成后清单、红线与坑）
- 生成项目自带 DSH 实例管理脚本 `pnpm dsh:start / dsh:restart / dsh:stop / dsh:status / dsh:probe`
- 源码导入纪律护栏：依赖决策表红线接线（`runtimeAllowed` 首个消费者），devDep 断言补 client
  模块表供给豁免

### 变更

- DSH 版本锚跟进 `0.2.2-rc.1`（peer 范围、engines、devDeps 与模板注释随动）
- 清洗仓内对具体消费项目的引用（公开仓保持通用表述）

## [0.1.1] - 2026-11-03

### 新增

- `--project-name` 参数：项目名与包名解耦（目录名 / 根壳 manifest 名跟项目名）
- 跨形态重排：`create --dir` 指向非空仓时自动迁移 profile 里的旧 `link:<仓根>` 装法
- `pnpm profile:add`：一条命令装包 + 登记 bundles 名单 + 自检（link 态装前自动构建，撤 git 直装）
- typert 面安装态护栏测试（zod 必须留在 dependencies）

### 变更

- 布局按形态分家：host / client 单包（根即插件包），full workspace（结构性要求）
- 发布面收口：生成的插件 manifest 不再携带 src 源码（`files` 与 `exports` 只含产物）
- 项目共用脚本归根（`scripts/`），dev-hmr 项目化（一仓一份）
- 文档同步钩子从 `prepublishOnly` 改挂 `prepare`（pack 与 git 安装也触发）
- 占位图标重设计为通用拼图块（透明底渐变，对齐内置插件风格）

### 修复

- `.gitignore` 锚定 lib 忽略规则（裸 `lib/` 任意深度匹配，`git add` 静默跳过 `scripts/lib/` 共享模块）
- `sync-pack-docs` 目的地硬守卫（只许 `packages/` 下，防仓根真源被覆盖）
- 发布产物补 README / LICENSE；workspace 仓的 git 安装指引修正

## [0.1.0] - 2026-11-01

### 新增

- 首发：DSH 插件脚手架，host / client / full 三形态一键创建（`npx @dreamariner/create-dsh-plugin`）
- full 形态 typert codegen 全链路：协议声明源 submodule 自动挂载 + 生成器 face 配置 + wire 契约
- 一仓多插件：三形态统一 workspace 布局 + `add` 子命令
- 根 tsconfig 收编全部插件包 tests（测试也进类型检查）
- 生成物 manifest 的 exports 补展示元数据导出面（`./locale/*.json` 与 `./icon`）

[0.3.0]: https://github.com/dreamariner/create-dsh-plugin/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/dreamariner/create-dsh-plugin/compare/0.1.1...0.2.0
[0.1.1]: https://github.com/dreamariner/create-dsh-plugin/compare/0.1.0...0.1.1
