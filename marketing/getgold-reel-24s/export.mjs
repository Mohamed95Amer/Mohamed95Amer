// Render the reel to MP4: 1080 x 1920, 30 fps, exactly 720 frames (24.0 s),
// H.264 High + AAC 48 kHz stereo. Frames are captured from the same
// REEL.renderAt(t) the preview uses, at t = frame / 30.
//
//   node export.mjs [output.mp4]
import fs from "node:fs";
import path from "node:path";
import { once } from "node:events";
import { spawn, spawnSync, execFileSync } from "node:child_process";
import { openReel, ROOT } from "./tools/common.mjs";

const OUT = path.resolve(process.argv[2] || path.join(ROOT, "dist", "getgold-reel-24s.mp4"));
fs.mkdirSync(path.dirname(OUT), { recursive: true });
const WAV = OUT.replace(/\.mp4$/i, "") + "-soundtrack.wav";

const reel = await openReel();
const { page } = reel;
const meta = await page.evaluate(() => ({
  frames: REEL.FRAMES,
  fps: REEL.FPS,
  slots: REEL.state.slots,
  warnings: REEL.state.warnings,
  generatedMusic: REEL.audio.info.generatedMusic,
  voiceover: REEL.audio.info.voiceover,
}));
if (meta.warnings.length) console.warn("Warnings:", meta.warnings.join(" | "));

// Soundtrack, rendered in the page by the same code the preview plays.
fs.writeFileSync(WAV, Buffer.from(await page.evaluate(() => REEL.soundtrackWavBase64()), "base64"));

const ff = spawn(
  "ffmpeg",
  [
    "-y", "-loglevel", "error",
    "-f", "image2pipe", "-framerate", String(meta.fps), "-c:v", "png", "-i", "-",
    "-i", WAV,
    "-map", "0:v", "-map", "1:a",
    "-vf", "scale=out_color_matrix=bt709:out_range=tv,format=yuv420p",
    "-c:v", "libx264", "-preset", "slow", "-crf", "16", "-profile:v", "high", "-level:v", "4.1",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-r", String(meta.fps), "-frames:v", String(meta.frames),
    "-c:a", "aac", "-b:a", "192k", "-ar", "48000", "-ac", "2",
    "-t", String(meta.frames / meta.fps),
    "-movflags", "+faststart",
    "-metadata", "title=GetGold.ae, 24-second reel",
    OUT,
  ],
  { stdio: ["pipe", "inherit", "inherit"] },
);
const done = once(ff, "close");

const t0 = Date.now();
for (let f = 0; f < meta.frames; f++) {
  await page.evaluate((n) => REEL.seekFrame(n), f);
  const png = await page.screenshot({ type: "png", clip: { x: 0, y: 0, width: 1080, height: 1920 }, animations: "disabled", caret: "hide" });
  if (!ff.stdin.write(png)) await once(ff.stdin, "drain");
  if (f % 60 === 0 || f === meta.frames - 1) {
    process.stdout.write(`\rframe ${String(f + 1).padStart(3)} / ${meta.frames}  (${((Date.now() - t0) / 1000).toFixed(0)} s)`);
  }
}
ff.stdin.end();
const [code] = await done;
process.stdout.write("\n");
const pageErrors = reel.errors.slice();
await reel.close();
if (code !== 0) throw new Error("ffmpeg exited with code " + code);

// Verify what was actually written.
const probe = JSON.parse(
  execFileSync("ffprobe", ["-v", "error", "-count_frames", "-show_format", "-show_streams", "-of", "json", OUT]).toString(),
);
const v = probe.streams.find((s) => s.codec_type === "video");
const a = probe.streams.find((s) => s.codec_type === "audio");
const loud = spawnSync("ffmpeg", ["-hide_banner", "-nostats", "-i", OUT, "-af", "ebur128=peak=true", "-f", "null", "-"]).stderr.toString();
const lufsLine = (loud.match(/I:\s+-?[\d.]+ LUFS/g) || []).pop();
const peakLine = (loud.match(/Peak:\s+-?[\d.]+ dBFS/g) || []).pop();
const report = {
  file: OUT,
  bytes: fs.statSync(OUT).size,
  durationSec: Number(probe.format.duration),
  video: {
    codec: v.codec_name,
    profile: v.profile,
    width: v.width,
    height: v.height,
    orientation: v.height > v.width ? "portrait 9:16" : "landscape",
    fps: v.r_frame_rate,
    frames: Number(v.nb_read_frames),
    pixFmt: v.pix_fmt,
  },
  audio: a
    ? { codec: a.codec_name, sampleRate: Number(a.sample_rate), channels: a.channels, durationSec: Number(a.duration) }
    : null,
  integratedLoudness: lufsLine ? lufsLine.replace(/^I:\s+/, "") : "unknown",
  truePeak: peakLine ? peakLine.replace(/^Peak:\s+/, "") : "unknown",
  soundtrack: meta.generatedMusic ? "generated instrumental" : "supplied music",
  voiceover: meta.voiceover ? `from ${meta.voiceover.start}s to ${meta.voiceover.end.toFixed(2)}s` : "none",
  placeholders: Object.entries(meta.slots).filter(([, ok]) => !ok).map(([k]) => k),
  pageErrors,
};
fs.writeFileSync(OUT.replace(/\.mp4$/i, "") + "-report.json", JSON.stringify(report, null, 2));
console.log(JSON.stringify(report, null, 2));

const problems = [];
if (Math.abs(report.durationSec - 24) > 0.05) problems.push("duration is not 24.0 s");
if (report.video.width !== 1080 || report.video.height !== 1920) problems.push("frame size is not 1080 x 1920");
if (report.video.frames !== meta.frames) problems.push(`expected ${meta.frames} frames`);
if (!report.audio) problems.push("no audio stream");
if (problems.length) {
  console.error("Export check failed: " + problems.join("; "));
  process.exit(1);
}
