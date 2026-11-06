"""
app.py — Studio backend server

Responsibilities
────────────────
• Serve the static frontend from the docs/ folder.
• /api/info      — fetch video metadata (title, thumbnail, duration) without downloading.
• /api/download  — start an async download job, return a job id.
• /api/progress  — poll a running job's progress (percent, speed, status).
• /api/file      — serve the finished file to the browser.

Supported sites
───────────────
All sites that yt-dlp supports, including YouTube, TikTok, Instagram,
Facebook, and X (Twitter).  Instagram and Facebook usually require cookies;
see the README for instructions.

Running locally
───────────────
    pip install -r requirements.txt
    python app.py
    # then open http://localhost:5000 in your browser
"""

import os
import glob
import uuid
import threading

from flask import Flask, jsonify, request, send_file
import yt_dlp


# ── Paths ──────────────────────────────────────────────────────────────────

# Directory this file lives in
BASE_DIR = os.path.dirname(os.path.abspath(__file__))

# Where downloaded files are saved
DOWNLOADS_DIR = os.path.join(BASE_DIR, "downloads")
os.makedirs(DOWNLOADS_DIR, exist_ok=True)

# Optional Netscape-format cookie file.
# Export your browser cookies here to unlock private/login-gated videos.
COOKIE_FILE = os.path.join(BASE_DIR, "cookies.txt")


# ── Flask app ──────────────────────────────────────────────────────────────

# The docs/ folder contains all static HTML, CSS and JS files.
app = Flask(__name__, static_folder="docs", static_url_path="")

# In-memory store of active download jobs.
# Each entry is a dict:  { status, pct, speed, eta, path, name, error }
jobs = {}


# ── yt-dlp format selectors ────────────────────────────────────────────────

# Prefer formats that don't need ffmpeg to re-mux after download.
# Falls back to the best available stream if none of the preferred ones match.
FORMATS = {
    # Audio: grab the best m4a stream directly
    "audio": "bestaudio[ext=m4a]/bestaudio/best",

    # Video: prefer pre-muxed HLS mp4 → any mp4 → any best stream
    "video": (
        "bestvideo[ext=mp4][protocol=m3u8_native]+bestaudio[ext=m4a]"
        "/best[ext=mp4][protocol=m3u8_native]"
        "/best[ext=mp4]"
        "/best"
    ),
}


# ── yt-dlp base options ────────────────────────────────────────────────────

def base_opts(kind="info"):
    """
    Return a yt-dlp options dict shared by both /api/info and download jobs.

    `kind` is used as a suffix in the output filename template so that
    video and audio files for the same URL don't overwrite each other.
    """
    opts = {
        "quiet":               True,
        "no_warnings":         True,
        "noplaylist":          True,
        "retries":             25,
        "fragment_retries":    25,
        "file_access_retries": 5,
        "continuedl":          True,   # resume interrupted downloads
        "socket_timeout":      30,

        # The visionos client has full format access and doesn't need a PO token,
        # which avoids the "Sign in to confirm you're not a bot" error on YouTube.
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

        # Output template: saved as <extractor>-<video-id>-<kind>.<ext>
        # e.g. youtube-dQw4w9WgXcQ-video.mp4
        "outtmpl": os.path.join(DOWNLOADS_DIR, f"%(extractor)s-%(id)s-{kind}.%(ext)s"),
    }

    # Attach the cookie file if it exists (helps with Instagram, Facebook,
    # age-gated YouTube videos, and X/Twitter login-required content)
    if os.path.isfile(COOKIE_FILE):
        opts["cookiefile"] = COOKIE_FILE

    return opts


# ── Helpers ────────────────────────────────────────────────────────────────

def find_downloaded_file(prefix: str) -> str | None:
    """
    Glob for the actual downloaded file.

    yt-dlp sometimes picks a different container than predicted, so we glob
    for any file that starts with `prefix` and ignore .part / .ytdl temps.
    """
    matches = glob.glob(prefix + ".*")
    matches = [m for m in matches if not m.endswith((".part", ".ytdl"))]
    return matches[0] if matches else None


def friendly_error(raw: str) -> str:
    """
    Turn a raw yt-dlp error message into something user-readable.
    Appends a cookie hint when login is required.
    """
    detail = raw.strip().split("\n")[0] or "This link is unavailable, private, or restricted."
    if any(kw in detail.lower() for kw in ("login", "cookie", "empty media")):
        detail += " (Try exporting your browser cookies to cookies.txt — see README.)"
    return detail


