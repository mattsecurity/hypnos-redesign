import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/addons/loaders/DRACOLoader.js';
import { HDRLoader } from 'three/addons/loaders/HDRLoader.js';

const section=document.querySelector('.capture-scroll');
const stage=document.querySelector('#capture-stage');
const host=document.querySelector('#car-canvas');
const reduce=matchMedia('(prefers-reduced-motion: reduce)');
const clamp=(x,a=0,b=1)=>Math.max(a,Math.min(b,x));
const smooth=x=>{x=clamp(x);return x*x*(3-2*x);};
let renderer,scene,camera,car,plate,frame=null,current=0,target=0,ready=false,visible=false,path;
const lookPath=new THREE.CatmullRomCurve3([
 new THREE.Vector3(0,.35,0),new THREE.Vector3(0,.45,0),new THREE.Vector3(0,.5,.2),new THREE.Vector3(0,.58,1.2),new THREE.Vector3(0,.59,2.2),new THREE.Vector3(0,.59,2.2)
]);
const targetFrame=stage.querySelector('.capture-target');
const result=stage.querySelector('.capture-result');
const captions=['Un veicolo entra nel punto di controllo.','Il retro del veicolo entra nell’inquadratura.','L’immagine della targa viene acquisita e letta.'];
const labels=['Vista dall’alto','Vista posteriore','Lettura della targa'];
const kickers=['01 / IL PASSAGGIO','02 / L’INQUADRATURA','03 / IL DATO'];
let lastPhase=-1;
function measureProgress(){const r=section.getBoundingClientRect();const nav=innerWidth<=600?66:80;target=reduce.matches?1:clamp((nav-r.top)/(section.offsetHeight-stage.offsetHeight));visible=r.top<innerHeight&&r.bottom>nav;invalidate();}
function invalidate(){if(ready&&frame===null&&!document.hidden)frame=requestAnimationFrame(render);}
function resize(){if(!renderer)return;const w=host.clientWidth,h=host.clientHeight;renderer.setSize(w,h,false);camera.aspect=w/h;camera.updateProjectionMatrix();const rear=plate?.position.z||2.2;const endDistance=Math.max(.4,.54/(2*Math.tan(THREE.MathUtils.degToRad(camera.fov/2))*camera.aspect*.8));
 path=new THREE.CatmullRomCurve3([new THREE.Vector3(0,9.4,.7),new THREE.Vector3(0,7.6,3.0),new THREE.Vector3(-3.9,3.9,6.0),new THREE.Vector3(-.7,1.7,6.8),new THREE.Vector3(0,.75,rear+2.8),new THREE.Vector3(0,.59,rear+endDistance)],false,'centripetal');
 lookPath.points[4].z=rear;lookPath.points[5].z=rear;measureProgress();}
