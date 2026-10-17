"""Studio - audio mixer + video downloader. Run: python app.py"""
import os, threading, uuid
from flask import Flask, jsonify, request, send_file
import yt_dlp

BASE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(BASE, "downloads")
os.makedirs(DL, exist_ok=True)
app = Flask(__name__, static_folder="docs", static_url_path="")
jobs = {}

FORMATS = {  # single-file formats: no ffmpeg required
    "audio": "bestaudio[ext=m4a]/bestaudio/best",
    "video": "best[ext=mp4][vcodec!=none][acodec!=none]/best[ext=mp4]/best",
}

def base_opts(kind="info"):
    return {
        "quiet": True, "no_warnings": True, "noplaylist": True,
        "retries": 25, "fragment_retries": 25, "file_access_retries": 5,
        "continuedl": True,          # resume .part files instead of restarting
        "socket_timeout": 20,
        "outtmpl": os.path.join(DL, f"%(extractor)s-%(id)s-{kind}.%(ext)s"),
    }

@app.get("/")
def home():
    return app.send_static_file("index.html")

@app.get("/<p>")
def page(p):
    if p in ("mix", "download", "how"):
        return app.send_static_file(p + ".html")
    return app.send_static_file(p)

@app.post("/api/info")
def info():
    url = (request.json or {}).get("url", "").strip()
    if not url.startswith("http"):
        return jsonify(error="Paste a full link that starts with http."), 400
    try:
        with yt_dlp.YoutubeDL(base_opts()) as y:
            d = y.extract_info(url, download=False)
        return jsonify(title=d.get("title"), thumb=d.get("thumbnail"),
                       duration=d.get("duration"), site=d.get("extractor_key"),
                       uploader=d.get("uploader"))
    except Exception as e:
        return jsonify(error="Couldn't find a video at that link. It may be private or unsupported."), 400

def work(jid, url, kind):
    job = jobs[jid]
    def hook(h):
        if h["status"] == "downloading":
            total = h.get("total_bytes") or h.get("total_bytes_estimate") or 0
            job.update(status="downloading", pct=round(h["downloaded_bytes"] / total * 100, 1) if total else 0,
                       speed=h.get("speed") or 0, eta=h.get("eta"))
        elif h["status"] == "finished":
            job.update(pct=100, status="finishing")
    try:
        o = base_opts(kind); o.update(format=FORMATS[kind], progress_hooks=[hook])
        with yt_dlp.YoutubeDL(o) as y:
            d = y.extract_info(url, download=True)
            path = y.prepare_filename(d)
        job.update(status="done", path=path, name=os.path.basename(path) and
                   f"{(d.get('title') or 'download')[:80]}{os.path.splitext(path)[1]}")
    except Exception as e:
        job.update(status="error", error="Download failed. Check your connection and try again - it will resume.")

@app.post("/api/download")
def download():
    j = request.json or {}
    kind = "audio" if j.get("kind") == "audio" else "video"
    jid = uuid.uuid4().hex[:10]
    jobs[jid] = dict(status="starting", pct=0)
    threading.Thread(target=work, args=(jid, j.get("url", ""), kind), daemon=True).start()
    return jsonify(id=jid)

@app.get("/api/progress/<jid>")
def progress(jid):
    j = jobs.get(jid)
    return (jsonify({k: v for k, v in j.items() if k != "path"}), 200) if j else (jsonify(error="Unknown job"), 404)

@app.get("/api/file/<jid>")
def file(jid):
    j = jobs.get(jid)
    if not j or j.get("status") != "done":
        return jsonify(error="Not ready"), 404
    # conditional=True enables HTTP Range, so browsers can resume interrupted saves
    return send_file(j["path"], as_attachment=True, download_name=j["name"], conditional=True)

if __name__ == "__main__":
    print("Studio running at http://localhost:5000")
    app.run(host="127.0.0.1", port=5000, threaded=True)
