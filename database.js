const sqlite3 = require('sqlite3').verbose();
const path = require('path');
const crypto = require('crypto');

const DB_PATH = path.join(__dirname, 'scoreboard.sqlite');
const db = new sqlite3.Database(DB_PATH);

// =========================
// INIT
// =========================

function initDatabase() {
    return new Promise((resolve, reject) => {
        db.serialize(() => {

            // Boards table
            db.run(`
                CREATE TABLE IF NOT EXISTS boards (
                    id INTEGER PRIMARY KEY AUTOINCREMENT,
                    board_id TEXT UNIQUE NOT NULL,
                    team_a_name TEXT DEFAULT 'المخربين',
                    team_b_name TEXT DEFAULT 'المساعدين',
                    team_a_score INTEGER DEFAULT 0,
                    team_b_score INTEGER DEFAULT 0,
                    created_at INTEGER DEFAULT (strftime('%s','now'))
                )
            `, (err) => {
                if (err) return reject(err);
                console.log('✅ Database initialized');
                resolve();
            });
        });
    });
}

// =========================
// HELPERS
// =========================

function run(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.run(sql, params, function (err) {
            if (err) reject(err);
            else resolve({ id: this.lastID, changes: this.changes });
        });
    });
}

function get(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.get(sql, params, (err, row) => {
            if (err) reject(err);
            else resolve(row);
        });
    });
}

function all(sql, params = []) {
    return new Promise((resolve, reject) => {
        db.all(sql, params, (err, rows) => {
            if (err) reject(err);
            else resolve(rows);
        });
    });
}

// =========================
// GENERATE BOARD ID
// =========================

function generateBoardId() {
    return crypto.randomBytes(8).toString('hex');
}

module.exports = {
    db,
    initDatabase,
    run,
    get,
    all,
    generateBoardId
};