/**
 * Efeitos sonoros sintetizados via Web Audio (sem assets). O AudioContext é criado lazy no
 * primeiro uso (após um gesto do usuário, como exige o browser). Cada som é um envelope curto.
 */
let ctx: AudioContext | undefined;

function audio(): AudioContext | undefined {
  if (typeof window === "undefined") return undefined;
  if (!ctx) {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return undefined;
    ctx = new Ctor();
  }
  void ctx.resume();
  return ctx;
}

function tone(freq: number, durationMs: number, type: OscillatorType, gain = 0.08): void {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const vol = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  vol.gain.setValueAtTime(gain, ac.currentTime);
  vol.gain.exponentialRampToValueAtTime(0.0001, ac.currentTime + durationMs / 1000);
  osc.connect(vol).connect(ac.destination);
  osc.start();
  osc.stop(ac.currentTime + durationMs / 1000);
}

/** Aposta confirmada: blip curto. */
export function playBet(): void {
  tone(440, 90, "triangle");
}

/** Cashout: dois tons ascendentes (celebração). */
export function playCashout(): void {
  tone(660, 110, "sine");
  setTimeout(() => tone(880, 140, "sine"), 90);
}

/** Crash: tom grave descendente. */
export function playCrash(): void {
  tone(180, 260, "sawtooth", 0.06);
  setTimeout(() => tone(110, 320, "sawtooth", 0.06), 80);
}
