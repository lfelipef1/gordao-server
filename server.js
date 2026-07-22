// ============================================================
// GORDAOMOD - API DE LICENCIAMENTO ONLINE v2.0
// Storage: PostgreSQL (se DATABASE_URL existir) ou SQLite (fallback)
// Compativel com Render.com - nunca crasha por falta de DB
// ============================================================
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'gordao2025';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const PAYLOAD_KEY = process.env.PAYLOAD_KEY || 'GordaoMod2025XY';
const DATABASE_URL = process.env.DATABASE_URL;

// ============================================================
// DATABASE LAYER - suporta Postgres (producao) e SQLite (fallback)
// ============================================================
let db;
let usePostgres = false;

if (DATABASE_URL) {
    try {
        const { Pool } = require('pg');
        db = new Pool({
            connectionString: DATABASE_URL,
            ssl: { rejectUnauthorized: false },
            max: 5,
            idleTimeoutMillis: 30000,
            connectionTimeoutMillis: 10000
        });
        usePostgres = true;
        console.log('[DB] PostgreSQL detectado - modo producao');

        db.query(`
            CREATE TABLE IF NOT EXISTS keys (
                key TEXT PRIMARY KEY,
                type TEXT NOT NULL,
                expires_at BIGINT,
                hwid TEXT,
                created_at BIGINT NOT NULL,
                last_used_at BIGINT,
                last_ip TEXT,
                use_count INT DEFAULT 0,
                revoked BOOLEAN DEFAULT FALSE,
                note TEXT
            );
            CREATE TABLE IF NOT EXISTS logs (
                id BIGSERIAL PRIMARY KEY,
                key TEXT,
                ip TEXT,
                hwid TEXT,
                action TEXT,
                success BOOLEAN,
                detail TEXT,
                ts BIGINT NOT NULL
            );
            CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts DESC);
        `).then(() => console.log('[DB] Tabelas Postgres verificadas'))
          .catch(e => console.error('[DB] Erro init Postgres:', e.message));
    } catch (e) {
        console.log('[DB] pg nao disponivel, caindo pra SQLite');
    }
}

if (!usePostgres) {
    const Database = require('better-sqlite3');
    const dbPath = process.env.DB_PATH || path.join(__dirname, 'data.db');
    db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.exec(`
        CREATE TABLE IF NOT EXISTS keys (
            key TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            expires_at INTEGER,
            hwid TEXT,
            created_at INTEGER NOT NULL,
            last_used_at INTEGER,
            last_ip TEXT,
            use_count INTEGER DEFAULT 0,
            revoked INTEGER DEFAULT 0,
            note TEXT
        );
        CREATE TABLE IF NOT EXISTS logs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            key TEXT,
            ip TEXT,
            hwid TEXT,
            action TEXT,
            success INTEGER,
            detail TEXT,
            ts INTEGER NOT NULL
        );
        CREATE INDEX IF NOT EXISTS idx_logs_ts ON logs(ts DESC);
    `);
    console.log('[DB] SQLite inicializado em:', dbPath);
}

// ============================================================
// DB HELPERS - abstrai Postgres vs SQLite
// ============================================================
async function dbGetKey(key) {
    if (usePostgres) {
        const r = await db.query('SELECT * FROM keys WHERE key=$1', [key]);
        return r.rows[0] || null;
    } else {
        return db.prepare('SELECT * FROM keys WHERE key=?').get(key) || null;
    }
}

async function dbInsertKey(key, type, expires_at, created_at, note) {
    if (usePostgres) {
        await db.query('INSERT INTO keys (key,type,expires_at,created_at,note) VALUES ($1,$2,$3,$4,$5)',
            [key, type, expires_at, created_at, note || null]);
    } else {
        db.prepare('INSERT INTO keys (key,type,expires_at,created_at,note) VALUES (?,?,?,?,?)')
            .run(key, type, expires_at, created_at, note || null);
    }
}

async function dbAllKeys() {
    if (usePostgres) {
        const r = await db.query('SELECT * FROM keys ORDER BY created_at DESC LIMIT 500');
        return r.rows.map(row => ({ ...row, revoked: !!row.revoked, use_count: row.use_count || 0 }));
    } else {
        return db.prepare('SELECT * FROM keys ORDER BY created_at DESC LIMIT 500').all()
            .map(r => ({ ...r, revoked: !!r.revoked, use_count: r.use_count || 0 }));
    }
}

async function dbUpdateRevoked(key, revoked) {
    if (usePostgres) {
        const r = await db.query('UPDATE keys SET revoked=$1 WHERE key=$2', [revoked, key]);
        return r.rowCount > 0;
    } else {
        const r = db.prepare('UPDATE keys SET revoked=? WHERE key=?').run(revoked ? 1 : 0, key);
        return r.changes > 0;
    }
}

