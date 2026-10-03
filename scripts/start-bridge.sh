#!/usr/bin/env bash
set -eo pipefail
ROOT="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
source /opt/ros/humble/setup.bash
exec ros2 run foxglove_bridge foxglove_bridge --ros-args \
  --params-file "$ROOT/server/bridge.yaml" -p "port:=${1:-8765}"
