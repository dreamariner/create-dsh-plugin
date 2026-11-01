{
  // Host face 聚合（typert 生成器的 workspace 入口）。extends 根配置拿解析环境：
  // moduleResolution bundler / allowImportingTsExtensions 等，生成器 program 的
  // 选项来自本文件的 parsed options，缺了它们 cordis（exports-only 包）与
  // packages/protocol 的 .ts 后缀导入都解析不了。
  // 本文件只在构建期被 typertPlugin 读取，不参与 tsc --noEmit（根 tsconfig 才是）。
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "noEmit": true,
    // 生成器 face program 专用：把协议包说明符重定向到 pinned vendor 副本
    // （packages/protocol submodule）。生成器要求 Remote/TypertRemoteService 声明
    // 位于名为 @deepseek-ai/dsh-typert-protocol 的 workspace registration 内，
    // npm 包在 node_modules 不满足，必须走本重定向。
    "baseUrl": ".",
    "paths": {
      "@deepseek-ai/dsh-typert-protocol": ["./packages/protocol/src/index.ts"],
      "@deepseek-ai/dsh-typert-protocol/*": ["./packages/protocol/src/*"]
    }
  },
  "files": [],
  "references": [
    { "path": "packages/protocol" },
    { "path": "packages/__PLUGIN_ID__/tsconfig.typert.json" }
  ]
}
