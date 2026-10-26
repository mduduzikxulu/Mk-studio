const $=s=>document.querySelector(s),AC=window.AudioContext||window.webkitAudioContext,AC0=new AC();
const LH=70,RH=28,BLK=256,DPR=window.devicePixelRatio||1,Z=[6,10,16,26,40,60,90,130,200,300,450,700];
let clips=[],bufs={},peaks={},sel=null,zi=5,pps=Z[zi],ph=0,play=null,undo=[],redo=[],nid=1,drag=null,lastDim='';
/* zoom step: 100% not 10% */
const ZOOM_STEP=100;
const S={master:100,duck:false,depth:25,reverb:false,rvWet:40},cv=$('#cv'),x=cv.getContext('2d'),wrap=$('#wrap'),clipMenu=$('#clip-menu');
const toast=t=>{const e=$('#toast');e.textContent=t;e.style.display='block';clearTimeout(toast.t);toast.t=setTimeout(()=>e.style.display='none',2600)};
const fmt=t=>{const m=Math.floor(t/60);return String(m).padStart(2,'0')+':'+(t-m*60).toFixed(1).padStart(4,'0')};
const lanes=()=>Math.max(4,Math.max(-1,...clips.map(c=>c.lane))+2),endT=()=>Math.max(0,...clips.map(c=>c.start+c.dur));
const step=()=>[.05,.1,.25,.5,1,2,5,10].find(v=>v*pps>=10)||10,snap=t=>Math.max(0,Math.round(t/step())*step()),get=id=>clips.find(c=>c.id==id);
/* Bars: real mixer-style stepped bar control.
   Steps in increments of 2 (0,2,4,6,...) so the feel is clean and consistent.
   Bars are narrow with tight gaps so the control looks like a pro mixer fader. */
function Bars(el,n,min,max,val,hot,cb){
 el.classList.add('bars');el.innerHTML='<i></i>'.repeat(n);const it=[...el.children];let v=val;
 const snap2=(raw)=>{/* round to nearest even step within [min,max] */const step2=Math.max(1,Math.round((max-min)/n));return Math.round(raw/step2)*step2};
 const paint=()=>{const k=Math.round((v-min)/(max-min)*n);it.forEach((e,i)=>e.className=(i<k?'on ':'')+(hot!=null&&min+(i+1)*(max-min)/n>hot?'hot':''))};
 const set=e=>{const r=el.getBoundingClientRect();const raw=min+(max-min)*Math.max(0,Math.min(1,(e.clientX-r.left)/r.width));v=snap2(raw);paint();cb(v)};
 el.onpointerdown=e=>{el.setPointerCapture(e.pointerId);set(e);el.onpointermove=set};el.onpointerup=()=>el.onpointermove=null;paint();return{set(a){v=a;paint()}}}
/* ── reverb impulse-response generator ───────────────────────────────────────
   Builds a synthetic room impulse response so no audio file is needed.
   decay  : how long the tail fades (seconds)
   pre    : pre-delay (seconds)                                              */
function makeIR(ctx,decay=2.0,pre=0.02){
  const sr=ctx.sampleRate,len=Math.ceil((decay+pre)*sr),buf=ctx.createBuffer(2,len,sr);
  for(let ch=0;ch<2;ch++){const d=buf.getChannelData(ch);for(let i=0;i<len;i++){const t=Math.max(0,i/sr-pre);d[i]=(i<pre*sr?0:(Math.random()*2-1))*Math.pow(1-t/decay,2.8)}}
  return buf}

