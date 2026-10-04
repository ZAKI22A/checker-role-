const {
    Client,
    GatewayIntentBits,
    Routes,
    REST,
    InteractionType,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    ActionRowBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

// ==========================================
// CONFIGURATION & SETUP
// ==========================================
const CONFIG = {
    TOKEN: process.env.BOT_TOKEN || 'YOUR_BOT_TOKEN_HERE',
    CLIENT_ID: process.env.CLIENT_ID || 'YOUR_CLIENT_ID',
    DEVELOPER_ID: process.env.DEVELOPER_ID || 'YOUR_DEVELOPER_ID'
};

const DB_FILE = path.join(__dirname, 'sources_db.json');
const EMOJIS_DB_FILE = path.join(__dirname, 'emojis_db.json');
const EMOJIS_MAP_FILE = path.join(__dirname, 'custom_emojis', 'emojis.json');
const EMOJIS_PNG_DIR = path.join(__dirname, 'custom_emojis', 'png');

if (!fs.existsSync(DB_FILE)) {
    fs.writeFileSync(DB_FILE, JSON.stringify({ sources: {} }, null, 2));
}
if (!fs.existsSync(EMOJIS_DB_FILE)) {
    // Default fallback emojis
    fs.writeFileSync(EMOJIS_DB_FILE, JSON.stringify({
        butterfly: '🦋',
        success: '🟢',
        danger: '🔴',
        clock: '🟠',
        export_arrow: '💾',
        wifi: '🔗',
        admin: '👾',
        star: '⭐'
    }, null, 2));
}

function getDatabase() {
    return JSON.parse(fs.readFileSync(DB_FILE, 'utf8'));
}
function saveDatabase(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2));
}
function getEmojisDB() {
    return JSON.parse(fs.readFileSync(EMOJIS_DB_FILE, 'utf8'));
}
function saveEmojisDB(data) {
    fs.writeFileSync(EMOJIS_DB_FILE, JSON.stringify(data, null, 2));
}

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
    ]
});

const rest = new REST({ version: '10' }).setToken(CONFIG.TOKEN);

// ==========================================
// COMPONENT V2 GENERATOR (CONTAINERS)
// ==========================================
function buildSourceContainer(sourceData) {
    const emojis = getEmojisDB();
    
    // Choose status emoji dynamically
    let statusEmoji = emojis.success;
    if (sourceData.status.toLowerCase() === 'maintenance') statusEmoji = emojis.clock || '🟠';
    if (sourceData.status.toLowerCase() === 'deprecated') statusEmoji = emojis.danger || '🔴';

    return {
        type: 17,
        accent_color: 0x9B59B6,
        components: [
            {
                type: 10,
                text: `# FeroX Devs ${emojis.butterfly || '🦋'} ${emojis.admin || '👾'}`
            },
            {
                type: 10,
                text: `> \`Source No\`: ${sourceData.sourceNo}\n> \`Source Name\`: ${sourceData.name}\n> \`Source Language\`: ${sourceData.language}\n> \`Source Status\`: ${sourceData.status} ${statusEmoji}\n> \`Downloads\`: ${sourceData.downloads}`
            },
            {
                type: 10,
                text: `> **Linkz & Credit**\n> ${emojis.wifi || '🔗'} [Tutorial](${sourceData.tutorialUrl})\n> ${emojis.wifi || '🔗'} [Website](${sourceData.websiteUrl})`
            },
            {
                type: 14,
                spacing: 1
            },
            {
                type: 12,
                components: [
                    { url: sourceData.banner1 },
                    { url: sourceData.banner2 }
                ]
            },
            {
                type: 1,
                components: [
                    { type: 2, style: 1, custom_id: `dl_${sourceData.sourceNo}`, label: 'Download Source', emoji: { name: '💾' } },
                    { type: 2, style: 2, custom_id: `rate_${sourceData.sourceNo}`, label: 'Rate Source', emoji: { name: '⭐' } },
                    { type: 2, style: 3, custom_id: `save_${sourceData.sourceNo}`, label: 'Bookmark', emoji: { name: '🔖' } }
                ]
            },
            {
                type: 10,
                text: `-# Developed by FeroX Team • Protected System`
            }
        ]
    };
}

