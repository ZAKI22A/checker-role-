// bot.js - KILIUA SECURITY INTELLIGENCE (v9.2 — FULL DATABASE-FIRST)
const {
    Client, GatewayIntentBits, Partials, EmbedBuilder, ActivityType,
    ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
    StringSelectMenuBuilder, AttachmentBuilder, Message, BaseGuildTextChannel,
    DMChannel, User, MessageComponentInteraction, ContainerBuilder,
    TextDisplayBuilder, MediaGalleryBuilder, MediaGalleryItemBuilder,
    SeparatorBuilder, MessageFlags, resolveColor, PermissionFlagsBits,
    SectionBuilder, ThumbnailBuilder, ModalBuilder, TextInputBuilder, TextInputStyle
} = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState, getVoiceConnection } = require('@discordjs/voice');
const axios = require('axios');
const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');
const { createCanvas, loadImage } = require('canvas');
const GIFEncoder = require('gif-encoder-2');

// ─── CLEAN LAYOUT: one icon per heading, none inside body lines ───
// Prevents icons from stacking next to text/thumbnails (the "overlapping" look).
(() => {
    const ICON_RE = /<a?:ks_[A-Za-z0-9_]+:\d+>\s?/g;
    const orig = TextDisplayBuilder.prototype.setContent;
    TextDisplayBuilder.prototype.setContent = function (text) {
        if (typeof text === 'string') {
            text = text.split('\n').map(line => {
                if (/^#{1,3}\s/.test(line)) {
                    let seen = false;
                    return line.replace(ICON_RE, m => (seen ? '' : (seen = true, m)));
                }
                return line.replace(ICON_RE, '');
            }).join('\n');
        }
        return orig.call(this, text);
    };
})();

console.log('='.repeat(70));
console.log('    KILIUA SECURITY INTELLIGENCE v9.2 — FULL DATABASE-FIRST');
console.log('='.repeat(70));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));
const PAGINATION_TIMEOUT_MS = 30 * 60 * 1000;

// ─── THEME & BANNER ────────────────────────────────────────────
const THEME = { DARK: '#2b2d31', PRIMARY: '#5865f2', DANGER: '#ed4245', SUCCESS: '#57f287', GOLD: '#faa81a', CYAN: '#00d4aa' };
const BANNER_GIFS = [
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3NzeXp0Y3Y0Zjh0YWdlZHFnOGRkaW1zaGhic2lqM20wZzQybmhqayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/h990T1luP7Fi8/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3NzeXp0Y3Y0Zjh0YWdlZHFnOGRkaW1zaGhic2lqM20wZzQybmhqayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/L8iAvtDaf42Oc/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPWVjZjA1ZTQ3aHhsZDVuYzA1Nm9uaTAwYmFmcmp6cjM2Y3pvZ3JpbjV5c2kwa2c5eiZlcD12MV9naWZzX3NlYXJjaCZjdD1n/BoKQ4lI4MBjlj40YXZ/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3NzeXp0Y3Y0Zjh0YWdlZHFnOGRkaW1zaGhic2lqM20wZzQybmhqayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/DY1KSjEuVMarPIzfkq/giphy.gif',
    'https://media.giphy.com/media/v1.Y2lkPTc5MGI3NjExc3NzeXp0Y3Y0Zjh0YWdlZHFnOGRkaW1zaGhic2lqM20wZzQybmhqayZlcD12MV9naWZzX3NlYXJjaCZjdD1n/2nUnDhdX4CLjW/giphy.gif'
];

const IGNORED_PERMISSIONS = ['MANAGE_THREADS', 'PRIORITY_SPEAKER'];

try { require('dotenv').config(); } catch {}

let config = {};
try {
    if (fs.existsSync('config.json')) {
        config = JSON.parse(fs.readFileSync('config.json', 'utf8'));
    }
} catch (e) {
    console.warn('⚠️ config.json not loaded, falling back to environment variables.');
}

function resolveVal(envVal, confVal, placeholderPrefix = 'YOUR_') {
    if (envVal && typeof envVal === 'string' && envVal.trim() && !envVal.startsWith(placeholderPrefix)) return envVal.trim();
    if (confVal && typeof confVal === 'string' && confVal.trim() && !confVal.startsWith(placeholderPrefix)) return confVal.trim();
    return envVal || confVal || '';
}

config.main_bot_token = resolveVal(process.env.MAIN_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN, config.main_bot_token);
config.checker_user_token = resolveVal(process.env.CHECKER_USER_TOKEN, config.checker_user_token);
config.fallback_user_token = resolveVal(process.env.FALLBACK_USER_TOKEN, config.fallback_user_token);
config.main_bot_id = resolveVal(process.env.MAIN_BOT_ID, config.main_bot_id);
config.checker_user_id = resolveVal(process.env.CHECKER_USER_ID, config.checker_user_id);
config.checker_port = parseInt(process.env.PORT || process.env.CHECKER_PORT || config.checker_port || 4567, 10);
config.dashboard_port = parseInt(process.env.DASHBOARD_PORT || config.dashboard_port || 4580, 10);

if (process.env.OWNER_IDS) {
    config.owner_ids = process.env.OWNER_IDS.split(',').map(s => s.trim()).filter(Boolean);
}
if (process.env.AUTO_VOICE_CHANNEL_ID) config.auto_voice_channel_id = process.env.AUTO_VOICE_CHANNEL_ID;
if (process.env.AI_API_KEY) config.ai_api_key = process.env.AI_API_KEY;
if (process.env.GRANTABLE_ROLE_ID) config.grantable_role_id = process.env.GRANTABLE_ROLE_ID;
if (process.env.DANGEROUS_ROLE_ID) config.dangerous_role_id = process.env.DANGEROUS_ROLE_ID;
if (process.env.CLEAN_ROLE_ID) config.clean_role_id = process.env.CLEAN_ROLE_ID;
if (process.env.LOG_CHANNEL_ID) config.log_channel_id = process.env.LOG_CHANNEL_ID;
if (process.env.EMOJI_UPLOAD_CHANNEL_ID) config.emoji_upload_channel_id = process.env.EMOJI_UPLOAD_CHANNEL_ID;

const TOKEN = config.main_bot_token;
const PORT = config.checker_port || 4567;
const BASE_URL = `http://localhost:${PORT}`;
const OWNER_IDS = config.owner_ids || [config.owner_id || '1155753199307870268'];
const AUTO_VC = config.auto_voice_channel_id || null;
const UPDATE_INTERVAL = config.staff_update_interval_ms || 5 * 60 * 1000;

const DB_FILE = 'database.json';
let db = { allowedRoles: {}, userTokens: {}, bots: [], trackedServers: {} };
const updatingServers = new Set();

let activeCommandCount = 0;
function commandStart() { activeCommandCount++; }
function commandEnd()   { if (activeCommandCount > 0) activeCommandCount--; }
function isCommandActive() { return activeCommandCount > 0; }

let staffTrackingEnabled = true;

function loadDB() {
    try {
        if (fs.existsSync(DB_FILE)) {
            db = JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
            if (!db.allowedRoles) db.allowedRoles = {};
            if (!db.userTokens) db.userTokens = {};
            if (!db.bots) db.bots = [];
            if (!db.trackedServers) db.trackedServers = {};
            if (!db.protectedIds) db.protectedIds = [];
            if (!db.voiceStats) db.voiceStats = {};
        }
    } catch (e) { console.error('DB error:', e); }
}
loadDB();

function saveDB() {
    try {
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    } catch (e) {
        console.error('Save DB error:', e);
    }
}

// ─── VOICE SESSION TRACKING & HOURS LOGGING ───────────────────────
const voiceSessions = new Map(); // userId -> { joinedAt, channelId, guildId }

function trackVoiceState(oldState, newState) {
    const userId = newState?.id || oldState?.id;
    if (!userId) return;

    if (newState?.channelId && !oldState?.channelId) {
        // User joined voice channel
        voiceSessions.set(userId, { joinedAt: Date.now(), channelId: newState.channelId, guildId: newState.guild?.id });
    } else if (!newState?.channelId && oldState?.channelId) {
        // User left voice channel
        const session = voiceSessions.get(userId);
        if (session) {
            const durationSec = Math.floor((Date.now() - session.joinedAt) / 1000);
            if (!db.voiceStats) db.voiceStats = {};
            if (!db.voiceStats[userId]) db.voiceStats[userId] = { totalSeconds: 0 };
            db.voiceStats[userId].totalSeconds = (db.voiceStats[userId].totalSeconds || 0) + durationSec;
            db.voiceStats[userId].lastSeen = Date.now();
            voiceSessions.delete(userId);
            saveDB();
        }
    } else if (newState?.channelId && oldState?.channelId && newState.channelId !== oldState.channelId) {
        // User switched channels
        const session = voiceSessions.get(userId);
        if (session) {
            session.channelId = newState.channelId;
        } else {
            voiceSessions.set(userId, { joinedAt: Date.now(), channelId: newState.channelId, guildId: newState.guild?.id });
        }
    }
}

function getUserVoiceHours(userId) {
    if (!userId) return '0.0 hrs';
    let totalSec = (db.voiceStats && db.voiceStats[userId]?.totalSeconds) || 0;
    const currentSession = voiceSessions.get(userId);
    if (currentSession) {
        totalSec += Math.floor((Date.now() - currentSession.joinedAt) / 1000);
    }
    const hours = (totalSec / 3600).toFixed(1);
    return `${hours} hrs`;
}

const api = axios.create({
    baseURL: BASE_URL,
    httpAgent: new http.Agent({ keepAlive: true, maxSockets: 50 }),
    httpsAgent: new https.Agent({ keepAlive: true, maxSockets: 50 }),
    timeout: 600000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
});

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildMessages, GatewayIntentBits.DirectMessages,
        GatewayIntentBits.GuildPresences, GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates, GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildModeration
    ],
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User],
    rest: {
        timeout: 60000,
        retries: 3
    }
});

client.on('voiceStateUpdate', (oldState, newState) => {
    trackVoiceState(oldState, newState);
});

// ===================== UTILS & ACCESS CONTROL =====================
function hasAccess(member, msg = null) {
    if (!member) return false;
    // 1. Bot owner / whitelist
    if (isOwner(member) || (config.whitelist_ids && config.whitelist_ids.includes(member.id))) return true;

    // 2. Direct Messages (not allowed)
    if (!member.guild) return false;

    // 3. Server Owner
    if (member.guild.ownerId === member.id) return true;

    // 4. Server Administrator
    if (member.permissions && member.permissions.has(PermissionFlagsBits.Administrator)) return true;

    // 5. Configured Server Staff Role
    const configuredRole = db.allowedRoles?.[member.guild.id];
    if (configuredRole) {
        const allowedStr = String(configuredRole).toLowerCase();
        const hasRole = member.roles.cache.some(r =>
            r.id === configuredRole ||
            r.name.toLowerCase() === allowedStr
        );
        if (hasRole) return true;
    }

    // Denied: provide informative feedback if msg is supplied
    if (msg) {
        let desc = '';
        if (configuredRole) {
            const rObj = member.guild.roles.cache.get(configuredRole);
            const roleMention = rObj ? `<@&${rObj.id}>` : `\`${configuredRole}\``;
            desc = `You must possess the authorized staff role (${roleMention}) to use this bot in this server.`;
        } else {
            desc = `No authorized role has been configured for this server yet.\nThe Server Owner or an Administrator must set one using \`+setrole <@role>\`.`;
        }
        msg.reply(makeWaitingContainer({
            title: 'Access Restricted',
            description: desc,
            user: msg.author,
            iconKey: 'lock'
        })).catch(() => null);
    }
    return false;
}

// ===================== MULTI-TOKEN POOL EXECUTOR & AGGREGATOR =====================
function getTokenPool(authorId = null) {
    const list = [];
    const seen = new Set();
    const add = (t) => {
        if (!t || typeof t !== 'string') return;
        const clean = t.replace(/^Bot\s+/i, '').replace(/[\"\']/g, '').trim();
        if (clean.length > 20 && !seen.has(clean)) {
            seen.add(clean);
            list.push(clean);
        }
    };

    if (authorId && db.userTokens?.[authorId]) add(db.userTokens[authorId]);
    if (Array.isArray(config.user_tokens)) config.user_tokens.forEach(add);
    if (Array.isArray(config.checker_user_tokens)) config.checker_user_tokens.forEach(add);
    if (config.checker_user_token) add(config.checker_user_token);
    if (config.fallback_user_token) add(config.fallback_user_token);
    if (Array.isArray(db.userTokensPool)) db.userTokensPool.forEach(add);
    if (db.userTokens) Object.values(db.userTokens).forEach(add);

    return list;
}

async function poolCheckUser(userId, userTag, fullScan = true, authorId = null) {
    const tokens = getTokenPool(authorId);
    if (tokens.length === 0) return [];

    const promises = tokens.map(async (tok) => {
        try {
            const res = await api.get('/check', {
                headers: { Authorization: tok },
                params: { userId, userTag, fullScan: fullScan ? 'true' : 'false' },
                timeout: 60000
            });
            return res.data?.results || [];
        } catch (err) {
            console.warn(`[TOKEN_POOL] Token (${tok.slice(0, 8)}...) check failed:`, err.message);
            return [];
        }
    });

    const settled = await Promise.allSettled(promises);
    const combined = [];
    const serverMap = new Map();

    for (const item of settled) {
        if (item.status === 'fulfilled' && Array.isArray(item.value)) {
            for (const s of item.value) {
                if (!s || !s.serverId) continue;
                if (!serverMap.has(s.serverId)) {
                    serverMap.set(s.serverId, s);
                    combined.push(s);
                } else {
                    const existing = serverMap.get(s.serverId);
                    if (!existing.allRoles?.length && s.allRoles?.length) existing.allRoles = s.allRoles;
                    if (!existing.isOwner && s.isOwner) existing.isOwner = true;
                    if (!existing.hasPowers && s.hasPowers) existing.hasPowers = true;
                }
            }
        }
    }
    return combined;
}

// ─── HIGH-SPEED SERVER INDEX & IN-MEMORY CACHE ───
const serverTokenMap = new Map(); // serverId -> Set of tokens
let cachedGuildsList = [];
let lastGuildIndexRefresh = 0;

async function refreshGuildIndex(force = false) {
    const now = Date.now();
    if (!force && now - lastGuildIndexRefresh < 60000 && cachedGuildsList.length > 0) {
        return cachedGuildsList;
    }
    const tokens = getTokenPool();
    if (tokens.length === 0) return [];

    const promises = tokens.map(async (tok) => {
        try {
            const res = await axios.get('https://discord.com/api/v9/users/@me/guilds', {
                headers: { Authorization: tok, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
                timeout: 10000
            });
            return { token: tok, guilds: res.data || [] };
        } catch (e) {
            return { token: tok, guilds: [] };
        }
    });

    const settled = await Promise.allSettled(promises);
    serverTokenMap.clear();
    const uniqueMap = new Map();

    for (const item of settled) {
        if (item.status === 'fulfilled' && item.value.guilds) {
            const { token, guilds } = item.value;
            for (const g of guilds) {
                if (!g || !g.id) continue;
                if (!serverTokenMap.has(g.id)) serverTokenMap.set(g.id, new Set());
                serverTokenMap.get(g.id).add(token);

                if (!uniqueMap.has(g.id)) {
                    uniqueMap.set(g.id, {
                        id: g.id,
                        name: g.name,
                        icon: g.icon,
                        owner: !!g.owner,
                        permissions: g.permissions
                    });
                }
            }
        }
    }

    cachedGuildsList = Array.from(uniqueMap.values());
    lastGuildIndexRefresh = now;
    console.log(`[GUILD_INDEX] Refreshed: ${cachedGuildsList.length} unique servers indexed across ${tokens.length} accounts`);
    return cachedGuildsList;
}

async function poolGetGuilds(authorId = null) {
    try {
        const cached = await refreshGuildIndex();
        if (cached.length > 0) return cached;
    } catch {}

    const tokens = getTokenPool(authorId);
    if (tokens.length === 0) return [];

    const promises = tokens.map(async (tok) => {
        try {
            const res = await api.get('/guilds', {
                headers: { Authorization: tok },
                timeout: 30000
            });
            return res.data || [];
        } catch (err) {
            console.warn(`[TOKEN_POOL] Token (${tok.slice(0, 8)}...) guilds failed:`, err.message);
            return [];
        }
    });

    const settled = await Promise.allSettled(promises);
    const guildMap = new Map();
    const combined = [];

    for (const item of settled) {
        if (item.status === 'fulfilled' && Array.isArray(item.value)) {
            for (const g of item.value) {
                if (g && g.id && !guildMap.has(g.id)) {
                    guildMap.set(g.id, g);
                    combined.push(g);
                }
            }
        }
    }
    return combined;
}


async function findTokenForGuild(guildId, authorId = null) {
    if (!guildId) {
        const pool = getTokenPool(authorId);
        return pool[0] || config.checker_user_token;
    }

    // Check serverTokenMap
    if (serverTokenMap.has(guildId)) {
        const set = serverTokenMap.get(guildId);
        if (authorId && db.userTokens?.[authorId] && set.has(db.userTokens[authorId])) {
            return db.userTokens[authorId];
        }
        for (const t of set) return t;
    }

    // Refresh guild index to discover new servers
    await refreshGuildIndex();
    if (serverTokenMap.has(guildId)) {
        const set = serverTokenMap.get(guildId);
        if (authorId && db.userTokens?.[authorId] && set.has(db.userTokens[authorId])) {
            return db.userTokens[authorId];
        }
        for (const t of set) return t;
    }

    const pool = getTokenPool(authorId);
    return pool[0] || config.checker_user_token;
}

async function poolGetCs(userId, authorId = null) {
    const tokens = getTokenPool(authorId);
    if (tokens.length === 0) return [];

    const promises = tokens.map(async (tok) => {
        try {
            const res = await api.get('/cs', {
                headers: { Authorization: tok },
                params: { userId },
                timeout: 120000
            });
            return res.data?.results || [];
        } catch (err) {
            console.warn(`[TOKEN_POOL] Token (${tok.slice(0, 8)}...) cs failed:`, err.message);
            return [];
        }
    });

    const settled = await Promise.allSettled(promises);
    const serverMap = new Map();
    const combined = [];

    for (const item of settled) {
        if (item.status === 'fulfilled' && Array.isArray(item.value)) {
            for (const s of item.value) {
                if (!s || !s.serverId) continue;
                if (!serverMap.has(s.serverId)) {
                    serverMap.set(s.serverId, s);
                    combined.push(s);
                }
            }
        }
    }
    return combined;
}

async function poolGetVoiceStates(userId, authorId = null) {
    const tokens = getTokenPool(authorId);
    if (tokens.length === 0) return [];

    const promises = tokens.map(async (tok) => {
        try {
            const res = await api.get('/voice-states', {
                headers: { Authorization: tok },
                params: { userId },
                timeout: 30000
            });
            return res.data?.results || [];
        } catch (err) {
            console.warn(`[TOKEN_POOL] Token (${tok.slice(0, 8)}...) voice-states failed:`, err.message);
            return [];
        }
    });

    const settled = await Promise.allSettled(promises);
    const serverMap = new Map();
    const combined = [];

    for (const item of settled) {
        if (item.status === 'fulfilled' && Array.isArray(item.value)) {
            for (const s of item.value) {
                if (!s || !s.serverId) continue;
                if (!serverMap.has(s.serverId)) {
                    serverMap.set(s.serverId, s);
                    combined.push(s);
                }
            }
        }
    }
    return combined;
}

async function poolGetTma(authorId = null) {
    const tokens = getTokenPool(authorId);
    if (tokens.length === 0) return [];

    const promises = tokens.map(async (tok) => {
        try {
            const res = await api.get('/tma', {
                headers: { Authorization: tok },
                timeout: 60000
            });
            return res.data?.results || [];
        } catch (err) {
            console.warn(`[TOKEN_POOL] Token (${tok.slice(0, 8)}...) tma failed:`, err.message);
            return [];
        }
    });

    const settled = await Promise.allSettled(promises);
    const srvMap = new Map();
    for (const item of settled) {
        if (item.status === 'fulfilled' && Array.isArray(item.value)) {
            for (const r of item.value) {
                const sid = String(r.id || r.serverId || '');
                if (!sid) continue;
                const normalized = {
                    ...r,
                    id: sid,
                    serverId: sid,
                    name: r.name || r.serverName || 'Unknown Server',
                    icon: r.icon || r.serverIcon || r.serverIconHash
                };
                const existing = srvMap.get(sid);
                if (!existing || (normalized.activeVoice || 0) > (existing.activeVoice || 0)) {
                    srvMap.set(sid, normalized);
                }
            }
        }
    }
    const combined = Array.from(srvMap.values()).filter(x => {
        const h = (x.activeVoiceHumans !== undefined ? x.activeVoiceHumans : x.activeVoice) || 0;
        return h > 0;
    });
    combined.sort((a, b) => ((b.activeVoiceHumans ?? b.activeVoice) || 0) - ((a.activeVoiceHumans ?? a.activeVoice) || 0));
    return combined;
}

async function poolGetCv(userId, authorId = null) {
    const tokens = getTokenPool(authorId);
    if (tokens.length === 0) return [];

    const promises = tokens.map(async (tok) => {
        try {
            const res = await api.get('/cv', {
                headers: { Authorization: tok },
                params: { userId },
                timeout: 30000
            });
            return res.data?.results || [];
        } catch (err) {
            console.warn(`[TOKEN_POOL] Token (${tok.slice(0, 8)}...) cv failed:`, err.message);
            return [];
        }
    });

    const settled = await Promise.allSettled(promises);
    const seenServers = new Set();
    const combined = [];

    for (const item of settled) {
        if (item.status === 'fulfilled' && Array.isArray(item.value)) {
            for (const r of item.value) {
                if (r && r.serverId && !seenServers.has(r.serverId)) {
                    seenServers.add(r.serverId);
                    combined.push(r);
                }
            }
        }
    }
    return combined;
}

// ===================== PROTECTED USERS (privacy) =====================
// IDs listed in db.protectedIds cannot be scanned; their server
// memberships stay hidden from everyone (including owners).
function isProtectedUser(id) {
    return Array.isArray(db.protectedIds) && db.protectedIds.map(String).includes(String(id));
}
async function denyProtectedUser(msg, userId) {
    if (!isProtectedUser(userId)) return false;
    await msg.reply(makeWaitingContainer({
        title: 'ACCESS RESTRICTED',
        description: '**This user is protected under privacy guidelines.**\nServer memberships and permissions cannot be displayed.',
        user: msg.author,
        iconKey: 'lock'
    }));
    return true;
}

let customEmojis = {};
function loadCustomEmojis() {
    try {
        if (fs.existsSync('./custom_emojis/emojis.json')) {
            customEmojis = JSON.parse(fs.readFileSync('./custom_emojis/emojis.json', 'utf8'));
        }
    } catch (e) {}
}
loadCustomEmojis();

const EMOJI_ALIASES = {
    card: 'personalcard',
    usercard: 'personalcard',
    staff: 'teacher',
    manager: 'teacher',
    members: 'ai_users',
    users: 'ai_users',
    clean: 'archive_tick',
    verified: 'verify',
    crown: 'unlimited',
    admin: 'unlimited',
    ping: 'wifi',
    memory: 'ram',
    system: 'driver',
    cpu: 'driver',
    time: 'clock',
    mute: 'mic_slash',
    deaf: 'headphone',
    stream: 'screen',
    commands: 'keyboard',
    cmd: 'keyboard',
    join: 'login',
    leave: 'logout',
    call_join: 'call_received',
    call_leave: 'call_remove',
    coins: 'coin',
    boost: 'gift',
    nitro: 'gift'
};

// ─── APPLICATION EMOJIS (built ONLY from local custom_emojis/png/*.png) ───
// Each local PNG is uploaded once as the bot's own application emoji
// (works in every server, no external emoji servers involved).
const appEmojiMap = {}; // png filename -> '<:name:id>'

function pngToEmojiName(file) {
    const base = String(file)
        .replace(/^iconsax-/, '')
        .replace(/-[0-9a-f]{12}-?\.png$/i, '')
        .replace(/\.png$/i, '');
    return ('ks_' + base.replace(/[^a-zA-Z0-9_]/g, '_')).slice(0, 32);
}

function resolveEmojiPng(key) {
    if (!key) return null;
    if (!customEmojis || Object.keys(customEmojis).length === 0) loadCustomEmojis();
    const clean = String(key).toLowerCase().trim();
    const alias = EMOJI_ALIASES[clean] || clean;
    return customEmojis[clean] || customEmojis[alias] || null;
}

function getCustomEmoji(key) {
    const png = resolveEmojiPng(key);
    return png && appEmojiMap[png] ? appEmojiMap[png] : '';
}

// Emoji + trailing space (or nothing) — keeps text aligned when an emoji is missing
function E(key) {
    const e = getCustomEmoji(key);
    return e ? `${e} ` : '';
}

async function syncApplicationEmojis() {
    if (!client.application) return;
    const pngDir = path.join(__dirname, 'custom_emojis', 'png');
    const needed = [...new Set(Object.values(customEmojis).filter(v => typeof v === 'string' && v.endsWith('.png')))];
    let existing;
    try {
        existing = await client.application.emojis.fetch();
    } catch (e) {
        console.warn('[EMOJI] Could not fetch application emojis:', e.message);
        return;
    }
    let created = 0;
    for (const file of needed) {
        const name = pngToEmojiName(file);
        const found = existing.find(em => em.name === name);
        if (found) {
            appEmojiMap[file] = `<:${found.name}:${found.id}>`;
            continue;
        }
        const p = path.join(pngDir, file);
        if (!fs.existsSync(p)) continue;
        try {
            const em = await client.application.emojis.create({ attachment: fs.readFileSync(p), name });
            appEmojiMap[file] = `<:${em.name}:${em.id}>`;
            created++;
            await new Promise(r => setTimeout(r, 1200));
        } catch (e) {
            console.warn(`[EMOJI] ${name}: ${e.message}`);
        }
    }
    console.log(`[EMOJI] Application emojis ready: ${Object.keys(appEmojiMap).length}/${needed.length} (new uploads: ${created})`);
}

function getCustomEmojiPng(key) {
    if (!key) return 'iconsax-eye-ee79ce828450-.png';
    if (!customEmojis || Object.keys(customEmojis).length === 0) {
        loadCustomEmojis();
    }
    const clean = String(key).toLowerCase().trim();
    const alias = EMOJI_ALIASES[clean] || clean;
    return customEmojis[clean] || customEmojis[alias] || 'iconsax-eye-ee79ce828450-.png';
}

function detectCustomEmoji(text, color) {
    const t = String(text || '').toLowerCase();
    if (t.includes('wait') || t.includes('fetch') || t.includes('scan') || t.includes('generat') || t.includes('load')) {
        return getCustomEmoji('loader');
    }
    if (color === THEME.DANGER || color === 0xed4245 || color === '#ed4245' || t.includes('error') || t.includes('denied') || t.includes('invalid') || t.includes('failed') || t.includes('missing')) {
        return getCustomEmoji('danger');
    }
    if (color === THEME.SUCCESS || color === 0x57f287 || color === '#57f287' || t.includes('success') || t.includes('clean') || t.includes('complete') || t.includes('set to:')) {
        return getCustomEmoji('success');
    }
    if (t.includes('voice') || t.includes('leaderboard') || t.includes('tma') || t.includes('vc')) {
        return getCustomEmoji('voice');
    }
    if (t.includes('audit') || t.includes('permission') || t.includes('danger role') || t.includes('cross')) {
        return getCustomEmoji('audit');
    }
    if (t.includes('role')) {
        return getCustomEmoji('role');
    }
    if (t.includes('server') || t.includes('guild') || t.includes('staff')) {
        return getCustomEmoji('server');
    }
    if (t.includes('user') || t.includes('member') || t.includes('profile')) {
        return getCustomEmoji('user');
    }
    if (t.includes('help') || t.includes('command') || t.includes('guide')) {
        return getCustomEmoji('help');
    }
    if (t.includes('ping') || t.includes('status') || t.includes('latency') || t.includes('stats')) {
        return getCustomEmoji('stats');
    }
    return '';
}

function getNumberBadge(n) {
    const key = `number_${n}`;
    if (customEmojis[key]) return customEmojis[key];
    if (client?.emojis?.cache) {
        const found = client.emojis.cache.find(e => e.name.toLowerCase() === key || e.name.toLowerCase() === `iconsax_${key}`);
        if (found) return found.toString();
    }
    return `\`[#${n}]\``;
}

// Synchronize all custom emojis from custom_emojis/ into a Discord guild
async function syncCustomEmojis(guild) {
    if (!guild) return { success: false, reason: 'No guild provided' };
    const me = guild.members.me;
    if (!me?.permissions?.has(PermissionFlagsBits.ManageGuildExpressions) && !me?.permissions?.has(PermissionFlagsBits.ManageEmojisAndStickers)) {
        return { success: false, reason: 'Bot lacks Manage Emojis / Manage Guild Expressions permission in this server.' };
    }

    const emojiDir = path.join(__dirname, 'custom_emojis');
    const pngDir = path.join(emojiDir, 'png');
    if (!fs.existsSync(pngDir)) fs.mkdirSync(pngDir, { recursive: true });

    let syncedCount = 0;
    const errors = [];

    // 1. Sync GIFs (numbers 1-9)
    for (let i = 1; i <= 9; i++) {
        const key = `number_${i}`;
        const existing = guild.emojis.cache.find(e => e.name.toLowerCase() === key);
        if (existing) {
            customEmojis[key] = existing.toString();
            continue;
        }
        const gifPath = path.join(emojiDir, `${key}.gif`);
        if (fs.existsSync(gifPath)) {
            try {
                const gifBuf = fs.readFileSync(gifPath);
                const created = await guild.emojis.create({
                    attachment: gifBuf,
                    name: key,
                    reason: 'Kiliua custom animated rank badge'
                });
                customEmojis[key] = created.toString();
                syncedCount++;
            } catch (err) {
                errors.push(`${key}: ${err.message}`);
            }
        }
    }

    // 2. Map of iconsax SVGs to clean emoji names
    const svgMap = {
        'iconsax-wifi-56e7f980370d-.svg': 'wifi',
        'iconsax-ram-a5c0d25aa91d-.svg': 'ram',
        'iconsax-driver-f050b33fa120-.svg': 'driver',
        'iconsax-clock-a36fba08b60c-.svg': 'clock',
        'iconsax-personalcard-b6c14c2d4bfa-.svg': 'personalcard',
        'iconsax-eye-ee79ce828450-.svg': 'eye',
        'iconsax-eye-slash-21c43d31ade1-.svg': 'eye_slash',
        'iconsax-lock-5ad4eef23b15-.svg': 'lock',
        'iconsax-unlock-130daae311ad-.svg': 'unlock',
        'iconsax-unlimited-0d36626e6ba4-.svg': 'unlimited',
        'iconsax-teacher-bcd26a1d07fa-.svg': 'teacher',
        'iconsax-ai-users-b92969ecc876-.svg': 'ai_users',
        'iconsax-ai-ac-d48ed23d2d7b-.svg': 'ai_ac',
        'iconsax-archive-tick-9daf48311d29-.svg': 'archive_tick',
        'iconsax-verify-619b2de95f15-.svg': 'verify',
        'iconsax-bell-bab4c402a8dc-.svg': 'bell',
        'iconsax-bell2-77ccb52f0af6-.svg': 'bell2',
        'iconsax-keyboard-open-0012ba7e6112-.svg': 'keyboard',
        'iconsax-headphone-9f9e813ab09d-.svg': 'headphone',
        'iconsax-microphone-slash-c4d7b5c59434-.svg': 'mic_slash',
        'iconsax-mirroring-screen-61d67224a5b4-.svg': 'screen',
        'iconsax-call-received-b622d4effc15-.svg': 'call_received',
        'iconsax-call-remove-fa29139fe8cd-.svg': 'call_remove',
        'iconsax-call-slash-257d09a5ec24-.svg': 'call_slash',
        'iconsax-chart-success-889cebffcb2b-.svg': 'chart',
        'iconsax-wallet-929f2a9ff6cc-.svg': 'wallet',
        'iconsax-wallet-add-103a4a6fb82a-.svg': 'wallet_add',
        'iconsax-coin-ce3cc5aab550-.svg': 'coin',
        'iconsax-bank-63a78934bffa-.svg': 'bank',
        'iconsax-gift152-f5da21e6122f-.svg': 'gift',
        'iconsax-login-b2c55237500e-.svg': 'login',
        'iconsax-logout2-8c2ab75fad10-.svg': 'logout',
        'iconsax-arrow-circle-left-5fc816cbef8c-.svg': 'arrow_left',
        'iconsax-arrow-circle-right-b3238983f30c-.svg': 'arrow_right',
        'iconsax-arrow-circle-up-a14c3a90d550-.svg': 'arrow_up',
        'iconsax-arrow-circle-down-5b62c9da298b-.svg': 'arrow_down',
        'iconsax-snow-a3796630ad1d-.svg': 'snow',
        'iconsax-shop-snow-47b8e17e6cea-.svg': 'shop_snow',
        'iconsax-js-272da45baa5a-.svg': 'js',
        'iconsax-solana-sol-20905f436e75-.svg': 'solana',
        'iconsax-enhance-user-ai-73939dc49d7c-.svg': 'enhance_user',
        'iconsax-export-arrow-1bc21b7e3f73-.svg': 'export_arrow',
        'iconsax-import-arrow-f341601c51a3-.svg': 'import_arrow',
        'iconsax-arrow-down4-2ae7ccb38fac-.svg': 'arrow_down4',
        'iconsax-arrow-right4-936c10a60949-.svg': 'arrow_right4',
        'iconsax-arrow-up3-fe34c82a0975-.svg': 'arrow_up3'
    };

    for (const [svgFile, name] of Object.entries(svgMap)) {
        const existing = guild.emojis.cache.find(e => e.name.toLowerCase() === name);
        if (existing) {
            customEmojis[name] = existing.toString();
            continue;
        }
        const svgPath = path.join(emojiDir, svgFile);
        if (!fs.existsSync(svgPath)) continue;
        try {
            const pngPath = path.join(pngDir, svgFile.replace(/\.svg$/, '.png'));
            let pngBuf;
            if (fs.existsSync(pngPath)) {
                pngBuf = fs.readFileSync(pngPath);
            } else {
                const img = await loadImage(fs.readFileSync(svgPath));
                const canvas = createCanvas(128, 128);
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0, 128, 128);
                pngBuf = canvas.toBuffer('image/png');
                fs.writeFileSync(pngPath, pngBuf);
            }
            const created = await guild.emojis.create({
                attachment: pngBuf,
                name: name,
                reason: 'Kiliua custom vector emoji'
            });
            customEmojis[name] = created.toString();
            syncedCount++;
        } catch (err) {
            errors.push(`${name}: ${err.message}`);
        }
    }

    try {
        fs.writeFileSync(path.join(emojiDir, 'emojis.json'), JSON.stringify(customEmojis, null, 2));
    } catch (e) {}

    return { success: true, syncedCount, errors };
}

// ===================== CANVAS DUAL IMAGE (side by side) =====================
async function buildDualImage(leftUrl, rightUrl, size = 96) {
    try {
        const gap = 12;
        const padding = 12;
        const width = size + (padding * 2);
        const height = (size * 2) + gap + (padding * 2);
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // background container
        ctx.fillStyle = 'rgba(15, 23, 42, 0.9)';
        ctx.beginPath();
        ctx.roundRect(0, 0, width, height, 14);
        ctx.fill();

        // helper: draw circular image with support for both static and animated/normal loading
        async function drawCircle(url, x, y, s) {
            try {
                const img = await loadImage(url);
                ctx.save();
                ctx.beginPath();
                ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(img, x, y, s, s);
                ctx.restore();
                // glowing ring
                ctx.save();
                ctx.beginPath();
                ctx.arc(x + s / 2, y + s / 2, s / 2, 0, Math.PI * 2);
                ctx.strokeStyle = '#6366f1';
                ctx.lineWidth = 3;
                ctx.stroke();
                ctx.restore();
            } catch (e) { /* skip broken images */ }
        }

        await drawCircle(leftUrl, padding, padding, size);
        await drawCircle(rightUrl, padding, padding + size + gap, size);

        return canvas.toBuffer('image/png');
    } catch (e) {
        console.error('[CANVAS] dual image error:', e.message);
        return null;
    }
}

function isOwner(m) {
    if (!m) return false;
    const id = m.id || m.user?.id;
    if (OWNER_IDS && OWNER_IDS.length > 0 && OWNER_IDS.includes(id)) return true;
    if (config.owner_ids && config.owner_ids.includes(id)) return true;
    if (config.whitelist_ids && config.whitelist_ids.includes(id)) return true;
    if (m.guild && m.guild.ownerId === id) return true;
    if (m.permissions && m.permissions.has(PermissionFlagsBits.Administrator)) return true;
    return false;
}

// Parse a custom emoji string "<a:name:id>" into { id, animated, url }
function parseCustomEmoji(str) {
    if (!str) return null;
    const m = str.match(/<(a?):([a-zA-Z0-9_]+):(\d+)>/);
    if (!m) return null;
    const animated = m[1] === 'a';
    const id = m[3];
    return { id, animated, url: `https://cdn.discordapp.com/emojis/${id}.${animated ? 'gif' : 'png'}?size=128` };
}

// Professional "ACCESS DENIED" banner (uses the danger emoji from the emoji channel)
async function buildAccessDeniedBanner() {
    try {
        const width = 920, height = 260;
        const canvas = createCanvas(width, height);
        const ctx = canvas.getContext('2d');

        // dark gradient background
        const grad = ctx.createLinearGradient(0, 0, width, height);
        grad.addColorStop(0, '#0b0d12');
        grad.addColorStop(1, '#15171f');
        ctx.fillStyle = grad;
        ctx.fillRect(0, 0, width, height);

        // left red accent bar
        ctx.fillStyle = '#ed4245';
        ctx.fillRect(0, 0, 12, height);

        // outer border
        ctx.strokeStyle = 'rgba(237,66,69,0.5)';
        ctx.lineWidth = 3;
        ctx.strokeRect(6, 6, width - 12, height - 12);

        // draw the danger emoji (from the configured emoji channel) on the left
        let textX = 70;
        const em = parseCustomEmoji(getCustomEmoji('danger'));
        if (em) {
            try {
                const img = await loadImage(em.url);
                const s = 130;
                ctx.save();
                ctx.beginPath();
                ctx.arc(textX + s / 2, height / 2, s / 2, 0, Math.PI * 2);
                ctx.closePath();
                ctx.clip();
                ctx.drawImage(img, textX, height / 2 - s / 2, s, s);
                ctx.restore();
                ctx.beginPath();
                ctx.arc(textX + s / 2, height / 2, s / 2 + 5, 0, Math.PI * 2);
                ctx.strokeStyle = '#ed4245';
                ctx.lineWidth = 4;
                ctx.stroke();
                textX += s + 50;
            } catch (e) { /* emoji failed to load, continue */ }
        }

        // title
        ctx.textBaseline = 'middle';
        ctx.fillStyle = '#ed4245';
        ctx.font = 'bold 72px sans-serif';
        ctx.fillText('ACCESS DENIED', textX, height / 2 - 28);

        // subtitle
        ctx.fillStyle = '#9aa0aa';
        ctx.font = '28px sans-serif';
        ctx.fillText('Protected account - information is hidden', textX, height / 2 + 42);

        return canvas.toBuffer('image/png');
    } catch (e) {
        console.error('[CANVAS] access denied banner error:', e.message);
        return null;
    }
}

function fmtDate(ts) { if (!ts) return '`N/A`'; return `<t:${Math.floor(new Date(ts).getTime() / 1000)}:F>`; }
function fmtRel(ts) { if (!ts) return '`N/A`'; return `<t:${Math.floor(new Date(ts).getTime() / 1000)}:R>`; }

function serverIcon(id, hash, sz = 256) {
    if (!hash) return null;
    return `https://cdn.discordapp.com/icons/${id}/${hash}.${hash.startsWith('a_') ? 'gif' : 'png'}?size=${sz}`;
}

function getRandomBanner() {
    return BANNER_GIFS[Math.floor(Math.random() * BANNER_GIFS.length)];
}

function addBanner(embed) {
    return embed;
}

// --- IMAGE ATTACHMENT LOADER (STRICTLY LOCAL PNG ATTACHMENTS ONLY) ───
function getImageAttachment(filenameOrKey, attachmentName = 'thumbnail.png') {
    const pngDir = path.join(__dirname, 'custom_emojis', 'png');
    let target = filenameOrKey;
    if (!target || typeof target !== 'string' || target.startsWith('http://') || target.startsWith('https://')) {
        target = attachmentName.includes('server') ? 'iconsax-driver-f050b33fa120-.png' : 'iconsax-ai-users-b92969ecc876-.png';
    }
    if (customEmojis[target]) {
        target = customEmojis[target];
    }
    let localPath = path.isAbsolute(target) ? target : path.join(pngDir, target);
    if (!fs.existsSync(localPath)) {
        localPath = path.join(pngDir, attachmentName.includes('server') ? 'iconsax-driver-f050b33fa120-.png' : 'iconsax-ai-users-b92969ecc876-.png');
    }
    if (fs.existsSync(localPath)) {
        return new AttachmentBuilder(localPath, { name: attachmentName });
    }
    return null;
}

// Resolve a thumbnail: real Discord CDN image URL (no download needed — Discord
// renders it directly) or fall back to a local PNG attachment.
function resolveThumb(url, fallbackPng, attachName, files) {
    if (url && typeof url === 'string' && /^https?:\/\//.test(url)) return url;
    const att = getImageAttachment(fallbackPng, attachName);
    if (att) {
        if (!files.some(f => f.name === attachName)) files.push(att);
        return `attachment://${attachName}`;
    }
    return null;
}

function makeSection(text, thumbUrl) {
    const td = new TextDisplayBuilder().setContent(text);
    if (!thumbUrl) return { type: 'text', comp: td };
    return {
        type: 'section',
        comp: new SectionBuilder().addTextDisplayComponents(td).setThumbnailAccessory(new ThumbnailBuilder().setURL(thumbUrl))
    };
}

function addBlock(container, block) {
    if (block.type === 'section') container.addSectionComponents(block.comp);
    else container.addTextDisplayComponents(block.comp);
}

function prettyPerm(p) {
    return String(p).toLowerCase().split('_').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
}

function fmtNum(n) {
    if (n === null || n === undefined || n === '') return null;
    const v = Number(n);
    return Number.isFinite(v) ? v.toLocaleString('en-US') : String(n);
}

function cleanRoleName(n) {
    let s = String(n || '');
    s = s.replace(/^[-—–\s•·●|│┃丨~_#*`★⚡✦✧\^]+/u, '');
    s = s.replace(/[-—–\s•·●|│┃丨~_#*`★⚡✦✧\^]+$/u, '');
    s = s.replace(/^[|•·●\s]+|[|•·●\s]+$/u, '');
    return s.trim() || 'Role';
}

function userAvatarUrl(user) {
    if (!user) return 'https://cdn.discordapp.com/embed/avatars/0.png';
    if (typeof user.displayAvatarURL === 'function') {
        try { return user.displayAvatarURL({ size: 256, extension: 'png', forceStatic: false }); } catch {}
    }
    const id = user.id || user.user_id;
    const avatar = user.avatar;
    if (id && avatar) {
        return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${avatar.startsWith('a_') ? 'gif' : 'png'}?size=256`;
    }
    if (id) {
        try {
            return `https://cdn.discordapp.com/embed/avatars/${Number((BigInt(id) >> 22n) % 6n)}.png`;
        } catch {
            return 'https://cdn.discordapp.com/embed/avatars/0.png';
        }
    }
    return 'https://cdn.discordapp.com/embed/avatars/0.png';
}

function makeWaitingContainer({ title, description, targetUser, targetServer, user, iconKey = 'loader' }) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));

    const files = [];

    let thumbUrl = null;
    let thumbFallback = 'iconsax-clock-a36fba08b60c-.png';
    let thumbName = 'wait_thumb.png';

    if (targetUser) {
        thumbUrl = userAvatarUrl(targetUser);
        thumbFallback = 'iconsax-ai-users-b92969ecc876-.png';
        thumbName = 'target_user_wait.png';
    } else if (targetServer) {
        thumbUrl = serverIcon(targetServer.id || targetServer.serverId, targetServer.icon || targetServer.serverIconHash, 256);
        thumbFallback = 'iconsax-driver-f050b33fa120-.png';
        thumbName = 'target_server_wait.png';
    } else if (user) {
        thumbUrl = userAvatarUrl(user);
    }

    const waitThumb = resolveThumb(thumbUrl, thumbFallback, thumbName, files);

    const text = [
        `### ${E(iconKey)}${title || 'Scanning In Progress...'}`,
        `> ${description || 'Analyzing database and server permissions. Please wait...'}`
    ].join('\n');

    addBlock(container, makeSection(text, waitThumb));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E('eye')}Requested by ${user?.username || 'User'}  •  Live Security Scanner`
    ));

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };
}

// ─── DUAL-SIDE CONTAINER V2 BUILDER FOR ROLE CHECKER ──────────
async function buildRoleCheckContainerV2({
    guild,
    targetUser,
    pageData,
    page = 0,
    totalPages = 1,
    checkedBy
}) {
    const container = new ContainerBuilder();

    const isOwner = !!pageData.isOwner;
    const powers = pageData.powers || [];
    const hasDanger = powers.length > 0 || isOwner;
    const accentColor = isOwner ? THEME.GOLD : hasDanger ? THEME.DANGER : THEME.PRIMARY;
    try { container.setAccentColor(resolveColor(accentColor)); } catch {}

    const files = [];

    // ── Real images: server icon from checker.js / bot cache, user's real avatar
    const serverThumb = resolveThumb(pageData.serverIcon, 'iconsax-driver-f050b33fa120-.png', 'server_logo.png', files);
    const userThumb = resolveThumb(userAvatarUrl(targetUser), 'iconsax-ai-users-b92969ecc876-.png', 'user_avatar.png', files);

    // ── Section 1: Server
    const serverName = pageData.serverName || 'Unknown Server';
    const serverId = pageData.serverId || 'Unknown';
    const members = fmtNum(pageData.memberCount);
    const online = fmtNum(pageData.onlineCount);
    const inVoice = fmtNum(pageData.voiceActiveCount);

    const statLine = [
        members ? `${E('members')}**Members:** \`${members}\`` : null,
        online ? `${E('online')}**Online:** \`${online}\`` : null,
        inVoice !== null && pageData.voiceActiveCount !== undefined && pageData.source === 'Current Server' ? `${E('voice')}**In Voice:** \`${inVoice}\`` : null
    ].filter(Boolean).join('  •  ');

    let ownerDisplay = null;
    if (pageData.ownerId) {
        if (pageData.ownerId === targetUser.id) {
            ownerDisplay = `<@${targetUser.id}>`;
        } else {
            const cachedOwner = client.users.cache.get(pageData.ownerId);
            if (cachedOwner) {
                ownerDisplay = `@${cachedOwner.username}`;
            } else if (pageData.ownerTag || pageData.ownerName) {
                ownerDisplay = `\`${pageData.ownerTag || pageData.ownerName}\``;
            } else {
                ownerDisplay = `\`${pageData.ownerId}\``;
            }
        }
    }
    const ownerStr = ownerDisplay ? `${E('crown')}**Owner:** ${ownerDisplay}` : null;

    const metaLine = [
        ownerStr,
        pageData.boostTier || pageData.boostCount ? `${E('boost')}**Boost:** \`Lvl ${pageData.boostTier || 0} (${pageData.boostCount || 0})\`` : null,
        pageData.vanity ? `${E('login')}\`discord.gg/${pageData.vanity}\`` : null
    ].filter(Boolean).join('  •  ');

    const serverText = [
        `### ${E('server')}${serverName}`,
        `-# **Server ID:** \`${serverId}\`  •  **Source:** \`${pageData.source || 'Live Scanner'}\``,
        statLine ? `> ${statLine}` : null,
        metaLine ? `> ${metaLine}` : null
    ].filter(Boolean).join('\n');

    // ── Section 2: User
    const displayName = targetUser.globalName || targetUser.username;
    const userTag = targetUser.discriminator && targetUser.discriminator !== '0'
        ? `${targetUser.username}#${targetUser.discriminator}`
        : `@${targetUser.username}`;

    const joined = pageData.joinedTs ? `<t:${pageData.joinedTs}:D> (<t:${pageData.joinedTs}:R>)` : '`N/A`';
    const voiceNow = pageData.voiceStatus && pageData.voiceStatus !== 'Offline' ? `\`${pageData.voiceStatus}\`` : '`Offline`';

    const sortedRoles = (pageData.roles || [])
        .slice()
        .sort((a, b) => (b.position || 0) - (a.position || 0))
        .map(r => cleanRoleName(r.name || r))
        .filter(n => n && n !== '@everyone');

    const cleanTopRole = cleanRoleName(pageData.highestRole) || sortedRoles[0] || 'Member';
    const rolesShown = sortedRoles.slice(0, 8).map(n => `\`${n}\``).join('  ');
    const rolesMore = sortedRoles.length > 8 ? ` \`+${sortedRoles.length - 8} more\`` : '';

    const permList = powers.map(p => prettyPerm(p));
    const powersShown = permList.length > 0
        ? permList.slice(0, 8).map(p => `\`${p}\``).join('  ') + (permList.length > 8 ? ` \`+${permList.length - 8} more\`` : '')
        : '`None`';

    const badges = [
        isOwner ? `${E('crown')}\`Server Owner\`` : null,
        !isOwner && hasDanger ? `${E('danger')}\`Staff Powers\`` : null,
        !hasDanger ? `${E('clean')}\`Clean\`` : null
    ].filter(Boolean).join(' ');

    const userText = [
        `### ${E('user')}**${displayName}** (\`${userTag}\`)${pageData.nick ? ` — \`${pageData.nick}\`` : ''}`,
        `-# **User ID:** \`${targetUser.id}\`  •  **Tag:** \`${userTag}\`  •  ${badges}`,
        `> ${E('role')}**Highest Role:** \`${cleanTopRole}\``,
        `> ${E('clock')}**Joined Server:** ${joined}  •  ${E('voice')}**Voice:** ${voiceNow}`,
        powers.length > 0 ? `> ${E('lock')}**Permissions (${powers.length}):** ${powersShown}` : null,
        sortedRoles.length > 0 ? `> ${E('staff')}**Assigned Roles (${sortedRoles.length}):** ${rolesShown}${rolesMore}` : null
    ].filter(Boolean).join('\n');

    addBlock(container, makeSection(serverText, serverThumb));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    addBlock(container, makeSection(userText, userThumb));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E('eye')}Checked by ${checkedBy.username}  •  Server ${page + 1}/${totalPages}  •  <t:${Math.floor(Date.now() / 1000)}:t>`
    ));

    // ── Grey secondary buttons with arrow icons + labels (no unicode arrows)
    const leftE = parseCustomEmoji(getCustomEmoji('arrow_left')) || parseCustomEmoji(getCustomEmoji('arrow_circle_left'));
    const rightE = parseCustomEmoji(getCustomEmoji('arrow_right')) || parseCustomEmoji(getCustomEmoji('arrow_circle_right'));
    const refreshE = parseCustomEmoji(getCustomEmoji('track')) || parseCustomEmoji(getCustomEmoji('eye'));

    const prevBtn = new ButtonBuilder().setCustomId('cr:prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0);
    if (leftE) prevBtn.setEmoji({ id: leftE.id }).setLabel('Prev'); else prevBtn.setLabel('Prev');

    const nextBtn = new ButtonBuilder().setCustomId('cr:next').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1);
    if (rightE) nextBtn.setEmoji({ id: rightE.id }).setLabel('Next'); else nextBtn.setLabel('Next');

    const refreshBtn = new ButtonBuilder().setCustomId('cr:refresh').setStyle(ButtonStyle.Secondary).setLabel('Refresh');
    if (refreshE) refreshBtn.setEmoji({ id: refreshE.id });

    const row = new ActionRowBuilder();
    if (totalPages > 1) {
        row.addComponents(
            prevBtn,
            new ButtonBuilder().setCustomId('cr:page').setLabel(`${page + 1} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            nextBtn,
            refreshBtn
        );
    } else {
        row.addComponents(refreshBtn);
    }
    container.addActionRowComponents(row);

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };
}

