# Design

## Context

项目为新建目录，没有应用源码、现有测试或持久化协议；动机见 proposal.md。已检查本机 Humble 的 RViz 显示注册列表和现有导航 RViz 配置：当前需要的消息包括 LaserScan、PointCloud2、OccupancyGrid、TF、Path、Odometry 和机器人描述；现有 PCD 约 5.7 万点。三张用户截图分别展示扫描点、黑白地图及粒子、彩色三维点云及轨迹，作为视觉参考而非逐像素基准。当前机器未安装 Foxglove/rosbridge；isaac_nav 内部接口尚未检查，本期不依赖它。

## Goals / Non-Goals

**Goals:**
- 将桥接协议、ROS 解码、TF、显示图层及 UI 解耦；用标准 ROS 消息即可更换数据源。
- 复现截图的主要空间显示形式，配置项具有实际语义，视觉布局与 RViz 区别明显。
- 支持 Windows 浏览器连接 WSL2 本地服务，独立启动，不修改已有工作区。

**Non-Goals:**
- 不移植 C++ RViz 插件，也不把 RViz 窗口通过视频流搬到浏览器。
- 不把客户端选择工具升级为机器人控制接口，不增加算法、控制或实验统计后端。
- 不假设任意消息类型可自动绘图，不承诺全部 RViz 功能或性能一致。

## Decisions

### 1. 自定义 Web 前端和二进制桥接

采用 React + TypeScript + Three.js/WebGL。以 Foxglove Bridge 的 WebSocket 协议为首个数据适配器，采用公开协议客户端及 ROS2 CDR 解码库，按通道 schema 解码。选择它而非 JSON 优先的 rosbridge 是为了减少点云传输开销；不使用 Foxglove 的 UI，也不 fork RViz。锁定适用于 Humble 的依赖版本并记录安装命令。若遇到无法解决的桥接兼容问题，先报告具体问题再调整设计，不静默换成模拟数据。

建议源码边界：`frontend/` 为页面与渲染，`server/` 为本机静态文件及受限机器人资源服务，`scripts/` 为安装/启动，`docs/` 为属性支持表与使用说明。服务不负责启动导航算法。连接地址在 UI 可配置，启动参数与默认端口写入 README。

仅消费广告、订阅和消息数据；关闭桥接的客户端发布、服务调用及参数写入能力，按实际版本配置，无法证明限制有效时须清楚说明并阻止将其宣传为只读部署。应用服务绑定 loopback；若桥接必须在 WSL 内通配绑定以支持转发，仅在明确的本机访问边界内使用，不公开部署。

### 2. 图层注册和属性 schema

每种显示类型拥有支持的 ROS 消息类型、默认属性、属性范围/单位、条件显示规则及渲染能力声明。React 属性编辑器由这些声明驱动，输入校验后交给图层；属性改变触发必要的重新订阅或渲染更新。

显示类型选择器列出第一期可用类型；附带 RViz 常见类型目录时，未实现类型标记为“暂不支持”且不可创建。显示名称相似不代表支持所有选项；不做可编辑但无效果的假设置。

第一期属性矩阵：

| 类型 | 支持属性及语义 |
| --- | --- |
| 所有订阅图层 | 名称、Enabled、Topic、Status；QoS 提供桥接允许的语义并显示实际能力，不声称浏览器直接配置 DDS |
| Grid / Axes | 参考坐标系、网格间距/数量/颜色/透明度；坐标轴长度/半径 |
| LaserScan | Selectable；Style 为 Points、Squares、Flat Squares、Spheres、Boxes；随 Style 显示 Size(px) 或 Size(m)；Alpha；Decay Time；Position Transformer 固定 XYZ；Color Transformer 为 FlatColor、Intensity；强度通道固定 intensity；Use rainbow、Invert Rainbow、Autocompute Intensity、Min/Max Intensity、非彩虹端点颜色 |
| PointCloud2 | 与扫描共享点样式、透明度和历史控制；位置 XYZ；颜色 FlatColor、AxisColor（X/Y/Z）、Intensity、RGB（存在字段才可用）；可配置强度字段、自动/手动范围、彩虹方向；最大点数 |
| Map | Topic、Alpha、Draw Behind、Color Scheme 为 map/costmap/raw；正确处理地图原点与旋转 |
| TF | 显示坐标轴/名称、轴长度、帧筛选；动态状态与固定坐标系 |
| Path | Line/Billboards、颜色、透明度、线宽、Buffer Length；有界历史 |
| Pose / PoseArray | Arrow/Axes、形状尺寸、颜色和透明度；位姿集合不得假冒定位粒子 |
| Odometry | Position Tolerance(m)、Angle Tolerance(rad)、Keep、Shape(Arrow/Axes)、形状尺寸/颜色/Alpha；Covariance 开关及位置/姿态协方差显示设置 |
| RobotModel | 描述话题/受限资源、Visual/Collision 开关、Alpha；关节 TF 驱动，缺少资源/变换明确提示 |
| Marker / MarkerArray | 常用 Arrow、Cube、Sphere、Cylinder、Line Strip/List、Points、Text；namespace 筛选；ADD/DELETE/DELETEALL/lifetime；其他 marker 类型明确不支持 |
| 速度卡片 | Twist/Odometry 来源、显示单位、过期阈值；指令/估计标签 |

