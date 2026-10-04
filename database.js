const { Pool } = require('pg');
const crypto = require('crypto');

const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl: process.env.NODE_ENV === 'production' 
        ? { rejectUnauthorized: false } 
        : false
});

// =========================
// INIT DATABASE
// =========================

async function initDatabase() {
    const client = await pool.connect();

    try {
        await client.query(`
            CREATE TABLE IF NOT EXISTS boards (
                id SERIAL PRIMARY KEY,
                board_id TEXT UNIQUE NOT NULL,
                team_a_name TEXT DEFAULT 'المخربين',
                team_b_name TEXT DEFAULT 'المساعدين',
                team_a_score INTEGER DEFAULT 0,
                team_b_score INTEGER DEFAULT 0,
                created_at BIGINT DEFAULT EXTRACT(EPOCH FROM NOW())
            )
        `);

        console.log('✅ Database initialized');
    } finally {
        client.release();
    }
}

// =========================
// HELPERS
// =========================

async function run(sql, params = []) {
    const result = await pool.query(sql, params);
    return { rows: result.rows, rowCount: result.rowCount };
}

async function get(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows[0];
}

async function all(sql, params = []) {
    const result = await pool.query(sql, params);
    return result.rows;
}

// =========================
// GENERATE BOARD ID
// =========================

function generateBoardId() {
    return crypto.randomBytes(8).toString('hex');
}

module.exports = {
    pool,
    initDatabase,
    run,
    get,
    all,
    generateBoardId
};