// ─── ROLE-CHECK PAGINATION SESSIONS (global handler → never "didn't respond") ───
const crSessions = new Map(); // messageId -> { pages, page, targetUser, guildId, authorId, author, expires }
setInterval(() => {
    const now = Date.now();
    for (const [k, s] of crSessions) if (s.expires < now) crSessions.delete(k);
}, 5 * 60 * 1000);

async function refreshCurrentGuildPage(session) {
    const p = session.pages[session.page];
    if (!p || p.source !== 'Current Server') return;
    const g = client.guilds.cache.get(p.serverId);
    if (!g) return;
    const member = await g.members.fetch({ user: session.targetUser.id, force: true }).catch(() => null);
    if (!member) return;
    const fresh = buildCurrentGuildPage(g, member);
    session.pages[session.page] = fresh;
}

client.on('interactionCreate', async (i) => {
    // 0. Handle Modals
    if (i.isModalSubmit()) {
        if (i.customId === 'token_modal_connect_submit') {
            await i.deferReply({ ephemeral: true });
            const raw = i.fields.getTextInputValue('user_token_input') || '';
            const token = raw.replace(/^Bot\s+/i, '').replace(/[\"\']/g, '').trim();
            if (token.length < 25) {
                return await i.editReply({ content: 'Invalid token format. Token must be at least 25 characters.' });
            }
            try {
                const uRes = await axios.get('https://discord.com/api/v9/users/@me', {
                    headers: { Authorization: token, 'User-Agent': 'Mozilla/5.0' },
                    timeout: 8000
                });
                const u = uRes.data;
                let gCount = 0;
                try {
                    const gRes = await axios.get('https://discord.com/api/v9/users/@me/guilds', {
                        headers: { Authorization: token, 'User-Agent': 'Mozilla/5.0' },
                        timeout: 8000
                    });
                    gCount = gRes.data?.length || 0;
                } catch {}

                if (!db.userTokens) db.userTokens = {};
                db.userTokens[i.user.id] = token;
                if (!Array.isArray(db.userTokensPool)) db.userTokensPool = [];
                if (!db.userTokensPool.includes(token)) db.userTokensPool.push(token);
                fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
                refreshGuildIndex(true).catch(() => {});

                const tag = u.discriminator && u.discriminator !== '0' ? `${u.username}#${u.discriminator}` : `@${u.username}`;
                return await i.editReply({
                    content: `Account connected successfully!\n• User: **${tag}** (\`${u.id}\`)\n• Accessible Servers: **${gCount}** servers linked to scanner network.`
                });
            } catch (err) {
                return await i.editReply({
                    content: `Token validation failed: \`${err.response?.data?.message || err.message}\``
                });
            }
        }

        if (i.customId === 'token_modal_add_submit') {
            await i.deferReply({ ephemeral: true });
            if (!isOwner(i.member)) {
                return await i.editReply({ content: 'Permission denied. Only administrators can add pool tokens.' });
            }
            const raw = i.fields.getTextInputValue('pool_token_input') || '';
            const token = raw.replace(/^Bot\s+/i, '').replace(/[\"\']/g, '').trim();
            if (token.length < 25) {
                return await i.editReply({ content: 'Invalid token format.' });
            }
            try {
                const uRes = await axios.get('https://discord.com/api/v9/users/@me', {
                    headers: { Authorization: token, 'User-Agent': 'Mozilla/5.0' },
                    timeout: 8000
                });
                const u = uRes.data;
                let gCount = 0;
                try {
                    const gRes = await axios.get('https://discord.com/api/v9/users/@me/guilds', {
                        headers: { Authorization: token, 'User-Agent': 'Mozilla/5.0' },
                        timeout: 8000
                    });
                    gCount = gRes.data?.length || 0;
                } catch {}

                if (!Array.isArray(db.userTokensPool)) db.userTokensPool = [];
                if (!db.userTokensPool.includes(token)) db.userTokensPool.push(token);
                fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
                refreshGuildIndex(true).catch(() => {});

                const tag = u.discriminator && u.discriminator !== '0' ? `${u.username}#${u.discriminator}` : `@${u.username}`;
                return await i.editReply({
                    content: `Token added to pool!\n• User: **${tag}** (\`${u.id}\`)\n• Accessible Servers: **${gCount}**\n• Total Pool Size: **${getTokenPool().length}** tokens.`
                });
            } catch (err) {
                return await i.editReply({
                    content: `Token validation failed: \`${err.response?.data?.message || err.message}\``
                });
            }
        }
        return;
    }

    if (!i.isButton() && !i.isStringSelectMenu()) return;

    // Check modal buttons BEFORE deferUpdate
    if (i.isButton()) {
        if (i.customId === 'token:modal:connect') {
            const modal = new ModalBuilder()
                .setCustomId('token_modal_connect_submit')
                .setTitle('Link Personal User Token');

            const input = new TextInputBuilder()
                .setCustomId('user_token_input')
                .setLabel('Discord User Token')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Paste your user token here...')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return await i.showModal(modal);
        }
        if (i.customId === 'token:modal:add') {
            if (!isOwner(i.member)) {
                return await i.reply({
                    content: 'Only administrators or server owners can add tokens to the shared pool.',
                    ephemeral: true
                });
            }
            const modal = new ModalBuilder()
                .setCustomId('token_modal_add_submit')
                .setTitle('Add Shared Pool Token');

            const input = new TextInputBuilder()
                .setCustomId('pool_token_input')
                .setLabel('Discord User Token')
                .setStyle(TextInputStyle.Short)
                .setPlaceholder('Paste shared pool token here...')
                .setRequired(true);

            modal.addComponents(new ActionRowBuilder().addComponents(input));
            return await i.showModal(modal);
        }
    }

    // Immediately ACK interaction within 20ms to prevent "This interaction failed"
    await i.deferUpdate().catch(() => {});

    // Token Management Buttons (token:refresh, token:unlink, token:purge_dead)
    if (i.customId.startsWith('token:')) {
        const s = tokenSessions.get(i.message.id);
        const authorId = s?.authorId || i.user.id;

        if (i.customId === 'token:refresh') {
            try {
                const payload = await buildTokensContainerV2({ requestedBy: i.user, authorId });
                await i.editReply({ ...payload, attachments: [] });
            } catch (err) {
                console.error('[TOKEN REFRESH ERR]', err.message);
            }
            return;
        }

        if (i.customId === 'token:unlink') {
            if (db.userTokens?.[i.user.id]) {
                delete db.userTokens[i.user.id];
                fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
                refreshGuildIndex(true).catch(() => {});
                try {
                    const payload = await buildTokensContainerV2({ requestedBy: i.user, authorId: i.user.id });
                    await i.editReply({ ...payload, attachments: [] });
                } catch {}
            } else {
                await i.followUp({ content: 'You do not have a personal account token linked.', ephemeral: true }).catch(() => {});
            }
            return;
        }

        if (i.customId === 'token:purge_dead') {
            if (!isOwner(i.member)) {
                return await i.followUp({ content: 'Only administrators can clean pool tokens.', ephemeral: true }).catch(() => {});
            }
            const pool = db.userTokensPool || [];
            const cleanList = [];
            for (const tok of pool) {
                try {
                    await axios.get('https://discord.com/api/v9/users/@me', {
                        headers: { Authorization: tok, 'User-Agent': 'Mozilla/5.0' },
                        timeout: 5000
                    });
                    cleanList.push(tok);
                } catch (e) {
                    if (e.response?.status === 401) {
                        // Dead token removed
                    } else {
                        cleanList.push(tok);
                    }
                }
            }
            db.userTokensPool = cleanList;
            fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
            refreshGuildIndex(true).catch(() => {});
            try {
                const payload = await buildTokensContainerV2({ requestedBy: i.user, authorId: i.user.id });
                await i.editReply({ ...payload, attachments: [] });
            } catch {}
            return;
        }
    }

    // 1. Role Check Buttons (cr:prev, cr:next, cr:refresh)
    if (i.customId.startsWith('cr:')) {
        const s = crSessions.get(i.message.id);
        if (!s || i.user.id !== s.authorId) return;
        const action = i.customId.slice(3);
        if (action === 'prev' && s.page > 0) s.page--;
        else if (action === 'next' && s.page < s.pages.length - 1) s.page++;
        else if (action === 'refresh') await refreshCurrentGuildPage(s);
        s.expires = Date.now() + PAGINATION_TIMEOUT_MS;

        try {
            const payload = await buildRoleCheckContainerV2({
                targetUser: s.targetUser,
                pageData: s.pages[s.page],
                page: s.page,
                totalPages: s.pages.length,
                checkedBy: s.author
            });
            await i.editReply({ ...payload, attachments: [] });
        } catch (err) {
            console.error('[CR BUTTON ERR]', err.message);
        }
        return;
    }

    // 2. TMA Voice Leaderboard Buttons (tma:prev, tma:next, tma:refresh)
    if (i.customId.startsWith('tma:')) {
        const s = tmaSessions.get(i.message.id);
        if (!s || i.user.id !== s.authorId) return;
        const totalPages = Math.ceil(s.results.length / 10) || 1;
        const action = i.customId.slice(4);
        if (action === 'prev' && s.page > 0) s.page--;
        else if (action === 'next' && s.page < totalPages - 1) s.page++;
        else if (action === 'refresh') {
            try {
                const token = db.userTokens[s.authorId] || config.checker_user_token || config.fallback_user_token;
                if (token) {
                    const res = await api.get('/tma', { headers: { Authorization: token }, timeout: 60000 });
                    if (res.data?.results?.length) {
                        s.results = res.data.results.filter(x => {
                            const h = (x.activeVoiceHumans !== undefined ? x.activeVoiceHumans : x.activeVoice) || 0;
                            return h > 0;
                        });
                    }
                }
            } catch {}
        }
        s.expires = Date.now() + PAGINATION_TIMEOUT_MS;

        try {
            const payload = await buildTmaContainerV2({
                results: s.results,
                page: s.page,
                totalPages: Math.ceil(s.results.length / 10) || 1,
                requestedBy: s.author
            });
            await i.editReply({ ...payload, attachments: [] });
        } catch (err) {
            console.error('[TMA BUTTON ERR]', err.message);
        }
        return;
    }

    // 3. Staff Directory Buttons (stf:prev, stf:next, stf:refresh)
    if (i.customId.startsWith('stf:')) {
        const s = staffSessions.get(i.message.id);
        if (!s || i.user.id !== s.authorId) return;
        const totalPages = s.totalPages || Math.ceil(s.members.length / 6) || 1;
        const action = i.customId.slice(4);
        if (action === 'prev' && s.page > 0) s.page--;
        else if (action === 'next' && s.page < totalPages - 1) s.page++;
        else if (action === 'refresh') {
            try {
                const token = db.userTokens[s.authorId] || config.checker_user_token || config.fallback_user_token;
                if (token && s.serverId) {
                    const res = await api.get('/checkadmins', {
                        headers: { Authorization: token },
                        params: { guildId: s.serverId },
                        timeout: 120000
                    });
                    if (res.data?.members) {
                        s.members = res.data.members;
                        s.guild = res.data.guild || s.guild;
                        s.totalPages = Math.ceil(s.members.length / 6) || 1;
                    }
                }
            } catch {}
        }
        s.expires = Date.now() + PAGINATION_TIMEOUT_MS;

        try {
            const payload = await buildStaffContainerV2({
                guild: s.guild,
                members: s.members,
                page: s.page,
                totalPages: s.totalPages,
                requestedBy: s.author,
                modeText: s.modeText,
                viewSuffix: s.viewSuffix,
                source: s.source
            });
            await i.editReply({ ...payload, attachments: [] });
        } catch (err) {
            console.error('[STAFF BUTTON ERR]', err.message);
        }
        return;
    }

    // 4. Staff Cross Check Buttons (cross:prev, cross:next, cross:refresh)
    if (i.customId.startsWith('cross:')) {
        const s = staffCrossSessions.get(i.message.id);
        if (!s || i.user.id !== s.authorId) return;
        const totalPages = s.totalPages || Math.ceil(s.allResults.length / 5) || 1;
        const action = i.customId.slice(6);
        if (action === 'prev' && s.page > 0) s.page--;
        else if (action === 'next' && s.page < totalPages - 1) s.page++;
        s.expires = Date.now() + PAGINATION_TIMEOUT_MS;

        try {
            const payload = await buildStaffCrossContainerV2({
                sourceGuild: s.sourceGuild,
                targetGuild: s.targetGuild,
                sourceId: s.sourceId,
                targetId: s.targetId,
                allResults: s.allResults,
                page: s.page,
                totalPages: s.totalPages,
                requestedBy: s.author
            });
            await i.editReply({ ...payload, attachments: [] });
        } catch (err) {
            console.error('[CROSS BUTTON ERR]', err.message);
        }
        return;
    }

    // 5.0. Help Menu Select Menu (help:select)
    if (i.isStringSelectMenu() && i.customId === 'help:select') {
        const s = helpSessions.get(i.message.id);
        if (!s || i.user.id !== s.authorId) return;
        const cat = i.values[0] || 'all';
        s.category = cat;
        s.expires = Date.now() + PAGINATION_TIMEOUT_MS;

        try {
            const payload = await buildHelpContainerV2({
                category: cat,
                requestedBy: s.author
            });
            await i.editReply({ ...payload, attachments: [] });
        } catch (err) {
            console.error('[HELP SELECT ERR]', err.message);
        }
        return;
    }

    // 5.1. Fallcheck Buttons (fall:prev, fall:next, fall:refresh)
    if (i.customId.startsWith('fall:')) {
        const s = fallSessions.get(i.message.id);
        if (!s || i.user.id !== s.authorId) return;
        const action = i.customId.slice(5);
        if (action === 'prev' && s.page > 0) s.page--;
        else if (action === 'next' && s.page < s.results.length - 1) s.page++;
        else if (action === 'refresh') {
            try {
                const token = db.userTokens[s.authorId] || config.checker_user_token || config.fallback_user_token;
                if (token) {
                    const res = await api.get('/check', { headers: { Authorization: token }, params: { userId: s.userId, fullScan: 'true' }, timeout: 120000 });
                    if (res.data?.results) s.results = res.data.results;
                }
            } catch {}
        }
        s.expires = Date.now() + PAGINATION_TIMEOUT_MS;

        try {
            const payload = await buildFallcheckContainerV2({
                user: s.user,
                userId: s.userId,
                results: s.results,
                page: s.page,
                requestedBy: s.author
            });
            await i.editReply({ ...payload, attachments: [] });
        } catch (err) {
            console.error('[FALL BUTTON ERR]', err.message);
        }
        return;
    }

    // 5.2. Staff Role Buttons (srole:prev, srole:next, srole:refresh)
    if (i.customId.startsWith('srole:')) {
        const s = sroleSessions.get(i.message.id);
        if (!s || i.user.id !== s.authorId) return;
        const action = i.customId.slice(6);
        if (action === 'prev' && s.page > 0) s.page--;
        else if (action === 'next' && s.page < s.results.length - 1) s.page++;
        s.expires = Date.now() + PAGINATION_TIMEOUT_MS;

        try {
            const payload = await buildStaffRoleContainerV2({
                roleQuery: s.roleQuery,
                results: s.results,
                page: s.page,
                requestedBy: s.author
            });
            await i.editReply({ ...payload, attachments: [] });
        } catch (err) {
            console.error('[SROLE BUTTON ERR]', err.message);
        }
        return;
    }

    // 5. Help Menu Buttons (help:all, help:staff, help:voice, help:system)
    if (i.customId.startsWith('help:')) {
        const s = helpSessions.get(i.message.id);
        if (!s || i.user.id !== s.authorId) return;
        const cat = i.customId.slice(5);
        s.category = cat;
        s.expires = Date.now() + PAGINATION_TIMEOUT_MS;

        try {
            const payload = await buildHelpContainerV2({
                category: cat,
                requestedBy: s.author
            });
            await i.editReply({ ...payload, attachments: [] });
        } catch (err) {
            console.error('[HELP BUTTON ERR]', err.message);
        }
        return;
    }

    // 6. CV Voice Status Buttons (cv:prev, cv:next, cv:refresh)
    if (i.customId.startsWith('cv:')) {
        const s = cvSessions.get(i.message.id);
        if (!s || i.user.id !== s.authorId) return;
        const action = i.customId.slice(3);
        if (action === 'prev' && s.page > 0) s.page--;
        else if (action === 'next' && s.page < s.results.length - 1) s.page++;
        else if (action === 'refresh') {
            try {
                const token = db.userTokens[s.authorId] || config.checker_user_token || config.fallback_user_token;
                if (token) {
                    const res = await api.get('/cv', { headers: { Authorization: token }, params: { userId: s.userId }, timeout: 120000 });
                    s.results = res.data?.results || [];
                    s.page = Math.min(s.page, Math.max(0, s.results.length - 1));
                }
            } catch {}
        }
        s.expires = Date.now() + PAGINATION_TIMEOUT_MS;

        try {
            const payload = await buildCvContainerV2({
                user: s.user,
                userId: s.userId,
                results: s.results,
                page: s.page,
                requestedBy: s.author
            });
            await i.editReply({ ...payload, attachments: [] });
        } catch (err) {
            console.error('[CV BUTTON ERR]', err.message);
        }
        return;
    }

    // 6.5. CS Dangerous Roles Buttons (cs:prev, cs:next, cs:refresh)
    if (i.customId.startsWith('cs:')) {
        const s = csSessions.get(i.message.id);
        if (!s || i.user.id !== s.authorId) return;
        const action = i.customId.slice(3);
        if (action === 'prev' && s.page > 0) s.page--;
        else if (action === 'next' && s.page < s.results.length - 1) s.page++;
        else if (action === 'refresh') {
            try {
                const token = db.userTokens[s.authorId] || config.checker_user_token || config.fallback_user_token;
                if (token) {
                    const res = await api.get('/cs', { headers: { Authorization: token }, params: { userId: s.userId }, timeout: 600000 });
                    s.results = res.data?.results || [];
                    s.page = Math.min(s.page, Math.max(0, s.results.length - 1));
                }
            } catch {}
        }
        s.expires = Date.now() + PAGINATION_TIMEOUT_MS;

        try {
            const payload = await buildCsContainerV2({
                user: s.user,
                userId: s.userId,
                results: s.results,
                page: s.page,
                requestedBy: s.author
            });
            await i.editReply({ ...payload, attachments: [] });
        } catch (err) {
            console.error('[CS BUTTON ERR]', err.message);
        }
        return;
    }

    // 7. Servers Directory Buttons (srv:prev, srv:next, srv:refresh)
    if (i.customId.startsWith('srv:')) {
        const s = srvSessions.get(i.message.id);
        if (!s || i.user.id !== s.authorId) return;
        const totalPages = Math.ceil(s.guilds.length / 8) || 1;
        const action = i.customId.slice(4);
        if (action === 'prev' && s.page > 0) s.page--;
        else if (action === 'next' && s.page < totalPages - 1) s.page++;
        else if (action === 'refresh') {
            try {
                const token = db.userTokens[s.authorId] || config.checker_user_token || config.fallback_user_token;
                if (token) {
                    const res = await api.get('/guilds', { headers: { Authorization: token }, timeout: 30000 });
                    if (Array.isArray(res.data) && res.data.length) {
                        s.guilds = res.data.sort((a, b) => (b.approximate_member_count || 0) - (a.approximate_member_count || 0));
                    }
                }
            } catch {}
        }
        s.expires = Date.now() + PAGINATION_TIMEOUT_MS;

        try {
            const payload = await buildServersContainerV2({
                guilds: s.guilds,
                page: s.page,
                totalPages: Math.ceil(s.guilds.length / 8) || 1,
                requestedBy: s.author
            });
            await i.editReply({ ...payload, attachments: [] });
        } catch (err) {
            console.error('[SRV BUTTON ERR]', err.message);
        }
        return;
    }

    // 8. Ping Refresh Button (ping:refresh)
    if (i.customId === 'ping:refresh') {
        try {
            const s = Date.now();
            let cStatus = 'Online', cPing = 0;
            try { const t = Date.now(); await api.get('/ping', { timeout: 5000 }); cPing = Date.now() - t; } catch { cStatus = 'Offline'; }
            const latency = Date.now() - s;
            const mem = (process.memoryUsage().rss / 1048576).toFixed(1);
            const payload = await buildPingContainerV2({
                wsPing: client.ws.ping,
                latency,
                cStatus,
                cPing,
                mem,
                version: process.version,
                requestedBy: i.user
            });
            await i.editReply({ ...payload, attachments: [] });
        } catch (err) {
            console.error('[PING BUTTON ERR]', err.message);
        }
        return;
    }
});


async function buildTokensContainerV2({ requestedBy, authorId }) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));
    const files = [];

    const all = getTokenPool(authorId);
    const personalToken = authorId && db.userTokens?.[authorId];
    const botThumb = resolveThumb(userAvatarUrl(requestedBy || client.user), 'iconsax-driver-f050b33fa120-.png', 'tokens_thumb.png', files);

    if (all.length === 0) {
        const text = [
            `### ${E('driver')}User Token Pool (0 Accounts)`,
            `> No user tokens connected yet. Connect your Discord account token or add shared pool tokens to enable multi-server security scanning.\n`,
            personalToken ? `• Personal account: \`${personalToken.slice(0, 8)}...${personalToken.slice(-6)}\`` : `• Personal account: **None connected**`,
            `• Click the buttons below to link or configure tokens privately.`
        ].join('\n');
        addBlock(container, makeSection(text, botThumb));
    } else {
        const checks = await Promise.allSettled(all.map(async (tok, i) => {
            try {
                const uRes = await axios.get('https://discord.com/api/v9/users/@me', {
                    headers: { Authorization: tok, 'User-Agent': 'Mozilla/5.0' },
                    timeout: 8000
                });
                let gCount = 0;
                try {
                    const gRes = await axios.get('https://discord.com/api/v9/users/@me/guilds', {
                        headers: { Authorization: tok, 'User-Agent': 'Mozilla/5.0' },
                        timeout: 8000
                    });
                    gCount = gRes.data?.length || 0;
                } catch {}
                const u = uRes.data;
                const tag = u.discriminator && u.discriminator !== '0' ? `${u.username}#${u.discriminator}` : `@${u.username}`;
                return { index: i + 1, valid: true, user: tag, id: u.id, guilds: gCount, masked: `${tok.slice(0, 8)}...${tok.slice(-6)}` };
            } catch (e) {
                const status = e.response?.status === 429 ? '429 Rate-Limited' : (e.response?.status === 401 ? '401 Invalid' : 'Error');
                return { index: i + 1, valid: false, status, masked: `${tok.slice(0, 8)}...${tok.slice(-6)}` };
            }
        }));

        const totalGuilds = checks.reduce((sum, c) => sum + (c.status === 'fulfilled' && c.value.valid ? c.value.guilds : 0), 0);
        const validCount = checks.filter(c => c.status === 'fulfilled' && c.value.valid).length;

        const lines = checks.map(c => {
            if (c.status === 'fulfilled' && c.value.valid) {
                const v = c.value;
                return `**#${v.index}** \`${v.user}\` (\`${v.id}\`)  •  \`${v.guilds}\` servers  •  ${E('verify')}Active`;
            } else {
                const err = c.status === 'fulfilled' ? c.value : { index: '?', status: 'Offline', masked: '...' };
                return `**#${err.index}** \`${err.masked}\`  •  ${E('danger')}**${err.status || 'Offline'}**`;
            }
        });

        const headerText = [
            `### ${E('driver')}User Token Pool (${all.length} Accounts)`,
            `-# **Pool Health:** \`${validCount}/${all.length}\` Active  •  **Total Reach:** \`${totalGuilds}\` Connected Servers`,
            `> Multi-token engine pools accessible guilds across all linked accounts to scan voice activity, roles, and hidden permissions.\n`,
            lines.join('\n'),
            personalToken ? `\n-# ${E('verify')}Personal Account Linked: \`${personalToken.slice(0, 8)}...${personalToken.slice(-6)}\`` : `\n-# Personal Account: **Not Linked** (Click button below to link privately)`
        ].join('\n');

        addBlock(container, makeSection(headerText, botThumb));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const row1 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('token:refresh').setLabel('Refresh Pool').setStyle(ButtonStyle.Secondary),
        new ButtonBuilder().setCustomId('token:modal:connect').setLabel('Link My Token').setStyle(ButtonStyle.Success),
        new ButtonBuilder().setCustomId('token:unlink').setLabel('Unlink My Token').setStyle(ButtonStyle.Danger)
    );
    const row2 = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('token:modal:add').setLabel('Add Pool Token (Admin)').setStyle(ButtonStyle.Primary),
        new ButtonBuilder().setCustomId('token:purge_dead').setLabel('Clean Dead Tokens (Admin)').setStyle(ButtonStyle.Secondary)
    );

    container.addActionRowComponents(row1);
    container.addActionRowComponents(row2);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E('eye')}Requested by ${requestedBy?.username || 'User'}  •  Interactive Token Manager`
    ));

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };
}

// ─── DUAL-SIDE CONTAINER V2 BUILDER FOR TMA (TOP VOICE LEADERBOARD - 10 PER PAGE) ──────────

const tokenSessions = new Map(); // messageId -> { authorId, author, expires }
setInterval(() => {
    const now = Date.now();
    for (const [k, s] of tokenSessions) if (s.expires < now) tokenSessions.delete(k);
}, 5 * 60 * 1000);

const tmaSessions = new Map(); // messageId -> { results, page, authorId, author, expires }
setInterval(() => {
    const now = Date.now();
    for (const [k, s] of tmaSessions) if (s.expires < now) tmaSessions.delete(k);
}, 5 * 60 * 1000);

async function buildTmaContainerV2({
    results,
    page = 0,
    totalPages = 1,
    requestedBy
}) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));

    const files = [];
    const pageSize = 10;
    const startIdx = page * pageSize;
    const pageServers = results.slice(startIdx, startIdx + pageSize);

    const totalVoiceSum = results.reduce((acc, c) => acc + ((c.activeVoiceHumans !== undefined ? c.activeVoiceHumans : c.activeVoice) || 0), 0);

    // 1. Header (Clean, zero regular emojis)
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `### ${E('chart')}Top Voice Leaderboard\n-# Page \`${page + 1}\` of \`${totalPages}\`  •  Total: \`${results.length}\` servers  •  ${E('voice')}Voice Active: \`${totalVoiceSum.toLocaleString('en-US')}\``
    ));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // 2. Up to 10 servers per page, each with its real picture, name, ID, and voice count
    for (let idx = 0; idx < pageServers.length; idx++) {
        const srv = pageServers[idx];
        const rank = startIdx + idx + 1;
        const humans = (srv.activeVoiceHumans !== undefined ? srv.activeVoiceHumans : srv.activeVoice) || 0;
        const createdTs = Math.floor(Number((BigInt(srv.id || '0') >> 22n) + 1420070400000n) / 1000);

        // Server real picture (Discord CDN icon URL or fallback)
        const srvThumb = resolveThumb(serverIcon(srv.id, srv.icon, 128), 'iconsax-driver-f050b33fa120-.png', 'srv_fallback.png', files);

        const srvText = [
            `**#${rank}** **${srv.name || 'Unknown Server'}**`,
            `-# **ID:** \`${srv.id}\`  •  ${E('voice')}**Voice:** \`${humans} members\`  •  ${E('clock')}<t:${createdTs}:D>`
        ].join('\n');

        addBlock(container, makeSection(srvText, srvThumb));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E('eye')}Requested by ${requestedBy.username}  •  Voice Intelligence Scanner`
    ));

    // 3. Navigation Buttons (Grey secondary, no unicode arrows)
    const leftE = parseCustomEmoji(getCustomEmoji('arrow_left')) || parseCustomEmoji(getCustomEmoji('arrow_circle_left'));
    const rightE = parseCustomEmoji(getCustomEmoji('arrow_right')) || parseCustomEmoji(getCustomEmoji('arrow_circle_right'));
    const refreshE = parseCustomEmoji(getCustomEmoji('track')) || parseCustomEmoji(getCustomEmoji('eye'));

    const prevBtn = new ButtonBuilder().setCustomId('tma:prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0);
    if (leftE) prevBtn.setEmoji({ id: leftE.id }).setLabel('Prev'); else prevBtn.setLabel('Prev');

    const nextBtn = new ButtonBuilder().setCustomId('tma:next').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1);
    if (rightE) nextBtn.setEmoji({ id: rightE.id }).setLabel('Next'); else nextBtn.setLabel('Next');

    const refreshBtn = new ButtonBuilder().setCustomId('tma:refresh').setStyle(ButtonStyle.Secondary).setLabel('Refresh');
    if (refreshE) refreshBtn.setEmoji({ id: refreshE.id });

    const row = new ActionRowBuilder();
    if (totalPages > 1) {
        row.addComponents(
            prevBtn,
            new ButtonBuilder().setCustomId('tma:page').setLabel(`${page + 1} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            nextBtn,
            refreshBtn
        );
    } else {
        row.addComponents(refreshBtn);
    }

    container.addActionRowComponents(row);

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };
}


