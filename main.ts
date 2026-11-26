// Sky Courier — Ring Runner over Meridian Bay: the hand-in program.
//
// Node 22, standard library only. It gathers the entry — the game in
// game/ and the screenshots in screenshots/ — into the output directory
// and writes the dossier the judge reads, built with the kit's vendored
// make.fun library. The grader runs it twice and the two runs must write
// identical bytes, so there is no clock, no randomness and no network
// here: pure copies plus a pure function.
import { cpSync, existsSync, mkdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { buildDossier } from './vendor/makefun-game.ts';

// The repository root is the directory this file lives in.
const repoRoot = fileURLToPath(new URL('.', import.meta.url));
// Outside the grader, MAKEFUN_OUTPUT_DIR stands in for /output.
const outDir = process.env.MAKEFUN_OUTPUT_DIR ?? '/output';

mkdirSync(outDir, { recursive: true });

// The game: plain static files, game/index.html and its modules.
cpSync(join(repoRoot, 'game'), join(outDir, 'game'), { recursive: true });

// The screenshots: 3 or 4 real renders of the game, first by name the cover.
mkdirSync(join(outDir, 'screenshots'), { recursive: true });
if (existsSync(join(repoRoot, 'screenshots'))) {
  cpSync(join(repoRoot, 'screenshots'), join(outDir, 'screenshots'), {
    recursive: true,
  });
}

// The dossier: the Game block, the sources and the screenshots, exactly
// as the kit library writes them. Caps are the gate's own, so a program
// that passes here hands in an entry the scorer accepts.
const dossier = buildDossier(outDir, {
  text_max_bytes: 163840,
  screenshots: { max: 4, max_bytes: 262144 },
  game_max_files: 993,
  game_max_bytes: 50331648,
  game_path_max_bytes: 1000,
});
writeFileSync(join(outDir, 'dossier.json'), dossier);
