import sqlite3 from 'sqlite3';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const dbPath = process.env.DB_PATH || join(__dirname, '../data.db');

// Ensure parent directory exists
const dbDir = dirname(dbPath);
if (!fs.existsSync(dbDir)) {
  fs.mkdirSync(dbDir, { recursive: true });
}

let resolveDbReady;
let rejectDbReady;
export const dbReady = new Promise((resolve, reject) => {
  resolveDbReady = resolve;
  rejectDbReady = reject;
});

const db = new sqlite3.Database(dbPath, (err) => {
  if (err) {
    console.error('Error opening database:', err);
    rejectDbReady(err);
  } else {
    console.log('Database connected successfully at:', dbPath);
    initDb();
  }
});

function initDb() {
  db.serialize(() => {
    db.run(`
      CREATE TABLE IF NOT EXISTS leads (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        brand_name TEXT NOT NULL,
        phone TEXT UNIQUE,
        website TEXT,
        facebook TEXT,
        address TEXT,
        ward TEXT,
        district TEXT,
        city TEXT,
        verification_status TEXT DEFAULT 'unverified',
        verification_notes TEXT,
        zalo_status TEXT DEFAULT 'pending',
        zalo_notes TEXT,
        sheet_sync_status TEXT DEFAULT 'pending',
        assigned_zalo_account_id INTEGER,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS configs (
        key TEXT PRIMARY KEY,
        value TEXT
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS scheduler_queue (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        keyword TEXT NOT NULL,
        location TEXT NOT NULL,
        status TEXT DEFAULT 'pending',
        leads_found INTEGER DEFAULT 0,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_scheduler_queue_keyword_location
      ON scheduler_queue (keyword, location)
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS zalo_chat_logs (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        lead_id INTEGER NOT NULL,
        sender TEXT NOT NULL,
        message TEXT NOT NULL,
        timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
        zalo_account_id INTEGER,
        FOREIGN KEY(lead_id) REFERENCES leads(id)
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS zalo_accounts (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        phone TEXT UNIQUE,
        display_name TEXT,
        session_dir TEXT NOT NULL,
        status TEXT DEFAULT 'disconnected',
        custom_name TEXT,
        assigned_regions TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        updated_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    db.run(`
      CREATE TABLE IF NOT EXISTS users (
        id INTEGER PRIMARY KEY AUTOINCREMENT,
        username TEXT UNIQUE NOT NULL,
        password TEXT NOT NULL,
        role TEXT NOT NULL DEFAULT 'staff',
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP
      )
    `);

    // Migration for existing tables
    db.run("ALTER TABLE zalo_accounts ADD COLUMN custom_name TEXT", (err) => {});
    db.run("ALTER TABLE zalo_accounts ADD COLUMN assigned_regions TEXT", (err) => {});
    
    // Register default configs
    db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('n8n_webhook_token', 'n8n_zalo_secure_token_2026')");
    db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('n8n_chatbot_webhook_url', '')");
    db.run("INSERT OR IGNORE INTO users (username, password, role) VALUES ('admin', 'Toluckphattrien2026', 'admin')");
    db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('smtp_host', 'smtp.gmail.com')");
    db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('smtp_port', '587')");
    db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('smtp_user', '')");
    db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('smtp_pass', '')");
    db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('smtp_from', '')");
    db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('report_receiver', '')");
    db.run("INSERT OR IGNORE INTO configs (key, value) VALUES ('email_reporting_enabled', 'false')");
    db.run("SELECT 1", () => {
      resolveDbReady();
    });
  });
}

// Promisified database functions
export function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ id: this.lastID, changes: this.changes });
    });
  });
}

export function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

export function all(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => {
      if (err) reject(err);
      else resolve(rows);
    });
  });
}

export default db;