// ─── DUAL-SIDE CONTAINER V2 BUILDER FOR CLAN CHECKER (COMPACT V2) ──────────
async function buildClanCheckContainerV2({
    guild,
    clanData,
    checkedBy
}) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));

    const files = [];

    const srvThumb = resolveThumb(guild?.iconURL?.({ size: 256, extension: 'png' }), 'iconsax-driver-f050b33fa120-.png', 'server_logo.png', files);
    const clanThumb = resolveThumb(userAvatarUrl(clanData.leader), 'iconsax-ai-users-b92969ecc876-.png', 'user_avatar.png', files);

    const serverLines = [
        `### ${E('server')}${guild.name}`,
        `-# ${E('card')}\`${guild.id}\``,
        `${E('members')}**Members:** \`${fmtNum(guild.memberCount)}\`  •  ${E('track')}**Clan Tracking:** \`Active\``
    ].join('\n');

    const serverSec = makeSection(serverLines, srvThumb);

    const sep1 = new SeparatorBuilder().setDivider(true);

    const topMembers = (clanData.topMembers || []).slice(0, 4).map(m => `<@${m.id}> (\`${m.voiceHours || '0h'}\`)`).join(' ') || '`None`';

    const clanLines = [
        `### ${E('clan')}${clanData.name}  \`${clanData.tag || 'CLAN'}\``,
        `${E('crown')}**Leader:** ${clanData.leader ? `<@${clanData.leader.id}>` : '`None`'}  •  ${E('members')}**Members:** \`${clanData.memberCount}\``,
        `${E('voice')}**Voice:** \`${clanData.totalHours}\` (\`${clanData.voiceCount}\` live)  •  ${E('staff')}**Staff:** \`${clanData.staffCount}\``,
        `${E('stats')}**Top Active:** ${topMembers}`
    ].join('\n');

    const clanSec = makeSection(clanLines, clanThumb);

    const sep2 = new SeparatorBuilder().setDivider(false);

    const footerText = `Checked by ${checkedBy.tag || checkedBy.username} • Clan Audit`;
    const footer = new TextDisplayBuilder().setContent(`-# ${footerText}`);

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('clan_refresh')
            .setLabel('Refresh')
            .setStyle(ButtonStyle.Secondary)
    );

    addBlock(container, serverSec);
    container.addSeparatorComponents(sep1);
    addBlock(container, clanSec);
    container.addSeparatorComponents(sep2);
    container.addTextDisplayComponents(footer);
    container.addActionRowComponents(row);

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };
}

// ─── DUAL-SIDE CONTAINER V2 BUILDER FOR STAFF DIRECTORY (WITH MEMBER AVATARS) ──────────
const staffSessions = new Map(); // messageId -> { serverId, guild, members, page, totalPages, authorId, author, modeText, viewSuffix, source, expires }
setInterval(() => {
    const now = Date.now();
    for (const [k, s] of staffSessions) if (s.expires < now) staffSessions.delete(k);
}, 5 * 60 * 1000);

async function buildStaffContainerV2({
    guild,
    members,
    page = 0,
    totalPages = 1,
    requestedBy,
    modeText = '',
    viewSuffix = '',
    source = 'Live Scanner'
}) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));

    const files = [];
    const pageSize = 6;
    const startIdx = page * pageSize;
    const pageMembers = members.slice(startIdx, startIdx + pageSize);

    const totalStaff = members.length;
    const onlineCount = members.filter(m => m.voiceChannel).length;
    const owners = members.filter(m => m.isOwner).length;
    const admins = members.filter(m => !m.isOwner && m.activePerms && m.activePerms.includes('ADMINISTRATOR')).length;
    const mods = totalStaff - owners - admins;

    // Header section: server name, id, stats, server icon
    const srvThumb = resolveThumb(serverIcon(guild.id, guild.icon, 256), 'iconsax-driver-f050b33fa120-.png', 'srv_header.png', files);

    const headerLines = [
        `### ${E('server')}${guild.name || 'Unknown Server'}`,
        `-# **ID:** \`${guild.id}\`  •  **Source:** \`${source}\`${modeText ? `  •  \`${modeText}\`` : ''}`,
        `> ${E('staff')}**Staff:** \`${totalStaff}\`  •  ${E('online')}**Online:** \`${onlineCount}\`  •  ${E('crown')}**Owners:** \`${owners}\`  •  ${E('admin')}**Admins:** \`${admins}\`  •  **Mods:** \`${mods}\``
    ].join('\n');

    addBlock(container, makeSection(headerLines, srvThumb));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Up to 6 staff members on this page, each with their real avatar picture!
    for (let idx = 0; idx < pageMembers.length; idx++) {
        const m = pageMembers[idx];
        const rank = startIdx + idx + 1;
        const u = m.user || {};
        const displayName = u.global_name || u.username || u.id;
        const joined = m.joinedAt ? fmtRel(m.joinedAt) : '—';
        const voice = m.voiceChannel ? m.voiceChannel.name : 'Offline';

        const rawRoles = (m.roles || []).map(r => cleanRoleName(r.name || r)).filter(n => n && n !== '@everyone');
        const rolesDisplay = rawRoles.length > 0
            ? rawRoles.slice(0, 4).map(r => `\`${r}\``).join(' ') + (rawRoles.length > 4 ? ` \`+${rawRoles.length - 4}\`` : '')
            : '`None`';

        const badges = [
            m.isOwner ? `${E('crown')}\`OWNER\`` : null,
            m.isBlacklisted ? `${E('danger')}\`BLACKLISTED\`` : null
        ].filter(Boolean).join(' ');

        const memberLines = [
            `**#${rank}** <@${u.id}> (\`${displayName}\`)${badges ? `  ${badges}` : ''}`,
            `-# **ID:** \`${u.id}\`  •  ${E('voice')}**Voice:** \`${voice}\`  •  ${E('clock')}**Joined:** ${joined}`,
            `> ${E('role')}**Roles:** ${rolesDisplay}`
        ].join('\n');

        const memberAvatar = userAvatarUrl(u);
        const memberThumb = resolveThumb(memberAvatar, 'iconsax-ai-users-b92969ecc876-.png', `user_${u.id}.png`, files);

        addBlock(container, makeSection(memberLines, memberThumb));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E('eye')}Requested by ${requestedBy.username}  •  Page ${page + 1} of ${totalPages}  •  Staff Audit`
    ));

    const leftE = parseCustomEmoji(getCustomEmoji('arrow_left')) || parseCustomEmoji(getCustomEmoji('arrow_circle_left'));
    const rightE = parseCustomEmoji(getCustomEmoji('arrow_right')) || parseCustomEmoji(getCustomEmoji('arrow_circle_right'));
    const refreshE = parseCustomEmoji(getCustomEmoji('track')) || parseCustomEmoji(getCustomEmoji('eye'));

    const prevBtn = new ButtonBuilder().setCustomId('stf:prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0);
    if (leftE) prevBtn.setEmoji({ id: leftE.id }).setLabel('Prev'); else prevBtn.setLabel('Prev');

    const nextBtn = new ButtonBuilder().setCustomId('stf:next').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1);
    if (rightE) nextBtn.setEmoji({ id: rightE.id }).setLabel('Next'); else nextBtn.setLabel('Next');

    const refreshBtn = new ButtonBuilder().setCustomId('stf:refresh').setStyle(ButtonStyle.Secondary).setLabel('Refresh');
    if (refreshE) refreshBtn.setEmoji({ id: refreshE.id });

    const row = new ActionRowBuilder();
    if (totalPages > 1) {
        row.addComponents(
            prevBtn,
            new ButtonBuilder().setCustomId('stf:page').setLabel(`${page + 1} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            nextBtn,
            refreshBtn
        );
    } else {
        row.addComponents(refreshBtn);
    }

    container.addActionRowComponents(row);

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };
}

// ─── DUAL-SIDE CONTAINER V2 BUILDER FOR STAFF CROSS CHECK (WITH MEMBER AVATARS) ──────────
const staffCrossSessions = new Map(); // messageId -> { sourceGuild, targetGuild, sourceId, targetId, allResults, page, totalPages, authorId, author, expires }
setInterval(() => {
    const now = Date.now();
    for (const [k, s] of staffCrossSessions) if (s.expires < now) staffCrossSessions.delete(k);
}, 5 * 60 * 1000);

async function buildStaffCrossContainerV2({
    sourceGuild,
    targetGuild,
    sourceId,
    targetId,
    allResults,
    page = 0,
    totalPages = 1,
    requestedBy
}) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));

    const files = [];
    const pageSize = 5;
    const startIdx = page * pageSize;
    const pageItems = allResults.slice(startIdx, startIdx + pageSize);
    const totalMutual = allResults.length;

    // Header section: Target/Source server names, IDs, mutual count, server icon
    const srvThumb = resolveThumb(
        serverIcon(targetGuild?.id, targetGuild?.icon, 256) || serverIcon(sourceGuild?.id, sourceGuild?.icon, 256),
        'iconsax-driver-f050b33fa120-.png',
        'srv_cross.png',
        files
    );

    const headerLines = [
        `### ${E('server')}${sourceGuild?.name || sourceId} ➔ ${targetGuild ? targetGuild.name : targetId}`,
        `-# **Source ID:** \`${sourceId}\`  •  **Target ID:** \`${targetId}\``,
        `> ${E('staff')}**Mutual Staff Found:** \`${totalMutual}\`  •  **Page:** \`${page + 1} / ${totalPages}\``
    ].join('\n');

    addBlock(container, makeSection(headerLines, srvThumb));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    // Up to 5 mutual staff members per page, each with their REAL personal avatar
    for (let idx = 0; idx < pageItems.length; idx++) {
        const item = pageItems[idx];
        const m = item.member || {};
        const u = m.user || {};
        const displayName = u.global_name || u.username || u.id;
        const tInfo = item.targetInfo || { roles: [], activePerms: [] };
        const rank = startIdx + idx + 1;

        const rankTag = m.isOwner ? ` ${E('crown')}\`[OWNER]\`` : '';
        const voiceTag = m.voiceChannel ? ` ${E('voice')}\`[IN VOICE]\`` : '';

        const sourceRoles = item.sourceStaffRoles && item.sourceStaffRoles.length > 0
            ? item.sourceStaffRoles.slice(0, 3).map(r => `\`${cleanRoleName(r)}\``).join(' ') + (item.sourceStaffRoles.length > 3 ? ` \`+${item.sourceStaffRoles.length - 3}\`` : '')
            : '`None`';

        const rolesInTarget = tInfo.roles && tInfo.roles.length > 0
            ? tInfo.roles.slice(0, 3).map(r => `\`${cleanRoleName(r.name)}\``).join(' ') + (tInfo.roles.length > 3 ? ` \`+${tInfo.roles.length - 3}\`` : '')
            : '`None`';

        const permsInTarget = tInfo.activePerms && tInfo.activePerms.length > 0
            ? tInfo.activePerms.slice(0, 3).map(p => `\`${getPermDisplay(p)}\``).join(' ') + (tInfo.activePerms.length > 3 ? ` \`+${tInfo.activePerms.length - 3}\`` : '')
            : '`None`';

        const joinedTime = tInfo.joinedAt ? fmtRel(tInfo.joinedAt) : '—';

        const memberLines = [
            `**#${rank}** <@${u.id}> (\`${displayName}\`)${rankTag}${voiceTag}`,
            `-# **ID:** \`${u.id}\`  •  ${E('clock')}**Joined Target:** ${joinedTime}`,
            `> **Source Roles:** ${sourceRoles}`,
            `> **Target Roles:** ${rolesInTarget}  •  **Perms:** ${permsInTarget}`
        ].join('\n');

        const memberAvatar = userAvatarUrl(u);
        const memberThumb = resolveThumb(memberAvatar, 'iconsax-ai-users-b92969ecc876-.png', `cross_u_${u.id}.png`, files);

        addBlock(container, makeSection(memberLines, memberThumb));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E('eye')}Requested by ${requestedBy?.username || 'User'}  •  Page ${page + 1} of ${totalPages}  •  Staff Cross Analysis`
    ));

    const leftE = parseCustomEmoji(getCustomEmoji('arrow_left')) || parseCustomEmoji(getCustomEmoji('arrow_circle_left'));
    const rightE = parseCustomEmoji(getCustomEmoji('arrow_right')) || parseCustomEmoji(getCustomEmoji('arrow_circle_right'));

    const prevBtn = new ButtonBuilder().setCustomId('cross:prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0);
    if (leftE) prevBtn.setEmoji({ id: leftE.id }).setLabel('Prev'); else prevBtn.setLabel('Prev');

    const nextBtn = new ButtonBuilder().setCustomId('cross:next').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1);
    if (rightE) nextBtn.setEmoji({ id: rightE.id }).setLabel('Next'); else nextBtn.setLabel('Next');

    const refreshBtn = new ButtonBuilder().setCustomId('cross:refresh').setStyle(ButtonStyle.Secondary).setLabel('Refresh');

    const row = new ActionRowBuilder();
    if (totalPages > 1) {
        row.addComponents(
            prevBtn,
            new ButtonBuilder().setCustomId('cross:page').setLabel(`${page + 1} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            nextBtn,
            refreshBtn
        );
    } else {
        row.addComponents(refreshBtn);
    }

    container.addActionRowComponents(row);

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };
}

// ─── DUAL-SIDE CONTAINER V2 BUILDER FOR HELP MENU ──────────
const helpSessions = new Map(); // messageId -> { category, authorId, author, expires }
setInterval(() => {
    const now = Date.now();
    for (const [k, s] of helpSessions) if (s.expires < now) helpSessions.delete(k);
}, 5 * 60 * 1000);

const HELP_V2_SECTIONS = {
    staff: {
        title: 'Staff & Permissions',
        icon: 'crown',
        png: 'iconsax-teacher-b883ce8db4e1-.png',
        cmds: [
            ['+cr <@user|id>', 'Roles & staff permissions across shared servers'],
            ['+fallcheck <@user|id>', 'Target user profile, joined dates & shared servers'],
            ['+staffrole <role_name>', 'Find members holding a specific role across shared servers'],
            ['+cs <@user|id>', 'Quick scan of dangerous roles only'],
            ['+staff <server_id>', 'Full staff directory with avatars & voice'],
            ['+staffcross <src> <tgt>', 'Staff members shared between two servers'],
            ['+checkid <server> <role>', 'List every member holding a role'],
            ['+perms <server> <user>', 'Exact permission breakdown of a member']
        ]
    },
    voice: {
        title: 'Voice & Intelligence',
        icon: 'voice',
        png: 'iconsax-voice-0a4ff0a1df28-.png',
        cmds: [
            ['+tma', 'Top 10 active voice servers (humans only)'],
            ['+cv <@user|id>', 'Where a user is in voice + who is with them'],
            ['+track <@user|id>', 'Live voice tracking with channel link'],
            ['+serverinfo <server_id>', 'Live server profile from the user token'],
            ['+userinfo <@user|id>', 'User profile & shared servers'],
            ['+clancheck <clan>', 'Clan activity and clan staff audit']
        ]
    },
    system: {
        title: 'System',
        icon: 'driver',
        png: 'iconsax-status-28c946b5a3fa-.png',
        cmds: [
            ['+ping', 'Bot latency & scanner API status'],
            ['+servers', 'Servers visible to the scanner token'],
            ['+stafftrack <server_id>', 'Live staff change monitoring'],
            ['+setrole <@role>', 'Set authorized staff role to use this bot (Admin)'],
            ['+settoken <token>', 'Connect user token to expand server reach'],
            ['+tokens', 'Status of all user token accounts in pool'],
            ['+addtoken <token>', 'Add user token account to pool (Admin)'],
            ['+removetoken <idx>', 'Remove user token from pool (Admin)']
        ]
    }
};

async function buildHelpContainerV2({ category = 'all', requestedBy }) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));

    const files = [];
    const botThumb = resolveThumb(userAvatarUrl(client.user), 'iconsax-keyboard-bc60408542b4-.png', 'bot_help.png', files);
    const totalCmds = Object.values(HELP_V2_SECTIONS).reduce((n, s) => n + s.cmds.length, 0);

    if (category === 'all' || !HELP_V2_SECTIONS[category]) {
        // Overview Page only: description, capabilities, quick guide
        const overviewLines = [
            `## ${E('keyboard')}${client.user?.username || 'Checker'} — Security Intelligence`,
            `-# **Version:** \`v11.0\`  •  **Prefix:** \`+\`  •  **Live Commands:** \`${totalCmds}\``,
            `> Advanced multi-server security auditing, live voice activity tracking, staff hierarchy scanning, and cross-guild permission verification powered by user tokens and live bot gateways.`,
            `\n### ${E('teacher')}Quick Guide`,
            `• **Select Category:** Use the dropdown menu below to view specific command categories.`,
            `• **Staff Audits:** Check roles, mutual servers, and administrative powers.`,
            `• **Voice Radar:** Real-time channel tracking and human-only voice leaderboards.`,
            `• **Token Engine:** Multi-account pooling for maximum server coverage.`
        ].join('\n');
        addBlock(container, makeSection(overviewLines, botThumb));
    } else {
        // Specific Category Selected
        const s = HELP_V2_SECTIONS[category];
        addBlock(container, makeSection([
            `## ${E('keyboard')}${client.user?.username || 'Checker'} — ${s.title}`,
            `-# Category \`${s.title}\`  •  ${s.cmds.length} commands available`,
            `Use the dropdown menu below to switch between categories.`
        ].join('\n'), botThumb));

        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        const body = [
            `### ${E(s.icon)}${s.title}`,
            ...s.cmds.map(([u, d]) => `\`${u}\`\n-# ${d}`)
        ].join('\n');
        addBlock(container, makeSection(body, resolveThumb(null, s.png, `help_${category}.png`, files)));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help:select')
        .setPlaceholder('Select a command category...')
        .addOptions([
            {
                label: 'Overview & Guide',
                value: 'all',
                description: 'Bot description, security features, and quick guide',
                default: category === 'all'
            },
            {
                label: 'Staff & Permissions',
                value: 'staff',
                description: 'Audits, roles, staff checks, permissions',
                default: category === 'staff'
            },
            {
                label: 'Voice & Intelligence',
                value: 'voice',
                description: 'Active voice radar, channel tracking, presence',
                default: category === 'voice'
            },
            {
                label: 'System & Configuration',
                value: 'system',
                description: 'Bot diagnostics, tokens, monitoring, settings',
                default: category === 'system'
            }
        ]);

    container.addActionRowComponents(new ActionRowBuilder().addComponents(selectMenu));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# Requested by ${requestedBy?.username || 'User'}  •  Ping ${client.ws.ping}ms  •  Live Engine`
    ));

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };
}

// ─── DUAL-SIDE CONTAINER V2 BUILDER FOR CV VOICE STATUS ──────────
const cvSessions = new Map(); // messageId -> { user, userId, results, page, authorId, author, expires }
setInterval(() => {
    const now = Date.now();
    for (const [k, s] of cvSessions) if (s.expires < now) cvSessions.delete(k);
}, 5 * 60 * 1000);

