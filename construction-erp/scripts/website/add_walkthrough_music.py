from pathlib import Path
import math
import os
import shutil
import subprocess
import tempfile
import wave

import imageio_ffmpeg
import numpy as np


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
    """Create an original light, upbeat product-demo cue."""
    rng = np.random.default_rng(413)
    frames = int((seconds + 0.08) * SAMPLE_RATE)
    mix = np.zeros((frames, 2), dtype=np.float32)
    bpm = 112.0
    beat = 60.0 / bpm
    chords = (
        (130.81, 164.81, 196.00, 246.94),
        (98.00, 146.83, 196.00, 246.94),
        (110.00, 164.81, 196.00, 261.63),
        (87.31, 130.81, 164.81, 220.00),
    )

    def add_tone(start, length, frequency, level, pan=0.0, decay=0.0, bright=0.0):
        begin = max(0, int(start * SAMPLE_RATE))
        count = min(int(length * SAMPLE_RATE), frames - begin)
        if count <= 0:
            return
        t = np.arange(count, dtype=np.float32) / SAMPLE_RATE
        envelope = np.minimum(1.0, t / 0.018) * np.maximum(0.0, np.minimum(1.0, (length - t) / 0.08))
        if decay:
            envelope *= np.exp(-decay * t)
        tone = np.sin(2 * np.pi * frequency * t)
        tone += bright * np.sin(2 * np.pi * frequency * 2 * t)
        tone += bright * 0.25 * np.sin(2 * np.pi * frequency * 3 * t)
        tone *= envelope * level / (1.0 + bright * 1.25)
        mix[begin:begin + count, 0] += tone * math.sqrt((1.0 - pan) * 0.5)
        mix[begin:begin + count, 1] += tone * math.sqrt((1.0 + pan) * 0.5)

    def add_noise(start, length, level, pan=0.0, decay=14.0):
        begin = max(0, int(start * SAMPLE_RATE))
        count = min(int(length * SAMPLE_RATE), frames - begin)
        if count <= 1:
            return
        t = np.arange(count, dtype=np.float32) / SAMPLE_RATE
        raw = rng.normal(0.0, 1.0, count).astype(np.float32)
        sound = np.concatenate(([0.0], np.diff(raw))) * np.exp(-decay * t) * level
        mix[begin:begin + count, 0] += sound * math.sqrt((1.0 - pan) * 0.5)
        mix[begin:begin + count, 1] += sound * math.sqrt((1.0 + pan) * 0.5)

    arpeggio = (0, 2, 1, 3, 2, 1, 3, 2)
    for beat_index in range(int(math.ceil(seconds / beat))):
        start = beat_index * beat
        chord = chords[(beat_index // 8) % len(chords)]
        if beat_index % 8 == 0:
            for note_index, frequency in enumerate(chord):
                add_tone(start, beat * 8.1, frequency, 0.020, (note_index - 1.5) * 0.18, bright=0.10)
        if beat_index % 2 == 0:
            add_tone(start, beat * 1.2, chord[0] / 2, 0.055, -0.08, decay=2.2, bright=0.08)
        if beat_index % 4 in (0, 2):
            add_tone(start, 0.20, 68.0, 0.075, decay=16.0)
        else:
            add_noise(start, 0.10, 0.020, 0.08, decay=25.0)
        for half in range(2):
            step = beat_index * 2 + half
            frequency = chord[arpeggio[step % len(arpeggio)]] * 2
            pan = -0.22 if step % 2 == 0 else 0.22
            add_tone(start + half * beat / 2, beat * 0.48, frequency, 0.050, pan, decay=7.0, bright=0.32)
            add_noise(start + half * beat / 2, 0.045, 0.007, -pan, decay=36.0)

    melody = (523.25, 659.25, 783.99, 659.25, 587.33, 659.25, 523.25, 493.88)
    for phrase in np.arange(beat * 16, seconds, beat * 32):
        for offset, frequency in enumerate(melody):
            add_tone(float(phrase + offset * beat / 2), beat * 0.62, frequency, 0.038, 0.12, decay=5.2, bright=0.22)

    fade = max(1, int(0.65 * SAMPLE_RATE))
    mix[:fade] *= np.linspace(0.0, 1.0, fade, dtype=np.float32)[:, None]
    mix[-fade:] *= np.linspace(1.0, 0.0, fade, dtype=np.float32)[:, None]
    peak = float(np.max(np.abs(mix))) or 1.0
    mix *= min(1.0, 0.72 / peak)
    pcm = (np.clip(mix, -1.0, 1.0) * 32767).astype("<i2")
    with wave.open(str(path), "wb") as output:
        output.setnchannels(2)
        output.setsampwidth(2)
        output.setframerate(SAMPLE_RATE)
        output.writeframes(pcm.tobytes())


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
                    "-filter_complex",
                    "[0:a:0]volume=1.0[original];[1:a:0]volume=0.42[music];"
                    "[original][music]amix=inputs=2:duration=first:dropout_transition=2[audio]",
                    "-map", "0:v:0", "-map", "[audio]", "-c:v", "copy",
                    "-c:a", "aac", "-b:a", "160k", "-t", f"{video_duration:.3f}",
                    "-metadata:s:a:0", "title=Majal light demo soundtrack",
                    "-movflags", "+faststart", str(mixed),
                ],
                check=True,
            )
            output = video.with_name(f"{video.stem}.soundtrack-v2.mp4")
            shutil.copyfile(mixed, output)
        print(name)


if __name__ == "__main__":
    main()
