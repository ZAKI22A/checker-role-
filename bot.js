// bot.js - KILIUA SECURITY INTELLIGENCE (v9.2 — FULL DATABASE-FIRST)
const {
    Client, GatewayIntentBits, Partials, EmbedBuilder, ActivityType,
    ChannelType, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType,
    StringSelectMenuBuilder, AttachmentBuilder
} = require('discord.js');
const { joinVoiceChannel, VoiceConnectionStatus, entersState, getVoiceConnection } = require('@discordjs/voice');
const axios = require('axios');
const http = require('http');
const https = require('https');
const fs = require('fs');
const { createCanvas, loadImage } = require('canvas');
const GIFEncoder = require('gif-encoder-2');

console.log('='.repeat(70));
console.log('    KILIUA SECURITY INTELLIGENCE v9.2 — FULL DATABASE-FIRST');
console.log('='.repeat(70));

const sleep = (ms) => new Promise(r => setTimeout(r, ms));

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

let config;
try { config = JSON.parse(fs.readFileSync('config.json', 'utf8')); } catch (e) { console.error('config.json not found!', e); process.exit(1); }

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
        }
    } catch (e) { console.error('DB error:', e); }
}
loadDB();

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
    partials: [Partials.Channel, Partials.Message, Partials.GuildMember, Partials.User]
});

// ===================== UTILS =====================
function hasAccess(m) {
    return true;
}

// ===================== PROTECTED USERS (privacy) =====================
// IDs listed in db.protectedIds cannot be scanned; their server
// memberships stay hidden from everyone (including owners).
function isProtectedUser(id) {
    return Array.isArray(db.protectedIds) && db.protectedIds.map(String).includes(String(id));
}
async function denyProtectedUser(msg, userId) {
    if (!isProtectedUser(userId)) return false;

    let files = [];
    let imageUrl = null;
    try {
        const banner = await buildAccessDeniedBanner();
        if (banner) {
            files.push(new AttachmentBuilder(banner, { name: 'access_denied.png' }));
            imageUrl = 'attachment://access_denied.png';
        }
    } catch (e) {}

    const embed = new EmbedBuilder()
        .setColor(THEME.DANGER)
        .setAuthor({ name: getCustomEmoji('danger') + ' Access Denied', iconURL: client.user.displayAvatarURL() })
        .setTitle('ACCESS DENIED')
        .setDescription('**This user does not have authorization to access this information.**\nThe servers associated with this account cannot be revealed.')
        .setFooter({ text: 'Kiliua Security Intelligence • Privacy Protection' })
        .setTimestamp();
    if (imageUrl) embed.setImage(imageUrl);

    await msg.reply({ embeds: [embed], files });
    return true;
}

// ===================== ROTATING EMOJIS =====================
const ROTATING_EMOJIS = {
    audit:   ['🔍','🕵️','🔎','🛡️','⚠️','🔐','🔒','🚨'],
    staff:   ['👥','🏅','⭐','🎖️','🔰','💫','✨','🌟'],
    voice:   ['🎙️','🔊','📡','🎵','💬','📻','🎧','🔔'],
    danger:  ['🚨','⛔','🔴','💀','☠️','⚡','🔥','💥'],
    success: ['✅','🟢','💚','🎉','🏆','✨','💎','🌈'],
    info:    ['','','','','','','',''],
};
let customEmojis = {};
try {
    if (fs.existsSync('./custom_emojis/emojis.json')) {
        customEmojis = JSON.parse(fs.readFileSync('./custom_emojis/emojis.json', 'utf8'));
    }
} catch (e) {}

function getCustomEmoji(key) {
    return customEmojis[key] || '';
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
    return m && OWNER_IDS.includes(m.id);
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

// ===================== +set ROLE =====================
async function handleSetRole(msg, args) {
    const input = args.trim();
    if (!msg.guild) return;
    const currentName = db.allowedRoles[msg.guild.id] || 'None';
    if (!input) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription(`Current allowed role in this server: \`${currentName}\`\nUsage: \`+set <role_name_or_mention>\``))] });
        return;
    }
    let roleName = input;
    const mentionMatch = input.match(/^<@&(\d+)>$/);
    if (mentionMatch) {
        const roleId = mentionMatch[1];
        const role = msg.guild.roles.cache.get(roleId);
        if (role) roleName = role.name;
        else {
            await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('Role not found.'))] });
            return;
        }
    }
    db.allowedRoles[msg.guild.id] = roleName.trim();
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));
    await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.SUCCESS).setDescription(`Allowed role for this server set to: \`${db.allowedRoles[msg.guild.id]}\``))] });
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
    if (!hasAccess(msg.member)) return;
    if (msg.channel.type === ChannelType.DM) return;

    // تأخير أمني عشوائي قبل البدء لمنع الكشف والحظر من ديسكورد
    await new Promise(r => setTimeout(r, 3000 + Math.random() * 4000));

    const parts = args.trim().split(/\s+/);
    if (parts.length < 2) {
        await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Usage: `+staffcross <source_server_id> <target_server_id>`')] });
        return;
    }
    const sourceId = parts[0].replace(/[<@!>]/g, '').trim();
    const targetId = parts[1].replace(/[<@!>]/g, '').trim();
    if (!/^\d{17,20}$/.test(sourceId) || !/^\d{17,20}$/.test(targetId)) {
        await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Invalid server IDs.')] });
        return;
    }

    const token = db.userTokens[msg.author.id] || config.checker_user_token;
    if (!token) {
        await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Scanner token missing. Set it in `database.json`.')] });
        return;
    }

    const wait = await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.PRIMARY).setAuthor({ name: 'Staff Cross Check', iconURL: client.user.displayAvatarURL() }).setDescription(`Scanning staff from source server **${sourceId}** and checking presence in target server **${targetId}**...\nThis may take a while with secure rate limits.`).setTimestamp()] });

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
                await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Error fetching source server: ${res.data.error}`)] });
                return;
            }
            sourceMembers = res.data.members || [];
            sourceGuild = res.data.guild || { name: sourceId, id: sourceId, roles: [] };
        }

        if (sourceMembers.length === 0) {
            await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.PRIMARY).setDescription(`No staff members found in source server **${sourceGuild.name || sourceId}**.`)] });
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
                await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.PRIMARY)
                    .setAuthor({ name: 'Staff Cross Check', iconURL: client.user.displayAvatarURL() })
                    .setDescription(`Scanning staff members... (${processed}/${sourceMembers.length})\nSecure anti-detection delay active.`)
                    .setTimestamp()] });
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
            // تأخير أمني عشوائي أطول بين كل عملية فحص لتجنب كشف ديسكورد (Rate Limit / Anti-Bot)
            const delay = 1500 + Math.random() * 2500;
            await sleep(delay);
        }

        await wait.delete().catch(() => null);

        if (allResults.length === 0) {
            const embed = new EmbedBuilder()
                .setColor(THEME.DARK)
                .setAuthor({ name: 'Cross-Server Staff Analysis', iconURL: client.user.displayAvatarURL() })
                .setDescription(`No staff members from source server **${sourceGuild.name || sourceId}** are present in target server **${targetGuild ? targetGuild.name : targetId}**.`)
                .setFooter({ text: `Requested by ${msg.author.username}` })
                .setTimestamp();
            await msg.reply({ embeds: [embed] });
            return;
        }

        const pp = 5;
        const tp = Math.ceil(allResults.length / pp);

        const buildEmbed = (p) => {
            const pageItems = allResults.slice(p * pp, (p + 1) * pp);
            const divider = '─'.repeat(44);

            let desc = `\`\`\`
Source   ${sourceGuild.name || sourceId}
         ${sourceId}
Target   ${targetGuild ? targetGuild.name : targetId}
         ${targetId}
Found    ${allResults.length} staff members in target
Page     ${p + 1} / ${tp}
\`\`\``;
            desc += `\n${divider}\n\n`;

            pageItems.forEach((item, idx) => {
                const m = item.member;
                const tInfo = item.targetInfo;
                const rankTag  = m.isOwner ? ' [OWNER]' : '';
                const statusDot = m.voiceChannel ? '●' : '○';
                const idxNum = (p * pp) + idx + 1;

                const sourceRolesStr = item.sourceStaffRoles.length > 0
                    ? item.sourceStaffRoles.map(r => `\`${r}\``).join(', ')
                    : '—';

                const rolesInTarget = tInfo.roles.length > 0
                    ? tInfo.roles.map(r => `\`${r.name}\``).join(', ')
                    : '—';
                const permsInTarget = tInfo.activePerms.length > 0
                    ? tInfo.activePerms.map(p => `\`${getPermDisplay(p)}\``).join(', ')
                    : '—';
                const joinedTime = tInfo.joinedAt ? fmtRel(tInfo.joinedAt) : '—';
                desc += `\`${idxNum}\` ${statusDot} <@${m.user.id}>${rankTag} — **In Target**\n`;
                desc += `> ID          \`${m.user.id}\`\n`;
                desc += `> Source Roles ${sourceRolesStr}\n`;
                desc += `> Target Roles ${rolesInTarget}\n`;
                desc += `> Permissions ${permsInTarget}\n`;
                desc += `> Joined      ${joinedTime}\n\n`;
            });

            const icon = serverIcon(targetGuild?.id, targetGuild?.icon) || serverIcon(sourceGuild?.id, sourceGuild?.icon);
            const embed = new EmbedBuilder()
                .setColor(THEME.CYAN)
                .setAuthor({ name: 'Cross-Server Staff Analysis', iconURL: icon || client.user.displayAvatarURL() })
                .setDescription(desc)
                .setFooter({ text: `Requested by ${msg.author.username}` })
                .setTimestamp();
            if (icon) embed.setThumbnail(icon);
            return embed;
        };

        const reply = await msg.reply({ embeds: [buildEmbed(0)], components: tp > 1 ? [navRow('cross', 0, tp)] : [] });
        paginate(reply, 'cross', Array(tp).fill(0), buildEmbed, msg.author.id);

    } catch (e) {
        await wait.delete().catch(() => null);
        await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Error: \`${e.message}\``)] });
    }
}

