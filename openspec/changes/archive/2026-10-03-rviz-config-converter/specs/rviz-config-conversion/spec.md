# Spec Delta

## Purpose

让用户将已有 RViz2 YAML 配置离线转换为现有 Web 可导入的工作区 JSON，尽量保留支持的显示设置，并逐项说明不支持、近似转换和默认回退，避免配置迁移被误认为完整 RViz 功能兼容。

## ADDED Requirements

### Requirement: 安全离线转换入口
工具 SHALL 接受输入 `.rviz` 路径和输出 JSON 路径，不执行 YAML 标签、不访问网络、不启动 ROS 或算法，不修改输入文件。工具 MUST 拒绝大于 2 MiB 的输入、无效 YAML、重复键、自定义标签、超出有界解析限制的文档以及缺少 Visualization Manager 的结构；输入输出同路径 MUST 拒绝。

#### Scenario: 配置转换成功
- **WHEN** 用户提供有效 RViz2 配置及未占用的输出路径
- **THEN** 工具输出可导入工作区 JSON 和独立转换报告，输入内容保持不变

#### Scenario: 输入或输出不安全
- **WHEN** 输入无效、输入输出同路径或输出已存在且未明确允许覆盖
- **THEN** 工具返回非零退出状态和具体原因，不覆盖原文件或输出无效工作区

### Requirement: 标准显示和属性映射
工具 SHALL 支持 rviz_default_plugins 中 Grid、Axes、LaserScan、PointCloud2、Map、TF、Path、Pose、PoseArray、Odometry、RobotModel、Marker、MarkerArray。工具 SHALL 保留名称、启用状态、顺序、Fixed Frame、支持的话题和属性，接受话题字符串或包含 Value 的属性对象、RViz RGB 颜色与六位十六进制颜色；DisplayGroup SHALL 展开并继承父组 Enabled。缺省字段 SHALL 使用当前 Web 默认值。

#### Scenario: 导入常用配置
- **WHEN** 配置包含 Topic.Value、颜色 `0; 255; 0`、Path Lines、Odometry Keep 以及点云强度范围嵌套字段
- **THEN** 对应生成正确话题、颜色、Line、历史数量和支持的范围参数，完整工作区符合当前导入校验

#### Scenario: 禁用组中的图层
- **WHEN** 父 DisplayGroup 已禁用而子图层 Enabled 为 true
- **THEN** 展开后的子图层保持禁用，报告说明分组展平

### Requirement: 转换损失明确报告
工具 MUST 为每个被跳过的插件、未映射或无效属性、范围回退、QoS、控制 Tools 及无法保留的面板/全局显示配置提供有源位置的报告。报告 SHALL 与工作区分开，包含映射图层数量和警告，不向严格 JSON 格式添加未知字段。单个不支持项 SHALL 不阻止其余有效图层转换；超过 100 个图层或输出大于 2 MiB SHALL 拒绝而不是静默截断。工具 MUST 不输出可用的初始位姿/目标发布能力，不生成 ROS 数据或填造粒子图层。

#### Scenario: 导航插件和资源路径不支持
- **WHEN** 源包含导航插件、SetInitialPose、DDS QoS 或本机绝对描述文件路径
- **THEN** 报告分别说明未转换原因；可用显示继续转换，但不开放控制或读取任意资源文件

### Requirement: 视角迁移有兼容边界
工具 SHALL 转换可表达的 Orbit 与 TopDownOrtho 视角及 2D/3D 模式；不能表达的控制器、目标帧或投影参数 SHALL 显式报告近似或回退，不声称像素级相同。转换文件 SHALL 不包含自动连接开启设置或凭据。

#### Scenario: 视角可转换
- **WHEN** 源 Orbit 使用有效焦点、距离、Pitch/Yaw，且目标帧为 Fixed Frame
- **THEN** 输出相应 3D 相机位置及观察目标，并提示与 RViz 视角实现的差异

#### Scenario: 视角无法等价迁移
- **WHEN** 源使用不支持的控制器或目标帧无法在离线转换中解析
- **THEN** 使用明确的默认视角并报告原因，而不是编造 TF 或忽略差异

### Requirement: 人工导入和兼容说明
工具 SHALL 提供复制可用的转换命令、转换报告说明和已支持参数表。验收 SHALL 使用用户已有配置及现有网页导入进行人工确认，不引入自动化测试套件、CI 或导航实验门槛。

#### Scenario: 人工检查现有配置
- **WHEN** 用户转换已有 TurtleBot3 `.rviz` 并在网页点击导入
- **THEN** 支持的配置可加载且转换损失可查询；连接成功不被宣称为定位或导航验证通过
