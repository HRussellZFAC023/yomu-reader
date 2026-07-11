#!/usr/bin/env node
import { execFileSync } from 'node:child_process';
import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const repoRoot = path.resolve(new URL('../..', import.meta.url).pathname);
const rawRoot = path.join(repoRoot, 'resources/yomu-academy/moodle-raw');
const manifestPath = path.join(rawRoot, 'manifest.json');
const publicRoot = path.join(repoRoot, 'apps/yomu-academy/public/academy');
const resourceOutDir = path.join(publicRoot, 'resources');
const patternOutDir = path.join(publicRoot, 'patterns');
const reportPath = path.join(repoRoot, 'artifacts/yomu-academy/reports/resource-pattern-report.md');

const patternDefinitions = [
  {
    id: 'vocabulary-sheets',
    title: 'Vocabulary sheets',
    description: 'Chapter vocabulary, topic vocabulary, and word-card material.'
  },
  {
    id: 'grammar-exercises',
    title: 'Grammar exercises',
    description: 'Grammar explanation, conjugation practice, and grammar review sheets.'
  },
  {
    id: 'homework',
    title: 'Homework',
    description: 'Homework folders/files, including HW and New_HW naming variants.'
  },
  {
    id: 'practice-worksheets',
    title: 'Practice worksheets',
    description: 'Worksheets, exercises, drills, and practice sheets.'
  },
  {
    id: 'listening-audio',
    title: 'Listening audio',
    description: 'MP3/audio tracks used for listening, dictation, and shadowing tasks.'
  },
  {
    id: 'listening-sheets',
    title: 'Listening sheets',
    description: 'PDF/DOC listening prompts, conversation listening tasks, and scripts.'
  },
  {
    id: 'conversation-dialogues',
    title: 'Conversation dialogues',
    description: 'Conversation videos, dialogue listening, and speaking-practice resources.'
  },
  {
    id: 'reading-practice',
    title: 'Reading practice',
    description: 'Reading, quiz, and reading-writing practice resources.'
  },
  {
    id: 'kana-practice',
    title: 'Kana practice',
    description: 'Hiragana, katakana, kana worksheets, and kana pre-study.'
  },
  {
    id: 'hiragana',
    title: 'Hiragana',
    description: 'Hiragana-specific worksheets and practice resources.'
  },
  {
    id: 'katakana',
    title: 'Katakana',
    description: 'Katakana-specific worksheets and practice resources.'
  },
  {
    id: 'kanji-practice',
    title: 'Kanji practice',
    description: 'Kanji worksheets, kanji exercise files, and kanji audio.'
  },
  {
    id: 'answer-keys',
    title: 'Answer keys',
    description: 'Files marked as answers or answer sheets.'
  },
  {
    id: 'reference-prestudy',
    title: 'Reference and pre-study',
    description: 'Reference vocabulary, self-study, pre-study, and course outline material.'
  }
];

