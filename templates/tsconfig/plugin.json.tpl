{
  // 插件包 tsconfig：extends 根配置（拿解析环境与 exclude），只看本包 src。
  "extends": "../../tsconfig.json",
  "compilerOptions": {
    "types": ["node"],
    "noEmit": true
  },
  "include": ["src/**/*.ts", "src/**/*.tsx"]
}
