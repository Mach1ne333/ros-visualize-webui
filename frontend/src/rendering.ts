import * as T from 'three';
import { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';
import { Line2 } from 'three/examples/jsm/lines/Line2.js';
import { LineGeometry } from 'three/examples/jsm/lines/LineGeometry.js';
import { LineSegments2 } from 'three/examples/jsm/lines/LineSegments2.js';
import { LineSegmentsGeometry } from 'three/examples/jsm/lines/LineSegmentsGeometry.js';
import { LineMaterial } from 'three/examples/jsm/lines/LineMaterial.js';
import URDFLoader from 'urdf-loader';
import { session, stampOf, type RosMessage, type Sample } from './session';
import { poseMatrix, transforms } from './tf';
import { registry, type Layer, type Workspace } from './layers';

function number(p: Layer['properties'], key: string, fallback=0) { return Number(p[key] ?? fallback); }
function dispose(object:T.Object3D) {
  object.traverse(child=>{
    const node=child as T.Mesh;
    node.geometry?.dispose();
    if(node.material)for(const m of (Array.isArray(node.material)?node.material:[node.material])) { (m as T.MeshBasicMaterial).map?.dispose();m.dispose(); }
  });
}
function opacity(object:T.Object3D,alpha:number,preserve=false) {
  object.traverse(child=>{const node=child as T.Mesh;if(node.material)for(const m of Array.isArray(node.material)?node.material:[node.material]) {if(preserve){m.userData.webvizBaseAlpha??=m.opacity;m.userData.webvizBaseTransparent??=m.transparent;}m.opacity=alpha*(preserve?Number(m.userData.webvizBaseAlpha):1);m.transparent=m.opacity<1||(preserve&&!!m.userData.webvizBaseTransparent);}});
}
function textSprite(text:string,color='#cce3f5') {
  const canvas=document.createElement('canvas'),lines=text.split('\n').slice(0,12),ctx=canvas.getContext('2d')!;ctx.font='44px sans-serif';
  const measured=Math.max(1,...lines.map(line=>ctx.measureText(line).width));canvas.width=Math.ceil(Math.min(4096,measured+16));canvas.height=64*Math.max(1,lines.length);
  ctx.font=`${44*Math.min(1,(canvas.width-16)/measured)}px sans-serif`;ctx.fillStyle=color;lines.forEach((line,i)=>ctx.fillText(line,8,i*64+48));
  const texture=new T.CanvasTexture(canvas);const sprite=new T.Sprite(new T.SpriteMaterial({map:texture,depthTest:false,transparent:true}));sprite.scale.set(.2*canvas.width/64,.2*Math.max(1,lines.length),1);return sprite;
}
function axes(length:number,radius:number) {
  const g=new T.Group();
  [[1,0,0,0xff5050],[0,1,0,0x40dd70],[0,0,1,0x509dff]].forEach(([x,y,z,color])=>{
    const mesh=new T.Mesh(new T.CylinderGeometry(radius,radius,length,8),new T.MeshBasicMaterial({color}));
    const dir=new T.Vector3(x,y,z);mesh.quaternion.setFromUnitVectors(new T.Vector3(0,1,0),dir);mesh.position.copy(dir.multiplyScalar(length/2));g.add(mesh);
  });return g;
}
function solidArrow(direction:T.Vector3,origin:T.Vector3,length:number,shaftDiameter:number,headLength:number,headDiameter:number,color:T.Color) {
  const g=new T.Group();if(!(length>0)||direction.lengthSq()<1e-12)return g;
  headLength=T.MathUtils.clamp(headLength,0,length);const shaftLength=length-headLength;
  const material=new T.MeshBasicMaterial({color}),rotation=new T.Quaternion().setFromUnitVectors(new T.Vector3(0,1,0),direction.clone().normalize());
  for(const [geometry,offset]of [[new T.CylinderGeometry(shaftDiameter/2,shaftDiameter/2,shaftLength,10),shaftLength/2],[new T.ConeGeometry(headDiameter/2,headLength,10),shaftLength+headLength/2]] as [T.BufferGeometry,number][]){const mesh=new T.Mesh(geometry,material);mesh.quaternion.copy(rotation);mesh.position.copy(origin).addScaledVector(direction.clone().normalize(),offset);g.add(mesh);}return g;
}
function worldPoints(geometry:T.BufferGeometry,material:T.PointsMaterial,size:number) {
  const object=new T.Points(geometry,material);
  object.onBeforeRender=(renderer,_scene,camera)=>{const height=renderer.getSize(new T.Vector2()).y;material.size=size*camera.projectionMatrix.elements[5]*(camera instanceof T.PerspectiveCamera?1:height/2);};return object;
}
function arrow(pose:RosMessage,layer:Layer) {
  const p=layer.properties;const g=new T.Group();g.applyMatrix4(poseMatrix(pose));
  if(p.shape==='Axes')g.add(axes(number(p,'length',.3),number(p,'radius',.02)));
  else g.add(solidArrow(new T.Vector3(1,0,0),new T.Vector3(),number(p,'length',.3),number(p,'radius',.02)*2,number(p,'length',.3)*.3,number(p,'radius',.02)*4,new T.Color(String(p.color))));
  opacity(g,number(p,'alpha',1));return g;
}
// Jacobi eigenvectors of a symmetric 3x3 covariance, no assumptions of axis alignment.
function covariance3(matrix:number[]) {
  if(matrix.length!==9 || !matrix.every(Number.isFinite))throw new Error('协方差字段无效');
  const a=[[matrix[0],matrix[1],matrix[2]],[matrix[3],matrix[4],matrix[5]],[matrix[6],matrix[7],matrix[8]]];
  if(a.some((row,i)=>row.some((v,j)=>Math.abs(v-a[j][i])>1e-5)))throw new Error('协方差非对称');
  const v=[[1,0,0],[0,1,0],[0,0,1]];
  for(let iter=0;iter<30;iter++) {
    let p=0,q=1;for(let i=0;i<3;i++)for(let j=i+1;j<3;j++)if(Math.abs(a[i][j])>Math.abs(a[p][q])){p=i;q=j;}
    if(Math.abs(a[p][q])<1e-10)break;
    const angle=.5*Math.atan2(2*a[p][q],a[q][q]-a[p][p]),c=Math.cos(angle),s=Math.sin(angle);
    const pp=a[p][p],qq=a[q][q],pq=a[p][q];
    a[p][p]=c*c*pp-2*s*c*pq+s*s*qq;a[q][q]=s*s*pp+2*s*c*pq+c*c*qq;a[p][q]=a[q][p]=0;
    for(let k=0;k<3;k++){if(k!==p&&k!==q){const kp=a[k][p],kq=a[k][q];a[k][p]=a[p][k]=c*kp-s*kq;a[k][q]=a[q][k]=s*kp+c*kq;}const vp=v[k][p],vq=v[k][q];v[k][p]=c*vp-s*vq;v[k][q]=s*vp+c*vq;}
  }
  if([0,1,2].some(i=>a[i][i]<-1e-8))throw new Error('协方差不是半正定');
  return {values:[0,1,2].map(i=>Math.max(0,a[i][i])),vectors:v};
}
function covariance(pose:RosMessage,values:number[],layer:Layer) {
  if(values?.length!==36)throw new Error('缺少 6×6 协方差');
  if(!values.every(Number.isFinite))throw new Error('协方差含非有限值');
  for(let i=0;i<6;i++)for(let j=i+1;j<6;j++)if(Math.abs(values[i*6+j]-values[j*6+i])>1e-5)throw new Error('6×6 协方差非对称');
  if(values.every(value=>value===0))throw new Error('协方差全零：未知或未估计，不显示有效测量');
  const g=new T.Group();g.position.copy(new T.Vector3(pose.position.x,pose.position.y,pose.position.z));
  const alpha=number(layer.properties,'covarianceAlpha',.25),scale=number(layer.properties,'covarianceScale',2),color=String(layer.properties.covarianceColor);
  const pos=covariance3([values[0],values[1],values[2],values[6],values[7],values[8],values[12],values[13],values[14]]);
  const rot=covariance3([values[21],values[22],values[23],values[27],values[28],values[29],values[33],values[34],values[35]]);
  const ellipsoid=new T.Mesh(new T.SphereGeometry(1,16,12),new T.MeshBasicMaterial({color,transparent:true,opacity:alpha,depthWrite:false}));
  const v=pos.vectors;const basis=new T.Matrix4().makeBasis(new T.Vector3(v[0][0],v[1][0],v[2][0]),new T.Vector3(v[0][1],v[1][1],v[2][1]),new T.Vector3(v[0][2],v[1][2],v[2][2]));
  ellipsoid.quaternion.setFromRotationMatrix(basis);ellipsoid.scale.set(...pos.values.map(x=>Math.max(1e-5,Math.sqrt(x)*scale)) as [number,number,number]);g.add(ellipsoid);
  const q=pose.orientation;const orientation=new T.Quaternion(q.x,q.y,q.z,q.w).normalize();
  for(let axis=0;axis<3;axis++) {
    const spread=Math.min(Math.PI,Math.sqrt(rot.values[axis])*scale);if(spread<1e-6)continue;
    const direction=new T.Vector3(rot.vectors[0][axis],rot.vectors[1][axis],rot.vectors[2][axis]).normalize();
    const normal=new T.Vector3(1,0,0).applyQuaternion(orientation);if(Math.abs(direction.dot(normal))>.9)normal.set(0,1,0).applyQuaternion(orientation);normal.addScaledVector(direction,-normal.dot(direction)).normalize();
    const tangent=direction.clone().cross(normal).normalize(), points:T.Vector3[]=[];
    for(let i=0;i<=32;i++){const theta=-spread+2*spread*i/32;points.push(normal.clone().multiplyScalar(Math.cos(theta)*.4).add(tangent.clone().multiplyScalar(Math.sin(theta)*.4)));}
    g.add(new T.Line(new T.BufferGeometry().setFromPoints(points),new T.LineBasicMaterial({color,transparent:true,opacity:alpha})));
  }
  return g;
}
type PointData={xyz:number[];intensity:number[];rgb:number[];fields:string[]};
function readPoints(message:RosMessage,scan:boolean,channel:string,max:number):PointData {
  const result:PointData={xyz:[],intensity:[],rgb:[],fields:[]};
  if(scan) {
    const ranges=message.ranges;if(!ranges?.length)return result;
    const stride=Math.max(1,Math.ceil(ranges.length/max));result.fields=['x','y','z',...(message.intensities?.length?['intensity']:[])];
    for(let i=0;i<ranges.length;i+=stride){const r=ranges[i],a=message.angle_min+i*message.angle_increment;if(Number.isFinite(r)&&Number.isFinite(a)&&r>=message.range_min&&r<=message.range_max){result.xyz.push(r*Math.cos(a),r*Math.sin(a),0);result.intensity.push(message.intensities?.[i]??NaN);}}
    return result;
  }
  const bytes=message.data instanceof Uint8Array?message.data:new Uint8Array(message.data);const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
  const fields:RosMessage[]=message.fields??[];result.fields=fields.map(f=>f.name);
  const width=Number(message.width),height=Number(message.height),step=Number(message.point_step),rowStep=Number(message.row_step),little=!message.is_bigendian;
  if(!Number.isInteger(width)||!Number.isInteger(height)||width<0||height<0||!Number.isInteger(step)||!Number.isInteger(rowStep)||step<=0||rowStep<width*step||rowStep*height>bytes.byteLength)throw new Error('PointCloud2 尺寸或数据长度无效');
  const field=(name:string)=>fields.find(f=>f.name===name);for(const name of ['x','y','z'])if(!field(name))throw new Error(`点云缺少 ${name}`);
  const read=(f:RosMessage|undefined,offset:number)=>{if(!f)return NaN;const at=offset+Number(f.offset);const sizes=[0,1,1,2,2,4,4,4,8];if(!sizes[f.datatype]||!Number.isInteger(f.offset)||f.offset<0||f.offset+sizes[f.datatype]>step)throw new Error('点云字段越界');switch(f.datatype){case 1:return view.getInt8(at);case 2:return view.getUint8(at);case 3:return view.getInt16(at,little);case 4:return view.getUint16(at,little);case 5:return view.getInt32(at,little);case 6:return view.getUint32(at,little);case 7:return view.getFloat32(at,little);case 8:return view.getFloat64(at,little);default:return NaN;}};
  const stride=Math.max(1,Math.ceil(width*height/max));
  for(let i=0;i<width*height;i+=stride){const at=Math.floor(i/width)*rowStep+(i%width)*step;const xyz=['x','y','z'].map(name=>read(field(name),at));if(!xyz.every(Number.isFinite))continue;result.xyz.push(...xyz);result.intensity.push(read(field(channel),at));const packed=field('rgb')??field('rgba');if(packed&&[6,7].includes(packed.datatype)&&Number.isInteger(packed.offset)&&packed.offset>=0&&packed.offset+4<=step){const rgb=view.getUint32(at+packed.offset,little);result.rgb.push(((rgb>>16)&255)/255,((rgb>>8)&255)/255,(rgb&255)/255);}else if(['r','g','b'].every(x=>field(x))){result.rgb.push(...['r','g','b'].map(x=>read(field(x),at)/255));}}
  return result;
}
function pointObject(data:PointData,layer:Layer):T.Object3D {
  const p=layer.properties,count=data.xyz.length/3;const transformer=String(p.colorTransformer);const values=transformer==='AxisColor'?Array.from({length:count},(_,i)=>data.xyz[i*3+['X','Y','Z'].indexOf(String(p.axis))]):data.intensity;
  const valid=values.filter(Number.isFinite);let min=number(p,'minValue'),max=number(p,'maxValue',2);
  if(p.autoRange&&valid.length){min=Infinity;max=-Infinity;for(const value of valid){min=Math.min(min,value);max=Math.max(max,value);}}
  if(transformer==='RGB'&&data.rgb.length!==data.xyz.length)throw new Error('没有有效 RGB 字段；请选择其他着色方式');
  if(transformer==='Intensity'&&!valid.length)session.warn(`${layer.name}: 没有强度数据，使用固定颜色`);
  if(['Intensity','AxisColor'].includes(transformer)&&valid.length&&max<=min)session.warn(`${layer.name}: 着色范围退化，使用范围中点颜色`);
  const colors:number[]=[],base=new T.Color(String(p.color??'#ff4b58')),low=new T.Color(String(p.minColor??'#2222ff')),high=new T.Color(String(p.maxColor??'#ff3333'));
  for(let i=0;i<count;i++){let color=base.clone();if(transformer==='RGB')color.setRGB(data.rgb[i*3],data.rgb[i*3+1],data.rgb[i*3+2],T.SRGBColorSpace);else if(['Intensity','AxisColor'].includes(transformer)&&Number.isFinite(values[i])){let ratio=max>min?T.MathUtils.clamp((values[i]-min)/(max-min),0,1):.5;if(p.invert)ratio=1-ratio;color=p.rainbow?new T.Color().setHSL((1-ratio)*.7,1,.5):low.clone().lerp(high,ratio);}colors.push(color.r,color.g,color.b);}
  if(p.style==='Points'||p.style==='Squares') {
    const geo=new T.BufferGeometry();geo.setAttribute('position',new T.Float32BufferAttribute(data.xyz,3));geo.setAttribute('color',new T.Float32BufferAttribute(colors,3));
    const material=new T.PointsMaterial({vertexColors:true,size:p.style==='Points'?number(p,'sizePx',3):number(p,'size',.025),sizeAttenuation:p.style!=='Points',transparent:number(p,'alpha',1)<1,opacity:number(p,'alpha',1)});
    return p.style==='Points'?new T.Points(geo,material):worldPoints(geo,material,number(p,'size',.025));
  }
  const size=number(p,'size',.025),geo=p.style==='Spheres'?new T.SphereGeometry(size/2,6,4):p.style==='Boxes'?new T.BoxGeometry(size,size,size):new T.PlaneGeometry(size,size);
  const material=new T.MeshBasicMaterial({vertexColors:false,side:T.DoubleSide,transparent:number(p,'alpha',1)<1,opacity:number(p,'alpha',1)});
  const mesh=new T.InstancedMesh(geo,material,count),matrix=new T.Matrix4();
  for(let i=0;i<count;i++){matrix.makeTranslation(data.xyz[i*3],data.xyz[i*3+1],data.xyz[i*3+2]);mesh.setMatrixAt(i,matrix);mesh.setColorAt(i,new T.Color(colors[i*3],colors[i*3+1],colors[i*3+2]));}
  mesh.instanceMatrix.needsUpdate=true;if(mesh.instanceColor)mesh.instanceColor.needsUpdate=true;return mesh;
}
function mapObject(message:RosMessage,layer:Layer) {
  const info=message.info,w=info.width,h=info.height;
  if(!Number.isInteger(w)||!Number.isInteger(h)||w<=0||h<=0||w*h>16000000||message.data.length<w*h||!Number.isFinite(info.resolution)||info.resolution<=0)throw new Error('地图尺寸或分辨率无效');
  const pixels=new Uint8Array(w*h*4),scheme=layer.properties.scheme;
  for(let i=0;i<w*h;i++){const value=message.data[i];let rgb=[128,138,150];if(value>=0){if(scheme==='map')rgb=Array(3).fill(Math.round(255*(1-T.MathUtils.clamp(value,0,100)/100)));else if(scheme==='raw')rgb=Array(3).fill(Math.max(0,255-value));else {const color=value===0?new T.Color('#ffffff'):value>=99?new T.Color('#ff3344'):new T.Color().setHSL((100-value)/150,.9,.5);rgb=[color.r*255,color.g*255,color.b*255];}}pixels.set([...rgb,255],i*4);}
  const texture=new T.DataTexture(pixels,w,h,T.RGBAFormat);texture.colorSpace=T.SRGBColorSpace;texture.needsUpdate=true;
  const material=new T.MeshBasicMaterial({map:texture,side:T.DoubleSide,transparent:true,opacity:number(layer.properties,'alpha',1),depthWrite:!layer.properties.drawBehind});
  const mesh=new T.Mesh(new T.PlaneGeometry(w*info.resolution,h*info.resolution),material);mesh.position.set(w*info.resolution/2,h*info.resolution/2,layer.properties.drawBehind?-.002:0);mesh.renderOrder=layer.properties.drawBehind?-10:0;
  const g=new T.Group();g.applyMatrix4(poseMatrix(info.origin));g.add(mesh);return g;
}
type State={root:T.Group;key:string;seen:number;history:Sample[];markers:Map<string,{message:RosMessage;expires:number}>;robot?:T.Object3D;links?:Record<string,T.Object3D>;loading?:boolean;robotKey?:string;source?:string;loadError?:string;warning?:string;failed?:boolean;waitSince?:number;latest?:Sample};
export class Renderer {
  scene=new T.Scene();renderer:T.WebGLRenderer;camera:T.PerspectiveCamera|T.OrthographicCamera;
  controls:OrbitControls;states=new Map<string,State>();status=new Map<string,string>();
  private resize:ResizeObserver;private animation=0;private config:Workspace;private generation=session.generation;private lastTf=-1;private lastSize='';private disposed=false;
  onPick:(text:string)=>void=()=>{};
  constructor(private host:HTMLElement,config:Workspace) {
    this.config=config;this.renderer=new T.WebGLRenderer({antialias:true});this.renderer.setPixelRatio(Math.min(devicePixelRatio,2));host.appendChild(this.renderer.domElement);
    this.scene.background=new T.Color('#101822');this.scene.add(new T.AmbientLight(0xffffff,1.4));const light=new T.DirectionalLight(0xffffff,2);light.position.set(4,-5,10);this.scene.add(light);this.camera=new T.PerspectiveCamera(45,1,.01,1000);this.camera.up.set(0,0,1);this.camera.position.set(7,-9,8);
    this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.resize=new ResizeObserver(()=>this.fit());this.resize.observe(host);this.setConfig(config);
    this.renderer.domElement.addEventListener('click',this.pick);
    this.renderer.setAnimationLoop(()=>{this.animation++;if(this.animation%2===0){this.update();this.renderer.render(this.scene,this.camera);}});
  }
  cameraState(){return {position:this.camera.position.toArray(),target:this.controls.target.toArray(),zoom:this.camera.zoom};}
  reset(){this.camera.zoom=1;this.camera.updateProjectionMatrix();this.camera.position.set(...(this.config.mode==='2D'?[0,0,12]:[7,-9,8]) as [number,number,number]);this.controls.target.set(0,0,0);this.controls.update();}
  setConfig(config:Workspace) {
    const mode=this.config.mode;this.config=config;
    if(mode!==config.mode||((config.mode==='2D')!==(this.camera instanceof T.OrthographicCamera))) {
      const state=this.cameraState();this.controls.dispose();this.camera=config.mode==='2D'?new T.OrthographicCamera(-8,8,8,-8,.01,1000):new T.PerspectiveCamera(45,1,.01,1000);this.camera.up.set(0,0,1);this.camera.position.fromArray(state.position);this.controls=new OrbitControls(this.camera,this.renderer.domElement);this.controls.target.fromArray(state.target);this.controls.enableRotate=config.mode!=='2D';if(config.mode==='2D'){this.camera.position.set(state.target[0],state.target[1],Math.max(10,state.target[2]+10));this.camera.up.set(0,1,0);}this.controls.update();this.fit();
    }
    for(const [id,state]of this.states)if(!config.layers.some(l=>l.id===id&&l.enabled)){dispose(state.root);this.scene.remove(state.root);this.states.delete(id);this.status.delete(id);}
    this.update();
  }
  restoreCamera(state:Workspace['camera']){if(state){this.camera.position.fromArray(state.position);this.controls.target.fromArray(state.target);if(this.config.mode==='2D')this.camera.position.set(state.target[0],state.target[1],state.target[2]+Math.max(.01,Math.abs(state.position[2]-state.target[2])));this.camera.zoom=state.zoom??1;this.camera.updateProjectionMatrix();this.controls.update();}}
  private fit(){const w=Math.max(1,this.host.clientWidth),h=Math.max(1,this.host.clientHeight);this.renderer.setSize(w,h);if(this.camera instanceof T.PerspectiveCamera)this.camera.aspect=w/h;else{const span=8;this.camera.left=-span*w/h;this.camera.right=span*w/h;this.camera.top=span;this.camera.bottom=-span;}this.camera.updateProjectionMatrix();this.lastSize=`${w}/${h}`;}
  private clear(root:T.Group){for(const c of [...root.children]){root.remove(c);dispose(c);}}
  private update() {
    if(this.generation!==session.generation){for(const state of this.states.values()){this.clear(state.root);state.history=[];state.markers.clear();state.seen=0;state.key='';state.robot=undefined;state.links=undefined;state.robotKey=undefined;state.loadError=undefined;state.loading=false;state.failed=false;state.waitSince=undefined;state.warning=undefined;state.latest=undefined;}this.generation=session.generation;}
    const tfVersion=(session.samples.get('/tf')?.sequence??0)+(session.samples.get('/tf_static')?.sequence??0);const tfChanged=tfVersion!==this.lastTf;this.lastTf=tfVersion;
    for(const layer of this.config.layers) {
      if(!layer.enabled)continue;
      let state=this.states.get(layer.id);if(!state){state={root:new T.Group(),key:'',seen:0,history:[],markers:new Map()};this.states.set(layer.id,state);this.scene.add(state.root);}
      const key=JSON.stringify([layer,this.config.fixedFrame,this.lastSize]);const changed=state.key!==key;
      if(state.source!==layer.topic){this.clear(state.root);state.history=[];state.markers.clear();state.seen=0;state.source=layer.topic;state.warning=undefined;state.failed=false;state.waitSince=undefined;state.latest=undefined;state.robotKey=undefined;state.links=undefined;state.robot=undefined;}
      if(changed)state.key=key;
      const incoming=session.samples.get(layer.topic);if(incoming)state.latest=incoming;
      const sample=incoming??(['LaserScan','PointCloud2','Marker','MarkerArray'].includes(layer.type)?state.latest:undefined);
      let warning='';let nextRoot:T.Group|undefined;
      try {
        if(sample&&!(layer.type==='RobotModel'&&layer.properties.descriptionResource)&&registry[layer.type].messages.length&&!registry[layer.type].messages.includes(sample.schemaName))throw new Error(`话题类型 ${sample.schemaName} 不匹配 ${layer.type}`);
        if(layer.type==='Odometry'&&sample)poseMatrix(sample.message.pose?.pose??{});
        if(layer.type==='RobotModel'){this.robot(layer,state,sample,changed);continue;}
        if(['Grid','Axes','TF'].includes(layer.type)) {
          if(!changed&&!tfChanged)continue;this.clear(state.root);this.basic(layer,state.root);this.status.set(layer.id,'OK');continue;
        }
        if(!sample){this.clear(state.root);state.history=[];state.markers.clear();this.status.set(layer.id,'等待数据');continue;}
        if(state.seen!==sample.sequence||(changed&&!state.history.length&&!['Marker','MarkerArray'].includes(layer.type))) {
          state.seen=sample.sequence;
          if(layer.type==='Odometry'){const previous=state.history.at(-1)?.message.pose.pose,pose=sample.message.pose.pose;if(previous){const a=new T.Vector3(previous.position.x,previous.position.y,previous.position.z),b=new T.Vector3(pose.position.x,pose.position.y,pose.position.z),qa=previous.orientation,qb=pose.orientation;const angle=new T.Quaternion(qa.x,qa.y,qa.z,qa.w).normalize().angleTo(new T.Quaternion(qb.x,qb.y,qb.z,qb.w).normalize());if(a.distanceTo(b)>=number(layer.properties,'positionTolerance',.1)||angle>=number(layer.properties,'angleTolerance',.1))state.history.push(sample);}else state.history.push(sample);}
          else if(['Marker','MarkerArray'].includes(layer.type)){for(const m of layer.type==='MarkerArray'?sample.message.markers:[sample.message]){const id=`${m.ns}/${m.id}`;if(m.action===3)state.markers.clear();else if(m.action===2)state.markers.delete(id);else if(m.action===0){const life=Number(m.lifetime?.sec??0)+Number(m.lifetime?.nanosec??0)*1e-9;if(!Number.isFinite(life)||life<0){warning=`${id}: Marker lifetime 无效`;session.warn(warning);continue;}state.markers.set(id,{message:m,expires:life>0?(session.clock??Date.now()/1000)+life:Infinity});if(state.markers.size>2000){const oldest=state.markers.keys().next().value;if(oldest!==undefined)state.markers.delete(oldest);session.warn(`${layer.name}: 标记缓存达到 2000 上限，淘汰最旧标记`);}}}}
          else state.history.push(sample);
        } else if(!changed&&!tfChanged&&!['Marker','MarkerArray'].includes(layer.type)&&!(number(layer.properties,'decay')>0)){if(!state.failed)this.status.set(layer.id,state.warning||(!incoming?'等待来源恢复 · 保留最后数据':layer.type==='Map'?`最新网格 · ${((performance.now()-sample.received)/1000).toFixed(1)}s 前接收`:performance.now()-sample.received>3000?'数据过期 · 保留最后画面':'OK'));continue;}
        const p=layer.properties;
        if(['LaserScan','PointCloud2'].includes(layer.type)) {
          const decay=number(p,'decay');const now=session.clock??(sample.stamp+(performance.now()-sample.received)/1000);
          state.history=decay>0?state.history.filter(s=>now-s.stamp<=decay).slice(-60):state.history.slice(-1);
          const max=number(p,'maxPoints',120000);while(state.history.length>1&&state.history.reduce((sum,s)=>sum+(s.message.width*s.message.height||s.message.ranges?.length||0),0)>max)state.history.shift();
        } else state.history=state.history.slice(-number(p,layer.type==='Odometry'?'keep':'buffer',1));
        nextRoot=new T.Group();
        if(['Marker','MarkerArray'].includes(layer.type)) {
          const now=session.clock??Date.now()/1000;for(const[id,record]of state.markers){if(record.expires<=now){state.markers.delete(id);continue;}const namespaces=String(p.namespaces).split(',').map(s=>s.trim()).filter(Boolean);if(namespaces.length&&!namespaces.includes(record.message.ns))continue;let object:T.Object3D|undefined;try{object=this.marker(record.message,layer);object.applyMatrix4(transforms.lookup(record.message.header.frame_id,this.config.fixedFrame,record.message.frame_locked?0:stampOf(record.message)));nextRoot.add(object);}catch(error){if(object)dispose(object);warning=`${id}: ${String(error)}`;}}
        } else for(const record of state.history) {
          const m=record.message,g=new T.Group();nextRoot.add(g);g.applyMatrix4(transforms.lookup(m.header?.frame_id,this.config.fixedFrame,record.stamp));
          if(['PointCloud2','LaserScan'].includes(layer.type)){const data=readPoints(m,layer.type==='LaserScan',String(p.channel),Math.max(100,Math.floor(number(p,'maxPoints',120000)/Math.max(1,state.history.length))));const points=pointObject(data,layer);points.userData={layerId:layer.id,pointData:data,selectable:p.selectable};g.add(points);}
          else if(layer.type==='Map')g.add(mapObject(m,layer));
          else if(layer.type==='Path')g.add(this.path(m,layer));
          else if(layer.type==='Pose')g.add(arrow(m.pose,layer));
          else if(layer.type==='PoseArray'){if(m.poses.length>2000)warning='PoseArray 超过 2000 位姿上限，显示前 2000 个';for(const pose of m.poses.slice(0,2000))g.add(arrow(pose,layer));}
          else if(layer.type==='Odometry'){g.add(arrow(m.pose.pose,layer));if(p.covariance){try{g.add(covariance(m.pose.pose,m.pose.covariance,layer));}catch(e){warning=String(e);}}}
        }
        this.clear(state.root);state.root.add(nextRoot);nextRoot=undefined;state.failed=false;state.waitSince=undefined;
        state.warning=warning;
        this.status.set(layer.id,warning||(!incoming?(state.history.length||state.markers.size?'等待来源恢复 · 保留缓存':'历史已到期 · 等待来源恢复'):layer.type==='Map'?`最新网格 · ${((performance.now()-sample.received)/1000).toFixed(1)}s 前接收`:performance.now()-sample.received>3000?'数据过期 · 保留最后画面':'OK'));
      } catch(e){if(nextRoot)dispose(nextRoot);state.failed=true;const reason=String(e);if(reason.includes('等待对应时间变换')){state.waitSince??=performance.now();this.status.set(layer.id,performance.now()-state.waitSince<1000?(state.root.children.length?'等待 TF 同步 · 保留上次有效帧':'等待消息时间对应的 TF'):reason);}else this.status.set(layer.id,reason);}
    }
  }
  private basic(layer:Layer,root:T.Group) {
    const p=layer.properties,fixed=this.config.fixedFrame;
    if(layer.type==='Grid'){const grid=new T.GridHelper(number(p,'cells',40)*number(p,'cellSize',.5),number(p,'cells',40),String(p.color),String(p.color));grid.rotation.x=Math.PI/2;const g=new T.Group();g.add(grid);opacity(g,number(p,'alpha',1));g.applyMatrix4(transforms.lookup(String(p.frame)||fixed,fixed));root.add(g);}
    if(layer.type==='Axes'){const g=axes(number(p,'length',1),number(p,'radius',.01));g.applyMatrix4(transforms.lookup(String(p.frame)||fixed,fixed));root.add(g);}
    if(layer.type==='TF'){if(!transforms.frames().length)throw new Error('等待 TF 数据');const filter=String(p.frames).split(',').map(s=>s.trim()).filter(Boolean);for(const frame of transforms.frames()){if(filter.length&&!filter.includes(frame))continue;const g=new T.Group();g.applyMatrix4(transforms.lookup(frame,fixed));if(p.showAxes)g.add(axes(number(p,'length',.25),.006));if(p.showNames){const label=textSprite(frame);label.position.z=.08;g.add(label);}root.add(g);}}
  }
  private path(m:RosMessage,layer:Layer) {
    const points:number[]=[];if(m.poses?.length>20000)session.warn(`${layer.name}: 路径超过 20000 点上限`);for(const pose of (m.poses??[]).slice(0,20000)){const position=pose.pose?.position;if(!position||![position.x,position.y,position.z].every(Number.isFinite))throw new Error('Path position 字段无效');const v=new T.Vector3(position.x,position.y,position.z).applyMatrix4(transforms.lookup(pose.header?.frame_id||m.header.frame_id,m.header.frame_id,stampOf(pose)||stampOf(m)));points.push(v.x,v.y,v.z);}
    if(points.length<6)return new T.Group();
    if(layer.properties.lineStyle==='Billboards'){const geometry=new LineGeometry();geometry.setPositions(points);const material=new LineMaterial({color:String(layer.properties.color),linewidth:number(layer.properties,'width',.025),worldUnits:true,transparent:true,opacity:number(layer.properties,'alpha',1)});material.resolution.set(this.host.clientWidth,this.host.clientHeight);const line=new Line2(geometry,material);line.computeLineDistances();return line;}
    return new T.Line(new T.BufferGeometry().setAttribute('position',new T.Float32BufferAttribute(points,3)),new T.LineBasicMaterial({color:String(layer.properties.color),transparent:true,opacity:number(layer.properties,'alpha',1)}));
  }
  private marker(m:RosMessage,layer:Layer) {
    if(![m.scale?.x,m.scale?.y,m.scale?.z,m.color?.r,m.color?.g,m.color?.b,m.color?.a].every(Number.isFinite))throw new Error('Marker scale/color 字段无效');
    if(m.points?.length>120000)throw new Error('Marker 超过 120000 点上限');
    if(m.points?.some((p:RosMessage)=>![p.x,p.y,p.z].every(Number.isFinite)))throw new Error('Marker 点坐标无效');
    if(m.type===0&&(m.points?.length??0)!==0&&m.points?.length!==2)throw new Error('Marker Arrow 需要 0 或 2 个点');
    if(m.type===9&&(m.text.length>1024||m.text.split('\n').length>12))throw new Error('Marker Text 超过 1024 字符或 12 行上限');
    const g=new T.Group();g.applyMatrix4(poseMatrix(m.pose));const color=new T.Color(m.color.r,m.color.g,m.color.b);const material=new T.MeshBasicMaterial({color,transparent:true,opacity:m.color.a*number(layer.properties,'alpha',1),side:T.DoubleSide});let object:T.Object3D;
    switch(m.type){
      case 0: {const points=m.points??[];let origin=new T.Vector3(),direction=new T.Vector3(1,0,0),length=m.scale.x;if(points.length===2){origin.set(points[0].x,points[0].y,points[0].z);direction.set(points[1].x,points[1].y,points[1].z).sub(origin);length=direction.length();direction.normalize();}object=solidArrow(direction,origin,length,points.length===2?m.scale.x:m.scale.y*.5,points.length===2?(m.scale.z>0?m.scale.z:length*.2):length*.3,m.scale.y,color);if(points.length!==2&&m.scale.y>0)object.scale.z=m.scale.z/m.scale.y;break;}
      case 1:object=new T.Mesh(new T.BoxGeometry(m.scale.x,m.scale.y,m.scale.z),material);break;
      case 2:object=new T.Mesh(new T.SphereGeometry(1,16,12),material);object.scale.set(m.scale.x/2,m.scale.y/2,m.scale.z/2);break;
      case 3:object=new T.Mesh(new T.CylinderGeometry(m.scale.x/2,m.scale.x/2,m.scale.z,16),material);object.rotation.x=Math.PI/2;if(m.scale.x>0)object.scale.z=m.scale.y/m.scale.x;else object.visible=false;break;
      case 4:case 5:case 8: {if(m.type!==8&&(m.points?.length??0)<2){material.dispose();return g;}const geometry=new T.BufferGeometry();geometry.setAttribute('position',new T.Float32BufferAttribute((m.points??[]).flatMap((p:RosMessage)=>[p.x,p.y,p.z]),3));const colors=(m.colors??[]).flatMap((c:RosMessage)=>[c.r,c.g,c.b]);if(colors.length===(m.points?.length??0)*3)geometry.setAttribute('color',new T.Float32BufferAttribute(colors,3));if(m.type===8){const points=m.points??[],hasColors=colors.length===points.length*3;const mesh=new T.InstancedMesh(new T.PlaneGeometry(m.scale.x,m.scale.y),new T.MeshBasicMaterial({color:hasColors?0xffffff:color,transparent:true,opacity:material.opacity,side:T.DoubleSide}),points.length);const matrix=new T.Matrix4(),unit=new T.Vector3(1,1,1);const setMatrices=(rotation:T.Quaternion)=>{for(let i=0;i<points.length;i++){const p=points[i];matrix.compose(new T.Vector3(p.x,p.y,p.z),rotation,unit);mesh.setMatrixAt(i,matrix);}mesh.instanceMatrix.needsUpdate=true;};setMatrices(new T.Quaternion());if(hasColors)for(let i=0;i<points.length;i++)mesh.setColorAt(i,new T.Color(colors[i*3],colors[i*3+1],colors[i*3+2]));mesh.onBeforeRender=(_renderer,_scene,camera)=>{const rotation=(mesh.parent?.getWorldQuaternion(new T.Quaternion())??new T.Quaternion()).invert().multiply(camera.getWorldQuaternion(new T.Quaternion()));setMatrices(rotation);};geometry.dispose();object=mesh;}else{const lineGeometry=m.type===5?new LineSegmentsGeometry():new LineGeometry();lineGeometry.setPositions(Array.from(geometry.getAttribute('position').array));if(colors.length===(m.points?.length??0)*3)lineGeometry.setColors(colors);const lineMaterial=new LineMaterial({color:colors.length===(m.points?.length??0)*3?0xffffff:color,vertexColors:colors.length===(m.points?.length??0)*3,linewidth:m.scale.x,worldUnits:true,transparent:true,opacity:material.opacity});lineMaterial.resolution.set(this.host.clientWidth,this.host.clientHeight);object=m.type===5?new LineSegments2(lineGeometry,lineMaterial):new Line2(lineGeometry as LineGeometry,lineMaterial);geometry.dispose();}break;}
      case 9:object=textSprite(m.text,`#${color.getHexString()}`);object.scale.multiplyScalar(m.scale.z/.2);break;
      default:material.dispose();throw new Error(`Marker 类型 ${m.type} 暂不支持`);
    }
    if(!(object instanceof T.Mesh)||m.type===8||m.type===0)material.dispose();opacity(object,m.color.a*number(layer.properties,'alpha',1));g.add(object);return g;
  }
  private robot(layer:Layer,state:State,sample:Sample|undefined,changed:boolean) {
    const resource=String(layer.properties.descriptionResource||''),xml=sample?.message.data;const key=JSON.stringify([resource,xml,layer.properties.visual,layer.properties.collision]);
    if(!resource&&!xml){this.status.set(layer.id,'等待机器人描述');return;}
    if(state.robotKey!==key&&!state.loading) {
      state.loading=true;state.robotKey=key;state.loadError=undefined;this.status.set(layer.id,'加载模型资源');
      const generation=this.generation,isLive=()=>!this.disposed&&this.states.get(layer.id)===state&&state.robotKey===key&&this.generation===generation;let pendingResources=false;
      const manager=new T.LoadingManager();manager.onStart=()=>{pendingResources=true;};manager.onLoad=()=>{pendingResources=false;if(isLive())state.loading=false;};manager.setURLModifier(url=>url.startsWith('package://')?`/api/resource?uri=${encodeURIComponent(new URL(url).href)}`:url);
      manager.onError=url=>{if(isLive()){state.loadError=`模型资源失败：${url}`;this.status.set(layer.id,state.loadError);}};
      const loader=new URDFLoader(manager);loader.workingPath=resource?resource.slice(0,resource.lastIndexOf('/')+1):'';loader.packages=(packageName:string)=>`package://${packageName}`;loader.parseVisual=!!layer.properties.visual;loader.parseCollision=!!layer.properties.collision;
      loader.loadMeshCb=(path,loading,done)=>{if(/\.(stl|dae)$/i.test(path))loader.defaultMeshLoader(path,loading,done);else{const error=new Error(`模型网格格式暂不支持：${path}`);if(isLive())state.loadError=error.message;done(new T.Group(),error);}};
      const load=async()=>{
        try{let description=xml;if(resource){if(!resource.startsWith('package://'))throw new Error('描述资源只允许 package://');const response=await fetch(`/api/resource?uri=${encodeURIComponent(resource)}`);if(!response.ok)throw new Error(`描述资源 HTTP ${response.status}`);description=await response.text();}
          if(String(description).length>4*1024*1024)throw new Error('机器人描述超过 4 MiB 上限');
          const robot=loader.parse(String(description));
          if(!isLive()){dispose(robot);return;}
          this.clear(state.root);state.links=robot.links;state.robot=new T.Group();
          for(const link of Object.values(robot.links)){for(const child of [...link.children])if((child as any).isURDFJoint)link.remove(child);link.matrixAutoUpdate=false;state.robot.add(link);}
          state.root.add(state.robot);state.loading=pendingResources;this.status.set(layer.id,pendingResources?'加载模型网格':'等待 link TF');
        }catch(e){if(isLive()){state.loading=false;state.loadError=String(e);this.status.set(layer.id,state.loadError);}}
      };void load();return;
    }
    if(!state.links||!state.robot){if(state.loadError)this.status.set(layer.id,state.loadError);return;}
    let missing=0;for(const[name,link]of Object.entries(state.links)){try{link.matrix.copy(transforms.lookup(name,this.config.fixedFrame));link.visible=true;}catch{link.visible=false;missing++;}}
    opacity(state.robot,number(layer.properties,'alpha',1),true);
    if(!state.loading)this.status.set(layer.id,state.loadError??(missing?`${missing} 个 link 缺少 TF`:'OK'));
  }
  private pick=(event:MouseEvent)=>{
    const rect=this.renderer.domElement.getBoundingClientRect(),ray=new T.Raycaster();ray.params.Points.threshold=.06;ray.setFromCamera(new T.Vector2((event.clientX-rect.left)/rect.width*2-1,-(event.clientY-rect.top)/rect.height*2+1),this.camera);
    const objects=[...this.states.values()].flatMap(s=>{const found:T.Object3D[]=[];s.root.traverse(o=>{if(o.userData.selectable)found.push(o);});return found;});
    const hit=ray.intersectObjects(objects,false)[0];if(!hit)return;
    const data=hit.object.userData.pointData as PointData;const index=hit.instanceId??hit.index??0;const layer=this.config.layers.find(l=>l.id===hit.object.userData.layerId);const xyz=data.xyz.slice(index*3,index*3+3),fixed=new T.Vector3(xyz[0],xyz[1],xyz[2]).applyMatrix4(hit.object.matrixWorld);this.onPick(`${layer?.name}: XYZ=${xyz.map(v=>v.toFixed(3)).join(', ')} (源坐标系); ${String(layer?.properties.channel??'intensity')}=${Number.isFinite(data.intensity[index])?data.intensity[index]:'无'}; Fixed=${fixed.toArray().map(v=>v.toFixed(3)).join(', ')}`);
  };
  destroy(){this.disposed=true;this.renderer.setAnimationLoop(null);this.resize.disconnect();this.controls.dispose();this.renderer.domElement.removeEventListener('click',this.pick);for(const state of this.states.values())dispose(state.root);this.states.clear();this.renderer.dispose();this.renderer.domElement.remove();}
}
