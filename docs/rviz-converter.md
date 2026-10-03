# RViz2 配置转换工具

独立离线工具：`.rviz`（YAML）→ 当前 WebUI 的 v1 工作区 JSON。不是完整 RViz 兼容层，不直接向网页导入 `.rviz`，不需要启动 ROS、Gazebo、桥接或算法。

## 安装 / 构建

项目安装时 `./scripts/build.sh` 会同时构建转换 CLI。当前机器已安装依赖。只需重建转换工具时：

```bash
export PATH="$HOME/ros2-web-visualizer/.tools/node-v22.16.0-linux-x64/bin:$PATH"
cd ~/ros2-web-visualizer/frontend
npm run build:converter
```

脚本检查产物缺失或落后源码，不会偷偷安装依赖或用旧缓存继续转换。

## 使用

```bash
cd ~/ros2-web-visualizer
./scripts/convert-rviz.sh --help
./scripts/convert-rviz.sh ~/tb3_nav3d_ws/rviz/nav3d.rviz --output ~/nav3d-web.json
```

默认生成：
- `~/nav3d-web.json`：导入 WebUI 的工作区。
- `~/nav3d-web.report.json`：转换报告，**不要把它当工作区导入**。

指定报告位置或允许覆盖输出：

```bash
./scripts/convert-rviz.sh "/path/with spaces/my config.rviz" \
  --output ~/my-web.json --report ~/my-conversion-report.json --force
```

相对路径按运行命令的终端当前目录解析；输出目录必须已经存在。默认拒绝覆盖任一已有输出，`--force` 只允许覆盖普通输出文件，不允许覆盖输入、symlink 或同一 hardlink。输入/输出/报告路径必须互不相同。写入失败会说明已生成哪些文件，清理临时文件；两个输出路径不承诺跨文件系统原子事务。

## 导入与保留

1. 在现有 WebUI 点击“导入”，选择转换后的工作区 JSON。
2. 检查 Fixed Frame、图层话题和状态；需要时手动连接桥接。
3. 资源模型仍需 Web 服务 `--allow-package`；转换不会开放额外包或绝对文件。
4. 查看 report 中的 warnings，再决定是否手动调整。
5. 满意后点击“保存”或“导出”。转换文件不保存自动连接开启设置，导入不自动启动算法；原 `.rviz` 保持不变。

## 基础映射

仅白名单 `rviz_default_plugins/<类型>` 支持；不以第三方插件的短名猜测兼容。名称、顺序、Enabled、Topic 字符串/Topic.Value 和 Global Options.Fixed Frame 可保留。颜色接受 `R; G; B`（整数 0–255）、三整数数组及 `#rrggbb`。缺省值沿用 Web 当前默认；非法/超范围值报告后回退。

DisplayGroup 支持 `rviz_common/Group`、`rviz_common/DisplayGroup`、`rviz/Group`、`rviz_default_plugins/Group`，递归展平并继承父级及 Visualization Manager Enabled。组布局本身不保留。

| 显示 | 支持的 RViz 属性 → Web 属性 |
| --- | --- |
| Grid | Reference Frame（`<Fixed Frame>`→留空）、Cell Size、Plane Cell Count→Cell Count、Color、Alpha |
| Axes | Reference Frame、Length、Radius |
| LaserScan / PointCloud2 | Selectable、Style、Size (Pixels)→Size(px)、Size(m)、Alpha、Decay Time、Maximum Points、Position/Color Transformer、Axis、Channel Name、Use rainbow/Use Rainbow、Invert Rainbow |
| 同上着色范围 | Autocompute Intensity Bounds / Autocompute Value Bounds / Autocompute Range 的布尔或 Value；嵌套/直接 Min/Max Intensity、Min/Max Value；Min/Max Color |
| Map | Alpha、Draw Behind、Color Scheme |
| TF | Show Axes、Show Names、Axis Length；Marker Scale 按 Web 默认轴长近似换算并提示；Frames per-frame 开关转当前白名单，报告未来帧行为差异 |
| Path | Line Style（Lines→Line；Billboards 保留）、Line Width、Buffer Length、Color、Alpha |
| Pose / PoseArray | Shape、Arrow Length/Length、Axes Length、Axes Radius、Color、Alpha；Arrow 的 Shaft Length+Head Length 合并为长度，Shaft Diameter/2 或 Shaft Radius 转半径，头部比例不能逐项保留 |
| Odometry | 上述形状参数、Position/Angle Tolerance、Keep、Covariance bool/Value；共享 Covariance Scale/Color/Alpha（平铺或嵌套） |
| RobotModel | Description Topic、Description Source=Topic 或 File、File 仅接受 package://、Visual/Collision Enabled、Alpha |
| Marker / MarkerArray | Topic、Alpha、Namespaces 开关转当前白名单；全禁用或无法表达的白名单禁用该图层并提示 |

Axes 使用 Web 固定 RGB；Path 的 Line 是细线，米制宽度只对 Billboards 生效；TF 缺失无法通过配置转换修复。协方差独立位置/姿态子开关不等价于 Web 同时显示开关；任一禁用时关闭协方差并报告。不能等价映射的独立子颜色/尺度/姿态 Frame 等会报告，不强行合并。

仅 package:// 描述文件被迁移；Parameter 来源或绝对文件路径会禁用 RobotModel 并报告，避免误换成另一来源的机器人。未支持插件不会生成占位假输出。完全没有可转换显示时输出空工作区并警告，不自动造粒子或轨迹。

## 视角与不支持项

- Orbit：支持 Fixed Frame 下 Focal Point.X/Y/Z、Distance、Pitch/Yaw；按 RViz Z-up 球坐标转换位置与 target。投影/交互差异明确报告。
- TopDownOrtho：转换为 2D、保留 X/Y 中心。Scale 依赖原窗口像素尺寸，因此使用默认 zoom；非零 Angle 不保留，明确报告。
- 其他控制器、不同 Target Frame：回退默认视角并报告，不推导 TF。
- QoS 由桥接决定，不转成假属性。Panels、Tools、导航插件、Background Color/Frame Rate、窗口布局及未映射字段报告后不迁移。
- 不开放 SetInitialPose/GoalTool 或任何控制能力。

## 转换报告与错误

报告含 `version`、`convertedLayers`、`skippedDisplays`、`warnings`。每条 warning 提供源 JSON Pointer `path`、`code`、中文 `message`；不复制源字段值或凭据。`unmapped`/`qos-not-mapped` 表示字段未迁移，`invalid-property` 表示默认回退，`approximate-*` 表示近似，`skipped-plugin` 表示整项跳过。

输入上限 2 MiB；拒绝多文档、重复键、自定义 YAML 标签、循环/过量别名、原型污染键、超过 64 层/100000 节点的配置及缺少 Visualization Manager 的结构。图层上限 100，输出工作区上限 2 MiB；超限整体失败，不静默截断。错误返回非零退出码。

开发自查只转换配置和检查输出，不替代用户的实际视觉验收；不新增自动化测试套件、CI 或导航实验。
