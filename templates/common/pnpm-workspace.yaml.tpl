packages:
  # 全部插件包（packages/<id>/）+ 协议声明源 submodule（dreamariner/dsh-typert-protocol，
  # full 形态挂载于 packages/protocol）。typert 生成器结构性要求被分析的包位于
  # <root>/packages/ 下，因此插件统一住 packages/。
  - packages/*
