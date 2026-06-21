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

function tone(freq: number, durationMs: number, type: OscillatorType, gain = 0.16): void {
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
  tone(180, 260, "sawtooth", 0.12);
  setTimeout(() => tone(110, 320, "sawtooth", 0.12), 80);
}
