import { DatabaseSync } from 'node:sqlite';
import path from 'node:path';
import fs from 'node:fs';
const directory = process.env.DATA_DIR;
const target = process.argv[2];
if (!directory || !path.isAbsolute(directory) || !target || !path.isAbsolute(target)) throw new Error('Set absolute DATA_DIR and provide an absolute private backup destination');
if (fs.existsSync(target)) throw new Error('Backup destination must not already exist');
const source = path.join(directory, 'shares.sqlite');
if (!fs.existsSync(source)) throw new Error('Share database does not exist');
const db = new DatabaseSync(source);
try {
  db.exec('PRAGMA wal_checkpoint(FULL)');
  db.exec("VACUUM INTO '" + target.replaceAll("'", "''") + "'");
  fs.chmodSync(target, 0o600);
  console.log('Database snapshot created. Store privately; it contains disclosed records and token hashes.');
} finally { db.close(); }
