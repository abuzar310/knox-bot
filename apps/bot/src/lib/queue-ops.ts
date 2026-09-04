export type QueueTrack = {
  url: string;
  title: string;
  youtubeUrl?: string;
};

export function trackKey(track: QueueTrack) {
  return (track.youtubeUrl || track.url || track.title).trim().toLowerCase();
}

export function moveQueueItem<T>(queue: T[], fromPos: number, toPos: number): T | null {
  const from = fromPos - 1;
  const to = toPos - 1;
  if (from < 0 || from >= queue.length || to < 0 || to >= queue.length) return null;
  const [item] = queue.splice(from, 1);
  if (!item) return null;
  queue.splice(to, 0, item);
  return item;
}

export function stripQueueDupes<T extends QueueTrack>(queue: T[], current?: T | null) {
  const seen = new Set<string>();
  if (current) seen.add(trackKey(current));
  let removed = 0;
  const kept: T[] = [];
  for (const track of queue) {
    const key = trackKey(track);
    if (seen.has(key)) {
      removed += 1;
      continue;
    }
    seen.add(key);
    kept.push(track);
  }
  queue.splice(0, queue.length, ...kept);
  return removed;
}
