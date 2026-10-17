import os
OUT = r"c:\Users\mdudu\Downloads\studio\static\index.html"

p3 = '''
<script src="https://cdnjs.cloudflare.com/ajax/libs/lamejs/1.2.1/lame.min.js"></script>
<script>
"use strict";
const $=s=>document.querySelector(s), $$=s=>[...document.querySelectorAll(s)];

/* ---- LANDING ---- */
function openApp(tab){
  document.getElementById("page-home").style.display="none";
  document.getElementById("app-shell").style.display="flex";
  $$("[data-tab]").forEach(b=>b.classList.toggle("on",b.dataset.tab===tab));
  $$(".inner-page").forEach(p=>p.classList.toggle("on",p.id==="page-"+tab));
  if(tab!=="mix") document.getElementById("transport").style.display="none";
  else document.getElementById("transport").style.display="flex";
}
function goHome(){
  document.getElementById("page-home").style.display="block";
  document.getElementById("app-shell").style.display="none";
  stopPlay(); seekPos=0; updateSeekUI(0);
}
$$("[data-tab]").forEach(b=>b.onclick=()=>{
  $$("[data-tab]").forEach(x=>x.classList.toggle("on",x===b));
  $$(".inner-page").forEach(p=>p.classList.toggle("on",p.id==="page-"+b.dataset.tab));
  document.getElementById("transport").style.display=b.dataset.tab==="mix"?"flex":"none";
});

/* ---- ANIMATED BARS (landing) ---- */
function buildBars(){
  const bg=document.getElementById("bars-bg"); if(!bg)return;
  const COLORS=["#7c5cff","#2de2c5","#ff4d6d","#ffd166","#5b9cf6"];
  const N=80;
  for(let i=0;i<N;i++){
    const b=document.createElement("div");
    b.className="bar-item";
    const c=COLORS[i%COLORS.length];
    b.style.cssText="background:"+c+";animation-duration:"+(0.6+Math.random()*1.2).toFixed(2)+"s;animation-delay:"+(Math.random()*0.8).toFixed(2)+"s;animation-name:barAnim;animation-timing-function:ease-in-out;animation-iteration-count:infinite;animation-direction:alternate;transform-origin:bottom";
    bg.appendChild(b);
  }
  function buildMini(id,col){
    const el=document.getElementById(id); if(!el)return;
    const heights=[0.3,0.6,0.9,0.5,0.8,0.4,1,0.7,0.3,0.6,0.5,0.9,0.4,0.7];
    heights.forEach(h=>{
      const d=document.createElement("div");
      d.className="mb";
      d.style.cssText="width:5px;height:"+Math.round(h*36)+"px;background:"+col;
      el.appendChild(d);
    });
  }
  buildMini("mini1","#7c5cff"); buildMini("mini2","#2de2c5"); buildMini("mini3","#ff4d6d");
}
buildBars();

/* ---- AUDIO ENGINE ---- */
const decCtx=new(window.AudioContext||window.webkitAudioContext)();
const COLORS_T=["#7c5cff","#2de2c5","#ff6b9d","#ffd166","#5b9cf6"];
const MAX_TRACKS=5;
const SNAP_STEPS=200; // grid divisions across timeline

let TRACKS=[];
function mkTrack(extra){
  return Object.assign({buf:null,start:0,end:0,offset:0,vol:1,mute:false,color:COLORS_T[TRACKS.length%COLORS_T.length]},extra||{});
}

/* ---- HISTORY (15 steps) ---- */
let HIST=[], HIST_IDX=-1;
const MAX_HIST=15;
function snapshot(){
  const s=TRACKS.map(t=>({buf:t.buf,start:t.start,end:t.end,offset:t.offset,vol:t.vol,mute:t.mute,color:t.color}));
  HIST=HIST.slice(0,HIST_IDX+1);
  HIST.push(s);
  if(HIST.length>MAX_HIST) HIST.shift();
  HIST_IDX=HIST.length-1;
  syncHistBtns();
}
function undo(){
  if(HIST_IDX<=0)return;
  HIST_IDX--;
  restoreSnap(HIST[HIST_IDX]);
}
function redo(){
  if(HIST_IDX>=HIST.length-1)return;
  HIST_IDX++;
  restoreSnap(HIST[HIST_IDX]);
}
function restoreSnap(s){
  TRACKS=s.map(t=>Object.assign({},t));
  buildDOM();
  syncHistBtns();
}
function syncHistBtns(){
  document.getElementById("btn-undo").disabled=HIST_IDX<=0;
  document.getElementById("btn-redo").disabled=HIST_IDX>=HIST.length-1;
}
document.getElementById("btn-undo").onclick=undo;
document.getElementById("btn-redo").onclick=redo;

/* ---- OPTIONS ---- */
const O=()=>({duck:+$("#duck").value/100,auto:$("#opt-duck").checked,loop:$("#opt-loop").checked});
let zoomLevel=1;
document.getElementById("zoom").oninput=function(){
  zoomLevel=+this.value;
  document.getElementById("zoom-lbl").textContent=zoomLevel.toFixed(1)+"x";
  drawAll();
};

/* ---- SNAP ---- */
function snap(time,dur){
  if(!dur)return time;
  const step=dur/SNAP_STEPS;
  return Math.round(time/step)*step;
}

/* ---- PROJECT DURATION ---- */
function projectDuration(){
  const loaded=TRACKS.filter(t=>t.buf);
  if(!loaded.length)return 0;
  return Math.max(...loaded.map(t=>t.offset+(t.end-t.start)));
}
function visibleDuration(){
  const d=projectDuration();
  return d>0?d/zoomLevel:0;
}

/* ---- TRIM MODE ---- */
let trimMode=false,trimPhase=0;
const btnTrim=document.getElementById("btn-trim");
btnTrim.onclick=()=>{trimMode=!trimMode;trimPhase=0;btnTrim.classList.toggle("on",trimMode);};

/* ---- DOM BUILD ---- */
function buildDOM(){
  const sidebar=document.getElementById("sidebar");
  const timeline=document.getElementById("timeline");
  const ph=document.getElementById("playhead");
  sidebar.innerHTML=""; timeline.innerHTML=""; timeline.appendChild(ph);

  TRACKS.forEach((t,ti)=>{
    // sidebar
    const sr=document.createElement("div"); sr.className="track-sidebar";
    sr.innerHTML=
      "<div class='tname-row'><span class='tname' id='tn-"+ti+"'>Track "+(ti+1)+"</span>"+
      "<button class='icon-btn"+(t.mute?" on":"")+"' data-mute='"+ti+"' title='Mute'>"+icoMute(t.mute)+"</button>"+
      "<button class='icon-btn' data-dup='"+ti+"' title='Duplicate'>"+icoDup()+"</button>"+
      "</div>"+
      "<div class='tcontrols'>"+
      "<input class='tvol' type='range' min='0' max='150' value='"+Math.round(t.vol*100)+"' data-vol='"+ti+"' title='Volume'>"+
      "</div>";
    sidebar.appendChild(sr);

    sr.querySelector("[data-mute]").onclick=function(){
      snapshot(); t.mute=!t.mute; this.classList.toggle("on",t.mute); this.innerHTML=icoMute(t.mute); drawTrack(ti);
      if(live)play();
    };
    sr.querySelector("[data-dup]").onclick=function(){
      if(TRACKS.length>=MAX_TRACKS)return;
      snapshot();
      TRACKS.splice(ti+1,0,Object.assign({},t,{color:COLORS_T[(ti+1)%COLORS_T.length]}));
      buildDOM();
    };
    sr.querySelector("[data-vol]").oninput=function(){t.vol=this.value/100;if(live)play();};

    // lane
    const lane=document.createElement("div"); lane.className="track-lane"; lane.id="lane-"+ti;
    if(!t.buf){
      const em=document.createElement("div"); em.className="lane-empty";
      em.innerHTML=icoPlus()+" Drop audio here or click";
      em.onclick=()=>pickFile(ti);
      em.ondragover=ev=>{ev.preventDefault();em.classList.add("over")};
      em.ondragleave=()=>em.classList.remove("over");
      em.ondrop=ev=>{ev.preventDefault();em.classList.remove("over");loadFile(ti,ev.dataTransfer.files[0])};
      lane.appendChild(em);
    } else {
      const c=document.createElement("canvas"); lane.appendChild(c);
      const tip=document.createElement("div"); tip.className="wave-tip"; lane.appendChild(tip);
      setupCanvas(ti,c,tip);
    }
    timeline.appendChild(lane);
  });

  if(TRACKS.length<MAX_TRACKS){
    const ar=document.createElement("div"); ar.className="add-track-row";
    ar.innerHTML="<button class='add-btn-sm'>"+icoPlus()+" Add track</button>";
    ar.querySelector("button").onclick=addTrack;
    sidebar.appendChild(ar);
    const al=document.createElement("div"); al.className="add-lane";
    al.innerHTML=icoPlus()+" Add track or drop here";
    al.onclick=addTrack;
    al.ondragover=ev=>{ev.preventDefault();al.classList.add("over")};
    al.ondragleave=()=>al.classList.remove("over");
    al.ondrop=ev=>{ev.preventDefault();al.classList.remove("over");addTrack();loadFile(TRACKS.length-1,ev.dataTransfer.files[0])};
    timeline.appendChild(al);
  }
  drawAll(); updateReady();
}

function addTrack(){if(TRACKS.length<MAX_TRACKS){snapshot();TRACKS.push(mkTrack());buildDOM();}}

function pickFile(ti){
  const inp=document.createElement("input");inp.type="file";inp.accept="audio/*";
  inp.onchange=()=>loadFile(ti,inp.files[0]);inp.click();
}
document.getElementById("btn-add").onclick=addTrack;

async function loadFile(ti,f){
  if(!f||ti>=TRACKS.length)return;
  const t=TRACKS[ti];
  const el=document.getElementById("tn-"+ti); if(el)el.textContent="Loading...";
  try{
    const buf=await decCtx.decodeAudioData(await f.arrayBuffer());
    snapshot();
    t.buf=buf;t.start=0;t.end=buf.duration;t.offset=0;
    if(el)el.textContent=f.name.replace(/\\.[^.]+$/,"");
    buildDOM();
  }catch(_){ if(el)el.textContent="Error"; }
}

/* ---- CANVAS ---- */
const drags={};
const SNAP_PX=4; // pixels per snap grid cell

function setupCanvas(ti,c,tip){
  const t=TRACKS[ti];
  c.style.cursor=trimMode?"crosshair":"default";

  c.onpointermove=ev=>{
    const rect=c.getBoundingClientRect();
    const dur=projectDuration(); if(!dur)return;
    const vdur=dur/zoomLevel;
    const xFrac=Math.max(0,Math.min(1,(ev.clientX-rect.left)/rect.width));
    const rawTime=xFrac*vdur;
    const time=snap(rawTime,vdur);
    tip.style.left=Math.min(rect.width-52,ev.clientX-rect.left)+"px";
    tip.style.display="block"; tip.textContent=fmtMs(time);

    if(!drags[ti])return;
    ev.preventDefault();
    const d=drags[ti];
    const delta=snap(time-d.atTime,vdur);
    if(d.mode==="in"){
      const ni=Math.max(0,Math.min(d.origEnd-0.02,d.origIn+delta));
      t.start=ni;
    }else if(d.mode==="out"){
      const no=Math.max(d.origIn+0.02,Math.min(t.buf.duration,d.origEnd+delta));
      t.end=no;
    }else{
      t.offset=Math.max(0,snap(d.origOffset+delta,vdur));
    }
    drawAll(); updateSeekUI();
  };
  c.onpointerleave=()=>{ tip.style.display="none"; };

  c.onpointerdown=ev=>{
    if(!t.buf)return;
    ev.preventDefault(); c.setPointerCapture(ev.pointerId);
    const rect=c.getBoundingClientRect();
    const dur=projectDuration(); if(!dur)return;
    const vdur=dur/zoomLevel;
    const xPx=ev.clientX-rect.left;
    const xFrac=Math.max(0,Math.min(1,xPx/rect.width));
    const rawTime=xFrac*vdur;
    const time=snap(rawTime,vdur);

    if(trimMode){
      snapshot();
      if(trimPhase===0){ t.start=Math.max(0,Math.min(t.end-0.02,time-t.offset)); trimPhase=1; }
      else { t.end=Math.max(t.start+0.02,Math.min(t.buf.duration,time-t.offset)); trimPhase=0; }
      drawAll(); updateSeekUI(); return;
    }

    const clipStart=t.offset, clipEnd=t.offset+(t.end-t.start);
    const inPx=(clipStart/vdur)*rect.width, outPx=(clipEnd/vdur)*rect.width;
    const THRESH=14;
    let mode;
    if(Math.abs(xPx-inPx)<THRESH)mode="in";
    else if(Math.abs(xPx-outPx)<THRESH)mode="out";
    else if(time>clipStart&&time<clipEnd)mode="move";
    else mode=xPx<(inPx+outPx)/2?"in":"out";

    snapshot();
    drags[ti]={mode,atTime:time,origIn:t.start,origEnd:t.end,origOffset:t.offset};
  };
  c.onpointerup=c.onpointercancel=()=>{ drags[ti]=null; };
}

/* ---- DRAW ---- */
let rafDraw=0;
function schedDraw(){ if(!rafDraw) rafDraw=requestAnimationFrame(()=>{ rafDraw=0; _drawAll(); }); }
function drawAll(){ schedDraw(); }

function _drawAll(){
  TRACKS.forEach((_,i)=>_drawTrack(i));
  drawRuler(); updatePlayhead();
}
function drawTrack(ti){ schedDraw(); }

function _drawTrack(ti){
  const t=TRACKS[ti];
  const lane=document.getElementById("lane-"+ti); if(!lane)return;
  const c=lane.querySelector("canvas"); if(!c||!t.buf)return;
  const dpr=window.devicePixelRatio||1;
  const W=lane.clientWidth||600, H=t.constructor===Object?60:lane.clientHeight||60;
  const TH=60;
  c.width=Math.round(W*dpr); c.height=Math.round(TH*dpr);
  const ctx=c.getContext("2d"); ctx.scale(dpr,dpr);
  ctx.clearRect(0,0,W,TH);

  const dur=projectDuration(); if(!dur)return;
  const vdur=dur/zoomLevel;

  const clipStart=t.offset, clipLen=t.end-t.start, clipEnd=clipStart+clipLen;
  const ax=(clipStart/vdur)*W, bx=(clipEnd/vdur)*W;

  // bg
  ctx.fillStyle=t.mute?"#ffffff05":"#ffffff04";
  ctx.fillRect(0,0,W,TH);

  // clip bg
  ctx.fillStyle=t.mute?"#ffffff0a":(t.color+"1a");
  ctx.fillRect(ax,0,bx-ax,TH);

  if(!t.mute){
    // SNAPPED bars — draw as discrete columns of width SNAP_W
    const SNAP_W=Math.max(2,Math.floor(W/SNAP_STEPS));
    const data=t.buf.getChannelData(0), sr=t.buf.sampleRate;
    ctx.fillStyle=t.color;
    for(let step=0;step<SNAP_STEPS;step++){
      const tl_t=(step/SNAP_STEPS)*vdur;
      if(tl_t<clipStart||tl_t>clipEnd)continue;
      const clipT=tl_t-clipStart, bufT=t.start+clipT;
      const center=Math.floor(bufT*sr);
      const span=Math.max(1,Math.floor(sr*vdur/SNAP_STEPS));
      let peak=0;
      for(let j=center;j<Math.min(data.length,center+span);j+=Math.max(1,Math.floor(span/8)))
        peak=Math.max(peak,Math.abs(data[j]||0));
      const hh=Math.round(peak*TH*0.88/2)*2; // snap height to even px
      const px=Math.round((step/SNAP_STEPS)*W);
      ctx.fillRect(px,(TH-hh)/2,SNAP_W-1,Math.max(2,hh));
    }
  } else {
    ctx.fillStyle="#ffffff28"; ctx.font="10px Inter,sans-serif";
    ctx.fillText("muted",ax+6,TH/2+4);
  }

  // handles + top line
  ctx.fillStyle=t.color;
  ctx.fillRect(ax,0,3,TH); ctx.fillRect(bx-3,0,3,TH);
  ctx.fillStyle=t.color+"cc"; ctx.fillRect(ax,0,bx-ax,2);

  // trim cursor
  if(trimMode&&trimPhase===1){
    const tl=document.getElementById("timeline");
    // draw nothing extra here — visual is in tip
  }

  // playhead
  if(live){ const p=livePos(),px2=(p/vdur)*W; ctx.fillStyle="#ff4d6dcc"; ctx.fillRect(px2-1,0,2,TH); }
}

function drawRuler(){
  const c=document.getElementById("ruler-canvas");
  const wrap=c.parentElement;
  const dpr=window.devicePixelRatio||1;
  const W=wrap.clientWidth||800, H=24;
  c.style.width=W+"px"; c.width=Math.round(W*dpr); c.height=Math.round(H*dpr);
  const ctx=c.getContext("2d"); ctx.scale(dpr,dpr);
  ctx.fillStyle=getComputedStyle(document.documentElement).getPropertyValue("--panel")||"#0f1320";
  ctx.fillRect(0,0,W,H);
  const dur=projectDuration(); if(!dur)return;
  const vdur=dur/zoomLevel;
  ctx.fillStyle="#4a5178"; ctx.font="9px Inter,sans-serif";
  const step=niceStep(vdur);
  for(let t=0;t<=vdur+step*0.01;t+=step){
    const x=(t/vdur)*W; ctx.fillStyle="#1e2540"; ctx.fillRect(x,0,1,H);
    ctx.fillStyle="#4a5178"; ctx.fillText(fmtSec(t),Math.min(x+2,W-30),H-6);
  }
  if(seekPos>0||live){
    const p=live?livePos():seekPos, px=(p/vdur)*W;
    ctx.fillStyle="rgba(255,77,109,.8)"; ctx.fillRect(px-1,0,2,H);
  }
}
function niceStep(d){for(const s of[0.5,1,2,5,10,15,30,60,120,300])if(d/s<=14)return s;return 60;}
function updatePlayhead(){
  const ph=document.getElementById("playhead"), tl=document.getElementById("timeline");
  const dur=projectDuration(); if(!dur){ph.style.display="none";return;}
  const vdur=dur/zoomLevel, p=live?livePos():seekPos;
  const pct=Math.min(1,p/vdur);
  ph.style.left=Math.round(pct*tl.clientWidth)+"px";
  ph.style.display="block";
}
function updateReady(){
  const any=TRACKS.some(t=>t.buf);
  document.getElementById("btn-play").disabled=!any;
  document.getElementById("btn-exp").disabled=!any;
  updateSeekUI();
}

/* ---- TIME FORMAT ---- */
function fmtSec(t){const s=Math.max(0,Math.floor(t));return Math.floor(s/60)+":"+String(s%60).padStart(2,"0");}
function fmtMs(t){const s=Math.max(0,t);return fmtSec(s)+"."+String(Math.floor((s%1)*10));}

/* ---- SEEK ---- */
let seekPos=0;
function updateSeekUI(p){
  const dur=projectDuration();
  if(p!==undefined)seekPos=p;
  const seeki=document.getElementById("seek");
  seeki.disabled=!dur;
  seeki.value=dur?Math.round(Math.min(dur,seekPos)/dur*10000):0;
  document.getElementById("now").textContent=fmtSec(seekPos);
  document.getElementById("total").textContent=fmtSec(dur);
  document.getElementById("tclock").textContent=fmtMs(seekPos)+" / "+fmtSec(dur);
}

/* ---- PLAYBACK ---- */
let live=null,raf2=0,liveT0=0,liveSeek=0;
function livePos(){return live?Math.min(projectDuration(),liveSeek+(live.currentTime-liveT0)):0;}

function detectSpeech(){
  const t=TRACKS[0]; if(!t||!t.buf)return[];
  const sr=t.buf.sampleRate,d=t.buf.getChannelData(0);
  const W2=Math.max(1,Math.floor(sr*0.05)), n=Math.ceil((t.end-t.start)*sr/W2);
  const rms=new Float32Array(n); const o=Math.floor(t.start*sr);
  for(let i=0;i<n;i++){let s=0;for(let j=0;j<W2;j++){const v=d[o+i*W2+j]||0;s+=v*v;}rms[i]=Math.sqrt(s/W2);}
  const sorted=[...rms].sort((a,b)=>a-b), thresh=Math.max(0.008,(sorted[Math.floor(n*0.95)]||0)*0.12);
  let last=-99; return [...rms].map((v,i)=>{if(v>thresh)last=i;return i-last<=8;});
}

function buildGraph(ctx,t0,seek){
  const o=O(), dur=projectDuration(), speech=o.auto?detectSpeech():[];
  const masterGain=ctx.createGain();
  const mv=+document.getElementById("mvol").value/100;
  masterGain.gain.value=mv;
  masterGain.connect(ctx.destination);

  TRACKS.forEach((t,ti)=>{
    if(!t.buf||t.mute)return;
    const clipLen=t.end-t.start, clipStart=t.offset, clipEnd=clipStart+clipLen;
    const begin=Math.max(seek,clipStart);
    const finish=o.loop?dur:Math.min(dur,clipEnd);
    if(begin>=finish)return;
    const src=ctx.createBufferSource(), gain=ctx.createGain();
    src.buffer=t.buf;
    if(o.loop){src.loop=true;src.loopStart=t.start;src.loopEnd=t.end;}
    gain.gain.value=t.vol;
    if(o.auto&&ti>0&&TRACKS[0]&&TRACKS[0].buf){
      const full=t.vol, ducked=t.vol*o.duck, musicAt=t0+begin-seek;
      const viStart=Math.floor(Math.max(0,begin-TRACKS[0].offset)*20);
      const init=viStart<speech.length?speech[viStart]:false;
      gain.gain.setValueAtTime(init?ducked:full,musicAt);
      let prev=init;
      speech.forEach((sp,i)=>{
        if(sp===prev)return;prev=sp;
        const at=TRACKS[0].offset+i*0.05;
        if(at<=begin||at>=finish)return;
        const when=t0+at-seek;
        gain.gain.setValueAtTime(sp?full:ducked,when);
        gain.gain.linearRampToValueAtTime(sp?ducked:full,when+(sp?0.2:0.7));
      });
    }
    src.connect(gain).connect(masterGain);
    const elapsed=begin-clipStart;
    const srcOff=o.loop?t.start+(elapsed%(clipLen||1)):t.start+elapsed;
    src.start(t0+begin-seek,srcOff,finish-begin);
  });
  return dur;
}

function stopPlay(){
  cancelAnimationFrame(raf2);
  if(live){const c=live;live=null;try{c.close();}catch(_){}}
  document.getElementById("btn-stop").disabled=true;
  const pi=document.getElementById("btn-play");
  pi.innerHTML="<svg width='12' height='12' viewBox='0 0 12 12' fill='currentColor'><path d='M2 1l9 5-9 5z'/></svg>";
  drawAll();
}

function play(){
  if(!TRACKS.some(t=>t.buf))return;
  stopPlay();
  const dur=projectDuration();
  let seek=dur*(document.getElementById("seek").value/10000);
  if(seek>=dur)seek=0;
  const ctx=live=new(window.AudioContext||window.webkitAudioContext)();
  liveT0=ctx.currentTime+0.08; liveSeek=seek;
  buildGraph(ctx,liveT0,seek);
  document.getElementById("btn-stop").disabled=false;
  document.getElementById("btn-play").innerHTML="<svg width='12' height='12' viewBox='0 0 12 12' fill='currentColor'><rect x='1' y='1' width='4' height='10' rx='1'/><rect x='7' y='1' width='4' height='10' rx='1'/></svg>";
  (function tick(){
    if(live!==ctx)return;
    const p=livePos(); seekPos=p; updateSeekUI(p); drawAll();
    if(p>=dur){seekPos=dur;updateSeekUI(dur);stopPlay();}
    else raf2=requestAnimationFrame(tick);
  })();
}

document.getElementById("btn-play").onclick=()=>{if(live)stopPlay();else play();};
document.getElementById("btn-stop").onclick=()=>{seekPos=0;stopPlay();updateSeekUI(0);drawAll();};
document.getElementById("btn-rw").onclick=()=>{seekPos=0;stopPlay();updateSeekUI(0);drawAll();};
document.getElementById("seek").oninput=function(){
  const dur=projectDuration(); seekPos=dur*(this.value/10000); updateSeekUI(seekPos); drawAll(); if(live)play();
};

// loop button
let loopOn=true;
document.getElementById("btn-loop").classList.toggle("on",loopOn);
document.getElementById("opt-loop").checked=loopOn;
document.getElementById("btn-loop").onclick=()=>{
  loopOn=!loopOn;
  document.getElementById("opt-loop").checked=loopOn;
  document.getElementById("btn-loop").classList.toggle("on",loopOn);
  drawAll(); if(live)play();
};
document.getElementById("opt-loop").onchange=function(){loopOn=this.checked;document.getElementById("btn-loop").classList.toggle("on",loopOn);drawAll();if(live)play();};

// duck
document.getElementById("opt-duck").onchange=function(){
  document.getElementById("duck-group").style.display=this.checked?"flex":"none"; if(live)play();
};
document.getElementById("duck").oninput=function(){document.getElementById("dvl").textContent=this.value+"%";if(live)play();};

// master vol
document.getElementById("mvol").oninput=function(){
  document.getElementById("mvol-lbl").textContent=this.value+"%"; if(live)play();
};

/* ---- EXPORT ---- */
document.getElementById("btn-exp").onclick=async()=>{
  stopPlay();
  const btn=document.getElementById("btn-exp"); btn.disabled=true;
  document.getElementById("mmsg").textContent="Rendering...";
  await new Promise(r=>setTimeout(r,20));
  try{
    const dur=projectDuration(),sr=44100;
    const oc=new OfflineAudioContext(2,Math.max(1,Math.ceil(dur*sr)),sr);
    buildGraph(oc,0,0);
    const buffer=await oc.startRendering();
    const fmt=document.getElementById("format").value;
    document.getElementById("mmsg").textContent=fmt==="mp3"?"Encoding MP3...":"Preparing WAV...";
    const blob=fmt==="mp3"?toMp3(buffer):toWav(buffer);
    const url=URL.createObjectURL(blob);
    document.getElementById("out").src=url;
    const dl=document.getElementById("dlmix"); dl.href=url; dl.download="studio-mix."+fmt;
    document.getElementById("dl-row").classList.add("show");
    document.getElementById("mmsg").textContent="Ready to download.";
  }catch(err){document.getElementById("mmsg").textContent=err.message||"Export failed.";}
  finally{btn.disabled=false;}
};

function toMp3(b){
  if(!window.lamejs)throw new Error("MP3 encoder not loaded.");
  const enc=new lamejs.Mp3Encoder(2,b.sampleRate,192);
  const L=b.getChannelData(0),R=b.getChannelData(1),chunks=[],block=1152;
  for(let i=0;i<L.length;i+=block){
    const l=new Int16Array(Math.min(block,L.length-i)),r=new Int16Array(l.length);
    for(let j=0;j<l.length;j++){l[j]=Math.max(-1,Math.min(1,L[i+j]))*32767;r[j]=Math.max(-1,Math.min(1,R[i+j]))*32767;}
    const d=enc.encodeBuffer(l,r);if(d.length)chunks.push(new Uint8Array(d));
  }
  const e=enc.flush();if(e.length)chunks.push(new Uint8Array(e));
  return new Blob(chunks,{type:"audio/mpeg"});
}
function toWav(b){
  const n=b.length,ch=2,buf=new ArrayBuffer(44+n*ch*2),v=new DataView(buf);
  const w=(o,s)=>[...s].forEach((c,i)=>v.setUint8(o+i,c.charCodeAt(0)));
  w(0,"RIFF");v.setUint32(4,36+n*4,true);w(8,"WAVEfmt ");
  v.setUint32(16,16,true);v.setUint16(20,1,true);v.setUint16(22,ch,true);
  v.setUint32(24,b.sampleRate,true);v.setUint32(28,b.sampleRate*4,true);
  v.setUint16(32,4,true);v.setUint16(34,16,true);w(36,"data");v.setUint32(40,n*4,true);
  const Lc=b.getChannelData(0),Rc=b.getChannelData(1);let o=44;
  for(let i=0;i<n;i++)for(const d of[Lc,Rc]){v.setInt16(o,Math.max(-1,Math.min(1,d[i]))*32767,true);o+=2;}
  return new Blob([buf],{type:"audio/wav"});
}

/* ---- SVG ICONS ---- */
function icoMute(m){return m?'<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><path d="M1 3.5h2l3-2.5v7L3 5.5H1z"/><path d="M8 4l2 3M10 4L8 7" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>':'<svg width="11" height="11" viewBox="0 0 11 11" fill="currentColor"><path d="M1 3.5h2l3-2.5v7L3 5.5H1z"/><path d="M8 3.5a2.5 2.5 0 0 1 0 4" stroke="currentColor" stroke-width="1.3" fill="none" stroke-linecap="round"/></svg>';}
function icoDup(){return '<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.3"><rect x="1" y="3" width="7" height="7" rx="1.5"/><path d="M4 3V2a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v4a1 1 0 0 1-1 1h-1" stroke-linecap="round"/></svg>';}
function icoPlus(){return '<svg width="11" height="11" viewBox="0 0 11 11" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round"><path d="M5.5 1v9M1 5.5h9"/></svg>';}

/* ---- INIT ---- */
TRACKS.push(mkTrack()); TRACKS.push(mkTrack());
snapshot(); buildDOM();
window.addEventListener("resize",drawAll);

/* ---- DOWNLOADER ---- */
let kind="video",timer2,cur2="";
const dm=(t,e)=>{const el=document.getElementById("dmsg");el.textContent=t;el.className="dmsg"+(e?" err":"");};
$$("#chips .chip").forEach(c=>c.onclick=()=>{
  $$("#chips .chip").forEach(x=>x.classList.toggle("on",x===c));
  document.getElementById("url").placeholder="Paste the "+c.textContent+" link here";
  document.getElementById("url").focus();
});
$$("[data-k]").forEach(c=>c.onclick=()=>{kind=c.dataset.k;$$("[data-k]").forEach(x=>x.classList.toggle("on",x===c));});
document.getElementById("url").oninput=function(){
  clearTimeout(timer2); const u=this.value.trim();
  document.getElementById("prev").hidden=true;
  if(!u){dm("");return;} timer2=setTimeout(()=>lookup(u),500);
};
async function lookup(u){
  dm("Finding...");
  try{
    const r=await fetch("/api/info",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:u})});
    const d=await r.json(); if(!r.ok)return dm(d.error,1);
    cur2=u;
    document.getElementById("th").src=d.thumb||"";
    document.getElementById("tt").textContent=d.title||"Video";
    const m=d.duration?Math.floor(d.duration/60)+":"+String(d.duration%60).padStart(2,"0"):"";
    document.getElementById("tm").textContent=[d.site,m,d.uploader].filter(Boolean).join(" \u00b7 ");
    document.getElementById("prev").hidden=false; dm("");
  }catch(_){dm("Cannot reach server. Is app.py running?",1);}
}
document.getElementById("go").onclick=async()=>{
  document.getElementById("go").disabled=true; dm("Starting...");
  try{
    const r=await fetch("/api/download",{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({url:cur2,kind})});
    const{id}=await r.json(); pollDl(id);
  }catch(_){dm("Connection lost.",1);document.getElementById("go").disabled=false;}
};
async function pollDl(id){
  try{
    const p=await(await fetch("/api/progress/"+id)).json();
    document.getElementById("dbar").style.width=(p.pct||0)+"%";
    if(p.status==="done"){dm("Done.");document.getElementById("go").disabled=false;const a=document.createElement("a");a.href="/api/file/"+id;a.click();return;}
    if(p.status==="error"){dm(p.error,1);document.getElementById("go").disabled=false;return;}
    dm(p.status==="downloading"?"Downloading "+p.pct+"%"+(p.speed?" \u00b7 "+(p.speed/1048576).toFixed(1)+" MB/s":""):"Working...");
    setTimeout(()=>pollDl(id),700);
  }catch(_){dm("Retrying...",1);setTimeout(()=>pollDl(id),2000);}
}
</script></body></html>'''
with open(OUT,"a",encoding="utf-8") as f:
    f.write(p3)
import os
print("done", os.path.getsize(OUT))