function slug(value) {
  return String(value)
    .normalize('NFKD')
    .replace(/[^\p{Letter}\p{Number}]+/gu, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase()
    .slice(0, 80) || 'untitled';
}

function extname(value) {
  const ext = path.extname(value).replace(/^\./, '').toLowerCase();
  return ext || 'unknown';
}

function normalizeForMatch(value) {
  return String(value).normalize('NFKC').toLowerCase();
}

function addIf(patterns, id, condition) {
  if (condition) patterns.add(id);
}

function classify(name, module, section) {
  const text = normalizeForMatch(`${section.title} ${module.title} ${name}`);
  const ext = extname(name);
  const patterns = new Set();

  addIf(patterns, 'vocabulary-sheets', /vocab|vocabulary|word[ _-]?card|kotoba|語彙|単語/.test(text));
  addIf(patterns, 'grammar-exercises', /grammar|conjugation|plain style|conditional|volitional|imperative|prohibitive|文法|活用/.test(text));
  addIf(patterns, 'homework', /(^|[/ _-])hw([/ _-]|$)|new_hw|homework|宿題/.test(text));
  addIf(patterns, 'practice-worksheets', /worksheet|work[ _-]?sheet|exercise|practice|review|drill|quiz|れんしゅう|練習/.test(text));
  addIf(patterns, 'listening-audio', ext === 'mp3' || /audio materials|track [0-9]+|[ab]-[0-9]+\.mp3|minna_shokyu.*\.mp3/.test(text));
  addIf(patterns, 'listening-sheets', /listening|listen|audio materials|script|transcript|dictation|shadowing/.test(text) && ext !== 'mp3');
  addIf(patterns, 'conversation-dialogues', /conversation|dialogue|dialog|speaking|kaiwa|会話/.test(text));
  addIf(patterns, 'reading-practice', /reading|read[ _-]?write|yomimono|読|読み/.test(text));
  addIf(patterns, 'kana-practice', /kana|hiragana|katakana|かな|ひらがな|カタカナ/.test(text));
  addIf(patterns, 'hiragana', /hiragana|ひらがな/.test(text));
  addIf(patterns, 'katakana', /katakana|カタカナ/.test(text));
  addIf(patterns, 'kanji-practice', /kanji|漢字/.test(text));
  addIf(patterns, 'answer-keys', /answer|answers|answer key|解答|答え/.test(text));
  addIf(patterns, 'reference-prestudy', /reference|pre-study|prestudy|self study|course outline|introduction|参考|予習/.test(text));

  return [...patterns].sort();
}

function archivePathFor(course, section, module, index) {
  const destDir = path.join(rawRoot, course.id, section.id);
  const prefix = String(index + 1).padStart(2, '0');
  const baseName = `${prefix}-${module.type}-${module.id}-${slug(module.title)}`;
  if (!existsSync(destDir)) return null;
  const match = readdirSyncSafe(destDir).find((name) => name.startsWith(`${baseName}.`));
  return match ? path.join(destDir, match) : null;
}

function readdirSyncSafe(dir) {
  try {
    return execFileSync('find', [dir, '-maxdepth', '1', '-type', 'f', '-print0'])
      .toString('utf8')
      .split('\0')
      .filter(Boolean)
      .map((file) => path.basename(file));
  } catch {
    return [];
  }
}

function zipEntries(zipPath) {
  const output = execFileSync('zipinfo', ['-1', zipPath], {
    encoding: 'utf8',
    maxBuffer: 1024 * 1024 * 20
  });
  return output.split(/\r?\n/).filter(Boolean);
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf8'));
  const modules = [];
  const patternItems = Object.fromEntries(patternDefinitions.map((pattern) => [pattern.id, []]));
  const extensionCounts = new Map();

  for (const course of manifest.courses) {
    for (const section of course.sections) {
      for (const [index, module] of section.modules.entries()) {
        if (module.type !== 'folder' && module.type !== 'resource') continue;
        const archivePath = archivePathFor(course, section, module, index);
        const relativeArchivePath = archivePath ? path.relative(repoRoot, archivePath) : null;
        const moduleRecord = {
          id: `moodle-${module.id}`,
          moodleModuleId: module.id,
          type: module.type,
          title: module.title,
          courseId: course.id,
          courseTitle: course.title,
          sectionId: section.id,
          sectionTitle: section.title,
          archivePath: relativeArchivePath,
          contentCount: 0,
          patterns: [],
          contents: []
        };

        if (!archivePath) {
          moduleRecord.missing = true;
          modules.push(moduleRecord);
          continue;
        }

        const names = module.type === 'folder' ? zipEntries(archivePath) : [path.basename(archivePath)];
        const modulePatterns = new Set(classify(module.title, module, section));
        for (const name of names) {
          const ext = extname(name);
          extensionCounts.set(ext, (extensionCounts.get(ext) ?? 0) + 1);
          const patterns = classify(name, module, section);
          for (const pattern of patterns) {
            modulePatterns.add(pattern);
            patternItems[pattern].push({
              courseId: course.id,
              sectionId: section.id,
              moduleId: moduleRecord.id,
              moodleModuleId: module.id,
              moduleTitle: module.title,
              archivePath: relativeArchivePath,
              internalPath: module.type === 'folder' ? name : null,
              fileExtension: ext
            });
          }
          moduleRecord.contents.push({
            path: module.type === 'folder' ? name : null,
            fileName: path.basename(name),
            extension: ext,
            patterns
          });
        }

        moduleRecord.contentCount = moduleRecord.contents.length;
        moduleRecord.patterns = [...modulePatterns].sort();
        modules.push(moduleRecord);
      }
    }
  }

  await mkdir(resourceOutDir, { recursive: true });
  await mkdir(patternOutDir, { recursive: true });
  await mkdir(path.dirname(reportPath), { recursive: true });

  const patternSummary = patternDefinitions.map((pattern) => {
    const moduleIds = new Set(patternItems[pattern.id].map((item) => item.moduleId));
    const extensions = {};
    for (const item of patternItems[pattern.id]) {
      extensions[item.fileExtension] = (extensions[item.fileExtension] ?? 0) + 1;
    }
    return {
      ...pattern,
      itemCount: patternItems[pattern.id].length,
      moduleCount: moduleIds.size,
      extensions
    };
  });

  await writeFile(path.join(resourceOutDir, 'raw-modules.json'), `${JSON.stringify({
    schema: 'yomu-academy.raw-modules.v1',
    generated: new Date().toISOString(),
    sourceManifest: '../../../../../resources/yomu-academy/moodle-raw/manifest.json',
    modules
  }, null, 2)}\n`);

  await writeFile(path.join(patternOutDir, 'index.json'), `${JSON.stringify({
    schema: 'yomu-academy.pattern-index.v1',
    generated: new Date().toISOString(),
    source: 'resources/raw-modules.json',
    patterns: patternSummary.map((pattern) => ({
      id: pattern.id,
      title: pattern.title,
      description: pattern.description,
      itemCount: pattern.itemCount,
      moduleCount: pattern.moduleCount,
      path: `${pattern.id}.json`
    }))
  }, null, 2)}\n`);

  for (const pattern of patternDefinitions) {
    await writeFile(path.join(patternOutDir, `${pattern.id}.json`), `${JSON.stringify({
      schema: 'yomu-academy.pattern-view.v1',
      generated: new Date().toISOString(),
      pattern,
      items: patternItems[pattern.id]
    }, null, 2)}\n`);
  }

  const extensionRows = [...extensionCounts.entries()]
    .sort((a, b) => b[1] - a[1])
    .map(([ext, count]) => `| ${ext} | ${count} |`)
    .join('\n');
  const patternRows = patternSummary
    .sort((a, b) => b.itemCount - a.itemCount)
    .map((pattern) => `| ${pattern.title} | ${pattern.itemCount} | ${pattern.moduleCount} |`)
    .join('\n');
  const sectionRows = [];
  for (const course of manifest.courses) {
    for (const section of course.sections) {
      const count = modules.filter((module) => module.courseId === course.id && module.sectionId === section.id).length;
      sectionRows.push(`| ${course.year} | ${section.title} | ${count} |`);
    }
  }

  await writeFile(reportPath, `# Yomu Academy Resource Pattern Report

Generated: ${new Date().toISOString()}

## Coverage

- Moodle courses inventoried: ${manifest.courses.length}
- Downloaded Moodle folder/resource modules indexed: ${modules.length}
- Missing downloaded modules: ${modules.filter((module) => module.missing).length}
- Internal files indexed: ${modules.reduce((sum, module) => sum + module.contentCount, 0)}

## Sections

| Course | Section | Downloaded modules |
| --- | --- | ---: |
${sectionRows.join('\n')}

## File Types

| Extension | Count |
| --- | ---: |
${extensionRows}

## Patterns

| Pattern | Internal files | Modules touched |
| --- | ---: | ---: |
${patternRows}

## Suggested Academy Views

Some internal Japanese filenames appear with Moodle/zip filename-encoding mojibake.
The raw files are preserved unchanged; pattern detection relies mainly on stable
English labels such as "Vocabulary Sheet", "Grammar", "HW", "Listening", "Kanji",
"Hiragana", and "Katakana".

- **Chronological class flow:** use the existing Moodle section/order manifests for lesson-by-lesson playback.
- **Homework studio:** filter by \`homework\`, then offer completion, answer checking, and doodle upload where worksheets ask for writing.
- **Listening lab:** combine \`listening-audio\`, \`listening-sheets\`, \`conversation-dialogues\`, and \`answer-keys\` into dictation/shadowing/comprehension tasks.
- **Vocabulary deck builder:** use \`vocabulary-sheets\` and \`reference-prestudy\` as candidates for OCR-to-card extraction.
- **Kana/Kanji writing:** use \`kana-practice\`, \`hiragana\`, \`katakana\`, and \`kanji-practice\` with Yomu doodle canvas/stroke practice.
- **Grammar drills:** convert \`grammar-exercises\` and \`practice-worksheets\` into interactive cloze, transform, and sentence-ordering tasks.
`);

  console.log(JSON.stringify({
    modules: modules.length,
    internalFiles: modules.reduce((sum, module) => sum + module.contentCount, 0),
    patterns: patternSummary.map(({ id, itemCount, moduleCount }) => ({ id, itemCount, moduleCount }))
  }, null, 2));
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
