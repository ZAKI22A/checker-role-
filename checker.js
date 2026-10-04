// checker.js - KILIUA CHECKER ENGINE (v10.11 — RATE LIMIT AVOIDANCE + JITTER)
const express = require('express');
const axios = require('axios');
const fs = require('fs');
const { Client } = require('discord.js-selfbot-v13');
const WebSocket = require('ws');

console.log('='.repeat(70));
console.log('  KILIUA CHECKER ENGINE v10.11 — RATE LIMIT AVOIDANCE + JITTER');
console.log('='.repeat(70));

// ─── قراءة الإعدادات ──────────────────────────────────────────
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

config.checker_user_token = resolveVal(process.env.CHECKER_USER_TOKEN, config.checker_user_token);
config.fallback_user_token = resolveVal(process.env.FALLBACK_USER_TOKEN, config.fallback_user_token);
config.main_bot_token = resolveVal(process.env.MAIN_BOT_TOKEN || process.env.DISCORD_BOT_TOKEN, config.main_bot_token);
config.checker_port = parseInt(process.env.PORT || process.env.CHECKER_PORT || config.checker_port || 4567, 10);
config.x_super_properties = process.env.X_SUPER_PROPERTIES || config.x_super_properties || '';

const PORT = config.checker_port || 4567;
const TARGET_SERVERS = config.target_servers || [];
let X_SUPER_PROPERTIES = config.x_super_properties || '';

// تحديث X-Super-Properties ديناميكياً لجعلها تبدو أكثر طبيعية
function generateSuperProperties() {
    const buildNumbers = [283145, 283150, 283160, 283170];
    const chromeVersions = ['124.0.0.0', '125.0.0.0', '126.0.0.0'];
    const selectedBuild = buildNumbers[Math.floor(Math.random() * buildNumbers.length)];
    const selectedChrome = chromeVersions[Math.floor(Math.random() * chromeVersions.length)];

    const props = {
        os: 'Windows',
        browser: 'Chrome',
        device: '',
        system_locale: 'en-US',
        browser_user_agent: `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${selectedChrome} Safari/537.36`,
        browser_version: selectedChrome,
        os_version: '10',
        release_channel: 'stable',
        client_build_number: selectedBuild,
        client_event_source: null
    };
    return Buffer.from(JSON.stringify(props)).toString('base64');
}

const DISCORD_API = 'https://discord.com/api/v9';
const sleep = (ms) => new Promise(r => setTimeout(r, ms));

const cache = new Map();
const CACHE_TTL = 120000; // زاد إلى دقيقتين

function log(step, detail = '') {
    const t = new Date().toLocaleTimeString();
    console.log(`[${t}] ${step}${detail ? ' | ' + detail : ''}`);
}

function buildHeaders(ct) {
    return {
        'Authorization': ct,
        'Content-Type': 'application/json',
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
        'X-Super-Properties': generateSuperProperties(),
        'X-Discord-Locale': 'en-US'
    };
}