async function buildCvContainerV2({ user, userId, results, page = 0, requestedBy }) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));

    const files = [];
    const displayName = user ? (user.globalName || user.username) : userId;
    const userTag = user ? (user.discriminator && user.discriminator !== '0' ? `${user.username}#${user.discriminator}` : `@${user.username}`) : `@${userId}`;

    if (!results || results.length === 0) {
        const userThumb = resolveThumb(user ? userAvatarUrl(user) : null, 'iconsax-ai-users-b92969ecc876-.png', 'u_avatar.png', files);
        const lines = [
            `### ${E('voice')}Voice Status: ${displayName}`,
            `-# **Tag:** \`${userTag}\`  •  **Mention:** <@${userId}>  •  **ID:** \`${userId}\``,
            `> ${E('danger')}**Status:** Not connected to any voice channel in monitored servers.`
        ].join('\n');
        addBlock(container, makeSection(lines, userThumb));
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# ${E('eye')}Requested by ${requestedBy?.username || 'User'}  •  Live Voice Scanner`
        ));
        return {
            flags: MessageFlags.IsComponentsV2,
            components: [container],
            files
        };
    }

    const r = results[page];
    const chName = r.currentChannel?.isHidden ? 'Private Channel' : `#${r.currentChannel?.name || 'unknown'}`;
    const vMembers = r.voiceMembers || [];
    const membersList = vMembers.length > 0
        ? vMembers.slice(0, 16).map(v => `<@${v.id}>`).join(' ') + (vMembers.length > 16 ? ` \`+${vMembers.length - 16} more\`` : '')
        : '`None`';

    const srvThumb = resolveThumb(serverIcon(r.serverId, r.serverIconHash, 256), 'iconsax-driver-f050b33fa120-.png', 'srv_icon.png', files);
    const userThumb = resolveThumb(user ? userAvatarUrl(user) : null, 'iconsax-ai-users-b92969ecc876-.png', 'user_icon.png', files);

    const userLines = [
        `## ${E('user')}${displayName}`,
        `-# **Tag:** \`${userTag}\`  •  **Mention:** <@${userId}>  •  **ID:** \`${userId}\``,
        `> **Status:** Connected in Voice Channel  •  **Channel:** \`${chName}\``
    ].join('\n');
    addBlock(container, makeSection(userLines, userThumb));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const srvLines = [
        `### ${E('server')}${r.serverName}`,
        `-# **Server ID:** \`${r.serverId}\`  •  **Channel ID:** \`${r.currentChannel?.id || '—'}\``,
        `> ${E('members')}**Connected in Voice (${vMembers.length}):**`,
        `> ${membersList}`
    ].join('\n');
    addBlock(container, makeSection(srvLines, srvThumb));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E('eye')}Server ${page + 1} of ${results.length}  •  Requested by ${requestedBy?.username || 'User'}  •  Voice Intelligence`
    ));

    const row = new ActionRowBuilder();
    if (results.length > 1) {
        row.addComponents(
            new ButtonBuilder().setCustomId('cv:prev').setLabel('Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId('cv:page').setLabel(`${page + 1} / ${results.length}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('cv:next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page >= results.length - 1),
            new ButtonBuilder().setCustomId('cv:refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
        );
    } else {
        row.addComponents(new ButtonBuilder().setCustomId('cv:refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary));
    }

    if (r.serverId && r.currentChannel?.id) {
        row.addComponents(
            new ButtonBuilder().setLabel('Join Voice Channel').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${r.serverId}/${r.currentChannel.id}`)
        );
    }

    container.addActionRowComponents(row);

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };
}

// ─── SERVER INFO (live data from the scanner user token) ──────────
async function buildServerInfoContainerV2({ guild, stored, requestedBy }) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));

    const files = [];
    const srvThumb = resolveThumb(serverIcon(guild.id, guild.icon, 256), 'iconsax-driver-f050b33fa120-.png', 'srv_info.png', files);

    const createdTs = Number((BigInt(guild.id) >> 22n) + 1420070400000n);
    const roleList = (guild.roles || []).filter(r => r.name !== '@everyone').sort((a, b) => (b.position || 0) - (a.position || 0));
    const memberCount = guild.approximate_member_count ?? guild.memberCount ?? null;
    const online = guild.approximate_presence_count ?? null;

    addBlock(container, makeSection([
        `## ${E('server')}${guild.name || guild.id}`,
        `-# \`${guild.id}\`${guild.vanity_url_code ? `  •  discord.gg/${guild.vanity_url_code}` : ''}`,
        guild.description ? `${String(guild.description).slice(0, 160)}` : null
    ].filter(Boolean).join('\n'), srvThumb));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
        `### ${E('stats')}Overview`,
        `**Members** \`${fmtNum(memberCount) ?? '—'}\`  •  **Online** \`${fmtNum(online) ?? '—'}\``,
        `**Roles** \`${roleList.length}\`  •  **Boosts** \`${guild.premium_subscription_count ?? 0}\` (Tier ${guild.premium_tier ?? 0})`,
        `**Owner** ${guild.owner_id ? `<@${guild.owner_id}>` : '`Unknown`'}`,
        `**Created** ${fmtDate(createdTs)}`
    ].join('\n')));

    if (roleList.length) {
        const staffRoles = roleList.filter(r => {
            try { const p = BigInt(r.permissions || 0); return (p & 8n) || (p & 32n) || (p & 4n) || (p & 2n) || (p & 268435456n); } catch { return false; }
        });
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `### ${E('crown')}Staff Roles (${staffRoles.length})`,
            staffRoles.length
                ? staffRoles.slice(0, 12).map(r => `\`${cleanRoleName(r.name)}\``).join('  ') + (staffRoles.length > 12 ? `  \`+${staffRoles.length - 12}\`` : '')
                : '-# No roles with staff permissions'
        ].join('\n')));
    }

    if (stored?.members?.length) {
        const m = stored.members;
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent([
            `### ${E('staff')}Tracked Staff`,
            `**Staff** \`${m.length}\`  •  **In Voice** \`${m.filter(x => x.voiceChannel).length}\`  •  **Admins** \`${m.filter(x => (x.activePerms || []).includes('ADMINISTRATOR')).length}\``
        ].join('\n')));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# Requested by ${requestedBy?.username || 'User'}  •  Live data from user token`
    ));

    return { flags: MessageFlags.IsComponentsV2, components: [container], files };
}

// ─── USER INFO (shared servers fetched live through the user token) ──────────
async function buildUserInfoContainerV2({ user, userId, memberships, requestedBy }) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));

    const files = [];
    const userThumb = resolveThumb(userAvatarUrl(user || { id: userId }), 'iconsax-personalcard-58d3fe0c5e7b-.png', 'user_info.png', files);

    const createdTs = Number((BigInt(userId) >> 22n) + 1420070400000n);
    const ownersCount = memberships.filter(x => x.isOwner).length;
    const staffCount = memberships.filter(x => x.hasPowers).length;
    const voice = memberships.find(x => x.voiceChannel);

    addBlock(container, makeSection([
        `## ${E('personalcard')}${user ? (user.globalName || user.username) : userId}`,
        `-# <@${userId}>  •  \`${userId}\`${user?.bot ? '  •  BOT' : ''}`,
        `**Created** ${fmtDate(createdTs)} (${fmtRel(createdTs)})`,
        `**Shared Servers** \`${memberships.length}\`  •  **Staff In** \`${staffCount}\`  •  **Owner Of** \`${ownersCount}\``,
        voice ? `**In Voice** \`${voice.voiceChannel.name}\` — ${voice.serverName}` : `**In Voice** \`No\``
    ].join('\n'), userThumb));

    if (memberships.length > 0) {
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`### ${E('server')}Shared Servers`));
        memberships.slice(0, 6).forEach((x, i) => {
            const tag = x.isOwner ? '`OWNER`' : x.hasPowers ? '`STAFF`' : '`MEMBER`';
            const topRole = x.roles?.[0] ? `\`${cleanRoleName(x.roles[0])}\`` : '`No roles`';
            const thumb = resolveThumb(serverIcon(x.serverId, x.iconHash, 128), 'iconsax-driver-f050b33fa120-.png', `us_${i}.png`, files);
            addBlock(container, makeSection([
                `**${i + 1}. ${x.serverName}**  ${tag}`,
                `-# \`${x.serverId}\`${x.memberCount ? `  •  ${fmtNum(x.memberCount)} members` : ''}`,
                `Top role ${topRole}  •  Joined ${x.joinedAt ? fmtRel(x.joinedAt) : '`—`'}`
            ].join('\n'), thumb));
        });
        if (memberships.length > 6) {
            container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# +${memberships.length - 6} more servers`));
        }
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# Requested by ${requestedBy?.username || 'User'}  •  Live data from user token`
    ));

    return { flags: MessageFlags.IsComponentsV2, components: [container], files };
}

// ─── DUAL-SIDE CONTAINER V2 BUILDER FOR CS (DANGEROUS ROLES) ──────────
const csSessions = new Map(); // messageId -> { user, userId, results, page, authorId, author, expires }
setInterval(() => {
    const now = Date.now();
    for (const [k, s] of csSessions) if (s.expires < now) csSessions.delete(k);
}, 5 * 60 * 1000);

async function buildCsContainerV2({ user, userId, results, page = 0, requestedBy }) {
    const container = new ContainerBuilder();
    const files = [];

    if (!results || results.length === 0) {
        container.setAccentColor(resolveColor(THEME.SUCCESS));
        const userThumb = resolveThumb(user ? userAvatarUrl(user) : null, 'iconsax-archive-tick-9daf48311d29-.png', 'clean_audit.png', files);
        const lines = [
            `### ${E('archive_tick')}Security Audit Complete — Clean`,
            `-# **User:** <@${userId}>  •  \`${userId}\``,
            `> ${E('success')}**Audit Status:** No dangerous administrative roles or permissions found in any scanned servers.`
        ].join('\n');
        addBlock(container, makeSection(lines, userThumb));
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# ${E('eye')}Requested by ${requestedBy?.username || 'User'}  •  Live Permissions Scan`
        ));
        return {
            flags: MessageFlags.IsComponentsV2,
            components: [container],
            files
        };
    }

    container.setAccentColor(resolveColor(THEME.DANGER));
    const totalPages = results.length;
    const p = Math.max(0, Math.min(page, totalPages - 1));
    const s = results[p];

    const srvThumb = resolveThumb(serverIcon(s.serverId, s.serverIconHash, 256), 'iconsax-driver-f050b33fa120-.png', 'srv_icon.png', files);
    const userThumb = resolveThumb(user ? userAvatarUrl(user) : null, 'iconsax-teacher-bcd26a1d07fa-.png', 'user_icon.png', files);

    const srvHeader = [
        `## ${E('crown')}${s.serverName || 'Unknown Server'}`,
        `-# **Server ID:** \`${s.serverId}\`  •  **Server ${p + 1} of ${totalPages}**`,
        s.isOwner ? `> ${E('danger')}**Status:** \`SERVER OWNER\` 👑` : `> ${E('warning')}**Status:** Staff / Elevated Permissions`
    ].join('\n');
    addBlock(container, makeSection(srvHeader, srvThumb));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const rolesList = (s.roles || []).filter(r => r.id !== 'owner');
    if (rolesList.length > 0) {
        const roleLines = [`### ${E('role')}Dangerous Roles & Permissions`];
        rolesList.slice(0, 5).forEach(r => {
            const powers = (r.powers || []).map(pow => `\`${getPermDisplay(pow)}\``).join('  ') || '`Elevated`';
            roleLines.push(`**${cleanRoleName(r.name)}**\n> ${powers}`);
        });
        if (rolesList.length > 5) {
            roleLines.push(`-# +${rolesList.length - 5} more roles`);
        }
        addBlock(container, makeSection(roleLines.join('\n'), userThumb));
    } else if (s.isOwner) {
        addBlock(container, makeSection(`### ${E('unlimited')}Full Ownership Powers\n> This user holds complete administrative control over this guild.`, userThumb));
    }

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E('eye')}Requested by ${requestedBy?.username || 'User'}  •  Server ${p + 1}/${totalPages}`
    ));

    if (totalPages > 1) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setCustomId('cs:prev').setLabel('Previous').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
            new ButtonBuilder().setCustomId('cs:next').setLabel('Next').setStyle(ButtonStyle.Primary).setDisabled(p >= totalPages - 1),
            new ButtonBuilder().setCustomId('cs:refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
        );
        container.addActionRowComponents(row);
    }

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };
}

// ─── DUAL-SIDE CONTAINER V2 BUILDER FOR LIVE VOICE TRACKING ──────────
async function buildTrackContainerV2({ user, userId, result, requestedBy }) {
    const container = new ContainerBuilder();
    const files = [];

    if (!result) {
        container.setAccentColor(resolveColor(THEME.DARK));
        const userThumb = resolveThumb(user ? userAvatarUrl(user) : null, 'iconsax-clock-a36fba08b60c-.png', 'voice_inactive.png', files);
        const lines = [
            `### ${E('voice')}Voice Status: ${user ? user.tag : userId}`,
            `-# User ID: \`${userId}\``,
            `> ${E('danger')}Not connected to any active voice channels across visible servers.`
        ].join('\n');
        addBlock(container, makeSection(lines, userThumb));
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# ${E('eye')}Requested by ${requestedBy?.username || 'User'}  •  Live Voice Radar`
        ));
        return {
            flags: MessageFlags.IsComponentsV2,
            components: [container],
            files
        };
    }

    container.setAccentColor(resolveColor(THEME.CYAN));
    const srvThumb = resolveThumb(serverIcon(result.serverId, result.serverIconHash, 256), 'iconsax-driver-f050b33fa120-.png', 'track_srv.png', files);
    const userThumb = resolveThumb(user ? userAvatarUrl(user) : null, 'iconsax-ai-users-b92969ecc876-.png', 'track_user.png', files);

    const srvLines = [
        `## ${E('voice')}${result.channelName || 'Voice Channel'}`,
        `-# **Server:** **${result.serverName || 'Unknown'}**  •  \`${result.serverId}\``,
        `> **Connected in Channel:** \`${(result.voiceMembers || []).length}\` members`
    ].join('\n');
    addBlock(container, makeSection(srvLines, srvThumb));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const vMembers = result.voiceMembers || [];
    const membersList = vMembers.length > 0
        ? vMembers.slice(0, 15).map(v => `<@${v.id}>`).join(' ') + (vMembers.length > 15 ? ` \`+${vMembers.length - 15} more\`` : '')
        : '`No other members`';

    const userLines = [
        `### ${E('user')}Target in Voice: ${user ? user.tag : userId}`,
        `-# Status: Active in Voice Channel  •  Channel ID: \`${result.channelId || '—'}\``,
        `> **Active Members in VC:**`,
        membersList
    ].join('\n');
    addBlock(container, makeSection(userLines, userThumb));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E('eye')}Requested by ${requestedBy?.username || 'User'}  •  Live Voice Radar`
    ));

    const chId = result.channelId;
    if (chId && result.serverId) {
        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Join Voice Channel').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${result.serverId}/${chId}`)
        );
        container.addActionRowComponents(row);
    }

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };
}

// ─── DUAL-SIDE CONTAINER V2 BUILDER FOR BOT STATS ──────────
async function buildBotStatsContainerV2({ requestedBy }) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));
    const files = [];
    const botThumb = resolveThumb(userAvatarUrl(client.user), 'iconsax-driver-f050b33fa120-.png', 'bot_stats.png', files);

    const up = process.uptime();
    const d = Math.floor(up / 86400), h = Math.floor((up % 86400) / 3600), m = Math.floor((up % 3600) / 60);
    const mem = process.memoryUsage();
    const tracked = Object.keys(db.trackedServers || {});
    const totalStaff = tracked.reduce((n, sid) => n + (db.trackedServers[sid].members || []).length, 0);
    const totalVoice = tracked.reduce((n, sid) => n + (db.trackedServers[sid].members || []).filter(mm => mm.voiceChannel).length, 0);

    const header = [
        `## ${E('driver')}${client.user?.username || 'Checker'} — Diagnostics`,
        `-# Node.js \`${process.version}\`  •  Uptime \`${d}d ${h}h ${m}m\`  •  Architecture \`${process.arch}\``
    ].join('\n');
    addBlock(container, makeSection(header, botThumb));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const perf = [
        `### ${E('stats')}Performance & Network`,
        `**WebSocket Ping** \`${client.ws.ping}ms\`  •  **Memory (RSS)** \`${(mem.rss / 1048576).toFixed(1)} MB\``,
        `**Heap Used** \`${(mem.heapUsed / 1048576).toFixed(1)} MB\`  •  **Total Staff** \`${totalStaff}\``
    ].join('\n');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(perf));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const scanner = [
        `### ${E('server')}Scanner & Activity`,
        `**Cached Guilds** \`${client.guilds.cache.size}\`  •  **Cached Users** \`${client.users.cache.size}\``,
        `**Tracked Guilds** \`${tracked.length}\`  •  **Staff In Voice** \`${totalVoice}\``,
        `**Scanner User Tokens** \`${Object.keys(db.userTokens || {}).length}\`  •  **Managed Bots** \`${(db.bots || []).length}\``
    ].join('\n');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(scanner));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E('eye')}Requested by ${requestedBy?.username || 'User'}  •  Live Diagnostics`
    ));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ping:refresh').setLabel('Refresh Diagnostics').setStyle(ButtonStyle.Primary)
    );
    container.addActionRowComponents(row);

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };
}


// ─── DUAL-SIDE CONTAINER V2 BUILDER FOR FALLCHECK (MEMBER HISTORY) ──────────
const fallSessions = new Map(); // messageId -> { user, userId, results, page, authorId, author, expires }
setInterval(() => {
    const now = Date.now();
    for (const [k, s] of fallSessions) if (s.expires < now) fallSessions.delete(k);
}, 5 * 60 * 1000);

async function buildFallcheckContainerV2({ user, userId, results, page = 0, requestedBy }) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));
    const files = [];

    if (!results || results.length === 0) {
        const userThumb = resolveThumb(user ? userAvatarUrl(user) : null, 'iconsax-ai-users-b92969ecc876-.png', 'fall_user.png', files);
        const text = [
            `### ${E('warning')}No Shared Servers Found`,
            `-# **Target:** <@${userId}>  •  \`${userId}\``,
            `> No server memberships were detected for this user across monitored servers.`
        ].join('\n');
        addBlock(container, makeSection(text, userThumb));
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# ${E('eye')}Requested by ${requestedBy?.username || 'User'}  •  Membership History`
        ));
        return { flags: MessageFlags.IsComponentsV2, components: [container], files };
    }

    const totalPages = results.length;
    const p = Math.max(0, Math.min(page, totalPages - 1));
    const srv = results[p];

    const userThumb = resolveThumb(user ? userAvatarUrl(user) : null, 'iconsax-ai-users-b92969ecc876-.png', 'fall_user.png', files);
    const srvThumb = resolveThumb(serverIcon(srv.serverId, srv.serverIconHash, 256), 'iconsax-driver-f050b33fa120-.png', 'fall_srv.png', files);

    const displayName = user ? (user.globalName || user.username) : userId;
    const userTag = user ? (user.discriminator && user.discriminator !== '0' ? `${user.username}#${user.discriminator}` : `@${user.username}`) : `@${userId}`;

    const userLines = [
        `## ${E('user')}${displayName}`,
        `-# **Tag:** \`${userTag}\`  •  **Mention:** <@${userId}>  •  **ID:** \`${userId}\``,
        `> ${E('server')}**Shared Servers:** \`${totalPages}\` servers  •  **Viewing Server:** \`${p + 1} / ${totalPages}\``
    ].join('\n');
    addBlock(container, makeSection(userLines, userThumb));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const joinedStr = srv.joinedAt ? `${fmtDate(srv.joinedAt)} (${fmtRel(srv.joinedAt)})` : '`Unknown`';
    const rolesList = (srv.allRoles || []).map(r => cleanRoleName(r.name || r)).filter(n => n && n !== '@everyone');
    const rolesFormatted = rolesList.length > 0
        ? rolesList.slice(0, 10).map(r => `\`${r}\``).join('  ') + (rolesList.length > 10 ? ` \`+${rolesList.length - 10} more\`` : '')
        : '`No roles`';

    const srvLines = [
        `### ${E('server')}${srv.serverName || 'Unknown Server'}`,
        `-# **Server ID:** \`${srv.serverId}\`  •  **Server ${p + 1} of ${totalPages}**`,
        `> ${E('clock')}**Joined Server:** ${joinedStr}`,
        `> ${E('role')}**Assigned Roles (${rolesList.length}):** ${rolesFormatted}`
    ].join('\n');
    addBlock(container, makeSection(srvLines, srvThumb));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E('eye')}Requested by ${requestedBy?.username || 'User'}  •  Server ${p + 1} of ${totalPages}`
    ));

    const row = new ActionRowBuilder();
    if (totalPages > 1) {
        row.addComponents(
            new ButtonBuilder().setCustomId('fall:prev').setLabel('Prev').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
            new ButtonBuilder().setCustomId('fall:page').setLabel(`${p + 1} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('fall:next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(p >= totalPages - 1),
            new ButtonBuilder().setCustomId('fall:refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
        );
    } else {
        row.addComponents(
            new ButtonBuilder().setCustomId('fall:refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
        );
    }
    container.addActionRowComponents(row);

    return { flags: MessageFlags.IsComponentsV2, components: [container], files };
}

// ─── DUAL-SIDE CONTAINER V2 BUILDER FOR STAFF ROLE AUDIT ──────────
const sroleSessions = new Map(); // messageId -> { roleQuery, results, page, authorId, author, expires }
setInterval(() => {
    const now = Date.now();
    for (const [k, s] of sroleSessions) if (s.expires < now) sroleSessions.delete(k);
}, 5 * 60 * 1000);

async function buildStaffRoleContainerV2({ roleQuery, results, page = 0, requestedBy }) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));
    const files = [];

    const totalServers = results.length;
    const totalMembers = results.reduce((sum, r) => sum + (r.members ? r.members.length : 0), 0);

    if (totalServers === 0 || totalMembers === 0) {
        const thumb = resolveThumb(null, 'iconsax-teacher-bcd26a1d07fa-.png', 'role_none.png', files);
        const text = [
            `### ${E('warning')}No Members Found with Role: "${roleQuery}"`,
            `> Searched across all monitored and shared servers. No matching roles or members found.`
        ].join('\n');
        addBlock(container, makeSection(text, thumb));
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# ${E('eye')}Requested by ${requestedBy?.username || 'User'}  •  Role Cross-Audit`
        ));
        return { flags: MessageFlags.IsComponentsV2, components: [container], files };
    }

    const p = Math.max(0, Math.min(page, totalServers - 1));
    const srv = results[p];

    const srvThumb = resolveThumb(serverIcon(srv.serverId, srv.serverIconHash, 256), 'iconsax-driver-f050b33fa120-.png', 'srole_srv.png', files);

    const header = [
        `## ${E('crown')}Staff Role Audit: "${roleQuery}"`,
        `-# Found **${totalMembers}** members across **${totalServers}** servers  •  Viewing Server ${p + 1} of ${totalServers}`
    ].join('\n');
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(header));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const membersList = (srv.members || []).map(m => {
        const vcBadge = m.voiceChannel ? ` ${E('voice')}\`${m.voiceChannel.channelName || m.voiceChannel.name || 'Voice'}\`` : '';
        const ownerBadge = m.isOwner ? ` ${E('crown')}\`OWNER\`` : '';
        return `- <@${m.id}> (\`@${m.username || m.tag || m.id}\`)${ownerBadge}${vcBadge}`;
    });

    const displayMembers = membersList.slice(0, 15).join('\n') + (membersList.length > 15 ? `\n-# +${membersList.length - 15} more members` : '');

    const srvBody = [
        `### ${E('server')}${srv.serverName}`,
        `-# **Server ID:** \`${srv.serverId}\`  •  **Role:** \`${srv.roleName || roleQuery}\`  •  **Members with Role:** \`${srv.members.length}\``,
        displayMembers
    ].join('\n');
    addBlock(container, makeSection(srvBody, srvThumb));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E('eye')}Requested by ${requestedBy?.username || 'User'}  •  Server ${p + 1} of ${totalServers}`
    ));

    const row = new ActionRowBuilder();
    if (totalServers > 1) {
        row.addComponents(
            new ButtonBuilder().setCustomId('srole:prev').setLabel('Prev').setStyle(ButtonStyle.Secondary).setDisabled(p === 0),
            new ButtonBuilder().setCustomId('srole:page').setLabel(`${p + 1} / ${totalServers}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('srole:next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(p >= totalServers - 1),
            new ButtonBuilder().setCustomId('srole:refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
        );
    } else {
        row.addComponents(
            new ButtonBuilder().setCustomId('srole:refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
        );
    }
    container.addActionRowComponents(row);

    return { flags: MessageFlags.IsComponentsV2, components: [container], files };
}

// ─── DUAL-SIDE CONTAINER V2 BUILDER FOR PING ──────────
async function buildPingContainerV2({ wsPing, latency, cStatus, cPing, mem, version, requestedBy }) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));

    const files = [];
    const botThumb = resolveThumb(userAvatarUrl(client.user), 'iconsax-status-28c946b5a3fa-.png', 'bot_status.png', files);

    const pingLines = [
        `### ${E('stats')}System Status & Latency`,
        `-# Kiliua Security Intelligence Engine`,
        `> ${E('wifi')}**WebSocket Ping:** \`${wsPing}ms\``,
        `> ${E('clock')}**Bot Response Time:** \`${latency}ms\``,
        `> ${E('driver')}**Checker Scanner API:** ${cStatus === 'Online' ? E('success') : E('danger')}\`${cStatus}\` (\`${cPing}ms\`)`,
        `> ${E('ram')}**Memory Usage:** \`${mem} MB\`  •  **Node.js:** \`${version}\``
    ].join('\n');
    addBlock(container, makeSection(pingLines, botThumb));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E('eye')}Requested by ${requestedBy?.username || 'User'}  •  Live Telemetry`
    ));

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId('ping:refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
    );
    container.addActionRowComponents(row);

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };
}

// ─── DUAL-SIDE CONTAINER V2 BUILDER FOR SERVERS ──────────
const srvSessions = new Map(); // messageId -> { guilds, page, authorId, author, expires }
setInterval(() => {
    const now = Date.now();
    for (const [k, s] of srvSessions) if (s.expires < now) srvSessions.delete(k);
}, 5 * 60 * 1000);

async function buildServersContainerV2({ guilds, page = 0, totalPages = 1, requestedBy }) {
    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));

    const files = [];
    const pageSize = 8;
    const startIdx = page * pageSize;
    const pageItems = guilds.slice(startIdx, startIdx + pageSize);

    const srvThumb = resolveThumb(null, 'iconsax-driver-f050b33fa120-.png', 'servers_icon.png', files);

    const headerLines = [
        `### ${E('server')}Linked Scanner Servers`,
        `-# Active Servers on Scanner User Token`,
        `> ${E('driver')}**Total Servers:** \`${guilds.length}\`  •  **Page:** \`${page + 1} / ${totalPages}\``
    ].join('\n');
    addBlock(container, makeSection(headerLines, srvThumb));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const listLines = pageItems.map((g, idx) => {
        const num = startIdx + idx + 1;
        const count = g.approximate_member_count ? fmtNum(g.approximate_member_count) : '?';
        return `**#${num} ${g.name}**\n-# **ID:** \`${g.id}\`  •  ${E('members')}**Members:** \`${count}\``;
    }).join('\n\n');

    const listThumb = resolveThumb(null, 'iconsax-ai-users-b92969ecc876-.png', 'srv_list.png', files);
    addBlock(container, makeSection(listLines, listThumb));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
        `-# ${E('eye')}Requested by ${requestedBy?.username || 'User'}  •  Page ${page + 1} of ${totalPages}  •  Server Directory`
    ));

    const row = new ActionRowBuilder();
    if (totalPages > 1) {
        row.addComponents(
            new ButtonBuilder().setCustomId('srv:prev').setLabel('Prev').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
            new ButtonBuilder().setCustomId('srv:page').setLabel(`${page + 1} / ${totalPages}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
            new ButtonBuilder().setCustomId('srv:next').setLabel('Next').setStyle(ButtonStyle.Secondary).setDisabled(page >= totalPages - 1),
            new ButtonBuilder().setCustomId('srv:refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary)
        );
    } else {
        row.addComponents(new ButtonBuilder().setCustomId('srv:refresh').setLabel('Refresh').setStyle(ButtonStyle.Secondary));
    }
    container.addActionRowComponents(row);

    return {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };
}

// ─── GENERAL DUAL-SECTION CONTAINER V2 ENGINE (COMPACT V2) ──────────────────
async function formatAsContainerV2(rawOptions, extraComponents = [], context = null, extraData = {}) {
    if (!rawOptions && (!extraComponents || extraComponents.length === 0)) {
        return rawOptions;
    }
    if (rawOptions instanceof ContainerBuilder) {
        return {
            flags: MessageFlags.IsComponentsV2,
            components: [rawOptions],
            ...extraData
        };
    }
    if (rawOptions && rawOptions.flags && (rawOptions.flags & MessageFlags.IsComponentsV2) && rawOptions.components?.length > 0) {
        if (rawOptions.embeds) delete rawOptions.embeds;
        return rawOptions;
    }
    // Fix for discord.js MessagePayload re-entrancy
    if (rawOptions && rawOptions.options && rawOptions.options.flags && (rawOptions.options.flags & MessageFlags.IsComponentsV2)) {
        if (rawOptions.options.embeds) delete rawOptions.options.embeds;
        return rawOptions;
    }

    let extractedOptions = rawOptions;
    if (rawOptions && rawOptions.options && (rawOptions.options.embeds || rawOptions.options.content)) {
        extractedOptions = rawOptions.options;
    }

    let options = typeof extractedOptions === 'string' ? { content: extractedOptions } : { ...(extractedOptions || {}) };
    const embeds = options.embeds || [];
    const content = options.content;
    const existingComponents = options.components || [];
    const allComponents = [...existingComponents, ...extraComponents];
    const files = options.files ? [...options.files] : (extraData.files ? [...extraData.files] : []);

    const container = new ContainerBuilder();

    // 1. Accent Color
    let color = THEME.PRIMARY;
    if (options.color) {
        color = options.color;
    } else if (embeds.length > 0 && embeds[0].data?.color) {
        color = embeds[0].data.color;
    }
    try {
        container.setAccentColor(resolveColor(color));
    } catch {}

    // 2. Real images (Discord CDN URLs rendered directly) with local PNG fallback
    const fmtGuild = options.targetGuild || extraData.targetGuild || options.targetServer || context?.guild;
    const fmtUser = options.targetUser || extraData.targetUser || context?.author || context?.user || context?.member?.user;
    let srvIconUrl = options.serverIcon || extraData.serverIcon || null;
    if (!srvIconUrl && fmtGuild) {
        if (typeof fmtGuild.iconURL === 'function') srvIconUrl = fmtGuild.iconURL({ size: 256, extension: 'png' });
        else if (fmtGuild.id && fmtGuild.icon) srvIconUrl = serverIcon(fmtGuild.id, fmtGuild.icon, 256);
        else if (fmtGuild.serverId && fmtGuild.serverIconHash) srvIconUrl = serverIcon(fmtGuild.serverId, fmtGuild.serverIconHash, 256);
    }
    let usrIconUrl = options.userAvatar || extraData.userAvatar || null;
    for (const emb of embeds) {
        const d = emb.data || emb;
        if (!usrIconUrl && d.thumbnail?.url && /^https?:/.test(d.thumbnail.url)) usrIconUrl = d.thumbnail.url;
        if (!usrIconUrl && d.author?.icon_url && /^https?:/.test(d.author.icon_url)) usrIconUrl = d.author.icon_url;
    }
    if (!usrIconUrl) usrIconUrl = userAvatarUrl(fmtUser);
    const hasSrvFile = files.some(f => f.name === 'server_logo.png');
    const hasUsrFile = files.some(f => f.name === 'user_avatar.png');
    const srvThumbUrl = hasSrvFile ? 'attachment://server_logo.png' : resolveThumb(srvIconUrl, 'iconsax-driver-f050b33fa120-.png', 'server_logo.png', files);
    const usrThumbUrl = hasUsrFile ? 'attachment://user_avatar.png' : resolveThumb(usrIconUrl, 'iconsax-ai-users-b92969ecc876-.png', 'user_avatar.png', files);

    // 3. Section 1 (Server Section - Upper, Compact)
    let headerTitle = options.title || '';
    let authorName = '';
    for (const emb of embeds) {
        const d = emb.data || emb;
        if (d.author?.name) authorName = d.author.name;
        if (d.title && !headerTitle) headerTitle = d.title;
    }

    const targetGuild = options.targetGuild || extraData.targetGuild || options.targetServer;
    const guild = targetGuild || context?.guild;
    const srvName = guild?.name || authorName || 'Kiliua Security Intelligence';
    const srvId = guild?.id || (guild?.serverId ? guild.serverId : 'System');
    const srvLines = [
        `### ${E('server')}${srvName}`,
        headerTitle ? `-# ${headerTitle}` : `-# ${E('card')}\`${srvId}\``
    ].join('\n');

    const serverSec = makeSection(srvLines, srvThumbUrl);

    // Separator 1 (Divider true)
    const sep1 = new SeparatorBuilder().setDivider(true);

    // 4. Section 2 (User / Body Section - Lower, Compact)
    let bodyContent = '';
    if (content && typeof content === 'string' && content.trim()) {
        bodyContent += `${content.trim()}\n`;
    }

    for (const emb of embeds) {
        const d = emb.data || emb;
        if (d.description) {
            bodyContent += `${d.description.trim()}\n`;
        }
        if (d.fields && Array.isArray(d.fields)) {
            for (const f of d.fields) {
                bodyContent += `> **${f.name}:** ${f.value}\n`;
            }
        }
    }

    if (!bodyContent.trim()) {
        bodyContent = '> `Operation completed successfully.`';
    }

    const userSec = makeSection(bodyContent.trim().slice(0, 3900), usrThumbUrl);

    // Separator 2 (Transparent divider)
    const sep2 = new SeparatorBuilder().setDivider(false);

    // 5. Footer Text
    let footerContent = '';
    for (const emb of embeds) {
        const d = emb.data || emb;
        if (d.footer?.text) footerContent = d.footer.text;
    }
    if (!footerContent) {
        footerContent = `Checked by ${context?.author?.username || context?.user?.username || 'Kiliua Security'}`;
    }
    const footer = new TextDisplayBuilder().setContent(`-# ${footerContent}`);

    addBlock(container, serverSec);
    container.addSeparatorComponents(sep1);
    addBlock(container, userSec);
    container.addSeparatorComponents(sep2);
    container.addTextDisplayComponents(footer);

    // 6. ActionRows with Grey Secondary Buttons
    for (const comp of allComponents) {
        if (comp) {
            if (comp.components && Array.isArray(comp.components)) {
                for (const b of comp.components) {
                    if (b.data && b.data.style === ButtonStyle.Primary && (b.data.custom_id?.includes('page') || b.data.custom_id?.includes('prev') || b.data.custom_id?.includes('next'))) {
                        b.setStyle(ButtonStyle.Secondary);
                    }
                }
            }
            container.addActionRowComponents(comp);
        }
    }

    const result = {
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    };

    return result;
}

// Global Prototype Interceptor: Routes every reply, edit, and send through Container V2
if (Message?.prototype) {
    const _origReply = Message.prototype.reply;
    Message.prototype.reply = async function(options) {
        try {
            return _origReply.call(this, await formatAsContainerV2(options, [], this));
        } catch (err) {
            console.error('[CONTAINER V2 REPLY ERROR]', err);
            return _origReply.call(this, options);
        }
    };

    const _origEdit = Message.prototype.edit;
    Message.prototype.edit = async function(options) {
        try {
            return _origEdit.call(this, await formatAsContainerV2(options, [], this));
        } catch (err) {
            console.error('[CONTAINER V2 EDIT ERROR]', err);
            return _origEdit.call(this, options);
        }
    };
}

if (BaseGuildTextChannel?.prototype?.send) {
    const _origGuildSend = BaseGuildTextChannel.prototype.send;
    BaseGuildTextChannel.prototype.send = async function(options) {
        try {
            return _origGuildSend.call(this, await formatAsContainerV2(options, [], this));
        } catch (err) {
            return _origGuildSend.call(this, options);
        }
    };
}

if (DMChannel?.prototype?.send) {
    const _origDmSend = DMChannel.prototype.send;
    DMChannel.prototype.send = async function(options) {
        try {
            return _origDmSend.call(this, await formatAsContainerV2(options, [], this));
        } catch (err) {
            return _origDmSend.call(this, options);
        }
    };
}

if (User?.prototype?.send) {
    const _origUserSend = User.prototype.send;
    User.prototype.send = async function(options) {
        try {
            return _origUserSend.call(this, await formatAsContainerV2(options, [], this));
        } catch (err) {
            return _origUserSend.call(this, options);
        }
    };
}

// Interaction updates handled directly without prototype interception


// ─── PERMISSION NAMES ──────────────────────────────────────────
const PERM_NAMES = {
    'ADMINISTRATOR': 'Administrator',
    'MANAGE_GUILD': 'Manage Server',
    'MANAGE_ROLES': 'Manage Roles',
    'MANAGE_CHANNELS': 'Manage Channels',
    'MANAGE_WEBHOOKS': 'Manage Webhooks',
    'KICK_MEMBERS': 'Kick Members',
    'BAN_MEMBERS': 'Ban Members',
    'MANAGE_MESSAGES': 'Manage Messages',
    'MENTION_EVERYONE': 'Mention @everyone',
    'MANAGE_NICKNAMES': 'Manage Nicknames',
    'MUTE_MEMBERS': 'Mute Members',
    'DEAFEN_MEMBERS': 'Deafen Members',
    'MOVE_MEMBERS': 'Move Members',
    'VIEW_AUDIT_LOG': 'View Audit Log',
    'PRIORITY_SPEAKER': 'Priority Speaker',
    'MANAGE_GUILD_EXPRESSIONS': 'Manage Expressions',
    'MANAGE_EVENTS': 'Manage Events',
    'MODERATE_MEMBERS': 'Moderate Members'
};

function getPermDisplay(perm) {
    return PERM_NAMES[perm] || perm.replace(/_/g, ' ');
}

// ─── PERMISSION MAP ──────────────────────────────────────────
const ALL_PERMISSIONS = {
    ADMINISTRATOR: 1n << 3n,
    MANAGE_GUILD: 1n << 5n,
    MANAGE_ROLES: 1n << 28n,
    MANAGE_CHANNELS: 1n << 4n,
    MANAGE_WEBHOOKS: 1n << 29n,
    KICK_MEMBERS: 1n << 1n,
    BAN_MEMBERS: 1n << 2n,
    MANAGE_MESSAGES: 1n << 13n,
    MENTION_EVERYONE: 1n << 17n,
    MANAGE_NICKNAMES: 1n << 27n,
    MUTE_MEMBERS: 1n << 22n,
    DEAFEN_MEMBERS: 1n << 23n,
    MOVE_MEMBERS: 1n << 24n,
    VIEW_AUDIT_LOG: 1n << 7n,
    PRIORITY_SPEAKER: 1n << 8n,
    MANAGE_GUILD_EXPRESSIONS: 1n << 30n,
    MANAGE_EVENTS: 1n << 33n,
    MODERATE_MEMBERS: 1n << 40n,
};

const STAFF_PERMISSIONS = [
    'ADMINISTRATOR', 'MANAGE_GUILD', 'MANAGE_ROLES', 'MANAGE_CHANNELS',
    'KICK_MEMBERS', 'BAN_MEMBERS', 'MANAGE_MESSAGES',
    'MANAGE_NICKNAMES', 'MUTE_MEMBERS', 'MOVE_MEMBERS', 'DEAFEN_MEMBERS',
    'MODERATE_MEMBERS', 'MENTION_EVERYONE', 'MANAGE_WEBHOOKS',
    'MANAGE_EVENTS', 'VIEW_AUDIT_LOG',
    'MANAGE_GUILD_EXPRESSIONS'
];

// Roles whose ONLY staff permissions are exactly these five (mod-lite roles)
const LITE_MOD_PERMS = ['MANAGE_MESSAGES', 'MANAGE_NICKNAMES', 'MUTE_MEMBERS', 'DEAFEN_MEMBERS', 'MOVE_MEMBERS'];

function getLiteModRoles(member) {
    const out = [];
    for (const role of member.roles || []) {
        let rp;
        try { rp = BigInt(role.permissions || '0'); } catch { continue; }
        if ((rp & (1n << 3n)) !== 0n) continue; // Administrator excluded
        const matched = STAFF_PERMISSIONS.filter(p => { const f = ALL_PERMISSIONS[p]; return f && (rp & f) !== 0n; });
        if (matched.length !== LITE_MOD_PERMS.length) continue;
        if (LITE_MOD_PERMS.every(p => matched.includes(p))) out.push(role);
    }
    return out;
}

function isLiteModMember(member) {
    return getLiteModRoles(member).length > 0;
}

// ===================== VOICE AUTO-JOIN =====================
async function autoJoinVC() {
    for (const [gid, guild] of client.guilds.cache) {
        try {
            const ex = getVoiceConnection(gid);
            if (ex && ex.state.status === VoiceConnectionStatus.Ready) continue;
            if (ex) ex.destroy();
            let ch = null;
            if (AUTO_VC) {
                try { ch = await client.channels.fetch(AUTO_VC); if (!ch || !ch.isVoiceBased() || !ch.joinable) continue; } catch { continue; }
            } else {
                ch = guild.channels.cache.filter(c => c.isVoiceBased() && c.joinable).first();
                if (!ch) continue;
            }
            const conn = joinVoiceChannel({ channelId: ch.id, guildId: guild.id, adapterCreator: guild.voiceAdapterCreator, selfDeaf: true, selfMute: false });
            conn.on(VoiceConnectionStatus.Disconnected, async () => {
                try { await Promise.race([entersState(conn, VoiceConnectionStatus.Signalling, 5000), entersState(conn, VoiceConnectionStatus.Connecting, 5000)]); } catch { conn.destroy(); setTimeout(autoJoinVC, 5000); }
            });
        } catch {}
    }
}

// ===================== GUARD =====================
async function guard(msg, needArgs, args, usage) {
    if (msg.channel.type === ChannelType.DM) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('This command cannot be used in DMs.'))] });
        return null;
    }
    // Anyone can use commands
    const token = db.userTokens[msg.author.id] || config.checker_user_token || config.fallback_user_token;
    if (needArgs && !args) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Usage: ${usage}`))] });
        return null;
    }
    return token || null;
}

async function guardOwnerSilent(msg, needArgs, args, usage) {
    if (msg.channel.type === ChannelType.DM) return null;
    if (!isOwner(msg.member)) return null;
    if (needArgs && !args) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Usage: ${usage}`))] });
        return null;
    }
    return true;
}