async function dbResetHwid(key) {
    if (usePostgres) {
        const r = await db.query('UPDATE keys SET hwid=NULL WHERE key=$1', [key]);
        return r.rowCount > 0;
    } else {
        const r = db.prepare('UPDATE keys SET hwid=NULL WHERE key=?').run(key);
        return r.changes > 0;
    }
}

async function dbDeleteKey(key) {
    if (usePostgres) {
        const r = await db.query('DELETE FROM keys WHERE key=$1', [key]);
        return r.rowCount > 0;
    } else {
        const r = db.prepare('DELETE FROM keys WHERE key=?').run(key);
        return r.changes > 0;
    }
}

async function dbSetHwid(key, hwid) {
    if (usePostgres) {
        await db.query('UPDATE keys SET hwid=$1 WHERE key=$2', [hwid, key]);
    } else {
        db.prepare('UPDATE keys SET hwid=? WHERE key=?').run(hwid, key);
    }
}

async function dbUpdateUsage(key, ip) {
    const now = Math.floor(Date.now() / 1000);
    if (usePostgres) {
        await db.query('UPDATE keys SET last_used_at=$1, last_ip=$2, use_count=use_count+1 WHERE key=$3',
            [now, ip, key]);
    } else {
        db.prepare('UPDATE keys SET last_used_at=?, last_ip=?, use_count=use_count+1 WHERE key=?')
            .run(now, ip, key);
    }
}

async function dbAllLogs() {
    if (usePostgres) {
        const r = await db.query('SELECT * FROM logs ORDER BY ts DESC LIMIT 200');
        return r.rows;
    } else {
        return db.prepare('SELECT * FROM logs ORDER BY ts DESC LIMIT 200').all();
    }
}

async function dbStats() {
    const now = Math.floor(Date.now() / 1000);
    if (usePostgres) {
        const total = (await db.query('SELECT COUNT(*)::int AS c FROM keys')).rows[0].c;
        const ativas = (await db.query('SELECT COUNT(*)::int AS c FROM keys WHERE NOT revoked AND (expires_at IS NULL OR expires_at > $1)', [now])).rows[0].c;
        const usadas = (await db.query('SELECT COUNT(*)::int AS c FROM keys WHERE last_used_at IS NOT NULL')).rows[0].c;
        return { total, ativas, usadas };
    } else {
        const total = db.prepare('SELECT COUNT(*) as c FROM keys').get().c;
        const ativas = db.prepare('SELECT COUNT(*) as c FROM keys WHERE revoked=0 AND (expires_at IS NULL OR expires_at > ?)').get(now).c;
        const usadas = db.prepare('SELECT COUNT(*) as c FROM keys WHERE last_used_at IS NOT NULL').get().c;
        return { total, ativas, usadas };
    }
}

async function logEvent(key, ip, hwid, action, success, detail) {
    try {
        const ts = Math.floor(Date.now() / 1000);
        if (usePostgres) {
            await db.query('INSERT INTO logs (key,ip,hwid,action,success,detail,ts) VALUES ($1,$2,$3,$4,$5,$6,$7)',
                [key, ip, hwid, action, !!success, detail, ts]);
        } else {
            db.prepare('INSERT INTO logs (key,ip,hwid,action,success,detail,ts) VALUES (?,?,?,?,?,?,?)')
                .run(key, ip, hwid, action, success ? 1 : 0, detail, ts);
        }
    } catch (e) { console.error('log err', e.message); }
}

