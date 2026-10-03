import { FoxgloveClient, type Channel } from '@foxglove/ws-protocol';
import { parse } from '@foxglove/rosmsg';
import { MessageReader } from '@foxglove/rosmsg2-serialization';
import { bridgeAddress } from './address';

// ROS schemas are discovered at runtime; validate fields in display decoders.
export type RosMessage = Record<string, any>;
export type Sample = { message: RosMessage; received: number; stamp: number; sequence: number; schemaName:string };
export function stampOf(message: RosMessage): number {
  const stamp = message.header?.stamp ?? message.clock;
  if(!stamp)return 0;const sec=Number(stamp.sec),nano=Number(stamp.nanosec??stamp.nsec??0);
  if(!Number.isInteger(sec)||!Number.isInteger(nano)||nano<0||nano>=1e9)throw new Error('ROS 时间字段无效');
  return sec+nano*1e-9;
}
export class DataSession {
  channels: Channel[] = [];
  samples = new Map<string, Sample>();
  status = '未连接';
  diagnostics: string[] = [];
  clock: number | undefined;
  generation = 0;
  private client?: FoxgloveClient;
  private callbacks = new Set<() => void>();
  private desired = new Set<string>();
  private subscriptions = new Map<number, { topic: string; reader: MessageReader<RosMessage>; schemaName:string }>();
  private subscribed = new Set<number>();
  private reconnect?: ReturnType<typeof setTimeout>;
  private url = '';
  private running = false;
  private sequence = 0;
  private epoch = 0;
  onChange(fn: () => void) { this.callbacks.add(fn); return () => { this.callbacks.delete(fn); }; }
  notify() { this.callbacks.forEach(fn => fn()); }
  warn(text: string) {
    if (this.diagnostics[0] !== text) this.diagnostics = [text, ...this.diagnostics].slice(0, 30);
    this.notify();
  }
  connect(url: string) {
    this.disconnect();
    try {url=bridgeAddress(url);} catch (e) { this.warn(String(e)); return; }
    this.running = true;
    this.url = url;
    this.open();
  }
  private open() {
    if (!this.running) return;
    const epoch = ++this.epoch;
    this.status = '连接中'; this.notify();
    const ws = new WebSocket(this.url, ['foxglove.sdk.v1', 'foxglove.websocket.v1']);
    const client = new FoxgloveClient({ ws });
    this.client = client;
    client.on('serverInfo', info => {
      if (epoch !== this.epoch) return;
      const unsafe = info.capabilities.filter(c => ['clientPublish', 'parameters', 'services'].includes(c));
      if (unsafe.length) {
        this.warn(`桥接不是只读配置：${unsafe.join(', ')}；拒绝连接，请使用 start-bridge.sh`);
        this.disconnect(); return;
      }
      this.status = '已连接 · 只读'; this.reconcile(); this.notify();
    });
    client.on('advertise', channels => {
      if (epoch !== this.epoch) return;
      const map = new Map(this.channels.map(c => [c.id, c]));
      channels.forEach(c => map.set(c.id, c));
      this.channels = [...map.values()].sort((a, b) => a.topic.localeCompare(b.topic));
      this.reconcile(); this.notify();
    });
    client.on('unadvertise', ids => {
      if (epoch !== this.epoch) return;
      ids.forEach(id => {
        const channel = this.channels.find(c => c.id === id);
        if (channel) this.samples.delete(channel.topic);
        for (const [sub, record] of this.subscriptions) if (this.channels.find(c => c.id === id)?.topic === record.topic) {
          this.subscriptions.delete(sub); client.unsubscribe(sub);
        }
        this.subscribed.delete(id);
      });
      this.channels = this.channels.filter(c => !ids.includes(c.id)); this.reconcile(); this.notify();
    });
    client.on('message', data => {
      if (epoch !== this.epoch) return;
      const record = this.subscriptions.get(data.subscriptionId);
      if (!record) return;
      try {
        if(data.data.byteLength>64*1024*1024)throw new Error('单条消息超过 64 MiB 上限');
        const message = record.reader.readMessage(data.data);
        const stamp = stampOf(message);
        if (record.topic === '/clock') {
          if(record.schemaName!=='rosgraph_msgs/msg/Clock')throw new Error('/clock 消息类型不匹配');
          if (this.clock !== undefined && stamp < this.clock) {
            for(const topic of [...this.samples.keys()]){
              const type=this.channels.find(channel=>channel.topic===topic)?.schemaName;
              if(topic!=='/tf_static'&&type!=='std_msgs/msg/String'&&type!=='nav_msgs/msg/OccupancyGrid')this.samples.delete(topic);
            }
            this.generation++; this.warn('仿真时间回拨：已清理动态历史');
          }
          this.clock = stamp;
        }
        this.samples.set(record.topic, { message, stamp, received: performance.now(), sequence: ++this.sequence, schemaName:record.schemaName });
        this.notify();
      } catch (e) { this.warn(`${record.topic} 解码失败：${String(e)}`); }
    });
    client.on('status', s => { if (epoch === this.epoch && s.level > 0) this.warn(s.message); });
    client.on('error', () => { if (epoch === this.epoch) this.warn('WebSocket 连接失败，请检查桥接、端口和 ROS_DOMAIN_ID'); });
    client.on('close', () => {
      if (epoch !== this.epoch) return;
      this.channels = []; this.subscriptions.clear(); this.subscribed.clear(); this.samples.clear();
      this.clock = undefined; this.generation++; this.status = this.running ? '连接中断 · 2 秒后重试' : '未连接';
      this.notify();
      if (this.running) this.reconnect = setTimeout(() => this.open(), 2000);
    });
  }
  setTopics(topics: string[]) {
    this.desired = new Set(['/tf', '/tf_static', '/clock', ...topics.filter(Boolean)]);
    this.reconcile();
  }
  private reconcile() {
    const client = this.client;
    if (!client || !this.status.startsWith('已连接')) return;
    for (const [id, record] of this.subscriptions) if (!this.desired.has(record.topic)) {
      client.unsubscribe(id); this.subscriptions.delete(id); this.samples.delete(record.topic);
      const channel = this.channels.find(c => c.topic === record.topic);
      if (channel) this.subscribed.delete(channel.id);
    }
    for (const channel of this.channels) {
      if (!this.desired.has(channel.topic) || this.subscribed.has(channel.id)) continue;
      try {
        if (channel.encoding !== 'cdr' || (channel.schemaEncoding && channel.schemaEncoding !== 'ros2msg')) {
          throw new Error(`不支持 ${channel.encoding}/${channel.schemaEncoding}`);
        }
        const reader = new MessageReader<RosMessage>(parse(channel.schema, { ros2: true }));
        const id = client.subscribe(channel.id);
        this.subscriptions.set(id, { topic: channel.topic, reader, schemaName:channel.schemaName }); this.subscribed.add(channel.id);
      } catch (e) { this.warn(`${channel.topic} 无法订阅：${String(e)}`); }
    }
  }
  disconnect() {
    this.running = false; this.epoch++; clearTimeout(this.reconnect);
    this.client?.close(); this.client = undefined;
    this.channels = []; this.samples.clear(); this.subscriptions.clear(); this.subscribed.clear();
    this.clock = undefined; this.generation++; this.status = '未连接'; this.notify();
  }
}
export const session = new DataSession();
