# Proposal

## Why

现有 RViz2 能呈现激光扫描、地图和 Fast-LIO2 三维点云，但布局与操作方式不符合用户希望的独立可视化软件。需要先建立漂亮、通用的 ROS2 Web 可视化工作台，之后再独立适配 Nav2、RL 局部规划器及论文实验后端，而不把界面绑定到特定算法。

## What Changes

- 新建独立项目 `ros2-web-visualizer`，在 Ubuntu 22.04 / ROS2 Humble / WSL2 中启动服务，在 Windows 浏览器访问。
- 提供自定义布局：话题浏览、显示类型选择、图层树及属性面板、中央 2D/3D 视图、速度卡片和诊断信息。
- 第一期支持 Grid、Axes、LaserScan、PointCloud2、Map、TF、Path、Pose、PoseArray、Odometry、RobotModel、Marker/MarkerArray，显示能力与常用参数参考 RViz2；不承诺全部插件完整兼容。
- LaserScan 配置包括 Topic/QoS、Selectable、Style、Size、Alpha、Decay Time、位置与颜色转换器、强度通道、彩虹及强度范围；Odometry 包括位置/角度容差、历史数量、形状及协方差。各参数须真实生效或明确标记不支持，不能是空控件。
- 通过只读 ROS 桥接接收消息并进行 TF 时间对齐；提供实时状态、受限资源访问、缓存上限及连接恢复。
- 配置可导出、导入及本地恢复；显示指令速度与可选里程计估计速度，并区分数据过期。
- 交付安装、启动和常用话题配置说明；最终验收由用户主动运行并观察，开发者可自行观察截图差异，不增加自动化测试或导航实验作为验收门槛。

## Capabilities

### New Capabilities

- `ros-data-session`: 只读桥接连接、话题发现、解码、TF、状态及机器人资源访问。
- `visualization-workbench`: Web 布局、显示注册、属性配置、视角、选择及工作区保存。
- `robotics-display-layers`: ROS 消息的空间可视化、RViz 风格属性语义及速度卡片。

### Modified Capabilities

无；项目为新建，尚无现有规格或实现。

## Impact

引入 React、TypeScript、Three.js/WebGL 与 ROS2 WebSocket 桥接依赖；计划优先采用 Foxglove Bridge 的二进制消息。当前未安装桥接组件，开发时需确认 Humble 版本及 CDR 解码。URDF 模型需要受限的资源服务。保留现有 `turtlebot3-fast-lio2` 与 `isaac_nav` 项目不变，不启动或替换算法；不创建 GitHub 仓库。

## Non-goals

本期不提供速度指令发布、目标/初始位姿发布、导航或建图启动、算法后端适配、实验指标计算、完整 RViz 插件或 `.rviz` 文件兼容，也不提供远程公开部署、账户系统和硬件安全保证。
