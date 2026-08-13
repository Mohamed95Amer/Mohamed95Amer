from pathlib import Path
import math
import os
import random
import shutil
import struct
import subprocess
import tempfile
import wave

import imageio_ffmpeg


ROOT = Path(__file__).resolve().parents[1]
VIDEO_DIR = ROOT / "assets" / "video"
VIDEOS = (
    "majal-construction-walkthrough.mp4",
    "majal-facilities-walkthrough.mp4",
    "majal-property-walkthrough.mp4",
)
SAMPLE_RATE = 44_100


def duration(ffmpeg: str, video: Path) -> float:
    process = subprocess.run(
        [ffmpeg, "-i", str(video)], capture_output=True, text=True, encoding="utf-8", errors="replace"
    )
    marker = "Duration: "
    line = next(line for line in process.stderr.splitlines() if marker in line)
    clock = line.split(marker, 1)[1].split(",", 1)[0]
    hours, minutes, seconds = clock.split(":")
    return int(hours) * 3600 + int(minutes) * 60 + float(seconds)


def make_bed(path: Path, seconds: float):
    # Original restrained ambient pattern: no sampled or third-party music.
    random.seed(413)
    chords = (
        (110.00, 164.81, 220.00),
        (98.00, 146.83, 196.00),
        (130.81, 196.00, 261.63),
        (87.31, 130.81, 174.61),
    )
    frames = int((seconds + 0.35) * SAMPLE_RATE)
    fade = int(0.45 * SAMPLE_RATE)
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        chunk = bytearray()
        for index in range(frames):
            t = index / SAMPLE_RATE
            chord = chords[int(t // 4) % len(chords)]
            pad = sum(math.sin(2 * math.pi * f * t) for f in chord) / len(chord)
            shimmer = math.sin(2 * math.pi * chord[2] * 2 * t) * 0.12
            pulse = 0.76 + 0.24 * math.sin(2 * math.pi * 0.25 * t) ** 2
            envelope = min(1.0, index / fade, (frames - index) / fade)
            sample = max(-1.0, min(1.0, (pad + shimmer) * pulse * envelope * 0.18))
            pcm = int(sample * 32767)
            chunk.extend(struct.pack("<hh", pcm, pcm))
            if len(chunk) >= 65_536:
                output.writeframesraw(chunk)
                chunk.clear()
        if chunk:
            output.writeframesraw(chunk)


def main():
    ffmpeg = imageio_ffmpeg.get_ffmpeg_exe()
    for name in VIDEOS:
        video = VIDEO_DIR / name
        if not video.exists():
            raise FileNotFoundError(video)
        video_duration = duration(ffmpeg, video)
        with tempfile.TemporaryDirectory(prefix="majal-music-") as temp_dir:
            temp = Path(temp_dir)
            bed = temp / "bed.wav"
            mixed = temp / name
            make_bed(bed, video_duration)
            subprocess.run(
                [
                    ffmpeg, "-y", "-i", str(video), "-i", str(bed),
                    "-map", "0:v:0", "-map", "1:a:0", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "128k", "-t", f"{video_duration:.3f}",
                    "-metadata:s:a:0", "title=Majal original ambient soundtrack",
                    "-movflags", "+faststart", str(mixed),
                ],
                check=True,
            )
            output = video.with_name(f"{video.stem}.soundtrack.mp4")
            shutil.copyfile(mixed, output)
        print(name)


if __name__ == "__main__":
    main()
