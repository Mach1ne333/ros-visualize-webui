# 开发记录与排查

这不是产品验收报告，也不是新增验收门槛。开发时构建和浏览器观察用于发现问题；最终视觉是否符合需求仍由用户主动运行决定。

## 已进行的开发观察

- 项目内 Node 22.16.0；npm lockfile；TypeScript/Vite 生产构建成功。打包器提示单个 JS chunk 超过 500 kB，不属于错误，不声称性能已达标。
- Humble Foxglove Bridge 3.5.0；实际握手为 `foxglove.sdk.v1`，同时兼容旧子协议的客户端。使用标准 ROS2 CDR schema 解码。
- 只读配置 serverInfo 仅含 connectionGraph；桥接写入、参数、服务能力关闭。应用没有发布或调用这些操作的 API。
- Windows 本机 HTTP 访问成功，实际 Windows Edge 无头浏览器打开页面并生成截图；Linux Chromium 用于开发中的交互及画面观察。没有创建自动化测试目录、CI 或导航实验。
- 临时 ROS_DOMAIN_ID=66 的开发观察使用现有 Gazebo 的真实 3D/2D 模型，以及原 localizer 对已有 PCD 的预览和保存的规划栅格地图。未发送速度、初始位姿或导航目标，未启动 Nav2 导航；未修改旧模型、PCD、URDF 或地图。
- 实际 PCD 点云在 map 下形成 Z 渐变三维画面，实时 /points_raw 与 RobotModel 在 odom 下叠加。缺少 map→camera_init 时明确报错，不加入假 TF。
- 2D 地图区分黑白与未知区域；修正初始顶视相机未更新方向的问题。静态地图不以“持续没有新消息”判为失效，仍可收到更新。
- 实际 /scan 显示扫描点；五种 Style 可选择，Points 使用像素，其余使用米。扫描强度退化时有诊断；手工强度范围和反向彩虹可修改。
- Selectable 拾取返回真实源 XYZ、强度及 Fixed Frame 下位置。例如一次 /scan 拾取得到源坐标约 [-0.885,0.484,0]、Fixed 约 [-2.923,-0.016,0.196]。
- 实际 RobotModel 的 Visual/Collision 和 Alpha 可切换；STL 成功加载。正常允许包的模型返回 HTTP 200，越界、file:// 和未允许包请求返回 403。
- 实际 Odometry 可切换 Arrow/Axes 和协方差显示；容差相对上一条保留样本，Keep 限制数量。尚须进一步观察有效协方差形状与历史采样细节，不以单独的 Status: OK 当作完整任务完成。
- 侧栏折叠时实测中央画布宽度 880→1140 像素；保存后折叠状态恢复。未知版本 JSON 导入报告错误并保留原来的五个图层。
- 断开真实桥接显示中断和重试，重启桥接后恢复只读连接；原有三个图层仍为三个，不重复添加。
- 2D/3D 示例能加载；缺失 /Laser_map 等话题显示等待，不生成假点云；实际 PCD 不含 RGB 时 RGB 选项禁用。

## 本轮代码收尾与最终构建

具体补齐项见 [implementation-status.md](implementation-status.md)。首次类型检查发现 `layers.ts` 中 shape 数组缺少 `Field[]` 标注，修复后 `npm run build`（`tsc --noEmit && vite build`）通过，耗时约 4 分 56 秒。最新 JS 产物为 `dist/assets/index-Ddmqnuhf.js`，953.27 kB / gzip 263.80 kB；超过 500 kB 的 chunk 提示仍为警告。`python3 -m py_compile server/app.py` 同时通过。

本次未启动 ROS 数据源、仿真、算法或浏览器验收，不把构建结果作为七项观察条件的完成证据。

## RViz 配置转换开发自查

`rviz-config-converter` 新增离线 CLI，构建复用 Web 注册表和校验器。已安装锁定的 yaml 2.8.1、@types/node 22.15.30；CLI TypeScript/Vite 构建及原前端 TypeScript 检查通过。没有修改浏览器渲染源码或重跑耗时的 Web 打包，现有 Web 产物继续使用。

实际 nav3d.rviz 转换 6 个图层/0 个跳过显示/30 条提示；官方 tb3_navigation2.rviz 转换 16 个图层/4 个跳过显示/232 条提示。提示中有大量未迁移 QoS 和窗口元数据，不等于同等数量的显示错误。两份输入转换前后 SHA256 均一致，结果保存在 `.tools/conversion/`（不提交）；使用方法见 [rviz-converter.md](rviz-converter.md)。