const js=()=>JSON.stringify(clips);
function commit(pre){if(pre!==js()){undo.push(pre);if(undo.length>50)undo.shift();redo=[]}}
function act(fn){const pre=js();fn();commit(pre);touch()}
function go(from,to){if(!from.length)return;to.push(js());clips=JSON.parse(from.pop());if(!get(sel))sel=null;touch()}
/* audio */
const calcPeaks=b=>{const d=b.getChannelData(0),n=Math.ceil(d.length/BLK),p=new Float32Array(n);let mx=.001;for(let i=0;i<n;i++){let m=0;for(let j=i*BLK,e=Math.min(d.length,j+BLK);j<e;j+=4){const v=Math.abs(d[j]);if(v>m)m=v}p[i]=m;if(m>mx)mx=m}return p.map(v=>v/mx)};
function freeLane(s,d,l){for(;;l++)if(!clips.some(q=>q.lane==l&&q.start<s+d-.001&&q.start+q.dur>s+.001))return l}
async function addFiles(fl){for(const f of fl){try{const b=await AC0.decodeAudioData(await f.arrayBuffer()),src='s'+nid++;bufs[src]=b;peaks[src]=calcPeaks(b);
 act(()=>{const c={id:nid++,src,name:f.name.replace(/\.[^.]+$/,''),start:ph,off:0,dur:b.duration,lane:0,vol:100,voice:false,fadeIn:0,fadeOut:0};c.lane=freeLane(c.start,c.dur,0);clips.push(c);sel=c.id})}catch(e){toast('Could not read '+f.name)}}}
function activity(b){if(b._a)return b._a;const d=b.getChannelData(0),W=Math.floor(b.sampleRate*.05),n=Math.floor(d.length/W),r=new Float32Array(n);
 for(let i=0;i<n;i++){let a=0;for(let j=0;j<W;j+=2){const v=d[i*W+j];a+=v*v}r[i]=Math.sqrt(a/(W/2))}return b._a={r,th:Math.max(.008,[...r].sort((a,b)=>a-b)[Math.floor(n*.95)]*.12)}}
function duckAuto(p,t0,from){const iv=[];clips.filter(k=>k.voice).forEach(k=>{const{r,th}=activity(bufs[k.src]);for(let i=Math.floor(k.off/.05);i<Math.min(r.length,Math.ceil((k.off+k.dur)/.05));i++)if(r[i]>th){const t=k.start+i*.05-k.off;iv.push([t,t+.05])}});
 iv.sort((a,b)=>a[0]-b[0]);const m=[];iv.forEach(v=>{const l=m[m.length-1];l&&v[0]-l[1]<1?l[1]=v[1]:m.push([...v])});const lo=S.depth/100;
 m.forEach(([a,b])=>{a=a-.1-from;b=b+.05-from;if(b<0)return;a=Math.max(0,a);p.setValueAtTime(1,t0+a);p.linearRampToValueAtTime(lo,t0+a+.2);p.setValueAtTime(lo,t0+b+.2);p.linearRampToValueAtTime(1,t0+b+.8)})}
function build(c,t0,from){const out=c.createGain(),vb=c.createGain(),mb=c.createGain();out.gain.value=S.master/100;
 if(S.master>100){const l=c.createDynamicsCompressor();l.threshold.value=-4;l.knee.value=0;l.ratio.value=20;l.attack.value=.002;l.release.value=.12;out.connect(l).connect(c.destination)}else out.connect(c.destination);
 /* ── reverb wet/dry bus ── */
 let clipDest;
 if(S.reverb){const conv=c.createConvolver();conv.buffer=makeIR(c);const wet=c.createGain(),dry=c.createGain();const w=S.rvWet/100;wet.gain.value=w;dry.gain.value=1-w;const pre=c.createGain();pre.connect(conv).connect(wet).connect(out);pre.connect(dry).connect(out);clipDest=pre}else clipDest=out;
 vb.connect(clipDest);mb.connect(clipDest);let end=0;
 clips.forEach(k=>{const e=k.start+k.dur;end=Math.max(end,e);if(e<=from)return;const s=c.createBufferSource(),g=c.createGain(),sk=Math.max(0,from-k.start);s.buffer=bufs[k.src];g.gain.value=k.vol/100;
  /* ── per-clip fade in / fade out ── */
  const fi=k.fadeIn||0,fo=k.fadeOut||0,clipStart=t0+Math.max(0,k.start-from),clipEnd=t0+Math.max(0,e-from);
  if(fi>0){const fs=Math.max(clipStart,t0+Math.max(0,k.start-from)),fe=fs+Math.max(0,fi-Math.max(0,from-k.start));if(fe>fs){g.gain.setValueAtTime(0,fs);g.gain.linearRampToValueAtTime(k.vol/100,fe)}}
  if(fo>0){const fe=clipEnd,fs=Math.max(clipStart,fe-fo);if(fe>fs){g.gain.setValueAtTime(k.vol/100,fs);g.gain.linearRampToValueAtTime(0,fe)}}
  s.connect(g).connect(k.voice?vb:mb);s.start(t0+Math.max(0,k.start-from),k.off+sk,k.dur-sk)});
 if(S.duck)duckAuto(mb.gain,t0,from);return end}
