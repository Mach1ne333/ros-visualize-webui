import { bridgeAddress } from './address';
export type Value = string | number | boolean;
export type Layer = { id: string; type: string; name: string; enabled: boolean; topic: string; properties: Record<string, Value> };
export type Field = { key: string; label: string; kind: 'number' | 'text' | 'color' | 'boolean' | 'select'; value: Value; min?: number; max?: number; step?: number; options?: string[]; when?: (p: Record<string, Value>) => boolean };
const n = (key: string, label: string, value: number, min = 0, max = 100000, step = 0.01): Field => ({ key, label, value, min, max, step, kind: 'number' });
const b = (key: string, label: string, value = false): Field => ({ key, label, value, kind: 'boolean' });
const t = (key: string, label: string, value = ''): Field => ({ key, label, value, kind: 'text' });
const c = (key: string, label: string, value = '#49d8b5'): Field => ({ key, label, value, kind: 'color' });
const s = (key: string, label: string, options: string[], value = options[0]): Field => ({ key, label, value, options, kind: 'select' });
const alpha = n('alpha', 'Alpha · 透明度', 1, 0, 1);
const shape: Field[] = [s('shape', 'Shape · 形状', ['Arrow', 'Axes']), n('length', 'Length (m)', .3, .001), n('radius', 'Radius (m)', .02, .001), { ...c('color', 'Color'), when:p=>p.shape==='Arrow' }, alpha];
const points = (scan: boolean): Field[] => [
  b('selectable', 'Selectable · 点选择', true), s('style', 'Style · 样式', ['Points', 'Squares', 'Flat Squares', 'Spheres', 'Boxes'], 'Flat Squares'),
  { ...n('sizePx', 'Size (px)', 3, 1, 64, 1), when: p => p.style === 'Points' },
  { ...n('size', 'Size (m)', .025, .001, 10), when: p => p.style !== 'Points' }, alpha,
  n('decay', 'Decay Time (s) · 0=最新帧', 0, 0, 120), n('maxPoints', 'Maximum Points · 缓存上限', 120000, 100, 1000000, 100),
  s('positionTransformer', 'Position Transformer', ['XYZ']),
  s('colorTransformer', 'Color Transformer', scan ? ['FlatColor', 'Intensity'] : ['FlatColor', 'AxisColor', 'Intensity', 'RGB'], scan ? 'FlatColor' : 'AxisColor'),
  { ...c('color', 'Color', '#ff4b58'), when: p => p.colorTransformer === 'FlatColor' },
  { ...s('axis', 'Axis', ['X', 'Y', 'Z'], 'Z'), when: p => p.colorTransformer === 'AxisColor' },
  { ...(scan ? s('channel', 'Channel Name · LaserScan 固定', ['intensity']) : t('channel', 'Channel Name', 'intensity')), when: p => p.colorTransformer === 'Intensity' },
  ...[b('rainbow', 'Use Rainbow', true), b('invert', 'Invert Rainbow'), b('autoRange', 'Autocompute Range', true)].map(f => ({ ...f, when: (p: Record<string, Value>) => ['Intensity', 'AxisColor'].includes(String(p.colorTransformer)) })),
  ...[n('minValue', 'Min Value', 0, -1e9, 1e9), n('maxValue', 'Max Value', 2, -1e9, 1e9)].map(f => ({ ...f, when: (p: Record<string, Value>) => ['Intensity', 'AxisColor'].includes(String(p.colorTransformer)) && !p.autoRange })),
  ...[c('minColor', 'Min Color', '#2222ff'), c('maxColor', 'Max Color', '#ff3333')].map(f => ({ ...f, when: (p: Record<string, Value>) => ['Intensity', 'AxisColor'].includes(String(p.colorTransformer)) && !p.rainbow })),
];
export const registry: Record<string, { messages: string[]; fields: Field[]; topic: string }> = {
  Grid: { messages: [], topic: '', fields: [t('frame', 'Reference Frame · 留空使用 Fixed Frame'), n('cellSize', 'Cell Size (m)', .5, .01, 100), n('cells', 'Cell Count', 40, 2, 500, 1), c('color', 'Color', '#344858'), alpha] },
  Axes: { messages: [], topic: '', fields: [t('frame', 'Reference Frame'), n('length', 'Length (m)', 1, .01), n('radius', 'Radius (m)', .01, .001)] },
  LaserScan: { messages: ['sensor_msgs/msg/LaserScan'], topic: '/scan', fields: points(true) },
  PointCloud2: { messages: ['sensor_msgs/msg/PointCloud2'], topic: '/points_raw', fields: points(false) },
  Map: { messages: ['nav_msgs/msg/OccupancyGrid'], topic: '/map', fields: [alpha, b('drawBehind', 'Draw Behind', true), s('scheme', 'Color Scheme', ['map', 'costmap', 'raw'])] },
  TF: { messages: [], topic: '', fields: [b('showAxes', 'Show Axes', true), b('showNames', 'Show Names', true), n('length', 'Axis Length (m)', .25, .01), t('frames', 'Frames · 逗号分隔，留空全部')] },
  Path: { messages: ['nav_msgs/msg/Path'], topic: '/path', fields: [s('lineStyle', 'Line Style', ['Line', 'Billboards']), {...n('width', 'Line Width (m) · Billboards', .025, .001),when:p=>p.lineStyle==='Billboards'}, n('buffer', 'Buffer Length', 1, 1, 100, 1), c('color', 'Color', '#49d8b5'), alpha] },
  Pose: { messages: ['geometry_msgs/msg/PoseStamped'], topic: '/pose', fields: shape },
  PoseArray: { messages: ['geometry_msgs/msg/PoseArray'], topic: '/particle_cloud', fields: shape },
  Odometry: { messages: ['nav_msgs/msg/Odometry'], topic: '/Odometry', fields: [n('positionTolerance', 'Position Tolerance (m)', .1, 0), n('angleTolerance', 'Angle Tolerance (rad)', .1, 0, Math.PI), n('keep', 'Keep · 历史数量', 100, 1, 2000, 1), ...shape, b('covariance', 'Covariance'), ...[n('covarianceScale', 'Covariance Scale (σ)', 2, .1, 10), c('covarianceColor', 'Covariance Color', '#f3b768'), n('covarianceAlpha', 'Covariance Alpha', .25, 0, 1)].map(f => ({ ...f, when: (p: Record<string, Value>) => !!p.covariance }))] },
  RobotModel: { messages: ['std_msgs/msg/String'], topic: '/robot_description', fields: [t('descriptionResource', 'Description Resource · package://...'), b('visual', 'Visual', true), b('collision', 'Collision'), alpha] },
  Marker: { messages: ['visualization_msgs/msg/Marker'], topic: '/visualization_marker', fields: [t('namespaces', 'Namespaces · 逗号分隔'), alpha] },
  MarkerArray: { messages: ['visualization_msgs/msg/MarkerArray'], topic: '/visualization_marker_array', fields: [t('namespaces', 'Namespaces · 逗号分隔'), alpha] },
};
export const unsupportedTypes = ['Camera', 'DepthCloud', 'Image', 'InteractiveMarkers', 'PointCloud', 'GridCells', 'Range', 'Polygon', 'PoseWithCovariance', 'AccelStamped', 'Effort', 'Wrench'];
export function newLayer(type: string): Layer {
  const definition = registry[type];
  if (!definition) throw new Error(`不支持类型：${type}`);
  return { id: crypto.randomUUID(), type, name: type, enabled: true, topic: definition.topic, properties: Object.fromEntries(definition.fields.map(f => [f.key, f.value])) };
}
export type Workspace = { version: 1; fixedFrame: string; mode: '2D' | '3D'; layers: Layer[]; cards: { command: string; estimate: string; stale: number; degrees: boolean }; camera?: { position: number[]; target: number[]; zoom?:number }; panels?:{left:boolean;right:boolean};connection?:{address:string;autoConnect:boolean} };
export function defaultWorkspace(): Workspace {
  return { version: 1, fixedFrame: 'map', mode: '3D', layers: [newLayer('Grid')], cards: { command: '/cmd_vel', estimate: '', stale: 2, degrees: false } };
}
export function validateWorkspace(raw: unknown): Workspace {
  const w = raw as Workspace;
  if (!w || w.version !== 1 || typeof w.fixedFrame !== 'string' || !['2D', '3D'].includes(w.mode) || !Array.isArray(w.layers) || w.layers.length > 100) throw new Error('无效或不兼容的工作区版本');
  const keys=(value:object,allowed:string[])=>{if(Object.keys(value).some(key=>!allowed.includes(key)))throw new Error('工作区包含未知字段；不保存任意消息、文件或凭据');};
  keys(w,['version','fixedFrame','mode','layers','cards','camera','panels','connection']);
  for(const key of ['camera','panels','connection'] as const)if(w[key]!==undefined&&(!w[key]||typeof w[key]!=='object'||Array.isArray(w[key])))throw new Error(`${key} 配置无效`);
  const ids = new Set<string>();
  for (const layer of w.layers) {
    if (!registry[layer.type] || typeof layer.id !== 'string' || ids.has(layer.id) || typeof layer.name !== 'string' || typeof layer.topic !== 'string' || typeof layer.enabled !== 'boolean' || !layer.properties) throw new Error('无效或不支持的图层');
    keys(layer,['id','type','name','enabled','topic','properties']);keys(layer.properties,registry[layer.type].fields.map(field=>field.key));
    ids.add(layer.id);
    for (const f of registry[layer.type].fields) {
      const value = layer.properties[f.key];
      if(['cells','keep','buffer','maxPoints'].includes(f.key)&&!Number.isInteger(value))throw new Error(`${f.label} 必须是整数`);
      if (typeof value !== typeof f.value || (typeof value === 'number' && (!Number.isFinite(value) || value < (f.min ?? -Infinity) || value > (f.max ?? Infinity))) || (f.options && !f.options.includes(String(value))) || (f.kind==='color'&&!/^#[0-9a-f]{6}$/i.test(String(value)))) throw new Error(`${layer.name}: ${f.label} 无效`);
    }
  }
  if (!w.cards || typeof w.cards.command !== 'string' || typeof w.cards.estimate !== 'string' || !Number.isFinite(w.cards.stale) || w.cards.stale <= 0 || typeof w.cards.degrees !== 'boolean') throw new Error('速度卡片配置无效');
  keys(w.cards,['command','estimate','stale','degrees']);
  if(w.camera)keys(w.camera,['position','target','zoom']);
  if(w.panels)keys(w.panels,['left','right']);
  if(w.connection)keys(w.connection,['address','autoConnect']);
  if (w.camera && (!['position', 'target'].every(key => { const v = w.camera![key as 'position' | 'target']; return Array.isArray(v) && v.length === 3 && v.every(Number.isFinite); }))) throw new Error('相机配置无效');
  if(w.camera?.zoom!==undefined&&(!Number.isFinite(w.camera.zoom)||w.camera.zoom<=0||w.camera.zoom>1000))throw new Error('相机缩放无效');
  if(w.panels&&(typeof w.panels.left!=='boolean'||typeof w.panels.right!=='boolean'))throw new Error('面板配置无效');
  if(w.connection){if(typeof w.connection.address!=='string'||typeof w.connection.autoConnect!=='boolean')throw new Error('连接配置无效');bridgeAddress(w.connection.address);}
  return w;
}