// ==========================================
// SLASH COMMAND REGISTRATION
// ==========================================
const commands = [
    {
        name: 'devpanel',
        description: 'Developer Management Control Panel (Restricted)',
    }
];

client.once('ready', async () => {
    console.log(`[READY] Logged in as ${client.user.tag}`);
    try {
        await rest.put(Routes.applicationCommands(client.user.id), { body: commands });
        console.log('[READY] Registered /devpanel slash command successfully.');
    } catch (error) {
        console.error('[ERROR] Failed to register slash commands:', error);
    }
});

client.on('interactionCreate', async (interaction) => {
    try {
        if (interaction.isChatInputCommand()) {
            if (interaction.commandName === 'devpanel') {
                if (interaction.user.id !== CONFIG.DEVELOPER_ID) {
                    return interaction.reply({ content: '⛔ You do not have permission to use the Developer Panel.', ephemeral: true });
                }

                // Main Developer Panel UI
                await rest.post(Routes.channelMessages(interaction.channelId), {
                    body: {
                        content: '',
                        components: [
                            {
                                type: 17,
                                accent_color: 0x2C3E50,
                                components: [
                                    {
                                        type: 10,
                                        text: `# Developer Control Panel 🛠️`
                                    },
                                    {
                                        type: 10,
                                        text: `Welcome to the FeroX Admin Board.\n> ☁️ **Sync Emojis**: Auto-upload all PNGs from \`custom_emojis\` folder.\n> 📝 **Create Source**: Open the modal to deploy a new source card.`
                                    },
                                    {
                                        type: 1,
                                        components: [
                                            { type: 2, style: 3, custom_id: `dev_create_source`, label: 'Create Source Card', emoji: { name: '📝' } },
                                            { type: 2, style: 1, custom_id: `dev_sync_emojis`, label: 'Sync Emojis', emoji: { name: '☁️' } }
                                        ]
                                    }
                                ]
                            }
                        ]
                    }
                });

                await interaction.reply({ content: 'Developer Panel Opened!', ephemeral: true });
            }
        }
        else if (interaction.type === InteractionType.ModalSubmit) {
            if (interaction.customId === 'dev_panel_modal') {
                const sourceNo = interaction.fields.getTextInputValue('s_no').trim();
                const name = interaction.fields.getTextInputValue('s_name').trim();
                const [language, status] = interaction.fields.getTextInputValue('s_lang').split('|').map(s => s.trim());
                const [tutorialUrl, websiteUrl] = interaction.fields.getTextInputValue('s_urls').split('|').map(s => s.trim());
                const [banner1, banner2, dlLink] = interaction.fields.getTextInputValue('s_banners').split('|').map(s => s.trim());

                const db = getDatabase();
                
                db.sources[sourceNo] = {
                    sourceNo, name, language, status: status || 'Working',
                    tutorialUrl, websiteUrl, banner1, banner2, downloadLink: dlLink,
                    downloads: db.sources[sourceNo]?.downloads || 0,
                    ratings: db.sources[sourceNo]?.ratings || []
                };
                saveDatabase(db);

                const payloadContainer = buildSourceContainer(db.sources[sourceNo]);

                await rest.post(Routes.channelMessages(interaction.channelId), {
                    body: {
                        content: '',
                        components: [payloadContainer]
                    }
                });

                await interaction.reply({ content: `✅ Source card #${sourceNo} deployed successfully!`, ephemeral: true });
            }
        }
        else if (interaction.isButton()) {
            const action = interaction.customId;
            
            // --- DEV PANEL BUTTONS ---
            if (action === 'dev_create_source') {
                const modal = new ModalBuilder()
                    .setCustomId('dev_panel_modal')
                    .setTitle('Create/Update Source Card');

                modal.addComponents(
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s_no').setLabel('Source No (e.g., 02)').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s_name').setLabel('Source Name').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s_lang').setLabel('Language & Status (e.g. JS|Working)').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s_urls').setLabel('Tutorial URL | Website URL').setStyle(TextInputStyle.Short).setRequired(true)),
                    new ActionRowBuilder().addComponents(new TextInputBuilder().setCustomId('s_banners').setLabel('Banner1 URL | Banner2 URL | DL Link').setStyle(TextInputStyle.Paragraph).setRequired(true))
                );

                await interaction.showModal(modal);
            }
            else if (action === 'dev_sync_emojis') {
                await interaction.deferReply({ ephemeral: true });
                
                if (!fs.existsSync(EMOJIS_MAP_FILE)) {
                    return interaction.editReply('❌ `emojis.json` not found in `custom_emojis` folder.');
                }
                
                const emojisMap = JSON.parse(fs.readFileSync(EMOJIS_MAP_FILE, 'utf8'));
                let emojisDB = getEmojisDB();
                const guild = interaction.guild;
                
                if (!guild) return interaction.editReply('❌ This command must be used in a server.');
                
                let successCount = 0;
                let failCount = 0;

                for (const [emojiName, fileName] of Object.entries(emojisMap)) {
                    const filePath = path.join(EMOJIS_PNG_DIR, fileName);
                    if (fs.existsSync(filePath)) {
                        try {
                            // Check if emoji already exists to avoid duplicates
                            let existing = guild.emojis.cache.find(e => e.name === emojiName);
                            if (!existing) {
                                existing = await guild.emojis.create({ attachment: filePath, name: emojiName });
                            }
                            // Save to our DB format: <:name:id>
                            emojisDB[emojiName] = `<:${existing.name}:${existing.id}>`;
                            successCount++;
                        } catch (err) {
                            console.error(`Failed to upload ${emojiName}:`, err.message);
                            failCount++;
                        }
                    }
                }
                
                saveEmojisDB(emojisDB);
                await interaction.editReply(`✅ Sync Complete!\nSuccessfully uploaded/synced: **${successCount}** emojis.\nFailed: **${failCount}** emojis.`);
            }
            // --- SOURCE CARD BUTTONS ---
            else if (action.startsWith('dl_') || action.startsWith('rate_') || action.startsWith('save_')) {
                const [cmd, s_no] = action.split('_');
                const db = getDatabase();
                const source = db.sources[s_no];

                if (!source) {
                    return interaction.reply({ content: '❌ Source data not found in database.', ephemeral: true });
                }

                if (cmd === 'dl') {
                    source.downloads += 1;
                    saveDatabase(db);

                    const updatedContainer = buildSourceContainer(source);
                    await rest.patch(Routes.channelMessage(interaction.channelId, interaction.message.id), {
                        body: {
                            components: [updatedContainer]
                        }
                    });

                    await interaction.reply({
                        content: `🎉 **Thank you for downloading!**\nHere is your direct access link: ${source.downloadLink}`,
                        ephemeral: true
                    });
                }
                else if (cmd === 'rate') {
                    await interaction.reply({ content: '⭐ Feedback system triggered!', ephemeral: true });
                }
                else if (cmd === 'save') {
                    try {
                        await interaction.user.send(`🔖 **Bookmark for ${source.name}**\n- Tutorial: ${source.tutorialUrl}\n- Website: ${source.websiteUrl}`);
                        await interaction.reply({ content: '✅ Links sent to your DMs!', ephemeral: true });
                    } catch (err) {
                        await interaction.reply({ content: '❌ Could not DM you. Please check your privacy settings.', ephemeral: true });
                    }
                }
            }
        }
    } catch (error) {
        console.error('[INTERACTION ERROR]', error);
        if (interaction.isRepliable() && !interaction.replied) {
            await interaction.reply({ content: '❌ An error occurred processing this interaction.', ephemeral: true }).catch(()=>{});
        }
    }
});

client.login(CONFIG.TOKEN);