function start(){stop(true);if(!clips.length)return toast('Add some audio first');const c=new AC(),t0=c.currentTime+.05,end=build(c,t0,ph>=endT()?0:ph),from=ph>=endT()?0:ph;play={c};
 $('#play').textContent='Pause';(function tick(){if(!play||play.c!==c)return;ph=from+Math.max(0,c.currentTime-t0);if(ph>=end){ph=end;stop();return}scrollTo();draw();$('#tc').textContent=fmt(ph);requestAnimationFrame(tick)})()}
function stop(keep){if(play){play.c.close();play=null}$('#play').textContent='Play';if(!keep){draw();$('#tc').textContent=fmt(ph)}}
function scrollTo(){const px=ph*pps,sc=wrap.scrollLeft,w=wrap.clientWidth;if(px>sc+w-40||px<sc)wrap.scrollLeft=Math.max(0,px-60)}
/* edit actions */
function seam(){for(const a of clips)for(const b of clips)if(a!==b&&a.src==b.src&&a.lane==b.lane&&Math.abs(a.start+a.dur-b.start)<.02&&Math.abs(a.off+a.dur-b.off)<.02&&Math.abs(ph-b.start)<.03)return[a,b]}
function doSplit(){const sm=seam();act(()=>{if(sm){sm[0].dur+=sm[1].dur;clips=clips.filter(c=>c!==sm[1]);sel=sm[0].id}else{const under=c=>ph>c.start+.02&&ph<c.start+c.dur-.02,s=get(sel),tg=s&&under(s)?[s]:clips.filter(under);
 tg.forEach(c=>{const d=ph-c.start,n={...c,id:nid++,start:ph,off:c.off+d,dur:c.dur-d};c.dur=d;clips.push(n);if(c.id==sel)sel=n.id})}})}
function doDup(id=sel){const c=get(id);if(!c)return;act(()=>{const n={...c,id:nid++,start:c.start+c.dur};n.lane=freeLane(n.start,n.dur,c.lane);clips.push(n);sel=n.id})}
function toWav(b){const n=b.length,I=new Int16Array(n*2),L=b.getChannelData(0),R=b.getChannelData(1);for(let i=0;i<n;i++){I[2*i]=Math.max(-1,Math.min(1,L[i]))*32767;I[2*i+1]=Math.max(-1,Math.min(1,R[i]))*32767}
 const h=new DataView(new ArrayBuffer(44)),w=(o,s)=>[...s].forEach((c,i)=>h.setUint8(o+i,c.charCodeAt(0)));w(0,'RIFF');h.setUint32(4,36+n*4,true);w(8,'WAVEfmt ');h.setUint32(16,16,true);h.setUint16(20,1,true);h.setUint16(22,2,true);h.setUint32(24,b.sampleRate,true);h.setUint32(28,b.sampleRate*4,true);h.setUint16(32,4,true);h.setUint16(34,16,true);w(36,'data');h.setUint32(40,n*4,true);return new Blob([h,I],{type:'audio/wav'})}
