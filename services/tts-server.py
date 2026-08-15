"""TTS HTTP server - VOICEVOX(黒沢冴白) + DeepL API -> DeepLX dual-path translation"""

import base64
import json
import os
import re
import urllib.request
import urllib.parse
from http.server import HTTPServer, BaseHTTPRequestHandler
from typing import Optional

PORT = 39171

# VOICEVOX
VVOX_SPEAKER = 100  # 黒沢冴白
VVOX_URL = "http://127.0.0.1:50021"
VVOX_PARAMS = {
    "speedScale": 1.08,
    "pitchScale": 0.04,
    "intonationScale": 0.92,
    "volumeScale": 1.0,
}

# DeepLX fallback
DEEPLX_URL = "http://127.0.0.1:1188/translate"
DEEPL_API_KEY = ""
DEEPL_API_URL = "https://api-free.deepl.com/v2/translate"

# Vowel -> mouth shape mapping for Live2D
# ParamMouthOpenY (0-1 vertical open), ParamMouthForm (-1 stretched to +1 rounded)
VOWEL_MOUTH = {
    "a": {"open": 0.75, "form": 0.0},   # wide open
    "i": {"open": 0.20, "form": 0.55},  # stretched wide, almost closed
    "u": {"open": 0.12, "form": -0.45}, # pursed/rounded, lips forward
    "e": {"open": 0.45, "form": 0.25},  # medium open, slight stretch
    "o": {"open": 0.55, "form": -0.30}, # rounded medium
    "N": {"open": 0.05, "form": 0.0},   # closed (syllabic n)
}


def load_env():
    global DEEPL_API_KEY
    env_paths = [
        os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", ".env"),
        ".env",
    ]
    for env_path in env_paths:
        try:
            with open(env_path, "r", encoding="utf-8") as f:
                for line in f:
                    line = line.strip()
                    if not line or line.startswith("#"):
                        continue
                    if "=" not in line:
                        continue
                    key, _, val = line.partition("=")
                    key = key.strip()
                    val = val.strip()
                    if key == "DEEPL_API_KEY" and val:
                        DEEPL_API_KEY = val
        except FileNotFoundError:
            continue


def is_japanese(text: str) -> bool:
    return bool(re.search(r'[぀-ゟ゠-ヿ]', text))


