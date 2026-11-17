import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'
import { defineConfig } from 'tsdown'
import { fileURLToPath } from 'node:url'
// 项目共用脚本住根 scripts/（一仓一份，add 插件不复制）
import { hostDeps, readManifest } from '../../scripts/lib/manifest-deps.mjs'

// host 段构建（tsdown.host.config.ts）：src/index.ts → lib/index.js（ESM，宿主进程装载）。
// typertPlugin 在这一步生成 lib/typert.host.*（wire codec）与 lib/typert.remote-client.*
// （client 侧类型化 RPC 契约），client 段（tsdown.client.config.ts）随后内联后者。
// 协议声明源从 packages/protocol submodule 读（tsconfig.host.json 的 registration + paths）。
//
// ⚠ 构建顺序：host 段先、client 段后（build 脚本按序跑两条命令）。client 产物要内联
//   host 段**当轮**生成的 lib/typert.remote-client.js；合成一个 tsdown 配置时两段并行跑，
//   client 会内联上一轮的旧契约（remote.ts 方法增删后客户端与宿主对不上），fresh clone
//   时甚至解析不到该文件。`tsdown.config.ts` 只给 `pnpm dev`（watch 两段）用。
//
// 依赖策略（不变式）：名单只写在 package.json 一处 :
//   peerDependencies → 外置（宿主拦截层供给同一实例）；
//   dependencies → 内联；devDependencies → 只许 import type。
// ⚠ 少内联一个依赖的后果不是「运行时报错」，而是 profile 装载期解析不到 →
//   插件静默不装载（cordis loader 吞异常）：没有堆栈，只有「插件不见了」。
const manifest = readManifest(fileURLToPath(new URL('.', import.meta.url)))

export default defineConfig({
  entry: ['src/index.ts'],
  format: 'esm',
  platform: 'node',
  outDir: 'lib',
  dts: false,
  // tsdown 0.22 对 node 平台默认 fixedExtension=true（强制 .mjs）；关掉它按包内
  // type: module 出 .js，与 DSH/社区包的 lib/index.js 形态一致。
  fixedExtension: false,
  clean: false, // host 与 client 共用 lib/，且构建失败不能毁掉上一份产物
  deps: hostDeps(manifest),
  plugins: [typertPlugin({ mode: 'workspace', faces: ['host'] })],
})
