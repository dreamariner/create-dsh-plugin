{
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
  "include": ["src/**/*.ts", "src/**/*.tsx", "tests/**/*.ts", "scripts/**/*.mjs"],
  "exclude": [
    // packages/protocol（typert 协议声明源，full 形态的 submodule）：只属于生成器
    // face program（tsconfig.host.json 的 paths 重定向）。进根程序会与 npm 协议包
    // d.ts 的同名 Context 增强撞车（TS2717 双重声明）。client 形态无此目录，排除空路径无害。
    "packages/protocol"
  ]
}
