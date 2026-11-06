"""Studio - audio mixer + video downloader. Run: python app.py"""
import os, threading, uuid, glob
from flask import Flask, jsonify, request, send_file
import yt_dlp

BASE = os.path.dirname(os.path.abspath(__file__))
DL = os.path.join(BASE, "downloads")
COOKIE_FILE = os.path.join(BASE, "cookies.txt")   # optional Netscape cookie export
os.makedirs(DL, exist_ok=True)
app = Flask(__name__, static_folder="docs", static_url_path="")
jobs = {}

FORMATS = {
    # For audio: grab best m4a (no ffmpeg needed)
    "audio": "bestaudio[ext=m4a]/bestaudio/best",
    # For video: prefer HLS m3u8 pre-muxed mp4 streams (no ffmpeg needed);
    # fall back to any best single-file stream
    "video": (
        "bestvideo[ext=mp4][protocol=m3u8_native]+bestaudio[ext=m4a]"
        "/best[ext=mp4][protocol=m3u8_native]"
        "/best[ext=mp4]"
        "/best"
    ),
}

def base_opts(kind="info"):
    opts = {
        "quiet": True, "no_warnings": True, "noplaylist": True,
        "retries": 25, "fragment_retries": 25, "file_access_retries": 5,
        "continuedl": True,
        "socket_timeout": 30,
        # visionos client has full formats and doesn't need a PO token
        "extractor_args": {
            "youtube": {"player_client": ["visionos", "mweb"]},
        },
        "http_headers": {
            "User-Agent": (
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/124.0.0.0 Safari/537.36"
            ),
        },
        "outtmpl": os.path.join(DL, f"%(extractor)s-%(id)s-{kind}.%(ext)s"),
    }
    # Use cookie file if present (helps with Instagram, Facebook, age-gated YT)
    if os.path.isfile(COOKIE_FILE):
        opts["cookiefile"] = COOKIE_FILE
    return opts


def find_downloaded_file(prefix: str) -> str | None:
    """Glob for the real downloaded file — yt-dlp may pick a different container."""
    matches = glob.glob(prefix + ".*")
    matches = [m for m in matches if not m.endswith((".part", ".ytdl"))]
    return matches[0] if matches else None


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
        return jsonify(
            title=d.get("title"),
            thumb=d.get("thumbnail"),
            duration=d.get("duration"),
            site=d.get("extractor_key"),
            uploader=d.get("uploader"),
        )
    except Exception as e:
        detail = str(e).strip().split("\n")[0] or "This link is unavailable, private, or restricted."
        # Friendly hint for platforms that need cookies
        if "login" in detail.lower() or "cookie" in detail.lower() or "empty media" in detail.lower():
            detail += " (Try exporting your browser cookies to cookies.txt — see README.)"
        return jsonify(error=f"Couldn't access that link: {detail}"), 400


def work(jid, url, kind):
    job = jobs[jid]

    def hook(h):
        if h["status"] == "downloading":
            total = h.get("total_bytes") or h.get("total_bytes_estimate") or 0
            job.update(
                status="downloading",
                pct=round(h["downloaded_bytes"] / total * 100, 1) if total else 0,
                speed=h.get("speed") or 0,
                eta=h.get("eta"),
            )
        elif h["status"] == "finished":
            job.update(pct=100, status="finishing")

    try:
        o = base_opts(kind)
        o.update(format=FORMATS[kind], progress_hooks=[hook])
        with yt_dlp.YoutubeDL(o) as y:
            d = y.extract_info(url, download=True)
            predicted = y.prepare_filename(d)
            prefix = os.path.splitext(predicted)[0]

        real_path = find_downloaded_file(prefix) or predicted
        safe_title = (d.get("title") or "download")[:80]
        ext = os.path.splitext(real_path)[1]
        job.update(status="done", path=real_path, name=f"{safe_title}{ext}")
    except Exception as e:
        detail = str(e).strip().split("\n")[0] or "This link is unavailable, private, or restricted."
        if "login" in detail.lower() or "cookie" in detail.lower() or "empty media" in detail.lower():
            detail += " (Try exporting your browser cookies to cookies.txt — see README.)"
        job.update(status="error", error=f"Download failed: {detail}")


@app.post("/api/download")
def download():
    j = request.json or {}
    kind = "audio" if j.get("kind") == "audio" else "video"
    jid = uuid.uuid4().hex[:10]
    jobs[jid] = dict(status="starting", pct=0)
    threading.Thread(
        target=work, args=(jid, j.get("url", ""), kind), daemon=True
    ).start()
    return jsonify(id=jid)


@app.get("/api/progress/<jid>")
def progress(jid):
    j = jobs.get(jid)
    return (
        (jsonify({k: v for k, v in j.items() if k != "path"}), 200)
        if j
        else (jsonify(error="Unknown job"), 404)
    )


@app.get("/api/file/<jid>")
def file(jid):
    j = jobs.get(jid)
    if not j or j.get("status") != "done":
        return jsonify(error="Not ready"), 404
    return send_file(
        j["path"], as_attachment=True, download_name=j["name"], conditional=True
    )


if __name__ == "__main__":
    print("Studio running at http://localhost:5000")
    if os.path.isfile(COOKIE_FILE):
        print(f"  Using cookie file: {COOKIE_FILE}")
    else:
        print("  No cookies.txt found — Instagram/Facebook may not work without it.")
    app.run(host="127.0.0.1", port=5000, threaded=True)
