import { typertPlugin } from '@deepseek-ai/dsh-typert-generator/tsdown'
import { defineConfig } from 'tsdown'
import { fileURLToPath } from 'node:url'
import { hostDeps, readManifest } from './scripts/lib/manifest-deps.mjs'

// 双端构建：一个数组配置同时出两份产物，`pnpm dev`（tsdown --watch）同时 watch 两端。
//   lib/index.js  ← host 半边（src/index.ts，ESM，宿主进程装载）
//   lib/client.js ← client 半边（src/client/index.tsx，CJS + __ModuleLoader__ 包装，
//                    宿主渲染进程经 dsh.client 声明自动发现并装载）
// typertPlugin（host 段）：① 构建期降级标准装饰器（rolldown/oxc 原生不降）
// ② 从 src/remote.ts 的装饰器方法生成 lib/typert.host.*（wire codec）与
// lib/typert.remote-client.*（client 侧类型化 RPC 契约）。协议声明源从
// packages/protocol submodule 读（tsconfig.host.json 的 registration + paths）。
const manifest = readManifest(fileURLToPath(new URL('.', import.meta.url)))

// ── host 段 ──────────────────────────────────────────────────────────────
// 依赖策略（不变式）：名单只写在 package.json 一处 ——
//   peerDependencies → 外置（宿主拦截层供给同一实例）；
//   dependencies → 内联；devDependencies → 只许 import type。
// ⚠ 少内联一个依赖的后果不是「运行时报错」，而是 profile 装载期解析不到 →
//   插件静默不装载（cordis loader 吞异常）：没有堆栈，只有「插件不见了」。
const host = defineConfig({
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

// ── client 段 ────────────────────────────────────────────────────────────
// EXTERNALS 是宿主契约（渲染进程模块表供给，绝不打包）；清单外的裸 import 一律内联，
// onlyImport 让清单外的裸 import 在构建期直接报错。
// ⚠ 官方 practices：不要 require 任何 @deepseek-ai/dsh-client-* 包 —— 控件照宿主的
//   样子自己写，样式只引用 --dsw-alias-* 主题 token。
// ⚠ 不要把本包自己的子路径放进 EXTERNALS（不在浏览器模块表里，外置即
//   `missed the module table` → web boot: 1 entry did not activate）。
const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
]

const client = defineConfig({
  entry: ['src/client/index.tsx'],
  outDir: 'lib',
  clean: false,
  format: ['cjs'],
  platform: 'browser',
  target: 'es2022',
  fixedExtension: false,
  dts: false,
  sourcemap: true,
  deps: {
    neverBundle: EXTERNALS,
    alwaysBundle: (specifier: string) => !EXTERNALS.includes(specifier),
    onlyImport: EXTERNALS,
  },
  outputOptions: {
    entryFileNames: 'client.js',
    chunkFileNames: 'client.[name].js',
  },
  // —— 包装，与 DSH 运行时期望的字节形态一致 ——
  // ⚠ CJS 格式下 rolldown 会跳过独立的 intro（产物缺 var exports = module.exports
  //   → 浏览器 exports is not defined），故 intro 并进 banner。
  banner: [
    `window.__ModuleLoader__.load({ id: '__PACKAGE_NAME__', factory: (require) => {`,
    'var module = { exports: {} };',
    'var exports = module.exports;',
  ].join('\n'),
  footer: 'return module.exports; } });',
})

export default [host, client]