function ct(token) {
    return (token || '').replace(/^Bot\s+/i, '').replace(/[\"\']/g, '').trim();
}

// زيادة عدد المحاولات والمهلة مع jitter
async function getRetry(url, headers, retries = 10, timeout = 90000) {
    for (let i = 0; i < retries; i++) {
        try {
            return await axios.get(url, { headers, timeout });
        } catch (e) {
            if (e.response && e.response.status === 429) {
                const ra = (e.response.data && e.response.data.retry_after) || 1;
                // إضافة jitter (عشوائية) لتجنب التزامن
                const jitter = Math.random() * 2 + 0.5;
                const wait = (ra * 1000) * jitter;
                log('RATE_LIMIT', `${wait/1000}s (jittered)`);
                await sleep(wait + 500);
            } else if (i < retries - 1) {
                const baseWait = 1000 * (i + 1) * 2;
                const jitter = Math.random() * 0.5 + 0.75;
                const wait = baseWait * jitter;
                log('RETRY', `attempt ${i + 1}/${retries} waiting ${wait}ms`);
                await sleep(wait);
            } else {
                throw e;
            }
        }
    }
}

async function getAllMyGuilds(headers) {
    const all = [];
    let after = null;
    while (true) {
        let url = `${DISCORD_API}/users/@me/guilds?limit=200`;
        if (after) url += `&after=${after}`;
        const res = await getRetry(url, headers);
        const guilds = res.data || [];
        if (guilds.length === 0) break;
        all.push(...guilds);
        if (guilds.length < 200) break;
        after = guilds[guilds.length - 1].id;
        // تأخير عشوائي بين 300-700 مللي
        await sleep(300 + Math.random() * 400);
    }
    return all;
}

async function fetchOwnerOnly(guildId, headers) {
    try {
        const guildRes = await getRetry(`${DISCORD_API}/guilds/${guildId}?with_counts=true`, headers);
        const guild = guildRes.data;
        if (guild && guild.owner_id) {
            try {
                const ownerRes = await getRetry(`${DISCORD_API}/guilds/${guildId}/members/${guild.owner_id}`, headers);
                if (ownerRes.data) return [ownerRes.data];
            } catch {}
        }
    } catch {}
    return [];
}

function isRealUser(m) {
    if (!m || !m.user) return false;
    if (m.user.bot) return false;
    if (m.user.system) return false;
    return true;
}

// ─── الصلاحيات ──────────────────────────────────────────────
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

function calcPerms(memberRoles, guildRoles, ownerId, userId) {
    const perms = {};
    if (ownerId === userId) {
        for (const k of Object.keys(ALL_PERMISSIONS)) perms[k] = true;
        return perms;
    }
    let total = 0n;
    const mRoleSet = new Set(memberRoles || []);
    for (const r of guildRoles) {
        if (mRoleSet.has(r.id) || r.name === '@everyone' || r.id === guildRoles[0]?.id) {
            total |= BigInt(r.permissions);
        }
    }
    const isAdmin = (total & (1n << 3n)) !== 0n;
    for (const [k, flag] of Object.entries(ALL_PERMISSIONS)) {
        perms[k] = isAdmin || (total & flag) !== 0n;
    }
    return perms;
}

function hasStaffPermission(role) {
    const rp = BigInt(role.permissions);
    if ((rp & (1n << 3n)) !== 0n) return true;
    for (const perm of STAFF_PERMISSIONS) {
        const flag = ALL_PERMISSIONS[perm];
        if (flag && (rp & flag) !== 0n) return true;
    }
    if (role.name && role.name.toLowerCase() === 'game mode') return true;
    return false;
}

// ─── جلب الأعضاء مع تأخيرات عشوائية ──────────────────────────
async function fetchAllMembers(guild, roleIds, ownerId) {
    const collected = new Map();
    let lastId = null;
    let fetched = 0;
    const limit = 1000;

    log('FETCH_ALL_MEMBERS', 'Starting paginated member fetch...');

    while (true) {
        try {
            const options = { limit };
            if (lastId) options.after = lastId;
            const members = await guild.members.fetch(options);
            if (members.size === 0) break;

            for (const [id, m] of members) {
                if (m.user?.bot || m.user?.system) continue;
                const hasStaff = (ownerId === id) || (m.roles && m.roles.cache && m.roles.cache.some(r => roleIds.has(String(r.id))));
                if (hasStaff) {
                    const memberRoles = m.roles.cache ? m.roles.cache.map(r => ({
                        id: String(r.id),
                        name: r.name,
                        position: r.position,
                        permissions: r.permissions
                    })) : [];

                    collected.set(id, {
                        user: {
                            id: m.user.id,
                            username: m.user.username,
                            discriminator: m.user.discriminator,
                            avatar: m.user.avatar,
                            global_name: m.user.displayName || null,
                            bot: !!m.user.bot,
                            system: !!m.user.system
                        },
                        roles: memberRoles,
                        joined_at: m.joinedAt ? m.joinedAt.toISOString() : null,
                        voice_state: m.voice ? {
                            channel_id: m.voice.channelId,
                            channel_name: m.voice.channel?.name || null
                        } : null
                    });
                }
            }

            fetched += members.size;
            log('FETCH_PAGE', `fetched ${members.size} members (total ${fetched}, collected ${collected.size})`);

            if (members.size < limit) break;
            lastId = members.last().id;
            // تأخير عشوائي أطول 500-1000 مللي
            await sleep(500 + Math.random() * 500);
        } catch (e) {
            log('FETCH_PAGE_ERR', e.message);
            break;
        }
    }

    log('FETCH_ALL_DONE', `collected ${collected.size} staff members out of ${fetched} total`);
    return collected;
}

// ─── جلب الأعضاء عبر السيلف بوت ──────────────────────────────
async function fetchStaffViaSelfbot(guildId, staffRoles, token, timeoutMs = 600000) {
    const sbToken = ct(token);
    const roleIds = new Set(staffRoles.map(r => String(r.id)));
    const collected = new Map();
    log('SELFBOT_FETCH', `Starting selfbot fetch for ${staffRoles.length} roles (timeout ${timeoutMs/1000}s)`);

    const sbClient = new Client({ checkUpdate: false });
    let finished = false, timeoutId = null;

    const cleanup = () => {
        if (timeoutId) clearTimeout(timeoutId);
        try { sbClient.destroy(); } catch {}
    };

    return new Promise((resolve) => {
        timeoutId = setTimeout(() => {
            if (!finished) {
                log('SELFBOT_TIMEOUT', `${collected.size} collected so far`);
                cleanup();
                finished = true;
                resolve(Array.from(collected.values()));
            }
        }, timeoutMs);

        sbClient.on('ready', async () => {
            log('SELFBOT_READY', `${sbClient.user.tag}`);
            try {
                const guild = await sbClient.guilds.fetch(guildId).catch(() => null);
                if (!guild) {
                    log('SELFBOT_NO_GUILD', 'Guild not accessible');
                    cleanup();
                    finished = true;
                    resolve([]);
                    return;
                }

                const ownerId = guild.ownerId;
                const collectedMap = await fetchAllMembers(guild, roleIds, ownerId);
                collectedMap.forEach((value, key) => collected.set(key, value));

                // تأكيد إضافي عبر الرتب
                for (const role of staffRoles) {
                    try {
                        const rObj = guild.roles.cache.get(role.id);
                        if (rObj && rObj.members) {
                            for (const [id, m] of rObj.members) {
                                if (m.user?.bot || m.user?.system) continue;
                                if (!collected.has(id)) {
                                    const memberRoles = m.roles.cache ? m.roles.cache.map(r => ({
                                        id: String(r.id),
                                        name: r.name,
                                        position: r.position,
                                        permissions: r.permissions
                                    })) : [];

                                    collected.set(id, {
                                        user: {
                                            id: m.user.id,
                                            username: m.user.username,
                                            discriminator: m.user.discriminator,
                                            avatar: m.user.avatar,
                                            global_name: m.user.displayName || null,
                                            bot: !!m.user.bot,
                                            system: !!m.user.system
                                        },
                                        roles: memberRoles,
                                        joined_at: m.joinedAt ? m.joinedAt.toISOString() : null,
                                        voice_state: m.voice ? {
                                            channel_id: m.voice.channelId,
                                            channel_name: m.voice.channel?.name || null
                                        } : null
                                    });
                                }
                            }
                        }
                    } catch {}
                }

                log('SELFBOT_RESULT', `${collected.size} staff found`);
                cleanup();
                finished = true;
                resolve(Array.from(collected.values()));
            } catch (e) {
                log('SELFBOT_ERR', e.message);
                cleanup();
                finished = true;
                resolve(Array.from(collected.values()));
            }
        });

        sbClient.login(sbToken).catch(err => {
            log('SELFBOT_LOGIN_FAIL', err.message);
            cleanup();
            finished = true;
            resolve([]);
        });
    });
}

// ─── جلب حالة الصوت عبر Gateway ──────────────────────────────
function fetchVoiceViaGateway(token, timeoutMs = 45000) {
    return new Promise((resolve) => {
        const tok = ct(token);
        const guildVoiceMap = new Map();
        const guildDataMap = new Map();
        let ws = null, htTimer = null, resolved = false;
        let readyReceived = false;
        let supplementalReceived = false;
        let guildsExpected = 0;
        let guildsReceived = 0;
        let allGuildIds = [];

        const cleanup = () => {
            if (htTimer) { clearInterval(htTimer); htTimer = null; }
            if (ws) { try { ws.close(1000); } catch {} ws = null; }
        };
        const resolveOnce = (d) => {
            if (resolved) return;
            resolved = true;
            cleanup();
            resolve(d);
        };
        let mainTimer = setTimeout(() => {
            log('GW_TIMEOUT', `${guildVoiceMap.size}/${guildsExpected}`);
            resolveOnce({ voiceMap: guildVoiceMap, guildData: guildDataMap });
        }, timeoutMs);

        let drainTimer = null;
        const checkComplete = () => {
            if (!readyReceived || !supplementalReceived) return;
            if (drainTimer) return;
            log('GW_COMPLETE', `${guildVoiceMap.size} guilds with voice — finishing`);
            drainTimer = setTimeout(() => resolveOnce({ voiceMap: guildVoiceMap, guildData: guildDataMap }), 1200);
        };

        const sendOp14Subscriptions = (guildIds) => {
            if (!ws || ws.readyState !== WebSocket.OPEN) return;
            const batch = 100;
            for (let i = 0; i < guildIds.length; i += batch) {
                const slice = guildIds.slice(i, i + batch);
                setTimeout(() => {
                    for (const gid of slice) {
                        if (ws && ws.readyState === WebSocket.OPEN) {
                            ws.send(JSON.stringify({
                                op: 14,
                                d: {
                                    guild_id: gid,
                                    typing: true,
                                    threads: false,
                                    activities: true,
                                    members: [],
                                    channels: {},
                                    thread_member_lists: []
                                }
                            }));
                        }
                    }
                }, Math.floor(i / batch) * 200);
            }
        };

        try {
            ws = new WebSocket('wss://gateway.discord.gg/?v=9&encoding=json', {
                headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' }
            });
        } catch {
            clearTimeout(mainTimer);
            resolveOnce({ voiceMap: guildVoiceMap, guildData: guildDataMap });
            return;
        }

        ws.on('message', (data) => {
            try {
                const p = JSON.parse(data.toString());

                if (p.op === 10 && p.d && p.d.heartbeat_interval) {
                    const iv = p.d.heartbeat_interval;
                    setTimeout(() => {
                        if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: null }));
                        htTimer = setInterval(() => {
                            if (ws && ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ op: 1, d: null }));
                        }, iv);
                    }, Math.floor(iv * Math.random()));

                    ws.send(JSON.stringify({
                        op: 2,
                        d: {
                            token: tok,
                            intents: 32767,
                            capabilities: 125,
                            properties: {
                                os: 'Windows',
                                browser: 'Chrome',
                                device: '',
                                system_locale: 'en-US',
                                browser_user_agent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36',
                                browser_version: '124.0.0.0',
                                os_version: '10'
                            },
                            presence: { status: 'online', since: 0, activities: [], afk: false },
                            compress: false
                        }
                    }));
                }

                if (p.t === 'READY' && p.d) {
                    readyReceived = true;
                    clearTimeout(mainTimer);
                    mainTimer = setTimeout(() => {
                        log('GW_TIMEOUT_POST_READY', `${guildVoiceMap.size}/${guildsExpected}`);
                        resolveOnce({ voiceMap: guildVoiceMap, guildData: guildDataMap });
                    }, 12000);
                    guildsExpected = p.d.guilds ? p.d.guilds.length : 0;
                    allGuildIds = p.d.guilds ? p.d.guilds.map(g => g.id) : [];
                    log('GW_READY', `${guildsExpected} guilds`);
                    for (const g of p.d.guilds || []) {
                        if (g.voice_states && g.voice_states.length > 0) {
                            guildVoiceMap.set(String(g.id), g.voice_states);
                        }
                    }
                    setTimeout(() => sendOp14Subscriptions(allGuildIds), 1000);
                }

                if (p.t === 'READY_SUPPLEMENTAL' && p.d) {
                    supplementalReceived = true;
                    log('GW_SUPPLEMENTAL', 'received');
                    if (p.d.guilds && Array.isArray(p.d.guilds)) {
                        for (const g of p.d.guilds) {
                            if (!g.id) continue;
                            const vs = g.voice_states || [];
                            if (vs.length === 0) continue;
                            const existing = guildVoiceMap.get(String(g.id)) || [];
                            for (const v of vs) {
                                if (!existing.some(x => x.user_id === v.user_id)) existing.push(v);
                            }
                            guildVoiceMap.set(String(g.id), existing);
                        }
                    }
                    if (p.d.voice_states && Array.isArray(p.d.voice_states)) {
                        for (const vs of p.d.voice_states) {
                            if (!vs.guild_id) continue;
                            const existing = guildVoiceMap.get(String(vs.guild_id)) || [];
                            if (!existing.some(v => v.user_id === vs.user_id)) existing.push(vs);
                            guildVoiceMap.set(String(vs.guild_id), existing);
                        }
                    }
                    checkComplete();
                }

                if (p.t === 'GUILD_CREATE' && p.d) {
                    guildsReceived++;
                    const g = p.d;
                    guildDataMap.set(String(g.id), {
                        id: g.id,
                        name: g.name,
                        icon: g.icon,
                        owner_id: g.owner_id,
                        roles: g.roles || [],
                        members: g.members || [],
                        member_count: g.member_count || 0,
                        channels: g.channels || []
                    });
                    if (g.voice_states && g.voice_states.length > 0)
                        guildVoiceMap.set(String(g.id), g.voice_states);
                    checkComplete();
                }

                if (p.t === 'VOICE_STATE_UPDATE' && p.d) {
                    const vs = p.d;
                    if (vs.guild_id) {
                        const ex = guildVoiceMap.get(String(vs.guild_id)) || [];
                        if (!vs.channel_id) {
                            guildVoiceMap.set(String(vs.guild_id), ex.filter(v => v.user_id !== vs.user_id));
                        } else {
                            const idx = ex.findIndex(v => v.user_id === vs.user_id);
                            if (idx >= 0) ex[idx] = vs;
                            else ex.push(vs);
                            guildVoiceMap.set(String(vs.guild_id), ex);
                        }
                    }
                }

                if (p.t === 'PASSIVE_UPDATE_V1' && p.d) {
                    const gid = p.d.guild_id;
                    if (gid && p.d.voice_states && p.d.voice_states.length > 0) {
                        const ex = guildVoiceMap.get(String(gid)) || [];
                        for (const vs of p.d.voice_states) {
                            if (!vs.channel_id) continue;
                            const idx = ex.findIndex(v => v.user_id === vs.user_id);
                            if (idx >= 0) ex[idx] = vs;
                            else ex.push(vs);
                        }
                        guildVoiceMap.set(String(gid), ex);
                        log('GW_PASSIVE_UPDATE', `guild=${gid} +${p.d.voice_states.length} vs`);
                    }
                }

            } catch (err) { log('GW_PARSE_ERR', err.message); }
        });

        ws.on('error', (e) => { log('GW_ERROR', e.message);
            resolveOnce({ voiceMap: guildVoiceMap, guildData: guildDataMap }); });
        ws.on('close', () => resolveOnce({ voiceMap: guildVoiceMap, guildData: guildDataMap }));
    });
}