临时配置文件仅用于离线命令观察，不是 ROS 消息模拟：十三类显示通过最终校验，父组禁用保留、嵌套强度范围/颜色/Path Lines/Keep/Arrow 尺寸/TF 筛选等对照正确。逐项 Tools/QoS 报告保留，报告不复制源测试敏感值，输出不含自动连接开启设置。Orbit 和 TopDownOrtho 输出位置/模式并提示近似；目标帧不同及未知控制器使用默认视角并报告。

手动命令确认：重复键、自定义标签、多文档、循环/过量别名、原型键、缺失结构、深度/节点数超限、输入大小、101 图层及输出大小超限均非零拒绝；空图层工作区警告但不造图层。已有输出默认拒绝，--force 允许普通输出覆盖，输入/输出/报告同路径、输入 symlink/hardlink 别名拒绝；含空格路径成功。

未创建自动化测试套件/CI，未启动仿真、算法或浏览器验收。随后用户确认转换结果手动验证无问题，任务 4.3 据用户反馈完成；转换工具 11/11 任务完成，经确认同步主规格后归档到 `openspec/changes/archive/2026-10-03-rviz-config-converter/`。这不改变原 WebUI 归档中的七项未完整观察记录。

## 尚待实际数据确认

本轮现有数据源没有提供可用于观察的 Path/Pose/PoseArray 与 Marker/MarkerArray 消息。对应渲染和生命周期代码已写入，但任务 5.2、6.3 不能仅因代码存在而勾选；需要真实消息及实际显示/删除/到期观察。

协方差、历史淘汰、回拨及所有参数的完整观察仍按 tasks.md 保留未确认项。开发截图中的机器人保持静止；不声称其实际运动、定位成功或导航通过。

## 与三张视觉参考的关系

- 扫描：实际扫描点可设置红色小平面点，叠加网格/坐标轴。浏览器点精灵、实例几何及字体不承诺与 RViz 像素级相同。
- 地图：保存的 3D PCD 派生规划图有大量未知区域，不能与另一张二维建图截图的空闲区域数量直接比较；没有实际 PoseArray 时不会伪造绿色粒子。
- 点云：已有 PCD 预览是原 localizer 下采样输出，点数少于完整 PCD；Z 轴彩虹效果已观察。轨迹需真实 Path 来源，不能用随机线条补图。

## 连接排查

1. 优先使用 `127.0.0.1` 而非 localhost；本机服务绑定 IPv4 loopback，某些 Linux 浏览器将 localhost 解析为 ::1。
2. 检查两个服务终端是否仍运行；默认 HTTP 5173、WS 8765，端口改变后同步修改页面连接地址。
3. 出现“不是只读配置”时，用本项目 `scripts/start-bridge.sh`，不要用会开放参数/服务/客户端发布的桥接默认参数。
4. 同一 ROS_DOMAIN_ID、正确 source 数据源工作区；网页连接成功只证明桥接可达，不证明传感器有数据。
5. 若使用代理，loopback 应直接访问；检查 Windows/WSL localhost 转发，不默认将监听地址改为 0.0.0.0。
6. 端口占用先停止自己启动的原终端。不要在已有 Gazebo 上重复启动另一套世界，不使用 `wsl --shutdown` 来停止单个服务。

## TF 与时间

数据图层使用消息 header 时间查 TF，插值需要相邻的动态样本；不使用“距离近就直接拿最新 TF”的隐式替代。短时等待对应 TF 时保留上一次有效帧并显示等待，持续超出缓存时报错。Fixed Frame 切换会重新计算原始数据。

RobotModel/TF 帧没有带 header 的独立测量消息，使用 TF 的最新有效值。接收时间用于断流和速度过期，ROS 时间用于变换和 Decay Time。仿真回拨清理动态历史并保留可复用静态 TF；断开连接清理消息和变换。没有 /clock 时使用消息时间加浏览器经过时间估算历史到期。

## 资源与格式

允许包来自已 source 的 ament 索引。服务识别 colcon symlink-install 的源包资源，但仅信任具有同名 package.xml 的包祖先；任意文件 symlink 仍须解析后落在允许根目录内。不要将不可信包加入允许列表。

URDF 基本几何和 STL 已实际观察；DAE 走 Three.js Collada 加载器，材质/纹理依赖包内资源，尚未逐个模型观察。单个资源最大 64 MiB；机器人描述最大 4 MiB。PoseArray 最多显示 2000 个，Path 单条最多 20000 点；超限明确诊断。点历史最多 60 帧，TF 每个动态 child 最多 200 个样本；ROS 高频 TF 与长时间历史组合可能超出缓存，显示诊断而不是假对齐。