// ============================================================
// EXPRESS APP
// ============================================================
const app = express();
app.use(express.json({ limit: '10mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function genKey() {
    return crypto.randomBytes(16).toString('hex').toUpperCase().match(/.{4}/g).join('-');
}

function adminAuth(req, res, next) {
    const auth = req.headers.authorization;
    if (!auth || !auth.startsWith('Bearer ')) return res.status(401).json({ error: 'No token' });
    try {
        req.admin = jwt.verify(auth.slice(7), JWT_SECRET);
        next();
    } catch { res.status(401).json({ error: 'Invalid token' }); }
}

// ============================================================
// ENDPOINTS
// ============================================================
app.post('/api/login', (req, res) => {
    const { user, pass } = req.body;
    if (user !== ADMIN_USER || pass !== ADMIN_PASS) {
        return res.status(401).json({ error: 'Login invalido' });
    }
    const token = jwt.sign({ user }, JWT_SECRET, { expiresIn: '7d' });
    res.json({ token });
});

app.post('/api/keys', adminAuth, async (req, res) => {
    try {
        const { type, days, note } = req.body;
        let expires_at = null;
        if (type === 'time') {
            if (!days || days < 1) return res.status(400).json({ error: 'days obrigatorio' });
            expires_at = Math.floor(Date.now() / 1000) + days * 86400;
        } else if (type !== 'unlimited') {
            return res.status(400).json({ error: 'type deve ser time ou unlimited' });
        }
        const key = genKey();
        const created_at = Math.floor(Date.now() / 1000);
        await dbInsertKey(key, type, expires_at, created_at, note);
        res.json({ key, type, expires_at, hwid: null, created_at, last_used_at: null, last_ip: null, use_count: 0, revoked: false, note });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/keys', adminAuth, async (req, res) => {
    try {
        res.json(await dbAllKeys());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.post('/api/keys/:key/revoke', adminAuth, async (req, res) => {
    res.json({ ok: await dbUpdateRevoked(req.params.key, true) });
});

app.post('/api/keys/:key/unrevoke', adminAuth, async (req, res) => {
    res.json({ ok: await dbUpdateRevoked(req.params.key, false) });
});

app.post('/api/keys/:key/reset-hwid', adminAuth, async (req, res) => {
    res.json({ ok: await dbResetHwid(req.params.key) });
});

app.delete('/api/keys/:key', adminAuth, async (req, res) => {
    res.json({ ok: await dbDeleteKey(req.params.key) });
});

app.get('/api/logs', adminAuth, async (req, res) => {
    try {
        res.json(await dbAllLogs());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stats', adminAuth, async (req, res) => {
    try {
        res.json(await dbStats());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// VALIDATE - endpoint principal do cliente
// ============================================================
app.post('/api/validate', async (req, res) => {
    let { key, hwid } = req.body;
    const ip = req.headers['x-forwarded-for'] || req.connection.remoteAddress;

    if (!key || !hwid) {
        await logEvent(key, ip, hwid, 'validate', false, 'campos faltando');
        return res.status(400).json({ ok: false, error: 'Chave e HWID obrigatorios' });
    }

    key = String(key).trim().toUpperCase().replace(/[^0-9A-F-]/g, '');

    try {
        const row = await dbGetKey(key);
        if (!row) {
            await logEvent(key, ip, hwid, 'validate', false, 'chave inexistente');
            return res.status(404).json({ ok: false, error: 'Chave invalida' });
        }

        const isRevoked = usePostgres ? row.revoked : !!row.revoked;
        if (isRevoked) {
            await logEvent(key, ip, hwid, 'validate', false, 'revogada');
            return res.status(403).json({ ok: false, error: 'Chave revogada' });
        }
        if (row.expires_at && row.expires_at < Math.floor(Date.now() / 1000)) {
            await logEvent(key, ip, hwid, 'validate', false, 'expirada');
            return res.status(403).json({ ok: false, error: 'Chave expirada' });
        }

        if (!row.hwid) {
            await dbSetHwid(key, hwid);
        } else if (row.hwid !== hwid) {
            await logEvent(key, ip, hwid, 'validate', false, 'hwid diferente');
            return res.status(403).json({ ok: false, error: 'Chave ja vinculada a outro PC' });
        }

        await dbUpdateUsage(key, ip);
        await logEvent(key, ip, hwid, 'validate', true, 'ok');

        const payloadFile = path.join(__dirname, 'payload', 'spoofer.ps1');
        if (!fs.existsSync(payloadFile)) {
            return res.status(500).json({ ok: false, error: 'Payload nao configurado no servidor' });
        }
        const raw = fs.readFileSync(payloadFile);
        const dynKey = crypto.createHash('sha256').update(PAYLOAD_KEY + hwid + key).digest();
        const enc = Buffer.alloc(raw.length);
        for (let i = 0; i < raw.length; i++) enc[i] = raw[i] ^ dynKey[i % dynKey.length];

        res.json({
            ok: true,
            type: row.type,
            expires_at: row.expires_at,
            payload: enc.toString('base64')
        });
    } catch (e) {
        console.error('validate err:', e);
        res.status(500).json({ ok: false, error: 'erro interno' });
    }
});

app.get('/', (req, res) => {
    res.sendFile(path.join(__dirname, 'public', 'index.html'));
});

app.listen(PORT, () => {
    console.log('================================================');
    console.log('  GORDAOMOD - API ONLINE (' + (usePostgres ? 'PostgreSQL' : 'SQLite') + ')');
    console.log('  http://localhost:' + PORT);
    console.log('  Login Admin: ' + ADMIN_USER + ' / ' + ADMIN_PASS);
    console.log('================================================');
});