// ===================== +setrole / +set (Server Access Control) =====================
async function handleSetRole(msg, args) {
    if (!msg.guild) return;
    const isServerOwner = msg.guild.ownerId === msg.author.id;
    const isAdmin = msg.member && msg.member.permissions.has(PermissionFlagsBits.Administrator);
    const isBotOwner = isOwner(msg.member);

    if (!isServerOwner && !isAdmin && !isBotOwner) {
        return msg.reply(makeWaitingContainer({
            title: 'Administrator Required',
            description: 'Only the **Server Owner** or Members with **Administrator** permissions can configure the authorized bot role.',
            user: msg.author,
            iconKey: 'danger'
        }));
    }

    const input = (args || '').trim();
    const currentRoleId = db.allowedRoles[msg.guild.id];
    const currentRole = currentRoleId ? msg.guild.roles.cache.get(currentRoleId) : null;

    if (!input) {
        let status = currentRole
            ? `Current authorized role: <@&${currentRole.id}> (\`${currentRole.name}\`) — **${currentRole.members.size}** members holding role.`
            : (currentRoleId ? `Current authorized role: \`${currentRoleId}\`` : 'No authorized role configured yet (only Server Owner & Admins can use the bot).');

        return msg.reply(makeWaitingContainer({
            title: 'Server Staff Role Configuration',
            description: `${status}\n\n**Commands:**\n• \`+setrole <@role|id|name>\` — Set the authorized role for this server.\n• \`+setrole remove\` — Clear the configured role.`,
            user: msg.author,
            iconKey: 'crown'
        }));
    }

    if (input.toLowerCase() === 'remove' || input.toLowerCase() === 'off' || input.toLowerCase() === 'clear' || input.toLowerCase() === 'none') {
        delete db.allowedRoles[msg.guild.id];
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        return msg.reply(makeWaitingContainer({
            title: 'Staff Role Removed',
            description: 'The authorized staff role has been cleared for this server.\nNow only the **Server Owner** and **Administrators** can use the bot.',
            user: msg.author,
            iconKey: 'archive_tick'
        }));
    }

    let role = null;
    const mentionMatch = input.match(/^<@&(\d+)>$/);
    if (mentionMatch) {
        role = msg.guild.roles.cache.get(mentionMatch[1]);
    } else if (/^\d{17,20}$/.test(input)) {
        role = msg.guild.roles.cache.get(input);
    } else {
        const q = input.toLowerCase();
        role = msg.guild.roles.cache.find(r => r.name.toLowerCase() === q || r.name.toLowerCase().includes(q));
    }

    if (!role) {
        return msg.reply(makeWaitingContainer({
            title: 'Role Not Found',
            description: `Could not find a role matching "${input}" in this server.\nPlease mention the role (e.g. \`+setrole @Staff\`) or provide a valid role ID.`,
            user: msg.author,
            iconKey: 'warning'
        }));
    }

    db.allowedRoles[msg.guild.id] = role.id;
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

    return msg.reply(makeWaitingContainer({
        title: 'Staff Role Configured Successfully',
        description: `Authorized role for this server set to: <@&${role.id}> (\`${role.name}\`)\nAll members with this role can now use the bot's scanner and intelligence commands.`,
        user: msg.author,
        iconKey: 'verify'
    }));
}

// ===================== TOKEN POOL & USER TOKENS (+settoken, +addtoken, +removetoken, +tokens) =====================
async function handleSetUserToken(msg, args) {
    const raw = (args || '').trim();
    const token = raw.replace(/^Bot\s+/i, '').replace(/[\"\']/g, '').trim();
    if (!token || token.length < 25) {
        const currentToken = db.userTokens?.[msg.author.id];
        const status = currentToken
            ? `You currently have a connected account token (\`${currentToken.slice(0, 8)}...${currentToken.slice(-6)}\`).`
            : 'No personal user token connected.';
        return msg.reply(makeWaitingContainer({
            title: 'Personal User Token Setup',
            description: `${status}\n\nConnecting your user account allows the bot to search your servers and speed up all queries across the network!\n\n**Commands:**\n• \`+settoken <token>\` — Connect your user token\n• \`+settoken remove\` — Disconnect your token\n\n*Security Notice: Messages containing tokens are automatically deleted immediately.*`,
            user: msg.author,
            iconKey: 'driver'
        }));
    }

    msg.delete?.().catch(() => {});

    if (token.toLowerCase() === 'remove' || token.toLowerCase() === 'off' || token.toLowerCase() === 'clear' || token.toLowerCase() === 'none') {
        if (db.userTokens?.[msg.author.id]) {
            delete db.userTokens[msg.author.id];
            fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        }
        return msg.reply(makeWaitingContainer({
            title: 'Account Token Disconnected',
            description: 'Your linked user token has been disconnected.',
            user: msg.author,
            iconKey: 'archive_tick'
        }));
    }

    const wait = await msg.reply(makeWaitingContainer({
        title: 'Connecting Account Token...',
        description: 'Validating token and scanning accessible servers...',
        user: msg.author,
        iconKey: 'loader'
    }));

    try {
        const res = await axios.get('https://discord.com/api/v9/users/@me', {
            headers: { Authorization: token, 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
            timeout: 10000
        });
        const user = res.data;
        let guildCount = 0;
        try {
            const gRes = await axios.get('https://discord.com/api/v9/users/@me/guilds', {
                headers: { Authorization: token, 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000
            });
            guildCount = gRes.data?.length || 0;
        } catch {}

        if (!db.userTokens) db.userTokens = {};
        db.userTokens[msg.author.id] = token;
        if (!Array.isArray(db.userTokensPool)) db.userTokensPool = [];
        if (!db.userTokensPool.includes(token)) db.userTokensPool.push(token);
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

        refreshGuildIndex(true).catch(() => {});

        const tag = user.discriminator && user.discriminator !== '0' ? `${user.username}#${user.discriminator}` : `@${user.username}`;
        await wait.edit(makeWaitingContainer({
            title: 'Account Connected Successfully!',
            description: `**Account:** \`${tag}\` (\`${user.id}\`)\n**Accessible Servers:** \`${guildCount}\` servers merged into scanner network\n**Total Active Pool Accounts:** \`${getTokenPool().length}\` accounts\n\n*The message containing your token was automatically deleted for security.*`,
            targetUser: { id: user.id, avatar: user.avatar },
            user: msg.author,
            iconKey: 'verify'
        }));
    } catch (err) {
        await wait.edit(makeWaitingContainer({
            title: 'Token Validation Failed',
            description: `Could not connect to Discord with this token: \`${err.response?.data?.message || err.message}\`\nPlease ensure the token is active and valid.`,
            user: msg.author,
            iconKey: 'danger'
        }));
    }
}

async function handleAddToken(msg, args) {
    if (!isOwner(msg.member)) {
        return msg.reply(makeWaitingContainer({
            title: 'Permission Denied',
            description: 'Only the **Server Owner** or Members with **Administrator** permissions can add tokens to the shared pool.\n\nTo link your personal account token, use `+settoken <token>`.',
            user: msg.author,
            iconKey: 'lock'
        }));
    }
    const raw = (args || '').trim();
    const token = raw.replace(/^Bot\s+/i, '').replace(/[\"\']/g, '').trim();
    if (!token || token.length < 25) {
        return msg.reply(makeWaitingContainer({
            title: 'Add User Token',
            description: 'Usage: `+addtoken <user_token>`\n\n*Message will be automatically deleted for security.*',
            user: msg.author,
            iconKey: 'warning'
        }));
    }
    msg.delete?.().catch(() => {});
    const wait = await msg.reply(makeWaitingContainer({
        title: 'Validating Token...',
        description: 'Testing connection to Discord User Gateway & API...',
        user: msg.author,
        iconKey: 'loader'
    }));
    try {
        const res = await axios.get('https://discord.com/api/v9/users/@me', {
            headers: {
                'Authorization': token,
                'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
            },
            timeout: 10000
        });
        const user = res.data;
        let guildCount = 0;
        try {
            const gRes = await axios.get('https://discord.com/api/v9/users/@me/guilds', {
                headers: { 'Authorization': token, 'User-Agent': 'Mozilla/5.0' },
                timeout: 10000
            });
            guildCount = gRes.data?.length || 0;
        } catch {}

        if (!Array.isArray(db.userTokensPool)) db.userTokensPool = [];
        if (!db.userTokensPool.includes(token)) {
            db.userTokensPool.push(token);
            fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        }

        refreshGuildIndex(true).catch(() => {});

        const tag = user.discriminator && user.discriminator !== '0' ? `${user.username}#${user.discriminator}` : `@${user.username}`;
        await wait.edit(makeWaitingContainer({
            title: 'Token Added to Pool',
            description: `**Account:** \`${tag}\` (\`${user.id}\`)\n**Servers:** \`${guildCount}\` servers connected\n**Total Pool Size:** \`${getTokenPool().length}\` active tokens\n\n*The message containing the token was automatically deleted for security.*`,
            targetUser: { id: user.id, avatar: user.avatar },
            user: msg.author,
            iconKey: 'verify'
        }));
    } catch (err) {
        await wait.edit(makeWaitingContainer({
            title: 'Token Validation Failed',
            description: `Failed to connect with this token: \`${err.response?.data?.message || err.message}\`\nPlease check that the token is active and not locked.`,
            user: msg.author,
            iconKey: 'danger'
        }));
    }
}

async function handleRemoveToken(msg, args) {
    if (!isOwner(msg.member)) {
        return msg.reply(makeWaitingContainer({
            title: 'Permission Denied',
            description: 'Only the **Server Owner** or Members with **Administrator** permissions can remove pool tokens.',
            user: msg.author,
            iconKey: 'lock'
        }));
    }
    const input = (args || '').trim();
    if (!input) {
        return msg.reply(makeWaitingContainer({
            title: 'Remove Token',
            description: 'Usage: `+removetoken <index_number>` (run `+tokens` to see indices)',
            user: msg.author,
            iconKey: 'warning'
        }));
    }
    const pool = db.userTokensPool || [];
    const idx = parseInt(input, 10) - 1;
    if (isNaN(idx) || idx < 0 || idx >= pool.length) {
        return msg.reply(makeWaitingContainer({
            title: 'Invalid Token Index',
            description: `Index out of range. Run \`+tokens\` to see the list of pool tokens (1 to ${pool.length}).`,
            user: msg.author,
            iconKey: 'warning'
        }));
    }
    const removed = pool.splice(idx, 1)[0];
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    refreshGuildIndex(true).catch(() => {});
    return msg.reply(makeWaitingContainer({
        title: 'Token Removed',
        description: `Token #${idx + 1} (\`${removed.slice(0, 10)}...${removed.slice(-6)}\`) was removed from the pool.\nRemaining pool tokens: \`${getTokenPool().length}\`.`,
        user: msg.author,
        iconKey: 'archive_tick'
    }));
}

async function handleTokens(msg) {
    if (!hasAccess(msg.member, msg)) return;
    const wait = await msg.reply(makeWaitingContainer({
        title: 'Checking Token Pool...',
        description: 'Analyzing token accounts, connection health, and server coverage...',
        user: msg.author,
        iconKey: 'loader'
    }));

    const payload = await buildTokensContainerV2({
        requestedBy: msg.author,
        authorId: msg.author.id
    });

    const reply = await wait.edit(payload);
    if (reply?.id) {
        tokenSessions.set(reply.id, {
            authorId: msg.author.id,
            author: msg.author,
            expires: Date.now() + PAGINATION_TIMEOUT_MS
        });
    }
}

// ===================== STAFF TRACKING SYSTEM =====================
async function updateTrackedServer(serverId, token) {
    if (updatingServers.has(serverId)) {
        console.log(`[TRACK] Skipping ${serverId} – update already in progress.`);
        return false;
    }
    if (!staffTrackingEnabled) {
        console.log(`[TRACK] Staff tracking is disabled. Skipping ${serverId}.`);
        return false;
    }
    if (!token) {
        console.log(`[TRACK] No token provided for ${serverId}.`);
        return false;
    }
    updatingServers.add(serverId);
    console.log(`[TRACK] Updating staff data for server ${serverId}...`);
    try {
        const res = await api.get('/checkadmins', {
            headers: { Authorization: token },
            params: { guildId: serverId },
            timeout: 900000
        });
        const data = res.data;
        if (data.error) {
            console.error(`[TRACK] Error updating ${serverId}: ${data.error}`);
            return false;
        }
        db.trackedServers[serverId] = {
            lastUpdate: Date.now(),
            guild: data.guild || { name: serverId, id: serverId, roles: [] },
            members: data.members || [],
            blacklistedCount: data.blacklistedCount || 0,
            note: data.note || ''
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
        console.log(`[TRACK] Server ${serverId} updated: ${db.trackedServers[serverId].members.length} staff members`);
        return true;
    } catch (e) {
        console.error(`[TRACK] Failed to update ${serverId}: ${e.message}`);
        return false;
    } finally {
        updatingServers.delete(serverId);
    }
}

async function updateAllTrackedServers() {
    if (!staffTrackingEnabled) {
        console.log('[TRACK] Staff tracking is globally disabled.');
        return;
    }
    if (isCommandActive()) {
        console.log('[TRACK] Skipping background update — a command is currently active.');
        return;
    }
    console.log('[TRACK] Updating all tracked servers...');
    const token = db.userTokens[Object.keys(db.userTokens)[0]];
    if (!token) {
        console.error('[TRACK] No scanner token found in database.');
        return;
    }
    const serverIds = Object.keys(db.trackedServers);
    for (const sid of serverIds) {
        if (!staffTrackingEnabled) break;
        if (isCommandActive()) {
            console.log(`[TRACK] Pausing background update at ${sid} — command became active.`);
            break;
        }
        if (updatingServers.has(sid)) {
            console.log(`[TRACK] Skipping ${sid} – already updating.`);
            continue;
        }
        await updateTrackedServer(sid, token);
        const delay = 2000 + Math.random() * 3000;
        await sleep(delay);
    }
    console.log('[TRACK] Background update cycle finished.');
}

let updateInterval = null;

function startInstantUpdates() {
    if (updateInterval) clearInterval(updateInterval);
    updateInterval = setInterval(async () => {
        if (Object.keys(db.trackedServers).length > 0) {
            await updateAllTrackedServers();
        }
    }, UPDATE_INTERVAL);
    console.log(`[TRACK] Instant updates started (every ${UPDATE_INTERVAL/1000} seconds)`);
}

// ===================== CROSS-SERVER STAFF VIEW =====================
async function getMemberInTarget(userId, targetServerId, token, retries = 3) {
    if (!token) {
        console.log('[CROSS] No token provided – cannot fetch target info.');
        return null;
    }
    for (let attempt = 0; attempt < retries; attempt++) {
        try {
            const res = await api.get('/check', {
                headers: { Authorization: token },
                params: { userId, fullScan: 'true' },
                timeout: 60000
            });
            const results = res.data.results || [];
            const target = results.find(s => s.serverId === targetServerId);
            if (!target) return null;
            const roles = target.allRoles || [];
            const activePerms = Object.entries(target.permissions || {})
                .filter(([k, v]) => v === true && STAFF_PERMISSIONS.includes(k))
                .map(([k]) => k);
            return {
                serverName: target.serverName,
                serverId: target.serverId,
                roles: roles,
                activePerms: activePerms,
                isOwner: target.isOwner || false,
                joinedAt: target.joinedAt || null
            };
        } catch (e) {
            console.error(`[CROSS] Attempt ${attempt+1} failed for ${userId} in target:`, e.message);
            if (attempt < retries - 1) await sleep(2000);
        }
    }
    return null;
}

async function handleStaffCross(msg, args) {
    if (!hasAccess(msg.member, msg)) return;
    if (msg.channel.type === ChannelType.DM) return;

    // تأخير أمني عشوائي قبل البدء لمنع الكشف والحظر من ديسكورد
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 2000));

    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) {
        const err = makeWaitingContainer({
            title: 'Staff Cross Check',
            description: 'Usage: `+staffcross <source_server_id> <target_server_id>`\nExample: `+staffcross 960299202938826782 1400333179126157342`',
            user: msg.author,
            iconKey: 'warning'
        });
        await msg.reply(err);
        return;
    }
    const sourceId = parts[0].replace(/[<@!>]/g, '').trim();
    const targetId = parts[1].replace(/[<@!>]/g, '').trim();
    if (!/^\d{17,20}$/.test(sourceId) || !/^\d{17,20}$/.test(targetId)) {
        const err = makeWaitingContainer({
            title: 'Staff Cross Check',
            description: 'Invalid server IDs provided. Please provide valid Discord snowflake IDs.',
            user: msg.author,
            iconKey: 'danger'
        });
        await msg.reply(err);
        return;
    }

    const token = db.userTokens[msg.author.id] || config.checker_user_token;
    if (!token) {
        const err = makeWaitingContainer({
            title: 'Staff Cross Check',
            description: 'Scanner token missing. Set it in `database.json`.',
            user: msg.author,
            iconKey: 'danger'
        });
        await msg.reply(err);
        return;
    }

    const waitMsg = await msg.reply(makeWaitingContainer({
        title: 'Staff Cross Check',
        description: `Scanning staff from source server **${sourceId}** and checking presence in target server **${targetId}**...\nPlease wait while analyzing permissions.`,
        user: msg.author,
        iconKey: 'loader'
    }));

    try {
        let sourceMembers = [], sourceGuild = null;
        if (db.trackedServers[sourceId]) {
            const stored = db.trackedServers[sourceId];
            sourceMembers = stored.members || [];
            sourceGuild = stored.guild || { name: sourceId, id: sourceId, roles: [] };
        } else {
            const res = await api.get('/checkadmins', {
                headers: { Authorization: token },
                params: { guildId: sourceId },
                timeout: 900000
            });
            if (res.data.error) {
                await waitMsg.edit(makeWaitingContainer({
                    title: 'Staff Cross Check',
                    description: `Error fetching source server: ${res.data.error}`,
                    user: msg.author,
                    iconKey: 'danger'
                })).catch(() => null);
                return;
            }
            sourceMembers = res.data.members || [];
            sourceGuild = res.data.guild || { name: sourceId, id: sourceId, roles: [] };
        }

        if (sourceMembers.length === 0) {
            await waitMsg.edit(makeWaitingContainer({
                title: 'Staff Cross Check',
                description: `No staff members found in source server **${sourceGuild.name || sourceId}**.`,
                user: msg.author,
                iconKey: 'warning'
            })).catch(() => null);
            return;
        }

        const sourceStaffRolesMap = new Map();
        const sourceStaffRoles = (sourceGuild.roles || []).filter(r => {
            const rp = BigInt(r.permissions);
            const hasPerm = (rp & (1n << 3n)) !== 0n || STAFF_PERMISSIONS.some(p => {
                const flag = ALL_PERMISSIONS[p];
                return flag && (rp & flag) !== 0n;
            });
            const isGameMode = r.name && r.name.toLowerCase() === 'game mode';
            return hasPerm || isGameMode;
        });
        sourceStaffRoles.forEach(r => sourceStaffRolesMap.set(r.id, r));

        let targetGuild = null;
        try {
            const tgRes = await api.get('/guilds', {
                headers: { Authorization: token },
                params: { guildId: targetId },
                timeout: 15000
            });
            if (tgRes.data && tgRes.data.length > 0) {
                targetGuild = tgRes.data[0];
            }
        } catch (e) {}

        const allResults = [];
        let processed = 0;
        for (const m of sourceMembers) {
            processed++;
            if (processed % 5 === 0) {
                await waitMsg.edit(makeWaitingContainer({
                    title: 'Staff Cross Check',
                    description: `Scanning staff members (${processed}/${sourceMembers.length})...\nPlease wait while checking target presence.`,
                    user: msg.author,
                    iconKey: 'loader'
                })).catch(() => null);
            }
            const targetInfo = await getMemberInTarget(m.user.id, targetId, token);
            if (targetInfo) {
                const memberSourceRoles = (m.roles || [])
                    .filter(r => sourceStaffRolesMap.has(r.id))
                    .map(r => r.name);
                allResults.push({
                    member: m,
                    targetInfo: targetInfo,
                    sourceStaffRoles: memberSourceRoles
                });
            }
            const delay = 1200 + Math.random() * 1800;
            await sleep(delay);
        }

        if (allResults.length === 0) {
            await waitMsg.edit(makeWaitingContainer({
                title: 'Staff Cross Analysis',
                description: `No staff members from source server **${sourceGuild.name || sourceId}** are present in target server **${targetGuild ? targetGuild.name : targetId}**.`,
                user: msg.author,
                iconKey: 'success'
            })).catch(() => null);
            return;
        }

        const totalPages = Math.ceil(allResults.length / 5) || 1;
        const payload = await buildStaffCrossContainerV2({
            sourceGuild,
            targetGuild,
            sourceId,
            targetId,
            allResults,
            page: 0,
            totalPages,
            requestedBy: msg.author
        });

        const sentMsg = await waitMsg.edit({ ...payload, attachments: [] });

        staffCrossSessions.set(sentMsg.id, {
            sourceGuild,
            targetGuild,
            sourceId,
            targetId,
            allResults,
            page: 0,
            totalPages,
            authorId: msg.author.id,
            author: msg.author,
            expires: Date.now() + PAGINATION_TIMEOUT_MS
        });

    } catch (e) {
        await waitMsg.edit(makeWaitingContainer({
            title: 'Staff Cross Check',
            description: `Error: \`${e.message}\``,
            user: msg.author,
            iconKey: 'danger'
        })).catch(() => null);
    }
}

// ===================== STAFF TRACKING COMMANDS =====================
async function handleStaffTrack(msg, args) {
    const ok = await guardOwnerSilent(msg, true, args, '+stafftrack <server_id>');
    if (!ok) return;

    const serverId = args.trim();
    if (!/^\d{17,20}$/.test(serverId)) {
        return msg.reply(makeWaitingContainer({ title: 'Invalid Server ID', description: 'Please provide a valid 17-20 digit server ID.', user: msg.author, iconKey: 'warning' }));
    }

    if (db.trackedServers[serverId]) {
        return msg.reply(makeWaitingContainer({ title: 'Server Already Tracked', description: `Server **${serverId}** is already actively tracked.`, user: msg.author, iconKey: 'eye' }));
    }

    const waitMsg = await msg.reply(makeWaitingContainer({ title: 'Tracking Server...', description: `Fetching initial staff data for **${serverId}**...`, user: msg.author, iconKey: 'loader' }));

    const token = db.userTokens[msg.author.id] || config.checker_user_token || config.fallback_user_token;
    if (!token) {
        return waitMsg.edit(makeWaitingContainer({ title: 'Scanner Token Missing', description: 'No scanner token configured for live tracking.', user: msg.author, iconKey: 'danger' }));
    }

    const success = await updateTrackedServer(serverId, token);
    if (success) {
        await waitMsg.edit(makeWaitingContainer({
            title: 'Staff Tracking Active',
            description: `Server **${serverId}** is now being actively monitored.\nStaff changes will update every ${UPDATE_INTERVAL/1000} seconds.`,
            user: msg.author,
            iconKey: 'archive_tick'
        }));
        if (!updateInterval) startInstantUpdates();
    } else {
        await waitMsg.edit(makeWaitingContainer({
            title: 'Tracking Failed',
            description: `Failed to track server **${serverId}**. Ensure the scanner token has access to this guild.`,
            user: msg.author,
            iconKey: 'danger'
        }));
    }
}

async function handleStaffUntrack(msg, args) {
    const ok = await guardOwnerSilent(msg, true, args, '+staffuntrack <server_id>');
    if (!ok) return;

    const serverId = args.trim();
    if (!/^\d{17,20}$/.test(serverId)) {
        return msg.reply(makeWaitingContainer({ title: 'Invalid Server ID', description: 'Please provide a valid server ID.', user: msg.author, iconKey: 'warning' }));
    }

    if (!db.trackedServers[serverId]) {
        return msg.reply(makeWaitingContainer({ title: 'Server Not Tracked', description: `Server **${serverId}** is not in the tracked list.`, user: msg.author, iconKey: 'warning' }));
    }

    delete db.trackedServers[serverId];
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

    await msg.reply(makeWaitingContainer({
        title: 'Server Untracked',
        description: `Server **${serverId}** has been removed from tracking.`,
        user: msg.author,
        iconKey: 'archive_tick'
    }));
}

async function handleStaffList(msg) {
    const ok = await guardOwnerSilent(msg, false, '', '');
    if (!ok) return;

    const tracked = Object.keys(db.trackedServers);
    if (tracked.length === 0) {
        return msg.reply(makeWaitingContainer({ title: 'No Tracked Servers', description: 'No servers are currently being monitored. Use `+stafftrack <server_id>` to start.', user: msg.author, iconKey: 'eye' }));
    }

    const container = new ContainerBuilder();
    container.setAccentColor(resolveColor(THEME.CYAN));
    const files = [];
    const iconThumb = resolveThumb(null, 'iconsax-driver-f050b33fa120-.png', 'srv_track.png', files);

    addBlock(container, makeSection([
        `## ${E('eye')}Tracked Servers Directory`,
        `-# **Total Monitored:** \`${tracked.length}\` servers  •  Live Staff Monitoring`
    ].join('\n'), iconThumb));

    container.addSeparatorComponents(new SeparatorBuilder().setDivider(true));

    const srvLines = tracked.slice(0, 10).map((sid, i) => {
        const data = db.trackedServers[sid];
        const count = data.members ? data.members.length : 0;
        const name = data.guild ? data.guild.name : sid;
        return `**${i + 1}. ${name}**\n-# ID: \`${sid}\`  •  Staff: \`${count}\`  •  Updated: ${data.lastUpdate ? fmtRel(data.lastUpdate) : 'Never'}`;
    });
    if (tracked.length > 10) srvLines.push(`-# +${tracked.length - 10} more servers`);

    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(srvLines.join('\n')));
    container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
    container.addTextDisplayComponents(new TextDisplayBuilder().setContent(`-# Requested by ${msg.author.username}  •  Staff Radar`));

    await msg.reply({
        flags: MessageFlags.IsComponentsV2,
        components: [container],
        files
    });
}

async function handleStaffTrackOff(msg) {
    const ok = await guardOwnerSilent(msg, false, '', '');
    if (!ok) return;
    staffTrackingEnabled = false;
    await msg.reply(makeWaitingContainer({
        title: 'Staff Tracking Paused',
        description: 'Background staff tracking is now **stopped**. Use `+stafftrackon` to resume.',
        user: msg.author,
        iconKey: 'clock'
    }));
}

async function handleStaffTrackOn(msg) {
    const ok = await guardOwnerSilent(msg, false, '', '');
    if (!ok) return;
    staffTrackingEnabled = true;
    await msg.reply(makeWaitingContainer({
        title: 'Staff Tracking Resumed',
        description: 'Background staff monitoring is now **active**.',
        user: msg.author,
        iconKey: 'archive_tick'
    }));
    if (Object.keys(db.trackedServers).length > 0) {
        await updateAllTrackedServers();
    }
}

// ===================== STAFF DISPLAY (CACHED) =====================
function formatStoredStaffList(serverId, page, total, membersOverride = null, modeText = '') {
    const stored = db.trackedServers[serverId];
    if (!stored) return '**Server not being tracked.** Use `+stafftrack <server_id>` to start monitoring.';

    const { guild, lastUpdate } = stored;
    const members = membersOverride || stored.members;
    const totalStaff = members.length;
    const onlineCount = members.filter(m => m.voiceChannel).length;
    const owners = members.filter(m => m.isOwner).length;
    const admins = members.filter(m => !m.isOwner && m.activePerms && m.activePerms.includes('ADMINISTRATOR')).length;
    const mods = totalStaff - owners - admins;

    const staffRolesMap = new Map();
    const staffRoles = (guild.roles || []).filter(r => {
        const rp = BigInt(r.permissions);
        const hasPerm = (rp & (1n << 3n)) !== 0n || STAFF_PERMISSIONS.some(p => {
            const flag = ALL_PERMISSIONS[p];
            return flag && (rp & flag) !== 0n;
        });
        const isGameMode = r.name && r.name.toLowerCase() === 'game mode';
        return hasPerm || isGameMode;
    });
    staffRoles.forEach(r => staffRolesMap.set(r.id, r));

    let lines = [];
    const start = page * 10;
    const end = Math.min(start + 10, members.length);

    for (let i = start; i < end; i++) {
        const m = members[i];
        const statusDot = m.voiceChannel ? `${getCustomEmoji('voice')} ` : '';
        const rankTag   = m.isOwner ? ` ${getCustomEmoji('unlimited')} \`[OWNER]\`` : '';
        const flagTag   = m.isBlacklisted ? ` ${getCustomEmoji('danger')} \`[BLACKLISTED]\`` : '';

        const memberStaffRoles = (m.roles || [])
            .filter(r => staffRolesMap.has(r.id))
            .sort((a, b) => (b.position || 0) - (a.position || 0));

        const rolesDisplay = memberStaffRoles.length > 0
            ? memberStaffRoles.map(r => `\`${r.name}\``).join(', ')
            : '—';

        const joined = m.joinedAt ? fmtRel(m.joinedAt) : '—';
        const voice  = m.voiceChannel ? m.voiceChannel.name : 'Offline';

        const entry = [
            `\`${i + 1}\` ${statusDot} <@${m.user.id}>${rankTag}${flagTag}`,
            `> ${getCustomEmoji('card')} **ID:** \`${m.user.id}\``,
            `> ${getCustomEmoji('role')} **Roles:** ${rolesDisplay}`,
            `> ${getCustomEmoji('clock')} **Joined:** ${joined}`,
            `> ${getCustomEmoji('voice')} **Voice:** ${voice}`
        ].join('\n');
        lines.push(entry);
    }

    const divider = '─'.repeat(46);
    let header = `\`\`\`
Server   ${guild.name || 'Unknown'}
ID       ${guild.id}
Staff    ${totalStaff}  |  Online ${onlineCount}  |  Owners ${owners}  |  Admins ${admins}  |  Mods ${mods}
Updated  ${lastUpdate ? new Date(lastUpdate).toUTCString() : 'Never'}${modeText ? `\nMode     ${modeText}` : ''}
Page     ${page + 1} / ${total}
\`\`\``;
    header += `\n${divider}\n\n`;

    return header + lines.join('\n\n');
}

// ===================== +staff =====================
async function handleStaff(msg, args) {
    if (!hasAccess(msg.member, msg)) return;
    // تأخير أمني لمنع الكشف (Rate Limit / Anti-Bot)
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));

    const serverIdCheck = (args.trim().split(/\s+/).find(p => /^\d{17,20}$/.test(p)) || '');
    const token = await findTokenForGuild(serverIdCheck, msg.author.id);
    if (!token && !args.trim()) return;
    const parts = args.trim().split(/\s+/);
    let serverId = parts.find(p => /^\d{17,20}$/.test(p));
    let force = parts.includes('--force');
    const modsOnly = parts.includes('--mods');
    const noVoiceOnly = parts.includes('--novoice');
    const liteMode = parts.includes('--lite') || (modsOnly && noVoiceOnly);

    if (force && !isOwner(msg.member)) force = false;

    let modeText = '';
    if (liteMode) modeText = '--lite (mod-lite + not in voice)';
    else if (modsOnly) modeText = '--mods (exact lite-mod perms)';
    else if (noVoiceOnly) modeText = '--novoice (not in voice)';

    const applyView = (list) => {
        let v = list;
        if (liteMode) return v.filter(m => isLiteModMember(m) && !m.voiceChannel);
        if (modsOnly) v = v.filter(isLiteModMember);
        if (noVoiceOnly) v = v.filter(m => !m.voiceChannel);
        return v;
    };
    const viewSuffix = modeText ? `  —  ${modeText}` : '';

    if (!serverId) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('Invalid server ID. Please provide a valid server ID.'))] });
        return;
    }

    // FAST PATH: If the bot is already inside this server, resolve directly with 0ms delay!
    if (client.guilds.cache.has(serverId)) {
        const localGuild = client.guilds.cache.get(serverId);
        try {
            await localGuild.members.fetch().catch(() => {});
        } catch {}

        const staffMembers = [];
        for (const m of localGuild.members.cache.values()) {
            if (m.user.bot) continue;
            const isOwner = localGuild.ownerId === m.id;
            const p = m.permissions;
            const powers = [];
            if (isOwner) powers.push('ADMINISTRATOR');
            if (p.has(PermissionFlagsBits.Administrator)) powers.push('ADMINISTRATOR');
            if (p.has(PermissionFlagsBits.ManageGuild)) powers.push('MANAGE_GUILD');
            if (p.has(PermissionFlagsBits.BanMembers)) powers.push('BAN_MEMBERS');
            if (p.has(PermissionFlagsBits.KickMembers)) powers.push('KICK_MEMBERS');
            if (p.has(PermissionFlagsBits.ManageRoles)) powers.push('MANAGE_ROLES');
            if (p.has(PermissionFlagsBits.ManageChannels)) powers.push('MANAGE_CHANNELS');
            if (p.has(PermissionFlagsBits.ManageMessages)) powers.push('MANAGE_MESSAGES');

            if (powers.length > 0) {
                const srvRoles = m.roles.cache.map(r => ({ name: r.name, id: r.id, position: r.position }));
                staffMembers.push({
                    user: { id: m.id, username: m.user.username, discriminator: m.user.discriminator, avatar: m.user.avatar },
                    nick: m.nickname || null,
                    isOwner,
                    roles: srvRoles,
                    highestRole: m.roles.highest?.name || 'Staff',
                    activePerms: Array.from(new Set(powers)),
                    voiceChannel: m.voice?.channel ? { id: m.voice.channel.id, name: m.voice.channel.name } : null
                });
            }
        }

        staffMembers.sort((a, b) => {
            if (a.isOwner) return -1;
            if (b.isOwner) return 1;
            const pA = (a.roles[0]?.position || 0);
            const pB = (b.roles[0]?.position || 0);
            return pB - pA;
        });

        const members = applyView(staffMembers);
        return displayStaffResults(msg, localGuild, members, modeText, viewSuffix, 'Direct Server (Instant)');
    }

    if (!db.trackedServers[serverId]) {
        if (!token) {
            await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('No scanner token found. Please set it in `database.json` or use `+stafftrack` first.'))] });
            return;
        }
        const wait = await msg.reply(makeWaitingContainer({
            title: 'Scanning Staff Directory...',
            description: `Auditing permissions, hierarchy, and active voice status for server \`${serverId}\`...`,
            targetServer: { id: serverId },
            user: msg.author,
            iconKey: 'staff'
        })).catch(() => null);

        try {
            const res = await api.get('/checkadmins', {
                headers: { Authorization: token },
                params: { guildId: serverId },
                timeout: 900000
            });

            const data = res.data;
            if (data.error) {
                const errPayload = await formatAsContainerV2({
                    color: THEME.DANGER,
                    title: 'Scanner Error',
                    content: `Scanner error: \`${data.error}\``
                }, [], msg);
                if (wait) await wait.edit(errPayload).catch(() => msg.reply(errPayload));
                else await msg.reply(errPayload);
                return;
            }

            const guild = data.guild || { name: serverId, id: serverId, roles: [] };
            const members = applyView(data.members || []);

            if (members.length === 0) {
                const note = data.note ? `\n\n${data.note}` : '';
                const filterNote = modeText ? `\n\nNo staff matched this view: \`${modeText}\`.` : '';
                const emptyPayload = await formatAsContainerV2({
                    color: THEME.DARK,
                    title: 'Staff Directory — No Results',
                    content: `No staff members found in **${guild.name || serverId}**.${note}${filterNote}`
                }, [], msg);
                if (wait) await wait.edit(emptyPayload).catch(() => msg.reply(emptyPayload));
                else await msg.reply(emptyPayload);
                return;
            }

            const pp = 6;
            const tp = Math.ceil(members.length / pp) || 1;

            const payload = await buildStaffContainerV2({
                guild,
                members,
                page: 0,
                totalPages: tp,
                requestedBy: msg.author,
                modeText,
                viewSuffix,
                source: 'Live Scanner'
            });

            let targetReply = wait;
            if (wait) {
                await wait.edit(payload).catch(async () => {
                    targetReply = await msg.reply(payload);
                });
            } else {
                targetReply = await msg.reply(payload);
            }

            if (targetReply?.id) {
                staffSessions.set(targetReply.id, {
                    serverId,
                    guild,
                    members,
                    page: 0,
                    totalPages: tp,
                    authorId: msg.author.id,
                    author: msg.author,
                    modeText,
                    viewSuffix,
                    source: 'Live Scanner',
                    expires: Date.now() + PAGINATION_TIMEOUT_MS
                });
            }

        } catch (e) {
            await wait.delete().catch(() => null);
            const errorMsg = e.response?.data?.error || e.message;
            await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setTitle('Scan Error').setDescription(`\`\`\`${errorMsg}\`\`\``)] });
        }
        return;
    }

    let stored = db.trackedServers[serverId];
    let guild = stored.guild || { name: serverId, id: serverId, roles: [] };
    let icon = serverIcon(guild.id, guild.icon);

    if (force && isOwner(msg.member) && token) {
        const wait = await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DARK).setDescription(`Forcing update for server **${serverId}**...`)] });
        const success = await updateTrackedServer(serverId, token);
        await wait.delete().catch(() => null);
        if (!success) {
            await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Failed to update server **${serverId}**. Check logs.`)] });
            return;
        }
        stored = db.trackedServers[serverId];
        if (!stored) {
            await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Server **${serverId}** is no longer tracked.`)] });
            return;
        }
        guild = stored.guild || { name: serverId, id: serverId, roles: [] };
        icon = serverIcon(guild.id, guild.icon);
    }

    const viewMembers = applyView(stored.members || []);

    if (viewMembers.length === 0) {
        const filterNote = modeText ? `\n\nNo staff matched this view: \`${modeText}\`.` : '';
        const e = new EmbedBuilder().setColor(THEME.DARK)
            .setAuthor({ name: guild.name || serverId, iconURL: icon || undefined })
            .setTitle('Staff Directory — No Staff')
            .setDescription(`No staff members found in **${guild.name || serverId}**.\nData from last update: ${fmtRel(stored.lastUpdate)}${filterNote}`)
            .setFooter({ text: `Requested by ${msg.author.username}` })
            .setTimestamp();
        if (icon) e.setThumbnail(icon);
        await msg.reply({ embeds: [e] });
        return;
    }

    const pp = 6;
    const tp = Math.ceil(viewMembers.length / pp) || 1;

    const payload = await buildStaffContainerV2({
        guild,
        members: viewMembers,
        page: 0,
        totalPages: tp,
        requestedBy: msg.author,
        modeText,
        viewSuffix,
        source: 'Cached Data'
    });

    const reply = await msg.reply(payload);
    if (reply?.id) {
        staffSessions.set(reply.id, {
            serverId,
            guild,
            members: viewMembers,
            page: 0,
            totalPages: tp,
            authorId: msg.author.id,
            author: msg.author,
            modeText,
            viewSuffix,
            source: 'Cached Data',
            expires: Date.now() + PAGINATION_TIMEOUT_MS
        });
    }
}