async function checkUser(userId, token, headers, fullScan = false) {
    const cacheKey = `${token}_${userId}_${fullScan}`;
    const cached = cache.get(cacheKey);
    if (cached && (Date.now() - cached.timestamp < CACHE_TTL)) return cached.results;

    log('CHECK_START', `user=${userId} full=${fullScan}`);

    let guilds = [];
    if (TARGET_SERVERS.length > 0) {
        const all = await getAllMyGuilds(headers);
        const ids = new Set(all.map(g => g.id));
        guilds = TARGET_SERVERS.filter(id => ids.has(id)).map(id => all.find(g => g.id === id)).filter(Boolean);
    } else {
        guilds = await getAllMyGuilds(headers);
    }
    log('GUILDS', `${guilds.length}`);

    const checks = await Promise.allSettled(
        guilds.map(async (g) => {
            try {
                const res = await axios.get(`${DISCORD_API}/guilds/${g.id}/members/${userId}`, { headers, timeout: 10000 });
                return { guild: g, member: res.data };
            } catch { return null; }
        })
    );
    const valid = checks.filter(r => r.status === 'fulfilled' && r.value).map(r => r.value);
    log('SHARED', `${valid.length}/${guilds.length}`);

    const gdMap = new Map();
    await Promise.all(valid.map(async ({ guild }) => {
        try {
            const d = await getRetry(`${DISCORD_API}/guilds/${guild.id}?with_counts=true`, headers, 2, 12000);
            gdMap.set(guild.id, d.data);
        } catch {}
    }));

    const results = [];
    for (const { guild, member } of valid) {
        const gd = gdMap.get(guild.id);
        if (!gd) continue;
        const perms = calcPerms(member.roles || [], gd.roles || [], gd.owner_id, userId);
        const isOwner = gd.owner_id === userId;
        const danger = {};
        let hasDanger = isOwner;
        for (const [k] of Object.entries(ALL_PERMISSIONS)) {
            const ic = STAFF_PERMISSIONS.includes(k);
            danger[k] = perms[k] === true && ic;
            if (ic && perms[k] === true) hasDanger = true;
        }
        if (!fullScan && !hasDanger) continue;

        const powerRoles = [];
        if (isOwner) powerRoles.push({ name: 'Owner', id: 'owner', powers: Object.keys(ALL_PERMISSIONS) });
        const mRoles = (gd.roles || []).filter(r => (member.roles || []).includes(r.id) && r.name !== '@everyone').sort((a, b) => b.position - a.position);
        const allRoles = mRoles.map(r => ({ name: r.name, id: r.id, position: r.position, color: r.color }));
        for (const role of mRoles) {
            const rp = BigInt(role.permissions);
            const matched = [];
            for (const [k, flag] of Object.entries(ALL_PERMISSIONS)) {
                if (STAFF_PERMISSIONS.includes(k) && ((rp & flag) !== 0n || (rp & (1n << 3n)) !== 0n)) matched.push(k);
            }
            if (matched.length > 0) powerRoles.push({ name: role.name, id: role.id, powers: [...new Set(matched)] });
        }

        let vs = null;
        if (member.voice_state && member.voice_state.channel_id) {
            const chs = await getGuildChannels(guild.id, headers);
            const chi = chs.find(c => c.id === member.voice_state.channel_id);
            vs = { channelId: member.voice_state.channel_id, channelName: chi ? chi.name : 'Private Channel' };
        }

        results.push({
            serverName: gd.name,
            serverId: guild.id,
            isOwner,
            roles: powerRoles,
            allRoles,
            permissions: danger,
            serverIconHash: gd.icon,
            serverBannerHash: gd.banner || null,
            ownerId: gd.owner_id || null,
            memberCount: gd.approximate_member_count ?? null,
            onlineCount: gd.approximate_presence_count ?? null,
            boostTier: gd.premium_tier ?? 0,
            boostCount: gd.premium_subscription_count ?? 0,
            vanity: gd.vanity_url_code || null,
            nick: member.nick || null,
            joinedAt: member.joined_at || null,
            hasPowers: hasDanger || isOwner,
            currentChannel: vs ? { id: vs.channelId, name: vs.channelName } : null,
            voiceMembers: vs ? [{ id: userId }] : [],
            voiceChannel: vs
        });
    }

    log('CHECK_DONE', `${results.length} results`);
    cache.set(cacheKey, { timestamp: Date.now(), results });
    return results;
}

