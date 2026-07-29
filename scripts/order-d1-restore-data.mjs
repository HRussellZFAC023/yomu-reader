import { readFile, writeFile } from 'node:fs/promises';

const [schemaPath, dataPath, outputPath] = process.argv.slice(2);
if (!schemaPath || !dataPath || !outputPath) {
  throw new Error(
    'Usage: node scripts/order-d1-restore-data.mjs <schema.sql> <data.sql> <ordered-data.sql>',
  );
}

const splitStatements = (sql) => {
  const statements = [];
  let start = 0;
  let quote = null;

  for (let index = 0; index < sql.length; index += 1) {
    const character = sql[index];
    if (quote) {
      if (character === quote) {
        if (sql[index + 1] === quote) {
          index += 1;
        } else {
          quote = null;
        }
      }
      continue;
    }
    if (character === "'" || character === '"') {
      quote = character;
    } else if (character === ';') {
      const statement = sql.slice(start, index).trim();
      if (statement) statements.push(statement);
      start = index + 1;
    }
  }

  const trailing = sql.slice(start).trim();
  if (trailing) statements.push(trailing);
  return statements;
};

const unquoteIdentifier = identifier => identifier.replace(/^"|"$/g, '').replaceAll('""', '"');
const tableFromCreate = statement => statement.match(
  /^CREATE TABLE(?: IF NOT EXISTS)?\s+("(?:[^"]|"")+"|[^\s(]+)/i,
)?.[1];
const tableFromInsert = statement => statement.match(
  /^INSERT INTO\s+("(?:[^"]|"")+"|[^\s(]+)/i,
)?.[1];

const schemaStatements = splitStatements(await readFile(schemaPath, 'utf8'));
const dependencies = new Map();
for (const statement of schemaStatements) {
  const rawTable = tableFromCreate(statement);
  if (!rawTable) continue;
  const table = unquoteIdentifier(rawTable);
  const parents = [...statement.matchAll(/\bREFERENCES\s+("(?:[^"]|"")+"|[^\s(]+)/gi)]
    .map(match => unquoteIdentifier(match[1]))
    .filter(parent => parent !== table);
  dependencies.set(table, new Set(parents));
}

const leadingStatements = [];
const insertsByTable = new Map();
for (const statement of splitStatements(await readFile(dataPath, 'utf8'))) {
  const rawTable = tableFromInsert(statement);
  if (!rawTable) {
    leadingStatements.push(statement);
    continue;
  }
  const table = unquoteIdentifier(rawTable);
  const statements = insertsByTable.get(table) ?? [];
  statements.push(statement);
  insertsByTable.set(table, statements);
}

const orderedTables = [];
const visited = new Set();
const visiting = new Set();
const visit = (table) => {
  if (visited.has(table)) return;
  if (visiting.has(table)) {
    throw new Error(`Cannot produce a restore order because ${table} is in a foreign-key cycle.`);
  }
  visiting.add(table);
  for (const parent of dependencies.get(table) ?? []) {
    if (insertsByTable.has(parent)) visit(parent);
  }
  visiting.delete(table);
  visited.add(table);
  orderedTables.push(table);
};

for (const table of insertsByTable.keys()) visit(table);

const orderedStatements = [
  ...leadingStatements,
  ...orderedTables.flatMap(table => insertsByTable.get(table) ?? []),
];
await writeFile(outputPath, `${orderedStatements.join(';\n')};\n`);
console.log(`Ordered ${orderedStatements.length} D1 restore statements across ${orderedTables.length} tables.`);
