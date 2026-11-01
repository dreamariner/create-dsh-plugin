{
  // workspace 根 tsconfig：覆盖全部插件包源码与测试（full 布局）。
  // packages/protocol（typert 协议声明源 submodule）必须 exclude：它只属于生成器
  // face program（tsconfig.host.json 的 paths 重定向），进根程序会与 npm 协议包
  // d.ts 的同名 Context 增强撞车（TS2717 双重声明）。
  "compilerOptions": {
    "target": "es2023",
    "module": "esnext",
    "moduleResolution": "bundler",
    "allowImportingTsExtensions": true,
    "jsx": "react-jsx",
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": ["node"]
  },
  "include": [
    "packages/*/src/**/*.ts",
    "packages/*/src/**/*.tsx",
    "packages/*/tests/**/*.ts",
    "packages/*/tests/**/*.tsx"
  ],
  "exclude": ["packages/protocol"]
}
