const KEY = 'chromafall.highscores.v1';
const MAX_ENTRIES = 10;

export interface HighScoreEntry {
  score: number;
  date: string;
}

export function loadHighScores(): HighScoreEntry[] {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    return parsed as HighScoreEntry[];
  } catch {
    return [];
  }
}

export function saveHighScore(score: number): HighScoreEntry[] {
  const list = loadHighScores();
  list.push({ score, date: new Date().toISOString() });
  list.sort((a, b) => b.score - a.score);
  const top = list.slice(0, MAX_ENTRIES);
  try {
    localStorage.setItem(KEY, JSON.stringify(top));
  } catch {
    // storage full or disabled; ignore
  }
  return top;
}