// ===================== STAFF TRACKING COMMANDS =====================
async function handleStaffTrack(msg, args) {
    const ok = await guardOwnerSilent(msg, true, args, '`+stafftrack <server_id>`');
    if (!ok) return;

    const serverId = args.trim();
    if (!/^\d{17,20}$/.test(serverId)) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('Invalid server ID.'))] });
        return;
    }

    if (db.trackedServers[serverId]) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription(`Server **${serverId}** is already being tracked.`))] });
        return;
    }

    const wait = await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription(`Starting to track server **${serverId}**...\nFetching initial staff data...`))] });

    const token = db.userTokens[msg.author.id];
    if (!token) {
        await wait.edit({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('Scanner token missing. Set it in `database.json`.'))] });
        return;
    }

    const success = await updateTrackedServer(serverId, token);
    if (success) {
        await wait.edit({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.SUCCESS)
            .setDescription(`✅ Server **${serverId}** is now being tracked.\nData will be updated every ${UPDATE_INTERVAL/1000} seconds.`))] });
        if (!updateInterval) startInstantUpdates();
    } else {
        await wait.edit({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER)
            .setDescription(`❌ Failed to track server **${serverId}**. Make sure the token has access and the server ID is correct.`))] });
    }
}

async function handleStaffUntrack(msg, args) {
    const ok = await guardOwnerSilent(msg, true, args, '`+staffuntrack <server_id>`');
    if (!ok) return;

    const serverId = args.trim();
    if (!/^\d{17,20}$/.test(serverId)) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('Invalid server ID.'))] });
        return;
    }

    if (!db.trackedServers[serverId]) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription(`Server **${serverId}** is not being tracked.`))] });
        return;
    }

    delete db.trackedServers[serverId];
    fs.writeFileSync(DB_FILE, JSON.stringify(db, null, 2));

    await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.SUCCESS)
        .setDescription(`✅ Server **${serverId}** removed from tracking.`))] });
}

async function handleStaffList(msg) {
    const ok = await guardOwnerSilent(msg, false, '', '');
    if (!ok) return;

    const tracked = Object.keys(db.trackedServers);
    if (tracked.length === 0) {
        await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DARK)
            .setDescription('No servers are currently being tracked.')] });
        return;
    }

    let desc = `**Tracked Servers (${tracked.length})**\n\n`;
    for (const sid of tracked) {
        const data = db.trackedServers[sid];
        const members = data.members ? data.members.length : 0;
        const lastUpdate = data.lastUpdate ? fmtRel(data.lastUpdate) : 'Never';
        const name = data.guild ? data.guild.name : sid;
        desc += `**${name}** (\`${sid}\`)\n> Staff: ${members} members\n> Last update: ${lastUpdate}\n\n`;
    }

    const embed = addBanner(new EmbedBuilder()
        .setColor(THEME.PRIMARY)
        .setTitle('Staff Tracking List')
        .setDescription(desc)
        .setFooter({ text: `Requested by ${msg.author.username}` })
        .setTimestamp());

    await msg.reply({ embeds: [embed] });
}

// ===================== STAFF TRACKING TOGGLE =====================
async function handleStaffTrackOff(msg) {
    const ok = await guardOwnerSilent(msg, false, '', '');
    if (!ok) return;
    staffTrackingEnabled = false;
    await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.SUCCESS)
        .setDescription('✅ Staff tracking has been **stopped**. Background updates are paused. Use `+stafftrackon` to resume.'))] });
}

async function handleStaffTrackOn(msg) {
    const ok = await guardOwnerSilent(msg, false, '', '');
    if (!ok) return;
    staffTrackingEnabled = true;
    await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.SUCCESS)
        .setDescription('✅ Staff tracking has been **resumed**. Background updates are active again.'))] });
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
        const statusDot = m.voiceChannel ? '●' : '○';
        const rankTag   = m.isOwner ? ' [OWNER]' : '';
        const flagTag   = m.isBlacklisted ? ' [BLACKLISTED]' : '';

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
            `> ID       \`${m.user.id}\``,
            `> Roles    ${rolesDisplay}`,
            `> Joined   ${joined}`,
            `> Voice    ${voice}`
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
    if (!hasAccess(msg.member)) return;
    // تأخير أمني لمنع الكشف (Rate Limit / Anti-Bot)
    await new Promise(r => setTimeout(r, 2000 + Math.random() * 3000));

    const token = await guard(msg, true, args, '`+staff <server_id> [--lite|--mods|--novoice] [--force]`');
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

    if (!db.trackedServers[serverId]) {
        if (!token) {
            await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('No scanner token found. Please set it in `database.json` or use `+stafftrack` first.'))] });
            return;
        }
        const wait = await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription(`Scanning Staff Members...\n\nServer: \`${serverId}\`\nThis may take 1-15 minutes...`))] });

        try {
            const res = await api.get('/checkadmins', {
                headers: { Authorization: token },
                params: { guildId: serverId },
                timeout: 900000
            });
            await wait.delete().catch(() => null);

            const data = res.data;
            if (data.error) {
                await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Scanner error: ${data.error}`)] });
                return;
            }

            const guild = data.guild || { name: serverId, id: serverId, roles: [] };
            const members = applyView(data.members || []);
            const icon = serverIcon(guild.id, guild.icon);

            if (members.length === 0) {
                const note = data.note ? `\n\n${data.note}` : '';
                const filterNote = modeText ? `\n\nNo staff matched this view: \`${modeText}\`.` : '';
                const e = new EmbedBuilder().setColor(THEME.DARK)
                    .setAuthor({ name: guild.name || serverId, iconURL: icon || undefined })
                    .setTitle('Staff Directory — No Results')
                    .setDescription(`No staff members found in **${guild.name || serverId}**.${note}${filterNote}\n\n💡 Use \`+stafftrack ${serverId}\` to start monitoring this server.`)
                    .setFooter({ text: `Requested by ${msg.author.username}` })
                    .setTimestamp();
                if (icon) e.setThumbnail(icon);
                await msg.reply({ embeds: [e] });
                return;
            }

            const pp = 10;
            const tp = Math.ceil(members.length / pp);

            const tempGuild = guild;
            const tempMembers = members;

            const buildEmbed = (p) => {
                const content = formatStaffList(tempMembers, tempGuild, p, tp, modeText);
                const e = new EmbedBuilder().setColor(THEME.CYAN)
                    .setAuthor({ name: `${tempGuild.name || serverId}  —  Staff Directory${viewSuffix}`, iconURL: icon || client.user.displayAvatarURL() })
                    .setDescription(content)
                    .setFooter({ text: `Live Scan  •  Requested by ${msg.author.username}` })
                    .setTimestamp();
                if (icon) e.setThumbnail(icon);
                return e;
            };

            const reply = await msg.reply({ embeds: [buildEmbed(0)], components: tp > 1 ? [navRow('stf_live', 0, tp)] : [] });
            paginate(reply, 'stf_live', Array(tp).fill(0), buildEmbed, msg.author.id);

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

    const pp = 10;
    const tp = Math.ceil(viewMembers.length / pp);

    const buildEmbed = (p) => {
        const content = formatStoredStaffList(serverId, p, tp, viewMembers, modeText);
        const e = new EmbedBuilder().setColor(THEME.CYAN)
            .setAuthor({ name: `${guild.name || serverId}  —  Staff Directory${viewSuffix}`, iconURL: icon || client.user.displayAvatarURL() })
            .setDescription(content)
            .setFooter({ text: `Cached Data  •  Requested by ${msg.author.username}` })
            .setTimestamp();
        if (icon) e.setThumbnail(icon);
        return e;
    };

    const reply = await msg.reply({ embeds: [buildEmbed(0)], components: tp > 1 ? [navRow('stf_cache', 0, tp)] : [] });
    paginate(reply, 'stf_cache', Array(tp).fill(0), buildEmbed, msg.author.id);
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
        const statusDot = m.voiceChannel ? '●' : '○';
        const rankTag   = m.isOwner ? ' [OWNER]' : '';
        const flagTag   = m.isBlacklisted ? ' [BLACKLISTED]' : '';

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
            `> ID       \`${m.user.id}\``,
            `> Roles    ${rolesDisplay}`,
            `> Joined   ${joined}`,
            `> Voice    ${voice}`
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
    return new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`prev_${prefix}`).setLabel('<').setStyle(ButtonStyle.Secondary).setDisabled(page === 0),
        new ButtonBuilder().setCustomId(`page_${prefix}`).setLabel(`${page + 1} / ${total}`).setStyle(ButtonStyle.Secondary).setDisabled(true),
        new ButtonBuilder().setCustomId(`next_${prefix}`).setLabel('>').setStyle(ButtonStyle.Secondary).setDisabled(page === total - 1)
    );
}

