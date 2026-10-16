import Database from 'better-sqlite3';
import fs from 'node:fs';
import path from 'node:path';
import { initSchema } from './schema';
import { seedDatabase } from './seed';

let dbInstance: Database.Database | null = null;

export function getDatabasePath(): string {
  if (process.env.DATABASE_PATH && process.env.DATABASE_PATH.trim().length > 0) {
    return process.env.DATABASE_PATH;
  }
  return path.resolve(process.cwd(), 'data', 'taiada-fiscaliza.db');
}

export function initDatabase(customPath?: string): Database.Database {
  const dbPath = customPath || getDatabasePath();

  if (dbPath !== ':memory:') {
    const dir = path.dirname(dbPath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
  }

  const db = new Database(dbPath);

  // Pragmas obrigatórios de performance, integridade e concorrência
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');
  db.pragma('busy_timeout = 5000');

  // Inicializa o schema completo das 5 tabelas e índices
  initSchema(db);

  // Auto-seed atômico se o banco estiver vazio
  const row = db.prepare('SELECT COUNT(*) as count FROM issues').get() as { count: number };
  if (row.count === 0) {
    seedDatabase(db);
  }

  return db;
}

export function getDb(): Database.Database {
  if (!dbInstance) {
    dbInstance = initDatabase();
  }
  return dbInstance;
}

export function closeDb(): void {
  if (dbInstance) {
    try {
      dbInstance.close();
    } catch {
      // Ignore if already closed
    }
    dbInstance = null;
  }
}

// Fechamento limpo ao terminar o processo
process.on('exit', () => {
  closeDb();
});

export const db = getDb();
