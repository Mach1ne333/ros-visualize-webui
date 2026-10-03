# Spec Delta

## Purpose

将常用 ROS2 空间和数值消息呈现为类似 RViz 的雷达扫描、二维地图、三维彩色点云、坐标系、机器人、轨迹和位姿显示，提供有真实效果的属性配置而不绑定定位或规划算法。

## ADDED Requirements

### Requirement: 雷达扫描显示与属性
LaserScan SHALL 按角度、距离和范围界限绘制有效点，支持 Selectable、Points/Squares/Flat Squares/Spheres/Boxes、相应大小单位、Alpha、Decay Time、XYZ 位置转换及 FlatColor/Intensity 着色。Intensity SHALL 支持 rainbow、反向、自动/手动强度范围；intensity 缺失须诊断并退化，不能生成虚构强度。

#### Scenario: 扫描点视觉参考
- **WHEN** 用户选择固定红色、Flat Squares、Size(m)=0.02、Alpha=1、Decay Time=0
- **THEN** 视图以红色小平面点显示最新扫描并可叠加网格及坐标轴，形成第一张参考图的核心形式

#### Scenario: 强度配色
- **WHEN** 消息有有效 intensities 且用户修改自动范围或反向彩虹
- **THEN** 颜色随有效强度和配置实际变化；缺失或常数强度明确显示退化状态

### Requirement: 三维点云显示与字段着色
PointCloud2 SHALL 显示有效 XYZ 点，支持点样式、大小、Alpha、Decay Time、最大点数，提供 FlatColor、AxisColor、Intensity、RGB 着色；缺少对应字段时禁用或诊断。历史 MUST 有界，Decay Time=0 只显示最新消息，不重复累加完整地图。

#### Scenario: 三维彩色地图参考
- **WHEN** 用户订阅现有 Fast-LIO2 地图或 PCD 发布话题并选取 Z 轴渐变
- **THEN** 显示类似第三张截图的彩色三维点云，能旋转观察且可叠加轨迹

#### Scenario: 历史到期
- **WHEN** 设置正的 Decay Time 且 ROS 数据时间前进
- **THEN** 过期扫描从显示中移除，缓存同时遵守配置上限

### Requirement: 栅格地图显示
Map SHALL 支持 OccupancyGrid 的分辨率、原点及朝向，支持 Alpha、Draw Behind 及 map/costmap/raw 配色；占用、空闲和未知区域须区分。

#### Scenario: 二维地图参考
- **WHEN** 用户在顶视图订阅有效地图
- **THEN** 地图按正确比例和方向显示黑白/未知区域，能叠加机器人、扫描和存在的位姿集合，形成第二张截图的核心形式

### Requirement: 坐标系路径和位姿显示
系统 SHALL 提供可配置的 Grid、Axes、TF、Path、Pose 与 PoseArray。TF 支持帧筛选和轴/名称开关；Path 支持线样式、线宽、颜色、Alpha 和有界 Buffer Length；Pose/PoseArray 支持 Arrow/Axes 与尺寸、颜色、Alpha。

#### Scenario: 轨迹与坐标系
- **WHEN** 有效路径、位姿和 TF 消息到达且用户改变线宽或轴长度
- **THEN** 对应图形在统一坐标系中更新，属性真实影响外观

#### Scenario: 没有定位粒子
- **WHEN** 后端没有发布 PoseArray
- **THEN** 不虚构绿色粒子或其他定位输出，只显示无数据状态

### Requirement: 里程计历史和协方差
Odometry SHALL 支持 Topic、Position Tolerance、Angle Tolerance、Keep、Arrow/Axes Shape、尺寸/颜色/Alpha 及 Covariance 开关。系统 SHALL 按相对上一条保留位姿的位移或角变化筛选历史，Keep 限制数量；启用协方差时展示位置与姿态不确定性，不将未知/无效协方差当作有效测量。

#### Scenario: 筛选历史箭头
- **WHEN** 用户提高容差并降低 Keep
- **THEN** 小变化样本不再增加历史，显示数量不超过 Keep，现有箭头能切换为坐标轴

#### Scenario: 协方差开关
- **WHEN** 里程计包含有效协方差且用户启用显示
- **THEN** 显示对应不确定性形状；关闭后消失，缺失或无效数据明确提示

### Requirement: 机器人模型显示
RobotModel SHALL 支持描述资源、Visual/Collision 可见性和 Alpha，通过 TF 放置各 link；支持的模型资源格式须写明，加载失败不得静默报告成功。

#### Scenario: 机器人模型更新
- **WHEN** 有效 URDF、支持的网格和 link TF 可用
- **THEN** 模型随位姿和关节变换更新，透明度及 visual/collision 开关生效

### Requirement: 标记显示和生命周期
Marker/MarkerArray SHALL 支持 Arrow、Cube、Sphere、Cylinder、Line Strip/List、Points、Text 的 pose、scale、color、namespace/id、增删和 lifetime；不支持类型须明确诊断。

#### Scenario: 标记删除
- **WHEN** 收到 DELETE 或 DELETEALL，或标记 lifetime 到期
- **THEN** 相应标记从视图移除，不无限保留旧对象

### Requirement: 速度卡片语义
速度卡片 SHALL 支持 Twist 的 linear.x/angular.z 与 Odometry twist，显示 m/s、rad/s及可选角度单位；分别标记指令速度和里程计估计速度，并显示来源、时间与过期状态，不将缺失值显示为真实零速度。

#### Scenario: 指令和估计不同
- **WHEN** 命令与里程计给出的速度不一致
- **THEN** 两组卡片保持独立标签和值，不声称命令就是实际运动速度