function paginate(replyMsg, prefix, items, buildEmbed, authorId, extraComponents) {
    let page = 0;
    const total = items.length;
    if (total <= 1) return;
    const collector = replyMsg.createMessageComponentCollector({ componentType: ComponentType.Button, time: 180000 });
    collector.on('collect', async (i) => {
        if (authorId && i.user.id !== authorId) {
            return i.reply({ content: 'Not authorized.', ephemeral: true });
        }
        if (i.customId === `prev_${prefix}` && page > 0) page--;
        else if (i.customId === `next_${prefix}` && page < total - 1) page++;
        else { await i.deferUpdate(); return; }
        await i.deferUpdate();
        const comps = total > 1 ? [navRow(prefix, page, total)] : [];
        if (extraComponents) { const ex = extraComponents(page); if (ex) comps.push(ex); }
        await replyMsg.edit({ embeds: [buildEmbed(page)], components: comps }).catch(() => null);
    });
}

// ===================== +help =====================
const HELP_COMMANDS = {
    user: [
        ['+cr <@user|id>', 'Audit dangerous permissions across shared servers'],
        ['+fallcheck <@user|id>', 'List mutual servers and join dates'],
        ['+track <@user|id>', 'Live voice channel tracking with join link'],
        ['+cv <@user|id>', 'Voice status check plus everyone in the channel'],
        ['+cs <@user|id>', 'Scan dangerous roles and active permissions'],
        ['+userinfo <@user|id>', 'Full user profile and mutual presence audit'],
        ['+ping', 'Check system latency and connection status']
    ],
    server: [
        ['+topma / +tma', 'Animated GIF voice activity leaderboard'],
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
            .setTitle('Command Center')
            .setDescription(
                `A complete Discord security and monitoring system.\n` +
                `**${TOTAL_COMMANDS}** commands across **3** categories.\n\n` +
                '**Quick Start**\n' +
                '`+cr <@user>` — instant permission audit'
            )
            .addFields([
                { name: 'User Tools', value: `**${HELP_COMMANDS.user.length}** commands`, inline: true },
                { name: 'Server Tools', value: `**${HELP_COMMANDS.server.length}** commands`, inline: true },
                { name: 'Role Tools', value: `**${HELP_COMMANDS.role.length}** commands`, inline: true }
            ]);
    }

    const cmds = HELP_COMMANDS[category] || [];
    embed.setTitle(meta.title);
    if (meta.desc) embed.setDescription(meta.desc);
    embed.addFields(cmds.map(([cmd, desc]) => ({ name: `\`${cmd}\``, value: desc })));
    return embed;
}

function buildHelpMenu(disabled = false) {
    return new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId(disabled ? 'help_category_off' : 'help_category')
            .setPlaceholder(disabled ? 'Session expired — run +help again' : 'Browse categories...')
            .setDisabled(disabled)
            .addOptions([
                { label: 'Overview', value: 'all', description: `${TOTAL_COMMANDS} commands in total` },
                { label: 'User Tools', value: 'user', description: `${HELP_COMMANDS.user.length} commands — scan, track, audit users` },
                { label: 'Server Tools', value: 'server', description: `${HELP_COMMANDS.server.length} commands — staff and server intel` },
                { label: 'Role Tools', value: 'role', description: `${HELP_COMMANDS.role.length} commands — roles and bots` }
            ])
    );
}

async function handleHelp(msg, args) {
    const query = (args || '').trim().toLowerCase();

    if (query) {
        const key = query.startsWith('+') ? query : `+${query}`;
        const hit = HELP_LOOKUP[key];
        if (!hit) {
            await msg.reply({ embeds: [addBanner(new EmbedBuilder()
                .setColor(THEME.DANGER)
                .setDescription(`No command found for \`${key}\`. Use \`+help\` to browse all categories.`))] });
            return;
        }
        const embed = helpAuthor(new EmbedBuilder()
            .setColor(THEME.PRIMARY)
            .setTitle(`Command Guide`)
            .addFields(
                { name: 'Command', value: `\`${hit.usage.split(' ')[0]}\`` },
                { name: 'Usage', value: `\`${hit.usage}\`` },
                { name: 'Description', value: hit.desc },
                { name: 'Category', value: HELP_CATEGORIES[hit.category].title }
            ));
        await msg.reply({ embeds: [embed] });
        return;
    }

    const menu = buildHelpMenu();
    const reply = await msg.reply({ embeds: [buildHelpEmbed('all')], components: [menu] });

    const collector = reply.createMessageComponentCollector({ componentType: ComponentType.StringSelect, time: 180000 });
    collector.on('collect', async (i) => {
        if (i.user.id !== msg.author.id) return i.reply({ content: 'Not authorized.', ephemeral: true });
        await i.update({ embeds: [buildHelpEmbed(i.values[0])], components: [menu] }).catch(() => null);
    });
    collector.on('end', () => {
        reply.edit({ components: [buildHelpMenu(true)] }).catch(() => null);
    });
}

// ===================== +ping =====================
async function handlePing(msg) {
    const s = Date.now();
    let cStatus = 'Online', cPing = 0;
    try { const t = Date.now(); await api.get('/ping', { timeout: 5000 }); cPing = Date.now() - t; } catch { cStatus = 'Offline'; }
    const embed = addBanner(new EmbedBuilder()
        .setColor(THEME.DARK)
        .setTitle('System Status')
        .setDescription(
            `**Bot Latency:** \`${Date.now() - s}ms\`\n` +
            `**WebSocket:** \`${client.ws.ping}ms\`\n` +
            `**Checker:** ${cStatus} \`${cPing}ms\``)
        .setTimestamp());
    await msg.reply({ embeds: [embed] });
}

