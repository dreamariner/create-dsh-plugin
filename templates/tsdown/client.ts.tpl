import { defineConfig } from 'tsdown'

// client（浏览器）半边构建：产物 lib/client.js，由宿主渲染进程经
// window.__ModuleLoader__ 装载（dsh.client 声明触发自动发现）。
//
// 产物形态必须与 DSH 运行时一致：CJS + __ModuleLoader__ 包装（banner/footer 由本
// 配置生成）。EXTERNALS 是**宿主契约**：这些包由渲染进程模块表（PLATFORM_MODULES）
// 供给，绝不打进 bundle；反之清单外的裸 import 一律内联，onlyImport 让「清单外的
// 裸 import」在构建期直接报错（把运行期的模块表 miss 前移成构建期红）。
//
// ⚠ 官方 practices：不要 require 任何 @deepseek-ai/dsh-client-* 包 —— 它们随时可能
// 变，也不在你的模块表清单里。控件照宿主的样子自己写，样式只引用 --dsw-alias-* token。
// ⚠ 不要把本包自己的子路径（__PACKAGE_NAME__/client 等）放进 EXTERNALS：它们经
// package.json self-reference 解析，不在浏览器模块表里，外置即
// `require(...) missed the module table` → web boot: 1 entry did not activate。
const EXTERNALS = [
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
]

export default defineConfig({
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
  //   → 浏览器 exports is not defined → web boot: N entry did not activate），
  //   故 intro 并进 banner。
  banner: [
    `window.__ModuleLoader__.load({ id: '__PACKAGE_NAME__', factory: (require) => {`,
    'var module = { exports: {} };',
    'var exports = module.exports;',
  ].join('\n'),
  footer: 'return module.exports; } });',
})
