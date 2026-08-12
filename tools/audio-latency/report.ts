/**
 * Macht aus dem Rohbericht der Messung (index.html / measure.mjs) die Tabelle
 * und den Spruch, die auf die Karte c0081 kommen — über genau die Funktionen,
 * die src/core/audiolatency.spec.ts prüft:
 *
 *   npx vite-node tools/audio-latency/report.ts tools/audio-latency/measurements/*.json
 */
import { readFileSync } from 'node:fs';
import {
  parseReport,
  formatReport,
  budgetOf,
  recommend,
  compareArms,
  bufferFrames,
  judgeReport,
  RENDER_QUANTUM,
} from '../../src/core/audiolatency';

const files = process.argv.slice(2).filter((a) => a.endsWith('.json'));
if (files.length === 0) {
  console.error('Aufruf: vite-node tools/audio-latency/report.ts <messung.json> …');
  process.exit(2);
}

for (const file of files) {
  const report = parseReport(readFileSync(file, 'utf8'));
  if (!report) {
    console.error(`${file}: kein brauchbarer Bericht.`);
    process.exitCode = 1;
    continue;
  }

  console.log(`\n## ${report.platform} — ${report.shell}  (${file})\n`);
  console.log(formatReport(report));

  console.log('\nPuffer je Arm:');
  for (const arm of report.arms) {
    const frames = bufferFrames(arm);
    console.log(`  ${arm.label}: ${frames} Bilder = ${frames / RENDER_QUANTUM} Renderquanten`);
  }

  console.log('\nSpruch je Arm:');
  for (const arm of report.arms) {
    const r = recommend(arm);
    console.log(`  [${r.verdict}] ${arm.label} — überwiegt: ${r.dominant}. ${r.reason}`);
  }

  const baseline = report.arms[0];
  console.log(`\nGegenüber „${baseline.label}“ (${budgetOf(baseline).total.toFixed(1)} ms):`);
  for (const arm of report.arms.slice(1)) {
    const delta = compareArms(baseline, arm);
    console.log(`  ${delta >= 0 ? '+' : ''}${delta.toFixed(1)} ms — ${arm.label}`);
  }

  const whole = judgeReport(report);
  console.log(
    `\nÜber den ganzen Lauf: [${whole.verdict}] bester Arm „${whole.best.label}“ ` +
      `mit ${whole.bestMs.toFixed(1)} ms; der latencyHint bewegt ` +
      `${whole.hintEffectMs.toFixed(1)} ms.\n  ${whole.reason}`,
  );
}