async function getGuildChannels(guildId, headers) {
    try {
        const res = await getRetry(`${DISCORD_API}/guilds/${guildId}/channels`, headers, 2, 10000);
        return res.data || [];
    } catch { return []; }
}

async function getCompleteMembers(guildId, token, headers, staffRolesHint = null) {
    log('FETCH_START', `guild=${guildId}`);
    let allMembers = [];

    if (staffRolesHint && staffRolesHint.length > 0) {
        log('FETCH_SELFBOT', `Using selfbot for ${staffRolesHint.length} roles`);
        try {
            const sbMembers = await fetchStaffViaSelfbot(guildId, staffRolesHint, token, 600000);
            if (sbMembers.length > 0) {
                allMembers = sbMembers;
                log('FETCH_SUCCESS', `${allMembers.length} members via Selfbot`);
                return { members: allMembers, source: 'Selfbot' };
            }
        } catch (e) { log('FETCH_SELFBOT_ERR', e.message); }
    }

    log('FETCH_OWNER', 'fallback to owner only');
    try {
        const ownerMembers = await fetchOwnerOnly(guildId, headers);
        if (ownerMembers.length > 0) {
            log('FETCH_SUCCESS', `${ownerMembers.length} members via Owner Only`);
            return { members: ownerMembers, source: 'Owner Only' };
        }
    } catch (e) {}

    log('FETCH_FAILED', 'no members found');
    return { members: [], source: 'None' };
}

