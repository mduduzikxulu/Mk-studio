import os
OUT = r"c:\Users\mdudu\Downloads\studio\static\index.html"
H = []
A = H.append

# ---- HEAD ----
A('<!doctype html><html lang="en"><head>')
A('<meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">')
A('<title>Studio</title>')
A('<link rel="preconnect" href="https://fonts.googleapis.com">')
A('<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800;900&display=swap" rel="stylesheet">')
A('<style>')
A(r"""
:root{--bg:#080b12;--panel:#0f1320;--surface:#151929;--border:#1e2540;--text:#e8eaf6;--muted:#4a5178;--accent:#7c5cff;--green:#2de2c5;--red:#ff4d6d;--yellow:#ffd166;--track-h:60px;--sidebar-w:152px}
*{box-sizing:border-box;margin:0;padding:0}
body{font:14px/1.5 'Inter',system-ui,sans-serif;color:var(--text);background:var(--bg);min-height:100vh;overflow-x:hidden}
button{font:inherit;cursor:pointer;border:none;outline:none;background:none}
button:focus-visible{outline:2px solid var(--accent);outline-offset:2px}
input,select{font:inherit}
#page-home{display:block}.page-app{display:none}
.hero{min-height:100vh;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:40px 20px;position:relative;overflow:hidden}
.hero-bg{position:absolute;inset:0;z-index:0}
.hero-bg::before{content:'';position:absolute;inset:0;background:radial-gradient(ellipse 80% 60% at 50% 0%,#3d2aaa33,transparent),radial-gradient(ellipse 60% 40% at 80% 80%,#ff4d6d18,transparent),radial-gradient(ellipse 40% 30% at 10% 60%,#2de2c512,transparent)}
.bars-bg{position:absolute;bottom:0;left:0;right:0;height:220px;display:flex;align-items:flex-end;gap:2px;padding:0 10px;opacity:.18}
.bar-item{flex:1;border-radius:2px 2px 0 0;transform-origin:bottom}
.hero-content{position:relative;z-index:1;max-width:760px}
.hero-logo{font-size:96px;font-weight:900;letter-spacing:-6px;line-height:1;margin-bottom:20px;background:linear-gradient(135deg,#fff 0%,var(--accent) 50%,var(--green) 100%);-webkit-background-clip:text;-webkit-text-fill-color:transparent;background-clip:text;animation:fadeUp .8s ease both}
.hero-tag{display:inline-block;background:#7c5cff18;border:1px solid #7c5cff40;color:var(--accent);font-size:11px;font-weight:700;letter-spacing:2.5px;padding:5px 14px;border-radius:99px;margin-bottom:20px;text-transform:uppercase;animation:fadeUp .8s .1s ease both}
.hero-sub{font-size:22px;font-weight:600;color:#8892c8;margin-bottom:12px;letter-spacing:-.3px;animation:fadeUp .8s .2s ease both}
.hero-desc{font-size:15px;color:var(--muted);max-width:500px;margin:0 auto 40px;line-height:1.8;animation:fadeUp .8s .3s ease both}
.hero-btns{display:flex;gap:14px;justify-content:center;flex-wrap:wrap;animation:fadeUp .8s .4s ease both}
@keyframes fadeUp{from{opacity:0;transform:translateY(20px)}to{opacity:1;transform:translateY(0)}}
.hbtn{padding:16px 34px;border-radius:14px;font-size:15px;font-weight:700;letter-spacing:-.2px;transition:.2s;cursor:pointer;display:flex;align-items:center;gap:10px;border:none}
.hbtn-primary{background:linear-gradient(135deg,var(--accent),#a855f7);color:#fff;box-shadow:0 8px 32px #7c5cff44}
.hbtn-primary:hover{transform:translateY(-3px);box-shadow:0 16px 48px #7c5cff66}
.hbtn-ghost{background:#ffffff08;border:1px solid #ffffff15;color:var(--text)}
.hbtn-ghost:hover{background:#ffffff12;transform:translateY(-3px)}
.features{padding:80px 20px;max-width:1040px;margin:0 auto}
.feat-head{text-align:center;margin-bottom:52px}
.feat-head h2{font-size:38px;font-weight:800;letter-spacing:-1.5px;margin-bottom:10px}
.feat-head p{color:var(--muted);font-size:15px}
.feat-grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:20px}
.feat-card{background:var(--panel);border:1px solid var(--border);border-radius:22px;padding:30px;transition:.25s;cursor:pointer;position:relative;overflow:hidden}
.feat-card::after{content:'';position:absolute;inset:0;opacity:0;transition:.3s}
.feat-card:hover{border-color:var(--accent);transform:translateY(-5px);box-shadow:0 24px 64px #0009}
.feat-card:hover::after{opacity:1}
.feat-icon{width:54px;height:54px;border-radius:16px;display:flex;align-items:center;justify-content:center;margin-bottom:18px}
.feat-card h3{font-size:20px;font-weight:700;margin-bottom:8px;letter-spacing:-.3px}
.feat-card p{font-size:13px;color:var(--muted);line-height:1.7;margin-bottom:20px}
.feat-link{font-size:13px;font-weight:600;color:var(--accent);display:flex;align-items:center;gap:4px}
.mini-bars{height:38px;display:flex;align-items:flex-end;gap:2px;margin-bottom:16px}
.mb{border-radius:2px 2px 0 0}
.scroll-hint{position:absolute;bottom:28px;left:50%;transform:translateX(-50%);display:flex;flex-direction:column;align-items:center;gap:5px;color:var(--muted);font-size:10px;z-index:1;letter-spacing:1px;text-transform:uppercase;animation:bounce 2s ease-in-out infinite}
@keyframes bounce{0%,100%{transform:translateX(-50%) translateY(0)}50%{transform:translateX(-50%) translateY(7px)}}
.app{display:flex;flex-direction:column;height:100vh;overflow:hidden}
.topbar{display:flex;align-items:center;gap:9px;padding:0 13px;height:46px;background:var(--panel);border-bottom:1px solid var(--border);flex-shrink:0;z-index:10}
.logo-sm{font-weight:800;font-size:15px;color:var(--text);letter-spacing:-.5px;cursor:pointer;padding:4px 8px;border-radius:6px;transition:.15s}
.logo-sm:hover{background:var(--surface)}
.logo-sm span{color:var(--accent)}
.nav-tabs{display:flex;gap:2px;background:var(--surface);border-radius:7px;padding:3px}
.nav-tabs button{padding:4px 12px;border-radius:5px;color:var(--muted);font-size:12px;font-weight:500;transition:.15s}
.nav-tabs button.on{background:var(--accent);color:#fff}
.spacer{flex:1}
.transport{display:flex;align-items:center;gap:5px}
.tbtn{width:29px;height:29px;border-radius:7px;display:flex;align-items:center;justify-content:center;color:var(--muted);background:var(--surface);transition:.15s;flex-shrink:0}
.tbtn:hover:not(:disabled){background:var(--border);color:var(--text)}
.tbtn.on{background:var(--accent)!important;color:#fff!important}
.tbtn:disabled{opacity:.3;cursor:not-allowed}
.tbtn-red{background:#ff4d6d15;color:var(--red)}
.tbtn-red:hover:not(:disabled){background:#ff4d6d30}
.tclock{font-size:11px;font-variant-numeric:tabular-nums;color:var(--text);background:var(--surface);border-radius:6px;padding:4px 8px;min-width:92px;text-align:center;letter-spacing:.3px}
.sep{width:1px;height:18px;background:var(--border);margin:0 2px}
.mvol-wrap{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--muted)}
.mvol-wrap input{width:62px;accent-color:var(--yellow);cursor:pointer}
.format-sel{background:var(--surface);border:1px solid var(--border);color:var(--text);border-radius:6px;padding:4px 7px;font-size:11px;cursor:pointer}
.export-btn{padding:5px 13px;border-radius:7px;background:var(--accent);color:#fff;font-size:12px;font-weight:600;transition:.15s}
.export-btn:hover:not(:disabled){filter:brightness(1.15)}
.export-btn:disabled{opacity:.3;cursor:not-allowed}
.inner-page{display:none;flex:1;overflow:hidden;flex-direction:column}
.inner-page.on{display:flex}
.daw{display:flex;flex-direction:column;flex:1;overflow:hidden}
.tool-row{display:flex;align-items:center;gap:4px;padding:4px 8px;background:var(--panel);border-bottom:1px solid var(--border);flex-shrink:0;flex-wrap:wrap}
.tool-sep{width:1px;height:16px;background:var(--border);margin:0 3px}
.zoom-wrap{display:flex;align-items:center;gap:4px;font-size:10px;color:var(--muted)}
.zoom-wrap input{width:68px;accent-color:var(--green);cursor:pointer}
.ruler-row{display:flex;flex-shrink:0;height:24px;background:var(--panel);border-bottom:1px solid var(--border)}
.ruler-spacer{width:var(--sidebar-w);flex-shrink:0;border-right:1px solid var(--border)}
#ruler-canvas{display:block;height:24px;cursor:pointer}
.tracks-area{flex:1;display:flex;overflow-y:auto;overflow-x:hidden}
.sidebar{width:var(--sidebar-w);flex-shrink:0;border-right:1px solid var(--border);background:var(--panel)}
.track-sidebar{height:var(--track-h);display:flex;flex-direction:column;justify-content:center;padding:0 6px;border-bottom:1px solid var(--border);gap:2px}
.tname-row{display:flex;align-items:center;gap:3px}
.tname{font-size:10px;font-weight:600;color:var(--text);white-space:nowrap;overflow:hidden;text-overflow:ellipsis;flex:1}
.tcontrols{display:flex;align-items:center;gap:3px}
.tvol{flex:1;accent-color:var(--accent);cursor:pointer}
.icon-btn{width:18px;height:18px;border-radius:4px;display:flex;align-items:center;justify-content:center;color:var(--muted);background:var(--surface);transition:.15s;flex-shrink:0}
.icon-btn:hover{background:var(--border);color:var(--text)}
.icon-btn.on{background:#ff4d6d20;color:var(--red)}
.add-track-row{height:var(--track-h);display:flex;align-items:center;justify-content:center;border-bottom:1px solid var(--border)}
.add-btn-sm{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);padding:4px 8px;border-radius:5px;transition:.15s}
.add-btn-sm:hover{background:var(--surface);color:var(--text)}
.timeline{flex:1;position:relative;overflow:hidden;background:var(--bg)}
.track-lane{height:var(--track-h);border-bottom:1px solid var(--border);position:relative}
.track-lane canvas{display:block;width:100%;height:100%}
.add-lane{height:var(--track-h);border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--muted);font-size:11px;gap:5px;transition:.15s}
.add-lane:hover,.add-lane.over{background:var(--surface);color:var(--text)}
.lane-empty{position:absolute;inset:3px;border:1.5px dashed var(--border);border-radius:5px;display:flex;align-items:center;justify-content:center;gap:5px;font-size:11px;color:var(--muted);cursor:pointer;transition:.15s}
.lane-empty:hover,.lane-empty.over{border-color:var(--accent);color:var(--accent);background:#7c5cff08}
#playhead{position:absolute;top:0;bottom:0;width:2px;background:var(--red);pointer-events:none;z-index:20;display:none}
#playhead::before{content:'';position:absolute;top:0;left:-4px;border-left:5px solid transparent;border-right:5px solid transparent;border-top:8px solid var(--red)}
.wave-tip{position:absolute;top:2px;background:#000d;padding:1px 5px;border-radius:3px;font-size:10px;color:var(--green);pointer-events:none;white-space:nowrap;display:none;z-index:5;font-variant-numeric:tabular-nums}
.seekbar{height:26px;display:flex;align-items:center;gap:7px;padding:0 8px;background:var(--panel);border-top:1px solid var(--border);flex-shrink:0;font-size:10px;color:var(--muted);font-variant-numeric:tabular-nums}
#seek{flex:1;accent-color:var(--accent);cursor:pointer}
.options-bar{display:flex;align-items:center;gap:12px;flex-wrap:wrap;padding:4px 9px;background:var(--panel);border-top:1px solid var(--border);flex-shrink:0}
.sw{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted);cursor:pointer;user-select:none}
.sw input{accent-color:var(--accent)}
.duck-group{display:flex;align-items:center;gap:4px;font-size:11px;color:var(--muted)}
.duck-group input{width:62px;accent-color:var(--accent)}
.status-bar{height:22px;display:flex;align-items:center;gap:7px;padding:0 9px;background:var(--bg);border-top:1px solid var(--border);flex-shrink:0;font-size:10px;color:var(--muted)}
#mmsg{flex:1}
.dl-row{display:none;align-items:center;gap:5px}
.dl-row.show{display:flex}
.dl-btn-sm{padding:2px 9px;border-radius:4px;background:var(--accent);color:#fff;font-size:10px;font-weight:600;text-decoration:none}
.dl-page{flex:1;overflow-y:auto;padding:22px 16px}
.dl-page h2,.how-page h2{font-size:18px;font-weight:700;margin-bottom:4px}
.lead{color:var(--muted);font-size:12px;margin-bottom:12px}
.card{background:var(--panel);border:1px solid var(--border);border-radius:11px;padding:14px;max-width:560px}
.chips{display:flex;gap:5px;flex-wrap:wrap;margin-bottom:9px}
.chip{border:1px solid var(--border);background:var(--bg);color:var(--text);padding:5px 10px;border-radius:6px;font:600 11px inherit;cursor:pointer;transition:.15s}
.chip.on{border-color:var(--accent);background:#7c5cff18;color:var(--accent)}
.urlin{width:100%;padding:8px 10px;border-radius:7px;border:1px solid var(--border);background:var(--bg);color:var(--text);font-size:12px}
.urlin:focus{outline:2px solid var(--accent)}
.dmsg{color:var(--muted);margin-top:6px;min-height:16px;font-size:11px}
.dmsg.err{color:var(--red)}
.pv{display:flex;gap:10px;margin-top:10px;align-items:flex-start}
.pv img{width:108px;aspect-ratio:16/9;object-fit:cover;border-radius:6px;background:var(--bg)}
.row{display:flex;gap:7px;align-items:center;flex-wrap:wrap;margin-top:9px}
.pbtn{padding:7px 14px;border-radius:7px;background:var(--accent);color:#fff;font:600 12px inherit;transition:.15s;border:none;cursor:pointer}
.pbtn:hover:not(:disabled){filter:brightness(1.1)}.pbtn:disabled{opacity:.3;cursor:not-allowed}
.pbtn.ghost{background:var(--surface);border:1px solid var(--border);color:var(--text)}
.progbar{height:3px;background:var(--border);border-radius:2px;overflow:hidden;margin-top:8px}
.progbar div{height:100%;width:0;background:linear-gradient(90deg,var(--green),var(--accent));transition:width .3s}
.how-page{flex:1;overflow-y:auto;padding:22px 16px}
.steps{display:grid;gap:7px;max-width:560px;counter-reset:s}
.step{background:var(--panel);border:1px solid var(--border);border-radius:9px;padding:11px 11px 11px 44px;position:relative}
.step::before{counter-increment:s;content:counter(s);position:absolute;left:10px;top:10px;width:23px;height:23px;border-radius:50%;display:grid;place-items:center;font-weight:700;font-size:11px;background:var(--accent);color:#fff}
.step h3{font-size:12px;font-weight:600;margin-bottom:2px}
.step p{color:var(--muted);font-size:11px}
""")
