# 显示类型与参数

本期注册类型：Grid、Axes、LaserScan、PointCloud2、Map、TF、Path、Pose、PoseArray、Odometry、RobotModel、Marker、MarkerArray。新增属性均按图层独立配置；不兼容直接导入 `.rviz` 文件。

## 通用

名称、Enabled、Topic、Status。话题候选按类型筛选。Fixed Frame 在顶栏设置，缺少 TF 明确报错；不要因为看不到画面而随意添加假坐标变换。QoS 由 Foxglove Bridge 根据发布端协商，网页没有 DDS QoS 修改能力，界面对此明确说明。标为暂不支持的 RViz 类型不能添加。

## LaserScan / PointCloud2

- Selectable：开启后单击点，显示源坐标 XYZ、强度（如有）和 Fixed Frame 下测点中心坐标；不发布指令。
- Style：Points 是固定屏幕像素大小；Squares 是随距离变化的方形点精灵；Flat Squares 是源坐标系 XY 平面的方片；Spheres、Boxes 是三维实例几何。
- Size(px) 用于 Points，其余使用 Size(m)。Alpha 范围 0–1。
- Decay Time=0 只保留最新消息；正值按 ROS 时间保存历史，最多 60 帧，同时受 Maximum Points 限制。完整地图话题不要重复积累。无 `/clock` 时使用消息时间加接收后经过时间；仿真暂停时历史按仿真时间暂停。
- Position Transformer：固定 XYZ，不提供无效的转换器。
- FlatColor；PointCloud2 另支持 AxisColor(X/Y/Z) 和 RGB；Intensity 需要对应字段，扫描通道固定 intensity。没有字段时提示错误或明确退化，不凭空产生强度。
- Use Rainbow、Invert Rainbow、Autocompute Range、Min/Max Value、非彩虹端点颜色。无有效强度时使用固定色；退化范围使用中点颜色并诊断。
- PointCloud2 依据 fields/offset/datatype/point_step/row_step/endianness 解码，支持标准数值类型，过滤 NaN/Inf；packed rgb/rgba 支持 FLOAT32/UINT32 位表示，独立 r/g/b 字段可用。

## Map / TF / Path / 位姿

- Map：Alpha、Draw Behind、map/costmap/raw 三种配色，unknown 单独绘制；依据 origin/resolution 定位，不翻转地图。
- Grid：参考帧、Cell Size、Cell Count、Color、Alpha。Axes：参考帧、长度和半径。
- TF：帧筛选（逗号分隔）、名称、坐标轴和轴长度。
- Path：Line 为细线；Billboards 使用实际米制线宽；Buffer Length 是消息历史上限。
- Pose/PoseArray：Arrow/Axes、长度、半径、颜色、Alpha。Axes 使用固定 RGB 轴色，统一颜色控件仅对 Arrow 显示。PoseArray 仅显示实际 geometry_msgs/msg/PoseArray 输入，不能当作算法自动生成的粒子；nav2_msgs/msg/ParticleCloud 不是该类型，不能直接替代。

## Odometry

Position Tolerance(m)、Angle Tolerance(rad) 相对上一条保留位姿筛选：位移或角变化达到阈值就保存。Keep 限制历史数量。支持 Arrow/Axes 及外观参数。Covariance 提供位置协方差椭球、姿态不确定性弧线、sigma 倍数、颜色和透明度；并不表示真实位置误差或碰撞边界。全零、非有限、非对称或无效位置/姿态协方差会提示，不生成假不确定性；协方差失败不隐藏有效的位姿箭头。

## RobotModel / Marker

RobotModel 支持描述话题或 `package://包/文件.urdf`、Visual/Collision 和 Alpha；资源优先，配置资源后描述话题控件禁用且不订阅；Alpha 与原材质透明度相乘；服务必须显式允许模型包。支持 URDF 基本几何、STL，DAE 由 Three.js Collada 加载器处理，其材质/纹理资源必须同样在允许包内。缺少 link TF 或文件时明确提示，不读取任意用户文件。

Marker 支持 Arrow、Cube、Sphere、Cylinder、Line Strip/List、Points、Text；支持 namespace 筛选、ID 更新/删除、DELETEALL 和 lifetime，最多缓存 2000 个标记。暂不支持 CubeList(6)、SphereList(7)、MeshResource(10)、TriangleList(11)，会明确诊断；混合 MarkerArray 中的无效标记不会阻止有效标记更新和到期删除。文本是浏览器生成的标签；线宽/材质不承诺与 RViz 逐像素一致。

## 速度和保存

速度卡片订阅 Twist 或 Odometry.twist：指令与里程计估计分开标记；m/s 和 rad/s（可切换 °/s）。数据超过配置阈值显示过期而非实时零值。工作区保存图层、参数、Fixed Frame、视角和卡片，不保存消息；版本化 JSON 导入失败保留原配置；文件上限 2 MiB。保存包含相机缩放、面板折叠及本机桥接重连设置；手动断开后不会在刷新时自动连接，不允许保存带凭据/令牌查询的桥接地址。

## 限制

不提供 Camera、DepthCloud、Image、InteractiveMarkers、PointCloud(旧类型)、GridCells、Range、Polygon、PoseWithCovariance、AccelStamped、Effort、Wrench 的显示。导航/建图/控制按钮与实验统计不在本期范围。桥接 3.5.0 使用 `foxglove.sdk.v1`，客户端协商新版和旧版子协议，关闭客户端发布、参数和服务能力。
