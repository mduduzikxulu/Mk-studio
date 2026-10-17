# Studio
Audio mixer with two arrangeable tracks, plus a video downloader. No login.

## Run
    pip install -r requirements.txt
    python app.py
Open http://localhost:5000

## Notes
- Mix two audio files in your browser: trim their waveforms, position them on the shared timeline, set volume, and preview or scrub the result. Files are not uploaded.
- Music volume stays steady by default. Optional ducking lowers track 2 while track 1 has speech.
- Export the mix as WAV or MP3.
- Downloads use yt-dlp: auto-retry, resumes partial files, and the saved file supports HTTP Range.
- Keep yt-dlp current (`pip install -U yt-dlp`) - sites change often.
- Instagram/Facebook private or age-gated posts may need cookies (see yt-dlp docs).
- Only download content you own or have permission to save.