function toMp3(b){const e=new lamejs.Mp3Encoder(2,b.sampleRate,192),cv=a=>{const o=new Int16Array(a.length);for(let i=0;i<a.length;i++)o[i]=Math.max(-1,Math.min(1,a[i]))*32767;return o},L=cv(b.getChannelData(0)),R=cv(b.getChannelData(1)),o=[];
 for(let i=0;i<L.length;i+=1152){const d=e.encodeBuffer(L.subarray(i,i+1152),R.subarray(i,i+1152));if(d.length)o.push(d)}o.push(e.flush());return new Blob(o,{type:'audio/mpeg'})}
async function exportMix(f){if(!clips.length)return toast('Nothing to export yet');if(f=='mp3'&&!window.lamejs)return toast('MP3 encoder did not load. Check your internet or use WAV.');
 stop();$('#xs').textContent='Rendering...';await new Promise(r=>setTimeout(r,20));const oc=new OfflineAudioContext(2,Math.ceil((endT()+.05)*44100),44100);build(oc,0,0);const b=await oc.startRendering();
 const u=URL.createObjectURL(f=='wav'?toWav(b):toMp3(b)),a=document.createElement('a');a.href=u;a.download='studio-mix.'+f;a.click();$('#xs').textContent='Done. Saved studio-mix.'+f}
/* canvas */
function layout(){const w=wrap.clientWidth,h=RH+lanes()*LH,d=w+'x'+h;if(d!=lastDim){lastDim=d;cv.style.width=w+'px';cv.style.height=h+'px';cv.width=w*DPR;cv.height=h*DPR}$('#sp').style.width=Math.max(w,(endT()+14)*pps)+'px'}
function draw(){const w=cv.clientWidth,h=cv.clientHeight,sc=wrap.scrollLeft;x.setTransform(DPR,0,0,DPR,0,0);x.fillStyle='#14161a';x.fillRect(0,0,w,h);
 for(let l=0;l<lanes();l++){x.fillStyle=l%2?'#171a1f':'#1a1d23';x.fillRect(0,RH+l*LH,w,LH)}
 const s=step(),k=Math.ceil(72/(s*pps));x.font='11px Manrope,sans-serif';x.textBaseline='top';
 /* grid lines — crisp, low-visibility, labels only when they have room */
 let lastLabelX=-999;
 for(let i=Math.floor(sc/pps/s);i<=(sc+w)/pps/s;i++){
  /* use Math.floor+0.5 only when pps is large enough to matter; at low zoom just floor to avoid sub-pixel jaggies */
  const rawPx=i*s*pps-sc,px=pps>=16?Math.floor(rawPx)+0.5:Math.floor(rawPx),mj=i%k==0;
  x.strokeStyle=mj?'rgba(55,62,76,0.28)':'rgba(30,35,44,0.18)';x.lineWidth=1;
  x.beginPath();x.moveTo(px,mj?8:RH-4);x.lineTo(px,h);x.stroke();
  /* only draw the label when there's at least 52px since the last one */
  if(mj&&px-lastLabelX>52){x.fillStyle='#5a6270';x.fillText(fmt(i*s),px+3,7);lastLabelX=px}}
 clips.forEach(c=>{const x0=c.start*pps-sc,cw=c.dur*pps;if(x0>w||x0+cw<0)return;const y0=RH+c.lane*LH+4,ch=LH-8,pk=peaks[c.src],B=BLK/bufs[c.src].sampleRate;
  x.save();x.beginPath();x.rect(x0,y0,cw,ch);x.clip();x.fillStyle='#1c3a3f';x.fillRect(x0,y0,cw,ch);x.fillStyle='#5eead4';const mid=y0+ch/2;
  /* waveform bars: really small — 2px wide, 1px gap, max height half the clip height */
  for(let i=Math.max(0,Math.floor(-x0/3));i<Math.min(cw/3,(w-x0)/3+1);i++){const ts=c.off+i*3/pps,te=ts+3/pps;let m=0;for(let j=Math.floor(ts/B);j<=Math.min(pk.length-1,Math.floor(te/B));j++)if(pk[j]>m)m=pk[j];const bh=Math.max(1,m*(ch*0.38));x.fillRect(x0+i*3,mid-bh/2,2,bh)}
  x.fillStyle='#eafffb';x.fillText((c.voice?'[voice] ':'')+c.name,Math.max(x0,0)+6,y0+3);
  /* ── fade in/out gradient overlays ── */
  if(c.fadeIn>0){const fw=Math.min(c.fadeIn*pps,cw);const gi=x.createLinearGradient(x0,0,x0+fw,0);gi.addColorStop(0,'rgba(20,22,26,0.85)');gi.addColorStop(1,'rgba(20,22,26,0)');x.fillStyle=gi;x.fillRect(x0,y0,fw,ch)}
  if(c.fadeOut>0){const fw=Math.min(c.fadeOut*pps,cw);const go=x.createLinearGradient(x0+cw-fw,0,x0+cw,0);go.addColorStop(0,'rgba(20,22,26,0)');go.addColorStop(1,'rgba(20,22,26,0.85)');x.fillStyle=go;x.fillRect(x0+cw-fw,y0,fw,ch)}
  x.restore();
  if(c.id==sel){x.strokeStyle='#ffb020';x.lineWidth=2;x.strokeRect(x0+1,y0+1,cw-2,ch-2);x.lineWidth=1;x.fillStyle='#ffb020';x.fillRect(x0,y0+ch/2-10,5,20);x.fillRect(x0+cw-5,y0+ch/2-10,5,20)}});
 if(!clips.length){x.fillStyle='#8f97a6';x.font='16px Manrope,sans-serif';x.textAlign='center';x.fillText('Drop audio files here, or press Add audio',w/2,RH+LH*1.4);x.textAlign='left'}
 const px=ph*pps-sc;x.fillStyle='#ffb020';x.fillRect(px-1,0,2,h);x.beginPath();x.moveTo(px-6,0);x.lineTo(px+6,0);x.lineTo(px,9);x.fill()}