// ===================== formatStaffList (Live Scan) =====================
function formatStaffList(members, guild, page, total, modeText = '') {
    const totalStaff = members.length;
    const onlineCount = members.filter(m => m.voiceChannel).length;
    const owners = members.filter(m => m.isOwner).length;
    const admins = members.filter(m => !m.isOwner && m.activePerms && m.activePerms.includes('ADMINISTRATOR')).length;
    const mods = totalStaff - owners - admins;

    const staffRolesMap = new Map();
    const staffRoles = (guild.roles || []).filter(r => {
        const rp = BigInt(r.permissions);
        const hasPerm = (rp & (1n << 3n)) !== 0n || STAFF_PERMISSIONS.some(p => {
            const flag = ALL_PERMISSIONS[p];
            return flag && (rp & flag) !== 0n;
        });
        const isGameMode = r.name && r.name.toLowerCase() === 'game mode';
        return hasPerm || isGameMode;
    });
    staffRoles.forEach(r => staffRolesMap.set(r.id, r));

    let lines = [];
    const start = page * 10;
    const end = Math.min(start + 10, members.length);

    for (let i = start; i < end; i++) {
        const m = members[i];
        const statusDot = m.voiceChannel ? `${getCustomEmoji('voice')} ` : '';
        const rankTag   = m.isOwner ? ` ${getCustomEmoji('unlimited')} \`[OWNER]\`` : '';
        const flagTag   = m.isBlacklisted ? ` ${getCustomEmoji('danger')} \`[BLACKLISTED]\`` : '';

        const memberStaffRoles = (m.roles || [])
            .filter(r => staffRolesMap.has(r.id))
            .sort((a, b) => (b.position || 0) - (a.position || 0));

        const rolesDisplay = memberStaffRoles.length > 0
            ? memberStaffRoles.map(r => `\`${r.name}\``).join(', ')
            : '—';

        const joined = m.joinedAt ? fmtRel(m.joinedAt) : '—';
        const voice  = m.voiceChannel ? m.voiceChannel.name : 'Offline';

        const entry = [
            `\`${i + 1}\` ${statusDot}<@${m.user.id}>${rankTag}${flagTag}`,
            `> ${getCustomEmoji('card')} **ID:** \`${m.user.id}\``,
            `> ${getCustomEmoji('role')} **Roles:** ${rolesDisplay}`,
            `> ${getCustomEmoji('clock')} **Joined:** ${joined}`,
            `> ${getCustomEmoji('voice')} **Voice:** ${voice}`
        ].join('\n');
        lines.push(entry);
    }

    const divider = '─'.repeat(46);
    let header = `\`\`\`
Server   ${guild.name || 'Unknown'}
ID       ${guild.id}
Staff    ${totalStaff}  |  Online ${onlineCount}  |  Owners ${owners}  |  Admins ${admins}  |  Mods ${mods}${modeText ? `\nMode     ${modeText}` : ''}
Page     ${page + 1} / ${total}
\`\`\``;
    header += `\n${divider}\n\n`;

    return header + lines.join('\n\n');
}

// ===================== PAGINATION HELPER =====================
function navRow(prefix, page, total) {
    const leftEmoji = parseCustomEmoji(getCustomEmoji('arrow_left')) || parseCustomEmoji(getCustomEmoji('arrow_circle_left'));
    const rightEmoji = parseCustomEmoji(getCustomEmoji('arrow_right')) || parseCustomEmoji(getCustomEmoji('arrow_circle_right'));

    const prevBtn = new ButtonBuilder()
        .setCustomId(`prev_${prefix}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === 0);
    if (leftEmoji?.id) {
        prevBtn.setEmoji({ id: leftEmoji.id }).setLabel('Prev');
    } else {
        prevBtn.setLabel('Prev');
    }

    const nextBtn = new ButtonBuilder()
        .setCustomId(`next_${prefix}`)
        .setStyle(ButtonStyle.Secondary)
        .setDisabled(page === total - 1);
    if (rightEmoji?.id) {
        nextBtn.setEmoji({ id: rightEmoji.id }).setLabel('Next');
    } else {
        nextBtn.setLabel('Next');
    }

    return new ActionRowBuilder().addComponents(
        prevBtn,
        new ButtonBuilder().setCustomId(`page_${prefix}`).setLabel(`${page + 1} / ${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        nextBtn
    );
}

function paginate(replyMsg, prefix, items, buildEmbed, authorId, extraComponents) {
    let page = 0;
    const total = items.length;
    if (total <= 1) return;
    const collector = replyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: PAGINATION_TIMEOUT_MS });
    collector.on('collect', async (i) => {
        try { await i.deferUpdate(); } catch {}
        if (authorId && i.user.id !== authorId) return;
        collector.resetTimer();
        if (i.customId === `prev_${prefix}` && page > 0) page--;
        else if (i.customId === `next_${prefix}` && page < total - 1) page++;
        else return;
        const comps = total > 1 ? [navRow(prefix, page, total)] : [];
        if (extraComponents) { const ex = extraComponents(page); if (ex) comps.push(ex); }
        await replyMsg.edit({ embeds: [buildEmbed(page)], components: comps }).catch(() => null);
    });
}

// ===================== +help =====================
const HELP_COMMANDS = {
    user: [
        ['+check <@user|id>', 'Modern dual-container role and clan permission audit'],
        ['+checkrole <@user|id>', 'Check user roles, join date, voice hours, and security perms'],
        ['+clancheck <clan|tag>', 'Audit clan members, voice hours, and clan staff'],
        ['+cr <@user|id>', 'Audit dangerous permissions across shared servers'],
        ['+fallcheck <@user|id>', 'List mutual servers and join dates'],
        ['+track <@user|id>', 'Live voice channel tracking with join link'],
        ['+cv <@user|id>', 'Voice status check plus everyone in the channel'],
        ['+cs <@user|id>', 'Scan dangerous roles and active permissions'],
        ['+userinfo <@user|id>', 'Full user profile and mutual presence audit'],
        ['+ping', 'Check system latency and connection status']
    ],
    server: [
        ['+topma / +tma', 'Top 10 active voice servers (humans only)'],
        ['+tmav1', 'One combined embed — voice counts (no bots) + accounts under 7 days'],
        ['+staff <server_id>', 'Staff directory — flags: --lite, --mods, --novoice, --force'],
        ['+servers', 'List servers linked to the scanner token'],
        ['+serverinfo <id>', 'Detailed server statistics and info'],
        ['+staffcross <src> <t>', 'Compare staff presence between servers'],
        ['+stafftrack <server_id>', 'Start monitoring staff changes in real time'],
        ['+staffuntrack <server_id>', 'Stop monitoring staff changes'],
        ['+stafflist / +tracked', 'List all currently tracked servers'],
        ['+stafftrackon / +stafftrackoff', 'Enable or disable background tracking']
    ],
    role: [
        ['+roletrack <role_id>', 'Track all members holding a specific role'],
        ['+checkid <svr> <role>', 'Detailed role member list and count'],
        ['+perms <svr> <user>', 'Check exact permissions of a member'],
        ['+set <role>', 'Set allowed role for bot usage'],
        ['+bots', 'List managed bots and tokens'],
        ['+addbot <token>', 'Add a new bot for management']
    ]
};

const HELP_CATEGORIES = {
    all: { title: 'Command Center' },
    user: { title: 'User Tools', desc: 'Scanning, tracking and auditing for individual users.' },
    server: { title: 'Server Tools', desc: 'Leaderboards, staff management and server intelligence.' },
    role: { title: 'Role Tools', desc: 'Role tracking, permission checks and bot management.' }
};

const TOTAL_COMMANDS = Object.values(HELP_COMMANDS).reduce((n, c) => n + c.length, 0);

const HELP_LOOKUP = {};
for (const [cat, cmds] of Object.entries(HELP_COMMANDS)) {
    for (const [usage, desc] of cmds) {
        usage.split('/').forEach(part => {
            const base = part.trim().split(/\s+/)[0];
            if (base) HELP_LOOKUP[base.toLowerCase()] = { category: cat, usage, desc };
        });
    }
}
for (const sec of Object.values(HELP_V2_SECTIONS)) {
    for (const [usage, desc] of sec.cmds) {
        const base = usage.split(/\s+/)[0].toLowerCase();
        HELP_LOOKUP[base] = { category: sec.title, usage, desc };
    }
}

function helpAuthor(embed) {
    return embed.setAuthor({ name: 'Kiliua Security Intelligence', iconURL: client.user.displayAvatarURL() })
        .setFooter({ text: '+help <command> for details' })
        .setTimestamp();
}

function buildHelpEmbed(category = 'all') {
    const meta = HELP_CATEGORIES[category] || HELP_CATEGORIES.all;
    const embed = helpAuthor(new EmbedBuilder().setColor(THEME.PRIMARY));

    if (category === 'all') {
        return embed
            .setTitle(`${getCustomEmoji('keyboard')} Command Center`)
            .setDescription(
                `A complete Discord security intelligence and voice monitoring suite.\n` +
                `**${TOTAL_COMMANDS}** commands across **3** functional categories.\n\n` +
                `**${getCustomEmoji('audit')} Quick Start**\n` +
                `\`+cr <@user>\` — instant permission audit\n` +
                `\`+track <@user>\` — live voice tracking & intelligence\n` +
                `\`+syncemojis\` — synchronize custom emojis into your server`
            )
            .addFields([
                { name: `${getCustomEmoji('user')} User Tools`, value: `**${HELP_COMMANDS.user.length}** commands`, inline: true },
                { name: `${getCustomEmoji('server')} Server Tools`, value: `**${HELP_COMMANDS.server.length}** commands`, inline: true },
                { name: `${getCustomEmoji('role')} Role Tools`, value: `**${HELP_COMMANDS.role.length}** commands`, inline: true }
            ]);
    }

    const cmds = HELP_COMMANDS[category] || [];
    const catIcon = category === 'user' ? getCustomEmoji('user') : category === 'server' ? getCustomEmoji('server') : getCustomEmoji('role');
    embed.setTitle(`${catIcon} ${meta.title}`);
    if (meta.desc) embed.setDescription(meta.desc);
    embed.addFields(cmds.map(([cmd, desc]) => ({ name: `\`${cmd}\``, value: desc })));
    return embed;
}

function buildHelpMenu(disabled = false) {
    const optOverview = { label: 'Overview', value: 'all', description: `${TOTAL_COMMANDS} commands in total` };
    const emOverview = parseCustomEmoji(getCustomEmoji('keyboard'));
    if (emOverview) optOverview.emoji = emOverview.id;

    const optUser = { label: 'User Tools', value: 'user', description: `${HELP_COMMANDS.user.length} commands — scan, track, audit users` };
    const emUser = parseCustomEmoji(getCustomEmoji('user'));
    if (emUser) optUser.emoji = emUser.id;

    const optServer = { label: 'Server Tools', value: 'server', description: `${HELP_COMMANDS.server.length} commands — staff and server intel` };
    const emServer = parseCustomEmoji(getCustomEmoji('server'));
    if (emServer) optServer.emoji = emServer.id;

    const optRole = { label: 'Role Tools', value: 'role', description: `${HELP_COMMANDS.role.length} commands — roles and bots` };
    const emRole = parseCustomEmoji(getCustomEmoji('role'));
    if (emRole) optRole.emoji = emRole.id;

    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(disabled ? 'help_category_off' : 'help_category')
            .setPlaceholder(disabled ? 'Session expired — run +help again' : 'Browse categories...')
            .setDisabled(disabled)
            .addOptions([optOverview, optUser, optServer, optRole])
    );
}

async function handleHelp(msg, args) {
    const query = (args || '').trim().toLowerCase();

    if (query) {
        const key = query.startsWith('+') ? query : `+${query}`;
        const hit = HELP_LOOKUP[key];
        if (!hit) {
            const err = makeWaitingContainer({
                title: 'Command Not Found',
                description: `No command found for \`${key}\`.\nUse \`+help\` to browse all available commands.`,
                user: msg.author,
                iconKey: 'warning'
            });
            await msg.reply(err);
            return;
        }

        const container = new ContainerBuilder();
        container.setAccentColor(resolveColor(THEME.CYAN));
        const files = [];
        const botThumb = resolveThumb(userAvatarUrl(client.user), 'iconsax-keyboard-bc60408542b4-.png', 'help_cmd.png', files);

        const lines = [
            `### ${E('keyboard')}Command Guide: ${key}`,
            `-# Category: ${HELP_CATEGORIES[hit.category]?.title || hit.category}`,
            `> **Command:** \`${hit.usage.split(' ')[0]}\``,
            `> **Usage:** \`${hit.usage}\``,
            `> **Description:** ${hit.desc}`
        ].join('\n');

        addBlock(container, makeSection(lines, botThumb));
        container.addSeparatorComponents(new SeparatorBuilder().setDivider(false));
        container.addTextDisplayComponents(new TextDisplayBuilder().setContent(
            `-# ${E('eye')}Requested by ${msg.author.username}  •  Kiliua Security Help`
        ));

        await msg.reply({
            flags: MessageFlags.IsComponentsV2,
            components: [container],
            files
        });
        return;
    }

    const payload = await buildHelpContainerV2({
        category: 'all',
        requestedBy: msg.author
    });

    const reply = await msg.reply(payload);

    helpSessions.set(reply.id, {
        category: 'all',
        authorId: msg.author.id,
        author: msg.author,
        expires: Date.now() + PAGINATION_TIMEOUT_MS
    });
}

// ===================== +ping =====================
async function handlePing(msg) {
    const s = Date.now();
    let cStatus = 'Online', cPing = 0;
    try { const t = Date.now(); await api.get('/ping', { timeout: 5000 }); cPing = Date.now() - t; } catch { cStatus = 'Offline'; }
    const latency = Date.now() - s;
    const mem = (process.memoryUsage().rss / 1048576).toFixed(1);

    const payload = await buildPingContainerV2({
        wsPing: client.ws.ping,
        latency,
        cStatus,
        cPing,
        mem,
        version: process.version,
        requestedBy: msg.author
    });

    await msg.reply(payload);
}

// ===================== +servers =====================
async function handleServers(msg) {
    if (!hasAccess(msg.member, msg)) return;

    const waitMsg = await msg.reply(makeWaitingContainer({
        title: 'Servers Directory',
        description: 'Fetching linked servers across all user accounts in the pool...\nPlease wait.',
        user: msg.author,
        iconKey: 'loader'
    }));

    try {
        const guilds = await poolGetGuilds(msg.author.id);

        if (guilds.length === 0) {
            return waitMsg.edit(makeWaitingContainer({
                title: 'Servers Directory',
                description: 'No servers found for this scanner token.',
                user: msg.author,
                iconKey: 'warning'
            })).catch(() => null);
        }

        const sorted = guilds.sort((a, b) => (b.approximate_member_count || 0) - (a.approximate_member_count || 0));
        const totalPages = Math.ceil(sorted.length / 8) || 1;

        const payload = await buildServersContainerV2({
            guilds: sorted,
            page: 0,
            totalPages,
            requestedBy: msg.author
        });

        const sentMsg = await waitMsg.edit({ ...payload, attachments: [] });

        srvSessions.set(sentMsg.id, {
            guilds: sorted,
            page: 0,
            authorId: msg.author.id,
            author: msg.author,
            expires: Date.now() + PAGINATION_TIMEOUT_MS
        });
    } catch (e) {
        await waitMsg.edit(makeWaitingContainer({
            title: 'Servers Directory',
            description: `Error fetching servers: \`${e.message}\``,
            user: msg.author,
            iconKey: 'danger'
        })).catch(() => null);
    }
}

// ===================== +addbot, +bots, +delbot, +botservers =====================
// These are owner-only, unchanged
async function handleAddBot(msg, args) {
    const ok = await guardOwnerSilent(msg, true, args, '`+addbot <token> [name]`');
    if (!ok) return;
    const parts = args.split(' ');
    const token = parts[0];
    const name = parts.slice(1).join(' ') || 'Unnamed Bot';

    if (!token || token.length < 50) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('Invalid token provided.'))] });
        return;
    }

    const wait = await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription('Validating bot token...'))] });
    try {
        const res = await axios.get('https://discord.com/api/v10/users/@me', {
            headers: { Authorization: `Bot ${token.replace(/^Bot\s+/i, '')}` },
            timeout: 10000
        });
        const botUser = res.data;

        if (db.bots.some(b => b.clientId === botUser.id)) {
            await wait.delete().catch(() => null);
            await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Bot **${botUser.username}** is already in the managed list.`))] });
            return;
        }

        db.bots.push({
            name: name,
            clientId: botUser.id,
            username: botUser.username,
            token: token.replace(/^Bot\s+/i, ''),
            addedAt: new Date().toISOString(),
            addedBy: msg.author.id
        });
        fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

        await wait.delete().catch(() => null);
        const embed = addBanner(new EmbedBuilder().setColor(THEME.SUCCESS)
            .setTitle('Bot Added Successfully')
            .setDescription(
                `**Name:** ${name}\n` +
                `**Username:** ${botUser.username}\n` +
                `**ID:** \`${botUser.id}\`\n` +
                `**Avatar:** [View](https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.png?size=256)`
            )
            .setThumbnail(`https://cdn.discordapp.com/avatars/${botUser.id}/${botUser.avatar}.png?size=256`)
            .setFooter({ text: `Added by ${msg.author.username}` })
            .setTimestamp());
        await msg.reply({ embeds: [embed] });
    } catch (e) {
        await wait.delete().catch(() => null);
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Failed to validate token. Error: \`${e.message}\``))] });
    }
}

async function handleBots(msg) {
    const ok = await guardOwnerSilent(msg, false, '', '');
    if (!ok) return;
    if (!db.bots || db.bots.length === 0) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription('No additional bots are being managed. Use `+addbot <token> [name]` to add one.'))] });
        return;
    }
    const embed = addBanner(new EmbedBuilder().setColor(THEME.PRIMARY)
        .setTitle(`${getCustomEmoji('ai_ac')} Managed Bots`)
        .setDescription(`> ${getCustomEmoji('ai_ac')} **Total Bots:** \`${db.bots.length}\`\n\n` +
            db.bots.map((b, i) =>
                `**${getNumberBadge(i + 1)}** ${b.name}\n` +
                `> ${getCustomEmoji('user')} **User:** \`${b.username}\` • ${getCustomEmoji('card')} **ID:** \`${b.clientId}\`\n` +
                `> ${getCustomEmoji('clock')} **Added:** ${fmtRel(b.addedAt)}\n`
            ).join('\n')
        )
        .setFooter({ text: `Requested by ${msg.author.username}` })
        .setTimestamp());
    await msg.reply({ embeds: [embed] });
}

async function handleDelBot(msg, args) {
    const ok = await guardOwnerSilent(msg, true, args, '`+delbot <index>`');
    if (!ok) return;
    const idx = parseInt(args.trim()) - 1;
    if (isNaN(idx) || idx < 0 || idx >= db.bots.length) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('Invalid index. Use `+bots` to see the list.'))] });
        return;
    }
    const removed = db.bots.splice(idx, 1)[0];
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.SUCCESS).setDescription(`Removed **${removed.name}** (\`${removed.username}\`) from managed bots.`))] });
}

