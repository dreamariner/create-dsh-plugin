# 变更日志（Changelog）

本仓所有显著变更记录于此。格式参考 [Keep a Changelog](https://keepachangelog.com/zh-CN/1.1.0/)；
版本号遵循 [语义化版本](https://semver.org/lang/zh-CN/)（0.x 阶段 minor 允许破坏性变更）。

## [0.4.2] - 2026-11-18

### 修正

- full 形态构建拆成 host / client 两段按序跑。此前模板是单一 `tsdown.config.ts` 数组
  配置，两段并行：client 产物要内联 host 段**当轮**生成的 `lib/typert.remote-client.js`
  （typertPlugin 在 host 段构建时生成 wire 契约），并行跑会让 client 内联上一轮的旧
  契约（`src/remote.ts` 方法增删后客户端与宿主对不上），fresh clone 时甚至解析不到该文件
- 生成结构变化：full 插件包从单 `tsdown.config.ts` 变为三份
  （`tsdown.host.config.ts` / `tsdown.client.config.ts` / `tsdown.config.ts` 仅作 dev
  watch 组合，两段并行，交付构建勿用）；插件包 build 与 prepare 按序跑两段
  （prepare = `pnpm run build && node ../../scripts/sync-pack-docs.mjs`）。host / client
  形态不变（仍单配置），add 追加插件按形态取用
- 文档同步：README（开发说明 / 结构树 / 依赖纪律 / typert 构建接线）、生成项目 AGENTS.md
  模板（红线新增「构建顺序：host 段先、client 段后」，协议包口径的引用改指
  `tsdown.client.config.ts`）、SKILL.md（构建顺序 + 存量仓拆分指引）。实测参照：
  dsh-notify 已按此形态运行（2026-11-17 清空 lib/ 从零构建验证过）

## [0.4.1] - 2026-11-18

### 修正

- 删除 full 形态 README「client 侧消费」里「把 `@deepseek-ai/dsh-typert-protocol` 加进
  client 段 `EXTERNALS`」的错误指引：渲染进程模块表种子（DSH `packages/client/web/src/
  platform.ts` 的 `PLATFORM_MODULES`）没有协议包，协议包也无 client 模块行，
  `dsh.client.external` 请求只能落到种子或别的 client 模块行，外置后 client 的 require
  会 `missed the module table`（插件 client 静默失效）。「内联解析不到」的预期也被协议包
  devDep 裸精确 pin 掩盖（构建期解析得到，静默内联成功）
- 正确口径沉淀进四处，生成的项目开箱自带依据：README（协议包两半边不对称：host 外置 /
  client 内联，内联的是 npm 发布副本而非 vendor submodule）、生成项目 AGENTS.md 模板
  （形态速记新增一条 + typert 纪律红线补 client 半边口径）、SKILL.md（typert 纪律）、
  `tsdown/full.ts.tpl` client 段注释。依据：DSH `packages/client/tsdown.client.ts` 的
  `INLINE_SAFE` / `GENERATED_REMOTE`（no runtime identity to share）与官方 client 装配
  `api/remotes/src/client` 的实践；实证：dsh-notify / dsh-ledger / dsh-pilot /
  luna-dsh-memory 四个 full 插件 client 产物逐一同构（协议包与 zod 内联、react 外置、
  自挂载）

## [0.4.0] - 2026-11-16

### 新增

- `dsh-ctl.mjs` 实例管理升级为「机制 + 门 + 可测试导出面」三合一（机制借自早期插件仓
  instance-control 的实测经验，随实例控制统一上浮为标准能力）：
  - **导出化**：isMain 双形态，护栏测试可 `import { status, stop, probe, … }`
  - **仓根 .env 自动加载**：真实环境变量优先、.env 只补缺、缺失静默 no-op（内联实现，
    不新增模板文件）；机密仍只进 `~/.dsh/.env`，仓根 .env 只放路径/端口/形态/开关
  - **版本门**：根 manifest 有 `dshVersion` 字段时，启动前对账官方打包版
    `CFBundleShortVersionString`，不符拒启（`DSH_ALLOW_VERSION_MISMATCH=1` 越过）；
    字段缺失 = 门不启用，存量仓零影响
  - **在飞回合守卫**：`DSH_INFLIGHT_GUARD=1` 开启后，stop/restart 前扫 `$DSH_HOME/sessions`
    下 2 小时内活跃会话（session.v*.jsonl 取最大版本判读），turn/start 无配对 turn/end
    即拦下（`DSH_FORCE_STOP=1` 越过）
  - `status --json`（供 automation）与 `record` 子命令（wrapper 型启动脚本注入状态）
- 根 manifest 发射 `dshVersion` 字段（= DSH 版本锚，版本门的对账源；single 布局落包 manifest）

## [0.3.2] - 2026-11-13

### 变更

- DSH 版本锚 `0.2.2-rc.1` → `0.2.2-rc.2`（`src/manifest.ts` 的 `DSH_VERSION`）：生成物 peer 范围、
  typert-generator / typert-protocol dev 精确钉同步。vendor 数值不变（cordis 4.1.0、schemastery 3.19.0）
- full 形态生成物 `files` 增加 `lib/typert.remote-client.d.ts.map`：DSH 0.2.2-rc.2 的 typert 生成器
  硬性要求 remote-client 的 declaration map 入列（生成的 d.ts 带 sourceMappingURL，map 随包发行），
  缺它构建期直接报「package files must include lib/typert.remote-client.d.ts.map」
- full 形态生成物 dependencies 的 zod `^4.4.3` → `^4.6.6`：上游协议包 0.2.2-rc.2 起精确 pin zod 4.6.6

## [0.3.1] - 2026-11-12

> 此版本未发布到 npm（只存在于 git），其内容随 0.3.2 一起交付。

### 变更

- 依赖锚同步宿主实况：schemastery `3.18.5` → `3.19.0`（peer 范围 `>=3.19.0 <4.0.0-0` + dev 精确钉）、
  cordis dev 精确钉 `4.0.5` → `4.1.0`。依据：DSH `0.2.2-rc.1` 的 vendor 版本
  （deepseek-harness `vendor/cordis` 4.1.0、`vendor/schemastery` 3.19.0），与同代外部插件仓的实钉一致。
  宿主对这二者从不降级，生成物 peer 收窄到 `3.19.0` 起不会排除任何在跑的宿主

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

[0.4.0]: https://github.com/dreamariner/create-dsh-plugin/compare/0.3.1...0.4.0
[0.3.1]: https://github.com/dreamariner/create-dsh-plugin/compare/0.3.0...0.3.1
[0.3.0]: https://github.com/dreamariner/create-dsh-plugin/compare/0.2.0...0.3.0
[0.2.0]: https://github.com/dreamariner/create-dsh-plugin/compare/0.1.1...0.2.0
[0.1.1]: https://github.com/dreamariner/create-dsh-plugin/compare/0.1.0...0.1.1