function touch(){layout();const s=get(sel),sm=seam();$('#split').textContent=sm?'Join':'Trim here';$('#voice').textContent=s&&s.voice?'Unmark voice':'Mark as voice';
 ['dup','del','voice'].forEach(i=>$('#'+i).disabled=!s);$('#undo').disabled=!undo.length;$('#redo').disabled=!redo.length;$('#cn').textContent=s?s.name:'Click a clip to select it';cvb.set(s?s.vol:100);$('#cvl').textContent='Clip volume '+(s?s.vol:100)+'%';
 /* fade controls */
 const fi=s?s.fadeIn||0:0,fo=s?s.fadeOut||0:0;fib.set(fi);$('#fil').textContent=fi.toFixed(1)+' s';fob.set(fo);$('#fol').textContent=fo.toFixed(1)+' s';
 ['fib','fob'].forEach(id=>document.getElementById(id).style.opacity=s?'1':'0.35');
 $('#tc').textContent=fmt(ph);draw();if(play){const p=ph;start()}}
/* pointer */
function hit(e){const r=cv.getBoundingClientRect(),px=e.clientX-r.left,py=e.clientY-r.top,sc=wrap.scrollLeft;if(py<RH)return{px,py,ruler:1};const l=Math.floor((py-RH)/LH);
 for(const c of [...clips].reverse()){const x0=c.start*pps-sc,cw=c.dur*pps;if(c.lane==l&&px>=x0&&px<=x0+cw)return{px,py,c,mode:px-x0<8?'l':x0+cw-px<8?'r':'m'}}return{px,py,empty:1}}
function closeClipMenu(){clipMenu.hidden=true}
function showClipMenu(e){const h=hit(e);if(!h.c){closeClipMenu();return}e.preventDefault();sel=h.c.id;ph=snap((h.px+wrap.scrollLeft)/pps);touch();
 clipMenu.querySelector('[data-action="split"]').textContent=seam()?'Join here':'Trim here';clipMenu.querySelector('[data-action="voice"]').textContent=h.c.voice?'Unmark as voice':'Mark as voice';
 clipMenu.hidden=false;clipMenu.style.left='0px';clipMenu.style.top='0px';const r=clipMenu.getBoundingClientRect();clipMenu.style.left=Math.max(8,Math.min(e.clientX,innerWidth-r.width-8))+'px';clipMenu.style.top=Math.max(8,Math.min(e.clientY,innerHeight-r.height-8))+'px';clipMenu.dataset.time=String(ph)}