async function handleBotServers(msg, args) {
    const ok = await guardOwnerSilent(msg, true, args, '`+botservers <index>`');
    if (!ok) return;
    const idx = parseInt(args.trim()) - 1;
    if (isNaN(idx) || idx < 0 || idx >= db.bots.length) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('Invalid index. Use `+bots` to see the list.'))] });
        return;
    }
    const bot = db.bots[idx];

    const wait = await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription(`Fetching servers for **${bot.name}**...`))] });
    try {
        const res = await axios.get('https://discord.com/api/v10/users/@me/guilds', {
            headers: { Authorization: `Bot ${bot.token}` },
            timeout: 15000
        });
        const guilds = res.data || [];
        await wait.delete().catch(() => null);

        if (guilds.length === 0) {
            await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription(`**${bot.name}** is not in any servers.`))] });
            return;
        }

        const pp = 10;
        const tp = Math.ceil(guilds.length / pp);
        const buildEmbed = (p) => {
            const pageItems = guilds.slice(p * pp, (p + 1) * pp);
            let d = `## ${bot.name} -- Servers\n\n**Total:** \`${guilds.length}\`\n\n`;
            pageItems.forEach((g, i) => {
                const n = (p * pp) + i + 1;
                d += `**${n}.** ${g.name}\n> ID: \`${g.id}\` - Owner: \`${g.owner ? 'Yes' : 'No'}\`\n\n`;
            });
            return addBanner(new EmbedBuilder().setColor(THEME.CYAN)
                .setAuthor({ name: bot.name })
                .setDescription(d)
                .setFooter({ text: `Page ${p + 1} of ${tp} | Requested by ${msg.author.username}` })
                .setTimestamp());
        };
        const reply = await msg.reply({ embeds: [buildEmbed(0)], components: tp > 1 ? [navRow('bsrv', 0, tp)] : [] });
        paginate(reply, 'bsrv', Array(tp).fill(0), buildEmbed, msg.author.id);
    } catch (e) {
        await wait.delete().catch(() => null);
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Error fetching servers: \`${e.message}\``))] });
    }
}


// ─── PERMISSION UTILS FOR ROLE CHECKER ─────────────────────────
const KEY_STAFF_PERMS = [
    'Administrator',
    'ManageGuild',
    'BanMembers',
    'KickMembers',
    'ManageRoles',
    'ManageChannels',
    'ManageWebhooks',
    'MentionEveryone',
    'ModerateMembers',
    'ViewAuditLog'
];

function extractKeyPermissions(permissions) {
    if (!permissions) return [];
    if (permissions.has(PermissionFlagsBits.Administrator)) return ['Administrator', 'All Permissions Granted'];
    const matched = [];
    for (const p of KEY_STAFF_PERMS) {
        if (PermissionFlagsBits[p] && permissions.has(PermissionFlagsBits[p])) {
            matched.push(p);
        }
    }
    return matched;
}

// ===================== +check / +checkrole / +cr (ROLE CHECKER V2) =====================
// Build a page from the bot's own live data for a guild the bot is in
function buildCurrentGuildPage(g, member) {
    const roles = member.roles.cache.filter(r => r.name !== '@everyone').sort((a, b) => b.position - a.position);
    const vc = member.voice?.channel;
    const online = g.presences?.cache?.filter(p => p.status && p.status !== 'offline').size;
    return {
        serverName: g.name,
        serverId: g.id,
        serverIcon: g.iconURL({ size: 256, extension: 'png', forceStatic: false }),
        ownerId: g.ownerId,
        memberCount: g.memberCount,
        onlineCount: online || null,
        voiceActiveCount: g.voiceStates?.cache?.filter(v => !!v.channelId).size ?? 0,
        boostTier: g.premiumTier || 0,
        boostCount: g.premiumSubscriptionCount || 0,
        vanity: g.vanityURLCode || null,
        isOwner: g.ownerId === member.id,
        nick: member.nickname || null,
        roles: roles.map(r => ({ name: r.name, id: r.id, position: r.position })),
        highestRole: member.roles.highest?.name !== '@everyone' ? member.roles.highest?.name : 'Member',
        powers: extractKeyPermissions(member.permissions),
        joinedTs: member.joinedTimestamp ? Math.floor(member.joinedTimestamp / 1000) : null,
        voiceStatus: vc ? vc.name : 'Offline',
        voiceHours: getUserVoiceHours(member.id),
        source: 'Current Server'
    };
}

// Build a page from checker.js (/check) result — real info for servers the bot is NOT in
function buildScannerPage(s, targetUserId) {
    const powers = Object.entries(s.permissions || {})
        .filter(([k, v]) => v === true && !IGNORED_PERMISSIONS.includes(k.toUpperCase()))
        .map(([k]) => k);
    const allRoles = (s.allRoles && s.allRoles.length ? s.allRoles : (s.roles || []).filter(r => r.id !== 'owner'))
        .slice().sort((a, b) => (b.position || 0) - (a.position || 0));
    return {
        serverName: s.serverName,
        serverId: s.serverId,
        serverIcon: s.serverIconHash ? serverIcon(s.serverId, s.serverIconHash, 256) : null,
        ownerId: s.ownerId || (s.isOwner ? targetUserId : null),
        memberCount: s.memberCount ?? null,
        onlineCount: s.onlineCount ?? null,
        boostTier: s.boostTier || 0,
        boostCount: s.boostCount || 0,
        vanity: s.vanity || null,
        isOwner: !!s.isOwner,
        nick: s.nick || null,
        roles: allRoles.map(r => ({ name: r.name, id: r.id, position: r.position })),
        highestRole: allRoles[0]?.name || (s.isOwner ? 'Owner' : 'Member'),
        powers: s.isOwner ? ['ADMINISTRATOR'] : powers,
        joinedTs: s.joinedAt ? Math.floor(new Date(s.joinedAt).getTime() / 1000) : null,
        voiceStatus: s.voiceChannel ? (s.voiceChannel.channelName || s.voiceChannel.name) : 'Offline',
        voiceHours: getUserVoiceHours(targetUserId),
        source: 'Live Scanner'
    };
}

async function handleRoleCheckCmd(msg, args) {
    if (!hasAccess(msg.member, msg)) return;

    let targetUserId = (args || '').replace(/[<@!>]/g, '').trim();
    if (!targetUserId) targetUserId = msg.author.id;
    if (!/^\d{17,20}$/.test(targetUserId)) {
        return msg.reply({
            color: THEME.DANGER,
            title: 'Invalid Target',
            content: 'Please provide a valid User ID or @mention (e.g. `+check @user`), or run `+check` to audit yourself.'
        });
    }

    if (await denyProtectedUser(msg, targetUserId)) return;

    const targetUser = await client.users.fetch(targetUserId, { force: true }).catch(() => null);
    if (!targetUser) {
        return msg.reply({
            color: THEME.DANGER,
            title: 'User Not Found',
            content: `Could not find Discord user with ID \`${targetUserId}\`.`
        });
    }

    msg.channel.sendTyping?.().catch(() => {});

    const waitMsg = await msg.reply(makeWaitingContainer({
        title: 'Scanning Member Roles & Permissions...',
        description: `Deep-scanning mutual servers, key permissions, and staff roles for <@${targetUserId}> (\`${targetUserId}\`)...`,
        targetUser,
        user: msg.author,
        iconKey: 'loader'
    })).catch(() => null);

    const pagesById = new Map();

    // 1. My own server (the server the command was used in) — bot's live data
    if (msg.guild) {
        const member = await msg.guild.members.fetch(targetUserId).catch(() => null);
        if (member) pagesById.set(msg.guild.id, buildCurrentGuildPage(msg.guild, member));
    }

    // 2. Other servers the bot itself is in
    for (const g of client.guilds.cache.values()) {
        if (pagesById.has(g.id)) continue;
        const member = g.members.cache.get(targetUserId);
        if (member) pagesById.set(g.id, buildCurrentGuildPage(g, member));
    }

    // 3. Live multi-token pool scanner — real info + real icons across all accounts in parallel
    try {
        const poolResults = await poolCheckUser(targetUserId, targetUser.tag, true, msg.author.id);
        for (const s of poolResults) {
            if (pagesById.has(s.serverId)) {
                // Enrich bot data with scanner-only fields
                const p = pagesById.get(s.serverId);
                if (!p.onlineCount && s.onlineCount) p.onlineCount = s.onlineCount;
                continue;
            }
            pagesById.set(s.serverId, buildScannerPage(s, targetUserId));
        }
    } catch (err) {
        console.warn('[CHECK] pool scan failed:', err.message);
    }

    // 4. Tracked servers database (fallback only)
    for (const [sid, data] of Object.entries(db.trackedServers || {})) {
        if (pagesById.has(sid)) continue;
        const m = (data.members || []).find(x => x.user && x.user.id === targetUserId);
        if (!m) continue;
        const srvRoles = (m.roles || []).map(r => ({ name: r.name, id: r.id, position: r.position }));
        pagesById.set(sid, {
            serverName: data.guild?.name || sid,
            serverId: sid,
            serverIcon: data.guild?.icon ? serverIcon(sid, data.guild.icon, 256) : null,
            ownerId: data.guild?.owner_id || null,
            memberCount: data.guild?.approximate_member_count ?? null,
            onlineCount: data.guild?.approximate_presence_count ?? null,
            isOwner: !!m.isOwner,
            roles: srvRoles,
            highestRole: srvRoles[0]?.name || 'Member',
            powers: m.activePerms || [],
            joinedTs: m.joinedAt ? Math.floor(new Date(m.joinedAt).getTime() / 1000) : null,
            voiceStatus: m.voiceChannel ? m.voiceChannel.name : 'Offline',
            voiceHours: getUserVoiceHours(targetUserId),
            source: 'Tracked Database'
        });
    }

    // Filter to ONLY include servers where the target user has staff powers/permissions or is owner!
    const serverPages = [...pagesById.values()]
        .filter(page => {
            const hasPowers = Array.isArray(page.powers) && page.powers.length > 0;
            const isOwner = !!page.isOwner;
            return hasPowers || isOwner;
        })
        .sort((a, b) => {
            if (msg.guild) {
                if (a.serverId === msg.guild.id) return -1;
                if (b.serverId === msg.guild.id) return 1;
            }
            const sa = (a.isOwner ? 2 : 0) + ((a.powers || []).length ? 1 : 0);
            const sb = (b.isOwner ? 2 : 0) + ((b.powers || []).length ? 1 : 0);
            return sb - sa;
        });

    if (serverPages.length === 0) {
        const noPermsPayload = await formatAsContainerV2({
            color: THEME.PRIMARY,
            title: 'No Staff Permissions',
            content: `${E('clean')}**${targetUser.username}** (\`${targetUser.id}\`) has no administrative or staff permissions in any scanned server.`
        }, [], msg);
        if (waitMsg) await waitMsg.edit(noPermsPayload).catch(() => msg.reply(noPermsPayload));
        else await msg.reply(noPermsPayload);
        return;
    }

    const payload = await buildRoleCheckContainerV2({
        targetUser,
        pageData: serverPages[0],
        page: 0,
        totalPages: serverPages.length,
        checkedBy: msg.author
    });

    let targetMsg = waitMsg;
    if (waitMsg) {
        await waitMsg.edit(payload).catch(async () => {
            targetMsg = await msg.reply(payload);
        });
    } else {
        targetMsg = await msg.reply(payload);
    }

    if (targetMsg?.id) {
        crSessions.set(targetMsg.id, {
            pages: serverPages,
            page: 0,
            targetUser,
            authorId: msg.author.id,
            author: msg.author,
            expires: Date.now() + PAGINATION_TIMEOUT_MS
        });
    }
}

const handleCr = handleRoleCheckCmd;

// ===================== +clancheck (CLAN CHECKER V2) =====================
async function handleClanCheckCmd(msg, args) {
    if (!hasAccess(msg.member, msg)) return;
    if (!msg.guild) {
        return msg.reply({
            color: THEME.DANGER,
            title: 'Server Command Only',
            content: 'The `+clancheck` command can only be executed within a Discord server.'
        });
    }

    const query = (args || '').trim();
    let clanRole = null;
    let clanTag = '';
    let clanName = '';
    let clanMembers = [];

    if (query) {
        const cleanQuery = query.replace(/[<@&>]/g, '').toLowerCase();
        clanRole = msg.guild.roles.cache.find(r => r.id === cleanQuery || r.name.toLowerCase() === cleanQuery || r.name.toLowerCase().includes(cleanQuery));
        if (clanRole) {
            clanName = clanRole.name;
            clanTag = clanRole.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || 'CLAN';
            clanMembers = Array.from(clanRole.members.values());
        } else {
            clanName = query;
            clanTag = query.toUpperCase();
            clanMembers = Array.from(msg.guild.members.cache.filter(m => {
                const dn = m.displayName.toLowerCase();
                return dn.includes(`[${cleanQuery}]`) || dn.includes(cleanQuery);
            }).values());
        }
    } else {
        const authorRoles = msg.member.roles.cache.filter(r => r.name !== '@everyone').sort((a,b) => b.position - a.position);
        clanRole = authorRoles.find(r => /clan|team|squad|guild|فريق|كلان/i.test(r.name));
        if (clanRole) {
            clanName = clanRole.name;
            clanTag = clanRole.name.replace(/[^a-zA-Z0-9]/g, '').toUpperCase().slice(0, 5) || 'CLAN';
            clanMembers = Array.from(clanRole.members.values());
        } else {
            const match = msg.member.displayName.match(/\[(.*?)\]/);
            if (match) {
                clanTag = match[1].toUpperCase();
                clanName = `Clan [${clanTag}]`;
                clanMembers = Array.from(msg.guild.members.cache.filter(m => m.displayName.includes(`[${match[1]}]`)).values());
            }
        }
    }

    if (!clanMembers || clanMembers.length === 0) {
        return msg.reply({
            color: THEME.DANGER,
            title: 'No Clan Detected',
            content: `Could not detect or find clan data for \`${query || msg.member.displayName}\`. Try specifying a clan role or tag: \`+clancheck <role|tag>\``
        });
    }

    const voiceMembers = clanMembers.filter(m => !!m.voice?.channelId);
    let totalSec = 0;
    const topMembers = clanMembers.map(m => {
        const hrsStr = getUserVoiceHours(m.id);
        const hrsNum = parseFloat(hrsStr) || 0;
        totalSec += hrsNum * 3600;
        return {
            id: m.id,
            user: m.user,
            voiceHours: hrsStr,
            highestRole: m.roles.highest,
            hasStaff: m.permissions.has(PermissionFlagsBits.Administrator) || m.permissions.has(PermissionFlagsBits.ManageGuild)
        };
    }).sort((a, b) => (parseFloat(b.voiceHours) || 0) - (parseFloat(a.voiceHours) || 0));

    const staffCount = topMembers.filter(m => m.hasStaff).length;
    const leader = topMembers.length > 0 ? topMembers[0].user : msg.author;
    const totalHours = (totalSec / 3600).toFixed(1) + ' hrs';

    const payload = await buildClanCheckContainerV2({
        guild: msg.guild,
        clanData: {
            name: clanName || 'Active Clan',
            tag: clanTag || 'CLAN',
            memberCount: clanMembers.length,
            voiceCount: voiceMembers.length,
            totalHours,
            staffCount,
            leader,
            topMembers
        },
        checkedBy: msg.author
    });

    const reply = await msg.reply(payload);
    const collector = reply.createMessageComponentCollector({
        componentType: ComponentType.Button,
        time: PAGINATION_TIMEOUT_MS
    });
    collector.on('collect', async (i) => {
        if (i.user.id !== msg.author.id) return i.reply({ content: 'Not authorized.', ephemeral: true });
        collector.resetTimer();
        await i.deferUpdate();
        await handleClanCheckCmd(msg, args);
    });
}



// ===================== +fallcheck (Container V2 with User Profile) =====================
async function handleFallcheck(msg, args) {
    if (!hasAccess(msg.member, msg)) return;
    const token = await guard(msg, true, args, '+fallcheck <@user|id>');
    const userId = (args || '').replace(/[<@!>]/g, '').trim();
    if (!/^\d{17,20}$/.test(userId)) {
        return msg.reply(makeWaitingContainer({
            title: 'Membership History',
            description: 'Invalid user ID. Usage: `+fallcheck <@user|id>`',
            user: msg.author,
            iconKey: 'warning'
        }));
    }
    if (await denyProtectedUser(msg, userId)) return;

    let user = null;
    try { user = await client.users.fetch(userId); } catch {}

    const waitMsg = await msg.reply(makeWaitingContainer({
        title: 'Auditing Membership History...',
        description: `Scanning shared servers and membership records for **${user ? user.tag : userId}**...`,
        targetUser: user || { id: userId },
        user: msg.author,
        iconKey: 'loader'
    }));

    let results = [];
    const serverSet = new Set();

    // 1. FAST PATH: Check mutual servers where the bot is present directly (0ms latency!)
    for (const guild of client.guilds.cache.values()) {
        const member = guild.members.cache.get(userId) || await guild.members.fetch(userId).catch(() => null);
        if (member) {
            serverSet.add(guild.id);
            const rolesList = member.roles.cache.map(r => ({ id: r.id, name: r.name, position: r.position }));
            const hasPowers = member.permissions.has(PermissionFlagsBits.Administrator) ||
                              member.permissions.has(PermissionFlagsBits.ManageGuild) ||
                              member.permissions.has(PermissionFlagsBits.BanMembers);
            results.push({
                serverName: guild.name,
                serverId: guild.id,
                serverIconHash: guild.icon,
                joinedAt: member.joinedAt ? member.joinedAt.toISOString() : null,
                allRoles: rolesList,
                isOwner: guild.ownerId === userId,
                hasPowers,
                source: 'Direct Server'
            });
        }
    }

    // 2. TOKEN POOL: Query all tokens in parallel for servers the bot is not in
    try {
        const poolResults = await poolCheckUser(userId, user?.tag || userId, true, msg.author.id);
        for (const r of poolResults) {
            if (!serverSet.has(r.serverId)) {
                serverSet.add(r.serverId);
                results.push({
                    serverName: r.serverName,
                    serverId: r.serverId,
                    serverIconHash: r.serverIconHash,
                    joinedAt: r.joinedAt,
                    allRoles: r.allRoles || [],
                    isOwner: !!r.isOwner,
                    hasPowers: !!r.hasPowers,
                    source: 'User Token Pool'
                });
            }
        }
    } catch (e) {
        console.warn('[FALLCHECK POOL API]', e.message);
    }

    // 2. Merge with db.trackedServers
    for (const [sid, data] of Object.entries(db.trackedServers || {})) {
        if (serverSet.has(sid)) continue;
        const member = (data.members || []).find(m => m.user && String(m.user.id) === String(userId));
        if (member) {
            serverSet.add(sid);
            results.push({
                serverName: data.guild?.name || sid,
                serverId: sid,
                serverIconHash: data.guild?.icon,
                joinedAt: member.joined_at || member.joinedAt,
                allRoles: (member.roles || []).map(r => ({ name: r.name })),
                isOwner: !!member.isOwner,
                hasPowers: !!(member.activePerms && member.activePerms.length > 0)
            });
        }
    }

    const payload = await buildFallcheckContainerV2({
        user,
        userId,
        results,
        page: 0,
        requestedBy: msg.author
    });

    const sentMsg = await waitMsg.edit({ ...payload, attachments: [] }).catch(() => null);
    if (sentMsg && results.length > 1) {
        fallSessions.set(sentMsg.id, {
            user,
            userId,
            results,
            page: 0,
            authorId: msg.author.id,
            author: msg.author,
            expires: Date.now() + PAGINATION_TIMEOUT_MS
        });
    }
}

// ===================== +staffrole (Cross-Server Role Audit) =====================
async function handleStaffRole(msg, args) {
    if (!hasAccess(msg.member, msg)) return;
    const query = (args || '').trim();
    if (!query) {
        return msg.reply(makeWaitingContainer({
            title: 'Staff Role Search',
            description: 'Usage: `+staffrole <role_name>` (e.g. `+staffrole Admin`, `+staffrole Mod`)',
            user: msg.author,
            iconKey: 'warning'
        }));
    }

    const waitMsg = await msg.reply(makeWaitingContainer({
        title: 'Auditing Staff Roles...',
        description: `Searching for members holding role matching "${query}" across monitored servers...`,
        user: msg.author,
        iconKey: 'crown'
    }));

    const results = [];
    const q = query.toLowerCase();

    // 1. Search in db.trackedServers
    for (const [sid, sdata] of Object.entries(db.trackedServers || {})) {
        const srvMembers = sdata.members || [];
        const matchingMembers = [];
        let matchedRoleName = query;

        for (const m of srvMembers) {
            const hasRole = (m.roles || []).some(r => {
                if (r.name && r.name.toLowerCase().includes(q)) {
                    matchedRoleName = r.name;
                    return true;
                }
                if (r.id === query) {
                    matchedRoleName = r.name || query;
                    return true;
                }
                return false;
            });

            if (hasRole) {
                matchingMembers.push({
                    id: m.user?.id || m.id,
                    username: m.user?.username || m.username,
                    tag: m.user?.username || m.tag,
                    voiceChannel: m.voiceChannel,
                    isOwner: m.isOwner
                });
            }
        }

        if (matchingMembers.length > 0) {
            results.push({
                serverId: sid,
                serverName: sdata.guild?.name || sid,
                serverIconHash: sdata.guild?.icon,
                roleName: matchedRoleName,
                members: matchingMembers
            });
        }
    }

    // 2. Search in client.guilds.cache
    for (const [gid, guild] of client.guilds.cache) {
        if (results.some(r => r.serverId === gid)) continue;
        const matchedRoles = guild.roles.cache.filter(r => r.name.toLowerCase().includes(q) || r.id === query);
        if (matchedRoles.size === 0) continue;

        const roleIds = new Set(matchedRoles.map(r => r.id));
        const matchedRoleName = matchedRoles.first().name;
        const matchingMembers = [];

        for (const [mid, member] of guild.members.cache) {
            if (member.user.bot) continue;
            if (member.roles.cache.some(r => roleIds.has(r.id))) {
                matchingMembers.push({
                    id: mid,
                    username: member.user.username,
                    tag: member.user.tag,
                    voiceChannel: member.voice.channel ? { channelName: member.voice.channel.name } : null,
                    isOwner: guild.ownerId === mid
                });
            }
        }

        if (matchingMembers.length > 0) {
            results.push({
                serverId: gid,
                serverName: guild.name,
                serverIconHash: guild.icon,
                roleName: matchedRoleName,
                members: matchingMembers
            });
        }
    }

    results.sort((a, b) => b.members.length - a.members.length);

    const payload = await buildStaffRoleContainerV2({
        roleQuery: query,
        results,
        page: 0,
        requestedBy: msg.author
    });

    const sentMsg = await waitMsg.edit({ ...payload, attachments: [] }).catch(() => null);
    if (sentMsg && results.length > 0) {
        sroleSessions.set(sentMsg.id, {
            roleQuery: query,
            results,
            page: 0,
            authorId: msg.author.id,
            author: msg.author,
            expires: Date.now() + PAGINATION_TIMEOUT_MS
        });
    }
}

// ===================== Other commands (track, roletrack, checkid, cs, cv, perms, topma, serverinfo, userinfo, botstats) =====================
// These remain essentially the same as in earlier versions; we keep them for completeness.
// I'll include them with minimal changes (they still use token where needed, but could be adapted to DB later).

async function handleTrack(msg, args) {
    if (!hasAccess(msg.member, msg)) return;
    if (msg.channel.type === ChannelType.DM) return;
    const userId = args.replace(/[<@!>]/g, '').trim();
    if (!/^\d{17,20}$/.test(userId)) {
        return msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`${getCustomEmoji('danger')} Usage: \`+track <@user|user_id>\``)] });
    }
    if (await denyProtectedUser(msg, userId)) return;

    let targetUser = null;
    try { targetUser = await client.users.fetch(userId); } catch {}
    const userAvatar = targetUser?.displayAvatarURL({ size: 512, extension: 'png' }) || null;

    const token = config.checker_user_token || config.fallback_user_token;

    // Check client guild voice states
    const localMatches = [];
    for (const [gid, guild] of client.guilds.cache) {
        const vs = guild.voiceStates.cache.get(userId);
        if (vs && vs.channel) {
            const chMembers = [...vs.channel.members.values()];
            localMatches.push({
                serverName: guild.name,
                serverId: guild.id,
                serverIconHash: guild.icon,
                channelName: vs.channel.name,
                channelId: vs.channel.id,
                voiceMembers: chMembers.map(m => ({ id: m.id, tag: m.user.tag, avatar: m.user.displayAvatarURL({ size: 512, extension: 'png' }) }))
            });
        }
    }

    if (!token && localMatches.length > 0) {
        const r = localMatches[0];
        const sIcon = serverIcon(r.serverId, r.serverIconHash, 512) || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const images = [];
        if (sIcon) images.push(sIcon);
        if (userAvatar) images.push(userAvatar);
        for (const m of r.voiceMembers) {
            if (m.id !== userId && m.avatar && images.length < 10) images.push(m.avatar);
        }

        let desc = `> ${getCustomEmoji('server')} **Server:** **${r.serverName}** (\`${r.serverId}\`)\n` +
                   `> ${getCustomEmoji('voice')} **Voice Channel:** **${r.channelName}** (\`${r.channelId}\`)\n` +
                   `> ${getCustomEmoji('user')} **Active in VC:** **${r.voiceMembers.length}** member${r.voiceMembers.length === 1 ? '' : 's'}\n\n` +
                   `**Members in Voice Channel:**\n` +
                   r.voiceMembers.slice(0, 15).map(m => `- <@${m.id}> (\`${m.tag || m.id}\`)`).join('\n');

        const embed = new EmbedBuilder()
            .setColor(THEME.SUCCESS)
            .setAuthor({ name: 'Live Voice Channel Tracking', iconURL: userAvatar || client.user.displayAvatarURL() })
            .setTitle(`${getCustomEmoji('voice')} Found in Voice: ${targetUser ? targetUser.tag : userId}`)
            .setDescription(desc)
            .setFooter({ text: `Requested by ${msg.author.username}` })
            .setTimestamp();

        const components = [];
        components.push(new ActionRowBuilder().addComponents(
            new ButtonBuilder().setLabel('Join Voice Channel').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${r.serverId}/${r.channelId}`)
        ));

        return msg.reply({ embeds: [embed], components, customImages: images, targetUser, targetServer: { serverId: r.serverId, serverIconHash: r.serverIconHash, name: r.serverName } });
    }

    if (!token) {
        return msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`${getCustomEmoji('danger')} User <@${userId}> is not in any shared voice channels and scanner token is missing.`)] });
    }

    const wait = await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DARK).setDescription(`${getCustomEmoji('loader')} Tracking user \`${userId}\` across voice channels...`)] });
    try {
        const res = await api.get('/voice-states', { headers: { Authorization: token }, params: { userId }, timeout: 60000 });
        if (res.data.error) {
            return wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`${getCustomEmoji('danger')} Scanner error: \`${res.data.error}\``)] });
        }
        const results = res.data.results || [];
        if (results.length === 0 && localMatches.length === 0) {
            return wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DARK).setDescription(`${getCustomEmoji('voice')} User **${targetUser ? targetUser.tag : userId}** is not currently in any active voice channels.`)] });
        }

        const allResults = results.length > 0 ? results : localMatches;
        const r = allResults[0];
        const sIcon = serverIcon(r.serverId, r.serverIconHash, 512);

        const images = [];
        if (sIcon) images.push(sIcon);
        if (userAvatar) images.push(userAvatar);

        // Fetch channel members avatars
        const memberList = [];
        for (const m of (r.voiceMembers || []).slice(0, 10)) {
            try {
                const u = await client.users.fetch(m.id).catch(() => null);
                if (u) {
                    memberList.push({ id: u.id, tag: u.tag });
                    if (u.id !== userId && images.length < 10) {
                        images.push(u.displayAvatarURL({ size: 512, extension: 'png' }));
                    }
                } else {
                    memberList.push({ id: m.id, tag: m.id });
                }
            } catch {
                memberList.push({ id: m.id, tag: m.id });
            }
        }

        let desc = `> ${getCustomEmoji('server')} **Server:** **${r.serverName || 'Unknown Server'}** (\`${r.serverId}\`)\n` +
                   `> ${getCustomEmoji('voice')} **Voice Channel:** **${r.currentChannel?.name || r.channelName || 'Voice Channel'}**\n` +
                   `> ${getCustomEmoji('user')} **Active in VC:** **${(r.voiceMembers || []).length}** member${(r.voiceMembers || []).length === 1 ? '' : 's'}\n\n` +
                   `**Members in Voice Channel:**\n` +
                   memberList.slice(0, 15).map(m => `- <@${m.id}> (\`${m.tag}\`)`).join('\n');

        const embed = new EmbedBuilder()
            .setColor(THEME.SUCCESS)
            .setAuthor({ name: 'Live Voice Channel Tracking', iconURL: userAvatar || client.user.displayAvatarURL() })
            .setTitle(`${getCustomEmoji('voice')} Active Voice Tracking: ${targetUser ? targetUser.tag : userId}`)
            .setDescription(desc)
            .setFooter({ text: `Requested by ${msg.author.username}` })
            .setTimestamp();

        const components = [];
        const chId = r.currentChannel?.id || r.channelId;
        if (chId && r.serverId) {
            components.push(new ActionRowBuilder().addComponents(
                new ButtonBuilder().setLabel('Join Voice Channel').setStyle(ButtonStyle.Link).setURL(`https://discord.com/channels/${r.serverId}/${chId}`)
            ));
        }

        await wait.delete().catch(() => null);
        await msg.reply({ embeds: [embed], components, customImages: images, targetUser, targetServer: { serverId: r.serverId, serverIconHash: r.serverIconHash, name: r.serverName } });
    } catch (e) {
        await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`${getCustomEmoji('danger')} Error: \`${e.message}\``)] });
    }
}
async function handleRoleTrack(msg, args) {
    if (!hasAccess(msg.member, msg)) return;
    const parts = args.trim().split(/\s+/);
    const roleId = parts[0]?.replace(/[<@&>]/g, '').trim();
    const serverId = parts[1]?.replace(/[<@!>]/g, '').trim();
    if (!roleId || !/^\d{17,20}$/.test(roleId)) {
        return msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Usage: `+roletrack <role_id> [server_id]`')] });
    }
    const token = await guard(msg, true, args, '`+roletrack <role_id>`');
    if (!token) return;

    const wait = await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DARK).setDescription('Tracking members with role ID: `' + roleId + '`...')] });
    try {
        const res = await api.get('/roletrack', { headers: { Authorization: token }, params: { roleId, serverId }, timeout: 60000 });
        const members = res.data.members || [];
        await wait.delete().catch(() => null);
        if (members.length === 0) {
            return msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('No members found with this role.')] });
        }
        const embed = new EmbedBuilder()
            .setColor(THEME.PRIMARY)
            .setAuthor({ name: 'Role Track Results', iconURL: client.user.displayAvatarURL() })
            .setDescription(
                `> ${getCustomEmoji('role')} **Role ID:** \`${roleId}\`\n` +
                (serverId ? `> ${getCustomEmoji('server')} **Server:** \`${serverId}\`\n` : '') +
                `> ${getCustomEmoji('ai_users')} **Members Found:** **${members.length}**\n\n` +
                members.slice(0, 20).map(m => `- ${getCustomEmoji('user')} <@${m.id}> (\`${m.id}\`)`).join('\n')
            )
            .setTimestamp();
        await msg.reply({ embeds: [embed] });
    } catch (e) {
        await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`${getCustomEmoji('danger')} Error: \`${e.message}\``)] }).catch(() => null);
    }
}

async function handleCheckId(msg, args) {
    if (!hasAccess(msg.member, msg)) return;
    const parts = args.trim().split(/\s+/);
    const serverId = parts[0];
    const roleId = parts[1]?.replace(/[<@&>]/g, '');
    if (!serverId || !roleId || !/^\d{17,20}$/.test(serverId) || !/^\d{17,20}$/.test(roleId)) {
        return msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Usage: `+checkid <server_id> <role_id>`')] });
    }
    const token = await guard(msg, true, args, '`+checkid <server_id> <role_id>`');
    if (!token) return;

    const wait = await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DARK).setDescription(`${getCustomEmoji('loader')} Checking role members in server...`)] });
    try {
        const res = await api.get('/checkid', { headers: { Authorization: token }, params: { serverId, roleId }, timeout: 60000 });
        const data = res.data;
        await wait.delete().catch(() => null);
        const embed = new EmbedBuilder()
            .setColor(THEME.PRIMARY)
            .setAuthor({ name: 'Role Member Check', iconURL: client.user.displayAvatarURL() })
            .setDescription(
                `> ${getCustomEmoji('server')} **Server ID:** \`${serverId}\`\n` +
                `> ${getCustomEmoji('role')} **Role ID:** \`${roleId}\`\n` +
                `> ${getCustomEmoji('ai_users')} **Total Members:** **${data.count || 0}**`
            )
            .setTimestamp();
        await msg.reply({ embeds: [embed] });
    } catch (e) {
        await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`${getCustomEmoji('danger')} Error: \`${e.message}\``)] }).catch(() => null);
    }
}

async function handlePerms(msg, args) {
    if (!hasAccess(msg.member, msg)) return;
    const parts = args.trim().split(/\s+/);
    const serverId = parts[0];
    const userId = parts[1]?.replace(/[<@!>]/g, '');
    if (!serverId || !userId || !/^\d{17,20}$/.test(serverId) || !/^\d{17,20}$/.test(userId)) {
        return msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Usage: `+perms <server_id> <@user|id>`')] });
    }
    const token = await guard(msg, true, args, '`+perms <server_id> <@user|id>`');
    if (!token) return;

    const wait = await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DARK).setDescription(`${getCustomEmoji('loader')} Checking exact member permissions...`)] });
    try {
        const res = await api.get('/perms', { headers: { Authorization: token }, params: { serverId, userId }, timeout: 60000 });
        const perms = res.data.permissions || [];
        await wait.delete().catch(() => null);
        const embed = new EmbedBuilder()
            .setColor(THEME.PRIMARY)
            .setAuthor({ name: 'Exact Member Permissions', iconURL: client.user.displayAvatarURL() })
            .setDescription(
                `> ${getCustomEmoji('user')} **User:** <@${userId}>\n` +
                `> ${getCustomEmoji('server')} **Server ID:** \`${serverId}\`\n` +
                `> ${getCustomEmoji('lock')} **Permissions Count:** \`${perms.length}\`\n\n` +
                `\`\`\`diff\n` + (perms.map(p => '+ ' + p).join('\n') || '+ None') + `\n\`\`\``
            )
            .setTimestamp();
        await msg.reply({ embeds: [embed] });
    } catch (e) {
        await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`${getCustomEmoji('danger')} Error: \`${e.message}\``)] }).catch(() => null);
    }
}

