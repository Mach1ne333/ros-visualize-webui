# Proposal

## Why

用户已经拥有 RViz2 `.rviz` 配置，当前 Web 仅接受版本化工作区 JSON，重复设置图层与属性成本高。提供有明确兼容边界的离线转换，使已有配置尽量复用，同时不假装支持未实现的 RViz 插件和写入工具。

## What Changes

- 新增独立命令行转换工具：输入 `.rviz`，输出现有 Web 可导入的 v1 JSON 和转换报告，原文件保持不变。
- 复用 Web 的注册表、默认属性和 `validateWorkspace`，映射标准显示图层、话题、Enabled、Fixed Frame、支持的属性及可转换视角；递归展开 DisplayGroup 并合并父级启用状态。
- 显式报告跳过插件、未映射属性、QoS、控制 Tools、面板布局以及视角近似/回退，不默认开启桥接连接，不创建算法或控制能力。
- 提供命令用法、兼容表和现有 TurtleBot3 配置的人工导入检查步骤。

## Capabilities

### New Capabilities

- `rviz-config-conversion`: 安全读取 RViz2 YAML、映射工作区、报告转换损失和通过 CLI 输出文件。

### Modified Capabilities

无。提案时主规格目录为空；随后按用户独立授权，原工作台已同步主规格并带七项未完整观察记录归档。转换工具不修改现有 JSON 导入语义或工作台主规格需求。

## Impact

影响项目内转换模块、CLI 启动/构建脚本、锁定的 YAML 解析依赖及文档。无需 ROS 服务、网络访问或机器人运行；不修改已有 `.rviz`、URDF、地图及算法工作区。

## Non-goals

不支持任意 RViz 插件或完整像素级复刻；不直接增加网页 `.rviz` 导入入口；不新增启动默认配置选择器；不转换导航目标/初始位姿控制功能；不新增自动化测试套件、CI 或导航实验门槛。
