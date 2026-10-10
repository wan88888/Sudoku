import { writeFileSync } from 'node:fs';
import { build } from 'vite';

// Generate offline; never search for a suitable puzzle on the player's UI thread.
async function loadModule(entry) {
  const output = await build({
    configFile: false,
    logLevel: 'silent',
    build: { write: false, minify: false, lib: { entry, formats: ['es'] } },
  });
  const chunk = output[0].output.find(item => item.type === 'chunk');
  return import('data:text/javascript;base64,' + Buffer.from(chunk.code).toString('base64'));
}

const { SudokuEngine } = await loadModule('src/game/simulation/sudokuEngine.ts');
const { DIFFICULTY_THRESHOLDS } = await loadModule('src/game/simulation/difficultyThresholds.ts');
{
  const engine = new SudokuEngine();
  const classes = ['easy', 'normal', 'hard', 'expert', 'master'];
  const bands = DIFFICULTY_THRESHOLDS.bands.slice().sort((a, b) => a.minScore - b.minScore);
  const ranges = bands.map((band, i) => [band.minScore, bands[i + 1]?.minScore ?? Infinity]);
  const buckets = classes.map(() => []);
  const seen = new Set();
  for (let seed = 1; seed <= 2000; seed++) {
    const clues = 46 - ((seed - 1) % 25);
    const board = engine.getOrCreateLegacyLevel(seed, clues);
    const rating = board.difficulty;
    const bucket = classes.indexOf(rating.className);
    const puzzle = board.puzzle.join('');
    if (rating.score >= ranges[bucket][0] && rating.score < ranges[bucket][1] && !seen.has(puzzle)) {
      seen.add(puzzle);
      buckets[bucket].push({ puzzle, solution: board.solution.join(''), ...rating });
    }
    if (buckets.every(entries => entries.length >= 40)) break;
  }
  const levels = buckets.flatMap((entries, index) => {
    if (entries.length < 20) throw new Error(`Insufficient ${classes[index]} puzzles: ${entries.length}`);
    entries.sort((a, b) => a.score - b.score || a.puzzle.localeCompare(b.puzzle));
    return Array.from({ length: 20 }, (_, i) => entries[Math.floor(i * (entries.length - 1) / 19)]);
  });
  writeFileSync('src/game/simulation/levelBank.json', JSON.stringify(levels, null, 2) + '\n');
  console.log('Generated 100 unique puzzles in five bands with non-decreasing difficulty scores.');
}
