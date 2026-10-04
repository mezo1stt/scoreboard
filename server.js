const express = require('express');
const path = require('path');
const fs = require('fs');
const { initDatabase, run, get, all, generateBoardId } = require('./database');

const app = express();
const PORT = process.env.PORT || 3000;

// =========================
// CONFIG FILE
// =========================

const CONFIG_PATH = path.join(__dirname, 'config.json');

function loadConfig() {
    try {
        if (fs.existsSync(CONFIG_PATH)) {
            return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8'));
        }
    } catch (err) {
        console.error('Config load error:', err);
    }
    return {};
}

function saveConfig(config) {
    try {
        fs.writeFileSync(CONFIG_PATH, JSON.stringify(config, null, 2), 'utf8');
    } catch (err) {
        console.error('Config save error:', err);
    }
}

let DEVICE_BOARD_ID = null;

async function getDeviceBoardId() {
    // 1) Environment Variable (أولوية أولى)
    if (process.env.BOARD_ID) {
        DEVICE_BOARD_ID = process.env.BOARD_ID;
    } else {
        // 2) config.json
        let config = loadConfig();
        if (config.board_id) {
            DEVICE_BOARD_ID = config.board_id;
        } else {
            // 3) جديد
            DEVICE_BOARD_ID = generateBoardId();
            config.board_id = DEVICE_BOARD_ID;
            saveConfig(config);
        }
    }

    const existing = await get(
        `SELECT * FROM boards WHERE board_id = $1`,
        [DEVICE_BOARD_ID]
    );

    if (!existing) {
        await run(
            `INSERT INTO boards (board_id) VALUES ($1)`,
            [DEVICE_BOARD_ID]
        );
        console.log('✅ Board created:', DEVICE_BOARD_ID);
    } else {
        console.log('✅ Board loaded:', DEVICE_BOARD_ID);
    }

    return DEVICE_BOARD_ID;
}

// =========================
// MIDDLEWARE
// =========================

app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

// =========================
// HOME
// =========================

app.get('/', async (req, res) => {
    if (!DEVICE_BOARD_ID) await getDeviceBoardId();
    res.redirect('/board.html?id=' + DEVICE_BOARD_ID);
});

app.get('/api/device-board', async (req, res) => {
    if (!DEVICE_BOARD_ID) await getDeviceBoardId();
    res.json({ success: true, board_id: DEVICE_BOARD_ID });
});

// =========================
// GET BOARD
// =========================