// ===================== +servers =====================
async function handleServers(msg) {
    const token = await guard(msg, false, 'x', '');
    if (!token) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('No scanner token. Set it in `database.json`.'))] });
        return;
    }

    const wait = await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription('Fetching servers from user token...'))] });
    try {
        const res = await api.get('/guilds', { headers: { Authorization: token }, timeout: 30000 });
        const guilds = res.data || [];
        await wait.delete().catch(() => null);

        if (guilds.length === 0) {
            await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription('No servers found for this user token.'))] });
            return;
        }

        const sorted = guilds.sort((a, b) => (b.approximate_member_count || 0) - (a.approximate_member_count || 0));
        const pp = 10;
        const total = sorted.length;
        const tp = Math.ceil(total / pp);

        const buildEmbed = (p) => {
            const pageItems = sorted.slice(p * pp, (p + 1) * pp);
            let d = `## Servers (User Token)\n\n**Total:** \`${total}\`\n\n`;
            pageItems.forEach((g, i) => {
                const idx = (p * pp) + i + 1;
                d += `**${idx}.** ${g.name}\n`;
                d += `> ID: \`${g.id}\` - Members: \`${(g.approximate_member_count || '?').toLocaleString()}\`\n`;
                if (g.icon) d += `> Icon: [Link](${serverIcon(g.id, g.icon)})\n`;
                d += '\n';
            });
            return addBanner(new EmbedBuilder().setColor(THEME.PRIMARY)
                .setAuthor({ name: 'Kiliua - Server Directory (User Token)', iconURL: client.user.displayAvatarURL() })
                .setDescription(d)
                .setFooter({ text: `Page ${p + 1} of ${tp} | Requested by ${msg.author.username}` })
                .setTimestamp());
        };

        const reply = await msg.reply({ embeds: [buildEmbed(0)], components: tp > 1 ? [navRow('srv', 0, tp)] : [] });
        paginate(reply, 'srv', Array(tp).fill(0), buildEmbed, msg.author.id);
    } catch (e) {
        await wait.delete().catch(() => null);
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Error: \`${e.message}\``))] });
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
        .setTitle('Managed Bots')
        .setDescription(`**Total Bots:** \`${db.bots.length}\`\n\n` +
            db.bots.map((b, i) =>
                `**${i + 1}.** ${b.name}\n` +
                `> User: \`${b.username}\`\n` +
                `> ID: \`${b.clientId}\`\n` +
                `> Added: ${fmtRel(b.addedAt)}\n`
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


// ===================== +cr (DATABASE-FIRST) - PROFESSIONAL DESIGN =====================
async function handleCr(msg, args) {
    if (!hasAccess(msg.member)) return;
    const token = await guard(msg, true, args, '`+cr <@user|user_id>`');
    const userId = args.replace(/[<@!>]/g, '').trim();
    if (!/^\d{17,20}$/.test(userId)) {
        await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setAuthor({ name: getCustomEmoji('danger') + ' Invalid Input', iconURL: client.user.displayAvatarURL() }).setDescription('Please provide a valid User ID or @mention.').setTimestamp()] });
        return;
    }
    if (await denyProtectedUser(msg, userId)) return;
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) {
        await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setAuthor({ name: getCustomEmoji('danger') + ' User Not Found', iconURL: client.user.displayAvatarURL() }).setDescription('Could not find user with ID: ' + userId).setTimestamp()] });
        return;
    }

    async function buildProCrEmbed(srv, ap, source, pageN, totalN) {
        const srvIcon = serverIcon(srv.serverId, srv.serverIconHash, 256) || 'https://cdn.discordapp.com/embed/avatars/0.png';
        const userAvatar = user.displayAvatarURL({ dynamic: true, size: 256 });
        const dangerRoles = (srv.roles || []).filter(r => r.powers && r.powers.length > 0).sort((a, b) => (b.position || 0) - (a.position || 0));
        const rLines = dangerRoles.slice(0, 5).map(r => `- Role: ${r.name} | ID: ${r.id}`).join('\n') || 'None';

        const embed1 = new EmbedBuilder()
            .setColor(srv.isOwner ? THEME.GOLD : ap.length > 3 ? THEME.DANGER : THEME.PRIMARY)
            .setAuthor({ 
                name: `${getCustomEmoji('audit')} Role Audit: ${user.tag}`, 
                iconURL: userAvatar 
            })
            .setThumbnail(srvIcon)
            .setDescription(`
> ${getCustomEmoji('server')} **Server**
> **${srv.serverName}**
> \`ID:\` \`${srv.serverId}\`
> 
> ${getCustomEmoji('user')} <@${userId}> (\`${userId}\`)
            `)
            .addFields(
                {
                    name: `${getCustomEmoji('danger')} Key Permissions`,
                    value: '```diff\n' + (ap.slice(0, 8).map(p => '+ - ' + getPermDisplay(p)).join('\n') || '+ - None') + '\n```',
                    inline: false
                },
                {
                    name: `${getCustomEmoji('role')} Roles`,
                    value: '```markdown\n' + (rLines || '- None') + '\n```',
                    inline: false
                }
            )
            .setTimestamp();

        return { embeds: [embed1], files: [] };
    }

    const dbResults = [];
    for (const [serverId, data] of Object.entries(db.trackedServers)) {
        const member = data.members.find(m => m.user && m.user.id === userId);
        if (member) {
            const guild = data.guild || { roles: [] };
            const staffRolesMap = new Map();
            (guild.roles || []).filter(r => {
                const rp = BigInt(r.permissions);
                return (rp & (1n << 3n)) !== 0n || STAFF_PERMISSIONS.some(p => { const flag = ALL_PERMISSIONS[p]; return flag && (rp & flag) !== 0n; }) || (r.name && r.name.toLowerCase() === 'game mode');
            }).forEach(r => staffRolesMap.set(r.id, r));
            const memberRoles = (member.roles || []).filter(r => staffRolesMap.has(r.id)).map(r => ({ name: r.name, id: r.id, powers: STAFF_PERMISSIONS.filter(p => { const flag = ALL_PERMISSIONS[p]; const rp = BigInt(r.permissions || 0); return flag && ((rp & flag) !== 0n || (rp & (1n << 3n)) !== 0n); }) }));
            const activePerms = member.activePerms || [];
            dbResults.push({ serverName: data.guild?.name || serverId, serverId, isOwner: member.isOwner || false, roles: memberRoles, activePerms, serverIconHash: data.guild?.icon, joinedAt: member.joinedAt, permissions: Object.fromEntries(STAFF_PERMISSIONS.map(p => [p, activePerms.includes(p)])), allRoles: (member.roles || []).map(r => ({ name: r.name })) });
        }
    }

    if (dbResults.length > 0) {
        const filtered = dbResults.filter(srv => Object.entries(srv.permissions || {}).some(([k, v]) => v === true && !IGNORED_PERMISSIONS.includes(k.toUpperCase())));
        if (filtered.length === 0) {
            await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.SUCCESS).setAuthor({ name: getCustomEmoji('success') + ' Audit Complete - No Dangerous Permissions', iconURL: user.displayAvatarURL() }).setDescription('**' + user.tag + '** has no dangerous permissions in any cached server.').setFooter({ text: 'Requested by ' + msg.author.username + ' - Cached Data' }).setTimestamp()] });
            return;
        }
        const getAp = (srv) => Object.entries(srv.permissions || {}).filter(([k, v]) => v === true && !IGNORED_PERMISSIONS.includes(k.toUpperCase())).map(([k]) => k);
        const { embeds: es, files: ff } = await buildProCrEmbed(filtered[0], getAp(filtered[0]), 'Cached Data', 0, filtered.length);
        const reply = await msg.reply({ embeds: es, files: ff, components: filtered.length > 1 ? [navRow('cr', 0, filtered.length)] : [] });
        if (filtered.length > 1) {
            let page = 0;
            const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 180000 });
            collector.on('collect', async (i) => {
                if (i.user.id !== msg.author.id) return i.reply({ content: 'Not authorized.', ephemeral: true });
                if (i.customId === 'prev_cr' && page > 0) page--;
                else if (i.customId === 'next_cr' && page < filtered.length - 1) page++;
                else { await i.deferUpdate(); return; }
                await i.deferUpdate();
                const { embeds: nes, files: nf } = await buildProCrEmbed(filtered[page], getAp(filtered[page]), 'Cached Data', page, filtered.length);
                await reply.edit({ embeds: nes, files: nf, components: [navRow('cr', page, filtered.length)] }).catch(() => null);
            });
        }
        return;
    }

    if (!token) {
        await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setAuthor({ name: getCustomEmoji('danger') + ' No Scanner Token', iconURL: client.user.displayAvatarURL() }).setDescription('User not found in cached data and no scanner token is available.').setTimestamp()] });
        return;
    }
    const wait = await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.PRIMARY).setAuthor({ name: getCustomEmoji('audit') + ' Role Audit - Live Fetch', iconURL: client.user.displayAvatarURL() }).setDescription('Fetching live permission data for **' + user.tag + '**...').setTimestamp()] });
    try {
        const res = await api.get('/check', { headers: { Authorization: token }, params: { userId, userTag: user.tag, fullScan: 'true' }, timeout: 300000 });
        await wait.delete().catch(() => null);
        const results = res.data.results || [];
        const filtered = [];
        for (const srv of results) {
            const ap = Object.entries(srv.permissions || {}).filter(([k, v]) => v === true && !IGNORED_PERMISSIONS.includes(k.toUpperCase())).map(([k]) => k);
            if (ap.length > 0) filtered.push({ srv, ap });
        }
        if (filtered.length === 0) {
            await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.SUCCESS).setAuthor({ name: getCustomEmoji('success') + ' Audit Complete - Clean', iconURL: user.displayAvatarURL() }).setDescription('**' + user.tag + '** has no dangerous permissions in any shared server.').setTimestamp()] });
            return;
        }
        const { embeds: es, files: ff } = await buildProCrEmbed(filtered[0].srv, filtered[0].ap, 'Live Scan', 0, filtered.length);
        const reply = await msg.reply({ embeds: es, files: ff, components: filtered.length > 1 ? [navRow('cr', 0, filtered.length)] : [] });
        if (filtered.length > 1) {
            let page = 0;
            const collector = reply.createMessageComponentCollector({ componentType: ComponentType.Button, time: 180000 });
            collector.on('collect', async (i) => {
                if (i.user.id !== msg.author.id) return i.reply({ content: 'Not authorized.', ephemeral: true });
                if (i.customId === 'prev_cr' && page > 0) page--;
                else if (i.customId === 'next_cr' && page < filtered.length - 1) page++;
                else { await i.deferUpdate(); return; }
                await i.deferUpdate();
                const { embeds: nes, files: nf } = await buildProCrEmbed(filtered[page].srv, filtered[page].ap, 'Live Scan', page, filtered.length);
                await reply.edit({ embeds: nes, files: nf, components: [navRow('cr', page, filtered.length)] }).catch(() => null);
            });
        }
    } catch (e) {
        await wait.delete().catch(() => null);
        await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setAuthor({ name: getCustomEmoji('danger') + ' Scan Error', iconURL: client.user.displayAvatarURL() }).setDescription('```' + e.message + '```').setTimestamp()] });
    }
}