function drawPlate(){const c=document.createElement('canvas');c.width=2080;c.height=440;const ctx=c.getContext('2d');ctx.fillStyle='#edf0ec';ctx.fillRect(0,0,2080,440);ctx.fillStyle='#183f86';ctx.fillRect(0,0,155,440);ctx.fillRect(1930,0,150,440);ctx.fillStyle='#f3f6fa';ctx.font='bold 70px Arial';ctx.textAlign='center';ctx.fillText('I',78,340);ctx.fillText('I',2005,340);ctx.strokeStyle='#242b33';ctx.lineWidth=9;ctx.strokeRect(4,4,2072,432);ctx.fillStyle='#11151a';ctx.font='bold 254px Arial';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText('AA 000 AA',1040,241,1620);const tex=new THREE.CanvasTexture(c);tex.colorSpace=THREE.SRGBColorSpace;tex.anisotropy=renderer.capabilities.getMaxAnisotropy();return tex;}
async function initialize(){
 try{
 renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});renderer.setPixelRatio(Math.min(devicePixelRatio,1.8));renderer.outputColorSpace=THREE.SRGBColorSpace;renderer.toneMapping=THREE.ACESFilmicToneMapping;renderer.toneMappingExposure=.88;renderer.shadowMap.enabled=true;renderer.shadowMap.type=THREE.PCFSoftShadowMap;host.appendChild(renderer.domElement);
 scene=new THREE.Scene();scene.background=new THREE.Color('#e8eaed');camera=new THREE.PerspectiveCamera(34,1,.04,100);scene.add(new THREE.HemisphereLight(0xf8fcff,0x636c79,.8));
 const key=new THREE.DirectionalLight(0xffffff,2.8);key.position.set(-3,8,4);key.castShadow=true;key.shadow.mapSize.set(2048,2048);key.shadow.camera.left=-5;key.shadow.camera.right=5;key.shadow.camera.top=6;key.shadow.camera.bottom=-6;key.shadow.bias=-.00025;key.shadow.normalBias=.02;key.shadow.radius=3;scene.add(key);const fill=new THREE.DirectionalLight(0xd4e5ff,.9);fill.position.set(4,3,-4);scene.add(fill);
 const env=await new HDRLoader().loadAsync('assets/models/environment.hdr');env.mapping=THREE.EquirectangularReflectionMapping;scene.environment=env;scene.environmentIntensity=.85;
 const ground=new THREE.Mesh(new THREE.PlaneGeometry(100,100),new THREE.MeshStandardMaterial({color:0xe0e3e7,roughness:.95,metalness:0}));ground.rotation.x=-Math.PI/2;ground.position.y=-.018;ground.receiveShadow=true;scene.add(ground);
 const draco=new DRACOLoader();draco.setDecoderPath('vendor/draco/');draco.setDecoderConfig({type:'wasm'});const loader=new GLTFLoader();loader.setDRACOLoader(draco);
 const gltf=await loader.loadAsync('assets/models/car.glb');car=gltf.scene.children[0];car.getObjectByName('body').material=new THREE.MeshPhysicalMaterial({color:0x747c83,metalness:.65,roughness:.36,clearcoat:1,clearcoatRoughness:.12});car.getObjectByName('glass').material=new THREE.MeshPhysicalMaterial({color:0x5e6c73,metalness:.05,roughness:.09,transmission:.22,transparent:true,opacity:1,thickness:.2});
 const wheelMaterial=new THREE.MeshStandardMaterial({color:0xaab1b8,metalness:.95,roughness:.25});for(const name of ['rim_fl','rim_fr','rim_rl','rim_rr','trim']){const obj=car.getObjectByName(name);if(obj)obj.material=wheelMaterial;}
 for(const name of ['leather','interior_light','interior_dark','carpet','steering_leather']){const o=car.getObjectByName(name);if(o)o.material=new THREE.MeshStandardMaterial({color:0x292d33,roughness:.95,metalness:0});}
 const redLights=car.getObjectByName('lights_red');if(redLights)redLights.material=new THREE.MeshPhysicalMaterial({color:0x8d171b,roughness:.2,metalness:.08,clearcoat:1});
 car.traverse(o=>{if(o.isMesh){o.castShadow=true;o.receiveShadow=true;if(o.material.name==='Ferrari_Yellow'){o.material=o.material.clone();o.material.color.set(0x4e555d);}}});scene.add(car);car.updateMatrixWorld(true);const bounds=new THREE.Box3().setFromObject(car);
 plate=new THREE.Mesh(new THREE.PlaneGeometry(.54,.114),new THREE.MeshStandardMaterial({map:drawPlate(),roughness:.45,metalness:.08}));plate.position.set(0,.59,bounds.max.z+.008);plate.castShadow=false;car.add(plate);
 const surround=new THREE.Mesh(new THREE.PlaneGeometry(.566,.14),new THREE.MeshStandardMaterial({color:0x1d232a,roughness:.7}));surround.position.copy(plate.position);surround.position.z-=.001;car.add(surround);

 ready=true;stage.classList.add('is-ready');resize();current=target;render(performance.now());draco.dispose();
 }catch(error){stage.classList.add('has-error');stage.dataset.renderError=String(error.message);console.error('Car scene failed:',error);}
}
function render(){frame=null;if(!ready||document.hidden)return;current=reduce.matches?1:current+(target-current)*.13;if(Math.abs(current-target)<.00015)current=target;const p=clamp(current);const travel=1.2*(1-smooth(p/.2));car.position.z=travel;const cp=path.getPointAt(p);const lp=lookPath.getPointAt(p);const fit=innerWidth<=600?1.75+.15*smooth((p-.15)/.15):innerWidth<=1100?1.18:1;const framing=1+(fit-1)*(1-smooth((p-.6)/.25));cp.sub(lp).multiplyScalar(framing).add(lp);cp.z+=travel;lp.z+=travel;camera.position.copy(cp);camera.lookAt(lp);camera.updateMatrixWorld();scene.updateMatrixWorld();
 const phase=p<.28?0:p<.72?1:2;if(phase!==lastPhase){lastPhase=phase;stage.dataset.phase=String(phase);stage.querySelector('#capture-phase-index').textContent=`${String(phase+1).padStart(2,'0')} / 03`;stage.querySelector('#capture-phase-label').textContent=labels[phase];stage.querySelector('#capture-caption').textContent=captions[phase];stage.querySelector('.capture-kicker').textContent=kickers[phase];}
 stage.querySelector('.capture-track i').style.width=`${p*100}%`;stage.querySelector('.capture-title-wrap').style.opacity=String(1-smooth((p-.12)/.18));
 const scanOpacity=smooth((p-.74)/.05);targetFrame.style.opacity=String(scanOpacity);const worldPos=plate.getWorldPosition(new THREE.Vector3());const projected=[];for(const x of [-.285,.285])for(const y of [-.071,.071]){const v=worldPos.clone().add(new THREE.Vector3(x,y,.003)).project(camera);projected.push({x:(v.x*.5+.5)*host.clientWidth,y:(-.5*v.y+.5)*host.clientHeight});}const minX=Math.min(...projected.map(v=>v.x)),maxX=Math.max(...projected.map(v=>v.x)),minY=Math.min(...projected.map(v=>v.y)),maxY=Math.max(...projected.map(v=>v.y));Object.assign(targetFrame.style,{left:`${minX}px`,top:`${minY}px`,width:`${maxX-minX}px`,height:`${maxY-minY}px`});targetFrame.querySelector('i').style.top=`${smooth((p-.79)/.12)*100}%`;
 const resultOpacity=smooth((p-.9)/.06);result.style.opacity=String(resultOpacity);result.style.transform=`translateY(${(1-resultOpacity)*12}px)`;renderer.render(scene,camera);stage.dataset.progress=p.toFixed(3);if(visible&&Math.abs(current-target)>.00015)frame=requestAnimationFrame(render);
}
addEventListener('scroll',measureProgress,{passive:true});addEventListener('resize',resize,{passive:true});document.addEventListener('visibilitychange',invalidate);reduce.addEventListener('change',()=>{measureProgress();resize();});
if('IntersectionObserver'in window){const observer=new IntersectionObserver(entries=>{if(entries[0].isIntersecting){observer.disconnect();initialize();}},{rootMargin:'900px'});observer.observe(section);}else initialize();
