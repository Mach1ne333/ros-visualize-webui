import * as THREE from 'three';
import { session, type RosMessage, stampOf } from './session';
export function frameName(s: string) { return String(s ?? '').replace(/^\/+/, ''); }
export function poseMatrix(pose: RosMessage): THREE.Matrix4 {
  const p = pose.position ?? pose.translation, q = pose.orientation ?? pose.rotation;
  if (!p || !q || ![p.x,p.y,p.z,q.x,q.y,q.z,q.w].every(Number.isFinite)) throw new Error('位姿字段无效');
  const rotation = new THREE.Quaternion(q.x,q.y,q.z,q.w);
  if (!Number.isFinite(rotation.lengthSq())||rotation.lengthSq() < 1e-12) throw new Error('旋转四元数长度无效');
  return new THREE.Matrix4().compose(new THREE.Vector3(p.x,p.y,p.z),rotation.normalize(),new THREE.Vector3(1,1,1));
}
type Transform = { parent: string; stamp: number; matrix: THREE.Matrix4; static: boolean };
export class TransformTree {
  private edges = new Map<string, Transform[]>();
  private seen = new Map<string, number>();
  private generation = session.generation;
  constructor() {
    session.onChange(() => {
      if (this.generation !== session.generation) {
        if(session.status.startsWith('已连接')){
          for(const [frame,list] of this.edges){const kept=list.filter(t=>t.static);if(kept.length)this.edges.set(frame,kept);else this.edges.delete(frame);}
        }else this.edges.clear();
        this.seen.clear(); this.generation = session.generation;
      }
      for (const topic of ['/tf_static','/tf']) {
        const sample = session.samples.get(topic);
        if (!sample || this.seen.get(topic) === sample.sequence) continue;
        this.seen.set(topic,sample.sequence);
        if(sample.schemaName!=='tf2_msgs/msg/TFMessage'){session.warn(`${topic}: 类型不是 tf2_msgs/msg/TFMessage`);continue;}
        for (const t of sample.message.transforms ?? []) {
          try {
            const child = frameName(t.child_frame_id), parent = frameName(t.header?.frame_id);
            if (!child || !parent || child === parent) throw new Error('TF 父/子帧名称无效');
            const entry: Transform = { parent, stamp: stampOf(t), matrix: poseMatrix(t.transform), static: topic === '/tf_static' };
            let list = this.edges.get(child) ?? [];
            list = entry.static ? [entry] : [...list.filter(x => !x.static), entry].sort((a,b)=>a.stamp-b.stamp).slice(-200);
            if(!this.edges.has(child)&&this.edges.size>=2000)continue;
            this.edges.set(child,list);
          } catch(error) { session.warn(`${topic}: 无效 TF · ${String(error)}`); }
        }
      }
    });
  }
  frames() { return [...new Set([...this.edges.keys(),...[...this.edges.values()].flatMap(x=>x.map(t=>t.parent))])].sort(); }
  private at(list: Transform[], stamp: number): Transform {
    const latest = list[list.length-1];
    if (latest.static || stamp === 0) return latest;
    const before = [...list].reverse().find(x=>x.stamp<=stamp), after=list.find(x=>x.stamp>=stamp);
    if (!before || !after) {
      throw new Error('TF 时间超出缓存范围；等待对应时间变换');
    }
    if (before.parent!==after.parent) throw new Error('TF 父帧变化，不能跨父帧插值');
    if (before.stamp===after.stamp) return before;
    const f=(stamp-before.stamp)/(after.stamp-before.stamp);
    const aP=new THREE.Vector3(),bP=new THREE.Vector3(),aQ=new THREE.Quaternion(),bQ=new THREE.Quaternion(),scale=new THREE.Vector3();
    before.matrix.decompose(aP,aQ,scale);after.matrix.decompose(bP,bQ,scale);
    return {...before,matrix:new THREE.Matrix4().compose(aP.lerp(bP,f),aQ.slerp(bQ,f),new THREE.Vector3(1,1,1))};
  }
  lookup(source: string, target: string, stamp=0): THREE.Matrix4 {
    source=frameName(source);target=frameName(target);
    if (!source || !target) throw new Error('缺少消息 frame_id 或 Fixed Frame');
    if(source===target)return new THREE.Matrix4();
    const chain=(frame:string)=>{
      const result:string[]=[];
      for(let i=0;i<100;i++) {
        if(result.includes(frame))throw new Error('TF 存在环');
        result.push(frame);const list=this.edges.get(frame);if(!list?.length)return result;
        frame=list[list.length-1].parent;
      }
      throw new Error('TF 链超出 100 层上限');
    };
    const a=chain(source),b=chain(target),common=a.find(frame=>b.includes(frame));
    if(!common)throw new Error(`缺少 TF: ${source} → ${target}`);
    const toCommon=(path:string[])=>{
      let matrix=new THREE.Matrix4();
      for(let i=0;path[i]!==common;i++){
        const edge=this.at(this.edges.get(path[i])!,stamp);
        if(edge.parent!==path[i+1])throw new Error('TF 父帧在缓存期间变化');
        matrix=edge.matrix.clone().multiply(matrix);
      }
      return matrix;
    };
    return toCommon(b).invert().multiply(toCommon(a));
  }
}
export const transforms=new TransformTree();