app.get('/api/board/:id', async (req, res) => {
    try {
        const board = await get(
            `SELECT * FROM boards WHERE board_id = $1`,
            [req.params.id]
        );

        if (!board) return res.status(404).json({ error: 'Board not found' });

        res.set('Cache-Control', 'no-store');
        res.json({ success: true, board });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// =========================
// UPDATE SCORE
// =========================

app.post('/api/board/:id/score', async (req, res) => {
    try {
        const { team, action, value } = req.body;

        if (!['a', 'b'].includes(team)) {
            return res.status(400).json({ error: 'Invalid team' });
        }

        const board = await get(
            `SELECT * FROM boards WHERE board_id = $1`,
            [req.params.id]
        );

        if (!board) return res.status(404).json({ error: 'Board not found' });

        const column = team === 'a' ? 'team_a_score' : 'team_b_score';
        let newScore = board[column];
        const val = parseInt(value) || 0;

        if (action === 'add') newScore += val;
        else if (action === 'subtract') newScore -= val;
        else if (action === 'set') newScore = val;
        else if (action === 'reset') newScore = 0;

        await run(
            `UPDATE boards SET ${column} = $1 WHERE board_id = $2`,
            [newScore, req.params.id]
        );

        res.json({ success: true, score: newScore });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// =========================
// UPDATE NAMES
// =========================

app.post('/api/board/:id/names', async (req, res) => {
    try {
        const { team_a_name, team_b_name } = req.body;
        await run(
            `UPDATE boards SET team_a_name = $1, team_b_name = $2 WHERE board_id = $3`,
            [team_a_name || 'المخربين', team_b_name || 'المساعدين', req.params.id]
        );
        res.json({ success: true });
    } catch (err) {
        console.error(err);
        res.status(500).json({ error: 'Server error' });
    }
});

// =========================
// HELPER: ADD POINTS
// =========================

async function addPoints(team, points) {
    if (!DEVICE_BOARD_ID) await getDeviceBoardId();

    if (!['a', 'b'].includes(team)) team = 'a';

    const board = await get(
        `SELECT * FROM boards WHERE board_id = $1`,
        [DEVICE_BOARD_ID]
    );

    if (!board) {
        console.log('❌ Board not found');
        return null;
    }

    const column = team === 'a' ? 'team_a_score' : 'team_b_score';
    const newScore = board[column] + points;

    await run(
        `UPDATE boards SET ${column} = $1 WHERE board_id = $2`,
        [newScore, DEVICE_BOARD_ID]
    );

    console.log(`✅ +${points} → team ${team} (new: ${newScore})`);
    return newScore;
}

// =========================
// TRIGGER (GET + POST)
// =========================

app.all('/trigger', async (req, res) => {
    try {
        const params = { ...req.query, ...req.body };

        let { team, action, value } = params;

        team = team || 'a';
        action = action || 'add';
        value = parseInt(value);

        if (isNaN(value)) value = 1;
        if (!['a', 'b'].includes(team)) team = 'a';

        if (!DEVICE_BOARD_ID) await getDeviceBoardId();

        const board = await get(
            `SELECT * FROM boards WHERE board_id = $1`,
            [DEVICE_BOARD_ID]
        );

        if (!board) return res.status(404).send('Board not found');

        const column = team === 'a' ? 'team_a_score' : 'team_b_score';
        let newScore = board[column];

        if (action === 'add') newScore += value;
        else if (action === 'subtract') newScore -= value;
        else if (action === 'set') newScore = value;
        else if (action === 'reset') newScore = 0;

        await run(
            `UPDATE boards SET ${column} = $1 WHERE board_id = $2`,
            [newScore, DEVICE_BOARD_ID]
        );

        console.log(`⚡ /trigger → +${value} to team ${team} (new: ${newScore})`);

        res.send('OK');

    } catch (err) {
        console.error(err);
        res.send('OK');
    }
});

// =========================
// TIKTOK-TRIGGER (مبسط)
// =========================

app.all('/tiktok-trigger', async (req, res) => {
    try {
        const params = { ...req.query, ...req.body };

        let team = params.team || 'a';
        let value = parseInt(params.value);

        if (isNaN(value)) value = 1;
        if (!['a', 'b'].includes(team)) team = 'a';

        if (!DEVICE_BOARD_ID) await getDeviceBoardId();

        const board = await get(
            `SELECT * FROM boards WHERE board_id = $1`,
            [DEVICE_BOARD_ID]
        );

        if (!board) return res.status(404).send('Board not found');

        const column = team === 'a' ? 'team_a_score' : 'team_b_score';
        const newScore = board[column] + value;

        await run(
            `UPDATE boards SET ${column} = $1 WHERE board_id = $2`,
            [newScore, DEVICE_BOARD_ID]
        );

        console.log(`⚡ /tiktok-trigger → +${value} to team ${team} (new: ${newScore})`);

        res.send('OK');

    } catch (err) {
        console.error(err);
        res.send('OK');
    }
});

// =========================
// TIKFINITY WEBHOOK
// =========================

async function handleTikFinityEvent(event) {
    const giftName = (event.giftName || '').toLowerCase();
    const giftId = event.giftId || '';
    const coins = parseInt(event.coins || 0);
    const repeatCount = parseInt(event.repeatCount || 1);
    const likeCount = parseInt(event.likeCount || 0);
    const subMonth = parseInt(event.subMonth || 0);
    const username = event.username || '';
    const nickname = event.nickname || '';

    if (giftName && giftId) {
        console.log(`🎁 Gift: ${giftName} x${repeatCount} from ${nickname}`);

        let team = 'b';
        let points = 1;

        if (giftName.includes('rose')) {
            team = 'a';
            points = 1 * repeatCount;
        } else if (giftName.includes('galaxy')) {
            team = 'b';
            points = 50 * repeatCount;
        } else if (giftName.includes('tiktok')) {
            team = 'b';
            points = 100 * repeatCount;
        } else if (giftName.includes('lion')) {
            team = 'a';
            points = 30 * repeatCount;
        } else {
            team = 'b';
            points = (coins || 1) * repeatCount;
        }

        return await addPoints(team, points);
    }

    if (likeCount > 0) {
        const points = Math.floor(likeCount / 10);
        if (points > 0) return await addPoints('b', points);
        return null;
    }

    if (subMonth > 0) {
        return await addPoints('b', 50);
    }

    if (username && !giftName && likeCount === 0) {
        return await addPoints('b', 5);
    }

    return null;
}

app.post('/tiktok-webhook', async (req, res) => {
    try {
        console.log('📥 POST /tiktok-webhook');
        res.status(200).send('OK');
        await handleTikFinityEvent(req.body || {});
    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.send('OK');
    }
});

app.get('/tiktok-webhook', async (req, res) => {
    try {
        console.log('📥 GET /tiktok-webhook');
        res.status(200).send('OK');
        await handleTikFinityEvent(req.query || {});
    } catch (err) {
        console.error(err);
        if (!res.headersSent) res.send('OK');
    }
});

// =========================
// START
// =========================

async function start() {
    try {
        await initDatabase();
        await getDeviceBoardId();

        app.listen(PORT, () => {
            console.log('');
            console.log('🚀 Scoreboard running!');
            console.log(`🌐 Port: ${PORT}`);
            console.log(`📋 Board ID: ${DEVICE_BOARD_ID}`);
            console.log('');
        });
    } catch (err) {
        console.error('❌ Failed:', err);
        process.exit(1);
    }
}

start();
