# ROS2 Web Visualizer

独立 ROS2 Web 可视化工作台：浏览话题，在自定义 WebGL 视图显示扫描、点云、地图、TF、路径、位姿、里程计和机器人模型，配置 RViz 风格属性。采用 React/TypeScript/Three.js，不运行 RViz，不绑定 Fast-LIO2、Nav2 或 RL 算法。

**WebUI 与配置转换工具已获用户手动试用确认并归档；尚未完整覆盖的显示/时间场景保留在开发记录中，不承诺所有类型均已验证。** 本期只读：没有控制、建图启动、导航启动或实验统计按钮，不发送 `/cmd_vel`、初始位姿或导航目标。

## 环境与安装

Ubuntu 22.04、ROS2 Humble、Linux x86_64、Python3、支持 WebGL 的浏览器。Windows 可通过 WSL2 使用。Node.js 安装在项目 `.tools/`，不替换系统 Node。

先安装 ROS2 Humble 并配置其 apt 软件源（参见 [ROS2 Humble Ubuntu 安装说明](https://docs.ros.org/en/humble/Installation/Ubuntu-Install-Debians.html)）。下面是新机器的首次安装命令；已有项目目录时不要重复 clone：

```bash
sudo apt update
sudo apt install git curl xz-utils
git clone https://github.com/Mach1ne333/ros-visualize-webui.git ~/ros2-web-visualizer
cd ~/ros2-web-visualizer
sudo apt install ros-humble-foxglove-bridge=3.5.0-1jammy.20260908.091358
./scripts/setup-node.sh
./scripts/build.sh
```

构建含 WebUI、转换 CLI 和 TypeScript 检查；首次安装需要网络。仓库不包含 Node 运行时、node_modules、构建产物、机器人模型、地图或算法工作区；机器人数据由用户自己的 ROS 环境提供。系统 apt 若不再提供该精确版本，先确认兼容版本，勿使用会开放写入能力的默认桥接配置。

## 启动：两个 Ubuntu 终端

```bash
# 终端 1：只读 ROS 数据桥接；不启动机器人或算法
cd ~/ros2-web-visualizer
./scripts/start-bridge.sh             # 可传端口，如 8766
```

```bash
# 终端 2：Web 服务
cd ~/ros2-web-visualizer
./scripts/start-web.sh               # 默认端口 5173
```

在同一台电脑的 Ubuntu 浏览器，或 Windows/WSL 浏览器打开 **http://127.0.0.1:5173**。在顶部确认桥接地址 **ws://127.0.0.1:8765**，点击“连接”。部分系统 localhost 优先解析 IPv6，而服务只绑定 IPv4；遇到连接拒绝先使用 127.0.0.1。

运行机器人模型显示时，Web 服务终端先 source 包含模型资源的 ROS 工作区，再显式允许包：

```bash
# 按自己的安装位置 source；这里仅为现有环境示例，不是程序的硬编码依赖
source ~/turtlebot3_ws/install/setup.bash
cd ~/ros2-web-visualizer
./scripts/start-web.sh 5173 --allow-package turtlebot3_gazebo --allow-package turtlebot3_lio_sim
```

服务只读取允许包内的 URDF/网格/材质/纹理，拒绝路径越界及越界 symlink；不要把 home 或系统根目录暴露给浏览器。默认不允许任何包资源。

两个终端按 Ctrl+C 分别退出。若选用不同 ROS_DOMAIN_ID，应在桥接终端设置成数据源同一值。软件不自动 source 或更改其他算法工作区，不自动启动 Gazebo/建图/导航。

## 使用

1. 自行启动现有 ROS 数据源，再连接桥接。连接成功与话题有数据是不同状态。
2. 通过话题列表“＋类型”或“添加”创建图层；点击图层进入属性面板。
3. 设置正确的 **Fixed Frame**；缺少 TF 时图层报告错误，不假装画在原点。
4. 配置样式、透明度、着色、历史等；鼠标拖动/滚轮操作视角，切换 2D/3D 或复位。
5. 速度卡片配置话题：`/cmd_vel` 是指令；`/lio/nav_odom` 等是里程计估计。数据过期显示“—”，不把指令当成真实运动速度。
6. 保存到浏览器、导出/导入版本化 JSON；非法文件不覆盖原配置。无法直接导入 `.rviz`。

顶栏 **2D 示例 / 3D 示例** 仅载入话题与图层配置，不启动数据源。示例文件在 `frontend/public/examples/`：

- 2D：Fixed Frame=map，`/map`、`/scan`、`/particle_cloud`、`/plan`、机器人与 TF；没有粒子话题就保持等待，不生成假粒子。示例粒子层要求 `geometry_msgs/msg/PoseArray`，实际若为 `nav2_msgs/msg/ParticleCloud` 则本期不支持，需禁用该层，不能据此认定定位失败。
- 3D：Fixed Frame=camera_init，`/Laser_map`、`/path`、`/Odometry`；`/lio/nav_odom` 卡片。当前导航模式可能不发布增长地图，可把地图图层切到 `/pcd_localizer/map_cloud` 并根据实际 TF 调整 Fixed Frame。

## 转换已有 RViz2 配置

不直接导入 `.rviz`；先用离线工具转换为工作区 JSON，再点击网页“导入”：

```bash
cd ~/ros2-web-visualizer
./scripts/convert-rviz.sh ~/tb3_nav3d_ws/rviz/nav3d.rviz --output ~/nav3d-web.json
```

原文件保持不变，另生成 `~/nav3d-web.report.json` 说明未支持/近似/回退项；**导入 `nav3d-web.json`，不要导入报告**。默认拒绝覆盖，明确 `--force` 才覆盖普通输出文件；`--help` 查看用法。完整映射、安全限制和单独构建命令见 [docs/rviz-converter.md](docs/rviz-converter.md)。不转换任意插件、QoS 或导航控制，不启动 ROS/算法。

## 属性与限制

详见 [docs/display-properties.md](docs/display-properties.md)。代码实现与七项待人工确认条件见 [docs/implementation-status.md](docs/implementation-status.md)，不把构建通过当作任务验收完成。可用类型：Grid、Axes、LaserScan、PointCloud2、Map、TF、Path、Pose、PoseArray、Odometry、RobotModel、Marker/MarkerArray。其他 RViz 类型在选择器中标注暂不支持。RGB/强度需要消息字段，模型依赖可用资源和 link TF；性能和细节不承诺与 RViz 逐像素相同。

QoS 由桥接协商，网页不提供假装生效的 DDS QoS 编辑器。Bridge 使用 `connectionGraph` 能力，关闭客户端发布、参数与服务能力，禁用点云协议压缩以保留通用 CDR；页面拒绝连接声明写入能力的桥接。默认仅供本机使用，不是公开网络部署方案。

## 目录

- `frontend/src/session.ts`：只读连接、话题发现、CDR、订阅与数据状态。
- `frontend/src/tf.ts`：坐标变换与时间缓存。
- `frontend/src/layers.ts`：显示注册、属性 schema、工作区格式。
- `frontend/src/rendering.ts`：Three.js 图层与相机、机器人资源加载。
- `frontend/src/main.tsx`、`styles.css`：自定义 UI。
- `server/app.py`：本机静态及受限模型资源服务。
- `server/bridge.yaml`：Foxglove Bridge 只读配置。
- `scripts/`：项目内 Node、构建、两个服务的启动及离线配置转换。
- `frontend/tools/`：复用 Web schema 的 RViz2 转换核心与 CLI；构建产物在 `frontend/dist-tools/`（不提交）。
- `docs/`：参数表、开发记录。
- `openspec/specs/`：已同步的工作台主规格。
- `openspec/changes/archive/2026-10-03-web-visualization-workbench/`：WebUI 归档，保留七项未完整观察记录。
- `openspec/changes/archive/2026-10-03-rviz-config-converter/`：转换工具归档，11/11 任务完成；主规格在 `openspec/specs/rviz-config-conversion/`。

用户自行启动并观察扫描、地图、点云及属性效果，决定最终是否符合需求；开发自查不替代验收。未添加自动化测试套件、CI 门禁或导航实验。

## 许可证与第三方依赖

尚未为项目源码选择开源许可证；公开仓库不等于授予任意使用/分发许可。第三方依赖仍受各自许可证约束，直接依赖说明见 [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md)。