# ── Routes ─────────────────────────────────────────────────────────────────

@app.get("/")
def home():
    return app.send_static_file("index.html")


@app.get("/<p>")
def page(p):
    # Short URLs like /mix and /download redirect to the .html files
    if p in ("mix", "download", "how"):
        return app.send_static_file(p + ".html")
    return app.send_static_file(p)


@app.post("/api/info")
def info():
    """
    Fetch video metadata without downloading anything.
    Returns: title, thumbnail URL, duration (seconds), site name, uploader.
    """
    url = (request.json or {}).get("url", "").strip()

    if not url.startswith("http"):
        return jsonify(error="Paste a full link that starts with http."), 400

    try:
        with yt_dlp.YoutubeDL(base_opts()) as ydl:
            data = ydl.extract_info(url, download=False)

        return jsonify(
            title=data.get("title"),
            thumb=data.get("thumbnail"),
            duration=data.get("duration"),
            site=data.get("extractor_key"),
            uploader=data.get("uploader"),
        )

    except Exception as e:
        return jsonify(error=f"Couldn't access that link: {friendly_error(str(e))}"), 400


# ── Download worker (runs in a background thread) ──────────────────────────

def download_worker(job_id: str, url: str, kind: str):
    """
    Download a video or audio file and update the job dict as progress arrives.

    Called in a daemon thread by /api/download so it doesn't block the server.
    """
    job = jobs[job_id]

    def on_progress(hook):
        """yt-dlp progress hook — updates the job dict each time it's called."""
        if hook["status"] == "downloading":
            total = hook.get("total_bytes") or hook.get("total_bytes_estimate") or 0
            pct   = round(hook["downloaded_bytes"] / total * 100, 1) if total else 0
            job.update(status="downloading", pct=pct, speed=hook.get("speed") or 0, eta=hook.get("eta"))

        elif hook["status"] == "finished":
            job.update(pct=100, status="finishing")

    try:
        opts = base_opts(kind)
        opts.update(format=FORMATS[kind], progress_hooks=[on_progress])

        with yt_dlp.YoutubeDL(opts) as ydl:
            data          = ydl.extract_info(url, download=True)
            predicted     = ydl.prepare_filename(data)
            prefix        = os.path.splitext(predicted)[0]

        real_path  = find_downloaded_file(prefix) or predicted
        safe_title = (data.get("title") or "download")[:80]
        ext        = os.path.splitext(real_path)[1]

        job.update(status="done", path=real_path, name=f"{safe_title}{ext}")

    except Exception as e:
        job.update(status="error", error=f"Download failed: {friendly_error(str(e))}")


# ── API endpoints ──────────────────────────────────────────────────────────

@app.post("/api/download")
def download():
    """
    Start a download job.
    Body: { url: string, kind: "video" | "audio" }
    Returns: { id: string }
    """
    body = request.json or {}
    kind = "audio" if body.get("kind") == "audio" else "video"
    job_id = uuid.uuid4().hex[:10]

    jobs[job_id] = dict(status="starting", pct=0)

    threading.Thread(
        target=download_worker,
        args=(job_id, body.get("url", ""), kind),
        daemon=True,
    ).start()

    return jsonify(id=job_id)


@app.get("/api/progress/<job_id>")
def progress(job_id):
    """
    Poll the progress of a running job.
    Returns the job dict minus the local file path (which the frontend doesn't need).
    """
    job = jobs.get(job_id)
    if not job:
        return jsonify(error="Unknown job"), 404

    # Don't expose the server-side file path to the client
    public = {k: v for k, v in job.items() if k != "path"}
    return jsonify(public), 200


@app.get("/api/file/<job_id>")
def serve_file(job_id):
    """
    Serve the finished file as a browser download.
    Only available once the job status is "done".
    """
    job = jobs.get(job_id)
    if not job or job.get("status") != "done":
        return jsonify(error="Not ready"), 404

    return send_file(
        job["path"],
        as_attachment=True,
        download_name=job["name"],
        conditional=True,  # supports HTTP range requests (resume in browser)
    )


# ── Entry point ────────────────────────────────────────────────────────────

if __name__ == "__main__":
    print("Studio running at http://localhost:5000")
    if os.path.isfile(COOKIE_FILE):
        print(f"  Using cookie file: {COOKIE_FILE}")
    else:
        print("  No cookies.txt found — Instagram/Facebook/X may not work without it.")

    app.run(host="127.0.0.1", port=5000, threaded=True)
