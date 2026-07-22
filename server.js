// ============================================================
// GORDAOMOD - API DE LICENCIAMENTO ONLINE v3.0
// Features: products (spoofer/hack), HWID reset apos 1h, keep-alive
// DB: PostgreSQL/Supabase (primario) + SQLite sql.js (fallback)
// ============================================================
const express = require('express');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
const jwt = require('jsonwebtoken');
const http = require('http');

const PORT = process.env.PORT || 3000;
const ADMIN_USER = process.env.ADMIN_USER || 'admin';
const ADMIN_PASS = process.env.ADMIN_PASS || 'gordao2025';
const JWT_SECRET = process.env.JWT_SECRET || crypto.randomBytes(32).toString('hex');
const PAYLOAD_KEY = process.env.PAYLOAD_KEY || 'GordaoMod2025XY';
const DATABASE_URL = process.env.DATABASE_URL;
const HWID_RESET_HOURS = 1;

// ============================================================
// DATABASE LAYER
// ============================================================
let db;
let usePostgres = false;

async function initDB() {
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
            await db.query('SELECT 1');
            usePostgres = true;
            console.log('[DB] PostgreSQL conectado - modo producao');

            await db.query(`
                CREATE TABLE IF NOT EXISTS keys (
                    key TEXT PRIMARY KEY,
                    type TEXT NOT NULL,
                    product TEXT DEFAULT 'spoofer',
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
                ALTER TABLE keys ADD COLUMN IF NOT EXISTS product TEXT DEFAULT 'spoofer';
            `);
            console.log('[DB] Tabelas Postgres verificadas');
            return;
        } catch (e) {
            console.error('[DB] Postgres falhou:', e.message, '- caindo para SQLite');
            usePostgres = false;
        }
    }

    const initSqlJs = require('sql.js');
    const SQL = await initSqlJs();
    const dbPath = path.join('/tmp', 'gordao.db');
    let dbData = null;
    try {
        if (fs.existsSync(dbPath)) {
            dbData = fs.readFileSync(dbPath);
            console.log('[DB] Arquivo SQLite encontrado:', dbPath, '(' + dbData.length + ' bytes)');
        }
    } catch (e) { console.log('[DB] Nenhum arquivo SQLite anterior'); }
    db = dbData ? new SQL.Database(dbData) : new SQL.Database();
    db.run(`
        CREATE TABLE IF NOT EXISTS keys (
            key TEXT PRIMARY KEY,
            type TEXT NOT NULL,
            product TEXT DEFAULT 'spoofer',
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
    console.log('[DB] SQLite (sql.js) inicializado - arquivo:', dbPath);
}

function saveSQLite() {
    if (usePostgres || !db) return;
    try {
        const data = db.export();
        const buffer = Buffer.from(data);
        fs.writeFileSync(path.join('/tmp', 'gordao.db'), buffer);
    } catch (e) { console.error('[DB] Erro ao salvar SQLite:', e.message); }
}

// ============================================================
// DB HELPERS
// ============================================================
function sqliteExec(sql, params) {
    const stmt = db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    stmt.step();
    stmt.free();
    saveSQLite();
}

function sqliteGetOne(sql, params) {
    const stmt = db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    let row = null;
    if (stmt.step()) row = stmt.getAsObject();
    stmt.free();
    return row;
}

function sqliteGetAll(sql, params) {
    const stmt = db.prepare(sql);
    if (params && params.length) stmt.bind(params);
    const rows = [];
    while (stmt.step()) rows.push(stmt.getAsObject());
    stmt.free();
    return rows;
}

async function dbGetKey(key) {
    if (usePostgres) {
        const r = await db.query('SELECT * FROM keys WHERE key=$1', [key]);
        return r.rows[0] || null;
    }
    return sqliteGetOne('SELECT * FROM keys WHERE key=?', [key]);
}

async function dbInsertKey(key, type, product, expires_at, created_at, note) {
    if (usePostgres) {
        await db.query('INSERT INTO keys (key,type,product,expires_at,created_at,note) VALUES ($1,$2,$3,$4,$5,$6)',
            [key, type, product || 'spoofer', expires_at, created_at, note || null]);
    } else {
        sqliteExec('INSERT INTO keys (key,type,product,expires_at,created_at,note) VALUES (?,?,?,?,?,?)',
            [key, type, product || 'spoofer', expires_at, created_at, note || null]);
    }
}

async function dbAllKeys() {
    if (usePostgres) {
        const r = await db.query('SELECT * FROM keys ORDER BY created_at DESC LIMIT 500');
        return r.rows.map(row => ({ ...row, revoked: !!row.revoked, use_count: row.use_count || 0 }));
    }
    return sqliteGetAll('SELECT * FROM keys ORDER BY created_at DESC LIMIT 500', [])
        .map(r => ({ ...r, revoked: !!r.revoked, use_count: r.use_count || 0 }));
}

async function dbUpdateRevoked(key, revoked) {
    if (usePostgres) {
        const r = await db.query('UPDATE keys SET revoked=$1 WHERE key=$2', [revoked, key]);
        return r.rowCount > 0;
    }
    sqliteExec('UPDATE keys SET revoked=? WHERE key=?', [revoked ? 1 : 0, key]);
    return db.getRowsModified() > 0;
}

async function dbResetHwid(key) {
    if (usePostgres) {
        const r = await db.query('UPDATE keys SET hwid=NULL WHERE key=$1', [key]);
        return r.rowCount > 0;
    }
    sqliteExec('UPDATE keys SET hwid=NULL WHERE key=?', [key]);
    return db.getRowsModified() > 0;
}

async function dbDeleteKey(key) {
    if (usePostgres) {
        const r = await db.query('DELETE FROM keys WHERE key=$1', [key]);
        return r.rowCount > 0;
    }
    sqliteExec('DELETE FROM keys WHERE key=?', [key]);
    return db.getRowsModified() > 0;
}

async function dbSetHwid(key, hwid) {
    if (usePostgres) {
        await db.query('UPDATE keys SET hwid=$1 WHERE key=$2', [hwid, key]);
    } else {
        sqliteExec('UPDATE keys SET hwid=? WHERE key=?', [hwid, key]);
    }
}

async function dbUpdateUsage(key, ip) {
    const now = Math.floor(Date.now() / 1000);
    if (usePostgres) {
        await db.query('UPDATE keys SET last_used_at=$1, last_ip=$2, use_count=use_count+1 WHERE key=$3',
            [now, ip, key]);
    } else {
        sqliteExec('UPDATE keys SET last_used_at=?, last_ip=?, use_count=use_count+1 WHERE key=?',
            [now, ip, key]);
    }
}

async function dbAllLogs() {
    if (usePostgres) {
        const r = await db.query('SELECT * FROM logs ORDER BY ts DESC LIMIT 200');
        return r.rows;
    }
    return sqliteGetAll('SELECT * FROM logs ORDER BY ts DESC LIMIT 200', []);
}

async function dbStats() {
    const now = Math.floor(Date.now() / 1000);
    if (usePostgres) {
        const total = (await db.query('SELECT COUNT(*)::int AS c FROM keys')).rows[0].c;
        const ativas = (await db.query('SELECT COUNT(*)::int AS c FROM keys WHERE NOT revoked AND (expires_at IS NULL OR expires_at > $1)', [now])).rows[0].c;
        const usadas = (await db.query('SELECT COUNT(*)::int AS c FROM keys WHERE last_used_at IS NOT NULL')).rows[0].c;
        const spoofers = (await db.query("SELECT COUNT(*)::int AS c FROM keys WHERE product='spoofer'")).rows[0].c;
        const hacks = (await db.query("SELECT COUNT(*)::int AS c FROM keys WHERE product='hack'")).rows[0].c;
        return { total, ativas, usadas, spoofers, hacks };
    }
    const total = sqliteGetOne('SELECT COUNT(*) as c FROM keys', []).c;
    const ativas = sqliteGetOne('SELECT COUNT(*) as c FROM keys WHERE revoked=0 AND (expires_at IS NULL OR expires_at > ?)', [now]).c;
    const usadas = sqliteGetOne('SELECT COUNT(*) as c FROM keys WHERE last_used_at IS NOT NULL', []).c;
    const spoofers = sqliteGetOne("SELECT COUNT(*) as c FROM keys WHERE product='spoofer'", []).c;
    const hacks = sqliteGetOne("SELECT COUNT(*) as c FROM keys WHERE product='hack'", []).c;
    return { total, ativas, usadas, spoofers, hacks };
}

async function logEvent(key, ip, hwid, action, success, detail) {
    try {
        const ts = Math.floor(Date.now() / 1000);
        if (usePostgres) {
            await db.query('INSERT INTO logs (key,ip,hwid,action,success,detail,ts) VALUES ($1,$2,$3,$4,$5,$6,$7)',
                [key, ip, hwid, action, !!success, detail, ts]);
        } else {
            sqliteExec('INSERT INTO logs (key,ip,hwid,action,success,detail,ts) VALUES (?,?,?,?,?,?,?)',
                [key, ip, hwid, action, success ? 1 : 0, detail, ts]);
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
// ENDPOINTS ADMIN
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
        const { type, product, days, note } = req.body;
        let expires_at = null;
        if (type === 'time') {
            if (!days || days < 1) return res.status(400).json({ error: 'days obrigatorio' });
            expires_at = Math.floor(Date.now() / 1000) + days * 86400;
        } else if (type !== 'unlimited') {
            return res.status(400).json({ error: 'type deve ser time ou unlimited' });
        }
        const key = genKey();
        const created_at = Math.floor(Date.now() / 1000);
        await dbInsertKey(key, type, product, expires_at, created_at, note);
        res.json({ key, type, product: product || 'spoofer', expires_at, hwid: null, created_at, last_used_at: null, last_ip: null, use_count: 0, revoked: false, note });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/keys', adminAuth, async (req, res) => {
    try { res.json(await dbAllKeys()); } catch (e) { res.status(500).json({ error: e.message }); }
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
    try { res.json(await dbAllLogs()); } catch (e) { res.status(500).json({ error: e.message }); }
});

app.get('/api/stats', adminAuth, async (req, res) => {
    try { res.json(await dbStats()); } catch (e) { res.status(500).json({ error: e.message }); }
});

// ============================================================
// PING - keep alive
// ============================================================
app.get('/api/ping', (req, res) => {
    res.json({ ok: true, ts: Math.floor(Date.now() / 1000), db: usePostgres ? 'postgres' : 'sqlite' });
});

// ============================================================
// VALIDATE - endpoint principal
// HWID reset apos 1h sem uso + suporte a products
// ============================================================
app.post('/api/validate', async (req, res) => {
    let { key, hwid, product } = req.body;
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

        // HWID reset apos 1h sem uso
        if (row.hwid && row.hwid !== hwid) {
            const now = Math.floor(Date.now() / 1000);
            const lastUsed = row.last_used_at || 0;
            const hoursSinceUse = (now - lastUsed) / 3600;
            if (hoursSinceUse >= HWID_RESET_HOURS) {
                await dbSetHwid(key, hwid);
                await logEvent(key, ip, hwid, 'hwid_reset', true, 'reset apos ' + HWID_RESET_HOURS + 'h sem uso');
                console.log('[VALIDATE] HWID reset para chave', key);
            } else {
                await logEvent(key, ip, hwid, 'validate', false, 'hwid diferente');
                const remaining = Math.ceil(HWID_RESET_HOURS - hoursSinceUse);
                return res.status(403).json({ ok: false, error: 'Chave vinculada a outro PC. Aguarde ' + remaining + 'h para trocar.' });
            }
        } else if (!row.hwid) {
            await dbSetHwid(key, hwid);
        }

        await dbUpdateUsage(key, ip);
        await logEvent(key, ip, hwid, 'validate', true, 'ok');

        const productName = row.product || 'spoofer';
        const payloadFile = path.join(__dirname, 'payload', productName === 'hack' ? 'hack.ps1' : 'spoofer.ps1');
        const fallback = path.join(__dirname, 'payload', 'spoofer.ps1');
        const useFile = fs.existsSync(payloadFile) ? payloadFile : (fs.existsSync(fallback) ? fallback : null);

        if (!useFile) {
            return res.status(500).json({ ok: false, error: 'Payload nao configurado no servidor' });
        }

        const raw = fs.readFileSync(useFile);
        const dynKey = crypto.createHash('sha256').update(PAYLOAD_KEY + hwid + key).digest();
        const enc = Buffer.alloc(raw.length);
        for (let i = 0; i < raw.length; i++) enc[i] = raw[i] ^ dynKey[i % dynKey.length];

        res.json({
            ok: true,
            type: row.type,
            product: productName,
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

// ============================================================
// START + KEEP-ALIVE
// ============================================================
initDB().then(() => {
    app.listen(PORT, () => {
        console.log('================================================');
        console.log('  GORDAOMOD - API v3.0 (' + (usePostgres ? 'PostgreSQL' : 'SQLite sql.js') + ')');
        console.log('  http://localhost:' + PORT);
        console.log('  Admin: ' + ADMIN_USER + ' / ' + ADMIN_PASS);
        console.log('  HWID reset: ' + HWID_RESET_HOURS + 'h sem uso');
        console.log('================================================');
    });

    const selfPingUrl = 'http://localhost:' + PORT + '/api/ping';
    setInterval(() => {
        http.get(selfPingUrl, (res) => {
            console.log('[KEEP-ALIVE] ping:', res.statusCode);
        }).on('error', (e) => {
            console.log('[KEEP-ALIVE] err:', e.message);
        });
    }, 240000);
}).catch(e => {
    console.error('Falha ao iniciar DB:', e);
    process.exit(1);
});
