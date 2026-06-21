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

/**
 * Cria/retoma o AudioContext durante um gesto do usuário (exigência do browser). Sem este unlock o
 * primeiro som — que pode ser um crash sem clique imediato — nasceria num contexto suspenso e mudo.
 */
export function unlockAudio(): void {
  audio();
}

function tone(freq: number, durationMs: number, type: OscillatorType, gain = 0.5): void {
  const ac = audio();
  if (!ac) return;
  const osc = ac.createOscillator();
  const vol = ac.createGain();
  osc.type = type;
  osc.frequency.value = freq;
  const t0 = ac.currentTime;
  const dur = durationMs / 1000;
  vol.gain.setValueAtTime(0.0001, t0);
  vol.gain.exponentialRampToValueAtTime(gain, t0 + 0.01); // attack rápido (audível)
  vol.gain.exponentialRampToValueAtTime(0.0001, t0 + dur);
  osc.connect(vol).connect(ac.destination);
  osc.start(t0);
  osc.stop(t0 + dur);
}

/** Aposta confirmada: blip curto. */
export function playBet(): void {
  tone(440, 120, "triangle", 0.45);
}

/** Cashout: dois tons ascendentes (celebração). */
export function playCashout(): void {
  tone(660, 140, "sine", 0.5);
  setTimeout(() => tone(880, 180, "sine", 0.5), 100);
}

/** Crash: tom grave descendente. */
export function playCrash(): void {
  tone(200, 280, "sawtooth", 0.4);
  setTimeout(() => tone(110, 340, "sawtooth", 0.4), 90);
}
