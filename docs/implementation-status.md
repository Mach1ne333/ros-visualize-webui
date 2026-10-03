# 实现与人工确认分开记录

变更：`web-visualization-workbench`，经用户确认已归档到 `openspec/changes/archive/2026-10-03-web-visualization-workbench/`，三份主规格已同步。归档任务保留 **18/25**，不是补勾全部验收；下表七项含人工观察条件，不能因为代码已实现或编译成功就勾选。这里记录对应实现位置与剩余确认，不另设测试或实验门槛。

| 任务 | 已有代码 | 留给实际运行观察 |
| --- | --- | --- |
| 2.2 CDR / 异常隔离 | `session.ts` 按频道缓存 ROS2 CDR reader、校验类型与消息大小、捕获单频道错误；`rendering.ts` 按 offset/datatype/endianness/row_step 解码 PointCloud2，校验字段、过滤非有限坐标 | 不同字段布局和异常消息不影响其他有效图层 |
| 2.3 TF / 时间 | `tf.ts` 静态保留、动态缓存、消息时间插值、共同祖先转换；`session.ts` 回拨递增 generation，显示层清历史，保留静态 TF / 模型描述 / 最新地图 | 缺帧、超缓存、仿真回拨后的实际显示和诊断 |
| 3.3 相机 / 辅助图层 | `rendering.ts` 正交顶视与透视相机、OrbitControls、缩放/平移、复位（包含 zoom）、Grid/Axes；相机与控件状态保存 | 鼠标操作、视角切换、参考帧变更及辅助图层属性 |
| 4.4 点历史 / 拾取 | 点历史最多 60 帧，受 Maximum Points 和 Decay Time 限制；Selectable 拾取源坐标/强度/Fixed Frame 下测点坐标；移除和替换时释放资源 | 历史淘汰、时间回拨、各 Style 的实际拾取与限量效果 |
| 5.2 TF / Path / Pose | TF 帧筛选、名称和轴；Path 细线/米制宽线及 Buffer Length；Pose/PoseArray Arrow/Axes，PoseArray 上限 2000 | 当前源缺少部分真实话题；需实际 Path/Pose/PoseArray 输入观察属性 |
| 5.3 Odometry / 协方差 | 位移/角度容差采样、Keep、Arrow/Axes；位置椭球和姿态弧；无效协方差诊断，不隐藏有效位姿 | 有效协方差输入、运动历史与容差淘汰；当前观察不足 |
| 6.3 Marker 生命周期 | namespace 筛选、ns/id 覆盖、DELETE/DELETEALL、ROS 时间 lifetime、2000 个上限；MarkerArray 单标记异常隔离 | 当前源缺少真实 Marker 输入；需观察更新/删除/到期/筛选 |

## 本轮代码收尾

- 相机复位恢复 zoom=1。
- PointCloud2 拒绝非整数步长/字段偏移，packed RGB 校验类型与边界；地图拒绝非有限 resolution。
- 频道撤销时立即重新协调订阅。
- 渲染构建失败的临时对象统一清理；无效姿态协方差在创建几何前拒绝；Marker Arrow 的未使用材质释放。
- Marker 拒绝负值/非有限 lifetime 并保留诊断；协方差校验全 36 元素有限性及对称性。
- TF 不跨父帧变化插值，无效父/子帧有诊断。
- 新增图层遵守 100 个工作区上限；导出延迟撤销下载 URL。
- 本机资源服务 CSP 允许已支持的本机 wss 地址，但不提供 TLS 代理，也不开放远程地址。

构建只检查源码与产物，**不代表上述人工条件完成**。不生成模拟 ROS 数据，不启动仿真/导航，不增加自动化测试套件或 CI。
