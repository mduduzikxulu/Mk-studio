"""Quick smoke-test: checks info extraction (no download) for each platform."""
import os, yt_dlp

BASE = os.path.dirname(os.path.abspath(__file__))
COOKIE_FILE = os.path.join(BASE, "cookies.txt")

test_urls = [
    ("YouTube",   "https://www.youtube.com/watch?v=dQw4w9WgXcQ"),
    ("TikTok",    "https://www.tiktok.com/@tiktok/video/6584647400055377158"),
    ("Instagram", "https://www.instagram.com/p/CmLkjklIFOB/"),
]

opts = {
    "quiet": True, "no_warnings": True, "noplaylist": True,
    "socket_timeout": 30,
    "skip_download": True,
    "extractor_args": {"youtube": {"player_client": ["visionos", "mweb"]}},
    "http_headers": {
        "User-Agent": (
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) "
            "AppleWebKit/537.36 (KHTML, like Gecko) "
            "Chrome/124.0.0.0 Safari/537.36"
        ),
    },
}
if os.path.isfile(COOKIE_FILE):
    opts["cookiefile"] = COOKIE_FILE
    print(f"Using cookies.txt\n")
else:
    print("No cookies.txt found (Instagram/Facebook will likely fail without it)\n")

for site, url in test_urls:
    try:
        with yt_dlp.YoutubeDL(opts) as y:
            d = y.extract_info(url, download=False)
        title = (d.get("title") or "(no title)")[:60]
        print(f"  [OK]   {site}: {title}")
    except Exception as e:
        err = str(e).split("\n")[0][:100]
        print(f"  [FAIL] {site}: {err}")