颜色自动范围仅基于有效值，空强度/退化范围使用明确的退化颜色和警告；不是默认错误渲染。Decay Time=0 表示仅最新消息，正值表示按数据时间保留历史，同时受最大点数/帧数硬上限约束。Odometry 容差筛选按相对上一条保留位姿的位移或角变化，Keep 限制显示历史，协方差需实际可视化而非只放勾选框。Selectable 用于拾取并显示图层、点坐标及可用字段；不发布 ROS 消息。

### 3. 时间、坐标及消息解码

使用 ROS 右手系 Z-up，Three.js 相机与网格配置一致。TF 缓存区分动态和静态，使用消息 header 时间查询/插值；缺少变换时等待有界时间，随后显示原因，不擅自用单位矩阵。用户可选 Fixed Frame；切换后按原始数据重新计算，不把旧变换永久烘焙为唯一数据。

订阅 `/clock` 时区分仿真时间与浏览器接收时间：TF/历史按 ROS 时间，连接新鲜度按接收时间；仿真回拨清理动态历史。无 `/clock` 仍可正常显示相同时间基准的数据。PointCloud2 按 fields、offset、datatype、point_step、row_step、endianness 解码，过滤 NaN/Inf；LaserScan 按 angle_min/increment 和 range_min/max 转点。统一管理 GPU 缓冲、订阅释放和跨图层共享订阅。

OccupancyGrid 的未知值不视为自由空间；URDF mesh 通过 package 索引映射为浏览器 URL。资源服务只允许配置根目录下的模型/材质/纹理与描述文件，路径规范化并拒绝 traversal、绝对任意文件和越界 symlink。不提供整个 home 目录。

### 4. 状态及工作区

连接、通道、图层均有状态；已连接但无数据不标为渲染成功。速度卡片始终区分指令与估计，缺少/过期显示占位和最近时间。接收帧率与渲染帧率分开；无消息时不凭刷新动画声称实时。

工作区保存带版本的 JSON：Fixed Frame、视角、图层类型、话题、属性及卡片配置。导入先校验再应用；未知版本或类型保留原配置并报错。浏览器本地持久化不保存 ROS 消息、令牌或任意资源文件。不兼容 `.rviz` 导入，必要时提供手工映射说明。

### 5. 用户验收与交付

README 给出可复制的依赖、桥接、Web 服务启动命令和 Windows 浏览器地址；无需手工修改源码。提供可编辑的 2D/3D 示例配置，话题缺失时保持诊断，不伪造现场数据。开发者可使用现有仿真或已有 PCD 发布话题进行视觉自查，不向机器人发控制，不将自查替代验收。

不创建自动化测试套件、CI 测试门禁、导航成功率实验或额外验收报告要求。类型检查/构建及开发时观察可用于发现错误；最终是否符合视觉需求由用户主动运行判断。OpenSpec 文档校验仅检查规划格式，不是产品验收。

## Risks / Trade-offs

- [WebGL 与 RViz 样式并非逐像素一致] → 保持参数语义与主要视觉形式，明确不支持类型；由用户观察决定是否满意。
- [Humble 桥接/CDR/静态 TF 或 robot_description 的 QoS 兼容] → 锁定版本，专门确认 retained 数据和可配置订阅能力，暴露诊断。
- [大地图和持续点云消耗带宽/GPU] → latest-wins、有界历史、点数抽样、独立渲染节拍、释放资源；不预先保证固定帧率。
- [URDF 外部文件和材质加载差异] → 受限包资源解析与支持格式说明，资源失败显式降级而不是无声消失。
- [第一期属性较多] → 共用属性 schema 和点云材质模块，按下述任务顺序完成全部承诺，不将截图参数做成占位 UI。
- [未来后端变更] → 只读数据接口独立，无任何 Fast-LIO2/Nav2 启动依赖；将来控制功能另立变更。

## Migration Plan

新项目无数据迁移。独立安装并使用独立端口，不改现有算法工作区。初次在本机启动桥接及网页，用户自行启动原有数据源并验收；卸载或关闭本项目服务即可回退至原 RViz 使用方式。