// ===================== +fallcheck (Database-first) =====================
async function handleFallcheck(msg, args) {
    if (!hasAccess(msg.member)) return;
    const token = await guard(msg, true, args, '`+fallcheck <@user|user_id>`');
    const userId = args.replace(/[<@!>]/g, '').trim();
    if (!/^\d{17,20}$/.test(userId)) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('Invalid user ID.'))] });
        return;
    }
    if (await denyProtectedUser(msg, userId)) return;
    const user = await client.users.fetch(userId).catch(() => null);
    if (!user) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('User not found.'))] });
        return;
    }

    // DB first
    const dbResults = [];
    for (const [serverId, data] of Object.entries(db.trackedServers)) {
        const member = data.members.find(m => m.user && m.user.id === userId);
        if (member) {
            dbResults.push({
                serverName: data.guild?.name || serverId,
                serverId: serverId,
                joinedAt: member.joinedAt,
                allRoles: (member.roles || []).map(r => ({ name: r.name })),
                serverIconHash: data.guild?.icon,
                permissions: {}
            });
        }
    }

    if (dbResults.length > 0) {
        const buildEmbed = (p) => {
            const srv = dbResults[p];
            const roles = srv.allRoles && srv.allRoles.length > 0 ? srv.allRoles.map(r => `\`${r.name}\``).join(', ') : '`None`';
            const icon = serverIcon(srv.serverId, srv.serverIconHash) || 'https://cdn.discordapp.com/embed/avatars/0.png';
            return new EmbedBuilder().setColor(THEME.DARK)
                .setAuthor({ name: `FALLCHECK (Cached) -- ${user.tag}`, iconURL: user.displayAvatarURL({ dynamic: true }) })
                .setTitle(srv.serverName)
                .setDescription(`**Server ID:** \`${srv.serverId}\`\n\n**Joined:**\n> ${fmtDate(srv.joinedAt)} (${fmtRel(srv.joinedAt)})\n\n**Roles:**\n> ${roles.length > 1500 ? roles.slice(0, 1490) + '...' : roles}`)
                .setThumbnail(icon)
                .setFooter({ text: `Server ${p + 1} of ${dbResults.length} | Requested by ${msg.author.username}` })
                .setTimestamp();
        };

        const reply = await msg.reply({ embeds: [buildEmbed(0)], components: dbResults.length > 1 ? [navRow('fall', 0, dbResults.length)] : [] });
        paginate(reply, 'fall', dbResults, buildEmbed, msg.author.id);
        return;
    }

    // Fallback to API
    if (!token) {
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('User not found in cached data and no scanner token available for live fetch.'))] });
        return;
    }

    const wait = await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription(`Scanning mutual servers for **${user.tag}** (live)...`))] });
    try {
        const res = await api.get('/check', { headers: { Authorization: token }, params: { userId, userTag: user.tag, fullScan: 'true' }, timeout: 300000 });
        await wait.delete().catch(() => null);
        const results = res.data.results || [];
        if (results.length === 0) {
            await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription(`No shared servers found for **${user.tag}**.`))] });
            return;
        }

        const buildEmbed = (p) => {
            const srv = results[p];
            const roles = srv.allRoles && srv.allRoles.length > 0 ? srv.allRoles.map(r => `\`${r.name}\``).join(', ') : '`None`';
            const icon = serverIcon(srv.serverId, srv.serverIconHash) || 'https://cdn.discordapp.com/embed/avatars/0.png';
            return new EmbedBuilder().setColor(THEME.DARK)
                .setAuthor({ name: `FALLCHECK (Live) -- ${user.tag}`, iconURL: user.displayAvatarURL({ dynamic: true }) })
                .setTitle(srv.serverName)
                .setDescription(`**Server ID:** \`${srv.serverId}\`\n\n**Joined:**\n> ${fmtDate(srv.joinedAt)} (${fmtRel(srv.joinedAt)})\n\n**Roles:**\n> ${roles.length > 1500 ? roles.slice(0, 1490) + '...' : roles}`)
                .setThumbnail(icon)
                .setFooter({ text: `Server ${p + 1} of ${results.length} | Requested by ${msg.author.username}` })
                .setTimestamp();
        };

        const reply = await msg.reply({ embeds: [buildEmbed(0)], components: results.length > 1 ? [navRow('fall', 0, results.length)] : [] });
        paginate(reply, 'fall', results, buildEmbed, msg.author.id);
    } catch (e) { await wait.delete().catch(() => null);
        await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Error: \`${e.message}\``))] });
    }
}

// ===================== Other commands (track, roletrack, checkid, cs, cv, perms, topma, serverinfo, userinfo, botstats) =====================
// These remain essentially the same as in earlier versions; we keep them for completeness.
// I'll include them with minimal changes (they still use token where needed, but could be adapted to DB later).

async function handleTrack(msg, args) {
    if (!hasAccess(msg.member)) return;
    if (msg.channel.type === ChannelType.DM) return;
    const userId = args.replace(/[<@!>]/g, '').trim();
    if (!/^\d{17,20}$/.test(userId)) {
        return msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Usage: `+track <user_id>`')] });
    }
    const token = config.checker_user_token || config.fallback_user_token;
    if (!token) {
        const inVoice = [];
        for (const [id, guild] of msg.client.guilds.cache) {
            const vs = guild.voiceStates.cache.get(userId);
            if (vs && vs.channel) {
                inVoice.push({ serverName: guild.name, channelName: vs.channel.name });
            }
        }
        if (inVoice.length > 0) {
            let desc = `User <@${userId}> is in:\n`;
            inVoice.forEach(v => desc += `**${v.serverName}** -> \`${v.channelName}\`\n`);
            return msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.SUCCESS).setDescription(desc)] });
        }
        return msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Scanner token missing.')] });
    }
    const wait = await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription(`🔍 Tracking user \`${userId}\` in voice channels...`))] });
    try {
        const res = await api.get('/voice-states', { headers: { Authorization: token }, params: { userId }, timeout: 60000 });
        if (res.data.error) return wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Error: ${res.data.error}`)] });
        const results = res.data.results || [];
        if (results.length === 0) return wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DARK).setDescription(`User \`${userId}\` is not currently in any tracked voice channels.`)] });
        const embed = new EmbedBuilder().setColor(THEME.SUCCESS).setTitle(`Voice Tracking Results for ${userId}`).setDescription(`Found in **${results.length}** voice channels.`);
        results.forEach((r, idx) => {
            if (idx < 25) {
                embed.addFields({ name: r.serverName || 'Unknown Server', value: `Channel: **${r.currentChannel?.name || 'Private Channel'}**\nMembers in VC: ${r.voiceMembers?.length || 1}`, inline: false });
            }
        });
        await wait.edit({ embeds: [addBanner(embed)] });
    } catch (e) {
        await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Error: ${e.message}`)] });
    }
}
async function handleRoleTrack(msg, args) {
    if (!hasAccess(msg.member)) return;
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
            .setDescription(`Found **${members.length}** members holding this role.\n\n` + members.slice(0, 20).map(m => `- <@${m.id}> (\`${m.id}\`)`).join('\n'))
            .setTimestamp();
        await msg.reply({ embeds: [embed] });
    } catch (e) {
        await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Error: ' + e.message)] }).catch(() => null);
    }
}

async function handleCheckId(msg, args) {
    if (!hasAccess(msg.member)) return;
    const parts = args.trim().split(/\s+/);
    const serverId = parts[0];
    const roleId = parts[1]?.replace(/[<@&>]/g, '');
    if (!serverId || !roleId || !/^\d{17,20}$/.test(serverId) || !/^\d{17,20}$/.test(roleId)) {
        return msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Usage: `+checkid <server_id> <role_id>`')] });
    }
    const token = await guard(msg, true, args, '`+checkid <server_id> <role_id>`');
    if (!token) return;

    const wait = await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DARK).setDescription('Checking role members in server...')] });
    try {
        const res = await api.get('/checkid', { headers: { Authorization: token }, params: { serverId, roleId }, timeout: 60000 });
        const data = res.data;
        await wait.delete().catch(() => null);
        const embed = new EmbedBuilder()
            .setColor(THEME.PRIMARY)
            .setAuthor({ name: 'Role Member Check', iconURL: client.user.displayAvatarURL() })
            .setDescription(`Server: \`${serverId}\`\nRole ID: \`${roleId}\`\nTotal Members: **${data.count || 0}**`)
            .setTimestamp();
        await msg.reply({ embeds: [embed] });
    } catch (e) {
        await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Error: ' + e.message)] }).catch(() => null);
    }
}

async function handlePerms(msg, args) {
    if (!hasAccess(msg.member)) return;
    const parts = args.trim().split(/\s+/);
    const serverId = parts[0];
    const userId = parts[1]?.replace(/[<@!>]/g, '');
    if (!serverId || !userId || !/^\d{17,20}$/.test(serverId) || !/^\d{17,20}$/.test(userId)) {
        return msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Usage: `+perms <server_id> <@user|id>`')] });
    }
    const token = await guard(msg, true, args, '`+perms <server_id> <@user|id>`');
    if (!token) return;

    const wait = await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DARK).setDescription('Checking exact member permissions...')] });
    try {
        const res = await api.get('/perms', { headers: { Authorization: token }, params: { serverId, userId }, timeout: 60000 });
        const perms = res.data.permissions || [];
        await wait.delete().catch(() => null);
        const embed = new EmbedBuilder()
            .setColor(THEME.PRIMARY)
            .setAuthor({ name: 'Exact Member Permissions', iconURL: client.user.displayAvatarURL() })
            .setDescription(`User: <@${userId}>\nServer ID: \`${serverId}\`\n\n\`\`\`diff\n` + (perms.map(p => '+ ' + p).join('\n') || '+ None') + `\n\`\`\``)
            .setTimestamp();
        await msg.reply({ embeds: [embed] });
    } catch (e) {
        await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Error: ' + e.message)] }).catch(() => null);
    }
}