cv.oncontextmenu=showClipMenu;
document.addEventListener('pointerdown',e=>{if(!clipMenu.hidden&&!clipMenu.contains(e.target))closeClipMenu()});
clipMenu.addEventListener('click',e=>{const b=e.target.closest('[data-action]');if(!b)return;const action=b.dataset.action;closeClipMenu();
 if(action==='split'){ph=Number(clipMenu.dataset.time);touch();doSplit()}else if(action==='duplicate')doDup();else if(action==='voice')$('#voice').click();else if(action==='delete')$('#del').click()});
cv.onpointerdown=e=>{if(e.button!==0)return;cv.setPointerCapture(e.pointerId);const h=hit(e),t=(h.px+wrap.scrollLeft)/pps;
 if(h.c){sel=h.c.id;drag={mode:h.mode,pre:js(),o:{...h.c},t};touch()}else{if(h.empty)sel=null;ph=snap(t);drag={mode:'scrub'};touch()}};
cv.onpointermove=e=>{const h=hit(e),t=(h.px+wrap.scrollLeft)/pps;if(!drag){cv.style.cursor=h.c?(h.mode=='m'?'grab':'ew-resize'):'default';return}
 if(drag.mode=='scrub'){ph=snap(t);$('#tc').textContent=fmt(ph);draw();return}const c=get(sel),o=drag.o,b=bufs[c.src];
 if(drag.mode=='m'){c.start=snap(o.start+t-drag.t);c.lane=Math.max(0,Math.min(11,Math.floor((h.py-RH)/LH)))}
 else if(drag.mode=='l'){let d=snap(t)-o.start;d=Math.max(-o.off,Math.min(o.dur-.05,d));c.start=o.start+d;c.off=o.off+d;c.dur=o.dur-d}
 else c.dur=Math.max(.05,Math.min(b.duration-o.off,snap(t)-o.start));layout();draw()};
