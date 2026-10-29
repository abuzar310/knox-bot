// Sentences people say to a music bot. A game question such as "what can I play" is not a song.

export type MusicAsk =
  | { kind: "play"; query: string }
  | { kind: "skip" }
  | { kind: "pause" }
  | { kind: "resume" }
  | { kind: "stop" }
  | { kind: "leave" }
  | { kind: "shuffle" }
  | { kind: "loop" }
  | { kind: "lyrics" }
  | { kind: "queue" }
  | { kind: "replay" }
  | { kind: "grab" }
  | { kind: "volume"; value: number }
  | { kind: "filter"; name: string };

const GAME = /\b(what can i play|what do i play|play a game|play games|can i play|should i play)\b/i;

export function parseMusicAsk(text: string): MusicAsk | null {
  const t = text.trim().replace(/[.!?]+$/g, "").replace(/\s+/g, " ");
  if (!t || GAME.test(t)) return null;

  const volume = t.match(/^(?:set )?volume(?: to)? (\d{1,3})$/i);
  if (volume) return { kind: "volume", value: Math.min(100, Math.max(1, Number(volume[1]))) };

  const filter = t.match(/^(?:filter|effect) ([a-z0-9]+)$/i);
  if (filter) return { kind: "filter", name: filter[1].toLowerCase() };

  if (/^(?:skip|next|skip this|next song|next track|play (?:the )?next(?: song| track)?)$/i.test(t)) return { kind: "skip" };
  if (/^(?:pause|pause (?:the )?music|hold the music)$/i.test(t)) return { kind: "pause" };
  if (/^(?:resume|unpause|continue|keep playing)$/i.test(t)) return { kind: "resume" };
  if (/^(?:stop|stop (?:the )?music|stop playing)$/i.test(t)) return { kind: "stop" };
  if (/^(?:leave voice|leave the call|disconnect|leave the voice channel)$/i.test(t)) return { kind: "leave" };
  if (/^shuffle(?: the queue)?$/i.test(t)) return { kind: "shuffle" };
  if (/^loop(?: (?:the )?(?:song|track|queue))?$/i.test(t)) return { kind: "loop" };
  if (/^lyrics$/i.test(t)) return { kind: "lyrics" };
  if (/^(?:queue|what'?s playing|whats playing|now playing|np)$/i.test(t)) return { kind: "queue" };
  if (/^(?:replay|restart(?: the song)?|start over)$/i.test(t)) return { kind: "replay" };
  if (/^(?:grab|save this song|send me this song)$/i.test(t)) return { kind: "grab" };

  const play = t.match(/^(?:please |can you |could you )?(?:play|put on|queue up) (.+)$/i);
  if (!play) return null;
  const query = play[1].trim();
  if (query.length < 2 || query.length > 200) return null;
  if (/^(?:the )?music$/i.test(query)) return null;
  if (/^(?:a |some )?(?:game|games)\b/i.test(query)) return null;
  return { kind: "play", query };
}
