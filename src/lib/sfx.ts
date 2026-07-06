import type { MediaType } from "./types";

/**
 * The site's sound layer, two voices sharing one AudioContext:
 *
 * 1. Press foley (playSfx) — one whisper of recorded foley per medium,
 *    matching each tile's physical metaphor: book → page turn ·
 *    music/podcast → needle drop · photo → vintage shutter ·
 *    movie/tv/video/article → typewriter key · other → soft click.
 *    Files in /public/sfx are pre-trimmed and loudness-matched; VOLUME
 *    keeps them at a whisper.
 *
 * 2. UI cues (playUi) — synthesized sine micro-tones, reserved for the two
 *    moments that complete something: confirm (favorited, followed) and
 *    reveal (onboarding "page is live"). Everything else stays silent on
 *    purpose. Synthesis over samples: exact attack/decay control, zero
 *    network weight, and they never drift out of loudness with the foley.
 *
 * Both voices honor the "fav:sounds" preference (Settings → Appearance).
 */

const SOUND: Record<MediaType, string> = {
  book: "book",
  movie: "article",
  tv: "article",
  music: "music",
  podcast: "music",
  video: "article",
  article: "article",
  photo: "photo",
  other: "other",
};

const VOLUME = 0.5;

const SOUNDS_KEY = "fav:sounds";

/** Site-wide sound preference — on unless the user turned it off in Settings. */
export function soundsEnabled(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SOUNDS_KEY) !== "off";
  } catch {
    return true;
  }
}

export function setSoundsEnabled(on: boolean) {
  try {
    localStorage.setItem(SOUNDS_KEY, on ? "on" : "off");
  } catch {}
}

let ctx: AudioContext | null = null;
const files = new Map<string, Promise<ArrayBuffer | null>>();
const buffers = new Map<string, Promise<AudioBuffer | null>>();

function fetchFile(name: string): Promise<ArrayBuffer | null> {
  let p = files.get(name);
  if (!p) {
    p = fetch(`/sfx/${name}.m4a`)
      .then((r) => (r.ok ? r.arrayBuffer() : null))
      .catch(() => null);
    files.set(name, p);
  }
  return p;
}

/** Warm the sound files over the network so the first press plays instantly. */
export function preloadSfx() {
  if (typeof window === "undefined") return;
  for (const name of new Set(Object.values(SOUND))) void fetchFile(name);
}

/** Fire-and-forget press sound for a piece of this medium. Never throws. */
export function playSfx(type: MediaType) {
  if (typeof window === "undefined" || !soundsEnabled()) return;
  try {
    // created inside the click gesture, so it starts (or resumes) running
    ctx ??= new AudioContext();
  } catch {
    return;
  }
  const ac = ctx;
  if (ac.state === "suspended") void ac.resume();

  // keyed by file name (movie + tv share one file) — decodeAudioData
  // detaches the ArrayBuffer, so each file may only be decoded once
  const name = SOUND[type] ?? "other";
  let buf = buffers.get(name);
  if (!buf) {
    buf = fetchFile(name).then((data) =>
      data ? ac.decodeAudioData(data).catch(() => null) : null
    );
    buffers.set(name, buf);
  }
  void buf.then((buffer) => {
    if (!buffer || ac.state !== "running") return;
    const src = ac.createBufferSource();
    src.buffer = buffer;
    const gain = ac.createGain();
    gain.gain.value = VOLUME;
    src.connect(gain);
    gain.connect(ac.destination);
    src.start();
  });
}

/* ── UI cues — synthesized micro-tones ─────────────────────────────────────── */

export type UiCue = "confirm" | "reveal";

/** One sine note: fast attack, exponential decay, optional cent detune
 *  (doubled notes → warm, rounded body). */
function note(
  ac: AudioContext,
  at: number,
  freq: number,
  dur: number,
  peak: number,
  detune?: number
) {
  const osc = ac.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(freq, at);
  if (detune) osc.detune.setValueAtTime(detune, at);
  const gain = ac.createGain();
  gain.gain.setValueAtTime(0, at);
  gain.gain.linearRampToValueAtTime(peak, at + 0.003);
  gain.gain.exponentialRampToValueAtTime(0.0001, at + dur);
  osc.connect(gain);
  gain.connect(ac.destination);
  osc.start(at);
  osc.stop(at + dur + 0.02);
}

/**
 * Fire-and-forget UI cue. Never throws; silently skips when sounds are off
 * or autoplay hasn't been unlocked by a gesture yet.
 *
 *   confirm — a favorite or follow landed: warm rising pair (D5 → A5),
 *             each note doubled ±5 cents so it reads felt, not beep
 *   reveal  — once, when the onboarding page goes live
 */
export function playUi(cue: UiCue) {
  if (typeof window === "undefined" || !soundsEnabled()) return;
  try {
    // created inside the gesture, so it starts (or resumes) running
    ctx ??= new AudioContext();
  } catch {
    return;
  }
  const ac = ctx;
  if (ac.state === "suspended") void ac.resume();
  const t = ac.currentTime;
  switch (cue) {
    case "confirm":
      note(ac, t, 587.33, 0.18, 0.024, -5);
      note(ac, t, 587.33, 0.18, 0.024, 5);
      note(ac, t + 0.095, 880, 0.3, 0.022, -5);
      note(ac, t + 0.095, 880, 0.3, 0.022, 5);
      note(ac, t + 0.095, 1760, 0.3, 0.007); // faint octave shimmer
      break;
    case "reveal":
      // C-major arpeggio landing on G with a faint octave shimmer
      note(ac, t, 523.25, 0.28, 0.04);
      note(ac, t + 0.09, 659.25, 0.28, 0.04);
      note(ac, t + 0.18, 783.99, 0.34, 0.04);
      note(ac, t + 0.18, 1567.98, 0.34, 0.015);
      break;
  }
}