// ===================== +cs =====================
async function handleCs(msg, args) {
    if (!hasAccess(msg.member)) return;
    const token = await guard(msg, true, args, '`+cs <@user|id>`');
    if (!token) return;
    const userId = args.replace(/[<@!>]/g, '').trim();
    if (!/^\d{17,20}$/.test(userId)) {
        return msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('Invalid user ID.'))] });
    }
    if (await denyProtectedUser(msg, userId)) return;
    let user = null;
    try { user = await client.users.fetch(userId); } catch {}

    const wait = await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription(`Scanning dangerous roles and permissions for **${user ? user.tag : userId}**...\nThis may take a while.`))] });
    try {
        const res = await api.get('/cs', { headers: { Authorization: token }, params: { userId }, timeout: 600000 });
        await wait.delete().catch(() => null);
        const results = res.data.results || [];

        if (results.length === 0) {
            const e = new EmbedBuilder().setColor(THEME.SUCCESS)
                .setAuthor({ name: `Audit Complete - Clean`, iconURL: user ? user.displayAvatarURL() : client.user.displayAvatarURL() })
                .setDescription(`**${user ? user.tag : userId}** has no dangerous permissions in any shared server.`)
                .setTimestamp();
            return msg.reply({ embeds: [e] });
        }

        const buildEmbed = (p) => {
            const s = results[p];
            let d = '';
            if (s.isOwner) d += '```diff\n+ SERVER OWNER\n```';
            for (const role of s.roles || []) {
                if (role.id === 'owner') continue;
                const powers = role.powers || [];
                d += `**${role.name}**\n`;
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
        await wait.edit({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Error: \`${e.message}\``))] }).catch(() => null);
    }
}

// ===================== +cv =====================
async function handleCv(msg, args) {
    if (!hasAccess(msg.member)) return;
    const token = await guard(msg, true, args, '`+cv <@user|id>`');
    if (!token) return;
    const userId = args.replace(/[<@!>]/g, '').trim();
    if (!/^\d{17,20}$/.test(userId)) {
        return msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('Invalid user ID.'))] });
    }
    if (await denyProtectedUser(msg, userId)) return;
    let user = null;
    try { user = await client.users.fetch(userId); } catch {}

    const wait = await msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DARK).setDescription(`Checking voice status for **${user ? user.tag : userId}**...`))] });
    try {
        const res = await api.get('/cv', { headers: { Authorization: token }, params: { userId }, timeout: 120000 });
        await wait.delete().catch(() => null);
        const results = res.data.results || [];

        if (results.length === 0) {
            const e = new EmbedBuilder().setColor(THEME.DARK)
                .setAuthor({ name: `Voice Status`, iconURL: user ? user.displayAvatarURL() : client.user.displayAvatarURL() })
                .setDescription(`**${user ? user.tag : userId}** is not connected to any voice channel in the scanned servers.`)
                .setTimestamp();
            return msg.reply({ embeds: [e] });
        }

        const buildEmbed = (p) => {
            const r = results[p];
            const chName = r.currentChannel?.isHidden ? 'Private Channel' : `#${r.currentChannel?.name || 'unknown'}`;
            const membersList = (r.voiceMembers || []).map(v => `<@${v.id}>`).join(' ');
            const count = (r.voiceMembers || []).length;
            const icon = serverIcon(r.serverId, r.serverIconHash);
            const e = new EmbedBuilder().setColor(THEME.SUCCESS)
                .setAuthor({ name: `${r.serverName} — In Voice`, iconURL: user ? user.displayAvatarURL() : client.user.displayAvatarURL() })
                .setDescription(
                    `**Channel:** ${chName}\n` +
                    `> ID: \`${r.currentChannel?.id}\`\n\n` +
                    `**Members in channel (${count}):**\n> ${membersList.slice(0, 1000) || 'Unknown'}`
                )
                .setFooter({ text: `Server ${p + 1} of ${results.length} | Requested by ${msg.author.username}` })
                .setTimestamp();
            if (icon) e.setThumbnail(icon);
            return e;
        };

        const reply = await msg.reply({ embeds: [buildEmbed(0)], components: results.length > 1 ? [navRow('cvv', 0, results.length)] : [] });
        paginate(reply, 'cvv', Array(results.length).fill(0), buildEmbed, msg.author.id);
    } catch (e) {
        await wait.edit({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Error: \`${e.message}\``))] }).catch(() => null);
    }
}

