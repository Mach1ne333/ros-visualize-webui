# Design

## Context

见 proposal.md 的动机。`frontend/src/layers.ts` 已有 registry、newLayer、defaultWorkspace、validateWorkspace，严格拒绝未知字段且工作区最多 100 图层。`main.tsx` 已支持 JSON 导入、2 MiB 文件上限、相机恢复；现有配置可继续导入，无需修改网页行为。Node 22.16.0 已安装在项目 .tools。

已读现有 `~/tb3_nav3d_ws/rviz/nav3d.rviz`：Topic 常为包含 Value/QoS 的对象，Color 为分号分隔 RGB，Path 使用 Lines，点云 Autocompute Value Bounds 包含 Min/Max，Orbit 使用 Focal Point/Distance/Pitch/Yaw；配置同时含导航 Tools。现有 JSON 不能直接接收这些结构。原工作台随后按用户授权归档并同步主规格；七项未完整观察记录保留，不因本轮转换工作自动完成。

## Goals / Non-Goals

**Goals:**
- 纯离线文件转换，无 ROS/浏览器依赖；从单一 Web 属性注册表生成并校验结果。
- 映射可表达语义，报告所有转换损失；转换报告单独输出，不扩展工作区 v1。

**Non-Goals:**
- 不新增网页 YAML 文件上传、默认配置启动参数或导航控制。
- 不加载 URDF/网格、推导 TF、转换任意自定义插件；不模拟数据源。

## Decisions

1. **Node/TypeScript 转换核心 + CLI + Bash 包装。** 在 `tools/` 增加 CLI 入口与转换模块，复用 `layers.ts`。用项目现有构建工具生成独立 Node CLI，添加锁定版本的安全 YAML 解析依赖。新增脚本 `scripts/convert-rviz.sh`，计划用法：`./scripts/convert-rviz.sh input.rviz --output output.json [--report report.json] [--force]`。默认报告为 `<输出名>.report.json`。相对路径按调用者目录解析，支持空格；不隐式切换输入路径。拒绝输出/报告与输入相同路径或彼此相同，包括已存在路径的 symlink 等价；先验证全部输出路径。拒绝默认覆盖，明确 --force 才允许覆盖输出，仍不能覆盖输入。Python 双份 schema 和浏览器内转换均不选：前者易漂移，后者扩大 UI 改动。
2. **安全解析与有界遍历。** 2 MiB 输入上限，拒绝重复键、自定义标签和多文档；设置别名展开限额、递归深度/节点数上限并检测循环引用。解析时不执行对象构造器；字段通过自有属性读取和白名单映射，拒绝原型污染键。解析错误整体失败；图层字段错误按安全默认回退并报告。最终使用 validateWorkspace，并按 UTF-8 字节限制 JSON 输出 2 MiB。
3. **显式映射而非同名盲拷贝。** 用完整插件类名白名单及每类属性映射表；DisplayGroup 递归展平，合并父级启用状态；图层 UUID 由当前默认生成逻辑创建，保留原序。抽取 Topic/Value、布尔、有限数值、颜色及枚举别名；整数与范围按 Field 定义校验，无效值回退并注明，而非无提示截断。通用映射与点样式/颜色范围、Path Lines/Billboards、Odometry Keep/容差/协方差、模型来源、TF 帧筛选等分模块处理。复杂 RViz 协方差子配置只有能等价表达的子集映射，独立位置/姿态开关等不能等价时报告，不强行合并。模型只接受现有描述话题或 package:// 资源，本地绝对路径不能转成开放文件 API。
4. **逐项报告覆盖率。** 转换过程跟踪已消费字段路径。未消费的叶子字段、被跳过插件/组、异常值和近似映射逐项写入结构化报告，控制项与 QoS 明确指出原因；源配置中的任意字符串不作为可执行命令。报告不默认复制整份源配置或凭据。没有可转换图层时输出空图层工作区并明确警告，不补造机器人/粒子；超过上限整体失败。
5. **视角保守转换。** Orbit 按 RViz Z-up 焦点、距离和角度生成相机 position/target，并记录投影/控制器差异。TopDownOrtho 转为 2D，保留可表达的目标；比例若依赖 RViz 视窗像素尺寸而无法等价映射，回退并报告，不宣称 zoom 完全一致。非 Fixed Frame 的 Target Frame 无法离线查 TF，回退相机。RobotModel 的 link TF 和资源允许列表仍由运行时决定。忽略源保存的桥接/网络状态，不产生 connection.autoConnect=true。

## Risks / Trade-offs

- [RViz版本/插件属性结构不同] → 明确标准类白名单与报告，不用插件短名冒充兼容；遇到用户配置的新布局补充具体映射。
- [语义无法一一对应，例如 Grid 平面、模型参数来源、协方差子开关、TF per-frame 树] → 不强行转换，报告原路径/回退；不扩大渲染器承诺。
- [CLI 注册表构建结果过期] → 纳入项目构建流程，转换入口明确提示缺失产物/需构建，避免临时 .tools 编译缓存充当正式工具。
- [报告含源路径/敏感文本] → 只记录必要字段路径和原因，不复制完整源文档/凭据，不上传任何内容。
- [文件写入部分失败] → 先完成解析、校验和路径检查，输出临时文件后提交；失败提示是否已生成文件，不承诺两个独立路径跨文件系统的原子事务。

## Migration Plan

新增依赖、核心、CLI、脚本和文档，不改变工作区版本或现有导入按钮。构建后转换现有 nav3d.rviz，再由用户手动导入观察；不启动仿真或算法。回退时移除转换入口/依赖即可，已输出有效 v1 JSON 仍可导入。原 .rviz 始终保留。