def translate_deepl_api(text: str) -> Optional[str]:
    if not DEEPL_API_KEY:
        return None
    body = json.dumps({
        "text": [text],
        "source_lang": "ZH",
        "target_lang": "JA",
    }).encode()
    try:
        req = urllib.request.Request(
            DEEPL_API_URL,
            data=body,
            headers={
                "Content-Type": "application/json",
                "Authorization": f"DeepL-Auth-Key {DEEPL_API_KEY}",
            },
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            result = json.loads(raw.decode('utf-8'))
            ja = result.get("translations", [{}])[0].get("text", "")
            if ja and is_japanese(ja):
                return ja
    except Exception as e:
        print(f"[tts] DeepL API error: {e}")
    return None


def translate_deeplx(text: str) -> Optional[str]:
    body = json.dumps({
        "text": text,
        "source_lang": "ZH",
        "target_lang": "JA",
    }).encode()
    try:
        req = urllib.request.Request(
            DEEPLX_URL,
            data=body,
            headers={"Content-Type": "application/json"},
        )
        with urllib.request.urlopen(req, timeout=10) as r:
            raw = r.read()
            result = json.loads(raw.decode('utf-8'))
            ja = result.get("data", "")
            if ja and is_japanese(ja):
                return ja
    except Exception as e:
        print(f"[tts] DeepLX error: {e}")
    return None


def translate_zh_to_ja(text: str) -> str:
    ja = translate_deepl_api(text)
    if ja:
        print(f"[tts] DeepL API OK: {text[:30]} -> {ja[:30]}")
        return ja
    ja = translate_deeplx(text)
    if ja:
        print(f"[tts] DeepLX OK: {text[:30]} -> {ja[:30]}")
        return ja
    print(f"[tts] translate FAIL, raw: {text[:30]}")
    return text


def voicevox_query_and_synthesize(text: str):
    """VOICEVOX: get phoneme timeline from audio_query, then synthesize WAV.
    Returns (wav_bytes, phoneme_timeline).
    phoneme_timeline: [{t_ms, vowel, open, form}, ...]"""
    q = urllib.parse.quote(text)
    query_url = f"{VVOX_URL}/audio_query?text={q}&speaker={VVOX_SPEAKER}"
    req = urllib.request.Request(query_url, data=b"", method="POST")
    with urllib.request.urlopen(req) as r:
        query = json.loads(r.read())

    # Build phoneme timeline from moras (compensate for speedScale)
    speed = VVOX_PARAMS.get("speedScale", 1.0)
    phonemes = []
    t_ms = query.get("prePhonemeLength", 0.1) * 1000 / speed  # pre-silence

    for phrase in query.get("accent_phrases", []):
        for mora in phrase.get("moras", []):
            cons_len = (mora.get("consonant_length") or 0) * 1000 / speed
            vowel_len = mora.get("vowel_length", 0) * 1000 / speed
            vowel = mora.get("vowel", "a")

            # Vowel starts after consonant
            t_ms += cons_len
            mouth = VOWEL_MOUTH.get(vowel, VOWEL_MOUTH["a"])
            dur = max(round(vowel_len), 40)  # 最少 40ms，避免嘴闪
            phonemes.append({
                "t": round(t_ms),
                "d": dur,
                "v": vowel,
                "oy": mouth["open"],
                "of": mouth["form"],
            })
            t_ms += vowel_len

    # Apply speed/intontation/pitch to query
    for key, val in VVOX_PARAMS.items():
        query[key] = val

    synth_body = json.dumps(query).encode()
    synth_req = urllib.request.Request(
        f"{VVOX_URL}/synthesis?speaker={VVOX_SPEAKER}",
        data=synth_body,
        headers={"Content-Type": "application/json"},
    )
    with urllib.request.urlopen(synth_req) as r:
        wav = r.read()

    return wav, phonemes


class TtsHandler(BaseHTTPRequestHandler):
    def do_POST(self):
        if self.path != "/speak":
            self.send_response(404)
            self.end_headers()
            return

        length = int(self.headers.get("Content-Length", 0))
        body = json.loads(self.rfile.read(length))
        text = body.get("text", "").strip()

        if not text:
            self.send_response(400)
            self.end_headers()
            return

        try:
            if is_japanese(text):
                speak_text = text
                label = "VOICEVOX direct"
            else:
                speak_text = translate_zh_to_ja(text)
                label = "DeepL/DeepLX -> VOICEVOX"

            wav, phonemes = voicevox_query_and_synthesize(speak_text)
            payload = json.dumps({
                "phonemes": phonemes,
                "wav": base64.b64encode(wav).decode("ascii"),
            }).encode()
        except Exception as e:
            print(f"[tts] error: {e}")
            self.send_response(500)
            self.end_headers()
            return

        print(f"[tts] {label}: {speak_text[:40]}... ({len(phonemes)} phonemes)")

        # If client asks for raw WAV (old format), send WAV only
        if body.get("raw"):
            self.send_response(200)
            self.send_header("Content-Type", "audio/wav")
            self.send_header("Content-Length", len(wav))
            self.end_headers()
            try:
                self.wfile.write(wav)
            except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
                pass
            return

        # New format: JSON with phonemes + base64 WAV
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", len(payload))
        self.end_headers()
        try:
            self.wfile.write(payload)
        except (ConnectionAbortedError, ConnectionResetError, BrokenPipeError):
            pass

    def log_message(self, format, *args):
        pass


if __name__ == "__main__":
    load_env()
    server = HTTPServer(("127.0.0.1", PORT), TtsHandler)
    print(f"[tts-server] http://127.0.0.1:{PORT}")
    print(f"[tts-server] VOICEVOX speaker={VVOX_SPEAKER} (黒沢冴白) with phoneme timeline")
    print(f"[tts-server] DeepL API: {'Y' if DEEPL_API_KEY else 'N (no key)'}")
    print(f"[tts-server] DeepLX: {DEEPLX_URL}")
    try:
        server.serve_forever()
    except KeyboardInterrupt:
        pass