// ──────────────────── خادم Express ────────────────────────────
const app = express();
app.use(express.json());

app.use((req, res, next) => {
    // تأخير عشوائي قبل معالجة الطلب لتجنب النمط الثابت
    const delay = 100 + Math.random() * 300;
    setTimeout(next, delay);
});

app.get('/ping', (_, res) => {
    res.json({ status: 'ok', time: Date.now() });
});

app.get('/guilds', async (req, res) => {
    const tok = req.headers.authorization || req.query.token;
    if (!tok) return res.status(401).json({ error: 'Token required' });
    try {
        const c = ct(tok), h = buildHeaders(c);
        if (req.query.guildId) {
            const r = await getRetry(`${DISCORD_API}/guilds/${req.query.guildId}?with_counts=true`, h);
            return res.json([r.data]);
        }
        res.json(await getAllMyGuilds(h));
    } catch (e) {
        log('GUILDS_ERR', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/check', async (req, res) => {
    const { userId, userTag, fullScan } = req.query;
    let tok = req.headers.authorization || req.query.token;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!tok) return res.status(401).json({ error: 'Token required' });
    tok = ct(tok);
    log('REQ_CHECK', `user=${userId}`);
    try {
        const results = await checkUser(userId, tok, buildHeaders(tok), fullScan === 'true');
        res.json({ success: true, userId, userTag, results });
    } catch (e) {
        log('CHECK_ERR', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/voice-states', async (req, res) => {
    const { userId } = req.query;
    let tok = req.headers.authorization || req.query.token;
    if (!tok) return res.status(401).json({ error: 'Token required' });
    if (!userId) return res.status(400).json({ error: 'userId required' });
    log('REQ_TRACK', `user=${userId}`);

    try {
        const c = ct(tok), h = buildHeaders(c);
        const guilds = await getAllMyGuilds(h);
        log('TRACK_GUILDS', `${guilds.length}`);

        const { voiceMap } = await fetchVoiceViaGateway(c, 50000);
        log('TRACK_GW', `${voiceMap.size} guilds with voice`);

        const results = [];
        const checked = new Set();

        for (const [gid, vs] of voiceMap) {
            const uv = vs.find(v => String(v.user_id) === String(userId));
            if (!uv || !uv.channel_id) continue;
            const g = guilds.find(x => String(x.id) === gid);
            if (!g) continue;

            const chs = await getGuildChannels(g.id, h);
            const chMap = new Map(chs.map(ch => [ch.id, ch]));
            let chFound = chMap.get(uv.channel_id);

            if (!chFound) {
                try {
                    const chRes = await axios.get(`${DISCORD_API}/channels/${uv.channel_id}`, { headers: h, timeout: 8000 });
                    if (chRes.data && chRes.data.name) chFound = chRes.data;
                } catch {}
            }

            const chName = chFound ? chFound.name : null;
            const chType = chFound ? chFound.type : 2;
            const isHidden = !chName;
            const inCh = vs.filter(v => String(v.channel_id) === String(uv.channel_id));

            results.push({
                serverName: g.name,
                serverId: g.id,
                serverIconHash: g.icon,
                currentChannel: { id: uv.channel_id, name: chName || 'Private Channel', type: chType, isHidden: isHidden },
                voiceMembers: inCh.length > 0 ? inCh.map(v => ({ id: v.user_id })) : [{ id: userId }],
                source: 'gateway'
            });
            checked.add(gid);
            log('TRACK_FOUND_GW', `user in ${g.name} #${chName || 'private'}`);
        }

        const remaining = guilds.filter(g => !checked.has(String(g.id)));
        if (remaining.length > 0) {
            log('TRACK_REST_FALLBACK', `${remaining.length} guilds`);
            const bs = 3;
            for (let i = 0; i < remaining.length; i += bs) {
                const batch = remaining.slice(i, i + bs);
                const br = await Promise.allSettled(batch.map(async (g) => {
                    try {
                        const mr = await axios.get(`${DISCORD_API}/guilds/${g.id}/members/${userId}`, { headers: h, timeout: 10000 });
                        const m = mr.data;
                        if (!m || !m.voice_state || !m.voice_state.channel_id) return null;

                        const chs = await getGuildChannels(g.id, h);
                        const chMap = new Map(chs.map(ch => [ch.id, ch]));
                        let chFound = chMap.get(m.voice_state.channel_id);

                        if (!chFound) {
                            try {
                                const chRes = await axios.get(`${DISCORD_API}/channels/${m.voice_state.channel_id}`, { headers: h, timeout: 8000 });
                                if (chRes.data && chRes.data.name) chFound = chRes.data;
                            } catch {}
                        }

                        const chName = chFound ? chFound.name : null;
                        const isHidden = !chName;

                        let chMembers = [{ id: userId }];
                        try {
                            const msRes = await axios.get(`${DISCORD_API}/guilds/${g.id}/members?limit=1000`, { headers: h, timeout: 10000 });
                            const same = (msRes.data || []).filter(x => x.voice_state && x.voice_state.channel_id === m.voice_state.channel_id);
                            if (same.length > 0) chMembers = same.map(x => ({ id: x.user.id }));
                        } catch {}

                        log('TRACK_FOUND_REST', `user in ${g.name} #${chName || 'private'}`);
                        return {
                            serverName: g.name,
                            serverId: g.id,
                            serverIconHash: g.icon,
                            currentChannel: { id: m.voice_state.channel_id, name: chName || 'Private Channel', type: chFound ? chFound.type : 2, isHidden: isHidden },
                            voiceMembers: chMembers,
                            source: 'rest'
                        };
                    } catch (e) {
                        if (e.response?.status === 429) await sleep((e.response.data?.retry_after || 1) * 1000 + 500);
                    }
                    return null;
                }));
                for (const r of br) { if (r.status === 'fulfilled' && r.value) results.push(r.value); }
                if (i + bs < remaining.length) await sleep(800);
            }
        }

        log('TRACK_DONE', `${results.length} found`);
        res.json({ success: true, results });
    } catch (e) {
        log('TRACK_ERR', e.message);
        res.status(500).json({ error: e.message, stack: e.stack });
    }
});

app.get('/guild-permissions-check', async (req, res) => {
    const { guildId } = req.query;
    let tok = req.headers.authorization || req.query.token;
    if (!tok) return res.status(401).json({ error: 'Token required' });
    if (!guildId) return res.status(400).json({ error: 'guildId required' });
    log('REQ_CRSERVER', `guild=${guildId}`);

    try {
        const c = ct(tok), h = buildHeaders(c);
        const guildRes = await getRetry(`${DISCORD_API}/guilds/${guildId}?with_counts=true`, h);
        const guild = guildRes.data;
        log('CRSERVER_GUILD', `${guild.name}`);

        const staffRolesHint = (guild.roles || []).filter(r => hasStaffPermission(r));
        staffRolesHint._ownerId = guild.owner_id;

        const { members: allMembers, source } = await getCompleteMembers(guildId, c, h, staffRolesHint);

        if (allMembers.length === 0) {
            return res.json({ success: true, guild: { id: guild.id, name: guild.name, icon: guild.icon, memberCount: 0 }, members: [], note: 'Could not fetch members.' });
        }

        const chs = await getGuildChannels(guildId, h);
        const chMap = new Map();
        chs.forEach(ch => chMap.set(ch.id, ch));

        const dangerous = [];
        for (const m of allMembers) {
            if (!isRealUser(m) || !m.user.id) continue;
            const perms = calcPerms(m.roles || [], guild.roles || [], guild.owner_id, m.user.id);
            const isOwner = guild.owner_id === m.user.id;
            const ap = Object.entries(perms).filter(([k, v]) => v && STAFF_PERMISSIONS.includes(k)).map(([k]) => k);
            if (!isOwner && ap.length === 0) continue;

            const mr = (guild.roles || []).filter(r => (m.roles || []).includes(r.id) && r.name !== '@everyone').sort((a, b) => b.position - a.position);
            const pr = [];
            if (isOwner) pr.push({ name: 'Owner', id: 'owner', powers: Object.keys(ALL_PERMISSIONS) });
            for (const r of mr) {
                const rp = BigInt(r.permissions);
                const matched = [];
                for (const [k, flag] of Object.entries(ALL_PERMISSIONS)) {
                    if (STAFF_PERMISSIONS.includes(k) && ((rp & flag) !== 0n || (rp & (1n << 3n)) !== 0n)) matched.push(k);
                }
                if (matched.length > 0) pr.push({ name: r.name, id: r.id, powers: [...new Set(matched)] });
            }
            let vc = null;
            if (m.voice_state && m.voice_state.channel_id) {
                const ch = chMap.get(m.voice_state.channel_id);
                vc = { id: m.voice_state.channel_id, name: ch ? ch.name : 'Private Channel' };
            }
            dangerous.push({ user: m.user, isOwner, roles: pr, activePerms: ap, joinedAt: m.joined_at, voiceChannel: vc });
        }

        dangerous.sort((a, b) => { if (a.isOwner && !b.isOwner) return -1; if (!a.isOwner && b.isOwner) return 1; return b.roles.length - a.roles.length; });
        log('CRSERVER_DONE', `${dangerous.length} dangerous`);
        res.json({ success: true, guild: { id: guild.id, name: guild.name, icon: guild.icon, memberCount: guild.approximate_member_count || allMembers.length }, members: dangerous });
    } catch (e) {
        log('CRSERVER_ERR', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/guild-members-role', async (req, res) => {
    const { guildId, roleId } = req.query;
    let tok = req.headers.authorization || req.query.token;
    if (!tok) return res.status(401).json({ error: 'Token required' });
    if (!guildId || !roleId) return res.status(400).json({ error: 'guildId and roleId required' });
    try {
        const c = ct(tok), h = buildHeaders(c);
        const { members: allMembers } = await getCompleteMembers(guildId, c, h);
        const filtered = allMembers.filter(m => m.roles && m.roles.includes(roleId));
        const gr = await getRetry(`${DISCORD_API}/guilds/${guildId}`, h);
        const chs = await getGuildChannels(guildId, h);
        const chMap = {};
        chs.forEach(ch => { chMap[ch.id] = ch.name; });
        const result = filtered.map(m => ({
            user: m.user,
            roles: m.roles,
            voice: m.voice_state ? { channelId: m.voice_state.channel_id, channelName: chMap[m.voice_state.channel_id] || 'Private' } : null
        }));
        res.json({ success: true, guild: { id: gr.data.id, name: gr.data.name, icon: gr.data.icon }, members: result });
    } catch (e) {
        log('ROLE_MEMBERS_ERR', e.message);
        res.status(500).json({ error: e.message });
    }
});

// ─── /checkadmins ────────────────────────────────────────────
app.get('/checkadmins', async (req, res) => {
    const { guildId, blacklist } = req.query;
    let tok = req.headers.authorization || req.query.token;
    if (!tok) return res.status(401).json({ error: 'Token required' });
    if (!guildId) return res.status(400).json({ error: 'guildId required' });
    log('REQ_CHECKADMINS', `guild=${guildId}`);

    try {
        const c = ct(tok), h = buildHeaders(c);

        const guildRes = await getRetry(`${DISCORD_API}/guilds/${guildId}?with_counts=true`, h);
        const guild = guildRes.data;
        log('CHECKADMINS_GUILD', `${guild.name} (${guild.approximate_member_count || '?'} members)`);

        const staffRoles = (guild.roles || []).filter(r => hasStaffPermission(r));
        staffRoles.sort((a, b) => b.position - a.position);
        staffRoles._ownerId = guild.owner_id;
        log('STAFF_ROLES', `${staffRoles.length} staff roles found`);

        if (staffRoles.length === 0) {
            return res.json({
                success: true,
                guild: { id: guild.id, name: guild.name, icon: guild.icon, memberCount: guild.approximate_member_count || 0, roles: guild.roles || [] },
                members: [],
                blacklistedCount: 0,
                note: 'No staff roles found in this server.'
            });
        }

        const { members: allMembers, source } = await getCompleteMembers(guildId, c, h, staffRoles);
        let note = `Fetched ${allMembers.length} members via ${source}.`;

        if (allMembers.length === 0) {
            note = `Could not fetch any members via ${source}. The token may lack permissions.`;
            return res.json({
                success: true,
                guild: { id: guild.id, name: guild.name, icon: guild.icon, memberCount: guild.approximate_member_count || 0, roles: guild.roles || [] },
                members: [],
                blacklistedCount: 0,
                note: note
            });
        }

        const staffRoleIds = new Set(staffRoles.map(r => String(r.id)));
        const staffMembers = allMembers.filter(m => {
            if (!isRealUser(m)) return false;
            if (!m.user.id) return false;
            if (guild.owner_id === m.user.id) return true;
            return (m.roles || []).some(r => staffRoleIds.has(String(r.id)));
        });

        if (staffMembers.length === 0) {
            return res.json({
                success: true,
                guild: { id: guild.id, name: guild.name, icon: guild.icon, memberCount: guild.approximate_member_count || allMembers.length, roles: guild.roles || [] },
                members: [],
                blacklistedCount: 0,
                note: `No members with staff roles found among ${allMembers.length} fetched members (via ${source}). Staff roles: ${staffRoles.map(r => r.name).join(', ')}`
            });
        }

        const blacklistedIds = new Set();
        if (blacklist) blacklist.split(/[\s,]+/).filter(Boolean).forEach(id => blacklistedIds.add(id.trim()));

        const chs = await getGuildChannels(guildId, h);
        const chMap = new Map();
        chs.forEach(ch => chMap.set(ch.id, ch));

        const results = [];
        for (const m of staffMembers) {
            const isOwner = guild.owner_id === m.user.id;
            
            const memberRoles = (guild.roles || []).filter(r => 
                (m.roles || []).some(mr => String(mr.id) === String(r.id)) && r.name !== '@everyone'
            ).sort((a, b) => b.position - a.position);

            const perms = calcPerms(m.roles || [], guild.roles || [], guild.owner_id, m.user.id);
            const ap = Object.entries(perms).filter(([k, v]) => v && STAFF_PERMISSIONS.includes(k)).map(([k]) => k);

            let vc = null;
            if (m.voice_state && m.voice_state.channel_id) {
                const ch = chMap.get(m.voice_state.channel_id);
                vc = { id: m.voice_state.channel_id, name: ch ? ch.name : 'Private Channel' };
            }

            results.push({
                user: m.user,
                isOwner,
                isBlacklisted: blacklistedIds.has(m.user.id),
                roles: memberRoles.map(r => ({ 
                    name: r.name, 
                    id: String(r.id), 
                    position: r.position, 
                    permissions: r.permissions 
                })),
                activePerms: ap,
                joinedAt: m.joined_at,
                voiceChannel: vc
            });
        }

        results.sort((a, b) => {
            if (a.isOwner && !b.isOwner) return -1;
            if (!a.isOwner && b.isOwner) return 1;
            const aPos = a.roles.length > 0 ? a.roles[0].position : 0;
            const bPos = b.roles.length > 0 ? b.roles[0].position : 0;
            return bPos - aPos;
        });

        log('CHECKADMINS_DONE', `${results.length} staff found (via ${source})`);
        res.json({
            success: true,
            guild: { id: guild.id, name: guild.name, icon: guild.icon, memberCount: guild.approximate_member_count || allMembers.length, roles: guild.roles || [] },
            members: results,
            blacklistedCount: results.filter(m => m.isBlacklisted).length,
            note: `Found ${results.length} staff members from ${staffRoles.length} staff roles. ${note}`
        });
    } catch (e) {
        log('CHECKADMINS_ERR', e.message);
        // نعيد خطأ مع رسالة واضحة بدلاً من 500 عام
        res.status(500).json({ 
            error: 'Failed to fetch staff data',
            details: e.message,
            stack: process.env.NODE_ENV === 'development' ? e.stack : undefined
        });
    }
});

app.get('/checkid', async (req, res) => {
    const { guildId, roleId } = req.query;
    let tok = req.headers.authorization || req.query.token;
    if (!tok) return res.status(401).json({ error: 'Token required' });
    if (!guildId || !roleId) return res.status(400).json({ error: 'guildId and roleId required' });
    log('REQ_CHECKID', `guild=${guildId} role=${roleId}`);
    try {
        const c = ct(tok), h = buildHeaders(c);
        const gr = await getRetry(`${DISCORD_API}/guilds/${guildId}?with_counts=true`, h);
        const guild = gr.data;
        const { members: allMembers } = await getCompleteMembers(guildId, c, h);
        const filtered = allMembers.filter(m => m.roles && m.roles.includes(roleId));
        const ri = (guild.roles || []).find(r => r.id === roleId);
        res.json({
            success: true,
            guild: { id: guild.id, name: guild.name, icon: guild.icon },
            role: ri ? { id: ri.id, name: ri.name, color: ri.color } : { id: roleId, name: 'Unknown' },
            totalMembers: filtered.length,
            members: filtered.map(m => ({ id: m.user.id, username: m.user.username, avatar: m.user.avatar, joinedAt: m.joined_at }))
        });
    } catch (e) {
        log('CHECKID_ERR', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/cs', async (req, res) => {
    const { userId } = req.query;
    let tok = req.headers.authorization || req.query.token;
    if (!userId) return res.status(400).json({ error: 'userId required' });
    if (!tok) return res.status(401).json({ error: 'Token required' });
    tok = ct(tok);
    const h = buildHeaders(tok);
    log('REQ_CS', `user=${userId}`);
    try {
        const guilds = await getAllMyGuilds(h);
        const results = [];
        const bs = 5;
        for (let i = 0; i < guilds.length; i += bs) {
            const batch = guilds.slice(i, i + bs);
            const br = await Promise.allSettled(batch.map(async (g) => {
                try { const r = await axios.get(`${DISCORD_API}/guilds/${g.id}/members/${userId}`, { headers: h, timeout: 10000 }); return { guild: g, member: r.data }; } catch { return null; }
            }));
            for (const r of br) {
                if (r.status === 'fulfilled' && r.value) {
                    const { guild, member } = r.value;
                    try {
                        const gd = (await getRetry(`${DISCORD_API}/guilds/${guild.id}?with_counts=true`, h, 2, 12000)).data;
                        const perms = calcPerms(member.roles || [], gd.roles || [], gd.owner_id, userId);
                        const isOwner = gd.owner_id === userId;
                        const ap = Object.entries(perms).filter(([k, v]) => v && STAFF_PERMISSIONS.includes(k)).map(([k]) => k);
                        if (!isOwner && ap.length === 0) continue;
                        const pr = [];
                        if (isOwner) pr.push({ name: 'Owner', id: 'owner', powers: Object.keys(ALL_PERMISSIONS) });
                        const mr = (gd.roles || []).filter(r => (member.roles || []).includes(r.id) && r.name !== '@everyone').sort((a, b) => b.position - a.position);
                        for (const role of mr) {
                            const rp = BigInt(role.permissions);
                            const matched = [];
                            for (const [k, flag] of Object.entries(ALL_PERMISSIONS)) { if (STAFF_PERMISSIONS.includes(k) && ((rp & flag) !== 0n || (rp & (1n << 3n)) !== 0n)) matched.push(k); }
                            if (matched.length > 0) pr.push({ name: role.name, id: role.id, powers: [...new Set(matched)] });
                        }
                        results.push({ serverName: gd.name, serverId: guild.id, isOwner, roles: pr, activePerms: ap, serverIconHash: gd.icon });
                    } catch {}
                }
            }
            if (i + bs < guilds.length) await sleep(500);
        }
        res.json({ success: true, userId, results });
    } catch (e) {
        log('CS_ERR', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/tma', async (req, res) => {
    let tok = req.headers.authorization || req.query.token;
    if (!tok) return res.status(401).json({ error: 'Token required' });
    try {
        const c = ct(tok), h = buildHeaders(c);
        // تأخير عشوائي قبل البدء لجعل العملية تبدو بشرية
        await sleep(Math.random() * 1000 + 500);
        
        const guilds = await getAllMyGuilds(h);
        const { voiceMap } = await fetchVoiceViaGateway(c, 40000);
        
        const results = guilds.map(g => {
            const vs = voiceMap.get(String(g.id)) || [];
            let humans = 0, bots = 0, fresh = 0;
            const now = Date.now();
            for (const v of vs) {
                const u = (v.member && v.member.user) ? v.member.user : null;
                const isBot = !!(u && u.bot);
                if (isBot) bots++; else humans++;
                try {
                    const created = Number((BigInt(String(v.user_id)) >> 22n) + 1420070400000n);
                    if (now - created < 7 * 24 * 60 * 60 * 1000) fresh++;
                } catch {}
            }
            return {
                name: g.name,
                id: g.id,
                icon: g.icon,
                activeVoice: humans,
                activeVoiceHumans: humans,
                botsInVoice: bots,
                freshAccounts: fresh
            };
        }).filter(r => r.activeVoiceHumans > 0);
        results.sort((a, b) => b.activeVoiceHumans - a.activeVoiceHumans);
        res.json({ success: true, results });
    } catch (e) {
        log('TMA_ERR', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/cv', async (req, res) => {
    const { userId } = req.query;
    let tok = req.headers.authorization || req.query.token;
    if (!tok) return res.status(401).json({ error: 'Token required' });
    if (!userId) return res.status(400).json({ error: 'userId required' });
    log('REQ_CV', `user=${userId}`);
    try {
        const c = ct(tok), h = buildHeaders(c);
        const guilds = await getAllMyGuilds(h);
        const { voiceMap } = await fetchVoiceViaGateway(c, 45000);
        const results = [];

        for (const [gid, vs] of voiceMap) {
            const uv = vs.find(v => String(v.user_id) === String(userId));
            if (!uv || !uv.channel_id) continue;
            const g = guilds.find(x => String(x.id) === gid);
            if (!g) continue;

            let chName = null;
            try {
                const chs = await getGuildChannels(g.id, h);
                const chFound = chs.find(ch => String(ch.id) === String(uv.channel_id));
                if (chFound) chName = chFound.name;
            } catch {}

            if (!chName) {
                try {
                    const chRes = await axios.get(`${DISCORD_API}/channels/${uv.channel_id}`, { headers: h, timeout: 5000 });
                    if (chRes.data && chRes.data.name) chName = chRes.data.name;
                } catch {}
            }

            const inV = vs.filter(v => String(v.channel_id) === String(uv.channel_id));

            results.push({
                serverName: g.name,
                serverId: g.id,
                serverIconHash: g.icon,
                currentChannel: { id: uv.channel_id, name: chName || 'Voice Channel', isHidden: !chName },
                voiceMembers: inV.length > 0 ? inV.map(v => ({ id: v.user_id })) : [{ id: userId }],
                isOnline: true
            });
        }

        log('CV_DONE', `${results.length}`);
        res.json({ success: true, userId, results, total: results.length });
    } catch (e) {
        log('CV_ERR', e.message);
        res.status(500).json({ error: e.message });
    }
});

app.get('/topservers', async (req, res) => {
    let tok = req.headers.authorization || req.query.token;
    if (!tok) return res.status(401).json({ error: 'Token required' });
    log('REQ_TOPSERVERS', 'scanning');

    try {
        const c = ct(tok), h = buildHeaders(c);
        const guilds = await getAllMyGuilds(h);
        log('TOPSERVERS_GUILDS', `${guilds.length}`);

        const { voiceMap } = await fetchVoiceViaGateway(c, 40000);
        log('TOPSERVERS_GW', `${voiceMap.size} guilds with voice`);

        const stats = [];
        let totalUsers = 0;

        for (const g of guilds) {
            const gid = String(g.id);
            const vs = voiceMap.get(gid) || [];
            if (vs.length === 0) continue;

            const uniqueUsers = new Set(vs.map(v => v.user_id));
            const userCount = uniqueUsers.size;
            totalUsers += userCount;

            stats.push({
                guildId: g.id,
                guildName: g.name,
                guildIcon: g.icon,
                memberCount: g.approximate_member_count || g.member_count || null,
                voiceUsers: userCount
            });
        }

        stats.sort((a, b) => b.voiceUsers - a.voiceUsers);

        log('TOPSERVERS_DONE', `${stats.length} active, ${totalUsers} total voice users`);
        res.json({
            success: true,
            totalGuilds: guilds.length,
            activeGuilds: stats.length,
            totalVoiceUsers: totalUsers,
            servers: stats.slice(0, 15)
        });
    } catch (e) {
        log('TOPSERVERS_ERR', e.message);
        res.status(500).json({ error: e.message });
    }
});

const server = app.listen(PORT, () => {
    console.log(`[KILIUA CHECKER] Running on http://localhost:${PORT}`);
});

process.on('uncaughtException', (err) => {
    console.error('[FATAL]', err);
});

process.on('unhandledRejection', (r) => {
    console.error('[WARN] Unhandled Rejection:', r);
});

process.on('SIGINT', () => {
    console.log('\n[SHUTDOWN] Stopping server...');
    server.close(() => {
        console.log('[SHUTDOWN] Server stopped.');
        process.exit(0);
    });
});