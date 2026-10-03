import { parseDocument, isMap, isSeq, isAlias } from 'yaml';
import { defaultWorkspace, newLayer, registry, validateWorkspace, type Layer, type Value, type Workspace } from '../src/layers';

export const MAX_BYTES = 2 * 1024 * 1024;
type Obj = Record<string, unknown>;
type Notice = { path: string; code: string; message: string };
export type Report = { version: 1; convertedLayers: number; skippedDisplays: number; warnings: Notice[] };
const object = (v: unknown): v is Obj => !!v && typeof v === 'object' && !Array.isArray(v);
const pointer = (parts: string[]) => '/' + parts.map(p => p.replace(/~/g, '~0').replace(/\//g, '~1')).join('/');
const scalar = (v: unknown) => object(v) && Object.hasOwn(v, 'Value') ? v.Value : v;
const bool = (v: unknown): boolean => {
  v = scalar(v);
  if (typeof v === 'boolean') return v;
  if (v === 1 || v === 'true' || v === 'True') return true;
  if (v === 0 || v === 'false' || v === 'False') return false;
  throw new Error('不是布尔值');
};
const num = (v: unknown): number => {
  v = scalar(v);
  if (typeof v !== 'number' && !(typeof v === 'string' && v.trim() && /^[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?$/i.test(v.trim()))) throw new Error('不是数值');
  const n = Number(v); if (!Number.isFinite(n)) throw new Error('不是有限数值'); return n;
};
const str = (v: unknown): string => { v = scalar(v); if (typeof v !== 'string') throw new Error('不是字符串'); return v; };
const color = (v: unknown): string => {
  v = scalar(v);
  if (typeof v === 'string' && /^#[0-9a-f]{6}$/i.test(v)) return v.toLowerCase();
  const rgb = typeof v === 'string' ? v.split(';').map(s => Number(s.trim())) : v;
  if (!Array.isArray(rgb) || rgb.length !== 3 || !rgb.every(n => typeof n === 'number' && Number.isInteger(n) && n >= 0 && n <= 255)) throw new Error('不是 RGB 颜色');
  return '#' + rgb.map(n => n.toString(16).padStart(2, '0')).join('');
};

export function parseRviz(text: string): Obj {
  if (Buffer.byteLength(text, 'utf8') > MAX_BYTES) throw new Error('输入超过 2 MiB');
  const doc = parseDocument(text, { uniqueKeys: true, strict: true, schema: 'core', merge: false });
  if (doc.errors.length || doc.warnings.length) {
    const e = doc.errors[0] ?? doc.warnings[0];
    throw new Error(`YAML 解析失败：${e.code}（位置 ${e.pos?.[0] ?? '未知'}）；请检查语法、重复键、标签或多文档`);
  }
  // Bound the AST before expanding aliases; never follow aliases while checking depth.
  const stack: { node: unknown; depth: number }[] = [{ node: doc.contents, depth: 0 }];
  let count = 0, aliases = 0;
  while (stack.length) {
    const { node, depth } = stack.pop()!;
    if (++count > 100000 || depth > 64) throw new Error('YAML 深度/节点数超限');
    if (!node || typeof node !== 'object') continue;
    const tag = (node as { tag?: string }).tag;
    if (tag && !tag.startsWith('tag:yaml.org,2002:')) throw new Error('不允许自定义 YAML 标签');
    if (isAlias(node) && ++aliases > 100) throw new Error('YAML 别名数超限');
    if (isMap(node)) for (const pair of node.items) { stack.push({ node: pair.key, depth: depth + 1 }, { node: pair.value, depth: depth + 1 }); }
    else if (isSeq(node)) for (const item of node.items) stack.push({ node: item, depth: depth + 1 });
  }
  const raw: unknown = doc.toJS({ maxAliasCount: 20 });
  const ancestors = new Set<object>();
  count = 0;
  function check(v: unknown, depth: number) {
    if (++count > 100000 || depth > 64) throw new Error('展开后的配置深度/节点数超限');
    if (!v || typeof v !== 'object') return;
    if (ancestors.has(v)) throw new Error('配置包含循环别名');
    ancestors.add(v);
    for (const [key, child] of Object.entries(v)) {
      if (['__proto__', 'prototype', 'constructor'].includes(key)) throw new Error('不允许原型污染键');
      check(child, depth + 1);
    }
    ancestors.delete(v);
  }
  check(raw, 0);
  if (!object(raw) || !object(raw['Visualization Manager'])) throw new Error('缺少 Visualization Manager 对象');
  return raw;
}

export function convertRviz(raw: Obj): { workspace: Workspace; report: Report } {
  const workspace = defaultWorkspace(); workspace.layers = [];
  const report: Report = { version: 1, convertedLayers: 0, skippedDisplays: 0, warnings: [] };
  const used = new Set<string>();
  const warn = (parts: string[], code: string, message: string) => report.warnings.push({ path: pointer(parts), code, message });
  function ignore(parts: string[], code: string, message: string) { used.add(pointer(parts)); warn(parts, code, message); }
  function reader(data: Obj, base: string[]) {
    return (path: string | string[]): { value: unknown; path: string[] } | undefined => {
      const parts = typeof path === 'string' ? path.split('.') : path;
      let value: unknown = data;
      for (const p of parts) { if (!object(value) || !Object.hasOwn(value, p)) return; value = value[p]; }
      const full = [...base, ...parts];
      if (object(value) && Object.hasOwn(value, 'Value')) { value = value.Value; full.push('Value'); }
      if (!value || typeof value !== 'object') used.add(pointer(full)); return { value, path: full };
    };
  }
  const manager = raw['Visualization Manager'] as Obj, base = ['Visualization Manager'];
  const get = reader(manager, base);
  function read<T>(r: ReturnType<typeof reader>, path: string | string[], parse: (v: unknown) => T, fallback: T): T {
    const item = r(path); if (!item) return fallback;
    try { return parse(item.value); } catch { warn(item.path, 'invalid-value', '值无效，使用 Web 默认值或明确回退值'); return fallback; }
  }
  workspace.fixedFrame = read(get, 'Global Options.Fixed Frame', str, workspace.fixedFrame);
  if (!workspace.fixedFrame.trim()) { workspace.fixedFrame = 'map'; warn([...base, 'Global Options', 'Fixed Frame'], 'invalid-value', '空 Fixed Frame 回退到 map'); }
  const managerEnabled = read(get, 'Enabled', bool, true);
  function displays(list: unknown, parent: string[], enabled: boolean) {
    if (!Array.isArray(list)) { if (list !== undefined) ignore(parent, 'invalid-displays', 'Displays 不是列表，无法转换'); return; }
    list.forEach((display: unknown, index: number) => {
      const loc = [...parent, String(index)];
      if (!object(display)) { report.skippedDisplays++; ignore(loc, 'skipped-display', '显示项不是对象'); return; }
      const r = reader(display, loc), klass = read(r, 'Class', str, '');
      const ownEnabled = read(r, 'Enabled', bool, true), on = enabled && ownEnabled;
      if (klass === 'rviz_common/Group' || klass === 'rviz_common/DisplayGroup' || klass === 'rviz/Group' || klass === 'rviz_default_plugins/Group') {
        r('Name'); ignore([...loc, 'Class'], 'group-flattened', '分组展平，子图层继承父组 Enabled');
        displays(display.Displays, [...loc, 'Displays'], on); return;
      }
      const type = klass.startsWith('rviz_default_plugins/') ? klass.slice('rviz_default_plugins/'.length) : '';
      if (!Object.hasOwn(registry, type)) { report.skippedDisplays++; ignore(loc, 'skipped-plugin', '不支持该插件类；整项跳过，未生成假图层'); return; }
      if (workspace.layers.length >= 100) throw new Error('转换后图层超过 100 个，拒绝静默截断');
      const layer = newLayer(type); layer.name = read(r, 'Name', str, type); layer.enabled = on;
      if (registry[type].messages.length) layer.topic = read(r, type === 'RobotModel' ? 'Description Topic' : 'Topic', str, layer.topic);
      function prop(key: string, paths: string[], parse?: (v: unknown) => Value) {
        const field = registry[type].fields.find(f => f.key === key); if (!field) return;
        const found = paths.map(path => r(path)).filter((v): v is NonNullable<typeof v> => !!v);
        if (!found.length) return;
        const item = found[0];
        if (found.length > 1) warn(item.path, 'multiple-values', '存在多个同义属性；按兼容表顺序取第一个');
        try {
          const value = (parse ?? (field.kind === 'boolean' ? bool : field.kind === 'number' ? num : field.kind === 'color' ? color : str))(item.value);
          if (typeof value !== typeof field.value || (typeof value === 'number' && (!Number.isFinite(value) || value < (field.min ?? -Infinity) || value > (field.max ?? Infinity))) || (field.options && !field.options.includes(String(value))) || (['cells', 'buffer', 'keep', 'maxPoints'].includes(key) && !Number.isInteger(value))) throw new Error('不符合属性范围');
          layer.properties[key] = value;
        } catch { warn(item.path, 'invalid-property', '此属性无法表达或超出 Web 范围，保留 Web 默认值'); }
      }
      prop('alpha', ['Alpha']); prop('color', ['Color']);
      prop('frame', ['Reference Frame'], v => { const f = str(v); return f === '<Fixed Frame>' ? '' : f; });
      if (type === 'Grid') { prop('cellSize', ['Cell Size']); prop('cells', ['Plane Cell Count']); }
      if (type === 'Axes') { prop('length', ['Length']); prop('radius', ['Radius']); }
      if (type === 'LaserScan' || type === 'PointCloud2') {
        prop('selectable', ['Selectable']); prop('style', ['Style']); prop('sizePx', ['Size (Pixels)']); prop('size', ['Size (m)']); prop('decay', ['Decay Time']);
        prop('maxPoints', ['Maximum Points']); prop('positionTransformer', ['Position Transformer']); prop('colorTransformer', ['Color Transformer']); prop('axis', ['Axis']);
        prop('channel', ['Channel Name']); prop('rainbow', ['Use rainbow', 'Use Rainbow']); prop('invert', ['Invert Rainbow']);
        prop('autoRange', ['Autocompute Intensity Bounds', 'Autocompute Value Bounds', 'Autocompute Range']);
        prop('minValue', ['Autocompute Intensity Bounds.Min Intensity', 'Autocompute Value Bounds.Min Value', 'Min Intensity', 'Min Value']);
        prop('maxValue', ['Autocompute Intensity Bounds.Max Intensity', 'Autocompute Value Bounds.Max Value', 'Max Intensity', 'Max Value']);
        prop('minColor', ['Min Color']); prop('maxColor', ['Max Color']);
        if (layer.properties.minValue > layer.properties.maxValue) { layer.properties.minValue = registry[type].fields.find(f => f.key === 'minValue')!.value; layer.properties.maxValue = registry[type].fields.find(f => f.key === 'maxValue')!.value; warn(loc, 'invalid-range', '着色范围 Min > Max，范围回退到 Web 默认值'); }
      }
      if (type === 'Map') { prop('drawBehind', ['Draw Behind']); prop('scheme', ['Color Scheme']); }
      if (type === 'Path') {
        prop('lineStyle', ['Line Style'], v => { const s = str(v); return s === 'Lines' ? 'Line' : s; });
        prop('width', ['Line Width']); prop('buffer', ['Buffer Length']);
      }
      if (['Pose', 'PoseArray', 'Odometry'].includes(type)) {
        prop('shape', ['Shape']);
        prop('length', layer.properties.shape === 'Axes' ? ['Axes Length'] : ['Arrow Length', 'Length']);
        prop('radius', layer.properties.shape === 'Axes' ? ['Axes Radius'] : ['Radius']);
        if (layer.properties.shape === 'Arrow') {
          const shaft = r('Shaft Length'), head = r('Head Length');
          if (shaft || head) {
            try {
              const length = (shaft ? num(shaft.value) : 0) + (head ? num(head.value) : 0);
              const f = registry[type].fields.find(f => f.key === 'length')!;
              if ((shaft && num(shaft.value) < 0) || (head && num(head.value) < 0) || length < f.min! || length > f.max!) throw new Error();
              layer.properties.length = length; warn(loc, 'approximate-arrow', 'Arrow 总长度由 Shaft/Head 合并；头部比例使用 Web 固定比例');
            } catch { warn(loc, 'invalid-arrow', 'Arrow 分段长度无效，保留之前有效或默认的长度'); }
          }
          prop('radius', ['Shaft Radius']); prop('radius', ['Shaft Diameter'], v => num(v) / 2);
        }
      }
      if (type === 'Odometry') {
        prop('positionTolerance', ['Position Tolerance']); prop('angleTolerance', ['Angle Tolerance']); prop('keep', ['Keep']);
        prop('covariance', ['Covariance']);
        const position = r('Covariance.Position'), orientation = r('Covariance.Orientation');
        if (position || orientation) {
          const p = position ? read(r, 'Covariance.Position', bool, true) : true, o = orientation ? read(r, 'Covariance.Orientation', bool, true) : true;
          if (!p || !o) { layer.properties.covariance = false; warn([...loc, 'Covariance'], 'covariance-fallback', 'Web 仅支持同时显示位置与姿态协方差；独立开关无法等价表达，关闭协方差'); }
        }
        prop('covarianceScale', ['Covariance Scale', 'Covariance.Scale']); prop('covarianceColor', ['Covariance Color', 'Covariance.Color']); prop('covarianceAlpha', ['Covariance Alpha', 'Covariance.Alpha']);
        const covarianceData = display.Covariance;
        if (object(covarianceData) && (Object.hasOwn(covarianceData, 'Position') || Object.hasOwn(covarianceData, 'Orientation'))) warn([...loc, 'Covariance'], 'covariance-subset', '仅转换全局开关及可表达的共享外观；独立位置/姿态子属性保留在未映射报告中');
      }
      if (type === 'TF') {
        prop('showAxes', ['Show Axes']); prop('showNames', ['Show Names']); prop('length', ['Marker Scale'], v => { warn([...loc, 'Marker Scale'], 'approximate-tf', 'Marker Scale 是 RViz 倍率，按默认 0.25 m 轴长近似换算'); return num(v) * .25; });
        prop('length', ['Axis Length']);
        const frames = display.Frames;
        if (object(frames)) {
          const fr = reader(frames, [...loc, 'Frames']), all = read(fr, 'All Enabled', bool, true);
          const included: string[] = []; let excluded = false;
          for (const name of Object.keys(frames).filter(n => n !== 'All Enabled')) {
            if (read(fr, [name], bool, all)) included.push(name); else excluded = true;
          }
          if (!all || excluded) {
            const expressible = included.length > 0 && included.every(n => n && !n.includes(','));
            layer.properties.frames = expressible ? included.join(',') : ''; if (!expressible) layer.enabled = false;
            warn([...loc, 'Frames'], 'approximate-filter', 'per-frame 开关转为当前帧白名单；空/含逗号的白名单无法表达时禁用图层，未列出的未来帧不会自动加入');
          }
        }
      }
      if (type === 'RobotModel') {
        prop('visual', ['Visual Enabled']); prop('collision', ['Collision Enabled']);
        const source = read(r, 'Description Source', str, 'Topic'), resource = r('Description File');
        if (source === 'File') {
          if (resource && typeof resource.value === 'string' && /^package:\/\/[^/]+\/.+/.test(resource.value) && !resource.value.includes('..') && !/[?#\\]/.test(resource.value)) layer.properties.descriptionResource = resource.value;
          else { layer.enabled = false; layer.topic = ''; warn([...loc, 'Description File'], 'resource-rejected', '文件来源不支持或不是有效 package://，禁用此模型，不回退为另一机器人'); }
        } else if (source !== 'Topic') { layer.enabled = false; layer.topic = ''; warn([...loc, 'Description Source'], 'source-rejected', '仅支持 Topic 或 package:// File；禁用此模型'); }
        else if (resource) warn(resource.path, 'inactive-resource', 'Topic 来源中的 Description File 不使用');
      }
      if (type === 'Marker' || type === 'MarkerArray') {
        const ns = display.Namespaces;
        if (object(ns) && Object.keys(ns).length) {
          const nr = reader(ns, [...loc, 'Namespaces']), included: string[] = []; let excluded = false;
          for (const name of Object.keys(ns)) { if (read(nr, [name], bool, true)) included.push(name); else excluded = true; }
          if (excluded) {
            if (!included.length || included.some(n => !n || n.includes(','))) layer.enabled = false;
            else layer.properties.namespaces = included.join(',');
            warn([...loc, 'Namespaces'], 'approximate-filter', '命名空间开关转为白名单；无法表达的空/逗号名称或全禁用配置禁用图层，未来名称行为可能不同');
          }
        }
      }
      workspace.layers.push(layer);
    });
  }
  displays(manager.Displays, [...base, 'Displays'], managerEnabled);
  // Containers are handled recursively rather than marked consumed as whole objects.
  const views = manager.Views;
  if (object(views) && object(views.Current)) {
    const view = views.Current, loc = [...base, 'Views', 'Current'], r = reader(view, loc);
    const klass = read(r, 'Class', str, ''), targetFrame = read(r, 'Target Frame', str, '<Fixed Frame>');
    if (targetFrame !== '<Fixed Frame>' && targetFrame !== workspace.fixedFrame && targetFrame !== '') ignore(loc, 'camera-fallback', '视角目标帧不同于 Fixed Frame，离线无法查询 TF，使用默认视角');
    else if (klass === 'rviz_default_plugins/Orbit') {
      try {
        const required = (path: string) => { const item = r(path); if (!item) throw new Error(); return num(item.value); };
        const x = required('Focal Point.X'), y = required('Focal Point.Y'), z = required('Focal Point.Z');
        const distance = required('Distance'), pitch = required('Pitch'), yaw = required('Yaw');
        if (distance <= 0 || pitch <= 0 || pitch >= Math.PI) throw new Error();
        workspace.mode = '3D';
        workspace.camera = { position: [x + distance * Math.sin(pitch) * Math.cos(yaw), y + distance * Math.sin(pitch) * Math.sin(yaw), z + distance * Math.cos(pitch)], target: [x, y, z], zoom: 1 };
        warn(loc, 'approximate-camera', 'Orbit 按 RViz Z-up 球坐标换算，投影和交互细节不保证相同');
      } catch { warn(loc, 'camera-fallback', 'Orbit 参数缺失/无效，使用 Web 默认视角'); }
    } else if (klass === 'rviz_default_plugins/TopDownOrtho') {
      workspace.mode = '2D';
      const x = read(r, 'X', num, 0), y = read(r, 'Y', num, 0), angle = read(r, 'Angle', num, 0);
      workspace.camera = { position: [x, y - .001, 20], target: [x, y, 0], zoom: 1 };
      warn(loc, 'approximate-camera', '顶视保留中心；Scale 依赖原视窗像素尺寸，使用 Web 默认缩放');
      if (angle !== 0) warn([...loc, 'Angle'], 'camera-angle-fallback', '工作区不保存顶视 roll；使用默认顶视方向');
    } else ignore(loc, 'camera-fallback', '不支持此视角控制器，使用 Web 默认视角');
  }
  if (Array.isArray(manager.Tools)) manager.Tools.forEach((_, i) => ignore([...base, 'Tools', String(i)], 'tools-skipped', '此 RViz Tool 未迁移；网页不发布目标、初始位姿或控制消息'));
  else if (Object.hasOwn(manager, 'Tools')) ignore([...base, 'Tools'], 'tools-skipped', 'RViz Tools 未迁移；网页不发布目标、初始位姿或控制消息');
  if (Object.hasOwn(raw, 'Panels')) ignore(['Panels'], 'panels-skipped', 'RViz 面板布局不适用于 Web');
  function losses(value: unknown, parts: string[]) {
    if (used.has(pointer(parts))) return;
    if (Array.isArray(value)) { if (!value.length) warn(parts, 'unmapped', '未映射空列表'); else value.forEach((v, i) => losses(v, [...parts, String(i)])); }
    else if (object(value)) { const entries = Object.entries(value); if (!entries.length) warn(parts, 'unmapped', '未映射空对象'); else for (const [k, v] of entries) losses(v, [...parts, k]); }
    else warn(parts, /Depth|Durability|Reliability|History Policy/.test(parts.at(-1) ?? '') ? 'qos-not-mapped' : 'unmapped', /Depth|Durability|Reliability|History Policy/.test(parts.at(-1) ?? '') ? 'DDS QoS 由桥接协商，不迁移此配置' : 'Web 没有等价属性，此字段未迁移');
  }
  losses(raw, []);
  if (!workspace.layers.length) warn([...base, 'Displays'], 'no-layers', '没有可转换图层，输出空工作区，不补造图层');
  validateWorkspace(workspace);
  if (Buffer.byteLength(JSON.stringify(workspace, null, 2), 'utf8') > MAX_BYTES) throw new Error('输出工作区超过 2 MiB');
  report.convertedLayers = workspace.layers.length;
  return { workspace, report };
}
