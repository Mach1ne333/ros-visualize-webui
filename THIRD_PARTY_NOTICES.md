# 第三方依赖说明

此仓库包含项目源码、锁定的依赖清单和 OpenSpec 文档，不包含 node_modules、Node 运行时、浏览器二进制、构建产物或机器人/算法工程。未替项目作者选择源码许可证；下面的依赖许可证不构成对本项目源码的授权。

以下直接依赖许可证已从安装的 package.json 核对；完整许可文字、版权与 NOTICE 以各上游分发包为准。此表不是所有传递依赖的穷尽清单。若以后分发构建产物或打包第三方二进制，应保留适用的许可证及 NOTICE。

| 依赖 | 锁定版本 | 上游声明许可证 |
| --- | --- | --- |
| @foxglove/rosmsg | 5.0.5 | MIT |
| @foxglove/rosmsg2-serialization | 3.1.2 | MIT |
| @foxglove/ws-protocol | 0.8.0 | MIT |
| react / react-dom | 19.1.0 | MIT |
| three | 0.177.0 | MIT |
| urdf-loader | 0.12.6 | Apache-2.0 |
| yaml | 2.8.1 | ISC |
| @types/node | 22.15.30 | MIT |
| @types/react / @types/react-dom | 19.1.6 | MIT |
| @types/three | 0.177.0 | MIT |
| playwright | 1.56.1 | Apache-2.0 |
| typescript | 5.8.3 | Apache-2.0 |
| vite | 6.3.5 | MIT |
| ws | 8.18.3 | MIT |

ROS2 Humble、Foxglove Bridge、Node.js、Gazebo 和用户自己的机器人包属于外部运行环境，按相应上游许可使用，不由此仓库重新授权或随源码提交。