// ===================== +tma (Animated GIF leaderboard) =====================
async function handleTma(msg) {
    if (!hasAccess(msg.member)) return;
    if (msg.channel.type === ChannelType.DM) return;

    const token = await guard(msg, false, 'x', '`+tma`');
    if (!token) return;

    const wait = await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DARK).setDescription('Generating Animated Voice Leaderboard (GIF)...\nThis may take a few seconds.')] });
    try {
        const res = await api.get('/tma', { headers: { Authorization: token }, timeout: 60000 });
        const results = res.data.results || [];

        if (results.length === 0) {
            await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('No servers found or no voice activity.')] });
            return;
        }

        const width = 800;
        const topCount = Math.min(results.length, 10);
        const height = 180 + (topCount * 65);
        const sliceData = results.slice(0, topCount);

        // Preload server icons once
        const iconImgs = [];
        for (const s of sliceData) {
            if (s.icon) {
                try {
                    iconImgs.push(await loadImage(`https://cdn.discordapp.com/icons/${s.id}/${s.icon}.${s.icon.startsWith('a_') ? 'gif' : 'png'}?size=64`));
                } catch { iconImgs.push(null); }
            } else {
                iconImgs.push(null);
            }
        }

        // Animated background layer
        function drawAnimatedBackground(ctx, t) {
            const gradient = ctx.createLinearGradient(0, 0, width, height);
            gradient.addColorStop(0, '#0b1120');
            gradient.addColorStop(0.5, '#171233');
            gradient.addColorStop(1, '#090d16');
            ctx.fillStyle = gradient;
            ctx.fillRect(0, 0, width, height);

            const orb = (cx, cy, r, color) => {
                const rg = ctx.createRadialGradient(cx, cy, 0, cx, cy, r);
                rg.addColorStop(0, color);
                rg.addColorStop(1, 'rgba(0,0,0,0)');
                ctx.fillStyle = rg;
                ctx.fillRect(0, 0, width, height);
            };
            orb(width * .5 + Math.cos(t) * width * .38, height * .25 + Math.sin(t * 1.3) * height * .18, Math.max(width, height) * .45, 'rgba(99,102,241,0.30)');
            orb(width * .5 + Math.cos(t + Math.PI) * width * .38, height * .8 + Math.sin(t * .8 + 2) * height * .15, Math.max(width, height) * .40, 'rgba(168,85,247,0.24)');

            // moving light sweep
            ctx.save();
            ctx.globalAlpha = 0.06;
            ctx.fillStyle = '#ffffff';
            const sx = ((t / (Math.PI * 2)) * (width * 2)) - width * 0.5;
            ctx.beginPath();
            ctx.moveTo(sx, 0);
            ctx.lineTo(sx + 180, 0);
            ctx.lineTo(sx + 80, height);
            ctx.lineTo(sx - 100, height);
            ctx.closePath();
            ctx.fill();
            ctx.restore();
        }

        function drawFrame(t) {
            const canvas = createCanvas(width, height);
            const ctx = canvas.getContext('2d');

            drawAnimatedBackground(ctx, t);

            // frame border
            ctx.strokeStyle = '#6366f1';
            ctx.lineWidth = 3;
            ctx.strokeRect(15, 15, width - 30, height - 30);

            // title
            ctx.fillStyle = '#ffffff';
            ctx.font = 'bold 28px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('SERVER VOICE ACTIVITY LEADERBOARD', width / 2, 60);

            ctx.fillStyle = '#94a3b8';
            ctx.font = '15px sans-serif';
            ctx.fillText('Top active servers ranked by active voice participants', width / 2, 90);

            ctx.strokeStyle = '#334155';
            ctx.lineWidth = 1;
            ctx.beginPath();
            ctx.moveTo(50, 115);
            ctx.lineTo(width - 50, 115);
            ctx.stroke();

            let startY = 145;
            for (let i = 0; i < sliceData.length; i++) {
                const s = sliceData[i];
                const rank = i + 1;

                ctx.fillStyle = i === 0 ? 'rgba(99, 102, 241, 0.2)' : (i === 1 ? 'rgba(168, 85, 247, 0.15)' : (i === 2 ? 'rgba(236, 72, 153, 0.1)' : 'rgba(30, 41, 59, 0.5)'));
                ctx.beginPath();
                ctx.roundRect(40, startY, width - 80, 50, 8);
                ctx.fill();

                const img = iconImgs[i];
                if (img) {
                    try {
                        ctx.save();
                        ctx.beginPath();
                        ctx.arc(85, startY + 25, 18, 0, Math.PI * 2);
                        ctx.closePath();
                        ctx.clip();
                        ctx.drawImage(img, 67, startY + 7, 36, 36);
                        ctx.restore();
                    } catch {}
                }

                if (rank === 1) ctx.fillStyle = '#f59e0b';
                else if (rank === 2) ctx.fillStyle = '#94a3b8';
                else if (rank === 3) ctx.fillStyle = '#b45309';
                else ctx.fillStyle = '#64748b';

                ctx.font = 'bold 18px sans-serif';
                ctx.textAlign = 'left';
                ctx.fillText(`#${rank}`, img ? 115 : 65, startY + 32);

                ctx.fillStyle = '#f8fafc';
                ctx.font = 'bold 18px sans-serif';
                let serverName = s.name.length > 28 ? s.name.substring(0, 28) + '...' : s.name;
                ctx.fillText(serverName, img ? 165 : 120, startY + 32);

                ctx.fillStyle = '#38bdf8';
                ctx.font = 'bold 18px sans-serif';
                ctx.textAlign = 'right';
                ctx.fillText(`${s.activeVoice} Active`, width - 65, startY + 32);

                startY += 62;
            }

            ctx.fillStyle = '#64748b';
            ctx.font = '13px sans-serif';
            ctx.textAlign = 'center';
            ctx.fillText('Generated automatically by Kiliua Checker & Intelligence Bot', width / 2, height - 20);

            return canvas;
        }

        // Encode animated GIF
        const FRAMES = 20;
        const encoder = new GIFEncoder(width, height, 'octree');
        encoder.start();
        encoder.setRepeat(0);
        encoder.setDelay(80);
        encoder.setQuality(15);
        for (let f = 0; f < FRAMES; f++) {
            const t = (f / FRAMES) * Math.PI * 2;
            encoder.addFrame(drawFrame(t).getContext('2d'));
        }
        encoder.finish();
        const buffer = encoder.out.getData();

        await wait.delete().catch(() => null);
        await msg.reply({ files: [new AttachmentBuilder(buffer, { name: 'tma-leaderboard.gif' })] });
    } catch (e) {
        await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Error: ' + e.message)] }).catch(() => null);
    }
}
// ===================== +tmav1 (Stacked embeds matching reference design perfectly) =====================
async function handleTmaV1(msg) {
    if (!hasAccess(msg.member)) return;
    if (msg.channel.type === ChannelType.DM) return;

    const token = await guard(msg, false, 'x', '`+tmav1`');
    if (!token) return;

    const wait = await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.DARK).setDescription('Building Voice Leaderboard...')] });
    try {
        const res = await api.get('/tma', { headers: { Authorization: token }, timeout: 60000 });
        const results = res.data.results || [];

        if (results.length === 0) {
            await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('No servers found or no voice activity.')] });
            return;
        }

        const top = results.slice(0, 10); // Discord maximum limit is 10 embeds in 1 message

        const buildServerEmbed = (s, i, total) => {
            const humans = (s.activeVoiceHumans ?? s.activeVoice) || 0;

            let desc = `│ ➔ **${humans}** members in voice`;
            if (s.botsInVoice > 0) desc += ` • **${s.botsInVoice}** bots`;
            if (s.freshAccounts > 0) desc += ` • ⚠️ **${s.freshAccounts}** <7d`;

            // Uniform full width padding so all thumbnails align on the right
            desc += '\n' + '\u2800'.repeat(28);

            const embed = new EmbedBuilder()
                .setColor('#2b2d31') // Discord dark background color
                .setTitle(`${i + 1} • ${s.name}`)
                .setDescription(desc);

            if (s.icon) {
                const isGif = s.icon.startsWith('a_');
                embed.setThumbnail(`https://cdn.discordapp.com/icons/${s.id}/${s.icon}.${isGif ? 'gif' : 'png'}?size=256`);
            }

            // Only the very last card gets the footer
            if (i === total - 1) {
                embed.setFooter({ text: `Requested by ${msg.author.username}` });
            }

            return embed;
        };

        const embeds = top.map((s, i) => buildServerEmbed(s, i, top.length));

        await wait.delete().catch(() => null);

        await msg.reply({
            content: `🔊 __**Voice Leaderboard:**__\nKiliua Security Intelligence`,
            embeds: embeds
        });
    } catch (e) {
        await wait.edit({ embeds: [new EmbedBuilder().setColor(THEME.DANGER).setDescription('Error: ' + e.message)] }).catch(() => null);
    }
}
// ===================== +serverinfo =====================
async function handleServerInfo(msg, args) {
    if (!hasAccess(msg.member)) return;
    const serverId = (args || '').trim();
    if (!/^\d{17,20}$/.test(serverId)) {
        return msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('Usage: `+serverinfo <server_id>`'))] });
    }
    const stored = db.trackedServers[serverId];
    const cached = client.guilds.cache.get(serverId);
    const guild = stored?.guild || (cached ? { id: cached.id, name: cached.name, icon: cached.icon, memberCount: cached.memberCount, roles: [...cached.roles.cache.values()] } : null);

    if (!guild) {
        return msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription(`Server \`${serverId}\` is not tracked and not in cache. Use \`+stafftrack ${serverId}\` first.`))] });
    }

    const icon = serverIcon(guild.id, guild.icon);
    const members = stored?.members || [];
    const owners = members.filter(m => m.isOwner).length;
    const admins = members.filter(m => !m.isOwner && m.activePerms && m.activePerms.includes('ADMINISTRATOR')).length;
    const mods = members.filter(m => !m.isOwner && !(m.activePerms || []).includes('ADMINISTRATOR')).length;
    const inVoice = members.filter(m => m.voiceChannel).length;
    const liteMods = members.filter(isLiteModMember).length;

    let rolesDisplay = '—';
    const roleList = (guild.roles || []).filter(r => r.name !== '@everyone').sort((a, b) => (b.position || 0) - (a.position || 0));
    if (roleList.length > 0) {
        rolesDisplay = roleList.slice(0, 15).map(r => `\`${r.name}\``).join(', ');
        if (roleList.length > 15) rolesDisplay += ` +${roleList.length - 15} more`;
    }

    const e = new EmbedBuilder().setColor(THEME.PRIMARY)
        .setAuthor({ name: guild.name || serverId, iconURL: icon || client.user.displayAvatarURL() })
        .setDescription(`**Server ID:** \`${guild.id}\``)
        .addFields(
            { name: 'Members', value: `\`${guild.memberCount || '?'}\``, inline: true },
            { name: 'Roles', value: `\`${roleList.length}\``, inline: true },
            { name: 'Staff Tracked', value: `\`${members.length}\``, inline: true },
            { name: 'Owners / Admins / Mods', value: `\`${owners} / ${admins} / ${mods}\``, inline: true },
            { name: 'In Voice', value: `\`${inVoice}\``, inline: true },
            { name: 'Lite-Mod Roles', value: `\`${liteMods}\``, inline: true },
            { name: 'Top Roles', value: rolesDisplay.length > 1024 ? rolesDisplay.slice(0, 1020) + '...' : rolesDisplay }
        )
        .setFooter({
            text: stored ? `Cached data from ${fmtRel(stored.lastUpdate)} | Requested by ${msg.author.username}` : `Live guild cache | Requested by ${msg.author.username}`
        })
        .setTimestamp();
    if (icon) e.setThumbnail(icon);
    await msg.reply({ embeds: [e] });
}