// ===================== +cs =====================
async function handleCs(msg, args) {
    if (!hasAccess(msg.member, msg)) return;
    const token = await guard(msg, true, args, '`+cs <@user|id>`');
    if (!token) return;
    const userId = args.replace(/[<@!>]/g, '').trim();
    if (!/^\d{17,20}$/.test(userId)) {
        return msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('Invalid user ID.'))] });
    }
    if (await denyProtectedUser(msg, userId)) return;
    let user = null;
    try { user = await client.users.fetch(userId); } catch {}

    const wait = await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription(`${getCustomEmoji('loader')} Scanning dangerous roles and permissions for **${user ? user.tag : userId}** across all pool tokens...\nThis may take a while.`))] });
    try {
        const results = await poolGetCs(userId, msg.author.id);
        await wait.delete().catch(() => null);

        if (results.length === 0) {
            const e = new EmbedBuilder().setColor(THEME.SUCCESS)
                .setAuthor({ name: `${getCustomEmoji('archive_tick')} Audit Complete - Clean`, iconURL: user ? user.displayAvatarURL() : client.user.displayAvatarURL() })
                .setDescription(`${getCustomEmoji('archive_tick')} **${user ? user.tag : userId}** has no dangerous permissions in any shared server.`)
                .setTimestamp();
            return msg.reply({ embeds: [e] });
        }

        const buildEmbed = (p) => {
            const s = results[p];
            let d = '';
            if (s.isOwner) d += `\`\`\`diff\n+ SERVER OWNER\n\`\`\`\n`;
            for (const role of s.roles || []) {
                if (role.id === 'owner') continue;
                const powers = role.powers || [];
                d += `${getCustomEmoji('role')} **${role.name}**\n`;
                d += '```diff\n' + (powers.map(p => '+ - ' + getPermDisplay(p)).join('\n') || '+ - None') + '\n```';
            }
            if (d.length > 3900) d = d.slice(0, 3900) + '\n...';
            const icon = serverIcon(s.serverId, s.serverIconHash);
            const e = new EmbedBuilder().setColor(THEME.CYAN)
                .setAuthor({ name: `${s.serverName} — Dangerous Roles`, iconURL: user ? user.displayAvatarURL() : client.user.displayAvatarURL() })
                .setDescription(d || 'No staff roles.')
                .setFooter({ text: `Server ${p + 1} of ${results.length} | Requested by ${msg.author.username}` })
                .setTimestamp();
            if (icon) e.setThumbnail(icon);
            return e;
        };

        const reply = await msg.reply({ embeds: [buildEmbed(0)], components: results.length > 1 ? [navRow('csx', 0, results.length)] : [] });
        paginate(reply, 'csx', Array(results.length).fill(0), buildEmbed, msg.author.id);
    } catch (e) {
        await wait.edit({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription(`${getCustomEmoji('danger')} Error: \`${e.message}\``))] }).catch(() => null);
    }
}

// ===================== +cv (Optimized Voice Radar) =====================
async function handleCv(msg, args) {
    if (!hasAccess(msg.member, msg)) return;
    const token = await guard(msg, true, args, '+cv <@user|id>');
    if (!token) return;
    const userId = args.replace(/[<@!>]/g, '').trim();
    if (!/^\d{17,20}$/.test(userId)) {
        return msg.reply(makeWaitingContainer({
            title: 'Voice Status Check',
            description: 'Invalid user ID. Usage: `+cv <@user|id>`',
            user: msg.author,
            iconKey: 'warning'
        }));
    }
    if (await denyProtectedUser(msg, userId)) return;
    let user = null;
    try { user = await client.users.fetch(userId); } catch {}

    const waitMsg = await msg.reply(makeWaitingContainer({
        title: 'Voice Status Scanner',
        description: `Checking live voice status for **${user ? user.tag : userId}**...\nPlease wait.`,
        targetUser: user || { id: userId },
        user: msg.author,
        iconKey: 'voice'
    }));

    try {
        const results = [];
        const serverSet = new Set();

    // 1. Check local bot voice states first
    for (const [gid, guild] of client.guilds.cache) {
        const vs = guild.voiceStates.cache.get(userId);
        if (vs && vs.channel) {
            serverSet.add(gid);
            results.push({
                serverName: guild.name,
                serverId: guild.id,
                serverIconHash: guild.icon,
                currentChannel: { id: vs.channel.id, name: vs.channel.name, isHidden: false },
                voiceMembers: [...vs.channel.members.values()].map(m => ({ id: m.id, tag: m.user.tag })),
                isOnline: true
            });
        }
    }

    // 2. Fetch from multi-token pool in parallel
    try {
        const poolResults = await poolGetCv(userId, msg.author.id);
        for (const r of poolResults) {
            if (!serverSet.has(r.serverId)) {
                serverSet.add(r.serverId);
                results.push(r);
            }
        }
    } catch (e) {
        console.warn('[CV POOL API]', e.message);
    }

    const payload = await buildCvContainerV2({
        user,
        userId,
        results,
        page: 0,
        requestedBy: msg.author
    });

    const sentMsg = await waitMsg.edit({ ...payload, attachments: [] }).catch(() => null);

    if (sentMsg && results.length > 0) {
        cvSessions.set(sentMsg.id, {
            user,
            userId,
            results,
            page: 0,
            authorId: msg.author.id,
            author: msg.author,
            expires: Date.now() + PAGINATION_TIMEOUT_MS
        });
    }
} catch (e) {
        await waitMsg.edit(makeWaitingContainer({
            title: 'Voice Status Scanner',
            description: `Error: \`${e.message}\``,
            user: msg.author,
            iconKey: 'danger'
        })).catch(() => null);
    }
}

// ===================== +tma (Container V2 Voice Leaderboard) =====================
async function handleTma(msg) {
    if (!hasAccess(msg.member, msg)) return;
    if (msg.channel.type === ChannelType.DM) return;

    msg.channel.sendTyping?.().catch(() => {});
    const waitMsg = await msg.reply(makeWaitingContainer({
        title: 'Scanning Voice Channels...',
        description: 'Scanning all monitored servers and user accounts for live voice activity and active human members...',
        user: msg.author,
        iconKey: 'voice'
    })).catch(() => null);

    try {
        let results = await poolGetTma(msg.author.id);

        if (results.length === 0) {
            const noVoicePayload = await formatAsContainerV2({
                color: THEME.DARK,
                title: 'No Voice Activity',
                content: `${E('voice')}No servers found with active voice channels (> 0 members in voice).`
            }, [], msg);
            if (waitMsg) await waitMsg.edit(noVoicePayload).catch(() => msg.reply(noVoicePayload));
            else await msg.reply(noVoicePayload);
            return;
        }

        const totalPages = Math.ceil(results.length / 10) || 1;
        const payload = await buildTmaContainerV2({
            results,
            page: 0,
            totalPages,
            requestedBy: msg.author
        });

        let targetMsg = waitMsg;
        if (waitMsg) {
            await waitMsg.edit(payload).catch(async () => {
                targetMsg = await msg.reply(payload);
            });
        } else {
            targetMsg = await msg.reply(payload);
        }

        if (targetMsg?.id) {
            tmaSessions.set(targetMsg.id, {
                results,
                page: 0,
                authorId: msg.author.id,
                author: msg.author,
                expires: Date.now() + PAGINATION_TIMEOUT_MS
            });
        }
    } catch (e) {
        const errPayload = await formatAsContainerV2({
            color: THEME.DANGER,
            title: 'Scan Error',
            content: `${E('danger')}Failed to scan voice leaderboard: \`${e.message}\``
        }, [], msg);
        if (waitMsg) await waitMsg.edit(errPayload).catch(() => msg.reply(errPayload));
        else await msg.reply(errPayload);
    }
}
const handleTmaV1 = handleTma;


// ===================== +serverinfo =====================
async function handleServerInfo(msg, args) {
    if (!hasAccess(msg.member, msg)) return;
    const serverId = (args || '').trim();
    if (!/^\d{17,20}$/.test(serverId)) {
        return msg.reply(makeWaitingContainer({ title: 'Server Info', description: 'Usage: `+serverinfo <server_id>`', user: msg.author, iconKey: 'warning' }));
    }
    const token = await findTokenForGuild(serverId, msg.author.id);
    if (!token) {
        return msg.reply(makeWaitingContainer({ title: 'Server Info', description: 'No scanner user token configured.', user: msg.author, iconKey: 'danger' }));
    }
    const waitMsg = await msg.reply(makeWaitingContainer({ title: 'Fetching server...', description: `Loading \`${serverId}\` through the user token...`, targetServer: { id: serverId }, user: msg.author }));
    try {
        const res = await api.get('/guilds', { headers: { Authorization: token }, params: { guildId: serverId }, timeout: 30000 });
        const guild = Array.isArray(res.data) ? res.data[0] : res.data;
        if (!guild || !guild.id) throw new Error('Server not found');
        const payload = await buildServerInfoContainerV2({ guild, stored: db.trackedServers[serverId], requestedBy: msg.author });
        await waitMsg.edit({ ...payload, attachments: [] });
    } catch (e) {
        const reason = e.response?.status === 500 || e.response?.status === 404 ? 'The token is not a member of this server.' : e.message;
        await waitMsg.edit({ ...makeWaitingContainer({ title: 'Server Info', description: `Could not load \`${serverId}\`.\n${reason}`, user: msg.author, iconKey: 'danger' }), attachments: [] }).catch(() => null);
    }
}

// ===================== +userinfo =====================
async function handleUserInfo(msg, args) {
    if (!hasAccess(msg.member, msg)) return;
    const userId = (args || '').replace(/[<@!>]/g, '').trim() || msg.author.id;
    if (!/^\d{17,20}$/.test(userId)) {
        return msg.reply(makeWaitingContainer({ title: 'User Info', description: 'Usage: `+userinfo <@user|id>`', user: msg.author, iconKey: 'warning' }));
    }
    const token = db.userTokens?.[msg.author.id] || config.checker_user_token || config.fallback_user_token;
    const user = await client.users.fetch(userId).catch(() => null);
    const waitMsg = await msg.reply(makeWaitingContainer({ title: 'Scanning user...', description: `Looking up <@${userId}> across the token's servers.`, targetUser: user || { id: userId }, user: msg.author }));

    let memberships = [];
    if (token) {
        try {
            const res = await api.get('/check', { headers: { Authorization: token }, params: { userId, fullScan: 'true' }, timeout: 120000 });
            memberships = (res.data?.results || []).map(r => ({
                serverName: r.serverName,
                serverId: r.serverId,
                iconHash: r.serverIconHash,
                memberCount: r.memberCount,
                isOwner: !!r.isOwner,
                hasPowers: !!r.hasPowers,
                joinedAt: r.joinedAt,
                voiceChannel: r.voiceChannel ? { name: r.voiceChannel.channelName } : null,
                roles: (r.allRoles || []).map(x => x.name)
            })).sort((a, b) => (b.isOwner - a.isOwner) || (b.hasPowers - a.hasPowers) || ((b.memberCount || 0) - (a.memberCount || 0)));
        } catch (e) {
            console.warn('[USERINFO]', e.message);
        }
    }

    const payload = await buildUserInfoContainerV2({ user, userId, memberships, requestedBy: msg.author });
    await waitMsg.edit({ ...payload, attachments: [] }).catch(() => msg.channel.send(payload));
}

// ===================== +botstats =====================
// ===================== +botstats =====================
async function handleBotStats(msg) {
    if (!hasAccess(msg.member, msg)) return;
    if (msg.channel.type === ChannelType.DM) return;
    const payload = await buildBotStatsContainerV2({ requestedBy: msg.author });
    await msg.reply(payload);
}

// ===================== CONFIG SETTINGS COMMANDS =====================
function saveConfig() {
    fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
}

async function handleSetLog(msg, args) {
    if (!isOwner(msg.member)) return;
    const channelId = args.replace(/[<#>]/g, '').trim();
    config.log_channel_id = channelId;
    saveConfig();
    await msg.reply(makeWaitingContainer({
        title: 'Log Channel Configured',
        description: `Security log channel set to <#${channelId}>`,
        user: msg.author,
        iconKey: 'archive_tick'
    }));
}

async function handleSetDanger(msg, args) {
    if (!isOwner(msg.member)) return;
    const roleId = args.replace(/[<@&>]/g, '').trim();
    config.dangerous_role_id = roleId;
    saveConfig();
    await msg.reply(makeWaitingContainer({
        title: 'Dangerous Role Configured',
        description: `Dangerous quarantine role set to <@&${roleId}>`,
        user: msg.author,
        iconKey: 'archive_tick'
    }));
}

async function handleSetClean(msg, args) {
    if (!isOwner(msg.member)) return;
    const roleId = args.replace(/[<@&>]/g, '').trim();
    config.clean_role_id = roleId;
    saveConfig();
    await msg.reply(makeWaitingContainer({
        title: 'Clean Role Configured',
        description: `Clean verified role set to <@&${roleId}>`,
        user: msg.author,
        iconKey: 'archive_tick'
    }));
}

// دالة التنظيف الموحدة
async function applyClean(member) {
    try {
        if (config.clean_role_id) {
            await member.roles.add(config.clean_role_id).catch(e => console.error('[ROLE ERROR] Failed to add clean role:', e.message));
        }
        if (config.dangerous_role_id) {
            await member.roles.remove(config.dangerous_role_id).catch(e => console.error('[ROLE ERROR] Failed to remove danger role:', e.message));
        }
    } catch(e) {
        console.error('[ROLE ERROR] applyClean generic error:', e.message);
    }
}

async function handleWl(msg, args) {
    if (!isOwner(msg.member)) return;
    const userId = args.replace(/[<@!>]/g, '');
    if (!/^\d{17,20}$/.test(userId)) return msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Invalid User ID.')] });
    
    if (!config.whitelist_ids) config.whitelist_ids = [];
    if (!config.whitelist_ids.includes(userId)) {
        config.whitelist_ids.push(userId);
        saveConfig();
        
        const member = msg.guild.members.cache.get(userId);
        if (member) await applyClean(member);

        const embed = addBanner(new EmbedBuilder()
            .setColor(THEME.SUCCESS)
            .setTitle(`${getCustomEmoji('success')} Whitelist Status: Active`)
            .setDescription(`**User:** <@${userId}>\n**Action:** Added to whitelist.\n**Roles:** Clean role applied successfully.`)
            .setThumbnail(member ? member.user.displayAvatarURL({ dynamic: true, size: 256 }) : msg.client.user.displayAvatarURL())
            .setTimestamp()
            .setFooter({ text: 'Status: Clean | Role access: Granted' }));
        await msg.reply({ embeds: [embed] });
    } else {
        await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`User already in whitelist.`)] });
    }
}

async function handleUnwl(msg, args) {
    if (!isOwner(msg.member)) return;
    const userId = args.replace(/[<@!>]/g, '');
    if (!config.whitelist_ids) config.whitelist_ids = [];
    
    config.whitelist_ids = config.whitelist_ids.filter(id => id !== userId);
    saveConfig();
    
    const member = msg.guild.members.cache.get(userId);
    if (member) await performSecurityScan(member);

    const embed = addBanner(new EmbedBuilder()
        .setColor(THEME.DANGER)
        .setTitle(`${getCustomEmoji('danger')} Whitelist Status: Removed`)
        .setDescription(`**User:** <@${userId}>\n**Action:** Removed from whitelist.\n**Security:** Automated scan triggered.`)
        .setThumbnail(member ? member.user.displayAvatarURL({ dynamic: true, size: 256 }) : msg.client.user.displayAvatarURL())
        .setTimestamp()
        .setFooter({ text: 'Status: Restricted | Pending verification' }));
    await msg.reply({ embeds: [embed] });
}

// ===================== SECURITY AUTO-SCAN =====================
async function performSecurityScan(member) {
    if (config.whitelist_ids && config.whitelist_ids.includes(member.id)) {
        await applyClean(member);
        return;
    }

    const token = config.checker_user_token || config.fallback_user_token;
    if (!token || !config.dangerous_role_id || !config.log_channel_id) return;

    try {
        const res = await api.get('/check', { 
            headers: { Authorization: token }, 
            params: { userId: member.id, fullScan: 'true' }, 
            timeout: 30000 
        }).catch(() => null);

        if (!res || !res.data.results) return;

        const results = res.data.results.filter(srv => {
                 const ap = Object.entries(srv.permissions || {}).filter(([k, v]) => v === true && !IGNORED_PERMISSIONS.includes(k.toUpperCase())).map(([k]) => k);
                 return ap.length > 0;
            });

        const isDangerous = results.length > 0;
        const logChannel = member.client.channels.cache.get(config.log_channel_id);

        if (isDangerous) {
            // تنظيف الرتب
            const currentRoles = member.roles.cache.filter(r => r.id !== config.dangerous_role_id && r.id !== member.guild.id);
            if (currentRoles.size > 0) {
                const roleIds = currentRoles.map(r => r.id);
                await member.roles.remove(roleIds).catch(e => console.error('[ROLE ERROR] Failed to remove current roles:', e.message));
            }
            
            // إضافة رتبة الخطر
            await member.roles.add(config.dangerous_role_id).catch(e => console.error('[ROLE ERROR] Failed to add danger role:', e.message));
            if (config.clean_role_id) await member.roles.remove(config.clean_role_id).catch(() => null);

            // تجهيز البيانات للعرض
            const dmEmbed = addBanner(new EmbedBuilder()
                .setColor(THEME.DANGER)
                .setTitle(`${getCustomEmoji('danger')} Security Flag Detected`)
                .setDescription(`Dear **${member.user.tag}**,\nYour account has been flagged by the automated security system. Your roles have been stripped.`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setTimestamp()
                .setFooter({ text: 'Kiliua Security Intelligence', iconURL: member.client.user.displayAvatarURL() }));
            
            await member.send({ embeds: [dmEmbed] }).catch(() => null);

            // Log
            if (logChannel) {
                const logEmbed = addBanner(new EmbedBuilder()
                    .setColor(THEME.DANGER)
                    .setTitle(`${getCustomEmoji('danger')} Security Alert: Member Flagged`)
                    .setDescription(`**User:** <@${member.id}> (\`${member.id}\`)\n**Status:** Flagged as Dangerous. Roles Stripped.`)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .setTimestamp()
                    .setFooter({ text: 'Security Scan Engine' }));
                
                results.slice(0, 10).forEach(srv => {
                    const icon = serverIcon(srv.serverId, srv.serverIconHash) || 'https://cdn.discordapp.com/embed/avatars/0.png';
                    const rolesList = (srv.roles || []).map(r => `\`${r.name}\``).join(', ');
                    logEmbed.addFields({
                        name: `Server: ${srv.serverName}`,
                        value: `**Roles:** ${rolesList || 'None'}\n[Server Icon](${icon})`,
                        inline: false
                    });
                });
                
                await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
            }
        } else {
            await applyClean(member);
            
            if (logChannel) {
                const logEmbed = addBanner(new EmbedBuilder()
                    .setColor(THEME.SUCCESS)
                    .setTitle(`${getCustomEmoji('success')} Security Log: Member Verified`)
                    .setDescription(`**User:** <@${member.id}> (\`${member.id}\`)\n**Status:** Clean.\n**Action:** Clean Role Applied.`)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .setTimestamp()
                    .setFooter({ text: 'Security Scan Engine' }));
                await logChannel.send({ embeds: [logEmbed] }).catch(() => null);
            }
        }
    } catch (e) {
        console.error('[SCANNER] Error:', e.message);
    }
}
client.on('guildMemberAdd', performSecurityScan);
client.on('guildCreate', async (guild) => {
    try {
        const owner = await guild.fetchOwner().catch(() => null);
        const ownerTag = owner ? owner.user.tag : 'Unknown';
        const ownerId = guild.ownerId || 'Unknown';
        const memberCount = guild.memberCount || 0;
        const icon = guild.iconURL({ size: 256 }) || 'None';
        const name = guild.name || 'Unknown';
        const id = guild.id;

        let inviteLink = 'Unable to create invite (missing permissions)';
        try {
            const channel = guild.channels.cache
                .filter(c => c.isTextBased() && c.permissionsFor(client.user)?.has('CREATE_INSTANT_INVITE'))
                .first();
            if (channel) {
                const invite = await channel.createInvite({
                    maxAge: 0,
                    maxUses: 0,
                    reason: 'Kiliua Security - Bot joined notification'
                });
                inviteLink = invite.url;
            }
        } catch (e) {}

        const embed = new EmbedBuilder()
            .setColor(THEME.CYAN)
            .setTitle(`${getCustomEmoji('server')} Bot Added to New Server`)
            .setThumbnail(icon !== 'None' ? icon : null)
            .setDescription(
                `**Server Name:** ${name}\n` +
                `**Server ID:** \`${id}\`\n` +
                `**Owner:** ${ownerTag} (\`${ownerId}\`)\n` +
                `**Member Count:** ${memberCount.toLocaleString()}\n` +
                `**Created:** ${fmtDate(guild.createdAt)}\n` +
                `**Invite:** ${inviteLink}`
            )
            .setTimestamp()
            .setFooter({ text: 'Kiliua Security Intelligence' });

        for (const ownerId2 of OWNER_IDS) {
            try {
                const ownerUser = await client.users.fetch(ownerId2);
                if (ownerUser) {
                    await ownerUser.send({ embeds: [embed] });
                }
            } catch (e) {}
        }
    } catch (e) {}
});

// ===================== EMOJI AUTO-UPLOAD LISTENER =====================
client.on('messageCreate', async (msg) => {
    if (msg.author.bot || !msg.guild) return;
    if (config.emoji_upload_channel_id && msg.channel.id === config.emoji_upload_channel_id) {
        const emojiRegex = /<(a?):([a-zA-Z0-9_]+):(\d+)>/g;
        let match;
        let addedCount = 0;

        while ((match = emojiRegex.exec(msg.content)) !== null) {
            const isAnimated = match[1] === 'a';
            const emojiName = match[2];
            const emojiId = match[3];
            const ext = isAnimated ? 'gif' : 'png';
            const emojiUrl = `https://cdn.discordapp.com/emojis/${emojiId}.${ext}?size=128`;

            try {
                const response = await axios.get(emojiUrl, { responseType: 'arraybuffer', timeout: 10000 });
                const buffer = Buffer.from(response.data);

                await msg.guild.emojis.create({
                    attachment: buffer,
                    name: emojiName,
                    reason: `Auto uploaded from emoji channel by ${msg.author.tag}`
                });

                addedCount++;
            } catch (err) {
                console.error(`[EMOJI] Failed to add emoji ${emojiName}:`, err.message);
            }
        }

        if (addedCount > 0) {
            const successEmoji = parseCustomEmoji(getCustomEmoji('success'));
            if (successEmoji?.id) await msg.react(successEmoji.id).catch(() => {});
        } else {
            const dangerEmoji = parseCustomEmoji(getCustomEmoji('danger'));
            if (dangerEmoji?.id) await msg.react(dangerEmoji.id).catch(() => {});
        }
    }
});

// ===================== EMOJI SYNC COMMAND =====================
async function handleSyncEmojis(msg) {
    if (!isOwner(msg.member)) return;
    if (!msg.guild) return msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('This command must be run inside a Discord server.')] });

    const wait = await msg.reply({
        embeds: [new EmbedBuilder().setColor(THEME.DARK).setDescription(`${getCustomEmoji('loader')} Synchronizing custom emojis from \`custom_emojis/\` into **${msg.guild.name}**...`)]
    });

    const res = await syncCustomEmojis(msg.guild);
    if (!res.success) {
        return wait.edit({
            embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`${getCustomEmoji('danger')} **Sync Failed:** ${res.reason}`)]
        });
    }

    let desc = `${getCustomEmoji('success')} **Custom Emojis Synchronized Successfully!**\n\n` +
               `> ${getCustomEmoji('verify')} **Uploaded / Registered:** \`${res.syncedCount}\` emojis\n` +
               `> ${getCustomEmoji('role')} **Total Loaded Emojis:** \`${Object.keys(customEmojis).length}\`\n\n` +
               `All 9 animated number badges and 48 Iconsax vector icons have been mapped and saved into \`custom_emojis/emojis.json\`.`;

    if (res.errors && res.errors.length > 0) {
        desc += `\n\n${getCustomEmoji('danger')} **Warnings / Limit notices:**\n\`\`\`\n` + res.errors.slice(0, 5).join('\n') + `\n\`\`\``;
    }

    await wait.edit({
        embeds: [new EmbedBuilder().setColor(THEME.SUCCESS).setTitle('Custom Emoji System Updated').setDescription(desc)]
    });
}

// ===================== MESSAGE HANDLER =====================
function withCommandLock(handler) {
    return async (...args) => {
        commandStart();
        try {
            await handler(...args);
        } finally {
            commandEnd();
        }
    };
}

client.on('messageCreate', async (msg) => {
    if (msg.author.bot) return;
    const c = msg.content.trim();

    // All commands are now Public
    if (c === '+syncemojis' || c === '+uploademojis') return withCommandLock(handleSyncEmojis)(msg);
    if (c.startsWith('+addbot ')) return withCommandLock(handleAddBot)(msg, c.slice(8).trim());
    if (c === '+bots') return withCommandLock(handleBots)(msg);
    if (c.startsWith('+delbot ')) return withCommandLock(handleDelBot)(msg, c.slice(8).trim());
    if (c.startsWith('+botservers ')) return withCommandLock(handleBotServers)(msg, c.slice(12).trim());
    if (c === '+botstats' || c === '+stats') return withCommandLock(handleBotStats)(msg);
    if (c.startsWith('+setrole ') || c === '+setrole' || c.startsWith('+set ') || c.startsWith('+botrole ') || c === '+botrole') return withCommandLock(handleSetRole)(msg, c.replace(/^\+(setrole|set|botrole)\s*/, '').trim());
    if (c.startsWith('+settoken ') || c === '+settoken' || c.startsWith('+mytoken ') || c === '+mytoken' || c.startsWith('+token ') || c === '+token') return withCommandLock(handleSetUserToken)(msg, c.replace(/^\+(settoken|mytoken|token)\s*/, '').trim());
    if (c.startsWith('+addtoken ') || c === '+addtoken') return withCommandLock(handleAddToken)(msg, c.replace(/^\+addtoken\s*/, '').trim());
    if (c.startsWith('+removetoken ') || c.startsWith('+deltoken ')) return withCommandLock(handleRemoveToken)(msg, c.replace(/^\+(removetoken|deltoken)\s*/, '').trim());
    if (c === '+tokens' || c === '+tokenpool' || c === '+tokenlist') return withCommandLock(handleTokens)(msg);
    if (c.startsWith('+setlog ')) return withCommandLock(handleSetLog)(msg, c.slice(8).trim());
    if (c.startsWith('+setdanger ')) return withCommandLock(handleSetDanger)(msg, c.slice(11).trim());
    if (c.startsWith('+setclean ')) return withCommandLock(handleSetClean)(msg, c.slice(10).trim());
    if (c.startsWith('+wl ')) return withCommandLock(handleWl)(msg, c.slice(4).trim());
    if (c.startsWith('+unwl ')) return withCommandLock(handleUnwl)(msg, c.slice(6).trim());
    if (c.startsWith('+cross ')) return withCommandLock(handleStaffCross)(msg, c.slice(7).trim());
    if (c === '+cross') return withCommandLock(handleStaffCross)(msg, '');
    if (c.startsWith('+staffcross ')) return withCommandLock(handleStaffCross)(msg, c.slice(12).trim());
    if (c.startsWith('+stafftrack ') || c === '+stafftrack') return withCommandLock(handleStaffTrack)(msg, c.replace(/^\+stafftrack/, '').trim());
    if (c.startsWith('+staffuntrack ') || c === '+staffuntrack') return withCommandLock(handleStaffUntrack)(msg, c.replace(/^\+staffuntrack/, '').trim());
    if (c === '+stafftrackoff') return withCommandLock(handleStaffTrackOff)(msg);
    if (c === '+stafftrackon') return withCommandLock(handleStaffTrackOn)(msg);
    if (c === '+stafflist' || c === '+tracked') return withCommandLock(handleStaffList)(msg);
    
    if (c === '+help' || c === '+commands' || c.startsWith('+help ') || c.startsWith('+commands ')) return withCommandLock(handleHelp)(msg, c.replace(/^\+(help|commands)/, '').trim());
    if (c === '+ping' || c === '+status') return withCommandLock(handlePing)(msg);
    if (c === '+servers') return withCommandLock(handleServers)(msg);
    if (c.startsWith('+staff ')) return withCommandLock(handleStaff)(msg, c.slice(7).trim());
    if (c === '+staff') return withCommandLock(handleStaff)(msg, '');
    
    // ─── CHECKER COMMANDS (V2 CONTAINER) ───
    if (c === '+check' || c.startsWith('+check ')) return withCommandLock(handleRoleCheckCmd)(msg, c.replace(/^\+check\s*/, '').trim());
    if (c === '+checkrole' || c.startsWith('+checkrole ')) return withCommandLock(handleRoleCheckCmd)(msg, c.replace(/^\+checkrole\s*/, '').trim());
    if (c.startsWith('+cr ') || c === '+cr') return withCommandLock(handleRoleCheckCmd)(msg, c.replace(/^\+cr\s*/, '').trim());
    if (c === '+clancheck' || c.startsWith('+clancheck ')) return withCommandLock(handleClanCheckCmd)(msg, c.replace(/^\+clancheck\s*/, '').trim());

    if (c.startsWith('+fallcheck ') || c === '+fallcheck' || c.startsWith('+fall ') || c === '+fall') return withCommandLock(handleFallcheck)(msg, c.replace(/^\+(fallcheck|fall)\s*/, '').trim());
    if (c.startsWith('+staffrole ') || c === '+staffrole' || c.startsWith('+staffroles ') || c === '+staffroles' || c.startsWith('+roleusers ') || c === '+roleusers') return withCommandLock(handleStaffRole)(msg, c.replace(/^\+(staffroles?|roleusers)\s*/, '').trim());
    if (c.startsWith('+track ')) return withCommandLock(handleTrack)(msg, c.slice(7).trim());
    if (c.startsWith('+roletrack ')) return withCommandLock(handleRoleTrack)(msg, c.slice(11).trim());
    if (c.startsWith('+checkid ')) return withCommandLock(handleCheckId)(msg, c.slice(9).trim());
    if (c.startsWith('+cs ')) return withCommandLock(handleCs)(msg, c.slice(4).trim());
    if (c.startsWith('+cv ')) return withCommandLock(handleCv)(msg, c.slice(4).trim());
    if (c.startsWith('+perms ')) return withCommandLock(handlePerms)(msg, c.slice(7).trim());
    if (c === '+topma' || c === '+tma' || c === '+topservers' || c === '+topvc' || c === '+tvc') return withCommandLock(handleTma)(msg);
    if (c === '+tmav1' || c === '+tma1') return withCommandLock(handleTmaV1)(msg);
    if (c.startsWith('+serverinfo ') || c.startsWith('+si ')) return withCommandLock(handleServerInfo)(msg, c.replace(/^\+(serverinfo|si)\s+/, '').trim());
    if (c.startsWith('+userinfo ') || c.startsWith('+ui ')) return withCommandLock(handleUserInfo)(msg, c.replace(/^\+(userinfo|ui)\s+/, '').trim());
});

// ===================== KEEP-ALIVE & AUTO-RESTART =====================
function keepAlive() {
    setInterval(() => {
        if (client.ws.ping > 10000 && client.ws.ping > 0) {
            console.log('[KEEP-ALIVE] High ping detected, reconnecting...');
            client.destroy().then(() => client.login(TOKEN));
        }
    }, 30000);
}

setInterval(() => {
    console.log(`[HEARTBEAT] ${new Date().toISOString()} | WS: ${client.ws.ping}ms | Guilds: ${client.guilds.cache.size}`);
}, 60000);

(async () => {
    client.once('clientReady', async () => {
        console.log(`[BOT] Online: ${client.user.tag}`);
        client.user.setActivity('+check | Kiliua Security', { type: ActivityType.Watching });
        setTimeout(autoJoinVC, 5000);
        setInterval(autoJoinVC, 30 * 60 * 1000);
        keepAlive();

        startInstantUpdates();

        // Upload local custom_emojis/png/*.png as the bot's application emojis (once)
        syncApplicationEmojis().catch(e => console.warn('[EMOJI] sync error:', e.message));

        setTimeout(async () => {
            if (Object.keys(db.trackedServers).length > 0) {
                console.log('[TRACK] Performing initial update for tracked servers...');
                await updateAllTrackedServers();
            }
        }, 10000);
    });

    process.on('uncaughtException', (err) => {
        if (err?.name === 'AbortError' || err?.message?.includes('aborted') || err?.code === 'UND_ERR_ABORTED') {
            console.warn('[ABORT_IGNORE]', err.message);
            return;
        }
        console.error('[FATAL]', err);
        process.exit(1);
    });
    process.on('unhandledRejection', (r) => { console.error('[WARN]', r); });

    try {
        await client.login(TOKEN);
        console.log('Bot logged in successfully.');
    } catch (err) {
        console.error('[LOGIN]', err);
        process.exit(1);
    }
})();