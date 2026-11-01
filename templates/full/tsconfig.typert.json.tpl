{
  // 插件包级的 typert face program：生成器用它解析本包源码（收集 @Remote 与
  // export 图）。被根 tsconfig.host.json 的 references 引用，单独存在是因为
  // face program 的 include 只收本包 src（与根 tsconfig 的 exclude/结构解耦）。
  // 协议包 import 的类型从 node_modules 的 npm 包（devDep 精确 pin）解析，
  // 与 packages/protocol 声明源互不干扰（声明源只服务 isTypeMetaSymbol 的
  // registration 认领，见 tsconfig.host.json）。
  "extends": "./tsconfig.json",
  "compilerOptions": {
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