// ===================== +userinfo =====================
async function handleUserInfo(msg, args) {
    if (!hasAccess(msg.member)) return;
    const userId = (args || '').replace(/[<@!>]/g, '').trim();
    if (!/^\d{17,20}$/.test(userId)) {
        return msg.reply({ embeds: [addBanner(new EmbedBuilder().setColor(THEME.DANGER).setDescription('Usage: `+userinfo <@user|id>`'))] });
    }
    const user = await client.users.fetch(userId).catch(() => null);

    const memberships = [];
    for (const [sid, data] of Object.entries(db.trackedServers)) {
        const m = (data.members || []).find(x => x.user && x.user.id === userId);
        if (!m) continue;
        memberships.push({
            serverName: data.guild?.name || sid,
            serverId: sid,
            iconHash: data.guild?.icon,
            isOwner: !!m.isOwner,
            joinedAt: m.joinedAt,
            voiceChannel: m.voiceChannel,
            activePerms: m.activePerms || [],
            roles: (m.roles || []).map(r => r.name),
            isLiteMod: isLiteModMember(m)
        });
    }

    const createdTs = Number((BigInt(userId) >> 22n) + 1420070400000n);
    const e = new EmbedBuilder().setColor(THEME.PRIMARY)
        .setAuthor({ name: user ? user.tag : `User ${userId}`, iconURL: user ? user.displayAvatarURL() : client.user.displayAvatarURL() })
        .setThumbnail(user ? user.displayAvatarURL({ size: 256 }) : null)
        .setDescription(`**ID:** \`${userId}\`\n**Account Created:** ${fmtDate(createdTs)} (${fmtRel(createdTs)})`)
        .addFields(
            { name: 'Tracked Servers', value: `\`${memberships.length}\``, inline: true },
            { name: 'Owner In', value: `\`${memberships.filter(x => x.isOwner).length}\``, inline: true },
            { name: 'In Voice', value: `\`${memberships.filter(x => x.voiceChannel).length}\``, inline: true }
        )
        .setFooter({ text: `Requested by ${msg.author.username}` })
        .setTimestamp();

    if (memberships.length > 0) {
        const lines = memberships.slice(0, 10).map(x =>
            `**${x.serverName}**${x.isOwner ? ' `[OWNER]`' : ''}${x.isLiteMod ? ' `[LITE-MOD]`' : ''}\n` +
            `> Joined: ${x.joinedAt ? fmtRel(x.joinedAt) : '—'} • Voice: ${x.voiceChannel ? `\`${x.voiceChannel.name}\`` : '`—`'} • Perms: \`${x.activePerms.length}\``
        ).join('\n\n');
        e.addFields({ name: `Staff Memberships (${memberships.length})`, value: lines.length > 1024 ? lines.slice(0, 1020) + '...' : lines });
    } else {
        e.addFields({ name: 'Staff Memberships', value: 'Not a staff member in any tracked server.' });
    }

    await msg.reply({ embeds: [e] });
}

// ===================== +botstats =====================
async function handleBotStats(msg) {
    if (!hasAccess(msg.member)) return;
    if (msg.channel.type === ChannelType.DM) return;

    const up = process.uptime();
    const d = Math.floor(up / 86400), h = Math.floor((up % 86400) / 3600), m = Math.floor((up % 3600) / 60);
    const mem = process.memoryUsage();
    const tracked = Object.keys(db.trackedServers);
    const totalStaff = tracked.reduce((n, sid) => n + (db.trackedServers[sid].members || []).length, 0);
    const totalVoice = tracked.reduce((n, sid) => n + (db.trackedServers[sid].members || []).filter(mm => mm.voiceChannel).length, 0);

    const e = addBanner(new EmbedBuilder()
        .setColor(THEME.DARK)
        .setTitle('Bot Statistics')
        .addFields(
            { name: 'Uptime', value: `\`${d}d ${h}h ${m}m\``, inline: true },
            { name: 'Memory', value: `\`${(mem.rss / 1048576).toFixed(1)} MB\``, inline: true },
            { name: 'WebSocket Ping', value: `\`${client.ws.ping}ms\``, inline: true },
            { name: 'Guilds', value: `\`${client.guilds.cache.size}\``, inline: true },
            { name: 'Cached Users', value: `\`${client.users.cache.size}\``, inline: true },
            { name: 'Voice Connections', value: `\`${client.guilds.cache.filter(g => !!getVoiceConnection(g.id)).size}\``, inline: true },
            { name: 'Tracked Servers', value: `\`${tracked.length}\``, inline: true },
            { name: 'Staff Entries', value: `\`${totalStaff}\``, inline: true },
            { name: 'Staff In Voice', value: `\`${totalVoice}\``, inline: true },
            { name: 'Managed Bots', value: `\`${(db.bots || []).length}\``, inline: true },
            { name: 'Scanner Tokens', value: `\`${Object.keys(db.userTokens).length}\``, inline: true },
            { name: 'Node.js', value: `\`${process.version}\``, inline: true }
        )
        .setFooter({ text: `Command busy: ${isCommandActive() ? 'yes' : 'no'} | Requested by ${msg.author.username}` })
        .setTimestamp());
    await msg.reply({ embeds: [e] });
}

// ===================== CONFIG SETTINGS COMMANDS =====================
function saveConfig() {
    fs.writeFileSync('config.json', JSON.stringify(config, null, 2));
}

async function handleSetLog(msg, args) {
    if (!isOwner(msg.member)) return;
    const channelId = args.replace(/[<#>]/g, '');
    config.log_channel_id = channelId;
    saveConfig();
    await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.SUCCESS).setDescription(`Log channel set to <#${channelId}>`)] });
}

async function handleSetDanger(msg, args) {
    if (!isOwner(msg.member)) return;
    const roleId = args.replace(/[<@&>]/g, '');
    config.dangerous_role_id = roleId;
    saveConfig();
    await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.SUCCESS).setDescription(`Dangerous role set to <@&${roleId}>`)] });
}

async function handleSetClean(msg, args) {
    if (!isOwner(msg.member)) return;
    const roleId = args.replace(/[<@&>]/g, '');
    config.clean_role_id = roleId;
    saveConfig();
    await msg.reply({ embeds: [new EmbedBuilder().setColor(THEME.SUCCESS).setDescription(`Clean role set to <@&${roleId}>`)] });
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
            .setTitle('✅ Whitelist Status: Active')
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
        .setTitle('❌ Whitelist Status: Removed')
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
                .setTitle('⚠️ Security Flag Detected')
                .setDescription(`Dear **${member.user.tag}**,\nYour account has been flagged by the automated security system. Your roles have been stripped.`)
                .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                .setTimestamp()
                .setFooter({ text: 'Kiliua Security Intelligence', iconURL: member.client.user.displayAvatarURL() }));
            
            await member.send({ embeds: [dmEmbed] }).catch(() => null);

            // Log
            if (logChannel) {
                const logEmbed = addBanner(new EmbedBuilder()
                    .setColor(THEME.DANGER)
                    .setTitle('🚨 Security Alert: Member Flagged')
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
                    .setTitle('✅ Security Log: Member Verified')
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
            .setTitle('🛡️ Bot Added to New Server')
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
            await msg.react('✅').catch(() => {});
        } else {
            await msg.react('❌').catch(() => {});
        }
    }
});

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
    if (c.startsWith('+addbot ')) return withCommandLock(handleAddBot)(msg, c.slice(8).trim());
    if (c === '+bots') return withCommandLock(handleBots)(msg);
    if (c.startsWith('+delbot ')) return withCommandLock(handleDelBot)(msg, c.slice(8).trim());
    if (c.startsWith('+botservers ')) return withCommandLock(handleBotServers)(msg, c.slice(12).trim());
    if (c === '+botstats' || c === '+stats') return withCommandLock(handleBotStats)(msg);
    if (c.startsWith('+set ')) return withCommandLock(handleSetRole)(msg, c.slice(5).trim());
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
    if (c.startsWith('+cr ')) return withCommandLock(handleCr)(msg, c.slice(4).trim());
    if (c.startsWith('+fallcheck ')) return withCommandLock(handleFallcheck)(msg, c.slice(11).trim());
    if (c.startsWith('+track ')) return withCommandLock(handleTrack)(msg, c.slice(7).trim());
    if (c.startsWith('+roletrack ')) return withCommandLock(handleRoleTrack)(msg, c.slice(11).trim());
    if (c.startsWith('+checkid ')) return withCommandLock(handleCheckId)(msg, c.slice(9).trim());
    if (c.startsWith('+cs ')) return withCommandLock(handleCs)(msg, c.slice(4).trim());
    if (c.startsWith('+cv ')) return withCommandLock(handleCv)(msg, c.slice(4).trim());
    if (c.startsWith('+perms ')) return withCommandLock(handlePerms)(msg, c.slice(7).trim());
    if (c === '+topma' || c === '+tma' || c === '+topservers' || c === '+topvc' || c === '+tvc') return withCommandLock(handleTma)(msg);
    if (c === '+tmav1' || c === '+tma1') return withCommandLock(handleTmaV1)(msg);
    if (c.startsWith('+serverinfo ')) return withCommandLock(handleServerInfo)(msg, c.slice(12).trim());
    if (c.startsWith('+userinfo ')) return withCommandLock(handleUserInfo)(msg, c.slice(10).trim());
});

// ===================== KEEP-ALIVE & AUTO-RESTART =====================
function keepAlive() {
    setInterval(() => {
        if (client.ws.ping > 5000) {
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
        client.user.setActivity('+help | Kiliua Security', { type: ActivityType.Watching });
        setTimeout(autoJoinVC, 5000);
        setInterval(autoJoinVC, 30 * 60 * 1000);
        keepAlive();

        startInstantUpdates();

        setTimeout(async () => {
            if (Object.keys(db.trackedServers).length > 0) {
                console.log('[TRACK] Performing initial update for tracked servers...');
                await updateAllTrackedServers();
            }
        }, 10000);
    });

    process.on('uncaughtException', (err) => { console.error('[FATAL]', err); process.exit(1); });
    process.on('unhandledRejection', (r) => { console.error('[WARN]', r); });

    try {
        await client.login(TOKEN);
        console.log('Bot logged in successfully.');
    } catch (err) {
        console.error('[LOGIN]', err);
        process.exit(1);
    }
})();