cv.onpointerup=()=>{if(drag&&drag.pre){commit(drag.pre);touch()}else touch();drag=null};cv.ondblclick=e=>{const h=hit(e);if(h.c)doDup(h.c.id)};
wrap.onscroll=draw;addEventListener('resize',()=>{layout();draw()});
function zoom(n,ax){n=Math.max(0,Math.min(Z.length-1,n));const at=(wrap.scrollLeft+ax)/pps;zi=n;pps=Z[zi];zb.set(zi);layout();wrap.scrollLeft=at*pps-ax;draw()}
wrap.addEventListener('wheel',e=>{if(e.ctrlKey||e.metaKey){e.preventDefault();zoom(zi+(e.deltaY<0?1:-1),e.clientX-wrap.getBoundingClientRect().left)}},{passive:false});
/* controls */
/* controls: 50 bars on volumes for smooth mixer feel, step-of-2 from Bars() */
let vp=null;const zb=Bars($('#zb'),Z.length-1,0,Z.length-1,zi,null,v=>zoom(Math.round(v),wrap.clientWidth/2));
const cvb=Bars($('#cvb'),50,0,200,100,100,v=>{const c=get(sel);if(!c)return;if(vp===null)vp=js();c.vol=v;$('#cvl').textContent='Clip volume '+v+'%'});$('#cvb').addEventListener('pointerup',()=>{if(vp!==null){commit(vp);vp=null;touch()}});
/* fade in / fade out bars — max 8 s, 20 steps of 0.4 s each */
let fp=null;
const fib=Bars($('#fib'),20,0,8,0,null,v=>{const c=get(sel);if(!c)return;if(fp===null)fp=js();c.fadeIn=v;$('#fil').textContent=v.toFixed(1)+' s';draw()});
$('#fib').addEventListener('pointerup',()=>{if(fp!==null){commit(fp);fp=null;touch()}});
const fob=Bars($('#fob'),20,0,8,0,null,v=>{const c=get(sel);if(!c)return;if(fp===null)fp=js();c.fadeOut=v;$('#fol').textContent=v.toFixed(1)+' s';draw()});
$('#fob').addEventListener('pointerup',()=>{if(fp!==null){commit(fp);fp=null;touch()}});
Bars($('#mb'),50,0,200,100,100,v=>{S.master=v;$('#ml').textContent='Master '+v+'%'});$('#mb').addEventListener('pointerup',()=>play&&start());
Bars($('#db'),20,5,80,25,null,v=>{S.depth=v;$('#dl').textContent=S.duck?'Music drops to '+v+'% while the voice speaks.':'Off: music plays at a steady level.'});
$('#duck').onchange=e=>{S.duck=e.target.checked;$('#dl').textContent=S.duck?'Mark a clip as voice, then music drops to '+S.depth+'% while it speaks.':'Off: music plays at a steady level.';if(play)start()};
/* reverb controls */
Bars($('#rvb'),20,0,100,40,null,v=>{S.rvWet=v;$('#rvl').textContent=S.reverb?'Reverb wet '+v+'% — more = wetter room.':'Off: dry signal only.';if(play)start()});
$('#rv-on').onchange=e=>{S.reverb=e.target.checked;$('#rvl').textContent=S.reverb?'Reverb wet '+S.rvWet+'% — adjust the bar for room size.':'Off: dry signal only.';if(play)start()};
$('#add').onclick=()=>$('#file').click();$('#file').onchange=e=>{addFiles(e.target.files);e.target.value=''};
addEventListener('dragover',e=>e.preventDefault());addEventListener('drop',e=>{e.preventDefault();addFiles(e.dataTransfer.files)});
$('#undo').onclick=()=>go(undo,redo);$('#redo').onclick=()=>go(redo,undo);$('#split').onclick=doSplit;$('#dup').onclick=()=>doDup();
$('#del').onclick=()=>act(()=>{clips=clips.filter(c=>c.id!=sel);sel=null});$('#voice').onclick=()=>act(()=>{const c=get(sel);c.voice=!c.voice});
$('#zi').onclick=()=>{/* zoom in 100% */const newPps=pps*2;let n=zi;Z.forEach((v,i)=>{if(v<=newPps)n=i});zoom(Math.min(Z.length-1,n+1),wrap.clientWidth/2)};
$('#zo').onclick=()=>{/* zoom out 100% */const newPps=pps/2;let n=0;Z.forEach((v,i)=>{if(v>=newPps&&n==0)n=i});zoom(Math.max(0,n-1<0?0:n-1),wrap.clientWidth/2)};
$('#fit').onclick=()=>{const t=Math.max(endT(),5),want=(wrap.clientWidth-30)/t;let n=0;Z.forEach((v,i)=>{if(v<=want)n=i});zoom(n,0);wrap.scrollLeft=0;draw()};
$('#play').onclick=()=>play?stop():start();$('#stop').onclick=()=>{stop();ph=0;wrap.scrollLeft=0;touch()};$('#xw').onclick=()=>exportMix('wav');$('#xm').onclick=()=>exportMix('mp3');
addEventListener('keydown',e=>{if(/INPUT|TEXTAREA/.test(e.target.tagName)&&e.target.type!='checkbox')return;const k=e.key.toLowerCase(),m=e.ctrlKey||e.metaKey;
 if(m&&k=='z'){e.preventDefault();go(e.shiftKey?redo:undo,e.shiftKey?undo:redo)}else if(m&&k=='y'){e.preventDefault();go(redo,undo)}
 else if(k==' '){e.preventDefault();play?stop():start()}else if(k=='s'&&!m)doSplit();else if(k=='d'&&!m)doDup();else if((k=='delete'||k=='backspace')&&sel)$('#del').click()});
layout();touch();
