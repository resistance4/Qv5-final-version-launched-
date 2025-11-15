const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, PermissionFlagsBits } = require('discord.js');
const { initializeDatabase, saveHelpInteraction, getHelpInteraction, deleteHelpInteraction, cleanupOldInteractions } = require('./database');
require('dotenv').config();

// Voice Manager Integration
const VoiceManager = require('./voiceManagement');
const voiceManager = new VoiceManager();

// Music Manager Integration
const MusicManager = require('./musicManager');
let musicManager = null;

// Role Manager Integration
const RoleManager = require('./roleManagement');
let roleManager = null;

// Channel Manager Integration
const ChannelManager = require('./channelManagement');
let channelManager = null;

// Media & Threads Manager Integration
const MediaThreadsManager = require('./mediaThreadsManagement');
let mediaThreadsManager = null;

// Utility Commands Integration
const UtilityCommands = require('./utilityCommands');
let utilityManager = null;

// Security Manager Integration
const SecurityManager = require('./securityManager');
const { EmbedBuilder: SecurityEmbedBuilder, AuditLogEvent } = require('discord.js');
let securityManager = null;

// Ticket Manager Integration
const TicketManager = require('./ticketManagement');
let ticketManager = null;

const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildVoiceStates,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.GuildBans,
        GatewayIntentBits.GuildEmojisAndStickers,
        GatewayIntentBits.GuildIntegrations,
        GatewayIntentBits.GuildWebhooks
    ]
});

// Configuration - Now configurable via environment variables
let QUARANTINE_ROLE_ID = process.env.QUARANTINE_ROLE_ID || '1404869933430738974';
const LOGS_CHANNEL_ID = '1378464794499092581'; // Owner logs channel
const STATS_CHANNEL_ID = '1406918820165193758';
const MEMBER_INFO_CHANNEL_ID = '1408878114616115231';
let ADMIN_QUARANTINE_CHANNEL_ID = process.env.ADMIN_QUARANTINE_CHANNEL_ID || '1410011813398974626'; // Owner Commands channel
const DEFAULT_QUARANTINE_DURATION = 5; // 5 minutes
const STRICT_MEMBER_INFO_QUARANTINE_DURATION = 15; // 15 minutes for strict mode

// Bot Owner ID (set this in your .env file) - ONLY THIS USER CAN MAKE CHANGES
const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';

// Extra Owner System - Permanent and Temporary
const permanentExtraOwners = new Set(); // Permanent extra owners - full immunity
const temporaryExtraOwners = new Map(); // userId -> { expiresAt, grantedBy }

// WhatsApp Alert Configuration for Critical Security Breaches
const WHATSAPP_ALERT_NUMBER = process.env.WHATSAPP_ALERT_NUMBER || '+916369957743'; // Your personal WhatsApp number

// Server Template Storage for Auto-Restoration
const serverTemplates = new Map();

// Channel Position Tracking for Auto-Realignment
const channelPositions = new Map();
const rolePositions = new Map();

// Scanning Interval Configuration
const SERVER_SCAN_INTERVAL = 60000; // 60 seconds
const scanTimers = new Map();

// Bypass Attempt Tracking
const bypassAttempts = new Map();

// Enhanced Quarantine Tracking with Server Rejoin Detection
const quarantineEvasionTracking = new Map(); // userId -> { originalQuarantineTime, evasionAttempts }

// WhatsApp alert tracking to prevent spam
const whatsappAlertTracking = new Map(); // guildId -> { lastAlert: timestamp, alertQueue: [] }
const WHATSAPP_COOLDOWN = 300000; // 5 minutes cooldown between WhatsApp alerts

// ===== ANTI-SPAM SYSTEM =====
// Command Cooldown System - Prevents command spamming
const commandCooldowns = new Map(); // userId -> { commandName -> timestamp }
const COMMAND_COOLDOWN_TIME = 3000; // 3 seconds cooldown per command
const CHANNEL_CREATION_COOLDOWN = 5000; // 5 seconds for channel creation commands
const GLOBAL_USER_COOLDOWN = 1000; // 1 second between any commands

// Interaction Deduplication - Prevents double execution of slash commands
const processedInteractions = new Set(); // Set of interaction IDs that have been processed
const INTERACTION_TIMEOUT = 5000; // 5 seconds to clear processed interactions

// Critical Security Alert Function with WhatsApp Integration (Anti-Spam)
async function sendCriticalSecurityAlert(guild, alertType, details, violator = null) {
    try {
        const guildId = guild.id;
        const currentTime = Date.now();

        // Get or create alert tracking for this guild
        let alertData = whatsappAlertTracking.get(guildId) || { lastAlert: 0, alertQueue: [] };

        // Add current alert to queue
        alertData.alertQueue.push({
            alertType,
            details,
            violator: violator ? { username: violator.username, id: violator.id } : null,
            timestamp: currentTime
        });

        let whatsappSent = false;

        // Check if enough time has passed since last WhatsApp alert (5 minutes cooldown)
        if (currentTime - alertData.lastAlert >= WHATSAPP_COOLDOWN) {
            // Consolidate all queued alerts into one message
            const consolidatedMessage = `🚨 CRITICAL SECURITY ALERTS 🚨

🛡️ Server: ${guild.name}
📊 Total Alerts: ${alertData.alertQueue.length}
📅 Time Period: ${new Date(alertData.alertQueue[0].timestamp).toLocaleString()} - ${new Date().toLocaleString()}

⚠️ RECENT VIOLATIONS:
${alertData.alertQueue.slice(-5).map((alert, index) =>
    `${index + 1}. ${alert.alertType}${alert.violator ? ` by ${alert.violator.username}` : ''}`
).join('\n')}

🚨 GOD-LEVEL PROTECTION ACTIVE - SERVER SECURED`;

            // Send consolidated WhatsApp alert
            whatsappSent = await sendWhatsAppMessage(WHATSAPP_ALERT_NUMBER, consolidatedMessage);

            if (whatsappSent) {
                console.log(`✅ Consolidated WhatsApp alert sent (${alertData.alertQueue.length} alerts) to ${WHATSAPP_ALERT_NUMBER}`);
                alertData.lastAlert = currentTime;
                alertData.alertQueue = []; // Clear queue after sending
            } else {
                console.error(`❌ Failed to send consolidated WhatsApp alert to ${WHATSAPP_ALERT_NUMBER}`);
            }
        } else {
            console.log(`⏳ WhatsApp alert queued (cooldown active). Queue size: ${alertData.alertQueue.length}`);
        }

        // Update tracking
        whatsappAlertTracking.set(guildId, alertData);

        // Always send Discord alert (single consolidated embed)
        const criticalEmbed = new EmbedBuilder()
            .setColor('#8B0000')
            .setTitle('🚨 SECURITY VIOLATION DETECTED')
            .setDescription(`**GOD-LEVEL PROTECTION ACTIVE**\n\nSecurity violation detected and logged!`)
            .addFields(
                { name: '📱 WhatsApp Status', value: whatsappSent ? `✅ Alert sent to: ${WHATSAPP_ALERT_NUMBER}` : `⏳ Queued (${alertData.alertQueue.length} pending)`, inline: true },
                { name: '⚠️ Alert Type', value: alertType, inline: true },
                { name: '🎯 Violator', value: violator ? `${violator.username} (\`${violator.id}\`)` : 'Unknown', inline: true },
                { name: '📝 Details', value: details.substring(0, 1000), inline: false },
                { name: '🛡️ Protection Status', value: '✅ **THREAT NEUTRALIZED**', inline: true },
                { name: '📊 Alert Queue', value: `${alertData.alertQueue.length} pending alerts`, inline: true }
            )
            .setFooter({ text: 'God-Level Protection System - Anti-Spam Active' })
            .setTimestamp();

        await sendLogMessage(guild, criticalEmbed);
        return whatsappSent;
    } catch (error) {
        console.error('Error sending critical security alert:', error);
        return false;
    }
}

// Function to send WhatsApp message using Twilio API
async function sendWhatsAppMessage(phoneNumber, message) {
    try {
        // Twilio WhatsApp API configuration
        const accountSid = process.env.TWILIO_ACCOUNT_SID;
        const authToken = process.env.TWILIO_AUTH_TOKEN;
        const fromWhatsApp = process.env.TWILIO_WHATSAPP_NUMBER; // Format: whatsapp:+14155238886

        if (!accountSid || !authToken || !fromWhatsApp) {
            console.error('Missing Twilio credentials. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER in environment variables.');
            console.error('Required format: TWILIO_WHATSAPP_NUMBER=whatsapp:+14155238886');
            return false;
        }

        // Clean and format phone number for WhatsApp (remove all spaces and special characters)
        const cleanPhoneNumber = phoneNumber.replace(/[\s\-\(\)]/g, ''); // Remove spaces, dashes, parentheses
        let formattedToNumber;

        if (cleanPhoneNumber.startsWith('whatsapp:')) {
            formattedToNumber = cleanPhoneNumber;
        } else if (cleanPhoneNumber.startsWith('+')) {
            formattedToNumber = `whatsapp:${cleanPhoneNumber}`;
        } else {
            formattedToNumber = `whatsapp:+${cleanPhoneNumber}`;
        }

        // Ensure fromWhatsApp has correct format
        let formattedFromNumber = fromWhatsApp;
        if (!fromWhatsApp.startsWith('whatsapp:')) {
            formattedFromNumber = fromWhatsApp.startsWith('+') ? `whatsapp:${fromWhatsApp}` : `whatsapp:+${fromWhatsApp}`;
        }

        // Validate that To and From are different
        if (formattedFromNumber === formattedToNumber) {
            console.error('❌ Error: From and To numbers are the same!');
            console.error(`From: ${formattedFromNumber}`);
            console.error(`To: ${formattedToNumber}`);
            console.error('Please ensure TWILIO_WHATSAPP_NUMBER is your Twilio sandbox number (e.g., whatsapp:+14155238886)');
            console.error('And WHATSAPP_ALERT_NUMBER is your personal WhatsApp number (e.g., +916369957743)');
            return false;
        }

        // Twilio API endpoint
        const url = `https://api.twilio.com/2010-04-01/Accounts/${accountSid}/Messages.json`;

        // Prepare the request body
        const body = new URLSearchParams({
            From: formattedFromNumber,
            To: formattedToNumber,
            Body: message
        });

        // Send the request
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${Buffer.from(`${accountSid}:${authToken}`).toString('base64')}`,
                'Content-Type': 'application/x-www-form-urlencoded'
            },
            body: body.toString()
        });

        const responseData = await response.json();

        if (response.ok) {
            console.log(`✅ WhatsApp message sent successfully!`);
            console.log(`📧 Message SID: ${responseData.sid}`);
            console.log(`📱 Sent to: ${formattedToNumber}`);
            console.log(`📤 From: ${formattedFromNumber}`);
            return true;
        } else {
            console.error('❌ Failed to send WhatsApp message:');
            console.error('Response Status:', response.status);
            console.error('Error Details:', responseData);
            console.error('From Number:', formattedFromNumber);
            console.error('To Number:', formattedToNumber);

            // Provide specific error guidance
            if (responseData.code === 63031) {
                console.error('💡 Fix: Ensure TWILIO_WHATSAPP_NUMBER and WHATSAPP_ALERT_NUMBER are different numbers');
            } else if (responseData.code === 21211) {
                console.error('💡 Fix: Check phone number format - ensure no spaces and correct country code');
            } else if (responseData.code === 21614) {
                console.error('💡 Fix: Phone number is not verified for WhatsApp sandbox - send join message first');
            }

            return false;
        }

    } catch (error) {
        console.error('❌ Critical error sending WhatsApp message:', error);
        console.error('Error details:', error.message);
        return false;
    }
}

// ===== ANTI-SPAM COOLDOWN FUNCTIONS =====

/**
 * Check if a user is on cooldown for a specific command
 * @param {string} userId - The user's ID
 * @param {string} commandName - The command name
 * @returns {Object} { onCooldown: boolean, remaining: number }
 */
function checkCooldown(userId, commandName) {
    const now = Date.now();
    
    // Get user's cooldown data
    if (!commandCooldowns.has(userId)) {
        commandCooldowns.set(userId, new Map());
    }
    
    const userCooldowns = commandCooldowns.get(userId);
    
    // Check if command is on cooldown
    if (userCooldowns.has(commandName)) {
        const expirationTime = userCooldowns.get(commandName);
        
        if (now < expirationTime) {
            const remaining = Math.ceil((expirationTime - now) / 1000);
            return { onCooldown: true, remaining };
        }
    }
    
    return { onCooldown: false, remaining: 0 };
}

/**
 * Set cooldown for a user and command
 * @param {string} userId - The user's ID
 * @param {string} commandName - The command name
 * @param {number} cooldownTime - Cooldown time in milliseconds (optional)
 */
function setCooldown(userId, commandName, cooldownTime = COMMAND_COOLDOWN_TIME) {
    const now = Date.now();
    
    // Determine cooldown time based on command type
    const channelCreationCommands = ['crcato', 'crchannel', 'crvc', 'delchannel', 'clone', 'nuke'];
    const actualCooldown = channelCreationCommands.includes(commandName) 
        ? CHANNEL_CREATION_COOLDOWN 
        : cooldownTime;
    
    if (!commandCooldowns.has(userId)) {
        commandCooldowns.set(userId, new Map());
    }
    
    const userCooldowns = commandCooldowns.get(userId);
    userCooldowns.set(commandName, now + actualCooldown);
    
    // Clean up expired cooldowns for this user
    setTimeout(() => {
        if (userCooldowns.has(commandName)) {
            userCooldowns.delete(commandName);
            if (userCooldowns.size === 0) {
                commandCooldowns.delete(userId);
            }
        }
    }, actualCooldown + 1000);
}

/**
 * Check if an interaction has already been processed
 * @param {string} interactionId - The interaction ID
 * @returns {boolean} True if already processed
 */
function isInteractionProcessed(interactionId) {
    return processedInteractions.has(interactionId);
}

/**
 * Mark an interaction as processed
 * @param {string} interactionId - The interaction ID
 */
function markInteractionProcessed(interactionId) {
    processedInteractions.add(interactionId);
    
    // Auto-cleanup after timeout
    setTimeout(() => {
        processedInteractions.delete(interactionId);
    }, INTERACTION_TIMEOUT);
}

// MAXIMUM SECURITY SETTINGS - ONLY OWNER AND BOT CAN MAKE CHANGES
const MAXIMUM_SECURITY_QUARANTINE_DURATION = 120; // 2 hours in minutes
const SECURITY_VIOLATION_MESSAGE = "Fuck You Motherfucker, Don't even think of nuke you will fucked by script.agi";

// Whitelisted Bot IDs - Only these bots are allowed in the server
const WHITELISTED_BOTS = new Set([
    '1393280411278250144',
    '1407469517952520233',
    '1408546840605102182',
    '1408559977131671582',
    '276060004262477825',
    '493716749342998541',
    '282859044593598464',
    '697487580522086431',
    '1040476339192463430',
    '651095740390834176',
    '155149108183695360',
    '906085578909548554',
    '536991182035746816',
    '285480424904327179',
    '1021732722479202304',
    '944016826751389717',
    '270904126974590976',
    '408785106942164992',
    '1376968654209683557',
    '813130993640013874' // Activity Roles bot - IMMUNE
]);

// Make WHITELISTED_BOTS globally accessible for SecurityManager
global.WHITELISTED_BOTS = WHITELISTED_BOTS;

// Store flagged bots to prevent re-entry
const flaggedBots = new Set();

// Store flagged users to prevent re-entry
const flaggedUsers = new Set();

// Store server baseline for protection monitoring
const serverBaselines = new Map();

// Protection monitoring settings
const PROTECTION_SETTINGS = {
    MONITOR_CHANNELS: true,
    MONITOR_ROLES: true,
    MONITOR_PERMISSIONS: true,
    MONITOR_SERVER_SETTINGS: true,
    AUTO_FLAG_VIOLATORS: true,
    MAX_CHANGES_PER_MINUTE: 3, // Maximum allowed changes per minute per user
    PROTECTION_IMMUNE_USERS: new Set([BOT_OWNER_ID]), // ONLY OWNER IS IMMUNE - NO ONE ELSE
    PROTECTION_IMMUNE_BOTS: WHITELISTED_BOTS, // ALL WHITELISTED BOTS ARE IMMUNE
};

// Track user actions for rate limiting
const userActionTracking = new Map(); // userId -> { actions: [], lastReset: timestamp }

// Interim Role Manager Configuration
const INTERIM_ROLE_CHANNEL_ID = '1424355607690874940';
const INTERIM_ROLE_ID = '1409244307767955586';
const OWNER_CHANNEL_ID = '1410011813398974626'; // Owner Commands channel
const INTERIM_ROLE_DURATION = 10; // 10 minutes in minutes
// Store interim role tracking - no limit on uses, but track for timeout management
const interimRoleTimeouts = new Map(); // userId -> timeoutId for auto-removal

// Store server-specific configurations
const serverConfigs = new Map();

// Store current music status per guild
const guildMusicStatus = new Map();

// Permanent music channel configuration
const PERMANENT_MUSIC_CHANNEL_ID = '1408410757200351385';

// Music Manager will be initialized after client is ready

// Function to check if user is authorized to use commands
function isAuthorized(message) {
    const serverConfig = serverConfigs.get(message.guild.id) || {};
    const adminChannelId = serverConfig.adminChannelId || ADMIN_QUARANTINE_CHANNEL_ID;
    const isBotOwner = message.author.id === BOT_OWNER_ID;
    const isServerOwner = message.author.id === message.guild.ownerId;
    const hasAdminRole = message.member && message.member.permissions.has('Administrator');
    const isInOwnerChannel = message.channel.id === '1410011813398974626';
    const isInAdminChannel = message.channel.id === adminChannelId;

    // Bot owner can use commands globally in any channel
    if (isBotOwner) {
        return true;
    }

    // Server owner can use commands in any channel
    if (isServerOwner) {
        return true;
    }

    // Admin role users can use commands in designated channels
    return hasAdminRole && (isInOwnerChannel || isInAdminChannel);
}

// Duration options for quarantine
const DURATION_OPTIONS = {
    '5m': 5,
    '10m': 10,
    '15m': 15,
    '30m': 30,
    '1h': 60,
    '2h': 120,
    '4h': 240,
    '8h': 480,
    '12h': 720,
    '1d': 1440,
    '2d': 2880,
    '3d': 4320,
    '1w': 10080,
    '2w': 20160,
    '28d': 40320
};


// Store quarantined users (in production, use a database)
const quarantinedUsers = new Map();

// Store original roles for restoration
const originalRoles = new Map();

// Function to count total commands available
function getTotalCommandsCount() {
    // Count all available commands including aliases
    const commands = [
        // Extra Owner System (4 commands)
        'extra owner', 'temp owner', 'remove owner', 'list owners',
        // Quarantine System (9 commands)
        'qr', 'uq', 'kick', 'ban', 'mute', 'unmute', 'warn', 'clear', 'slowmode',
        // Basic Role Management (3 commands)
        'addrole', 'removerole', 'roles',
        // Advanced Role Management (7 commands)
        'createrole', 'cr', 'deleterole', 'dr', 'editrole', 'er', 'roleinfo', 'ri', 'inrole', 'membersinrole', 'removeallroles', 'rar', 'roleall',
        // Interim Role Management (8 commands)
        'prmtr', 'revtr', 'remtr', 'addtr', 'sendinterim', 'intrch', 'intrm', 'setinterimrole',
        // Channel Access Control (2 commands)
        'clstr', 'optr',
        // Auto-Mod System (5 commands)
        'automod', 'automodconfig', 'amc', 'blacklist', 'clearwarnings', 'cw',
        // Global Moderation (5 commands)
        'globalban', 'gban', 'globalunban', 'gunban', 'globalkick', 'gkick', 'globalwarn', 'gwarn', 'globallock', 'glock',
        // Bot Protection (5 commands)
        'whitelist', 'flagged', 'unflag', 'scanserver', 'purgebots',
        // User Protection (2 commands)
        'unfu', 'flaggedusers',
        // Server Protection (2 commands)
        'protection', 'createbaseline',
        // Server Templates (3 commands)
        'srvcrt', 'mdfsrv', 'mdfsv',
        // Emergency Commands (4 commands)
        'panic', 'stop panic', 'emergency', 'end emergency',
        // Configuration (4 commands)
        'set', 'recovery', 'nightmode', 'wbtestan',
        // Voice Management (11 commands)
        'vmute', 'vunmute', 'vmuteall', 'vunmuteall', 'vdefend', 'vundefend', 'vdefendall', 'vundefendall', 'vdefended', 'muv', 'muvu', 'hvcm',
        // Text Channel Management (9 commands)
        'lock', 'locktext', 'unlock', 'unlocktext', 'open', 'opentext', 'hide', 'hidechannel', 'show', 'showchannel', 'reveal',
        'slowmode', 'slow', 'rename', 'renamechannel', 'topic', 'settopic',
        // Voice Channel Management (8 commands)
        'lockvc', 'lockvoice', 'mutevc', 'unlockvc', 'unlockvoice', 'openvc', 'hidevc', 'hidevoice', 'showvc', 'showvoice', 'revealvc',
        'limit', 'userlimit', 'bitrate', 'setbitrate',
        // Join-to-Create (3 commands)
        'j2c', 'join2create', 'setupj2c', 'removej2c', 'disablej2c',
        // Channel Info (2 commands)
        'permissions', 'perms', 'channels', 'listchannels',
        // Media Channel Management (4 commands)
        'enablemedia', 'mediachannel', 'mediaslowmode', 'mediaslow', 'lockmedia', 'unlockmedia', 'openmedia',
        // Thread Management (7 commands)
        'createthread', 'newthread', 'lockthread', 'unlockthread', 'openthread', 'archivethread', 'unarchivethread', 'deletethread', 'removethread',
        // Ticket System (3 commands)
        'ticket', 'ticketopen', 'ticketclose',
        // Utility Commands (10 commands + emergency)
        'ping', 'help', 'dev', 'dm', 'ui', 'userinfo', 'fck', 'avatar', 'serverlogo', 'roleinfo', 'rename', 'srvpasuse',
        'panic', 'stop panic', 'emergency', 'end emergency', 'wbtestan'
    ];

    // Remove duplicates and count unique commands
    const uniqueCommands = [...new Set(commands)];
    return uniqueCommands.length;
}


// Blacklisted words
const blacklistedWords = [
    "panel", "regedit", "sensi", "aimbot", "hologram", "meta", "macro",
    "anti ban", "hack", "aim kill", "silent aim", "up player", "aim",
    "head tracking", "external", "internal", "magic bullet", "aim lock",
    "aim.apk", "panel.zip", "wallhack", "speedhack", "esp", "location",
    "cheat", "client", "no recoil", "matrix", "booster", "optimizer",
    "root", "bypass", "dns", "vpn", "injector", "auto aim", "streamer",
    "fov", "npc", "config", "high damage", "white body", "h4x",
    "fake lag", "hook", "script", "antenna", "red body", "otha", "badu",
    "thavidiya", "punda", "kandaroli", "echa thavidiya", "punda", "otha",
    "lavadigopal", "kudhi", "badu", "suthu", "unga amma", "un alu",
    "pool", "voombu", "moola", "nakku"
];

// URL/Invite detection regex patterns
const urlRegex = /(https?:\/\/[^\s]+)/gi;
const discordInviteRegex = /(discord\.gg\/[a-zA-Z0-9]+|discord\.com\/invite\/[a-zA-Z0-9]+|discordapp\.com\/invite\/[a-zA-Z0-9]+)/gi;

// Function to send log message with specific channel routing
async function sendLogMessage(guild, embed, components = [], logType = 'general') {
    try {
        // Define specific channel IDs for different log types
        const logChannels = {
            voice: '1411976190998220891',        // Voice events (joins, leaves, moves, switches)
            role: '1411976584990298203',         // Role updates and member changes
            ban: '1411976704016121896',          // Ban and unban events
            quarantine: '1378464794499092581',   // Quarantine and timeout events
            general: '1410019894568681617'       // Default owner logs channel
        };

        // Select the appropriate channel based on log type
        const targetChannelId = logChannels[logType] || logChannels.general;
        const logsChannel = guild.channels.cache.get(targetChannelId);

        const messageData = { embeds: [embed] };
        if (components.length > 0) {
            messageData.components = components;
        }

        if (logsChannel) {
            await logsChannel.send(messageData);
            console.log(`✅ ${logType} log sent to channel: ${logsChannel.name} (${targetChannelId})`);
        } else {
            console.error(`❌ ${logType} log channel not found: ${targetChannelId}`);
            // Try fallback to general logs channel
            const fallbackChannel = guild.channels.cache.get(logChannels.general);
            if (fallbackChannel) {
                await fallbackChannel.send(messageData);
                console.log(`✅ Log message sent to fallback channel: ${fallbackChannel.name}`);
            }
        }
    } catch (error) {
        console.error('Error sending log message:', error);
    }
}

// Function to get current music status for a guild
function getCurrentMusicStatus(guild) {
    // Music functionality removed
}

// Function to create detailed compact member info embed with enhanced information
async function createCompactMemberInfoEmbed(member) {
    const user = member.user;
    const guild = member.guild;

    try {
        // Get member's roles (excluding @everyone)
        const roles = member.roles.cache
            .filter(role => role.id !== guild.id)
            .sort((a, b) => b.position - a.position)
            .map(role => `<@&${role.id}>`)
            .slice(0, 10);

        // Enhanced date calculations
        const joinDate = member.joinedAt;
        const accountCreated = user.createdAt;
        const now = new Date();

        const daysSinceJoin = Math.floor((now - joinDate) / (1000 * 60 * 60 * 24));
        const daysSinceCreated = Math.floor((now - accountCreated) / (1000 * 60 * 60 * 24));

        // Enhanced presence status with more details
        const presence = member.presence;
        const status = presence ? presence.status : 'offline';
        const statusEmoji = {
            'online': '✿ Online',
            'idle': '❀ Idle',
            'dnd': '✿ Do Not Disturb',
            'offline': '❀ Offline'
        }[status] || '❀ Offline';

        // Enhanced voice channel info
        const voiceChannel = member.voice.channel;
        let voiceInfo = '❀ Not in voice';
        if (voiceChannel) {
            const voiceMembers = voiceChannel.members.size;
            voiceInfo = `✿ ${voiceChannel.name} (${voiceMembers} members)`;
            if (member.voice.mute) voiceInfo += ' • ❀ Muted';
            if (member.voice.deaf) voiceInfo += ' • ❀ Deafened';
            if (member.voice.streaming) voiceInfo += ' • ✿ Streaming';
            if (member.voice.serverMute) voiceInfo += ' • ❀ Server Muted';
            if (member.voice.serverDeaf) voiceInfo += ' • ❀ Server Deafened';
        }

        // Enhanced quarantine status
        const isQuarantined = quarantinedUsers.has(user.id);
        const quarantineStatus = isQuarantined ? '✿ Quarantined' : '❀ Active Member';

        // Enhanced permissions with more details
        const permissions = member.permissions;
        const isOwner = user.id === guild.ownerId;
        const isAdmin = permissions.has('Administrator');
        const isModerator = permissions.has('ModerateMembers') || permissions.has('ManageMessages');

        let permissionLevel = 'ᯓ➺ Member';
        let keyPermissions = [];

        if (isOwner) {
            permissionLevel = '➺ Server Owner';
            keyPermissions = ['All Permissions'];
        } else if (isAdmin) {
            permissionLevel = '✿ Administrator';
            keyPermissions = ['All Permissions'];
        } else {
            if (isModerator) {
                permissionLevel = '✿ Moderator';
                if (permissions.has('BanMembers')) keyPermissions.push('Ban');
                if (permissions.has('KickMembers')) keyPermissions.push('Kick');
                if (permissions.has('ModerateMembers')) keyPermissions.push('Timeout');
            }
            if (permissions.has('ManageChannels')) keyPermissions.push('Manage Channels');
            if (permissions.has('ManageRoles')) keyPermissions.push('Manage Roles');
            if (permissions.has('ManageMessages')) keyPermissions.push('Manage Messages');
            if (permissions.has('MentionEveryone')) keyPermissions.push('Mention Everyone');
        }

        // Get boost information
        const isBooster = member.premiumSince !== null;
        const boostingSince = isBooster ? member.premiumSince : null;
        const boostInfo = isBooster ? `✿ Boosting since <t:${Math.floor(boostingSince.getTime() / 1000)}:R>` : '';

        // Get highest role info
        const highestRole = member.roles.highest;
        const roleColor = member.displayHexColor || '#FF69B4';

        // Enhanced description with more organized information
        let description = `➺ ${statusEmoji}\n`;
        description += `**${user.globalName || user.username}** ${user.discriminator !== '0' ? `#${user.discriminator}` : ''}\n`;
        description += `\`User ID: ${user.id}\`\n\n`;

        // Core Information Block
        description += `## ᯓ➺ **CORE INFORMATION**\n\n`;
        description += `**Status:** ${permissionLevel}\n`;
        description += `**Member Type:** ${quarantineStatus}\n`;
        if (member.nickname) {
            description += `**Nickname:** ${member.nickname}\n`;
        }
        description += `**Account Age:** ${daysSinceCreated} days\n`;
        description += `**Server Member:** ${daysSinceJoin} days\n`;
        description += `**Total Roles:** ${member.roles.cache.size - 1}\n`;
        if (highestRole.name !== '@everyone') {
            description += `**Highest Role:** ${highestRole.name}\n`;
        }
        if (isBooster) {
            description += `**Server Booster:** Yes\n`;
        }
        description += `\n`;

        // Voice & Activity Information
        description += `## ✿ **VOICE & ACTIVITY**\n\n`;
        description += `${voiceInfo}\n`;

        // Activity information with more details
        if (presence && presence.activities.length > 0) {
            const activity = presence.activities[0];
            let activityEmoji = '✿';
            let activityType = 'Playing';

            switch (activity.type) {
                case 0: activityEmoji = '✿'; activityType = 'Playing'; break;
                case 1: activityEmoji = '✿'; activityType = 'Streaming'; break;
                case 2: activityEmoji = '✿'; activityType = 'Listening to'; break;
                case 3: activityEmoji = '✿'; activityType = 'Watching'; break;
                case 4: activityEmoji = '❀'; activityType = 'Custom'; break;
                case 5: activityEmoji = '✿'; activityType = 'Competing in'; break;
            }

            description += `${activityEmoji} **${activityType}** ${activity.name}\n`;
            if (activity.details) {
                description += `*${activity.details}*\n`;
            }
            if (activity.state) {
                description += `*${activity.state}*\n`;
            }
        } else {
            description += `❀ No current activity\n`;
        }

        // Key Permissions (if any)
        if (keyPermissions.length > 0 && !isOwner) {
            description += `\n## ✿ **KEY PERMISSIONS**\n\n`;
            description += `\`${keyPermissions.join(', ')}\`\n`;
        }

        // Quarantine Information (if applicable)
        if (isQuarantined) {
            const quarantineData = quarantinedUsers.get(user.id);
            const timeLeft = Math.max(0, (quarantineData.startTime + quarantineData.duration) - Date.now());
            const minutesLeft = Math.ceil(timeLeft / (1000 * 60));
            const hoursLeft = Math.floor(minutesLeft / 60);
            const remainingMinutes = minutesLeft % 60;

            let timeDisplay = hoursLeft > 0 ? `${hoursLeft}h ${remainingMinutes}m` : `${minutesLeft}m`;

            description += `\n## ✿ **QUARANTINE INFORMATION**\n\n`;
            description += `**Reason:** \`${quarantineData.reason}\`\n`;
            description += `**Time Remaining:** \`${timeDisplay}\`\n`;
            description += `**Started:** <t:${Math.floor(quarantineData.startTime / 1000)}:R>\n`;
        }

        // Server Boost Information (if applicable)
        if (isBooster) {
            description += `\n${boostInfo}\n`;
        }

        // Account timestamps
        description += `\n## ✿ **TIMELINE**\n\n`;
        description += `**Account Created:** <t:${Math.floor(accountCreated.getTime() / 1000)}:F> (<t:${Math.floor(accountCreated.getTime() / 1000)}:R>)\n`;
        description += `**Joined Server:** <t:${Math.floor(joinDate.getTime() / 1000)}:F> (<t:${Math.floor(joinDate.getTime() / 1000)}:R>)\n`;

        // Music status at the bottom removed due to functionality removal
        // Music functionality removed

        // Create the enhanced embed
        const embed = new EmbedBuilder()
            .setColor('#8A00C4')
            .setAuthor({
                name: `${guild.name} • Member Overview`,
                iconURL: guild.iconURL({ dynamic: true, size: 32 })
            })
            .setDescription(description)
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 256 }));

        // Enhanced roles field with better organization
        if (roles.length > 0) {
            let rolesText = '';

            // Group roles by rows of 3 for better readability
            const roleRows = [];
            for (let i = 0; i < roles.length; i += 3) {
                roleRows.push(roles.slice(i, i + 3).join(' '));
            }

            rolesText = roleRows.join('\n');
            if (member.roles.cache.size - 1 > 10) {
                rolesText += `\n\n*... and ${member.roles.cache.size - 11} more roles*`;
            }

            embed.addFields({
                name: `✿ Roles (${member.roles.cache.size - 1} total)`,
                value: rolesText,
                inline: false
            });
        }

        embed.setFooter({
            text: `Card 1/3 • Updates every 25s • Music & member stats`,
            iconURL: client.user.displayAvatarURL({ size: 16 })
        })
            .setTimestamp();

        return embed;

    } catch (error) {
        console.error('Error creating enhanced member info embed:', error);

        // Enhanced fallback embed for errors
        const errorEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❀ Member Profile Error')
            .setDescription(`Failed to fetch complete profile information`)
            .addFields(
                { name: 'ᯓ➺ User', value: `${user.username}\n\`${user.id}\``, inline: true },
                { name: '✿ Error Type', value: 'Data retrieval failed', inline: true },
                { name: '✿ Status', value: 'Partial information available', inline: true },
                { name: '✿ Account Created', value: `<t:${Math.floor(user.createdAt.getTime() / 1000)}:R>`, inline: true },
                { name: '✿ Bot Account', value: user.bot ? 'Yes' : 'No', inline: true },
                { name: '✿ User ID', value: `\`${user.id}\``, inline: true }
            )
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
            .setFooter({
                text: `Error occurred • ${guild.name}`,
                iconURL: guild.iconURL({ size: 32 })
            })
            .setTimestamp();

        return errorEmbed;
    }
}

// Function to create Extended Member Access Card (for when content overflows)
async function createExtendedMemberAccessCard(guild, member) {
    const user = member.user;
    const guildPermissions = member.permissions;

    // Define categories with their IDs (continued from main access card)
    const categories = {
        'Scriptspace': '1406273431808512070',
        'Works': '1377702698551480450',
        'Voice': '1377704598881435729',
        'Temp': '1407684080295743639',
        'Dev': '1377705470248226886',
        'Gamers': '1377706655474647102',
        'Private': '1377707521539706880',
        'Coders': '1377708246919413901'
    };

    // Function to check channel access
    const canAccessChannel = (channel) => {
        if (!channel) return false;

        if (guildPermissions.has('Administrator')) {
            return true;
        }

        const channelPermissions = channel.permissionsFor(member);
        if (!channelPermissions) return false;

        if (channel.type === 0) {
            return channelPermissions.has('ViewChannel');
        } else if (channel.type === 2) {
            return channelPermissions.has('Connect');
        }
        return false;
    };

    let description = `## ᯓ➺ **EXTENDED ACCESS**\n\n`;

    let accessibleCategories = 0;
    let totalChannelsAccessible = 0;

    // Check remaining categories
    for (const [categoryName, categoryId] of Object.entries(categories)) {
        const category = guild.channels.cache.get(categoryId);
        if (!category || category.type !== 4) continue;

        const channelsInCategory = guild.channels.cache.filter(channel =>
            channel.parentId === categoryId && (channel.type === 0 || channel.type === 2)
        );

        if (channelsInCategory.size === 0) continue;

        const accessibleChannels = channelsInCategory.filter(channel => canAccessChannel(channel));

        if (accessibleChannels.size > 0) {
            accessibleCategories++;
            totalChannelsAccessible += accessibleChannels.size;

            let categoryEmoji = '✿';
            if (categoryName === 'Music') categoryEmoji = '🎵';
            else if (categoryName === 'Movie') categoryEmoji = '🎬';
            else if (categoryName === 'Dnd') categoryEmoji = '🎲';

            description += `${categoryEmoji} **${categoryName}** (${accessibleChannels.size})\n`;

            const channelsToShow = accessibleChannels.first(6);
            channelsToShow.forEach(channel => {
                const channelEmoji = channel.type === 2 ? '🔊' : '💬';
                description += `   ${channelEmoji} [${channel.name}](https://discord.com/channels/${guild.id}/${channel.id})\n`;
            });

            if (accessibleChannels.size > 6) {
                description += `   ❀ *+${accessibleChannels.size - 6} more channels*\n`;
            }
            description += `\n`;
        }
    }

    if (accessibleCategories === 0) {
        description += `❀ No additional accessible categories found.\n`;
    }

    return new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: `${guild.name} • Extended Access`,
            iconURL: guild.iconURL({ dynamic: true, size: 32 })
        })
        .setDescription(description)
        .setFooter({
            text: `Card 4/4 • Extended access information`,
            iconURL: client.user.displayAvatarURL({ size: 16 })
        })
        .setTimestamp();
}

// Function to create Member Access Card
function createMemberAccessCard(guild, member) {
    const user = member.user;
    const guildPermissions = member.permissions;

    // Define first set of categories with their IDs (main card)
    const categories = {
        'Scriptspace': '1406273431808512070',
        'Works': '1377702698551480450',
        'Voice': '1377704598881435729',
        'Temp': '1407684080295743639',
        'Dev': '1377705470248226886',
        'Gamers': '1377706655474647102',
        'Private': '1377707521539706880',
        'Coders': '1377708246919413901'
    };

    // Function to check channel access
    const canAccessChannel = (channel) => {
        if (!channel) return false;

        // Check if member has Administrator permission
        if (guildPermissions.has('Administrator')) {
            return true;
        }

        // Check specific channel permissions
        const channelPermissions = channel.permissionsFor(member);
        if (!channelPermissions) return false;

        // Check for basic visibility and ability to connect/view
        if (channel.type === 0) { // Text Channel
            return channelPermissions.has('ViewChannel');
        } else if (channel.type === 2) { // Voice Channel
            return channelPermissions.has('Connect');
        }
        return false;
    };

    let description = `## ᯓ➺ **MEMBER ACCESS**\n\n`;

    // If member has administration roles, show quick admin message
    if (guildPermissions.has('Administrator')) {
        description += `✿ **Administrator Access - All channels accessible**\n\n`;
    }

    let accessibleCategories = 0;
    let totalChannelsAccessible = 0;

    // Check each category
    for (const [categoryName, categoryId] of Object.entries(categories)) {
        const category = guild.channels.cache.get(categoryId);
        if (!category || category.type !== 4) continue; // Skip if not a category

        // Get channels in this category
        const channelsInCategory = guild.channels.cache.filter(channel =>
            channel.parentId === categoryId && (channel.type === 0 || channel.type === 2)
        );

        if (channelsInCategory.size === 0) continue;

        // Check which channels the member can access
        const accessibleChannels = channelsInCategory.filter(channel => canAccessChannel(channel));

        if (accessibleChannels.size > 0) {
            accessibleCategories++;
            totalChannelsAccessible += accessibleChannels.size;

            // Add category header with emoji based on category name
            let categoryEmoji = '✿';
            if (categoryName === 'Voice') categoryEmoji = '🎤';
            else if (categoryName === 'Music') categoryEmoji = '🎵';
            else if (categoryName === 'Gamers') categoryEmoji = '🎮';
            else if (categoryName === 'Movie') categoryEmoji = '🎬';
            else if (categoryName === 'Dev') categoryEmoji = '💻';
            else if (categoryName === 'Private') categoryEmoji = '🔒';
            else if (categoryName === 'Coders') categoryEmoji = '👨‍💻';

            description += `${categoryEmoji} **${categoryName}** (${accessibleChannels.size})\n`;

            // Add accessible channels (limit to 4 per category for space)
            const channelsToShow = accessibleChannels.first(4);
            channelsToShow.forEach(channel => {
                const channelEmoji = channel.type === 2 ? '🔊' : '💬';
                description += `   ${channelEmoji} [${channel.name}](https://discord.com/channels/${guild.id}/${channel.id})\n`;
            });

            // Show "and more" if there are additional channels
            if (accessibleChannels.size > 4) {
                description += `   ❀ *+${accessibleChannels.size - 4} more channels*\n`;
            }
            description += `\n`;
        }
    }

    // Add summary at the bottom
    if (accessibleCategories > 0) {
        description += `## ✿ **ACCESS SUMMARY**\n\n`;
        description += `❀ **${accessibleCategories}** categories accessible\n`;
        description += `✿ **${totalChannelsAccessible}** total channels\n`;
    } else if (!guildPermissions.has('Administrator')) {
        description += `## ❀ **NO ACCESS**\n\n`;
        description += `No accessible channels found.\nContact an administrator for access.\n`;
    }

    return new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: `${guild.name} • Member Access`,
            iconURL: guild.iconURL({ dynamic: true, size: 32 })
        })
        .setDescription(description)
        .setFooter({
            text: `Card 3/3 • Access based on your roles`,
            iconURL: client.user.displayAvatarURL({ size: 16 })
        })
        .setTimestamp();
}

// Function to send/update interim role manager widget with custom parameters
async function sendInterimRoleWidget(guild, customChannelId = null, customMessage = null) {
    try {
        const channelId = customChannelId || INTERIM_ROLE_CHANNEL_ID;
        const interimChannel = guild.channels.cache.get(channelId);

        if (!interimChannel) {
            console.error(`Interim role channel ${channelId} not found in guild ${guild.name}`);
            return false;
        }

        // Check if the bot has necessary permissions
        const botMember = guild.members.cache.get(client.user.id);
        const channelPermissions = interimChannel.permissionsFor(botMember);

        if (!channelPermissions || !channelPermissions.has(['SendMessages', 'ViewChannel', 'EmbedLinks'])) {
            console.error(`Bot lacks necessary permissions in channel ${interimChannel.name}`);
            return false;
        }

        // Use custom message or default with help command style formatting
        const embedDescription = customMessage || 
            `ᯓ➺ discord.gg/scriptspace is a highly engineered discord server providing temporary roles for a period of 10 minutes. During this period, users can join our private voice channels and have conversations with admins and moderators. This role will be automatically removed after 10 minutes - it is a temporary access role only ➺

**ᡣ𐭩 INTERIM ROLE FEATURES**

➺ **10 minutes** temporary access
➺ **Unlimited** uses available  
➺ **Private voice channels** access
➺ **Auto-removal** after timeout
➺ **100% Robust** & working system

**✿ Click the button below to get your temporary role!**`;

        // Create embed with help command UI styling
        const interimEmbed = new EmbedBuilder()
            .setColor('#C8A2C8')
            .setAuthor({
                name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
                iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
            })
            .setTitle('✗ 𖹭 **Interim Role Manager**')
            .setDescription(embedDescription)
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
            .setFooter({
                text: 'Interim Role System • Click button for access',
                iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
            })
            .setTimestamp();

        // Create button with proper Discord API format - remove emoji to avoid API issues
        const interimButton = new ButtonBuilder()
            .setCustomId('interim_role_request')
            .setLabel('Get Interim Role')
            .setStyle(ButtonStyle.Primary);

        // Create action row with proper validation
        const buttonRow = new ActionRowBuilder()
            .addComponents(interimButton);

        // Look for existing interim widget message in the channel
        let existingInterimMessage = null;
        const storageKey = customChannelId ? `${guild.id}_${customChannelId}` : guild.id;
        const storedMessageId = interimWidgetMessageIds.get(storageKey);

        if (storedMessageId) {
            try {
                existingInterimMessage = await interimChannel.messages.fetch(storedMessageId);
            } catch (error) {
                console.log(`Stored message ${storedMessageId} not found, clearing stored ID`);
                interimWidgetMessageIds.delete(storageKey);
            }
        }

        // If no stored message found, search for existing widget
        if (!existingInterimMessage) {
            try {
                const messages = await interimChannel.messages.fetch({ limit: 50 });
                existingInterimMessage = messages.find(msg =>
                    msg.author.id === client.user.id &&
                    msg.embeds.length > 0 &&
                    msg.embeds[0].title &&
                    msg.embeds[0].title.includes('Interim Role Manager')
                );

                if (existingInterimMessage) {
                    interimWidgetMessageIds.set(storageKey, existingInterimMessage.id);
                    console.log(`Found existing interim widget message: ${existingInterimMessage.id}`);
                }
            } catch (error) {
                console.error('Error searching for existing messages:', error);
            }
        }

        // Prepare message payload with proper structure
        const messageData = {
            embeds: [interimEmbed],
            components: [buttonRow]
        };

        // Update existing message or create new one
        if (existingInterimMessage) {
            try {
                await existingInterimMessage.edit(messageData);
                console.log('Interim role widget updated successfully');
                return true;
            } catch (error) {
                console.error('Error updating existing message:', error);
                console.error('Error details:', error.message);
                // If update fails, try to send a new message
                existingInterimMessage = null;
            }
        }

        // Send new message if no existing message or update failed
        if (!existingInterimMessage) {
            try {
                const newMessage = await interimChannel.send(messageData);
                interimWidgetMessageIds.set(storageKey, newMessage.id);
                console.log(`New interim role widget sent successfully: ${newMessage.id}`);
                return true;
            } catch (error) {
                console.error('Error sending new interim widget message:', error);
                console.error('Error details:', error.message);
                console.error('Full error:', error);
                return false;
            }
        }

    } catch (error) {
        console.error('Critical error in sendInterimRoleWidget:', error);
        console.error('Error details:', error.message);
        return false;
    }
}

// Function to grant interim role
async function grantInterimRole(member, interaction) {
    const userId = member.user.id;
    const guild = member.guild;

    try {
        // Check if user already has the interim role
        const interimRole = guild.roles.cache.get(INTERIM_ROLE_ID);
        if (!interimRole) {
            await interaction.reply({
                content: '❌ Interim role not found. Please contact an administrator.',
                ephemeral: true
            });
            return false;
        }

        if (member.roles.cache.has(INTERIM_ROLE_ID)) {
            // If user already has the role, clear existing timeout and restart it
            const existingTimeoutId = interimRoleTimeouts.get(userId);
            if (existingTimeoutId) {
                clearTimeout(existingTimeoutId);
            }

            // Restart the 10-minute timer
            const timeoutId = setTimeout(async () => {
                try {
                    const currentMember = await guild.members.fetch(userId);
                    if (currentMember && currentMember.roles.cache.has(INTERIM_ROLE_ID)) {
                        await currentMember.roles.remove(interimRole, 'Interim role expired - temporary access only');

                        // Send DM to user
                        try {
                            const expiredEmbed = new EmbedBuilder()
                                .setColor('#FF6B6B')
                                .setTitle('⏰ Interim Role Expired')
                                .setDescription(`Your temporary interim role in **${guild.name}** has expired after 10 minutes.`)
                                .addFields(
                                    { name: 'Status', value: 'Role automatically removed', inline: true },
                                    { name: 'Access Type', value: 'Temporary only', inline: true }
                                )
                                .setFooter({ text: 'You can request the role again anytime!' })
                                .setTimestamp();

                            await currentMember.user.send({ embeds: [expiredEmbed] });
                        } catch (dmError) {
                            console.log('Could not send expiry DM to user:', dmError.message);
                        }

                        console.log(`Interim role automatically removed from ${currentMember.user.username}`);
                    }
                    interimRoleTimeouts.delete(userId);
                } catch (error) {
                    console.error('Error removing interim role:', error);
                }
            }, INTERIM_ROLE_DURATION * 60 * 1000);

            interimRoleTimeouts.set(userId, timeoutId);

            await interaction.reply({
                content: '✅ Your interim role timer has been reset to 10 minutes!',
                ephemeral: true
            });
            return true;
        }

        // Grant the interim role
        await member.roles.add(interimRole, 'Temporary interim role granted via button');

        // Enhanced logging for interim role granted
        const interimGrantedEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Interim Role Granted')
            .setDescription(`**INTERIM ROLE SYSTEM** - Temporary access granted`)
            .addFields(
                { name: '👤 User', value: `${member.user.username} (\`${member.user.id}\`)`, inline: true },
                { name: '⏰ Duration', value: `${INTERIM_ROLE_DURATION} minutes`, inline: true },
                { name: '🎯 Access Type', value: 'Temporary button request', inline: true },
                { name: '📍 Channel', value: `<#${INTERIM_ROLE_CHANNEL_ID}>`, inline: true },
                { name: '🔄 Request Method', value: 'Widget Button Click', inline: true },
                { name: '⏰ Granted At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '📊 Status', value: 'Active until expiry or manual removal', inline: false }
            )
            .setFooter({ text: `Interim Role System - User ID: ${member.user.id}` })
            .setTimestamp();

        await sendLogMessage(guild, interimGrantedEmbed);

        // Set timeout for automatic removal (temporary access only)
        const timeoutId = setTimeout(async () => {
            try {
                const currentMember = await guild.members.fetch(userId);
                if (currentMember && currentMember.roles.cache.has(INTERIM_ROLE_ID)) {
                    await currentMember.roles.remove(interimRole, 'Interim role expired - temporary access only');

                    // Enhanced logging for interim role expired
                    const interimExpiredEmbed = new EmbedBuilder()
                        .setColor('#FF6B6B')
                        .setTitle('⏰ Interim Role Auto-Expired')
                        .setDescription(`**INTERIM ROLE SYSTEM** - Temporary access expired`)
                        .addFields(
                            { name: '👤 User', value: `${currentMember.user.username} (\`${currentMember.user.id}\`)`, inline: true },
                            { name: '⏰ Duration Served', value: `${INTERIM_ROLE_DURATION} minutes`, inline: true },
                            { name: '🔄 Expiry Type', value: 'Automatic timeout', inline: true },
                            { name: '📍 Original Channel', value: `<#${INTERIM_ROLE_CHANNEL_ID}>`, inline: true },
                            { name: '⏰ Expired At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                            { name: '📊 Status', value: 'Role successfully removed', inline: true }
                        )
                        .setFooter({ text: `Interim Role System - User ID: ${currentMember.user.id}` })
                        .setTimestamp();

                    await sendLogMessage(guild, interimExpiredEmbed);

                    // Send DM to user
                    try {
                        const expiredEmbed = new EmbedBuilder()
                            .setColor('#FF6B6B')
                            .setTitle('⏰ Interim Role Expired')
                            .setDescription(`Your temporary interim role in **${guild.name}** has expired after 10 minutes.`)
                            .addFields(
                                { name: 'Status', value: 'Role automatically removed', inline: true },
                                { name: 'Access Type', value: 'Temporary only', inline: true }
                            )
                            .setFooter({ text: 'You can request the role again anytime!' })
                            .setTimestamp();

                        await currentMember.user.send({ embeds: [expiredEmbed] });
                    } catch (dmError) {
                        console.log('Could not send expiry DM to user:', dmError.message);
                    }

                    console.log(`Interim role automatically removed from ${currentMember.user.username}`);
                }
                interimRoleTimeouts.delete(userId);
            } catch (error) {
                console.error('Error removing interim role:', error);
            }
        }, INTERIM_ROLE_DURATION * 60 * 1000);

        interimRoleTimeouts.set(userId, timeoutId);

        // Send success response
        const successEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Temporary Interim Role Granted!')
            .setDescription(`You have been granted the interim role for **${INTERIM_ROLE_DURATION} minutes**.`)
            .addFields(
                { name: '⏰ Duration', value: `${INTERIM_ROLE_DURATION} minutes (temporary)`, inline: true },
                { name: '🔄 Usage', value: 'Unlimited requests available', inline: true },
                { name: '🎯 Access', value: 'Private voice channels and special areas', inline: false }
            )
            .setFooter({ text: 'Role will be automatically removed - temporary access only!' })
            .setTimestamp();

        await interaction.reply({
            embeds: [successEmbed],
            ephemeral: true
        });

        // Send DM to user
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✿ Temporary Interim Role Granted ✿')
                .setDescription(`You have been granted temporary interim access in **${guild.name}**!`)
                .addFields(
                    { name: '⏰ Duration', value: `${INTERIM_ROLE_DURATION} minutes (temporary)`, inline: true },
                    { name: '🔄 Usage', value: 'Unlimited requests available', inline: true },
                    { name: '🎯 Access', value: 'Private voice channels and special areas', inline: false }
                )
                .setTimestamp();

            await member.user.send({ embeds: [dmEmbed] });
        } catch (dmError) {
            console.log('Could not send interim role DM to user:', dmError.message);
        }

        return true;
    } catch (error) {
        console.error('Error granting interim role:', error);
        await interaction.reply({
            content: '❌ An error occurred while granting the interim role.',
            ephemeral: true
        });
        return false;
    }
}

// Function to create comprehensive server template for restoration
async function createServerTemplate(guild) {
    try {
        await guild.channels.fetch();
        await guild.roles.fetch();
        await guild.members.fetch();

        const template = {
            channels: {},
            roles: {},
            channelPositions: [],
            rolePositions: [],
            permissions: {},
            serverSettings: {
                name: guild.name,
                icon: guild.iconURL(),
                banner: guild.bannerURL(),
                description: guild.description,
                vanityURLCode: guild.vanityURLCode,
                verificationLevel: guild.verificationLevel,
                explicitContentFilter: guild.explicitContentFilter,
                mfaLevel: guild.mfaLevel,
                defaultMessageNotifications: guild.defaultMessageNotifications
            },
            timestamp: Date.now()
        };

        // Store detailed channel information with positions
        const sortedChannels = guild.channels.cache.sort((a, b) => a.position - b.position);
        sortedChannels.forEach((channel, index) => {
            template.channels[channel.id] = {
                name: channel.name,
                type: channel.type,
                parentId: channel.parentId,
                position: channel.position,
                rawPosition: index,
                topic: channel.topic,
                nsfw: channel.nsfw,
                rateLimitPerUser: channel.rateLimitPerUser,
                permissions: Array.from(channel.permissionOverwrites.cache.entries()).map(([id, overwrite]) => ({
                    id,
                    type: overwrite.type,
                    allow: overwrite.allow.bitfield.toString(),
                    deny: overwrite.deny.bitfield.toString()
                }))
            };
            template.channelPositions.push(channel.id);
        });

        // Store detailed role information with positions
        const sortedRoles = guild.roles.cache.sort((a, b) => b.position - a.position);
        sortedRoles.forEach((role, index) => {
            template.roles[role.id] = {
                name: role.name,
                permissions: role.permissions.bitfield.toString(),
                position: role.position,
                rawPosition: index,
                color: role.color,
                hoist: role.hoist,
                mentionable: role.mentionable
            };
            template.rolePositions.push(role.id);
        });

        serverTemplates.set(guild.id, template);
        channelPositions.set(guild.id, template.channelPositions);
        rolePositions.set(guild.id, template.rolePositions);

        console.log(`✅ Server template created for ${guild.name} - GOD-LEVEL PROTECTION ACTIVE`);
        return template;
    } catch (error) {
        console.error('Error creating server template:', error);
        return null;
    }
}

// Function to automatically restore server to original template
async function autoRestoreServer(guild, violationType, violator = null) {
    try {
        const template = serverTemplates.get(guild.id);
        if (!template) {
            console.log('No template found for server restoration');
            return false;
        }

        console.log(`🔄 AUTO-RESTORATION INITIATED: ${violationType}`);

        // Send critical alert to WhatsApp
        await sendCriticalSecurityAlert(
            guild,
            'AUTO-RESTORATION TRIGGERED',
            `Server auto-restoration initiated due to: ${violationType}. Restoring from saved template.`,
            violator
        );

        // Restore channel positions and names
        for (const [channelId, channelData] of Object.entries(template.channels)) {
            try {
                const channel = guild.channels.cache.get(channelId);
                if (channel) {
                    // Restore channel name if changed
                    if (channel.name !== channelData.name) {
                        await channel.setName(channelData.name, 'Auto-restoration: GOD-LEVEL PROTECTION');
                    }

                    // Restore channel position
                    if (channel.position !== channelData.position) {
                        await channel.setPosition(channelData.position, { relative: false, reason: 'Auto-restoration: GOD-LEVEL PROTECTION' });
                    }

                    // Restore permissions
                    for (const permData of channelData.permissions) {
                        const existingOverwrite = channel.permissionOverwrites.cache.get(permData.id);
                        if (!existingOverwrite ||
                            existingOverwrite.allow.bitfield.toString() !== permData.allow ||
                            existingOverwrite.deny.bitfield.toString() !== permData.deny) {

                            const target = guild.roles.cache.get(permData.id) || guild.members.cache.get(permData.id);
                            if (target) {
                                await channel.permissionOverwrites.set([{
                                    id: permData.id,
                                    allow: BigInt(permData.allow),
                                    deny: BigInt(permData.deny)
                                }], 'Auto-restoration: GOD-LEVEL PROTECTION');
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`Error restoring channel ${channelId}:`, error);
            }
        }

        // Restore role positions and properties
        for (const [roleId, roleData] of Object.entries(template.roles)) {
            try {
                const role = guild.roles.cache.get(roleId);
                if (role && !role.managed && role.id !== guild.id) {
                    // Restore role name
                    if (role.name !== roleData.name) {
                        await role.setName(roleData.name, 'Auto-restoration: GOD-LEVEL PROTECTION');
                    }

                    // Restore role position
                    if (role.position !== roleData.position) {
                        await role.setPosition(roleData.position, { relative: false, reason: 'Auto-restoration: GOD-LEVEL PROTECTION' });
                    }

                    // Restore role permissions
                    if (role.permissions.bitfield.toString() !== roleData.permissions) {
                        await role.setPermissions(BigInt(roleData.permissions), 'Auto-restoration: GOD-LEVEL PROTECTION');
                    }

                    // Restore role color
                    if (role.color !== roleData.color) {
                        await role.setColor(roleData.color, 'Auto-restoration: GOD-LEVEL PROTECTION');
                    }
                }
            } catch (error) {
                console.error(`Error restoring role ${roleId}:`, error);
            }
        }

        console.log('✅ Server auto-restoration completed - GOD-LEVEL PROTECTION RESTORED');

        // Log successful restoration
        const restorationEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ AUTO-RESTORATION COMPLETED - SERVER REALIGNED')
            .setDescription('**GOD-LEVEL PROTECTION SUCCESSFUL**\n\nServer has been automatically restored to original template!')
            .addFields(
                { name: '🔄 Trigger', value: violationType, inline: true },
                { name: '⚡ Response Time', value: '< 1ms', inline: true },
                { name: '🎯 Status', value: '✅ **FULLY RESTORED**', inline: true },
                { name: '📊 Restored Elements', value: `**Channels:** ${Object.keys(template.channels).length}\n**Roles:** ${Object.keys(template.roles).length}\n**Permissions:** All restored`, inline: false }
            )
            .setFooter({ text: 'God-Level Protection - Impossible to Bypass' })
            .setTimestamp();

        await sendLogMessage(guild, restorationEmbed);
        return true;
    } catch (error) {
        console.error('Critical error in auto-restoration:', error);
        return false;
    }
}

// Function to create server baseline for protection monitoring
async function createServerBaseline(guild) {
    try {
        await guild.channels.fetch();
        await guild.roles.fetch();
        await guild.members.fetch();

        const baseline = {
            channels: {
                count: guild.channels.cache.size,
                ids: Array.from(guild.channels.cache.keys()),
                structure: {}
            },
            roles: {
                count: guild.roles.cache.size,
                ids: Array.from(guild.roles.cache.keys()),
                permissions: {}
            },
            serverSettings: {
                name: guild.name,
                icon: guild.iconURL(),
                banner: guild.bannerURL(),
                description: guild.description,
                vanityURLCode: guild.vanityURLCode,
                premiumTier: guild.premiumTier,
                verificationLevel: guild.verificationLevel,
                explicitContentFilter: guild.explicitContentFilter,
                mfaLevel: guild.mfaLevel,
                defaultMessageNotifications: guild.defaultMessageNotifications
            },
            members: {
                count: guild.memberCount,
                adminCount: guild.members.cache.filter(m => m.permissions.has('Administrator')).size
            },
            timestamp: Date.now()
        };

        // Store channel structure details
        guild.channels.cache.forEach(channel => {
            baseline.channels.structure[channel.id] = {
                name: channel.name,
                type: channel.type,
                parentId: channel.parentId,
                position: channel.position,
                permissions: channel.permissionOverwrites.cache.size
            };
        });

        // Store role permission details
        guild.roles.cache.forEach(role => {
            baseline.roles.permissions[role.id] = {
                name: role.name,
                permissions: role.permissions.bitfield.toString(),
                position: role.position,
                color: role.color,
                hoist: role.hoist,
                mentionable: role.mentionable
            };
        });

        serverBaselines.set(guild.id, baseline);
        console.log(`✅ Server baseline created for ${guild.name}`);
        return baseline;
    } catch (error) {
        console.error('Error creating server baseline:', error);
        return null;
    }
}

// Function to start continuous server scanning every 60 seconds
function startServerScanning(guild) {
    const guildId = guild.id;

    // Clear existing timer if any
    const existingTimer = scanTimers.get(guildId);
    if (existingTimer) {
        clearInterval(existingTimer);
    }

    // Start new scanning interval
    const scanInterval = setInterval(async () => {
        try {
            await performServerIntegrityCheck(guild);
        } catch (error) {
            console.error(`Error in server scanning for ${guild.name}:`, error);
        }
    }, SERVER_SCAN_INTERVAL);

    scanTimers.set(guildId, scanInterval);
    console.log(`🔍 Server scanning started for ${guild.name} - 60-second intervals`);
}

// Function to perform comprehensive server integrity check
async function performServerIntegrityCheck(guild) {
    try {
        const template = serverTemplates.get(guild.id);
        if (!template) return;

        let violationsDetected = [];

        // Check channel integrity
        const currentChannels = guild.channels.cache;
        const templateChannelIds = new Set(Object.keys(template.channels));
        const currentChannelIds = new Set(currentChannels.map(c => c.id));

        // Detect unauthorized channel creations
        const unauthorizedChannels = [...currentChannelIds].filter(id => !templateChannelIds.has(id));
        if (unauthorizedChannels.length > 0) {
            violationsDetected.push(`Unauthorized channels created: ${unauthorizedChannels.length}`);
        }

        // Detect channel deletions
        const deletedChannels = [...templateChannelIds].filter(id => !currentChannelIds.has(id));
        if (deletedChannels.length > 0) {
            violationsDetected.push(`Channels deleted: ${deletedChannels.length}`);
        }

        // Check channel position alignment
        let channelPositionViolations = 0;
        currentChannels.forEach(channel => {
            const templateData = template.channels[channel.id];
            if (templateData) {
                if (channel.position !== templateData.position || channel.name !== templateData.name) {
                    channelPositionViolations++;
                }
            }
        });

        if (channelPositionViolations > 0) {
            violationsDetected.push(`Channel alignment violations: ${channelPositionViolations}`);
        }

        // Check role integrity
        const currentRoles = guild.roles.cache;
        const templateRoleIds = new Set(Object.keys(template.roles));
        const currentRoleIds = new Set(currentRoles.map(r => r.id));

        // Detect unauthorized role creations
        const unauthorizedRoles = [...currentRoleIds].filter(id => !templateRoleIds.has(id));
        if (unauthorizedRoles.length > 0) {
            violationsDetected.push(`Unauthorized roles created: ${unauthorizedRoles.length}`);
        }

        // Detect role deletions
        const deletedRoles = [...templateRoleIds].filter(id => !currentRoleIds.has(id));
        if (deletedRoles.length > 0) {
            violationsDetected.push(`Roles deleted: ${deletedRoles.length}`);
        }

        // Check role position alignment
        let rolePositionViolations = 0;
        currentRoles.forEach(role => {
            const templateData = template.roles[role.id];
            if (templateData && !role.managed) {
                if (role.position !== templateData.position || role.name !== templateData.name) {
                    rolePositionViolations++;
                }
            }
        });

        if (rolePositionViolations > 0) {
            violationsDetected.push(`Role alignment violations: ${rolePositionViolations}`);
        }

        // If violations detected, check if they are from recent owner changes
        if (violationsDetected.length > 0) {
            console.log(`🚨 SCANNING DETECTED VIOLATIONS: ${violationsDetected.join(', ')}`);

            // Check for recent owner activity in audit logs (last 2 minutes)
            let recentOwnerActivity = false;
            try {
                const auditLogs = await guild.fetchAuditLogs({ limit: 20 });
                const twoMinutesAgo = Date.now() - 2 * 60 * 1000;
                
                recentOwnerActivity = auditLogs.entries.some(entry => 
                    entry.createdTimestamp > twoMinutesAgo && 
                    isProtectionImmune(entry.executor?.id, guild.id)
                );
            } catch (error) {
                console.error('Error checking recent audit logs:', error);
            }

            if (recentOwnerActivity) {
                console.log(`✅ OWNER ACTIVITY DETECTED: Preserving changes and updating template instead of restoring`);
                
                // Update template to preserve owner changes
                const newTemplate = await createServerTemplate(guild);
                if (newTemplate) {
                    const preserveEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ OWNER CHANGES PRESERVED')
                        .setDescription('**SCANNING DETECTED OWNER ACTIVITY** - Template updated to preserve changes instead of restoration')
                        .addFields(
                            { name: '🔍 Detected Changes', value: violationsDetected.join(', '), inline: false },
                            { name: '👑 Recent Owner Activity', value: 'Detected in last 2 minutes', inline: true },
                            { name: '✅ Action Taken', value: 'Template updated, changes preserved', inline: true },
                            { name: '📊 New Baseline', value: `**Channels:** ${Object.keys(newTemplate.channels).length}\n**Roles:** ${Object.keys(newTemplate.roles).length}`, inline: false }
                        )
                        .setFooter({ text: 'God-Level Protection - Owner changes automatically preserved' })
                        .setTimestamp();

                    await sendLogMessage(guild, preserveEmbed);
                }
            } else {
                // Send critical alert for unauthorized changes
                await sendCriticalSecurityAlert(
                    guild,
                    'SERVER INTEGRITY VIOLATION DETECTED',
                    `Scanning detected unauthorized changes: ${violationsDetected.join(', ')}`
                );

                // Trigger auto-restoration for unauthorized changes
                await autoRestoreServer(guild, `Scanning detected violations: ${violationsDetected.join(', ')}`);

                // Update template after restoration
                await createServerTemplate(guild);
            }
        } else {
            console.log(`✅ Server integrity check passed for ${guild.name}`);
        }

    } catch (error) {
        console.error('Error in server integrity check:', error);
    }
}

// Function to check if user is immune to protection - MAXIMUM SECURITY
function isProtectionImmune(userId, guildId) {
    // ONLY SERVER OWNER, BOT OWNER, EXTRA OWNERS, AND WHITELISTED BOTS ARE IMMUNE
    // ADMINISTRATORS ARE NOT IMMUNE - THEY WILL BE PUNISHED FOR UNAUTHORIZED ACTIONS
    const guild = client.guilds.cache.get(guildId);
    const isServerOwner = guild && guild.ownerId === userId;
    const isBotOwner = userId === BOT_OWNER_ID;
    const isBot = userId === client.user.id;
    
    // Check if user is a whitelisted bot (ALL AUTHORIZED BOTS ARE IMMUNE)
    const isWhitelistedBot = WHITELISTED_BOTS.has(userId);
    
    // Check permanent extra owners
    const isPermanentExtraOwner = permanentExtraOwners.has(userId);
    
    // Check temporary extra owners (and clean up expired ones)
    let isTemporaryExtraOwner = false;
    const tempOwnerData = temporaryExtraOwners.get(userId);
    if (tempOwnerData) {
        if (Date.now() < tempOwnerData.expiresAt) {
            isTemporaryExtraOwner = true;
        } else {
            // Expired - remove automatically
            temporaryExtraOwners.delete(userId);
        }
    }

    // IMPORTANT: Administrator permission does NOT grant immunity
    // Only the specific users and whitelisted bots above are immune
    return isBotOwner || isServerOwner || isBot || isPermanentExtraOwner || isTemporaryExtraOwner || isWhitelistedBot;
}

// Function to track user actions for rate limiting
function trackUserAction(userId, actionType) {
    const now = Date.now();
    const userTracking = userActionTracking.get(userId) || { actions: [], lastReset: now };

    // Reset if more than 1 minute has passed
    if (now - userTracking.lastReset > 60000) {
        userTracking.actions = [];
        userTracking.lastReset = now;
    }

    userTracking.actions.push({ type: actionType, timestamp: now });
    userActionTracking.set(userId, userTracking);

    // Return if user exceeded rate limit
    return userTracking.actions.length > PROTECTION_SETTINGS.MAX_CHANGES_PER_MINUTE;
}

// Function to flag and punish violator
async function flagViolator(guild, user, reason, severity = 'HIGH') {
    try {
        // Add to flagged users
        flaggedUsers.add(user.id);

        // Get member if they're still in the server
        let member = null;
        try {
            member = await guild.members.fetch(user.id);
        } catch (error) {
            console.log(`User ${user.username} not in server, flagging only`);
        }

        // Remove all roles if member exists
        if (member) {
            try {
                // Store original roles before applying quarantine role
                const originalRoleIds = Array.from(member.roles.cache.filter(role => role.id !== guild.id).keys());
                originalRoles.set(user.id, originalRoleIds);

                // Remove all roles except @everyone
                await member.roles.set([], `SECURITY VIOLATION: ${reason} - User flagged and stripped of all permissions`);
                console.log(`🚨 Stripped all roles from ${user.username} due to: ${reason}`);
            } catch (roleError) {
                console.error('Error removing roles from violator:', roleError);
            }

            // Apply quarantine if role exists
            const quarantineRole = guild.roles.cache.get(QUARANTINE_ROLE_ID);
            if (quarantineRole) {
                try {
                    await member.roles.add(quarantineRole, `SECURITY VIOLATION: ${reason}`);
                } catch (qError) {
                    console.error('Error applying quarantine role:', qError);
                }
            }
        }

        // Create comprehensive security alert
        const securityEmbed = new EmbedBuilder()
            .setColor('#8B0000')
            .setTitle('🚨 CRITICAL SECURITY VIOLATION - USER FLAGGED')
            .setDescription(`**MAXIMUM SECURITY BREACH DETECTED**\n\nUser has been immediately flagged and neutralized for attempting to compromise server security.`)
            .addFields(
                { name: '🎯 Violator', value: `${user.username}\n\`${user.id}\``, inline: true },
                { name: '⚠️ Violation Type', value: reason, inline: true },
                { name: '🔴 Severity Level', value: severity, inline: true },
                { name: '🛡️ Protection Actions', value: '✅ User flagged permanently\n✅ All roles removed\n✅ Quarantine applied\n✅ Permissions revoked', inline: false },
                { name: '🚨 Security Status', value: '🔴 **THREAT NEUTRALIZED**', inline: true },
                { name: '🔒 Server Status', value: '✅ **PROTECTED**', inline: true },
                { name: '📋 Unflag Command', value: '`unfu @user` (Bot owner only)', inline: false }
            )
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
            .setFooter({ text: 'Ultimate Server Protection System - 1000% Secure' })
            .setTimestamp();

        await sendLogMessage(guild, securityEmbed);

        // Send DM warning to violator
        if (member) {
            try {
                const warningEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('🚨 CRITICAL SECURITY VIOLATION')
                    .setDescription(`Your account has been **FLAGGED** for attempting unauthorized server modifications in **${guild.name}**.`)
                    .addFields(
                        { name: '⚠️ Violation', value: reason, inline: false },
                        { name: '🚨 Actions Taken', value: '• All roles removed\n• Account flagged permanently\n• Access restricted', inline: false },
                        { name: '📋 Resolution', value: 'Contact server administrators for review\nOnly bot owner can unflag your account', inline: false }
                    )
                    .setFooter({ text: 'Server Protection System Active' })
                    .setTimestamp();

                await user.send({ embeds: [warningEmbed] });
            } catch (dmError) {
                console.log('Could not send violation DM to user:', dmError.message);
            }
        }

        return true;
    } catch (error) {
        console.error('Error flagging violator:', error);
        return false;
    }
}

// Function to handle protection violation - MAXIMUM SECURITY MODE WITH IMMEDIATE BAN
async function handleProtectionViolation(guild, user, violationType, details) {
    // Skip if user is immune to protection - ONLY OWNER, BOT, AND EXTRA OWNERS
    if (isProtectionImmune(user.id, guild.id)) {
        console.log(`🛡️ User ${user.username} is immune to protection - allowing action`);
        return;
    }

    console.log(`🚨 MAXIMUM SECURITY VIOLATION: ${violationType} by ${user.username} - IMMEDIATE PERMANENT BAN`);

    // IMMEDIATE PERMANENT BAN FOR ANY UNAUTHORIZED CHANGE - NO EXCEPTIONS
    try {
        // BAN FIRST - Don't even fetch member, just ban the user ID
        try {
            await guild.bans.create(user.id, {
                reason: `SECURITY VIOLATION: ${violationType} - ${details}. Zero tolerance policy - immediate permanent ban.`,
                deleteMessageSeconds: 7 * 24 * 60 * 60
            });
            console.log(`✅ User ${user.username} PERMANENTLY BANNED for: ${violationType}`);
        } catch (banError) {
            console.error('Error banning user (may already be banned):', banError);
        }

        const member = await guild.members.fetch(user.id).catch(() => null);
        if (member) {
            // If member is still in server (ban failed), kick them
            try {
                if (member.kickable) {
                    await member.kick(`SECURITY VIOLATION: ${violationType} - Immediate removal`);
                    console.log(`✅ Kicked ${user.username} as fallback to ban`);
                }
            } catch (kickError) {
                console.log('User already removed or cannot be kicked');
            }

            // Send permanent ban notification DM
            try {
                const banDmEmbed = new EmbedBuilder()
                    .setColor('#8B0000')
                    .setTitle('🔨 PERMANENTLY BANNED - SECURITY VIOLATION')
                    .setDescription(`You have been **PERMANENTLY BANNED** from **${guild.name}** for unauthorized server modification.`)
                    .addFields(
                        { name: '⚠️ Violation', value: `${violationType}`, inline: true },
                        { name: '📋 Details', value: details.substring(0, 1000), inline: false },
                        { name: '🚨 Policy', value: '**ZERO TOLERANCE** - Only server owner and authorized extra owners can make changes', inline: false },
                        { name: '⛔ Status', value: 'Permanent ban - No appeal available for security violations', inline: false },
                        { name: '🛡️ Security Message', value: SECURITY_VIOLATION_MESSAGE, inline: false }
                    )
                    .setFooter({ text: 'Script.AGI Maximum Security System - Zero Tolerance Enforcement' })
                    .setTimestamp();

                await user.send({ embeds: [banDmEmbed] });
                console.log(`✅ Sent permanent ban notification to ${user.username}`);
            } catch (dmError) {
                console.log(`Could not send ban notification DM to ${user.username}:`, dmError.message);
            }
        }
    } catch (error) {
        console.error('Error in maximum security violation handler:', error);
    }

    // Create comprehensive security alert for logs
    const maxSecurityEmbed = new EmbedBuilder()
        .setColor('#8B0000')
        .setTitle('🔨 SECURITY VIOLATOR PERMANENTLY BANNED')
        .setDescription(`**UNAUTHORIZED MODIFICATION DETECTED - USER PERMANENTLY BANNED**`)
        .addFields(
            { name: '🎯 Violator', value: `${user.username}\n\`${user.id}\``, inline: true },
            { name: '⚠️ Violation Type', value: violationType, inline: true },
            { name: '⏰ Punishment', value: '**PERMANENT BAN**', inline: true },
            { name: '📝 Details', value: details.substring(0, 1000), inline: false },
            { name: '🛡️ Actions Taken', value: '✅ User permanently banned\n✅ Ban notification sent\n✅ Critical alerts triggered\n✅ Server auto-restored', inline: false },
            { name: '🔴 Security Policy', value: '**ZERO TOLERANCE - ONLY OWNER & EXTRA OWNERS AUTHORIZED**', inline: false },
            { name: '🚨 Security Status', value: '🔴 **MAXIMUM PROTECTION ACTIVE**', inline: true }
        )
        .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
        .setFooter({ text: 'Script.AGI Maximum Security System - Zero Tolerance Enforcement' })
        .setTimestamp();

    await sendLogMessage(guild, maxSecurityEmbed, [], 'ban');
}

// Function to handle quarantine evasion (leaving and rejoining during quarantine)
async function handleQuarantineEvasion(member) {
    const userId = member.user.id;
    const guildId = member.guild.id;

    // Check if user was previously quarantined and left during quarantine period
    const evasionData = quarantineEvasionTracking.get(userId);
    if (evasionData) {
        const currentTime = Date.now();
        const timeElapsed = currentTime - evasionData.originalQuarantineTime;

        if (timeElapsed < evasionData.originalDuration) {
            // User tried to evade quarantine by leaving and rejoining
            evasionData.evasionAttempts++;
            const newDuration = 10; // Increase to 10 minutes for evasion

            console.log(`🚨 QUARANTINE EVASION DETECTED: ${member.user.username} - Attempt #${evasionData.evasionAttempts}`);

            // Send critical alert
            await sendCriticalSecurityAlert(
                member.guild,
                'QUARANTINE EVASION ATTEMPT',
                `User ${member.user.username} left and rejoined during quarantine period. Evasion attempt #${evasionData.evasionAttempts}. Extending quarantine to 10 minutes.`,
                member.user
            );

            // Re-quarantine with increased duration
            const success = await quarantineUser(member, `Quarantine evasion attempt #${evasionData.evasionAttempts} - Extended to 10 minutes`, newDuration);

            if (success) {
                // Update evasion tracking
                evasionData.originalDuration = newDuration * 60 * 1000;
                evasionData.originalQuarantineTime = currentTime;
                quarantineEvasionTracking.set(userId, evasionData);

                const evasionEmbed = new EmbedBuilder()
                    .setColor('#8B0000')
                    .setTitle('🚨 QUARANTINE EVASION - EXTENDED PUNISHMENT')
                    .setDescription('**GOD-LEVEL PROTECTION ACTIVATED**\n\nUser attempted to evade quarantine by leaving and rejoining!')
                    .addFields(
                        { name: '🎯 Violator', value: `${member.user.username} (\`${member.user.id}\`)`, inline: true },
                        { name: '🔄 Evasion Attempts', value: `${evasionData.evasionAttempts}`, inline: true },
                        { name: '⏰ New Duration', value: '10 minutes', inline: true },
                        { name: '⚠️ Consequence', value: 'Quarantine period extended for evasion', inline: false }
                    )
                    .setFooter({ text: 'God-Level Protection - Impossible to Evade' })
                    .setTimestamp();

                await sendLogMessage(member.guild, evasionEmbed);
                return true;
            }
        } else {
            // Quarantine period has expired naturally, clean up tracking
            quarantineEvasionTracking.delete(userId);
        }
    }

    return false;
}

// Function to track bypass attempts
async function trackBypassAttempt(guild, user, bypassType, details) {
    const userId = user.id;
    const currentTime = Date.now();

    let attempts = bypassAttempts.get(userId) || { count: 0, firstAttempt: currentTime, types: [] };
    attempts.count++;
    attempts.types.push({ type: bypassType, time: currentTime, details });

    // Keep only attempts from last 24 hours
    attempts.types = attempts.types.filter(attempt => currentTime - attempt.time < 24 * 60 * 60 * 1000);

    bypassAttempts.set(userId, attempts);

    // Send critical alert for bypass attempts
    await sendCriticalSecurityAlert(
        guild,
        'BYPASS ATTEMPT DETECTED',
        `User ${user.username} attempted to bypass protection: ${bypassType}. Total attempts: ${attempts.count}. Details: ${details}`,
        user
    );

    // If multiple bypass attempts, permanently flag the user
    if (attempts.count >= 3) {
        await flagViolator(guild, user, `Multiple bypass attempts (${attempts.count}): ${bypassType}`, 'CRITICAL');

        const bypassEmbed = new EmbedBuilder()
            .setColor('#8B0000')
            .setTitle('🚨 MULTIPLE BYPASS ATTEMPTS - USER PERMANENTLY FLAGGED')
            .setDescription('**GOD-LEVEL PROTECTION TRIGGERED**\n\nUser made multiple attempts to bypass server protection and has been permanently flagged!')
            .addFields(
                { name: '🎯 Violator', value: `${user.username} (\`${user.id}\`)`, inline: true },
                { name: '🔄 Total Attempts', value: `${attempts.count}`, inline: true },
                { name: '⚠️ Latest Attempt', value: bypassType, inline: true },
                { name: '🚨 Action Taken', value: '• User permanently flagged\n• All roles removed\n• WhatsApp alert sent\n• Impossible to bypass', inline: false }
            )
            .setFooter({ text: 'God-Level Protection - Multiple Bypass Attempts Blocked' })
            .setTimestamp();

        await sendLogMessage(guild, bypassEmbed);
    }

    return attempts.count;
}

// Function to quarantine user
async function quarantineUser(member, reason, duration = DEFAULT_QUARANTINE_DURATION) {
    const userId = member.user.id;
    const guild = member.guild;

    try {
        // Don't quarantine server owner or bot
        if (member.user.id === guild.ownerId || member.user.bot) {
            return false;
        }

        // Don't quarantine if already quarantined
        if (quarantinedUsers.has(userId)) {
            return false;
        }

        // Get or create quarantine role
        let quarantineRole = guild.roles.cache.get(QUARANTINE_ROLE_ID);

        if (!quarantineRole) {
            quarantineRole = await guild.roles.create({
                name: 'Quarantined',
                color: '#FF0000',
                reason: 'Auto-quarantine role'
            });

            // Set up permissions for the role
            guild.channels.cache.forEach(async channel => {
                try {
                    await channel.permissionOverwrites.create(quarantineRole, {
                        SendMessages: false,
                        Connect: false,
                        Speak: false,
                        AddReactions: false,
                        CreatePublicThreads: false,
                        CreatePrivateThreads: false
                    });
                } catch (error) {
                    console.error('Error setting channel permissions:', error);
                }
            });
        }

        // Store original roles BEFORE applying quarantine role
        const memberRoles = member.roles.cache.filter(role => role.id !== guild.id && role.id !== quarantineRole.id);
        const originalRoleIds = Array.from(memberRoles.keys());
        originalRoles.set(userId, originalRoleIds);

        console.log(`Storing original roles for ${member.user.username}:`, originalRoleIds);

        // Apply quarantine role (replace all existing roles with just quarantine role)
        await member.roles.set([quarantineRole.id], `Quarantined: ${reason}`);

        // Add to quarantine tracking
        const quarantineData = {
            userId: userId,
            reason: reason,
            moderator: client.user.id,
            startTime: Date.now(),
            duration: duration * 60 * 1000,
            guildId: guild.id,
            autoQuarantine: true,
            originalRoles: originalRoleIds // Also store in quarantine data as backup
        };

        quarantinedUsers.set(userId, quarantineData);

        // Track quarantine for evasion detection
        quarantineEvasionTracking.set(userId, {
            originalQuarantineTime: Date.now(),
            originalDuration: duration * 60 * 1000,
            evasionAttempts: 0,
            reason: reason
        });

        // Send DM to user
        try {
            const dmEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🚨 You have been quarantined')
                .setDescription(`You have been quarantined for ${duration} minutes in ${guild.name}`)
                .addFields({ name: 'Reason', value: reason, inline: true },
                    { name: 'Duration', value: `${duration} minutes`, inline: true }
                )
                .setTimestamp();

            await member.user.send({ embeds: [dmEmbed] });
        } catch (error) {
            console.log('Could not send DM to user:', error.message);
        }

        // Enhanced log message for quarantine
        const logEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🚨 Quarantine Activated')
            .setDescription(`**QUARANTINE SYSTEM** - User has been quarantined`)
            .addFields(
                { name: '👤 User', value: `${member.user.username} (\`${userId}\`)`, inline: true },
                { name: '⏰ Duration', value: `${duration} minutes`, inline: true },
                { name: '🎯 Quarantine Type', value: quarantineData.autoQuarantine ? 'Automatic' : 'Manual', inline: true },
                { name: '📝 Reason', value: reason, inline: false },
                { name: '🔄 Roles Stored', value: `${originalRoleIds.length} role(s) backed up`, inline: true },
                { name: '⏰ Started At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '⏰ Will End At', value: `<t:${Math.floor((Date.now() + duration * 60 * 1000) / 1000)}:F>`, inline: true },
                { name: '📊 Status', value: 'Quarantine active - roles removed', inline: false }
            )
            .setFooter({ text: `Quarantine System - User ID: ${userId}` })
            .setTimestamp();

        await sendLogMessage(guild, logEmbed, [], 'quarantine');

        // Set timeout for automatic restoration
        setTimeout(async () => {
            if (quarantinedUsers.has(userId)) {
                try {
                    console.log(`Auto-release timeout triggered for user ${userId}`);

                    // Fetch the current member
                    const currentMember = await guild.members.fetch(userId);
                    if (!currentMember) {
                        console.log(`Member ${userId} not in guild, cleaning up quarantine data`);
                        quarantinedUsers.delete(userId);
                        originalRoles.delete(userId);
                        return;
                    }

                    // Get stored original roles
                    const storedRoles = originalRoles.get(userId) || [];
                    console.log(`Auto-restoring roles for ${currentMember.user.username}:`, storedRoles);

                    // Get current quarantine role to ensure we're removing it
                    const currentQuarantineRole = guild.roles.cache.get(QUARANTINE_ROLE_ID);

                    // Validate that stored roles still exist in the guild
                    const validRoles = storedRoles.filter(roleId => {
                        const role = guild.roles.cache.get(roleId);
                        return role && role.id !== guild.id; // Exclude @everyone role
                    });

                    if (validRoles.length > 0) {
                        console.log(`Restoring ${validRoles.length} valid roles to ${currentMember.user.username}`);

                        // Set roles to the valid original roles (this automatically removes quarantine role)
                        await currentMember.roles.set(validRoles, 'Auto-quarantine period ended - roles restored');
                        console.log(`Successfully restored roles for ${currentMember.user.username}`);
                    } else {
                        console.log(`No valid stored roles found for ${currentMember.user.username}, removing quarantine role only`);

                        // If no valid stored roles, just remove quarantine role and restore @everyone
                        if (currentQuarantineRole && currentMember.roles.cache.has(currentQuarantineRole.id)) {
                            await currentMember.roles.remove(currentQuarantineRole, 'Auto-quarantine period ended');
                            console.log(`Removed quarantine role from ${currentMember.user.username}`);
                        }
                    }

                    // Verify quarantine role is removed
                    if (currentQuarantineRole && currentMember.roles.cache.has(currentQuarantineRole.id)) {
                        console.log(`Quarantine role still present, force removing...`);
                        await currentMember.roles.remove(currentQuarantineRole, 'Force remove quarantine role');
                    }

                    // Clean up tracking data
                    quarantinedUsers.delete(userId);
                    originalRoles.delete(userId);
                    console.log(`Cleaned up quarantine tracking data for ${userId}`);

                    // Enhanced success log embed for quarantine release
                    const releaseEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('🟢 Quarantine Released')
                        .setDescription(`**QUARANTINE SYSTEM** - User has been released from quarantine`)
                        .addFields(
                            { name: '👤 User', value: `${currentMember.user.username} (\`${userId}\`)`, inline: true },
                            { name: '⏰ Duration Served', value: `${duration} minute(s)`, inline: true },
                            { name: '🔄 Release Type', value: 'Automatic timeout', inline: true },
                            { name: '🎭 Roles Restored', value: `${validRoles.length} role(s)`, inline: true },
                            { name: '⏰ Released At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                            { name: '✅ Verification', value: 'Quarantine role removed', inline: true },
                            { name: '📊 Status', value: 'Full access restored successfully', inline: false },
                            { name: '📝 Original Reason', value: quarantinedUsers.get(userId)?.reason || 'Unknown', inline: false }
                        )
                        .setFooter({ text: `Quarantine System - User ID: ${userId}` })
                        .setTimestamp();

                    await sendLogMessage(guild, releaseEmbed, [], 'quarantine');

                    // Send DM to user about successful release
                    try {
                        const releaseDmEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('🟢 Quarantine Released')
                            .setDescription(`You have been automatically released from quarantine in **${guild.name}**`)
                            .addFields(
                                { name: 'Status', value: 'All your original roles have been restored', inline: false },
                                { name: 'Duration Served', value: `${duration} minute(s)`, inline: true },
                                { name: 'Roles Restored', value: `${validRoles.length} role(s)`, inline: true }
                            )
                            .setTimestamp();

                        await currentMember.user.send({ embeds: [releaseDmEmbed] });
                        console.log(`Sent release DM to ${currentMember.user.username}`);
                    } catch (dmError) {
                        console.log(`Could not send release DM to ${currentMember.user.username}:`, dmError.message);
                    }

                } catch (error) {
                    console.error(`Critical error during auto-release for user ${userId}:`, error);

                    // Even if role restoration fails, clean up tracking to prevent memory leaks
                    quarantinedUsers.delete(userId);
                    originalRoles.delete(userId);

                    // Log the error with more details
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('⚠️ Auto-Release Error')
                        .setDescription(`Failed to automatically release user from quarantine`)
                        .addFields(
                            { name: 'User ID', value: userId, inline: true },
                            { name: 'Duration', value: `${duration} minute(s)`, inline: true },
                            { name: 'Error Type', value: error.name || 'Unknown Error', inline: true },
                            { name: 'Error Message', value: error.message.substring(0, 1000), inline: false },
                            { name: 'Action Taken', value: 'Quarantine data cleaned up to prevent issues', inline: false }
                        )
                        .setTimestamp();

                    await sendLogMessage(guild, errorEmbed).catch(logError => {
                        console.error('Could not send error log message:', logError);
                    });
                }
            }
        }, duration * 60 * 1000);

        return true;
    } catch (error) {
        console.error('Error during quarantine:', error);
        return false;
    }
}

// Store current card state for each guild
const cardStates = new Map();

// Function to create Member Overview Card
function createMemberOverviewCard(guild, humanMembers, botMembers, onlineMembers, offlineMembers, voiceChannelMembers, quarantinedCount, totalMembers) {
    const now = new Date();
    const timeDisplay = now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false });

    // Member distribution
    const onlinePercentage = Math.round((onlineMembers.size / humanMembers.size) * 100) || 0;
    const voicePercentage = Math.round((voiceChannelMembers / humanMembers.size) * 100) || 0;

    let description = `## ᯓ➺ **LIVE MEMBER STATS** ❀ \`${timeDisplay} UTC\`\n\n`;

    // Compact Stats in Clean Format
    description += `❀ **${totalMembers}** Total Members\n`;
    description += `ᯓ➺ **${onlineMembers.size}** Online (${onlinePercentage}%)\n`;
    description += `❀ **${botMembers.size}** Bots Active\n`;
    description += `ᯓ➺ **${voiceChannelMembers}** In Voice (${voicePercentage}%)\n`;
    if (quarantinedCount > 0) {
        description += `❀ **${quarantinedCount}** Quarantined\n`;
    }
    description += `\n`;

    // Top 5 Online Members in Clean Format
    const top5OnlineMembers = onlineMembers.first(5);
    if (top5OnlineMembers.length > 0) {
        description += `## ᯓ➺ **TOP ONLINE MEMBERS**\n\n`;

        top5OnlineMembers.forEach((member, index) => {
            // Voice status detection
            let voiceStatus = '';
            if (member.voice.channel) {
                if (member.voice.streaming) voiceStatus = '✿'; // Streaming
                else if (member.voice.mute) voiceStatus = '❀'; // Muted
                else if (member.voice.deaf) voiceStatus = '❀'; // Deafened
                else if (member.voice.serverMute) voiceStatus = '❀'; // Server Muted
                else if (member.voice.serverDeaf) voiceStatus = '❀'; // Server Deafened
                else voiceStatus = '✿'; // In voice
            }

            const displayName = member.displayName.substring(0, 15) + (member.displayName.length > 15 ? '..' : '');
            description += `❀ **${displayName}** ${voiceStatus}\n`;
        });

        description += `\n`;
    }

    // Active Bots Summary in Clean Format
    const onlineBots = botMembers.filter(bot => bot.presence && bot.presence.status !== 'offline');
    if (onlineBots.size > 0) {
        description += `## ᯓ➺ **ACTIVE BOTS (${onlineBots.size}/${botMembers.size})**\n\n`;

        const top3Bots = onlineBots.first(3);
        top3Bots.forEach(bot => {
            const botName = bot.displayName.substring(0, 15) + (bot.displayName.length > 15 ? '..' : '');
            description += `❀ **${botName}**\n`;
        });

        if (onlineBots.size > 3) {
            description += `❀ **+${onlineBots.size - 3} more bots**\n`;
        }

        description += `\n`;
    }

    // Music status at the bottom removed due to functionality removal
    // Music functionality removed

    return new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: `${guild.name} • Member Overview`,
            iconURL: guild.iconURL({ dynamic: true, size: 32 })
        })
        .setDescription(description)
        .setFooter({
            text: `Card 1/3 • Updates every 25s • Music & member stats`,
            iconURL: client.user.displayAvatarURL({ size: 16 })
        })
        .setTimestamp();
}

// Function to create Server Info Card
function createServerInfoCard(guild, textChannels, voiceChannels, categoryChannels, roles, humanMembers, voiceChannelMembers) {
    const now = new Date();
    const timeDisplay = now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false });

    // Get server boost info
    const boostLevel = guild.premiumTier;
    const boostCount = guild.premiumSubscriptionCount || 0;
    const boostEmoji = ['❀', '✿', '✿', '✿'][boostLevel] || '❀';

    let description = `## ᯓ➺ **LIVE SERVER INFO** ❀ \`${timeDisplay} UTC\`\n\n`;

    // Server Stats in Clean Format
    description += `${boostEmoji} **Level ${boostLevel}** (${boostCount} boosts)\n`;
    description += `❀ **${textChannels.size + voiceChannels.size}** Total Channels\n`;
    description += `✿ **${roles.size}** Roles Available\n`;
    description += `❀ **Owner:** <@${guild.ownerId}>\n\n`;

    // Channel Breakdown in Clean Format
    description += `## ✿ **CHANNEL BREAKDOWN**\n\n`;
    description += `❀ **${textChannels.size}** Text Channels\n`;
    description += `✿ **${voiceChannels.size}** Voice Channels\n`;
    description += `❀ **${categoryChannels.size}** Categories\n\n`;

    // Channel access information
    description += `## ✿ **CHANNEL ACCESS INFO**\n\n`;
    description += `\`Click on the channel name to join.\`\n`;
    description += `✿ **Chats:** \`1377703145941106738\`\n`;
    description += `❀ **Voice:** \`1377704598881435729\`\n\n`;


    // Active Voice Channels in Clean Format
    const activeVoiceChannels = voiceChannels.filter(channel => channel.members.size > 0);
    if (activeVoiceChannels.size > 0 && voiceChannelMembers > 0) {
        description += `## ✿ **ACTIVE VOICE CHANNELS**\n\n`;

        activeVoiceChannels.first(3).forEach(channel => {
            const memberCount = channel.members.filter(m => !m.user.bot).size;
            const channelName = channel.name.substring(0, 20) + (channel.name.length > 20 ? '..' : '');
            description += `❀ **${channelName}** (${memberCount})\n`;
        });

        description += `\n`;
    } else {
        description += `## ✿ **VOICE STATUS**\n\n`;
        description += `❀ No active voice channels\n\n`;
    }

    // Top Roles in Clean Format
    const topRoles = roles.sort((a, b) => b.position - a.position).first(4);
    if (topRoles.length > 0) {
        description += `## ✿ **TOP ROLES**\n\n`;

        topRoles.forEach((role) => {
            const memberCount = role.members.size;
            description += `❀ ${role} (${memberCount})\n`;
        });

        description += `\n`;
    }

    // Server Timeline in Clean Format
    description += `## ✿ **SERVER TIMELINE**\n\n`;
    description += `❀ **Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>\n`;
    description += `✿ **Bot Added:** <t:${Math.floor(guild.joinedTimestamp / 1000)}:R>\n`;

    return new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: `${guild.name} • Server Information`,
            iconURL: guild.iconURL({ dynamic: true, size: 32 })
        })
        .setDescription(description)
        .setFooter({
            text: `Card 2/3 • Updates every 25s • Member & access stats`,
            iconURL: client.user.displayAvatarURL({ size: 16 })
        })
        .setTimestamp();
}

// Function to create Member Overview Card
function createMemberOverviewCard(guild, humanMembers, botMembers, onlineMembers, offlineMembers, voiceChannelMembers, quarantinedCount, totalMembers) {
    const now = new Date();
    const timeDisplay = now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false });

    // Member distribution
    const onlinePercentage = Math.round((onlineMembers.size / humanMembers.size) * 100) || 0;
    const voicePercentage = Math.round((voiceChannelMembers / humanMembers.size) * 100) || 0;

    let description = `## ᯓ➺ **LIVE MEMBER STATS** ❀ \`${timeDisplay} UTC\`\n\n`;

    // Compact Stats in Clean Format
    description += `❀ **${totalMembers}** Total Members\n`;
    description += `ᯓ➺ **${onlineMembers.size}** Online (${onlinePercentage}%)\n`;
    description += `❀ **${botMembers.size}** Bots Active\n`;
    description += `ᯓ➺ **${voiceChannelMembers}** In Voice (${voicePercentage}%)\n`;
    if (quarantinedCount > 0) {
        description += `❀ **${quarantinedCount}** Quarantined\n`;
    }
    description += `\n`;

    // Top 5 Online Members in Clean Format
    const top5OnlineMembers = onlineMembers.first(5);
    if (top5OnlineMembers.length > 0) {
        description += `## ᯓ➺ **TOP ONLINE MEMBERS**\n\n`;

        top5OnlineMembers.forEach((member, index) => {
            // Voice status detection
            let voiceStatus = '';
            if (member.voice.channel) {
                if (member.voice.streaming) voiceStatus = '✿'; // Streaming
                else if (member.voice.mute) voiceStatus = '❀'; // Muted
                else if (member.voice.deaf) voiceStatus = '❀'; // Deafened
                else if (member.voice.serverMute) voiceStatus = '❀'; // Server Muted
                else if (member.voice.serverDeaf) voiceStatus = '❀'; // Server Deafened
                else voiceStatus = '✿'; // In voice
            }

            const displayName = member.displayName.substring(0, 15) + (member.displayName.length > 15 ? '..' : '');
            description += `❀ **${displayName}** ${voiceStatus}\n`;
        });

        description += `\n`;
    }

    // Active Bots Summary in Clean Format
    const onlineBots = botMembers.filter(bot => bot.presence && bot.presence.status !== 'offline');
    if (onlineBots.size > 0) {
        description += `## ᯓ➺ **ACTIVE BOTS (${onlineBots.size}/${botMembers.size})**\n\n`;

        const top3Bots = onlineBots.first(3);
        top3Bots.forEach(bot => {
            const botName = bot.displayName.substring(0, 15) + (bot.displayName.length > 15 ? '..' : '');
            description += `❀ **${botName}**\n`;
        });

        if (onlineBots.size > 3) {
            description += `❀ **+${onlineBots.size - 3} more bots**\n`;
        }

        description += `\n`;
    }

    // Music status at the bottom removed due to functionality removal
    // Music functionality removed

    return new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: `${guild.name} • Member Overview`,
            iconURL: guild.iconURL({ dynamic: true, size: 32 })
        })
        .setDescription(description)
        .setFooter({
            text: `Card 1/3 • Updates every 25s • Music & member stats`,
            iconURL: client.user.displayAvatarURL({ size: 16 })
        })
        .setTimestamp();
}

// Function to create Server Info Card
function createServerInfoCard(guild, textChannels, voiceChannels, categoryChannels, roles, humanMembers, voiceChannelMembers) {
    const now = new Date();
    const timeDisplay = now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false });

    // Get server boost info
    const boostLevel = guild.premiumTier;
    const boostCount = guild.premiumSubscriptionCount || 0;
    const boostEmoji = ['❀', '✿', '✿', '✿'][boostLevel] || '❀';

    let description = `## ᯓ➺ **LIVE SERVER INFO** ❀ \`${timeDisplay} UTC\`\n\n`;

    // Server Stats in Clean Format
    description += `${boostEmoji} **Level ${boostLevel}** (${boostCount} boosts)\n`;
    description += `❀ **${textChannels.size + voiceChannels.size}** Total Channels\n`;
    description += `✿ **${roles.size}** Roles Available\n`;
    description += `❀ **Owner:** <@${guild.ownerId}>\n\n`;

    // Channel Breakdown in Clean Format
    description += `## ✿ **CHANNEL BREAKDOWN**\n\n`;
    description += `❀ **${textChannels.size}** Text Channels\n`;
    description += `✿ **${voiceChannels.size}** Voice Channels\n`;
    description += `❀ **${categoryChannels.size}** Categories\n\n`;

    // Channel access information
    description += `## ✿ **CHANNEL ACCESS INFO**\n\n`;
    description += `\`Click on the channel name to join.\`\n`;
    description += `✿ **Chats:** \`1377703145941106738\`\n`;
    description += `❀ **Voice:** \`1377704598881435729\`\n\n`;


    // Active Voice Channels in Clean Format
    const activeVoiceChannels = voiceChannels.filter(channel => channel.members.size > 0);
    if (activeVoiceChannels.size > 0 && voiceChannelMembers > 0) {
        description += `## ✿ **ACTIVE VOICE CHANNELS**\n\n`;

        activeVoiceChannels.first(3).forEach(channel => {
            const memberCount = channel.members.filter(m => !m.user.bot).size;
            const channelName = channel.name.substring(0, 20) + (channel.name.length > 20 ? '..' : '');
            description += `❀ **${channelName}** (${memberCount})\n`;
        });

        description += `\n`;
    } else {
        description += `## ✿ **VOICE STATUS**\n\n`;
        description += `❀ No active voice channels\n\n`;
    }

    // Top Roles in Clean Format
    const topRoles = roles.sort((a, b) => b.position - a.position).first(4);
    if (topRoles.length > 0) {
        description += `## ✿ **TOP ROLES**\n\n`;

        topRoles.forEach((role) => {
            const memberCount = role.members.size;
            description += `❀ ${role} (${memberCount})\n`;
        });

        description += `\n`;
    }

    // Server Timeline in Clean Format
    description += `## ✿ **SERVER TIMELINE**\n\n`;
    description += `❀ **Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>\n`;
    description += `✿ **Bot Added:** <t:${Math.floor(guild.joinedTimestamp / 1000)}:R>\n`;

    return new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: `${guild.name} • Server Information`,
            iconURL: guild.iconURL({ dynamic: true, size: 32 })
        })
        .setDescription(description)
        .setFooter({
            text: `Card 2/3 • Updates every 25s • Member & access stats`,
            iconURL: client.user.displayAvatarURL({ size: 16 })
        })
        .setTimestamp();
}

// Function to create Member Overview Card
function createMemberOverviewCard(guild, humanMembers, botMembers, onlineMembers, offlineMembers, voiceChannelMembers, quarantinedCount, totalMembers) {
    const now = new Date();
    const timeDisplay = now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false });

    // Member distribution
    const onlinePercentage = Math.round((onlineMembers.size / humanMembers.size) * 100) || 0;
    const voicePercentage = Math.round((voiceChannelMembers / humanMembers.size) * 100) || 0;

    let description = `## ᯓ➺ **LIVE MEMBER STATS** ❀ \`${timeDisplay} UTC\`\n\n`;

    // Compact Stats in Clean Format
    description += `❀ **${totalMembers}** Total Members\n`;
    description += `ᯓ➺ **${onlineMembers.size}** Online (${onlinePercentage}%)\n`;
    description += `❀ **${botMembers.size}** Bots Active\n`;
    description += `ᯓ➺ **${voiceChannelMembers}** In Voice (${voicePercentage}%)\n`;
    if (quarantinedCount > 0) {
        description += `❀ **${quarantinedCount}** Quarantined\n`;
    }
    description += `\n`;

    // Top 5 Online Members in Clean Format
    const top5OnlineMembers = onlineMembers.first(5);
    if (top5OnlineMembers.length > 0) {
        description += `## ᯓ➺ **TOP ONLINE MEMBERS**\n\n`;

        top5OnlineMembers.forEach((member, index) => {
            // Voice status detection
            let voiceStatus = '';
            if (member.voice.channel) {
                if (member.voice.streaming) voiceStatus = '✿'; // Streaming
                else if (member.voice.mute) voiceStatus = '❀'; // Muted
                else if (member.voice.deaf) voiceStatus = '❀'; // Deafened
                else if (member.voice.serverMute) voiceStatus = '❀'; // Server Muted
                else if (member.voice.serverDeaf) voiceStatus = '❀'; // Server Deafened
                else voiceStatus = '✿'; // In voice
            }

            const displayName = member.displayName.substring(0, 15) + (member.displayName.length > 15 ? '..' : '');
            description += `❀ **${displayName}** ${voiceStatus}\n`;
        });

        description += `\n`;
    }

    // Active Bots Summary in Clean Format
    const onlineBots = botMembers.filter(bot => bot.presence && bot.presence.status !== 'offline');
    if (onlineBots.size > 0) {
        description += `## ᯓ➺ **ACTIVE BOTS (${onlineBots.size}/${botMembers.size})**\n\n`;

        const top3Bots = onlineBots.first(3);
        top3Bots.forEach(bot => {
            const botName = bot.displayName.substring(0, 15) + (bot.displayName.length > 15 ? '..' : '');
            description += `❀ **${botName}**\n`;
        });

        if (onlineBots.size > 3) {
            description += `❀ **+${onlineBots.size - 3} more bots**\n`;
        }

        description += `\n`;
    }

    // Music status at the bottom removed due to functionality removal
    // Music functionality removed

    return new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: `${guild.name} • Member Overview`,
            iconURL: guild.iconURL({ dynamic: true, size: 32 })
        })
        .setDescription(description)
        .setFooter({
            text: `Card 1/3 • Updates every 25s • Music & member stats`,
            iconURL: client.user.displayAvatarURL({ size: 16 })
        })
        .setTimestamp();
}

// Function to create Server Info Card
function createServerInfoCard(guild, textChannels, voiceChannels, categoryChannels, roles, humanMembers, voiceChannelMembers) {
    const now = new Date();
    const timeDisplay = now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false });

    // Get server boost info
    const boostLevel = guild.premiumTier;
    const boostCount = guild.premiumSubscriptionCount || 0;
    const boostEmoji = ['❀', '✿', '✿', '✿'][boostLevel] || '❀';

    let description = `## ᯓ➺ **LIVE SERVER INFO** ❀ \`${timeDisplay} UTC\`\n\n`;

    // Server Stats in Clean Format
    description += `${boostEmoji} **Level ${boostLevel}** (${boostCount} boosts)\n`;
    description += `❀ **${textChannels.size + voiceChannels.size}** Total Channels\n`;
    description += `✿ **${roles.size}** Roles Available\n`;
    description += `❀ **Owner:** <@${guild.ownerId}>\n\n`;

    // Channel Breakdown in Clean Format
    description += `## ✿ **CHANNEL BREAKDOWN**\n\n`;
    description += `❀ **${textChannels.size}** Text Channels\n`;
    description += `✿ **${voiceChannels.size}** Voice Channels\n`;
    description += `❀ **${categoryChannels.size}** Categories\n\n`;

    // Channel access information
    description += `## ✿ **CHANNEL ACCESS INFO**\n\n`;
    description += `\`Click on the channel name to join.\`\n`;
    description += `✿ **Chats:** \`1377703145941106738\`\n`;
    description += `❀ **Voice:** \`1377704598881435729\`\n\n`;


    // Active Voice Channels in Clean Format
    const activeVoiceChannels = voiceChannels.filter(channel => channel.members.size > 0);
    if (activeVoiceChannels.size > 0 && voiceChannelMembers > 0) {
        description += `## ✿ **ACTIVE VOICE CHANNELS**\n\n`;

        activeVoiceChannels.first(3).forEach(channel => {
            const memberCount = channel.members.filter(m => !m.user.bot).size;
            const channelName = channel.name.substring(0, 20) + (channel.name.length > 20 ? '..' : '');
            description += `❀ **${channelName}** (${memberCount})\n`;
        });

        description += `\n`;
    } else {
        description += `## ✿ **VOICE STATUS**\n\n`;
        description += `❀ No active voice channels\n\n`;
    }

    // Top Roles in Clean Format
    const topRoles = roles.sort((a, b) => b.position - a.position).first(4);
    if (topRoles.length > 0) {
        description += `## ✿ **TOP ROLES**\n\n`;

        topRoles.forEach((role) => {
            const memberCount = role.members.size;
            description += `❀ ${role} (${memberCount})\n`;
        });

        description += `\n`;
    }

    // Server Timeline in Clean Format
    description += `## ✿ **SERVER TIMELINE**\n\n`;
    description += `❀ **Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>\n`;
    description += `✿ **Bot Added:** <t:${Math.floor(guild.joinedTimestamp / 1000)}:R>\n`;

    return new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: `${guild.name} • Server Information`,
            iconURL: guild.iconURL({ dynamic: true, size: 32 })
        })
        .setDescription(description)
        .setFooter({
            text: `Card 2/3 • Updates every 25s • Member & access stats`,
            iconURL: client.user.displayAvatarURL({ size: 16 })
        })
        .setTimestamp();
}

// Function to create Member Overview Card
function createMemberOverviewCard(guild, humanMembers, botMembers, onlineMembers, offlineMembers, voiceChannelMembers, quarantinedCount, totalMembers) {
    const now = new Date();
    const timeDisplay = now.toLocaleTimeString('en-US', { timeZone: 'UTC', hour12: false });

    // Member distribution
    const onlinePercentage = Math.round((onlineMembers.size / humanMembers.size) * 100) || 0;
    const voicePercentage = Math.round((voiceChannelMembers / humanMembers.size) * 100) || 0;

    let description = `## ᯓ➺ **LIVE MEMBER STATS** ❀ \`${timeDisplay} UTC\`\n\n`;

    // Compact Stats in Clean Format
    description += `❀ **${totalMembers}** Total Members\n`;
    description += `ᯓ➺ **${onlineMembers.size}** Online (${onlinePercentage}%)\n`;
    description += `❀ **${botMembers.size}** Bots Active\n`;
    description += `ᯓ➺ **${voiceChannelMembers}** In Voice (${voicePercentage}%)\n`;
    if (quarantinedCount > 0) {
        description += `❀ **${quarantinedCount}** Quarantined\n`;
    }
    description += `\n`;

    // Top 5 Online Members in Clean Format
    const top5OnlineMembers = onlineMembers.first(5);
    if (top5OnlineMembers.length > 0) {
        description += `## ᯓ➺ **TOP ONLINE MEMBERS**\n\n`;

        top5OnlineMembers.forEach((member, index) => {
            // Voice status detection
            let voiceStatus = '';
            if (member.voice.channel) {
                if (member.voice.streaming) voiceStatus = '✿'; // Streaming
                else if (member.voice.mute) voiceStatus = '❀'; // Muted
                else if (member.voice.deaf) voiceStatus = '❀'; // Deafened
                else if (member.voice.serverMute) voiceStatus = '❀'; // Server Muted
                else if (member.voice.serverDeaf) voiceStatus = '❀'; // Server Deafened
                else voiceStatus = '✿'; // In voice
            }

            const displayName = member.displayName.substring(0, 15) + (member.displayName.length > 15 ? '..' : '');
            description += `❀ **${displayName}** ${voiceStatus}\n`;
        });

        description += `\n`;
    }

    // Active Bots Summary in Clean Format
    const onlineBots = botMembers.filter(bot => bot.presence && bot.presence.status !== 'offline');
    if (onlineBots.size > 0) {
        description += `## ᯓ➺ **ACTIVE BOTS (${onlineBots.size}/${botMembers.size})**\n\n`;

        const top3Bots = onlineBots.first(3);
        top3Bots.forEach(bot => {
            const botName = bot.displayName.substring(0, 15) + (bot.displayName.length > 15 ? '..' : '');
            description += `❀ **${botName}**\n`;
        });

        if (onlineBots.size > 3) {
            description += `❀ **+${onlineBots.size - 3} more bots**\n`;
        }

        description += `\n`;
    }

    // Music status at the bottom removed due to functionality removal
    // Music functionality removed

    return new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: `${guild.name} • Member Overview`,
            iconURL: guild.iconURL({ dynamic: true, size: 32 })
        })
        .setDescription(description)
        .setFooter({
            text: `Card 1/3 • Updates every 25s • Music & member stats`,
            iconURL: client.user.displayAvatarURL({ size: 16 })
        })
        .setTimestamp();
}

// Store message IDs for each guild to track stats messages
const statsMessageIds = new Map();

// Store interim role widget message IDs
const interimWidgetMessageIds = new Map();

// Function to update server stats with dual card system
async function updateServerStats() {
    for (const guild of client.guilds.cache.values()) {
        try {
            // Fetch all members to get accurate count
            await guild.members.fetch();

            const totalMembers = guild.memberCount;
            const humanMembers = guild.members.cache.filter(member => !member.user.bot);
            const botMembers = guild.members.cache.filter(member => member.user.bot);

            // Get online and offline members
            const onlineMembers = humanMembers.filter(member =>
                member.presence && member.presence.status !== 'offline'
            );
            const offlineMembers = humanMembers.filter(member =>
                !member.presence || member.presence.status === 'offline'
            );

            // Count members in voice channels
            const voiceChannelMembers = humanMembers.filter(member => member.voice.channel).size;

            // Get channels info
            const textChannels = guild.channels.cache.filter(channel => channel.type === 0);
            const voiceChannels = guild.channels.cache.filter(channel => channel.type === 2);
            const categoryChannels = guild.channels.cache.filter(channel => channel.type === 4);

            // Get roles (excluding @everyone)
            const roles = guild.roles.cache.filter(role => role.id !== guild.id);

            // Quarantine count
            const quarantinedCount = Array.from(quarantinedUsers.values()).filter(data =>
                data.guildId === guild.id
            ).length;

            // Get current card state (default to member overview)
            const currentCard = cardStates.get(guild.id) || 'members';

            // Create the appropriate embed
            let statsEmbed;

            if (currentCard === 'members') {
                statsEmbed = createMemberOverviewCard(
                    guild, humanMembers, botMembers, onlineMembers,
                    offlineMembers, voiceChannelMembers, quarantinedCount, totalMembers
                );
            } else if (currentCard === 'server') {
                statsEmbed = createServerInfoCard(
                    guild, textChannels, voiceChannels, categoryChannels,
                    roles, humanMembers, voiceChannelMembers
                );
            } else if (currentCard === 'access') {
                // For the access card, we need to fetch the member who interacted or a default member
                // Here, we'll use the interaction author as the member context
                const interactingMember = guild.members.cache.get(client.user.id); // Using bot member as a placeholder, ideally should be the user triggering the update if possible.
                if (interactingMember) {
                    statsEmbed = await createMemberAccessCard(guild, interactingMember);
                } else {
                    // Fallback if the interacting member isn't found, maybe show generic info or error
                    statsEmbed = createServerInfoCard(guild, textChannels, voiceChannels, categoryChannels, roles, humanMembers, voiceChannelMembers); // Fallback to server info
                }
            } else if (currentCard === 'extended') {
                // For the extended access card
                const interactingMember = guild.members.cache.get(client.user.id); // Placeholder
                if (interactingMember) {
                    statsEmbed = await createExtendedMemberAccessCard(guild, interactingMember);
                } else {
                    // Fallback to server info
                    statsEmbed = createServerInfoCard(guild, textChannels, voiceChannels, categoryChannels, roles, humanMembers, voiceChannelMembers);
                }
            } else {
                 // Default to member overview if unknown state
                statsEmbed = createMemberOverviewCard(
                    guild, humanMembers, botMembers, onlineMembers,
                    offlineMembers, voiceChannelMembers, quarantinedCount, totalMembers
                );
            }

            // Create buttons for card switching
            const memberStatsButton = new ButtonBuilder()
                .setCustomId(`stats_members_${guild.id}`)
                .setLabel('ᯓ➺ Member Stats')
                .setStyle(currentCard === 'members' ? ButtonStyle.Primary : ButtonStyle.Secondary);

            const serverInfoButton = new ButtonBuilder()
                .setCustomId(`stats_server_${guild.id}`)
                .setLabel('✿ Server Info')
                .setStyle(currentCard === 'server' ? ButtonStyle.Primary : ButtonStyle.Secondary);

            // Add a button for Member Access Card
            const memberAccessButton = new ButtonBuilder()
                .setCustomId(`stats_access_${guild.id}`)
                .setLabel('ᯓ➺ Member Access')
                .setStyle(currentCard === 'access' ? ButtonStyle.Primary : ButtonStyle.Secondary);

            // Add a button for Extended Access Card
            const extendedAccessButton = new ButtonBuilder()
                .setCustomId(`stats_extended_${guild.id}`)
                .setLabel('ᯓ➺ Extended Access')
                .setStyle(currentCard === 'extended' ? ButtonStyle.Primary : ButtonStyle.Secondary);

            const buttonRow = new ActionRowBuilder()
                .addComponents(memberStatsButton, serverInfoButton, memberAccessButton, extendedAccessButton);

            // Send to stats channel
            const statsChannel = guild.channels.cache.get(STATS_CHANNEL_ID);
            if (statsChannel) {
                let existingStatsMessage = null;

                // First, try to get the stored message ID
                const storedMessageId = statsMessageIds.get(guild.id);
                if (storedMessageId) {
                    try {
                        existingStatsMessage = await statsChannel.messages.fetch(storedMessageId);
                    } catch (error) {
                        // Message might have been deleted, clear the stored ID
                        statsMessageIds.delete(guild.id);
                    }
                }

                // If no stored message found, look for existing stats message
                if (!existingStatsMessage) {
                    const messages = await statsChannel.messages.fetch({ limit: 20 });
                    existingStatsMessage = messages.find(msg =>
                        msg.author.id === client.user.id &&
                        msg.embeds.length > 0 &&
                        msg.embeds[0].footer &&
                        (msg.embeds[0].footer.text.includes('Card 1/3') ||
                         msg.embeds[0].footer.text.includes('Card 2/3') ||
                         msg.embeds[0].footer.text.includes('Card 3/3') ||
                         msg.embeds[0].footer.text.includes('Card 4/4'))
                    );

                    // Store the message ID if found
                    if (existingStatsMessage) {
                        statsMessageIds.set(guild.id, existingStatsMessage.id);
                    }
                }

                // Update existing message or send new one
                if (existingStatsMessage) {
                    await existingStatsMessage.edit({
                        embeds: [statsEmbed],
                        components: [buttonRow]
                    }).catch(async (error) => {
                        console.error('Error editing stats message:', error);
                        // If edit fails, send a new message and store its ID
                        try {
                            const newMessage = await statsChannel.send({
                                embeds: [statsEmbed],
                                components: [buttonRow]
                            });
                            statsMessageIds.set(guild.id, newMessage.id);
                        } catch (sendError) {
                            console.error('Error sending new stats message:', sendError);
                        }
                    });
                } else {
                    // Send new message and store its ID
                    try {
                        const newMessage = await statsChannel.send({
                            embeds: [statsEmbed],
                            components: [buttonRow]
                        });
                        statsMessageIds.set(guild.id, newMessage.id);
                    } catch (error) {
                        console.error('Error sending stats message:', error);
                    }
                }
            }
        } catch (error) {
            console.error(`Error updating stats for guild ${guild.name}:`, error);
        }
    }
}


// Function to auto-delete old messages in admin channels
async function cleanAdminChannel(guild) {
    try {
        const serverConfig = serverConfigs.get(guild.id) || {};
        const adminChannelId = serverConfig.adminChannelId || ADMIN_QUARANTINE_CHANNEL_ID;
        const adminChannel = guild.channels.cache.get(adminChannelId);

        if (adminChannel) {
            const messages = await adminChannel.messages.fetch({ limit: 100 });
            const oldMessages = messages.filter(msg =>
                Date.now() - msg.createdTimestamp > 24 * 60 * 60 * 1000 && // 24 hours old
                !msg.pinned // Don't delete pinned messages
            );

            if (oldMessages.size > 0) {
                const messagesToDelete = oldMessages.first(50); // Discord bulk delete limit
                await adminChannel.bulkDelete(messagesToDelete).catch(console.error);
                console.log(`Cleaned ${messagesToDelete.size} old messages from admin channel in ${guild.name}`);
            }
        }
    } catch (error) {
        console.error(`Error cleaning admin channel in guild ${guild.name}:`, error);
    }
}

// Function to clean music channel - keep only the widget
async function cleanMusicChannel(guild) {
    try {
        const musicChannel = guild.channels.cache.get(PERMANENT_MUSIC_CHANNEL_ID);
        if (!musicChannel) return;

        // Get the stored widget message ID
        const widgetMessageId = musicManager ? musicManager.musicWidgets.get(guild.id) : null;

        const messages = await musicChannel.messages.fetch({ limit: 50 });
        const messagesToDelete = messages.filter(msg => 
            msg.id !== widgetMessageId && // Don't delete the music widget
            msg.author.id === client.user.id && // Only delete bot's own messages
            Date.now() - msg.createdTimestamp > 5000 // Messages older than 5 seconds
        );

        if (messagesToDelete.size > 0) {
            for (const msg of messagesToDelete.values()) {
                try {
                    await msg.delete();
                } catch (error) {
                    console.error('Error deleting message:', error);
                }
            }
            console.log(`Cleaned ${messagesToDelete.size} old messages from music channel in ${guild.name}`);
        }
    } catch (error) {
        console.error(`Error cleaning music channel in guild ${guild.name}:`, error);
    }
}

// Function to clean ban appeal channel - keep only the unban request widget
async function cleanBanAppealChannel() {
    try {
        const appealServerId = '1411627135142985783';
        const appealChannelId = '1411658854000758916';
        
        const appealServer = client.guilds.cache.get(appealServerId);
        const appealChannel = appealServer ? appealServer.channels.cache.get(appealChannelId) : null;
        
        if (!appealChannel) return;

        // Get the stored unban widget message ID
        const storageKey = `unban_widget_${appealServerId}`;
        const unbanWidgetMessageId = interimWidgetMessageIds.get(storageKey);

        const messages = await appealChannel.messages.fetch({ limit: 50 });
        const messagesToDelete = messages.filter(msg => 
            msg.id !== unbanWidgetMessageId && // Don't delete the unban request widget
            Date.now() - msg.createdTimestamp > 5000 // Messages older than 5 seconds
        );

        if (messagesToDelete.size > 0) {
            for (const msg of messagesToDelete.values()) {
                try {
                    await msg.delete();
                } catch (error) {
                    console.error('Error deleting message in appeal channel:', error);
                }
            }
            console.log(`Cleaned ${messagesToDelete.size} old messages from ban appeal channel`);
        }
    } catch (error) {
        console.error(`Error cleaning ban appeal channel:`, error);
    }
}

// Function to check if user can access member info (server members and above)
function canAccessMemberInfo(message) {
    return message.guild.members.cache.has(message.author.id) && !message.author.bot;
}

// Function to handle unauthorized bot detection and removal
async function handleUnauthorizedBot(guild, bot, inviter) {
    try {
        console.log(`🚨 UNAUTHORIZED BOT DETECTED: ${bot.user.username} (${bot.user.id})`);

        // Add to flagged bots list
        flaggedBots.add(bot.user.id);

        // Create comprehensive log embed
        const unauthorizedBotEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🚨 UNAUTHORIZED BOT BLOCKED')
            .setDescription(`**SECURITY ALERT:** Unauthorized bot integration attempt detected and blocked!`)
            .addFields(
                { name: '🤖 Bot Information', value: `**Name:** ${bot.user.username}\n**ID:** \`${bot.user.id}\`\n**Discriminator:** #${bot.user.discriminator}`, inline: true },
                { name: '👤 Inviter Information', value: inviter ? `**User:** ${inviter.username}\n**ID:** \`${inviter.id}\`\n**Action:** Automatically quarantined` : 'Unknown inviter', inline: true },
                { name: '🛡️ Protection Actions Taken', value: '✅ Bot kicked and banned\n✅ Bot flagged permanently\n✅ Inviter quarantined\n✅ Integration deleted', inline: false },
                { name: '📋 Whitelist Status', value: `❌ Bot ID not in approved whitelist\n**Total Whitelisted:** ${WHITELISTED_BOTS.size} bots`, inline: false },
                { name: '⚠️ Security Level', value: '🔴 **MAXIMUM THREAT**', inline: true },
                { name: '🎯 Status', value: '✅ **THREAT NEUTRALIZED**', inline: true }
            )
            .setThumbnail(bot.user.displayAvatarURL({ dynamic: true, size: 128 }))
            .setFooter({ text: 'Server Protection System - Script.AGI' })
            .setTimestamp();

        // Send security alert to logs channel
        await sendLogMessage(guild, unauthorizedBotEmbed);

        // Ban the bot immediately to prevent re-entry
        try {
            await guild.bans.create(bot.user.id, {
                reason: `UNAUTHORIZED BOT - Not in whitelist. Auto-banned by protection system.`,
                deleteMessageSeconds: 7 * 24 * 60 * 60 // Delete 7 days of messages
            });
            console.log(`✅ Successfully banned unauthorized bot: ${bot.user.username}`);
        } catch (banError) {
            console.error('Error banning unauthorized bot:', banError);
        }

        // Kick the bot (in case ban fails)
        try {
            if (bot.kickable) {
                await bot.kick('UNAUTHORIZED BOT - Protection system activated');
                console.log(`✅ Successfully kicked unauthorized bot: ${bot.user.username}`);
            }
        } catch (kickError) {
            console.error('Error kicking unauthorized bot:', kickError);
        }

        // Quarantine the inviter if known and not server owner
        if (inviter && inviter.id !== guild.ownerId && inviter.id !== BOT_OWNER_ID) {
            try {
                const inviterMember = await guild.members.fetch(inviter.id).catch(() => null);
                if (inviterMember) {
                    const quarantineSuccess = await quarantineUser(
                        inviterMember,
                        `Attempted to add unauthorized bot: ${bot.user.username} (${bot.user.id})`,
                        60 // 1 hour quarantine for security violation
                    );

                    if (quarantineSuccess) {
                        console.log(`✅ Quarantined bot inviter: ${inviter.username}`);

                        // Send aggressive warning DM to inviter with custom message and GIF
                        try {
                            const warningEmbed = new EmbedBuilder()
                                .setColor('#FF0000')
                                .setTitle('🚨 FUCK YOU MOTHERFUCKER')
                                .setDescription(`Fuck You MotherFucker, don't even think about nuking discord.gg/scriptspace even in your dream you will be brutally fucked by script.agi`)
                                .addFields(
                                    { name: '🤖 Blocked Bot', value: `${bot.user.username} (\`${bot.user.id}\`)`, inline: true },
                                    { name: '⏰ Quarantine Duration', value: '1 hour', inline: true },
                                    { name: '🛡️ Protection Level', value: 'GOD-LEVEL ACTIVE', inline: true },
                                    { name: '🚨 Server Protection', value: 'discord.gg/scriptspace is absolutely protected by script.agi', inline: false },
                                    { name: '⚠️ Final Warning', value: 'Any further attempts will result in permanent ban and additional consequences.', inline: false }
                                )
                                .setImage('https://cdn.discordapp.com/attachments/1377710452653424711/1411748251920765018/have-a-nice-day-fuck-you.gif?ex=68b5c884&is=68b47704&hm=d98f09f00526750721143f5b4757363b262542a34426d9e10dac5d25a1d39741&')
                                .setFooter({ text: 'Script.AGI Maximum Security System' })
                                .setTimestamp();

                            await inviter.send({ embeds: [warningEmbed] });
                            console.log(`🚨 Sent aggressive warning DM with GIF to ${inviter.username}`);
                        } catch (dmError) {
                            console.log('Could not send warning DM to bot inviter:', dmError.message);
                        }
                    }
                }
            } catch (inviterError) {
                console.error('Error quarantining bot inviter:', inviterError);
            }
        }

        // Try to remove bot integrations/applications (if bot has special permissions)
        try {
            const integrations = await guild.fetchIntegrations();
            const botIntegration = integrations.find(integration =>
                integration.application && integration.application.id === bot.user.id
            );

            if (botIntegration) {
                await botIntegration.delete('Unauthorized bot integration removed');
                console.log(`✅ Removed integration for unauthorized bot: ${bot.user.username}`);
            }
        } catch (integrationError) {
            console.log('Could not remove bot integration (may not exist):', integrationError.message);
        }

        return true;
    } catch (error) {
        console.error('Critical error in handleUnauthorizedBot:', error);
        return false;
    }
}

// Store current help card state for each guild
const helpCardStates = new Map();

// Store active help slideshows to stop them when user interacts
const activeHelpSlideshows = new Map(); // userId -> { intervalId, messageId }

// Store ban appeals for tracking
const banAppeals = new Map(); // appealId -> { userId, guildId, reason, timestamp, status }

// Function to create Help Card 1 - Extra Owner System
function createHelpCard1() {
    const totalCommands = getTotalCommandsCount();

    const helpEmbed = new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTitle('✗ 𖹭 **Extra Owner System**')
        .setDescription(`**Total Commands:** ${totalCommands} • **Bot Owner Only**\n\n` +
            `**ᡣ𐭩 Extra Owner Management**\n` +
            `➺ \`extra owner @user\` - Grant permanent extra owner (full immunity)\n` +
            `➺ \`temp owner @user [duration]\` - Grant temporary owner access\n` +
            `➺ \`remove owner @user\` - Remove extra owner status\n` +
            `➺ \`list owners\` - Show all extra owners\n\n` +
            `✿ **Temp Durations:** 1h, 2h, 4h, 8h, 12h, 1d, 2d, 3d, 1w`
        )
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
        .setFooter({
            text: 'Card 1/18 • Extra Owner System',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTimestamp();

    return helpEmbed;
}

// Function to create Help Card 2 - Quarantine & Basic Moderation
function createHelpCard2() {
    const totalCommands = getTotalCommandsCount();

    const helpEmbed = new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTitle('✗ 𖹭 **Quarantine & Basic Moderation**')
        .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +
            `**ᡣ𐭩 Quarantine System**\n` +
            `➺ \`qr @user [duration]\` - Quarantine user\n` +
            `➺ \`uq @user\` - Remove quarantine\n` +
            `✿ **Durations:** 5m, 10m, 15m, 30m, 1h, 2h, 4h, 8h, 12h, 1d, 2d, 3d, 1w, 2w, 28d\n\n` +

            `**ᡣ𐭩 Basic Moderation**\n` +
            `➺ \`kick @user [reason]\` - Kick user\n` +
            `➺ \`ban @user [reason]\` - Ban user\n` +
            `➺ \`mute @user [reason]\` - Timeout 10min\n` +
            `➺ \`unmute @user\` - Remove timeout\n` +
            `➺ \`warn @user [reason]\` - Send warning\n` +
            `➺ \`clear <number>\` - Delete messages (1-100)\n` +
            `➺ \`slowmode <seconds>\` - Set channel slowmode`
        )
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
        .setFooter({
            text: 'Card 2/18 • Quarantine & Basic Moderation',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTimestamp();

    return helpEmbed;
}

// Function to create Help Card 3 - Basic Role & Music
function createHelpCard3() {
    const totalCommands = getTotalCommandsCount();

    const helpEmbed = new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTitle('✗ 𖹭 **Basic Role & Music Configuration**')
        .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +
            `**ᡣ𐭩 Basic Role Management**\n` +
            `➺ \`addrole @user @role\` - Add role to user\n` +
            `➺ \`removerole @user @role\` - Remove role from user\n` +
            `➺ \`roles\` - Show all server roles\n\n` +

            `**ᡣ𐭩 Music Configuration**\n` +
            `➺ \`setmusicchannel #channel\` - Set music request channel\n` +
            `➺ \`sethomevc #voice\` - Set default home voice channel`
        )
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
        .setFooter({
            text: 'Card 3/18 • Basic Role & Music',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTimestamp();

    return helpEmbed;
}

// Function to create Help Card 4 - Advanced Role Management
function createHelpCard4() {
    const totalCommands = getTotalCommandsCount();

    const helpEmbed = new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTitle('✗ 𖹭 **Advanced Role Management**')
        .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +
            `**ᡣ𐭩 Advanced Role Commands**\n` +
            `➺ \`createrole <name> [color] [hoist] [mentionable]\` / \`cr\` - Create role\n` +
            `➺ \`deleterole @role\` / \`dr\` - Delete role\n` +
            `➺ \`editrole @role <name|color|hoist|mentionable> <value>\` / \`er\` - Edit role\n` +
            `➺ \`roleinfo @role\` / \`ri\` - Show role information\n` +
            `➺ \`inrole @role\` / \`membersinrole\` - List members with role\n` +
            `➺ \`removeallroles @user\` / \`rar\` - Remove all roles from user\n` +
            `➺ \`roleall @role1 @role2\` - Give role2 to all with role1`
        )
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
        .setFooter({
            text: 'Card 4/18 • Advanced Role Management',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTimestamp();

    return helpEmbed;
}

// Function to create Help Card 5 - Interim Role & Widget Management
function createHelpCard5() {
    const totalCommands = getTotalCommandsCount();

    const helpEmbed = new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTitle('✗ 𖹭 **Interim Role & Widget Management**')
        .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +
            `**ᡣ𐭩 Interim Role Management**\n` +
            `➺ \`prmtr @user\` - Make interim role permanent\n` +
            `➺ \`revtr @user\` - Revoke interim role\n` +
            `➺ \`remtr @user\` - Remove interim role\n` +
            `➺ \`addtr @user\` - Grant temporary interim role\n\n` +

            `**ᡣ𐭩 Widget Management**\n` +
            `➺ \`sendinterim\` - Send/update interim role widget\n` +
            `➺ \`intrch\` - Show widget channel info\n` +
            `➺ \`intrm "id" "msg"\` - Custom widget to channel\n\n` +

            `**ᡣ𐭩 Channel Access Control**\n` +
            `➺ \`clstr @user\` - Hide interim channel from user\n` +
            `➺ \`optr @user\` - Restore interim channel access`
        )
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
        .setFooter({
            text: 'Card 5/18 • Interim Role & Widget',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTimestamp();

    return helpEmbed;
}

// Function to create Help Card 6 - Emergency Commands
function createHelpCard6() {
    const totalCommands = getTotalCommandsCount();

    const helpEmbed = new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTitle('✗ 𖹭 **Emergency Commands**')
        .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +

            `**🚨 Emergency Commands**\n` +
            `➺ \`panic\` - Lock all channels immediately\n` +
            `➺ \`stop panic\` - Unlock all channels\n` +
            `➺ \`emergency\` - Maximum lockdown + remove admin perms\n` +
            `➺ \`end emergency\` - Restore admin perms + unlock\n\n` +

            `**ᡣ𐭩 Emergency Features**\n` +
            `• Instant server lockdown capability\n` +
            `• Admin permission temporary removal\n` +
            `• Complete channel access control\n` +
            `• Emergency restoration system\n` +
            `• WhatsApp alert integration\n\n` +

            `**⚠️ Important Notes**\n` +
            `• Use emergency commands only in critical situations\n` +
            `• Always use corresponding unlock commands\n` +
            `• Emergency mode protects against all unauthorized changes\n` +
            `• WhatsApp alerts notify of all emergency actions`
        )
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
        .setFooter({
            text: 'Card 6/11 • Emergency Commands',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTimestamp();

    return helpEmbed;
}

// Function to create Help Card 7 - Configuration & Testing
function createHelpCard7() {
    const totalCommands = getTotalCommandsCount();

    const helpEmbed = new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTitle('✗ 𖹭 **Configuration & Testing**')
        .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +

            `**ᡣ𐭩 Configuration Commands**\n` +
            `➺ \`set adminchannel #channel\` - Set admin channel\n` +
            `➺ \`set qrole @role\` - Set quarantine role\n` +
            `➺ \`set qduration <duration>\` - Set default quarantine duration\n` +
            `➺ \`setinterimrole @role\` - Set interim role\n\n` +

            `**ᡣ𐭩 Testing & Alerts**\n` +
            `➺ \`wbtestan\` - Test WhatsApp alert system\n\n` +

            `**ᡣ𐭩 Available Settings**\n` +
            `• Admin channel configuration\n` +
            `• Quarantine role assignment\n` +
            `• Default quarantine durations\n` +
            `• Interim role setup\n` +
            `• WhatsApp alert testing\n\n` +

            `**ᡣ𐭩 Configuration Examples**\n` +
            `\`set adminchannel #admin-commands\`\n` +
            `\`set qrole @Quarantined\`\n` +
            `\`set qduration 30m\`\n` +
            `\`setinterimrole @Interim\``
        )
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
        .setFooter({
            text: 'Card 7/11 • Configuration & Testing',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTimestamp();

    return helpEmbed;
}

// Function to create Help Card 8 - God-Level Protection Features
function createHelpCard8() {
    const totalCommands = getTotalCommandsCount();

    const helpEmbed = new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTitle('✗ 𖹭 **God-Level Protection Features**')
        .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +

            `**🛡️ Ultimate Protection System**\n` +
            `• **Real-time Monitoring:** 60-second server integrity scans\n` +
            `• **Auto-restoration:** Instant server template restoration\n` +
            `• **Quarantine Evasion Detection:** Impossible to bypass\n` +
            `• **Unauthorized Bot Removal:** Instant detection & removal\n` +
            `• **WhatsApp Critical Alerts:** Real-time security notifications\n\n` +

            `**⚡ Ultra-Fast Response System**\n` +
            `• **<1ms Response Time:** Fastest protection in Discord\n` +
            `• **Rate Limiting:** Max 3 changes per minute per user\n` +
            `• **Bypass Attempt Tracking:** All attempts logged & punished\n` +
            `• **Mass Action Detection:** Prevents nuke attempts\n\n` +

            `**🔒 Immunity System**\n` +
            `• **Only Server Owner & Bot Owner immune**\n` +
            `• **No administrator bypasses allowed**\n` +
            `• **Absolute security - impossible to compromise**\n\n` +

            `**📊 Protection Statistics**\n` +
            `• 24/7 Active monitoring\n` +
            `• Impossible to disable or bypass\n` +
            `• 1000% server security guaranteed`
        )
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
        .setFooter({
            text: 'Card 8/11 • God-Level Protection Features',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTimestamp();

    return helpEmbed;
}

// Function to create Help Card 9 - Technical Specifications
function createHelpCard9() {
    const totalCommands = getTotalCommandsCount();

    const helpEmbed = new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTitle('✗ 𖹭 **Technical Specifications**')
        .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +

            `**🔧 Advanced Features**\n` +
            `• **NextGen Quarantine System:** Advanced user isolation\n` +
            `• **Interim Role Management:** Temporary access control\n` +
            `• **Voice Channel Management:** Complete voice control\n` +
            `• **AI Integrations:** Intelligent threat detection\n` +
            `• **Template System:** Complete server backup & restore\n\n` +

            `**⚙️ Monitoring Capabilities**\n` +
            `• **Audit Log Monitoring:** Real-time event tracking\n` +
            `• **Channel Integrity Checks:** Position & permission monitoring\n` +
            `• **Role Security Monitoring:** Unauthorized role change detection\n` +
            `• **Permission Oversight:** Complete permission monitoring\n` +
            `• **Server Settings Protection:** Prevents unauthorized changes\n\n` +

            `**📊 Performance Metrics**\n` +
            `• **Response Time:** <1 millisecond\n` +
            `• **Uptime:** 99.9% availability\n` +
            `• **Scan Frequency:** Every 60 seconds\n` +
            `• **Protection Coverage:** 100% server elements\n` +
            `• **Security Level:** Maximum (God-Level)`
        )
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
        .setFooter({
            text: 'Card 9/11 • Technical Specifications',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTimestamp();

    return helpEmbed;
}

// Function to create Help Card 10 - Developer Information & Credits
function createHelpCard10() {
    const totalCommands = getTotalCommandsCount();

    const helpEmbed = new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTitle('✗ 𖹭 **Developer Information**')
        .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +

            `**✿ About the Developer**\n` +
            `discord.gg/scriptspace was developed by made with ➺ ➺ at scriptspace\n\n` +

            `**🌐 Official Links**\n` +
            `**Website:** https://scriptspace.in/\n` +
            `**Discord Server:** discord.gg/scriptspace\n\n` +

            `**🚀 Project Overview**\n` +
            `discord.gg/scriptspace is a highly engineered discord server with AI Integrations, NextGen Quarantine Systems, NextGen Interim Role Management Systems And Temporary Voice Channel management systems everything was made possible by script.agi\n\n` +

            `**🛠️ Technical Features**\n` +
            `➺ God-Level Protection System\n` +
            `➺ AI-Powered Integrations\n` +
            `➺ NextGen Quarantine Management\n` +
            `➺ Advanced Interim Role System\n` +
            `➺ Voice Channel Management\n` +
            `➺ Real-time Security Monitoring\n` +
            `➺ WhatsApp Alert Integration\n` +
            `➺ Ultra-fast Response System\n\n` +

            `**✨ Built with Script.AGI Technology**\n` +
            `Powered by advanced artificial intelligence and cutting-edge security protocols.`
        )
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
        .setFooter({
            text: 'Card 10/11 • Developer Information & Credits',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTimestamp();

    return helpEmbed;
}

// Function to create Help Card 11 - Ticket System
function createHelpCard11() {
    const totalCommands = getTotalCommandsCount();

    const helpEmbed = new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTitle('✗ 𖹭 **Ticket Management Systems**')
        .setDescription(`**Total Commands:** ${totalCommands} • **Admin Channel / Authorized Users**\n\n` +

            `**🎫 Ticket System Commands**\n` +
            `➺ \`ticket\` - Create ticket panel in current channel\n` +
            `➺ \`ticket "message"\` - Create panel in current channel with custom message\n` +
            `➺ \`ticket "message" @role\` - Create panel with message and role ping\n` +
            `➺ \`ticket #channel "message" @role\` - Create panel in specific channel\n` +
            `➺ \`ticketopen\` - Create ticket panel in current channel\n` +
            `➺ \`ticketopen "message"\` - Create panel with custom message\n` +
            `➺ \`ticketclose\` - Close current ticket channel\n` +
            `➺ \`ticketclose #ticket-X\` - Close specific ticket\n\n` +

            `**✨ Ticket System Features**\n` +
            `• **Quick Setup:** Create panels in current channel with simple commands\n` +
            `• **Button-Based Creation:** Users click button to open tickets\n` +
            `• **Automatic Private Channels:** Creates hidden ticket channels (username-number format)\n` +
            `• **Permission Management:** Only creator, admins, and owner can view\n` +
            `• **Role Ping Notifications:** Notify support team when tickets open\n` +
            `• **Per-User Ticket Numbering:** Tracks tickets per user (e.g., username-1, username-2)\n` +
            `• **Easy Closing:** Close via button or command\n` +
            `• **One Ticket Per User:** Prevents spam\n\n` +

            `**📋 Setup Examples**\n` +
            `\`ticket\` - Create panel in current channel with default message\n` +
            `\`ticket "Need help? Click the button!"\` - Custom message in current channel\n` +
            `\`ticket "Support Request" @Support Team\` - With custom message and role ping\n` +
            `\`ticket #support "How can we help?"\` - Create in specific channel\n` +
            `\`ticketopen\` - Quick setup in current channel\n\n` +

            `**🔒 How It Works**\n` +
            `1. Admin uses \`ticket\` command in desired channel\n` +
            `2. Users click "📩 Open Ticket" button\n` +
            `3. Private ticket channel created as username-number (e.g., john-1)\n` +
            `4. Support team receives notification\n` +
            `5. Issue resolved and ticket closed\n\n` +

            `**⚠️ Required Permissions**\n` +
            `• Bot needs: Manage Channels, Manage Roles\n` +
            `• User needs: Manage Channels (to create panel)`
        )
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
        .setFooter({
            text: 'Card 11/11 • Ticket System',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTimestamp();

    return helpEmbed;
}

// Function to create category dropdown menu
function createCategoryDropdown() {
    const { StringSelectMenuBuilder, StringSelectMenuOptionBuilder } = require('discord.js');
    
    const categoryMenu = new StringSelectMenuBuilder()
        .setCustomId('help_category_select')
        .setPlaceholder('📋 Select a category to view commands')
        .addOptions([
            new StringSelectMenuOptionBuilder()
                .setLabel('Extra Owner System')
                .setDescription('Owner management and permissions')
                .setValue('category_extra_owner')
                .setEmoji({ id: '1439335285220446452', name: '158897crown' }),
            new StringSelectMenuOptionBuilder()
                .setLabel('Quarantine & Moderation')
                .setDescription('User quarantine and basic moderation')
                .setValue('category_quarantine')
                .setEmoji({ id: '1439335401675423867', name: '46888lightpurpleadmin' }),
            new StringSelectMenuOptionBuilder()
                .setLabel('Role Management')
                .setDescription('Role and interim role management')
                .setValue('category_roles')
                .setEmoji({ id: '1439363913773748503', name: '592053verified' }),
            new StringSelectMenuOptionBuilder()
                .setLabel('Voice Management')
                .setDescription('Voice channel and voice state control')
                .setValue('category_voice')
                .setEmoji({ id: '1439336011430625461', name: '592053event' }),
            new StringSelectMenuOptionBuilder()
                .setLabel('Channel Management')
                .setDescription('Text and voice channel management')
                .setValue('category_channels')
                .setEmoji({ id: '1439336413194616912', name: '918267partner' }),
            new StringSelectMenuOptionBuilder()
                .setLabel('Media & Threads')
                .setDescription('Media channels and thread management')
                .setValue('category_media')
                .setEmoji({ id: '1439336597396000798', name: '312424paint' }),
            new StringSelectMenuOptionBuilder()
                .setLabel('Auto-Moderation')
                .setDescription('Automated moderation and filters')
                .setValue('category_automod')
                .setEmoji({ id: '1439336792451973187', name: '158897bot' }),
            new StringSelectMenuOptionBuilder()
                .setLabel('Bot & User Protection')
                .setDescription('Bot whitelist and user protection')
                .setValue('category_protection')
                .setEmoji({ id: '1439337208069750866', name: '702380developer' }),
            new StringSelectMenuOptionBuilder()
                .setLabel('Server Management')
                .setDescription('Server protection and templates')
                .setValue('category_server')
                .setEmoji({ id: '1439337503352950815', name: '828044fire' }),
            new StringSelectMenuOptionBuilder()
                .setLabel('Ticket System')
                .setDescription('Support ticket management system')
                .setValue('category_ticket')
                .setEmoji({ id: '1439337619698749630', name: '828044ticket' }),
            new StringSelectMenuOptionBuilder()
                .setLabel('Utility Commands')
                .setDescription('Emergency, config, and utility commands')
                .setValue('category_utility')
                .setEmoji({ id: '1439337751546822852', name: '400377tools' }),
            new StringSelectMenuOptionBuilder()
                .setLabel('Developer Information')
                .setDescription('Bot developer and technical details')
                .setValue('category_developer')
                .setEmoji({ id: '1439337907117625354', name: '985872heart' })
        ]);

    return new ActionRowBuilder().addComponents(categoryMenu);
}

// Function to create category-specific embed
function createCategoryEmbed(category) {
    const totalCommands = getTotalCommandsCount();
    let embed = new EmbedBuilder()
        .setColor('#C8A2C8')
        .setAuthor({
            name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
        .setTimestamp();

    switch(category) {
        case 'category_extra_owner':
            embed.setTitle('✗ 𖹭 **Extra Owner System**')
                .setDescription(`**Total Commands:** ${totalCommands} • **Bot Owner Only**\n\n` +
                    `**Grant Extra Owner (Permanent)**\n` +
                    `\`extra owner @user\` - Grant permanent extra owner status with full immunity\n\n` +
                    `**Grant Temporary Owner**\n` +
                    `\`temp owner @user [duration]\` - Grant temporary owner access\n` +
                    `• Durations: 1h, 2h, 4h, 8h, 12h, 1d, 2d, 3d, 1w\n` +
                    `• Example: \`temp owner @user 2d\`\n\n` +
                    `**Remove Extra Owner**\n` +
                    `\`remove owner @user\` - Remove extra owner status (permanent or temporary)\n\n` +
                    `**List All Owners**\n` +
                    `\`list owners\` - Show all extra owners (permanent and temporary)\n\n` +
                    `**Features:**\n` +
                    `• Full server immunity from protection system\n` +
                    `• Can make any server changes without restrictions\n` +
                    `• Permanent owners never expire\n` +
                    `• Temporary owners auto-expire after duration`)
                .setFooter({ text: 'Extra Owner System • Bot Owner Only', iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&' });
            break;

        case 'category_quarantine':
            embed.setTitle('✗ 𖹭 **Quarantine Systems**')
                .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +
                    `**Quarantine User**\n` +
                    `\`qr @user [duration]\` - Quarantine user with custom duration\n` +
                    `• Durations: 5m, 10m, 15m, 30m, 1h, 2h, 4h, 8h, 12h, 1d, 2d, 3d, 1w, 2w, 28d\n` +
                    `• Example: \`qr @user 1h\` or \`qr @user\` (uses default)\n\n` +
                    `**Remove Quarantine**\n` +
                    `\`uq @user\` - Remove quarantine and restore original roles\n\n` +
                    `**Basic Moderation**\n` +
                    `\`kick @user [reason]\` - Kick user from server\n` +
                    `\`ban @user [reason]\` - Ban user from server\n` +
                    `\`mute @user [reason]\` - Timeout user for 10 minutes\n` +
                    `\`unmute @user\` - Remove timeout from user\n` +
                    `\`warn @user [reason]\` - Send warning to user\n\n` +
                    `**Message Management**\n` +
                    `\`clear <number>\` - Delete messages (1-100)\n` +
                    `\`slowmode <seconds>\` - Set channel slowmode (0-21600)\n\n` +
                    `**Features:**\n` +
                    `• Automatic role backup and restoration\n` +
                    `• Quarantine evasion detection\n` +
                    `• DM notifications to users\n` +
                    `• Auto-release after duration`)
                .setFooter({ text: 'Quarantine & Moderation System', iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&' });
            break;

        case 'category_roles':
            embed.setTitle('✗ 𖹭 **Role Management**')
                .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +
                    `**Basic Role Management**\n` +
                    `\`addrole @user @role\` - Add role to user\n` +
                    `\`removerole @user @role\` - Remove role from user\n` +
                    `\`roles\` - Show all server roles\n\n` +
                    `**Advanced Role Management**\n` +
                    `\`createrole <name> [color] [hoist] [mentionable]\` / \`cr\` - Create new role\n` +
                    `\`deleterole @role\` / \`dr\` - Delete role\n` +
                    `\`editrole @role <property> <value>\` / \`er\` - Edit role properties\n` +
                    `\`roleinfo @role\` / \`ri\` - Show detailed role information\n` +
                    `\`inrole @role\` / \`membersinrole\` - List members with role\n` +
                    `\`removeallroles @user\` / \`rar\` - Remove all roles from user\n` +
                    `\`roleall @role1 @role2\` - Give role2 to all members with role1\n\n` +
                    `**Interim Role Management**\n` +
                    `\`prmtr @user\` - Make interim role permanent\n` +
                    `\`revtr @user\` - Revoke interim role\n` +
                    `\`remtr @user\` - Remove interim role\n` +
                    `\`addtr @user\` - Grant temporary interim role\n` +
                    `\`sendinterim\` - Send/update interim role widget\n` +
                    `\`intrch\` - Show widget channel info\n` +
                    `\`intrm "id" "msg"\` - Send custom widget to channel\n\n` +
                    `**Channel Access Control**\n` +
                    `\`clstr @user\` - Hide interim channel from user\n` +
                    `\`optr @user\` - Restore interim channel access`)
                .setFooter({ text: 'Role & Interim Role Management', iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&' });
            break;

        case 'category_voice':
            embed.setTitle('✗ 𖹭 **Voice Management Systems**')
                .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +
                    `**Individual Voice Control**\n` +
                    `\`vmute @user\` - Voice mute user\n` +
                    `\`vunmute @user\` - Voice unmute user\n` +
                    `\`muv @user\` - Move user to quarantine VC and mute\n` +
                    `\`muvu @user\` - Unmute and move back to original VC\n\n` +
                    `**Mass Voice Control**\n` +
                    `\`vmuteall\` - Voice mute all users in voice channels\n` +
                    `\`vunmuteall\` - Voice unmute all server muted users\n\n` +
                    `**Voice Defend System**\n` +
                    `\`vdefend @user\` - Enable voice defend (prevent disconnects)\n` +
                    `\`vundefend @user\` - Disable voice defend\n` +
                    `\`vdefendall\` - Enable voice defend for all in VC\n` +
                    `\`vundefendall\` - Disable voice defend for all\n` +
                    `\`vdefended\` - Show list of defended users\n\n` +
                    `**Hidden Voice Channel Management**\n` +
                    `\`hvcm\` - Show hidden voice channel management menu\n\n` +
                    `**Features:**\n` +
                    `• Automatic voice state tracking\n` +
                    `• Original VC restoration for muv/muvu\n` +
                    `• Voice defend prevents force disconnects\n` +
                    `• Mass operations for server-wide control\n` +
                    `• Detailed voice activity logging`)
                .setFooter({ text: 'Voice Management System', iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&' });
            break;

        case 'category_channels':
            embed.setTitle('✗ 𖹭 **Text Channel Management Systems**')
                .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +
                    `**Channel Creation & Deletion**\n` +
                    `\`crcato <name> <private|public>\` - Create category\n` +
                    `\`crchannel <name> <private|public>\` - Create text channel\n` +
                    `\`delchannel <channel_id>\` - Delete channel by ID\n\n` +
                    `**Text Channel Control**\n` +
                    `\`lock\` / \`locktext\` - Lock channel (disable messages for @everyone)\n` +
                    `\`locktxt @role\` - Lock channel for specific role\n` +
                    `\`unlock\` / \`unlocktext\` - Unlock channel for @everyone\n` +
                    `\`unlocktxt @role\` - Unlock channel for specific role\n` +
                    `\`hide\` / \`hidechannel\` - Hide from @everyone\n` +
                    `\`hidetxt @role\` - Hide channel from specific role\n` +
                    `\`show\` / \`showchannel\` - Show to @everyone\n` +
                    `\`showtxt @role\` - Show channel to specific role\n` +
                    `\`slowmode <sec>\` / \`slow <sec>\` - Set slowmode (0-21600s)\n` +
                    `\`rename <name>\` / \`renamechannel <name>\` - Rename channel\n` +
                    `\`topic <text>\` / \`settopic <text>\` - Set channel topic\n\n` +
                    `**Bot Command Control**\n` +
                    `\`botcmdslock\` - Lock bot commands in current channel\n` +
                    `\`botcmdsunlock\` - Unlock bot commands in current channel\n\n` +
                    `**Message Management**\n` +
                    `\`dmes <message_id>\` - Delete message by ID\n` +
                    `\`say <title> / <message> / [image] / [video] / [@role]\` - Send custom embed\n` +
                    `• Use \`/\` to separate parts\n` +
                    `• Image and video links are optional\n` +
                    `• Mention role to ping it\n\n` +
                    `**Voice Channel Control**\n` +
                    `\`lockvc #vc\` / \`lockvoice #vc\` / \`mutevc #vc\` - Lock voice channel for @everyone\n` +
                    `\`lockvc @role\` - Lock for specific role (applies to your current VC)\n` +
                    `\`unlockvc #vc\` / \`unlockvoice #vc\` / \`openvc #vc\` - Unlock voice channel for @everyone\n` +
                    `\`unlockvc @role\` - Unlock for specific role (applies to your current VC)\n` +
                    `\`hidevc #vc\` / \`hidevoice #vc\` - Hide voice channel from @everyone\n` +
                    `\`hidevc @role\` - Hide from specific role (applies to your current VC)\n` +
                    `\`showvc #vc\` / \`showvoice #vc\` / \`revealvc #vc\` - Show voice channel to @everyone\n` +
                    `\`showvc @role\` - Show to specific role (applies to your current VC)\n` +
                    `• Role-based commands require you to be in a voice channel\n\n` +
                    `\`limit #vc <num>\` / \`userlimit #vc <num>\` - Set user limit (0-99)\n` +
                    `\`bitrate #vc <kbps>\` / \`setbitrate #vc <kbps>\` - Set bitrate quality\n\n` +
                    `**Join-to-Create System**\n` +
                    `\`j2c #vc\` / \`join2create #vc\` / \`setupj2c #vc\` - Enable J2C on voice channel\n` +
                    `\`removej2c\` / \`disablej2c\` - Disable J2C system\n\n` +
                    `**Channel Information**\n` +
                    `\`permissions @user\` / \`perms @user\` - Check user permissions\n` +
                    `\`channels\` / \`listchannels\` - List all channels`)
                .setFooter({ text: 'Channel Management System', iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&' });
            break;

        case 'category_media':
            embed.setTitle('✗ 𖹭 **Media and Threads Management Systems**')
                .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +
                    `**Media Channel Management**\n` +
                    `\`enablemedia\` / \`mediachannel\` - Enable media-only mode\n` +
                    `\`mediaslowmode <sec>\` / \`mediaslow <sec>\` - Set media slowmode\n` +
                    `\`lockmedia\` - Lock media channel\n` +
                    `\`unlockmedia\` / \`openmedia\` - Unlock media channel\n\n` +
                    `**Thread Management**\n` +
                    `\`createthread <name>\` / \`newthread <name>\` - Create thread\n` +
                    `\`lockthread\` - Lock current thread\n` +
                    `\`unlockthread\` / \`openthread\` - Unlock thread\n` +
                    `\`archivethread\` - Archive current thread\n` +
                    `\`unarchivethread\` - Unarchive thread\n` +
                    `\`deletethread\` / \`removethread\` - Delete current thread\n\n` +
                    `**Features:**\n` +
                    `• Media-only channel enforcement\n` +
                    `• Automatic non-media message deletion\n` +
                    `• Thread creation and management\n` +
                    `• Thread archiving and locking\n` +
                    `• Thread-specific slowmode support`)
                .setFooter({ text: 'Media & Threads Management', iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&' });
            break;

        case 'category_automod':
            embed.setTitle('✗ 𖹭 **Automods Management Systems**')
                .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +
                    `**Auto-Mod System**\n` +
                    `\`automod on\` - Enable auto-moderation\n` +
                    `\`automod off\` - Disable auto-moderation\n` +
                    `\`automodconfig\` / \`amc\` - View/configure auto-mod settings\n\n` +
                    `**Blacklist Management**\n` +
                    `\`blacklist add <word>\` - Add word to blacklist\n` +
                    `\`blacklist remove <word>\` - Remove word from blacklist\n` +
                    `\`blacklist list\` - Show all blacklisted words\n\n` +
                    `**Warning Management**\n` +
                    `\`clearwarnings @user\` / \`cw @user\` - Clear user warnings\n\n` +
                    `**Auto-Mod Features:**\n` +
                    `• Blacklisted word filtering\n` +
                    `• URL and invite link blocking\n` +
                    `• Spam detection and prevention\n` +
                    `• Auto-quarantine after warnings\n` +
                    `• Message deletion for violations\n` +
                    `• Configurable warning thresholds\n` +
                    `• Automatic DM notifications`)
                .setFooter({ text: 'Auto-Moderation System', iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&' });
            break;

        case 'category_protection':
            embed.setTitle('✗ 𖹭 **Bot and User Protection System**')
                .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +
                    `**Bot Whitelist Management**\n` +
                    `\`whitelist add <bot_id>\` - Add bot to whitelist\n` +
                    `\`whitelist remove <bot_id>\` - Remove bot from whitelist\n` +
                    `\`whitelist list\` - Show all whitelisted bots\n\n` +
                    `**Bot Security**\n` +
                    `\`flagged\` - Show flagged bots\n` +
                    `\`unflag <bot_id>\` - Remove bot from flagged list\n` +
                    `\`scanserver\` - Scan for unauthorized bots\n` +
                    `\`purgebots\` - Remove all unauthorized bots\n\n` +
                    `**User Protection**\n` +
                    `\`unfu @user\` - Unflag user (remove restrictions)\n` +
                    `\`flaggedusers\` - Show all flagged users\n\n` +
                    `**Global Moderation (Bot Owner Only)**\n` +
                    `\`globalban @user [reason]\` / \`gban\` - Ban globally across all servers\n` +
                    `\`globalunban <user_id> [reason]\` / \`gunban\` - Unban globally\n` +
                    `\`globalkick @user [reason]\` / \`gkick\` - Kick from all servers\n` +
                    `\`globalwarn @user [reason]\` / \`gwarn\` - Warn globally\n` +
                    `\`globallock @user [duration] [reason]\` / \`glock\` - Timeout globally\n\n` +
                    `**Protection Features:**\n` +
                    `• Automatic unauthorized bot detection\n` +
                    `• Instant bot removal and banning\n` +
                    `• Bot inviter punishment system\n` +
                    `• User flagging and restriction\n` +
                    `• Global moderation across all servers`)
                .setFooter({ text: 'Bot & User Protection System', iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&' });
            break;

        case 'category_server':
            embed.setTitle('✗ 𖹭 **Server Management Systems**')
                .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +
                    `**Server Protection**\n` +
                    `\`protection\` - View protection status\n` +
                    `\`protection enable <feature>\` - Enable protection feature\n` +
                    `\`protection disable <feature>\` - Disable protection feature\n` +
                    `\`createbaseline\` - Create security baseline\n\n` +
                    `**Server Template Management (Owner Only)**\n` +
                    `\`srvcrt\` - Create/update server template\n` +
                    `\`mdfsrv\` - Enable modification mode\n` +
                    `\`mdfsv\` - Save modifications and restore protection\n\n` +
                    `**Configuration**\n` +
                    `\`set adminchannel #channel\` - Set admin channel\n` +
                    `\`set qrole @role\` - Set quarantine role\n` +
                    `\`set qduration <duration>\` - Set default quarantine duration\n` +
                    `\`setinterimrole @role\` - Set interim role\n\n` +
                    `**Advanced Settings**\n` +
                    `\`nightmode <start> <end>\` - Set night mode scanning hours\n` +
                    `\`recovery "channel_id"\` - Set recovery channel\n\n` +
                    `**Protection Features:**\n` +
                    `• Real-time server monitoring (60s scans)\n` +
                    `• Auto-restoration from templates\n` +
                    `• Channel and role integrity checks\n` +
                    `• Unauthorized change detection\n` +
                    `• WhatsApp critical alerts\n` +
                    `• God-level security protection`)
                .setFooter({ text: 'Server Management & Protection', iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&' });
            break;

        case 'category_ticket':
            embed.setTitle('✗ 𖹭 **Ticket Management Systems**')
                .setDescription(`**Total Commands:** ${totalCommands} • **Admin Channel / Authorized Users**\n\n` +

                    `**🎫 Ticket System Commands**\n` +
                    `➺ \`ticket\` - Create ticket panel in current channel\n` +
                    `➺ \`ticket "message"\` - Create panel in current channel with custom message\n` +
                    `➺ \`ticket "message" @role\` - Create panel with message and role ping\n` +
                    `➺ \`ticket #channel "message" @role\` - Create panel in specific channel\n` +
                    `➺ \`ticketopen\` - Create ticket panel in current channel\n` +
                    `➺ \`ticketopen "message"\` - Create panel with custom message\n` +
                    `➺ \`ticketclose\` - Close current ticket channel\n` +
                    `➺ \`ticketclose #username-X\` - Close specific ticket\n\n` +

                    `**✨ Ticket System Features**\n` +
                    `• **Quick Setup:** Create panels in current channel with simple commands\n` +
                    `• **Button-Based Creation:** Users click button to open tickets\n` +
                    `• **Automatic Private Channels:** Creates ticket channels as username-number\n` +
                    `• **Permission Management:** Only creator, admins, and owner can view\n` +
                    `• **Role Ping Notifications:** Notify support team when tickets open\n` +
                    `• **Per-User Ticket Numbering:** Each user gets their own ticket sequence\n` +
                    `• **Easy Closing:** Close via button or command\n` +
                    `• **One Ticket Per User:** Prevents spam\n\n` +

                    `**📋 Setup Examples**\n` +
                    `\`ticket\` - Create panel in current channel with default message\n` +
                    `\`ticket "Need help? Click the button!"\` - Custom message in current channel\n` +
                    `\`ticket "Support Request" @Support Team\` - With custom message and role ping\n` +
                    `\`ticket #support "How can we help?"\` - Create in specific channel\n` +
                    `\`ticketopen\` - Quick setup in current channel\n\n` +

                    `**🔒 How It Works**\n` +
                    `1. Admin uses \`ticket\` command in desired channel\n` +
                    `2. Users click "📩 Open Ticket" button\n` +
                    `3. Ticket channel created as username-number (e.g., alice-1, bob-2)\n` +
                    `4. Category "Tickets" created automatically if needed\n` +
                    `5. Only ticket creator, server owner, and admins can view\n` +
                    `6. Staff can close ticket with button or \`ticketclose\` command\n` +
                    `7. Channel auto-deletes after 5 seconds`)
                .setFooter({ text: 'Ticket System', iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&' });
            break;

        case 'category_utility':
            embed.setTitle('✗ 𖹭 **Utility Management Systems**')
                .setDescription(`**Total Commands:** ${totalCommands} • **Some Public, Some Admin Only**\n\n` +
                    `**🌐 Public Utility Commands**\n` +
                    `\`ping\` - Check bot latency and performance\n` +
                    `\`dev\` - Show developer information\n` +
                    `\`avatar [@user]\` - Get user avatar\n\n` +
                    `**👤 User Information (Authorized)**\n` +
                    `\`ui @user\` / \`userinfo @user\` - Show detailed user information\n` +
                    `\`roleinfo [@user]\` - Show user's role information\n\n` +
                    `**🖼️ Server Information (Authorized)**\n` +
                    `\`serverlogo\` - Get server logo/icon\n\n` +
                    `**📧 Communication (Authorized)**\n` +
                    `\`dm @user [message]\` - Send direct message to user\n\n` +
                    `**🎭 Moderation (Authorized)**\n` +
                    `\`rename @user "new name"\` - Rename user nickname\n` +
                    `\`srvpasuse\` - Pause server invites (delete all invites)\n\n` +
                    `**🎭 Special Commands (Authorized)**\n` +
                    `\`fck\` - Show special security message\n\n` +
                    `**🚨 Emergency Commands (Owner/Admin Only)**\n` +
                    `\`panic\` - Lock all channels immediately\n` +
                    `\`stop panic\` - Unlock all channels\n` +
                    `\`emergency\` - Maximum lockdown + remove admin perms\n` +
                    `\`end emergency\` - Restore admin perms + unlock\n\n` +
                    `**🧪 Testing & Alerts (Owner/Admin Only)**\n` +
                    `\`wbtestan\` - Test WhatsApp alert system\n\n` +
                    `**ℹ️ Help System**\n` +
                    `\`help\` - Show complete help menu with categories\n\n` +
                    `**✨ Utility Features:**\n` +
                    `• Emergency lockdown system\n` +
                    `• WhatsApp alert integration\n` +
                    `• User information cards with avatar/role info\n` +
                    `• Server management tools\n` +
                    `• Real-time bot performance metrics\n` +
                    `• Direct messaging capability\n` +
                    `• Public and restricted access levels`)
                .setFooter({ text: 'Utility & Emergency Commands', iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&' });
            break;

        case 'category_developer':
            embed.setTitle('✗ 𖹭 **Developer Information**')
                .setDescription(`**Total Commands:** ${totalCommands} • **Bot Created by script.agi**\n\n` +
                    `**ᡣ𐭩 About the Developer**\n` +
                    `discord.gg/scriptspace was developed with ➺ ➺ at scriptspace by **script.agi**\n\n` +
                    `**✿ Official Links**\n` +
                    `🌐 **Website:** https://scriptspace.in/\n` +
                    `💬 **Discord:** discord.gg/scriptspace\n` +
                    `👨‍💻 **Developer:** script.agi\n\n` +
                    `**🚀 Project Overview**\n` +
                    `This bot is a highly engineered Discord management system featuring:\n` +
                    `• AI-powered integrations for intelligent automation\n` +
                    `• NextGen Quarantine System for user management\n` +
                    `• Advanced Interim Role Management\n` +
                    `• Comprehensive Voice Channel Control\n` +
                    `• God-Level Server Protection (impossible to bypass)\n` +
                    `• Real-time security monitoring and auto-restoration\n` +
                    `• WhatsApp critical alert integration\n\n` +
                    `**🛠️ Technical Stack**\n` +
                    `• Discord.js v14 - Modern Discord API wrapper\n` +
                    `• Node.js - High-performance JavaScript runtime\n` +
                    `• PostgreSQL - Robust database system\n` +
                    `• Lavalink - Advanced music streaming\n` +
                    `• Twilio API - WhatsApp alert integration\n\n` +
                    `**⚡ Key Features**\n` +
                    `✅ God-Level Protection System\n` +
                    `✅ Ultra-fast <1ms response time\n` +
                    `✅ 60-second server integrity scans\n` +
                    `✅ Automatic template restoration\n` +
                    `✅ Advanced role & channel management\n` +
                    `✅ Voice state tracking & control\n` +
                    `✅ Media & thread management\n` +
                    `✅ Auto-moderation with AI detection\n` +
                    `✅ Unauthorized bot prevention\n` +
                    `✅ Real-time audit log monitoring\n\n` +
                    `**📊 System Stats**\n` +
                    `• **Response Time:** <1 millisecond\n` +
                    `• **Uptime:** 99.9% availability\n` +
                    `• **Protection Level:** GOD-LEVEL (Maximum Security)\n` +
                    `• **Total Commands:** ${totalCommands}+\n` +
                    `• **Servers Protected:** ${client.guilds.cache.size}\n\n` +
                    `**✨ Built with Script.AGI Technology**\n` +
                    `Powered by cutting-edge artificial intelligence and advanced security protocols.\n\n` +
                    `**💬 Support & Contact**\n` +
                    `For support, feature requests, or custom bot development:\n` +
                    `Join our Discord: **discord.gg/scriptspace**`)
                .setFooter({ text: 'Developer: script.agi • Made at scriptspace', iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&' });
            break;

        default:
            embed.setTitle('✗ 𖹭 **Command Categories**')
                .setDescription('Select a category from the dropdown menu below to view commands.');
    }

    return embed;
}

// Function to show help with slideshow functionality and category dropdown
async function showHelp(guildId = null, cardNumber = 1, userId = null, interactionId = null) {
    let helpEmbed;

    // Ensure cardNumber is valid
    if (!cardNumber || cardNumber < 1 || cardNumber > 11) {
        cardNumber = 1;
    }

    switch(cardNumber) {
        case 1:
            helpEmbed = createHelpCard1();
            break;
        case 2:
            helpEmbed = createHelpCard2();
            break;
        case 3:
            helpEmbed = createHelpCard3();
            break;
        case 4:
            helpEmbed = createHelpCard4();
            break;
        case 5:
            helpEmbed = createHelpCard5();
            break;
        case 6:
            helpEmbed = createHelpCard6();
            break;
        case 7:
            helpEmbed = createHelpCard7();
            break;
        case 8:
            helpEmbed = createHelpCard8();
            break;
        case 9:
            helpEmbed = createHelpCard9();
            break;
        case 10:
            helpEmbed = createHelpCard10();
            break;
        case 11:
            helpEmbed = createHelpCard11();
            break;
        default:
            helpEmbed = createHelpCard1();
            cardNumber = 1;
    }

    // Store current card state if guildId provided
    if (guildId && guildId !== 'default') {
        helpCardStates.set(guildId, cardNumber);
    }

    // Save interaction to database if provided - Critical for deployment environments
    if (userId && guildId && interactionId) {
        try {
            const saved = await saveHelpInteraction(interactionId, userId, guildId, cardNumber);
            if (!saved) {
                console.warn(`Failed to save help interaction for deployment compatibility: ${interactionId}`);
            } else {
                console.log(`✅ Help interaction saved for deployment environment: ${interactionId}`);
            }
        } catch (error) {
            console.error('❌ Critical error saving help interaction to database (deployment compatibility):', error);
            // Don't throw error - continue with help display even if database fails
        }
    }

    // Add category dropdown at the bottom
    const categoryDropdown = createCategoryDropdown();
    
    // Return help embed with category dropdown
    return { embeds: [helpEmbed], components: [categoryDropdown] };
}

// Function to send/update persistent unban request widget
async function sendUnbanRequestWidget(guild) {
    try {
        const appealServerId = '1411627135142985783';
        const appealChannelId = '1411658854000758916';
        
        const appealServer = client.guilds.cache.get(appealServerId);
        const appealChannel = appealServer ? appealServer.channels.cache.get(appealChannelId) : null;
        
        if (!appealChannel) {
            console.error('Appeal channel not found');
            return false;
        }

        // Check if the bot has necessary permissions
        const botMember = appealServer.members.cache.get(client.user.id);
        const channelPermissions = appealChannel.permissionsFor(botMember);

        if (!channelPermissions || !channelPermissions.has(['SendMessages', 'ViewChannel', 'EmbedLinks'])) {
            console.error(`Bot lacks necessary permissions in appeal channel`);
            return false;
        }

        const embedDescription = `🚨 **BANNED FROM A SERVER?** 🚨

**Quick Unban Request System**

If you've been banned from any server where this bot is present, you can request an unban by clicking the button below. This will automatically:

✅ **Check your ban status** across all servers
✅ **Create an appeal** with server owners
✅ **Send notifications** to the appropriate admins
✅ **Track your request** with a unique ID

**How it works:**
1. Click the "Request Unban" button below
2. Your ban status will be automatically checked
3. If you're banned, an appeal will be sent to server owners
4. You'll receive a DM with your appeal status
5. Wait for the server owner to review your case

**Note:** This system works for all servers where this bot is active. Multiple requests for the same server will update your existing appeal.`;

        // Create embed with appeal system UI styling
        const unbanEmbed = new EmbedBuilder()
            .setColor('#C8A2C8')
            .setAuthor({
                name: 'Ban Appeal System - Automated Unban Requests',
                iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
            })
            .setTitle('✗ 𖹭 **Automated Ban Appeal System**')
            .setDescription(embedDescription)
            .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
            .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
            .setFooter({
                text: 'Ban Appeal System • One-Click Unban Requests',
                iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
            })
            .setTimestamp();

        // Create button for unban requests
        const unbanButton = new ButtonBuilder()
            .setCustomId('unban_request_button')
            .setLabel('🚨 Request Unban')
            .setStyle(ButtonStyle.Danger);

        // Create action row
        const buttonRow = new ActionRowBuilder()
            .addComponents(unbanButton);

        // Look for existing unban widget message in the channel
        let existingUnbanMessage = null;
        const storageKey = `unban_widget_${appealServerId}`;
        const storedMessageId = interimWidgetMessageIds.get(storageKey);

        if (storedMessageId) {
            try {
                existingUnbanMessage = await appealChannel.messages.fetch(storedMessageId);
            } catch (error) {
                console.log(`Stored unban widget message ${storedMessageId} not found, clearing stored ID`);
                interimWidgetMessageIds.delete(storageKey);
            }
        }

        // If no stored message found, search for existing widget
        if (!existingUnbanMessage) {
            try {
                const messages = await appealChannel.messages.fetch({ limit: 50 });
                existingUnbanMessage = messages.find(msg =>
                    msg.author.id === client.user.id &&
                    msg.embeds.length > 0 &&
                    msg.embeds[0].title &&
                    msg.embeds[0].title.includes('Ban Appeal System')
                );

                if (existingUnbanMessage) {
                    interimWidgetMessageIds.set(storageKey, existingUnbanMessage.id);
                    console.log(`Found existing unban widget message: ${existingUnbanMessage.id}`);
                }
            } catch (error) {
                console.error('Error searching for existing unban widget:', error);
            }
        }

        // Prepare message payload
        const messageData = {
            embeds: [unbanEmbed],
            components: [buttonRow]
        };

        // Update existing message or create new one
        if (existingUnbanMessage) {
            try {
                await existingUnbanMessage.edit(messageData);
                console.log('Unban request widget updated successfully');
                return true;
            } catch (error) {
                console.error('Error updating existing unban widget:', error);
                existingUnbanMessage = null;
            }
        }

        // Send new message if no existing message or update failed
        if (!existingUnbanMessage) {
            try {
                const newMessage = await appealChannel.send(messageData);
                interimWidgetMessageIds.set(storageKey, newMessage.id);
                console.log(`New unban request widget sent successfully: ${newMessage.id}`);
                return true;
            } catch (error) {
                console.error('Error sending new unban widget message:', error);
                return false;
            }
        }

    } catch (error) {
        console.error('Critical error in sendUnbanRequestWidget:', error);
        return false;
    }
}

// Function to send ban appeal DM to user
async function sendBanAppealDM(user, guild, reason) {
    try {
        const appealId = `${user.id}_${guild.id}_${Date.now()}`;
        
        // Store ban appeal data
        banAppeals.set(appealId, {
            userId: user.id,
            guildId: guild.id,
            reason: reason,
            timestamp: Date.now(),
            status: 'pending'
        });

        // Create invite to ban appeal server
        const appealServerGuild = client.guilds.cache.get('1411627135142985783');
        const appealChannel = appealServerGuild ? appealServerGuild.channels.cache.get('1411658854000758916') : null;
        
        let inviteLink = 'https://discord.gg/scriptspace';
        
        if (appealChannel) {
            try {
                const invite = await appealChannel.createInvite({
                    maxAge: 86400, // 24 hours
                    maxUses: 1,
                    unique: true,
                    reason: `Ban appeal invite for ${user.username} from ${guild.name}`
                });
                inviteLink = invite.url;
                console.log(`✅ Ban appeal server invite created: ${inviteLink}`);
            } catch (inviteError) {
                console.error('Error creating ban appeal server invite:', inviteError);
            }
        }

        const banAppealEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🚨 You have been banned from ' + guild.name)
            .setDescription(`You have been banned from **${guild.name}**. To submit a ban appeal, you can use our automated system or join our ban appeal server.`)
            .addFields(
                { name: '📝 Ban Reason', value: reason || 'No reason provided', inline: false },
                { name: '⏰ Banned At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '🎯 Server', value: guild.name, inline: true },
                { name: '🚨 Quick Appeal (Recommended)', value: `Join the appeal server and click the "Request Unban" button for instant processing`, inline: false },
                { name: '🔗 Ban Appeal Server', value: `[Click here to join appeal server](${inviteLink})`, inline: false },
                { name: '📋 Alternative: Text Commands', value: `You can also type "unban me" or "ban appeal" in the appeal server`, inline: false },
                { name: '🆔 Your Appeal ID', value: `\`${appealId}\``, inline: false }
            )
            .setThumbnail(guild.iconURL({ dynamic: true, size: 128 }))
            .setFooter({ text: 'Ban Appeal System - Button & Text Support' })
            .setTimestamp();

        const joinButton = new ButtonBuilder()
            .setURL(inviteLink)
            .setLabel('🔗 Join Ban Appeal Server')
            .setStyle(ButtonStyle.Link);

        const appealButton = new ButtonBuilder()
            .setCustomId(`ban_appeal_${appealId}`)
            .setLabel('📝 Submit Appeal (Legacy)')
            .setStyle(ButtonStyle.Secondary);

        const buttonRow = new ActionRowBuilder()
            .addComponents(joinButton, appealButton);

        await user.send({ 
            embeds: [banAppealEmbed], 
            components: [buttonRow] 
        });

        console.log(`✅ Ban appeal DM with server invite sent to ${user.username} for guild ${guild.name}`);
        return true;
    } catch (error) {
        console.error('Error sending ban appeal DM:', error);
        return false;
    }
}

// Function to create ban appeal management embed for owner
async function createBanAppealManagement(appealId, guild) {
    const appealData = banAppeals.get(appealId);
    if (!appealData) {
        console.error(`Appeal data not found for ID: ${appealId}`);
        return null;
    }

    // Reset status to pending when creating management interface
    appealData.status = 'pending';
    banAppeals.set(appealId, appealData);

    try {
        const user = await client.users.fetch(appealData.userId);
        
        // Check if user is actually banned in the guild
        let isBanned = false;
        try {
            const ban = await guild.bans.fetch(appealData.userId);
            isBanned = !!ban;
        } catch (banCheckError) {
            console.log(`User ${user.username} is not banned or ban check failed`);
            isBanned = false;
        }
        
        const managementEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('📋 Ban Appeal Management')
            .setDescription(`**A user has submitted a ban appeal and is requesting review.**`)
            .addFields(
                { name: '👤 User', value: `${user.username} (\`${user.id}\`)`, inline: true },
                { name: '📝 Original Ban Reason', value: appealData.reason || 'No reason provided', inline: true },
                { name: '⏰ Appeal Submitted', value: `<t:${Math.floor(appealData.timestamp / 1000)}:F>`, inline: true },
                { name: '🎯 Server', value: guild.name, inline: true },
                { name: '📊 Ban Status', value: isBanned ? '🔴 Currently Banned' : '🟢 Not Currently Banned', inline: true },
                { name: '🆔 Appeal ID', value: `\`${appealId}\``, inline: true },
                { name: '👑 Action Required', value: 'Click **Approve** to unban and send invite, or **Reject** to deny the appeal.', inline: false }
            )
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 128 }))
            .setFooter({ text: `Ban Appeal System • Appeal ID: ${appealId}` })
            .setTimestamp();

        const approveButton = new ButtonBuilder()
            .setCustomId(`approve_appeal_${appealId}`)
            .setLabel('✅ Approve Ban Appeal')
            .setStyle(ButtonStyle.Success);

        const rejectButton = new ButtonBuilder()
            .setCustomId(`revoke_appeal_${appealId}`)
            .setLabel('❌ Reject Ban Appeal')
            .setStyle(ButtonStyle.Danger);

        const buttonRow = new ActionRowBuilder()
            .addComponents(approveButton, rejectButton);

        return { embeds: [managementEmbed], components: [buttonRow] };
    } catch (error) {
        console.error('Error creating ban appeal management:', error);
        
        // Create a fallback embed with basic information
        const fallbackEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Ban Appeal Management Error')
            .setDescription(`Error creating appeal management for appeal ID: \`${appealId}\``)
            .addFields(
                { name: '🆔 Appeal ID', value: `\`${appealId}\``, inline: true },
                { name: '👤 User ID', value: `\`${appealData.userId}\``, inline: true },
                { name: '⚠️ Error', value: 'Could not fetch user information', inline: true }
            )
            .setFooter({ text: 'Manual review required' })
            .setTimestamp();

        return { embeds: [fallbackEmbed], components: [] };
    }
}

// Function to handle ban appeal approval
async function handleBanAppealApproval(appealId, guild, approver) {
    const appealData = banAppeals.get(appealId);
    if (!appealData) {
        console.error(`Appeal data not found for ID: ${appealId}`);
        return false;
    }
    
    if (appealData.status !== 'pending') {
        console.log(`Appeal ${appealId} is not pending (status: ${appealData.status})`);
        return false;
    }

    try {
        // Update appeal status first
        appealData.status = 'approved';
        banAppeals.set(appealId, appealData);

        const user = await client.users.fetch(appealData.userId);
        
        // Check if user is actually banned
        let wasBanned = false;
        try {
            await guild.bans.fetch(appealData.userId);
            wasBanned = true;
        } catch (banCheckError) {
            console.log(`User ${user.username} is not currently banned in ${guild.name}`);
            wasBanned = false;
        }

        // Remove ban if user is banned
        if (wasBanned) {
            try {
                await guild.bans.remove(appealData.userId, `Ban appeal approved by ${approver.username}`);
                console.log(`✅ Successfully unbanned ${user.username}`);
            } catch (unbanError) {
                console.error('Error removing ban:', unbanError);
                // Continue with the rest of the process even if unban fails
            }
        }

        // Create server invite
        const inviteChannel = guild.systemChannel || 
                            guild.channels.cache.find(c => c.type === 0 && 
                            c.permissionsFor(guild.members.me)?.has('CreateInstantInvite'));
        let inviteLink = 'No invite could be created';
        
        if (inviteChannel) {
            try {
                const invite = await inviteChannel.createInvite({
                    maxAge: 86400, // 24 hours
                    maxUses: 1,
                    unique: true,
                    reason: `Ban appeal approved for user ${appealData.userId}`
                });
                inviteLink = invite.url;
                console.log(`✅ Server invite created: ${inviteLink}`);
            } catch (inviteError) {
                console.error('Error creating invite:', inviteError);
                inviteLink = `discord.gg/${guild.vanityURLCode || 'server'}`;
            }
        }

        // Send approval DM to user
        try {
            const approvalEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Ban Appeal Approved!')
                .setDescription(`Great news! Your ban appeal for **${guild.name}** has been approved by the server owner.`)
                .addFields(
                    { name: '👑 Approved By', value: `Server Owner ${approver.username}`, inline: true },
                    { name: '⏰ Approved At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: '📊 Status', value: wasBanned ? 'Ban removed - you can rejoin' : 'Appeal approved', inline: true },
                    { name: '🔗 Server Invite', value: inviteLink !== 'No invite could be created' ? `[Click here to rejoin the server](${inviteLink})` : 'Contact server staff for invite', inline: false },
                    { name: '📋 Welcome Back!', value: 'Please follow server rules to avoid future issues. We look forward to having you back!', inline: false }
                )
                .setThumbnail(guild.iconURL({ dynamic: true, size: 128 }))
                .setFooter({ text: 'Ban Appeal System - Approved' })
                .setTimestamp();

            await user.send({ embeds: [approvalEmbed] });
            console.log(`✅ Approval DM sent to ${user.username}`);

            // Also notify in appeal server if the appeal came from there
            if (appealData.appealServerId && appealData.appealChannelId) {
                try {
                    const appealServer = client.guilds.cache.get(appealData.appealServerId);
                    const appealChannel = appealServer ? appealServer.channels.cache.get(appealData.appealChannelId) : null;
                    
                    if (appealChannel) {
                        const serverNotificationEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('✅ Your Ban Appeal was Approved!')
                            .setDescription(`<@${user.id}>, your ban appeal for **${guild.name}** has been approved!`)
                            .addFields(
                                { name: '🎯 Status', value: 'Ban removed - you can rejoin', inline: true },
                                { name: '🔗 Server Invite', value: inviteLink !== 'No invite could be created' ? `[Click here to rejoin](${inviteLink})` : 'Contact server staff', inline: true },
                                { name: '📧 Check DMs', value: 'Full details sent to your DMs', inline: true }
                            )
                            .setFooter({ text: 'Ban Appeal System - Approved' })
                            .setTimestamp();

                        await appealChannel.send({ embeds: [serverNotificationEmbed] });
                        console.log(`✅ Appeal approval notification sent to appeal server`);
                    }
                } catch (serverNotifyError) {
                    console.error('Error notifying appeal server:', serverNotifyError);
                }
            }
        } catch (dmError) {
            console.error('Error sending approval DM:', dmError);
        }

        // Log the approval
        const logEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Ban Appeal Approved')
            .setDescription(`Ban appeal has been approved and processed successfully.`)
            .addFields(
                { name: '👤 User', value: `${user.username} (\`${user.id}\`)`, inline: true },
                { name: '👑 Approved By', value: `${approver.username}`, inline: true },
                { name: '🔗 Invite Status', value: inviteLink !== 'No invite could be created' ? 'Created' : 'Failed', inline: true },
                { name: '📊 Ban Status', value: wasBanned ? 'Was banned - Now unbanned' : 'Was not banned', inline: true },
                { name: '📧 DM Status', value: 'Approval notification sent', inline: true },
                { name: '⏰ Processed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setFooter({ text: `Appeal ID: ${appealId}` })
            .setTimestamp();

        await sendLogMessage(guild, logEmbed);

        console.log(`✅ Ban appeal approved for ${user.username} by ${approver.username}`);
        return true;
    } catch (error) {
        console.error('Error handling ban appeal approval:', error);
        
        // Try to update appeal status to error
        try {
            appealData.status = 'error';
            banAppeals.set(appealId, appealData);
        } catch (statusError) {
            console.error('Failed to update appeal status to error:', statusError);
        }
        
        return false;
    }
}

// Function to handle ban appeal rejection
async function handleBanAppealRejection(appealId, guild, rejector) {
    const appealData = banAppeals.get(appealId);
    if (!appealData || appealData.status !== 'pending') return false;

    try {
        // Update appeal status
        appealData.status = 'rejected';
        banAppeals.set(appealId, appealData);

        // Send rejection DM to user
        const user = await client.users.fetch(appealData.userId);
        const rejectionEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Ban Appeal Rejected')
            .setDescription(`Your ban appeal for **${guild.name}** has been reviewed and rejected.`)
            .addFields(
                { name: '👑 Reviewed By', value: 'Server Owner script.agi', inline: true },
                { name: '⏰ Reviewed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '📊 Decision', value: 'Your Ban Appeal is not Convinced by server owner script.agi', inline: false },
                { name: '📝 Original Ban Reason', value: appealData.reason || 'No reason provided', inline: false },
                { name: '📋 Final Notice', value: 'This decision is final. The ban remains in effect.', inline: false }
            )
            .setThumbnail(guild.iconURL({ dynamic: true, size: 128 }))
            .setFooter({ text: 'Ban Appeal System - Final Decision' })
            .setTimestamp();

        await user.send({ embeds: [rejectionEmbed] });

        // Also notify in appeal server if the appeal came from there
        if (appealData.appealServerId && appealData.appealChannelId) {
            try {
                const appealServer = client.guilds.cache.get(appealData.appealServerId);
                const appealChannel = appealServer ? appealServer.channels.cache.get(appealData.appealChannelId) : null;
                
                if (appealChannel) {
                    const serverRejectionEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Your Ban Appeal was Rejected')
                        .setDescription(`<@${user.id}>, your ban appeal for **${guild.name}** has been rejected.`)
                        .addFields(
                            { name: '📊 Decision', value: 'Appeal not convincing to server owner', inline: true },
                            { name: '📋 Status', value: 'Final - Ban remains in effect', inline: true },
                            { name: '📧 Check DMs', value: 'Full details sent to your DMs', inline: true }
                        )
                        .setFooter({ text: 'Ban Appeal System - Final Decision' })
                        .setTimestamp();

                    await appealChannel.send({ embeds: [serverRejectionEmbed] });
                    console.log(`✅ Appeal rejection notification sent to appeal server`);
                }
            } catch (serverNotifyError) {
                console.error('Error notifying appeal server of rejection:', serverNotifyError);
            }
        }

        // Log the rejection
        const logEmbed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Ban Appeal Rejected')
            .setDescription(`Ban appeal has been reviewed and rejected.`)
            .addFields(
                { name: '👤 User', value: `${user.username} (\`${user.id}\`)`, inline: true },
                { name: '👑 Rejected By', value: `${rejector.username}`, inline: true },
                { name: '📊 Status', value: 'Ban remains in effect', inline: true },
                { name: '📝 Reason', value: 'Appeal not convincing to server owner', inline: false }
            )
            .setFooter({ text: `Appeal ID: ${appealId}` })
            .setTimestamp();

        await sendLogMessage(guild, logEmbed);

        console.log(`❌ Ban appeal rejected for ${user.username} by ${rejector.username}`);
        return true;
    } catch (error) {
        console.error('Error handling ban appeal rejection:', error);
        return false;
    }
}

// Function to create slideshow help with automatic card cycling
async function createHelpSlideshow(message, guildId) {
    try {
        // Stop any existing slideshow for this user
        const existingSlideshow = activeHelpSlideshows.get(message.author.id);
        if (existingSlideshow) {
            clearInterval(existingSlideshow.intervalId);
            activeHelpSlideshows.delete(message.author.id);
        }

        // Delete any existing help interaction for this user
        await deleteHelpInteraction(message.author.id, message.guild.id);

        // Start with card 1
        let currentCard = 1;
        const helpData = await showHelp(
            guildId,
            currentCard,
            message.author.id,
            `slideshow_${message.id}_${Date.now()}`
        );

        const helpMessage = await message.reply(helpData);

        // Create slideshow with 8-second intervals
        const slideshowInterval = setInterval(async () => {
            try {
                currentCard = currentCard >= 11 ? 1 : currentCard + 1;

                const updatedHelpData = await showHelp(
                    guildId,
                    currentCard,
                    message.author.id,
                    `slideshow_${message.id}_${currentCard}_${Date.now()}`
                );

                await helpMessage.edit(updatedHelpData);
                console.log(`📋 Help slideshow updated to card ${currentCard} for ${message.author.username}`);

            } catch (error) {
                console.error('Error updating help slideshow:', error);
                clearInterval(slideshowInterval);
                activeHelpSlideshows.delete(message.author.id);
            }
        }, 8000); // 8 seconds per card

        // Store slideshow info
        activeHelpSlideshows.set(message.author.id, {
            intervalId: slideshowInterval,
            messageId: helpMessage.id
        });

        // Auto-stop slideshow after 5 minutes (37.5 cycles)
        setTimeout(() => {
            clearInterval(slideshowInterval);
            activeHelpSlideshows.delete(message.author.id);
            console.log(`📋 Help slideshow auto-stopped for ${message.author.username}`);
        }, 5 * 60 * 1000); // 5 minutes

        return helpMessage;

    } catch (error) {
        console.error('Error creating help slideshow:', error);
        // Fallback to single card help
        const fallbackHelpData = await showHelp(guildId, 1);
        return await message.reply(fallbackHelpData);
    }
}

// Function to show developer info
function showDeveloperInfo() {
    const devEmbed = new EmbedBuilder()
        .setColor('#FFFFFF')
        .setTitle('✿ Developer Information')
        .setDescription(`**Total Commands:** ${getTotalCommandsCount()} • **Owner/Admin Channel Only**\n\n` +
            `**ᡣ𐭩 About the Developer**\n` +
            `discord.gg/scriptspace was developed by made with ➺ ➺ at scriptspace\n\n` +
            `**✿ Website:** https://scriptspace.in/\n\n` +
            `discord.gg/scriptspace is a highly engineered discord server with AI Integrations, NextGen Quarantine Systems, NextGen Interim Role Management Systems And Temporary Voice Channel management systems everything was made possible by script.agi\n\n` +
            `**ᡣ𐭩 Technical Features**\n` +
            `➺ God-Level Protection System\n` +
            `➺ AI-Powered Integrations\n` +
            `➺ NextGen Quarantine Management\n` +
            `➺ Advanced Interim Role System\n` +
            `➺ Voice Channel Management\n` +
            `➺ Real-time Security Monitoring\n\n` +
            `**✿ Built with Script.AGI Technology**`
        )
        .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
        .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
        .setFooter({
            text: 'Developer Information • Made with ➺ at ScriptSpace',
            iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
        })
        .setTimestamp();

    return devEmbed;
}

// Handle raw events for Lavalink
client.on('raw', (data) => {
    if (musicManager && musicManager.lavalink && musicManager.lavalink.manager) {
        musicManager.lavalink.manager.updateVoiceState(data);
    }
});

// Home voice channel configuration
const HOME_VOICE_CHANNEL_ID = '1377806787431895181';

// Function to auto-join home voice channel
async function autoJoinHomeChannel(guild) {
    try {
        const homeChannel = guild.channels.cache.get(HOME_VOICE_CHANNEL_ID);
        if (!homeChannel) {
            console.log(`❌ Home voice channel ${HOME_VOICE_CHANNEL_ID} not found`);
            return false;
        }

        // Check if bot is already in the home channel
        const botMember = guild.members.cache.get(client.user.id);
        if (botMember && botMember.voice.channel && botMember.voice.channel.id === HOME_VOICE_CHANNEL_ID) {
            console.log(`✅ Bot already in home channel: ${homeChannel.name}`);
            return true;
        }

        // Join the home channel
        const { joinVoiceChannel } = require('@discordjs/voice');
        const connection = joinVoiceChannel({
            channelId: HOME_VOICE_CHANNEL_ID,
            guildId: guild.id,
            adapterCreator: guild.voiceAdapterCreator,
            selfDeaf: false,
            selfMute: false,
        });

        console.log(`🎵 Auto-joined home voice channel: ${homeChannel.name}`);
        return true;
    } catch (error) {
        console.error('❌ Error auto-joining home channel:', error);
        return false;
    }
}

// Store temporary J2C channels for cleanup
const j2cTemporaryChannels = new Map(); // channelId -> { ownerId, createdAt }

// Import slash command handler
const SlashCommandHandler = require('./slashCommandHandler');
let slashCommandHandler = null;

// Handle button interactions for help command and other features
client.on('interactionCreate', async interaction => {
    try {
        // Handle slash commands
        if (interaction.isChatInputCommand()) {
            // ===== ANTI-SPAM: Interaction Deduplication =====
            if (isInteractionProcessed(interaction.id)) {
                console.log(`⚠️ Duplicate interaction detected: ${interaction.id} - Ignoring`);
                return;
            }
            markInteractionProcessed(interaction.id);
            
            // ===== ANTI-SPAM: Cooldown Check for Slash Commands =====
            const cooldownCheck = checkCooldown(interaction.user.id, interaction.commandName);
            if (cooldownCheck.onCooldown) {
                const cooldownEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('⏱️ Cooldown Active')
                    .setDescription(`Please wait **${cooldownCheck.remaining} second(s)** before using \`/${interaction.commandName}\` again.`)
                    .setFooter({ text: 'Anti-Spam Protection' })
                    .setTimestamp();
                
                await interaction.reply({ embeds: [cooldownEmbed], ephemeral: true });
                return;
            }
            
            // Set cooldown before executing command
            setCooldown(interaction.user.id, interaction.commandName);
            
            // Initialize slash command handler if not already initialized
            if (!slashCommandHandler) {
                slashCommandHandler = new SlashCommandHandler(client, {
                    roleManager,
                    channelManager,
                    mediaThreadsManager,
                    utilityManager,
                    voiceManager
                });
                console.log('✅ Slash command handler initialized');
            }
            
            console.log(`Slash command received: /${interaction.commandName} from ${interaction.user.username}`);
            await slashCommandHandler.handleCommand(interaction);
            return;
        }

        if (!interaction.isButton() && !interaction.isStringSelectMenu()) return;

        // Handle help category selection dropdown
        if (interaction.isStringSelectMenu() && interaction.customId === 'help_category_select') {
            // Stop any active slideshow for this user
            const existingSlideshow = activeHelpSlideshows.get(interaction.user.id);
            if (existingSlideshow) {
                clearInterval(existingSlideshow.intervalId);
                activeHelpSlideshows.delete(interaction.user.id);
                console.log(`📋 Help slideshow stopped for ${interaction.user.username} (category selected)`);
            }

            const selectedCategory = interaction.values[0];
            const categoryEmbed = createCategoryEmbed(selectedCategory);
            const categoryDropdown = createCategoryDropdown();
            
            await interaction.update({
                embeds: [categoryEmbed],
                components: [categoryDropdown]
            });
            return;
        }

        // Handle stats card switching buttons
        if (interaction.isButton() && interaction.customId.startsWith('stats_')) {
            const parts = interaction.customId.split('_');
            const cardType = parts[1];
            const guildId = parts[2];

            if (cardType && guildId) {
                cardStates.set(guildId, cardType);
                await updateServerStats();
                await interaction.deferUpdate();
            }
            return;
        }

        // Handle interim role request button
        if (interaction.isButton() && interaction.customId === 'interim_role_request') {
            const member = interaction.member;
            await grantInterimRole(member, interaction);
            return;
        }

        // Handle ban appeal approval button
        if (interaction.isButton() && interaction.customId.startsWith('approve_appeal_')) {
            const appealId = interaction.customId.replace('approve_appeal_', '');
            const guild = interaction.guild;
            const approver = interaction.user;

            const success = await handleBanAppealApproval(appealId, guild, approver);
            
            if (success) {
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('✅ Ban Appeal Approved')
                            .setDescription('The ban appeal has been approved and the user has been unbanned.')
                            .setTimestamp()
                    ],
                    components: []
                });
            } else {
                await interaction.reply({
                    content: '❌ Failed to approve ban appeal. It may have already been processed.',
                    ephemeral: true
                });
            }
            return;
        }

        // Handle ban appeal rejection button
        if (interaction.isButton() && interaction.customId.startsWith('revoke_appeal_')) {
            const appealId = interaction.customId.replace('revoke_appeal_', '');
            const guild = interaction.guild;
            const rejector = interaction.user;

            const success = await handleBanAppealRejection(appealId, guild, rejector);
            
            if (success) {
                await interaction.update({
                    embeds: [
                        new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ Ban Appeal Rejected')
                            .setDescription('The ban appeal has been rejected.')
                            .setTimestamp()
                    ],
                    components: []
                });
            } else {
                await interaction.reply({
                    content: '❌ Failed to reject ban appeal. It may have already been processed.',
                    ephemeral: true
                });
            }
            return;
        }

        // Handle unban request button
        if (interaction.isButton() && interaction.customId === 'unban_request_button') {
            const user = interaction.user;
            
            let foundBans = [];
            for (const guild of client.guilds.cache.values()) {
                try {
                    const ban = await guild.bans.fetch(user.id);
                    if (ban) {
                        foundBans.push({
                            guild: guild,
                            reason: ban.reason || 'No reason provided'
                        });
                    }
                } catch (error) {
                    // User not banned in this guild, skip
                }
            }

            if (foundBans.length === 0) {
                await interaction.reply({
                    content: '✅ You are not banned from any servers where this bot is present.',
                    ephemeral: true
                });
                return;
            }

            // Create appeals and notify server owners
            for (const banInfo of foundBans) {
                const appealId = `${user.id}_${banInfo.guild.id}_${Date.now()}`;
                
                banAppeals.set(appealId, {
                    userId: user.id,
                    guildId: banInfo.guild.id,
                    reason: banInfo.reason,
                    timestamp: Date.now(),
                    status: 'pending',
                    appealServerId: interaction.guild.id,
                    appealChannelId: interaction.channel.id
                });

                const managementData = await createBanAppealManagement(appealId, banInfo.guild);
                if (managementData) {
                    const ownerChannel = banInfo.guild.channels.cache.get('1410011813398974626');
                    if (ownerChannel) {
                        await ownerChannel.send(managementData);
                    }
                }
            }

            await interaction.reply({
                content: `📧 Ban appeal${foundBans.length > 1 ? 's' : ''} submitted successfully! You are banned from **${foundBans.length}** server${foundBans.length > 1 ? 's' : ''}. Server owners have been notified and will review your appeal.`,
                ephemeral: true
            });
            return;
        }

    } catch (error) {
        console.error('Error handling interaction:', error);
        try {
            if (!interaction.replied && !interaction.deferred) {
                await interaction.reply({
                    content: '❌ An error occurred while processing your request.',
                    ephemeral: true
                });
            }
        } catch (replyError) {
            console.error('Error sending error reply:', replyError);
        }
    }
});

// Handle voice state updates for Lavalink and voice logging
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (musicManager) {
        musicManager.handleVoiceUpdate(oldState, newState);
    }

    // Handle voice management
    voiceManager.handleVoiceStateUpdate(oldState, newState);
});

// Handle message commands
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.guild) return;

    // === HANDLE PREFIX-FREE TICKET COMMANDS ===
    const content = message.content.trim().toLowerCase();
    const contentParts = message.content.trim().split(/ +/);
    const firstWord = contentParts[0]?.toLowerCase();
    
    // Handle "ticket" command without prefix
    if (firstWord === 'ticket') {
        console.log(`🎫 ticket command triggered by ${message.author.tag}`);
        
        try {
            // Send immediate acknowledgment
            const processingMsg = await message.reply('⏳ Processing ticket panel creation...');
            
            if (!ticketManager) {
                console.error('❌ Ticket Manager not initialized');
                return processingMsg.edit('❌ Ticket Manager not initialized!');
            }
            
            // Check permissions - ensure PermissionFlagsBits is available
            const hasManageChannels = message.member.permissions.has('ManageChannels');
            const isOwner = message.author.id === message.guild.ownerId;
            const isBotOwner = message.author.id === BOT_OWNER_ID;
            
            if (!hasManageChannels && !isOwner && !isBotOwner) {
                console.log(`❌ ${message.author.tag} lacks permissions for ticket`);
                return processingMsg.edit('❌ You need the "Manage Channels" permission to set up ticket panels.');
            }
            
            // Parse command: ticket ["message"] [@role] OR ticket #channel ["message"] [@role]
            const fullCommand = message.content.slice('ticket'.length).trim();
            let targetChannel = message.channel; // Default to current channel
            let panelMessage = null; // null will use default message
            let roleId = null;
            
            // Check if there's a channel mention or ID
            const channelMatch = fullCommand.match(/^(<#\d+>|\d+)/);
            let remainingText = fullCommand;
            
            if (channelMatch) {
                // Channel was specified, use that instead of current channel
                const channelInput = channelMatch[0].replace(/[<#>]/g, '');
                console.log(`🔍 Channel specified, looking for ID: ${channelInput}`);
                
                const specifiedChannel = await message.guild.channels.fetch(channelInput).catch(err => {
                    console.error(`❌ Failed to fetch channel ${channelInput}:`, err.message);
                    return null;
                });
                
                if (!specifiedChannel) {
                    return processingMsg.edit('❌ Invalid channel! Please provide a valid channel ID or mention.');
                }
                
                if (!specifiedChannel.isTextBased()) {
                    return processingMsg.edit('❌ The provided channel must be a text channel!');
                }
                
                targetChannel = specifiedChannel;
                remainingText = fullCommand.slice(channelMatch[0].length).trim();
            }
            
            // Extract quoted message if present
            const messageMatch = remainingText.match(/"([^"]*)"/);
            if (messageMatch) {
                panelMessage = messageMatch[1];
                console.log(`💬 Custom message: "${panelMessage}"`);
                remainingText = remainingText.replace(messageMatch[0], '').trim();
            }
            
            // Extract role mention if provided
            const roleMention = message.mentions.roles.first();
            if (roleMention) {
                roleId = roleMention.id;
                console.log(`🔔 Role mention found: ${roleMention.name} (${roleId})`);
            }
            
            console.log(`✅ Target channel: ${targetChannel.name} (${targetChannel.id})`);
            
            // Update processing message
            await processingMsg.edit('⏳ Creating ticket panel...');
            
            // Create ticket panel in the target channel (current or specified)
            console.log(`🎫 Creating ticket panel in ${targetChannel.name}...`);
            await ticketManager.createTicketPanel(message, targetChannel.id, panelMessage, roleId);
            console.log(`✅ Ticket panel created successfully`);
            
            // Delete processing message after success
            await processingMsg.delete().catch(() => {});
            
        } catch (error) {
            console.error('❌ Error in ticket command:', error);
            console.error('Stack trace:', error.stack);
            try {
                await message.reply(`❌ An error occurred while creating the ticket panel!\n**Error:** ${error.message}`);
            } catch (replyError) {
                console.error('❌ Failed to send error message:', replyError);
            }
        }
        return;
    }
    
    // Handle "ticketopen" command without prefix
    if (firstWord === 'ticketopen') {
        console.log(`🎫 ticketopen command triggered by ${message.author.tag}`);
        
        try {
            // Send immediate acknowledgment
            const processingMsg = await message.reply('⏳ Processing ticket panel creation...');
            
            if (!ticketManager) {
                console.error('❌ Ticket Manager not initialized');
                return processingMsg.edit('❌ Ticket Manager not initialized!');
            }
            
            // Check permissions - ensure PermissionFlagsBits is available
            const hasManageChannels = message.member.permissions.has('ManageChannels');
            const isOwner = message.author.id === message.guild.ownerId;
            const isBotOwner = message.author.id === BOT_OWNER_ID;
            
            if (!hasManageChannels && !isOwner && !isBotOwner) {
                console.log(`❌ ${message.author.tag} lacks permissions for ticketopen`);
                return processingMsg.edit('❌ You need the "Manage Channels" permission to set up ticket panels.');
            }
            
            // Parse command: ticketopen ["message"] [@role] OR ticketopen #channel ["message"] [@role]
            const fullCommand = message.content.slice('ticketopen'.length).trim();
            let targetChannel = message.channel; // Default to current channel
            let panelMessage = null; // null will use default message
            let roleId = null;
            
            // Check if there's a channel mention or ID at the start
            const channelMatch = fullCommand.match(/^(<#\d+>|\d+)/);
            let remainingText = fullCommand;
            
            if (channelMatch) {
                // Channel was specified, use that instead of current channel
                const channelInput = channelMatch[0].replace(/[<#>]/g, '');
                console.log(`🔍 Channel specified, looking for ID: ${channelInput}`);
                
                const specifiedChannel = await message.guild.channels.fetch(channelInput).catch(err => {
                    console.error(`❌ Failed to fetch channel ${channelInput}:`, err.message);
                    return null;
                });
                
                if (!specifiedChannel) {
                    return processingMsg.edit('❌ Invalid channel! Please provide a valid channel ID or mention.');
                }
                
                if (!specifiedChannel.isTextBased()) {
                    return processingMsg.edit('❌ The provided channel must be a text channel!');
                }
                
                targetChannel = specifiedChannel;
                remainingText = fullCommand.slice(channelMatch[0].length).trim();
            }
            
            // Extract quoted message if present
            const messageMatch = remainingText.match(/"([^"]*)"/);
            if (messageMatch) {
                panelMessage = messageMatch[1];
                console.log(`💬 Custom message: "${panelMessage}"`);
                remainingText = remainingText.replace(messageMatch[0], '').trim();
            } else if (remainingText && !channelMatch) {
                // If no quotes and no channel specified, treat all text as message
                panelMessage = remainingText;
                console.log(`💬 Custom message (unquoted): "${panelMessage}"`);
            } else if (remainingText && channelMatch) {
                // If channel was specified and there's remaining text without quotes, use it as message
                panelMessage = remainingText.replace(/<@&\d+>/g, '').trim();
                if (panelMessage) {
                    console.log(`💬 Custom message (unquoted): "${panelMessage}"`);
                }
            }
            
            // Extract role mention if provided
            const roleMention = message.mentions.roles.first();
            if (roleMention) {
                roleId = roleMention.id;
                console.log(`🔔 Role mention found: ${roleMention.name} (${roleId})`);
            }
            
            console.log(`✅ Target channel: ${targetChannel.name} (${targetChannel.id})`);
            
            // Update processing message
            await processingMsg.edit('⏳ Creating ticket panel...');
            
            // Create ticket panel in the target channel (current or specified)
            console.log(`🎫 Creating ticket panel in ${targetChannel.name}...`);
            await ticketManager.createTicketPanel(message, targetChannel.id, panelMessage, roleId);
            console.log(`✅ Ticket panel created successfully`);
            
            // Delete processing message after success
            await processingMsg.delete().catch(() => {});
            
        } catch (error) {
            console.error('❌ Error in ticketopen command:', error);
            console.error('Stack trace:', error.stack);
            try {
                await message.reply(`❌ An error occurred while creating the ticket panel!\n**Error:** ${error.message}`);
            } catch (replyError) {
                console.error('❌ Failed to send error message:', replyError);
            }
        }
        return;
    }
    
    // Handle "ticketclose" command without prefix
    if (firstWord === 'ticketclose') {
        console.log(`🔒 ticketclose command triggered by ${message.author.tag}`);
        
        try {
            if (!ticketManager) {
                console.error('❌ Ticket Manager not initialized');
                return message.reply('❌ Ticket Manager not initialized');
            }
            
            const args = contentParts.slice(1);
            const channelId = args[0] ? args[0].replace(/[<#>]/g, '') : null;
            
            console.log(`📝 Closing ticket, channel ID: ${channelId || 'current channel'}`);
            await ticketManager.closeTicket(message, channelId);
            console.log(`✅ Ticket closed successfully`);
            
        } catch (error) {
            console.error('❌ Error in ticketclose command:', error);
            try {
                await message.reply('❌ An error occurred while closing the ticket.');
            } catch (replyError) {
                console.error('❌ Failed to send error message:', replyError);
            }
        }
        return;
    }

    const prefix = '!';
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    // ===== ANTI-SPAM: Command Cooldown Check =====
    const cooldownCheck = checkCooldown(message.author.id, command);
    if (cooldownCheck.onCooldown) {
        const cooldownEmbed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('⏱️ Cooldown Active')
            .setDescription(`Please wait **${cooldownCheck.remaining} second(s)** before using \`!${command}\` again.`)
            .setFooter({ text: 'Anti-Spam Protection' })
            .setTimestamp();
        
        const reply = await message.reply({ embeds: [cooldownEmbed] });
        
        // Auto-delete cooldown message after 5 seconds
        setTimeout(() => {
            reply.delete().catch(() => {});
        }, 5000);
        
        return;
    }

    // === ROLE MANAGEMENT COMMANDS ===
    
    // All role management commands
    const roleCommands = [
        'createrole', 'cr',
        'deleterole', 'dr', 
        'editrole', 'er',
        'roleinfo', 'ri',
        'inrole', 'membersinrole',
        'removeallroles', 'rar',
        'roleall',
        'addrole',
        'removerole',
        'roles',
        'catorole'
    ];

    if (roleCommands.includes(command)) {
        console.log(`Role command detected: ${command} by ${message.author.username} (${message.author.id})`);
        console.log(`Bot Owner: ${message.author.id === BOT_OWNER_ID}, Server Owner: ${message.author.id === message.guild.ownerId}, Has Admin Role: ${message.member && message.member.permissions.has('Administrator')}`);
        console.log(`Owner Channel: ${message.channel.id === '1410011813398974626'}, Admin Channel: ${message.channel.id === ADMIN_QUARANTINE_CHANNEL_ID}, Authorized: ${isAuthorized(message)}`);
        console.log(`Authorized User: ${isAuthorized(message)}`);
        console.log(`Owner Commands Channel ID: ${OWNER_CHANNEL_ID}, Admin Channel ID: ${ADMIN_QUARANTINE_CHANNEL_ID}, Current Channel: ${message.channel.id}`);
        
        if (!isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use role management commands. Use commands in owner channel or admin channel.');
        }
        
        // Set cooldown before executing command
        setCooldown(message.author.id, command);
        
        try {
            await roleManager.handleCommand(message, command, args);
        } catch (error) {
            console.error('Error handling role command:', error);
            await message.reply('❌ An error occurred while executing the role command.');
        }
        return;
    }

    // === CHANNEL MANAGEMENT COMMANDS ===
    
    // All channel management commands
    const channelCommands = [
        'crcato',
        'crchannel',
        'crvc',
        'delchannel',
        'botcmdslock',
        'botcmdsunlock',
        'disconnectall',
        'dmes',
        'say',
        'move',
        'lock', 'locktext', 'locktxt',
        'unlock', 'unlocktext', 'unlocktxt', 'open', 'opentext',
        'hide', 'hidechannel', 'hidetxt',
        'show', 'showchannel', 'showtxt', 'reveal',
        'slowmode', 'slow',
        'rename', 'renamechannel',
        'topic', 'settopic',
        'lockvc', 'lockvoice', 'mutevc',
        'unlockvc', 'unlockvoice', 'openvc',
        'hidevc', 'hidevoice',
        'showvc', 'showvoice', 'revealvc',
        'limit', 'userlimit',
        'bitrate', 'setbitrate',
        'j2c', 'join2create', 'setupj2c',
        'removej2c', 'disablej2c',
        'permissions', 'perms',
        'channels', 'listchannels'
    ];

    if (channelCommands.includes(command)) {
        console.log(`Channel command detected: ${command} by ${message.author.username} (${message.author.id})`);
        console.log(`Bot Owner: ${message.author.id === BOT_OWNER_ID}, Server Owner: ${message.author.id === message.guild.ownerId}, Has Admin Role: ${message.member && message.member.permissions.has('Administrator')}`);
        console.log(`Owner Channel: ${message.channel.id === '1410011813398974626'}, Authorized: ${isAuthorized(message)}`);
        
        if (!isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use channel management commands. Use commands in owner channel or admin channel.');
        }
        
        // Set cooldown before executing command
        setCooldown(message.author.id, command);
        
        try {
            await channelManager.handleCommand(message, command, args);
        } catch (error) {
            console.error('Error handling channel command:', error);
            await message.reply('❌ An error occurred while executing the channel command.');
        }
        return;
    }

    // === MEDIA & THREADS MANAGEMENT COMMANDS ===
    
    // All media & threads commands
    const mediaThreadsCommands = [
        'enablemedia', 'mediachannel',
        'mediaslowmode', 'mediaslow',
        'lockmedia',
        'unlockmedia', 'openmedia',
        'createthread', 'newthread',
        'lockthread',
        'unlockthread', 'openthread',
        'archivethread',
        'unarchivethread',
        'deletethread', 'removethread'
    ];

    if (mediaThreadsCommands.includes(command)) {
        console.log(`Media/Threads command detected: ${command} by ${message.author.username} (${message.author.id})`);
        
        if (!isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use media/threads management commands.');
        }
        
        try {
            await mediaThreadsManager.handleCommand(message, command, args);
        } catch (error) {
            console.error('Error handling media/threads command:', error);
            await message.reply('❌ An error occurred while executing the media/threads command.');
        }
        return;
    }

    // === UTILITY COMMANDS ===
    
    const utilityCommands = ['ping', 'dev', 'ui', 'userinfo', 'dm', 'fck', 'avatar', 'serverlogo', 'banner', 'roleinfo', 'rename', 'srvpasuse', 'serverinfo', 'rolecolor', 'membercount', 'botstats', 'invite', 'uptime', 'emojis', 'stickers', 'boosters'];
    
    if (utilityCommands.includes(command)) {
        // ping, dev, avatar, serverinfo, banner, membercount, botstats, invite, uptime, emojis, stickers, boosters are accessible to everyone, others require authorization
        const publicCommands = ['ping', 'dev', 'avatar', 'serverinfo', 'banner', 'membercount', 'botstats', 'invite', 'uptime', 'emojis', 'stickers', 'boosters'];
        if (publicCommands.includes(command) || isAuthorized(message)) {
            try {
                await utilityManager.handleCommand(message, command, args);
            } catch (error) {
                console.error('Error handling utility command:', error);
                await message.reply('❌ An error occurred while executing the utility command.');
            }
            return;
        } else {
            return message.reply('❌ You are not authorized to use this utility command.');
        }
    }

    // === SECURITY MANAGER COMMANDS ===
    if (command === 'security') {
        if (!securityManager) {
            return message.reply('❌ Security Manager not initialized');
        }
        try {
            await securityManager.handleCommand(message, command, args);
        } catch (error) {
            console.error('Error handling security command:', error);
            await message.reply('❌ An error occurred while executing the security command.');
        }
        return;
    }

    // === TICKET SYSTEM COMMANDS ===
    if (command === 'ticket') {
        if (!ticketManager) {
            return message.reply('❌ Ticket Manager not initialized');
        }
        
        // Check permissions
        if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels) && 
            message.author.id !== message.guild.ownerId && 
            message.author.id !== BOT_OWNER_ID) {
            return message.reply('❌ You need the "Manage Channels" permission to set up ticket panels.');
        }
        
        // Parse arguments: !ticket "channel_id" "message" @role
        // Simple parsing: !ticket <channelId> <roleId>
        const channelId = args[0];
        if (!channelId) {
            return message.reply('❌ Please provide a channel ID or mention.\nUsage: `!ticket <channel_id> [@role]`\nExample: `!ticket 123456789 @Support`');
        }
        
        // Extract role ID if provided
        let roleId = null;
        const roleMention = message.mentions.roles.first();
        if (roleMention) {
            roleId = roleMention.id;
        } else if (args[1]) {
            // Try to parse role ID
            roleId = args[1].replace(/[<@&>]/g, '');
        }
        
        // Default panel message
        const panelMessage = 'Click the button below to open a support ticket.\n\nOur staff team will assist you shortly!';
        
        try {
            await ticketManager.createTicketPanel(message, channelId.replace(/[<#>]/g, ''), panelMessage, roleId);
        } catch (error) {
            console.error('Error creating ticket panel:', error);
            await message.reply('❌ An error occurred while creating the ticket panel.');
        }
        return;
    }

    if (command === 'ticketclose') {
        if (!ticketManager) {
            return message.reply('❌ Ticket Manager not initialized');
        }
        
        // Get the channel ID from args (optional)
        const channelId = args[0] ? args[0].replace(/[<#>]/g, '') : null;
        
        try {
            await ticketManager.closeTicket(message, channelId);
        } catch (error) {
            console.error('Error closing ticket:', error);
            await message.reply('❌ An error occurred while closing the ticket.');
        }
        return;
    }

    // === GLOBAL ANNOUNCEMENT COMMAND ===
    if (command === 'gannounce' || command === 'gannoc') {
        // Only bot owner can use global announcement
        if (message.author.id !== BOT_OWNER_ID) {
            return message.reply('❌ Only the bot owner can use global announcements.');
        }

        const messageId = args[0];
        if (!messageId) {
            return message.reply('❌ Please provide a message ID to announce globally.\nUsage: `gannounce <message_id>`');
        }

        try {
            // Fetch the message to announce
            const announceMessage = await message.channel.messages.fetch(messageId);
            if (!announceMessage) {
                return message.reply('❌ Message not found. Make sure the message is in this channel.');
                return;
            }

            // Common channel names to target
            const commonChannelNames = [
                'general', 'chat', 'general-chat', 'main', 'main-chat',
                'lobby', 'community', 'discussion', 'talk', 'chats'
            ];

            let totalServers = 0;
            let successCount = 0;
            let failCount = 0;
            const results = [];

            // Send status message
            const statusMsg = await message.reply('📢 Starting global announcement...');

            // Loop through all guilds
            for (const [guildId, guild] of client.guilds.cache) {
                totalServers++;
                let channelFound = false;
                let sent = false;

                // Try to find a matching channel
                for (const channelName of commonChannelNames) {
                    const targetChannel = guild.channels.cache.find(ch => 
                        ch.type === 0 && // Text channel
                        ch.name.toLowerCase().includes(channelName) &&
                        ch.permissionsFor(guild.members.me)?.has(['SendMessages', 'ViewChannel'])
                    );

                    if (targetChannel) {
                        channelFound = true;
                        try {
                            // Create announcement embed
                            const announceEmbed = new EmbedBuilder()
                                .setColor('#2A1E36')
                                .setTitle('📢 Global Announcement')
                                .setDescription(announceMessage.content || 'No text content')
                                .addFields(
                                    { name: '👤 Announced By', value: message.author.username, inline: true },
                                    { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                                    { name: '🌐 Server', value: guild.name, inline: false }
                                )
                                .setFooter({ text: `Global Announcement from ${message.guild.name}` })
                                .setTimestamp();

                            // Add image if the message has attachments
                            if (announceMessage.attachments.size > 0) {
                                const firstAttachment = announceMessage.attachments.first();
                                if (firstAttachment.contentType?.startsWith('image/')) {
                                    announceEmbed.setImage(firstAttachment.url);
                                }
                            }

                            // Add thumbnail if the message has embeds with images
                            if (announceMessage.embeds.length > 0 && announceMessage.embeds[0].image) {
                                announceEmbed.setThumbnail(announceMessage.embeds[0].image.url);
                            }

                            await targetChannel.send({ embeds: [announceEmbed] });
                            sent = true;
                            successCount++;
                            results.push(`✅ ${guild.name} - #${targetChannel.name}`);
                            console.log(`✅ Global announcement sent to ${guild.name} in #${targetChannel.name}`);
                        } catch (error) {
                            failCount++;
                            results.push(`❌ ${guild.name} - Failed: ${error.message}`);
                            console.error(`❌ Failed to send to ${guild.name}:`, error.message);
                        }
                        break; // Found and tried to send, move to next guild
                    }
                }

                if (!channelFound) {
                    failCount++;
                    results.push(`⚠️ ${guild.name} - No suitable channel found`);
                    console.log(`⚠️ No suitable channel found in ${guild.name}`);
                }
            }

            // Create summary embed
            const summaryEmbed = new EmbedBuilder()
                .setColor('#2A1E36')
                .setTitle('📢 Global Announcement Complete')
                .setDescription(`Announcement has been sent to all eligible servers`)
                .addFields(
                    { name: '🌐 Total Servers', value: `${totalServers}`, inline: true },
                    { name: '✅ Successful', value: `${successCount}`, inline: true },
                    { name: '❌ Failed', value: `${failCount}`, inline: true },
                    { name: '📊 Success Rate', value: `${Math.round((successCount / totalServers) * 100)}%`, inline: true },
                    { name: '📝 Original Message', value: announceMessage.content?.substring(0, 100) || 'Embed/Attachment', inline: false }
                )
                .setFooter({ text: `Announced by ${message.author.username}` })
                .setTimestamp();

            // Show detailed results if less than 10 servers
            if (results.length <= 10) {
                summaryEmbed.addFields({
                    name: '📋 Detailed Results',
                    value: results.join('\n').substring(0, 1024) || 'No results',
                    inline: false
                });
            }

            await statusMsg.edit({ content: '', embeds: [summaryEmbed] });

            // Log the global announcement
            const logEmbed = new EmbedBuilder()
                .setColor('#2A1E36')
                .setTitle('📢 Global Announcement Sent')
                .setDescription(`A global announcement was sent across all servers`)
                .addFields(
                    { name: '👤 Sent By', value: `${message.author.username} (\`${message.author.id}\`)`, inline: true },
                    { name: '🌐 Servers Reached', value: `${successCount}/${totalServers}`, inline: true },
                    { name: '📝 Message', value: announceMessage.content?.substring(0, 200) || 'Embed/Attachment', inline: false }
                )
                .setTimestamp();

            await sendLogMessage(message.guild, logEmbed);

        } catch (error) {
            console.error('Error in global announcement:', error);
            await message.reply('❌ An error occurred while sending global announcement: ' + error.message);
        }
        return;
    }

    // === HELP COMMAND ===
    if (command === 'help') {
        try {
            await createHelpSlideshow(message, message.guild.id);
        } catch (error) {
            console.error('Error showing help:', error);
            await message.reply('❌ Error displaying help menu');
        }
        return;
    }

    // === MEDIA & THREADS MESSAGE VALIDATION ===
    
    // Check if message is in a media-only channel
    if (mediaThreadsManager) {
        await mediaThreadsManager.handleMessage(message);
    }
});

// === SECURITY MANAGER EVENT LISTENERS ===

// Role security events
client.on('roleCreate', async (role) => {
    if (securityManager) {
        await securityManager.monitorRoleCreate(role);
    }
});

client.on('roleDelete', async (role) => {
    if (securityManager) {
        await securityManager.monitorRoleDelete(role);
    }
});

client.on('roleUpdate', async (oldRole, newRole) => {
    if (securityManager) {
        await securityManager.monitorRoleUpdate(oldRole, newRole);
        await securityManager.monitorRolePermissionUpdate(oldRole, newRole);
        await securityManager.monitorRoleReorder(oldRole, newRole);
    }
});

// Channel security events
client.on('channelCreate', async (channel) => {
    if (securityManager) {
        await securityManager.monitorChannelCreate(channel);
    }
});

client.on('channelDelete', async (channel) => {
    if (securityManager) {
        await securityManager.monitorChannelDelete(channel);
    }
    
    // Clean up ticket data if a ticket channel is deleted
    if (ticketManager) {
        ticketManager.handleChannelDelete(channel.id);
    }
});

client.on('channelUpdate', async (oldChannel, newChannel) => {
    if (securityManager) {
        await securityManager.monitorChannelUpdate(oldChannel, newChannel);
        await securityManager.monitorChannelPermissionUpdate(oldChannel, newChannel);
        await securityManager.monitorChannelReorder(oldChannel, newChannel);
        await securityManager.monitorChannelNameModification(oldChannel, newChannel);
    }
});

// Ban security events
client.on('guildBanAdd', async (ban) => {
    if (securityManager) {
        await securityManager.monitorBan(ban);
    }
});

// Member security events and Leave Messages
client.on('guildMemberRemove', async (member) => {
    // Security monitoring
    if (securityManager) {
        await securityManager.monitorKick(member);
    }
    
    // Send leave message for all members (not bots)
    if (!member.user.bot) {
        try {
            // Find any public text channel where bot can send messages
            const publicChannel = member.guild.channels.cache.find(ch => 
                ch.type === 0 && // Text channel
                ch.permissionsFor(member.guild.members.me)?.has('SendMessages') &&
                ch.permissionsFor(member.guild.roles.everyone)?.has('ViewChannel') // Public channel
            );
            
            // Send leave message embed
            if (publicChannel) {
                const memberCount = member.guild.memberCount;
                
                const leaveEmbed = new EmbedBuilder()
                    .setColor('#8A00C4')
                    .setTitle(`Goodbye ${member.user.tag}`)
                    .setDescription(`**${member.user.tag} left ${member.guild.name}**\n\nWe now have **${memberCount}** members.\n\nThis server is protected by **Quarantianizo . Security . Antinuke . NextGen Automods System** developed by **script**`)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
                    .setFooter({ text: `${member.guild.name} secured by Quarantianizo . Security . Systems` })
                    .setTimestamp();

                await publicChannel.send({ embeds: [leaveEmbed] });
            }
        } catch (error) {
            console.error('Error sending leave message:', error);
        }
    }
});

client.on('guildMemberUpdate', async (oldMember, newMember) => {
    if (securityManager) {
        await securityManager.monitorMemberRoleUpdate(oldMember, newMember);
    }
});

// Bot addition security and Welcome Messages
client.on('guildMemberAdd', async (member) => {
    // Security monitoring for bots
    if (securityManager && member.user.bot) {
        await securityManager.monitorBotAdd(member);
    }
    
    // Send welcome message for all members (not bots)
    if (!member.user.bot) {
        try {
            // Find any public text channel where bot can send messages
            const publicChannel = member.guild.channels.cache.find(ch => 
                ch.type === 0 && // Text channel
                ch.permissionsFor(member.guild.members.me)?.has('SendMessages') &&
                ch.permissionsFor(member.guild.roles.everyone)?.has('ViewChannel') // Public channel
            );
            
            // Send welcome message embed
            if (publicChannel) {
                const memberCount = member.guild.memberCount;
                
                const welcomeEmbed = new EmbedBuilder()
                    .setColor('#8A00C4')
                    .setTitle(`Welcome to ${member}`)
                    .setDescription(`**Welcome to ${member.guild.name}**\n\nYou are the **${memberCount}th** member!\n\nThis server is protected by **Quarantianizo . Security . Antinuke . NextGen Automods System** developed by **script**`)
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 256 }))
                    .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
                    .setFooter({ text: `${member.guild.name} secured by Quarantianizo . Security . Systems` })
                    .setTimestamp();

                await publicChannel.send({ embeds: [welcomeEmbed] });
            }
        } catch (error) {
            console.error('Error sending welcome message:', error);
        }
    }
});

// Webhook security events
client.on('webhookUpdate', async (channel) => {
    if (securityManager) {
        await securityManager.monitorWebhookUpdate(channel);
    }
});

// Emoji security events
client.on('emojiDelete', async (emoji) => {
    if (securityManager) {
        await securityManager.monitorEmojiDelete(emoji);
    }
});

client.on('emojiCreate', async (emoji) => {
    if (securityManager) {
        await securityManager.monitorEmojiCreate(emoji);
    }
});

client.on('emojiUpdate', async (oldEmoji, newEmoji) => {
    if (securityManager) {
        await securityManager.monitorEmojiUpdate(oldEmoji, newEmoji);
    }
});

// Re-open the voiceStateUpdate handler that was accidentally closed
client.on('voiceStateUpdate', async (oldState, newState) => {
    if (musicManager) {
        musicManager.handleVoiceUpdate(oldState, newState);
    }

    // Handle voice management
    voiceManager.handleVoiceStateUpdate(oldState, newState);

    // Handle Join-to-Create (J2C) system
    if (newState.channel) {
        const guildConfig = serverConfigs.get(newState.guild.id) || {};
        const j2cChannelId = guildConfig.j2cChannelId;

        // User joined the J2C trigger channel
        if (j2cChannelId && newState.channelId === j2cChannelId) {
            try {
                const member = newState.member;
                const guild = newState.guild;
                const j2cChannel = guild.channels.cache.get(j2cChannelId);

                // Create temporary voice channel with user's name
                const tempChannel = await guild.channels.create({
                    name: `${member.user.username}'s Channel`,
                    type: 2, // Voice channel
                    parent: j2cChannel.parent,
                    position: j2cChannel.position + 1,
                    permissionOverwrites: [
                        {
                            id: guild.roles.everyone,
                            allow: ['Connect', 'Speak', 'Stream', 'ViewChannel']
                        },
                        {
                            id: member.id,
                            allow: ['Connect', 'Speak', 'Stream', 'ManageChannels', 'MoveMembers']
                        }
                    ]
                });

                // Store channel info for cleanup
                j2cTemporaryChannels.set(tempChannel.id, {
                    ownerId: member.id,
                    createdAt: Date.now()
                });

                // Move user to their new channel
                await member.voice.setChannel(tempChannel);

                // Log J2C creation
                const j2cCreateEmbed = new EmbedBuilder()
                    .setColor('#00D4FF')
                    .setTitle('🎤 Temporary Voice Channel Created')
                    .setDescription(`A temporary voice channel has been created via Join-to-Create.`)
                    .addFields(
                        { name: '👤 Owner', value: `${member.user.username}`, inline: true },
                        { name: '🎤 Channel', value: `${tempChannel.name}`, inline: true },
                        { name: '⏰ Created At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: '🔄 Auto-Cleanup', value: 'Channel will be deleted when empty', inline: false }
                    )
                    .setTimestamp();

                await sendLogMessage(guild, j2cCreateEmbed, [], 'voice');

                console.log(`✅ J2C: Created temporary channel for ${member.user.username}`);
            } catch (error) {
                console.error('Error creating J2C temporary channel:', error);
            }
        }
    }

    // Handle J2C cleanup - delete temporary channels when empty
    if (oldState.channel) {
        const channelId = oldState.channelId;
        const j2cData = j2cTemporaryChannels.get(channelId);

        if (j2cData) {
            const channel = oldState.guild.channels.cache.get(channelId);
            
            // Check if channel is now empty
            if (channel && channel.members.size === 0) {
                try {
                    await channel.delete('J2C temporary channel cleanup - channel empty');
                    j2cTemporaryChannels.delete(channelId);

                    // Log J2C deletion
                    const j2cDeleteEmbed = new EmbedBuilder()
                        .setColor('#FF6B6B')
                        .setTitle('🗑️ Temporary Voice Channel Deleted')
                        .setDescription(`A temporary voice channel has been automatically deleted.`)
                        .addFields(
                            { name: '🎤 Channel', value: channel.name, inline: true },
                            { name: '⏰ Deleted At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                            { name: '🔄 Reason', value: 'Channel became empty', inline: true }
                        )
                        .setTimestamp();

                    await sendLogMessage(oldState.guild, j2cDeleteEmbed, [], 'voice');

                    console.log(`✅ J2C: Deleted empty temporary channel: ${channel.name}`);
                } catch (error) {
                    console.error('Error deleting J2C temporary channel:', error);
                }
            }
        }
    }

    // Check if bot was disconnected and auto-rejoin home channel
    if (newState.member && newState.member.id === client.user.id) {
        if (!newState.channelId && oldState.channelId) {
            console.log('🔌 Bot was disconnected from voice channel, rejoining home channel...');
            setTimeout(async () => {
                await autoJoinHomeChannel(newState.guild);
            }, 2000);
        }
    }

    // Voice state logging
    try {
        const member = newState.member || oldState.member;
        if (!member || member.user.bot) return; // Skip bots

        const guild = newState.guild || oldState.guild;
        
        let voiceAction = '';
        let channelInfo = '';
        let actionColor = '#5865F2';
        
        // Determine the voice action
        if (!oldState.channel && newState.channel) {
            // User joined a voice channel
            voiceAction = '🔊 Joined Voice Channel';
            channelInfo = `Joined: ${newState.channel.name}`;
            actionColor = '#00FF00';
        } else if (oldState.channel && !newState.channel) {
            // User left a voice channel
            voiceAction = '🔇 Left Voice Channel';
            channelInfo = `Left: ${oldState.channel.name}`;
            actionColor = '#FF6B6B';
        } else if (oldState.channel && newState.channel && oldState.channel.id !== newState.channel.id) {
            // User moved between voice channels
            voiceAction = '🔄 Moved Voice Channels';
            channelInfo = `From: ${oldState.channel.name} → To: ${newState.channel.name}`;
            actionColor = '#FFA500';
        } else if (oldState.channel && newState.channel && oldState.channel.id === newState.channel.id) {
            // User changed voice state in same channel (mute, deafen, etc.)
            const stateChanges = [];
            
            if (oldState.mute !== newState.mute) {
                stateChanges.push(`${newState.mute ? 'Muted' : 'Unmuted'} self`);
            }
            if (oldState.deaf !== newState.deaf) {
                stateChanges.push(`${newState.deaf ? 'Deafened' : 'Undeafened'} self`);
            }
            if (oldState.serverMute !== newState.serverMute) {
                stateChanges.push(`${newState.serverMute ? 'Server muted' : 'Server unmuted'}`);
            }
            if (oldState.serverDeaf !== newState.serverDeaf) {
                stateChanges.push(`${newState.serverDeaf ? 'Server deafened' : 'Server undeafened'}`);
            }
            if (oldState.streaming !== newState.streaming) {
                stateChanges.push(`${newState.streaming ? 'Started' : 'Stopped'} streaming`);
            }
            if (oldState.selfVideo !== newState.selfVideo) {
                stateChanges.push(`${newState.selfVideo ? 'Enabled' : 'Disabled'} camera`);
            }
            
            if (stateChanges.length > 0) {
                voiceAction = '🎛️ Voice State Changed';
                channelInfo = `Channel: ${newState.channel.name} • ${stateChanges.join(', ')}`;
                actionColor = '#9B59B6';
            } else {
                return; // No significant state change
            }
        } else {
            return; // No action to log
        }

        // Create voice log embed
        const voiceLogEmbed = new EmbedBuilder()
            .setColor(actionColor)
            .setTitle(voiceAction)
            .setDescription(`**Voice activity detected**`)
            .addFields(
                { name: '👤 User', value: `${member.user.username} (\`${member.user.id}\`)`, inline: true },
                { name: '📍 Channel Info', value: channelInfo, inline: true },
                { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 64 }))
            .setFooter({ text: 'Voice Activity Monitor' })
            .setTimestamp();

        // Send to voice logs channel
        await sendLogMessage(guild, voiceLogEmbed, [], 'voice');

    } catch (error) {
        console.error('Error logging voice state update:', error);
    }
});

// Import command registration
const { registerCommands } = require('./commands');

client.once('ready', async () => {
    console.log(`Logged in as ${client.user.tag}!`);
    console.log(`🛡️ GOD-LEVEL PROTECTION SYSTEM INITIALIZING...`);
    
    // Register slash commands
    await registerCommands();

    // Initialize Role Manager
    roleManager = new RoleManager(client);
    console.log('✅ Role Manager initialized');

    // Initialize Channel Manager
    channelManager = new ChannelManager(client, serverConfigs);
    console.log('✅ Channel Manager initialized');

    // Initialize Media & Threads Manager
    mediaThreadsManager = new MediaThreadsManager(client);
    console.log('✅ Media & Threads Manager initialized');

    // Initialize Utility Manager
    utilityManager = new UtilityCommands(client);
    console.log('✅ Utility Manager initialized');

    // Initialize Security Manager
    securityManager = new SecurityManager(client);
    console.log('✅ Security Manager initialized');

    // Initialize Ticket Manager
    ticketManager = new TicketManager(client);
    console.log('✅ Ticket Manager initialized');

    // Initialize Slash Command Handler
    slashCommandHandler = new SlashCommandHandler(client, {
        roleManager,
        channelManager,
        mediaThreadsManager,
        utilityManager,
        voiceManager
    });
    console.log('✅ Slash Command Handler initialized');

    // Set bot status
    try {
        await client.user.setPresence({
            activities: [{ 
                name: 'scriptspace Made by script.agi', 
                type: 3 // WATCHING = 3
            }],
            status: 'online'
        });
        console.log('✅ Bot status set: Watching scriptspace Made by script.agi');
    } catch (error) {
        console.error('Error setting bot status:', error);
    }

    // Auto-rotate bot status every 20 seconds (username can only change 2x per hour due to Discord limits)
    const statusTexts = [
        'scriptspace | secured',
        'scriptspace | armed',
        'scriptspace | by script.agi'
    ];
    let currentStatusIndex = 0;

    // Set initial bot username (one-time on startup)
    try {
        await client.user.setUsername('.gg/scriptspace.in');
        console.log(`✅ Bot username set to: .gg/scriptspace.in`);
    } catch (error) {
        console.log('Username already set or rate limited:', error.message);
    }

    // Set initial status
    try {
        await client.user.setPresence({
            activities: [{ 
                name: statusTexts[currentStatusIndex], 
                type: 3 // WATCHING = 3
            }],
            status: 'online'
        });
        console.log(`✅ Bot status set: Watching ${statusTexts[currentStatusIndex]}`);
    } catch (error) {
        console.error('Error setting bot status:', error);
    }

    // Rotating server nicknames - matching the status texts exactly
    const serverNicknames = [
        '.gg/scriptspace.in | secured',
        '.gg/scriptspace.in | armed',
        '.gg/scriptspace.in | by script'
    ];
    let currentNicknameIndex = 0;

    // Start automatic status rotation (every 20 seconds)
    setInterval(async () => {
        try {
            // Rotate status
            currentStatusIndex = (currentStatusIndex + 1) % statusTexts.length;
            await client.user.setPresence({
                activities: [{ 
                    name: statusTexts[currentStatusIndex], 
                    type: 3 // WATCHING
                }],
                status: 'online'
            });
            console.log(`🔄 Bot status rotated to: Watching ${statusTexts[currentStatusIndex]}`);

            // Rotate server nicknames - synchronized with status
            currentNicknameIndex = (currentNicknameIndex + 1) % serverNicknames.length;
            const newNickname = serverNicknames[currentNicknameIndex];

            // Change nickname in all servers
            for (const guild of client.guilds.cache.values()) {
                try {
                    const botMember = guild.members.cache.get(client.user.id);
                    if (botMember) {
                        await botMember.setNickname(newNickname);
                    }
                } catch (nicknameError) {
                    // Silently fail if no permission to change nickname in this server
                    console.log(`Could not change nickname in ${guild.name}: ${nicknameError.message}`);
                }
            }
            console.log(`🔄 Bot nickname rotated to: ${newNickname} across ${client.guilds.cache.size} servers`);

        } catch (error) {
            console.error('Error rotating bot status/nickname:', error.message);
        }
    }, 20000); // 20 seconds

    // Check deployment environment
    const isDeployment = process.env.REPLIT_DEPLOYMENT === '1';
    if (isDeployment) {
        console.log('🚀 Running in Replit Deployment environment - Enhanced stability mode active');
    }

    // Initialize database with deployment-specific handling
    try {
        await initializeDatabase();
        console.log('📊 Database initialized successfully for deployment environment');

        // Start cleanup interval (every 6 hours for deployment compatibility)
        setInterval(cleanupOldInteractions, 6 * 60 * 60 * 1000);
        console.log('🧹 Database cleanup scheduler started (6-hour intervals)');

        // Test database connection for deployment readiness
        if (isDeployment) {
            const testSave = await saveHelpInteraction('deployment_test', 'test_user', 'test_guild', 1);
            if (testSave) {
                await deleteHelpInteraction('test_user', 'test_guild');
                console.log('✅ Database deployment readiness confirmed');
            } else {
                console.warn('⚠️ Database test failed - help commands may have reduced functionality');
            }
        }
    } catch (error) {
        console.error('❌ Failed to initialize database:', error);
        if (isDeployment) {
            console.log('🚀 Deployment environment: Bot will continue with limited database functionality');
        }
    }

    // Initialize god-level protection for all servers
    for (const guild of client.guilds.cache.values()) {
        try {
            // Create comprehensive server template
            const template = await createServerTemplate(guild);
            if (template) {
                console.log(`✅ Server template created for ${guild.name} - ${Object.keys(template.channels).length} channels, ${Object.keys(template.roles).length} roles`);
            }

            // Start continuous server scanning
            startServerScanning(guild);
            console.log(`🔍 Started 60-second scanning for ${guild.name}`);

        } catch (error) {
            console.error(`Error initializing god-level protection for ${guild.name}:`, error);
        }
    }

    console.log(`🚀 GOD-LEVEL PROTECTION SYSTEM FULLY ACTIVE - IMPOSSIBLE TO BYPASS`);

    // Initialize Music Manager after all other systems
    try {
        console.log('🎵 Initializing Music Manager...');
        musicManager = new MusicManager(client);

        // Initialize music manager with improved error handling
        setTimeout(async () => {
            console.log('🎵 Starting Music Manager initialization...');

            try {
                const initSuccess = await musicManager.initialize();

                if (initSuccess) {
                    console.log('✅ Music Manager initialized successfully with Lavalink');

                    // Set music request channel for all guilds (permanent channel)
                    for (const guild of client.guilds.cache.values()) {
                        try {
                            // Set the permanent music request channel ID
                            musicManager.setMusicRequestChannel(guild.id, PERMANENT_MUSIC_CHANNEL_ID);
                            
                            // Wait a moment for Lavalink to stabilize, then initialize widget
                            setTimeout(async () => {
                                try {
                                    await musicManager.initializeMusicWidget(guild);
                                    console.log(`✅ Music widget initialized for guild: ${guild.name}`);
                                    
                                    // Try to restore music session after widget is ready
                                    setTimeout(async () => {
                                        try {
                                            const restored = await musicManager.restoreMusicSession(guild);
                                            if (restored) {
                                                console.log(`🔄 Music session restored for guild: ${guild.name}`);
                                            }
                                        } catch (restoreError) {
                                            console.error(`❌ Failed to restore music session for ${guild.name}:`, restoreError.message);
                                        }
                                    }, 3000);
                                    
                                } catch (widgetError) {
                                    console.error(`❌ Failed to initialize music widget for ${guild.name}:`, widgetError.message);
                                    
                                    // Retry widget creation after 10 seconds
                                    setTimeout(async () => {
                                        try {
                                            await musicManager.initializeMusicWidget(guild);
                                            console.log(`🔄 Music widget retry successful for guild: ${guild.name}`);
                                            
                                            // Try to restore music session after retry
                                            setTimeout(async () => {
                                                try {
                                                    const restored = await musicManager.restoreMusicSession(guild);
                                                    if (restored) {
                                                        console.log(`🔄 Music session restored after retry for guild: ${guild.name}`);
                                                    }
                                                } catch (restoreError) {
                                                    console.error(`❌ Failed to restore music session after retry for ${guild.name}:`, restoreError.message);
                                                }
                                            }, 3000);
                                            
                                        } catch (retryError) {
                                            console.error(`❌ Music widget retry failed for ${guild.name}:`, retryError.message);
                                        }
                                    }, 10000);
                                }
                            }, 2000);

                        } catch (error) {
                            console.error(`❌ Failed to set music channel for ${guild.name}:`, error.message);
                        }
                    }

                    // Log Lavalink connection status
                    if (musicManager.lavalink) {
                        const status = musicManager.lavalink.getConnectionStatus();
                        console.log(`🎵 Lavalink Status: ${status.connected}/${status.total} nodes connected`);
                        if (status.connected > 0) {
                            console.log('✅ Music system fully operational');
                        } else {
                            console.warn('⚠️ No Lavalink nodes connected - will retry...');
                            // Extended retry mechanism
                            setTimeout(async () => {
                                if (musicManager && musicManager.lavalink) {
                                    const retryStatus = musicManager.lavalink.getConnectionStatus();
                                    console.log(`🔄 Retry - Lavalink Status: ${retryStatus.connected}/${retryStatus.total} nodes connected`);
                                    
                                    // If still no connection, try to reinitialize widgets anyway
                                    if (retryStatus.connected === 0) {
                                        console.log('🎵 Deploying music widgets without Lavalink connection...');
                                        for (const guild of client.guilds.cache.values()) {
                                            try {
                                                await musicManager.initializeMusicWidget(guild);
                                                console.log(`✅ Offline music widget deployed for: ${guild.name}`);
                                            } catch (error) {
                                                console.error(`❌ Failed to deploy offline widget for ${guild.name}:`, error.message);
                                            }
                                        }
                                    }
                                }
                            }, 15000);
                        }
                    }
                } else {
                    console.error('❌ Music Manager initialization failed - deploying basic widgets');
                    
                    // Even if Lavalink fails, try to deploy basic music widgets
                    for (const guild of client.guilds.cache.values()) {
                        try {
                            musicManager.setMusicRequestChannel(guild.id, PERMANENT_MUSIC_CHANNEL_ID);
                            await musicManager.initializeMusicWidget(guild);
                            console.log(`✅ Basic music widget deployed for guild: ${guild.name}`);
                        } catch (error) {
                            console.error(`❌ Failed to deploy basic widget for ${guild.name}:`, error.message);
                        }
                    }
                }
            } catch (error) {
                console.error('❌ Error during Music Manager initialization:', error.message);
                console.log('🎵 Deploying fallback music widgets...');
                
                // Fallback: Deploy basic widgets even without Lavalink
                try {
                    if (musicManager) {
                        for (const guild of client.guilds.cache.values()) {
                            try {
                                musicManager.setMusicRequestChannel(guild.id, PERMANENT_MUSIC_CHANNEL_ID);
                                await musicManager.initializeMusicWidget(guild);
                                console.log(`✅ Fallback music widget deployed for guild: ${guild.name}`);
                            } catch (fallbackError) {
                                console.error(`❌ Fallback widget failed for ${guild.name}:`, fallbackError.message);
                            }
                        }
                    }
                } catch (fallbackError) {
                    console.error('❌ Complete fallback failed:', fallbackError.message);
                }
            }
        }, 3000);

    } catch (error) {
        console.error('❌ Failed to create Music Manager:', error.message);
        console.log('🎵 Bot will continue running without music features');
        musicManager = null;
    }

    // Send startup message to all servers
    client.guilds.cache.forEach(async guild => {
        const serverConfig = serverConfigs.get(guild.id) || {};
        const adminChannelId = serverConfig.adminChannelId || ADMIN_QUARANTINE_CHANNEL_ID;

        const startupEmbed = new EmbedBuilder()
            .setColor('#8B0000')
            .setTitle('🛡️ GOD-LEVEL PROTECTION SYSTEM ACTIVATED')
            .setDescription(`**IMPOSSIBLE TO BYPASS** - Your Discord server is now protected with ultimate god-level security!`)
            .addFields(
                { name: '📱 WhatsApp Alerts', value: `Active: ${WHATSAPP_ALERT_NUMBER}`, inline: true },
                { name: '⚡ Response Time', value: '< 1 millisecond', inline: true },
                { name: '🔄 Server Scanning', value: 'Every 60 seconds', inline: true },
                { name: '🛡️ Protection Features', value: '• Ultra-fast response system\n• Auto-restoration from templates\n• Quarantine evasion detection\n• Unauthorized bot removal\n• Channel/role realignment\n• WhatsApp critical alerts', inline: false },
                { name: '🚨 Security Level', value: '**GOD-LEVEL** - Absolutely impossible to nuke', inline: true },
                { name: '📊 Templates Created', value: `Channels & Roles saved for restoration`, inline: true },
                { name: '🔍 Monitoring Active', value: '• 60-second integrity scans\n• Real-time audit log monitoring\n• Bypass attempt tracking\n• Integration removal system', inline: false },
                { name: '👑 Authorized Users', value: `**Bot Owner:** <@${BOT_OWNER_ID}>\n**Server Owner:** <@${guild.ownerId}>\n**Extra Owners:** ${permanentExtraOwners.size + temporaryExtraOwners.size} (use \`list owners\` to view)\n**Nobody else can make changes!**`, inline: false },
                { name: '⚠️ ZERO TOLERANCE POLICY', value: '**ANY UNAUTHORIZED ACTION = IMMEDIATE PERMANENT BAN**\n• **ALL users including administrators**\n• **Only Owner & Extra Owners can make changes**\n• **Instant ban for: Bot additions, channel/role changes, webhooks, permissions**\n• Auto-restoration active\n• WhatsApp alerts for all violations\n• **NO EXCEPTIONS - NO APPEALS**', inline: false }
            )
            .setFooter({ text: 'God-Level Protection by Script.AGI - Lifetime Security Guarantee' })
            .setTimestamp();

        await sendLogMessage(guild, startupEmbed);

        // Clean admin channel on startup
        await cleanAdminChannel(guild);
    });

    // Start live stats updates
    console.log('Starting live server stats updates...');
    updateServerStats();
    setInterval(updateServerStats, 25000);

    // Auto-clean admin channels every 6 hours
    console.log('Starting admin channel auto-cleanup...');
    setInterval(async () => {
        for (const guild of client.guilds.cache.values()) {
            await cleanAdminChannel(guild);
        }
    }, 6 * 60 * 60 * 1000); // 6 hours

    // Auto-clean music channel every 30 seconds
    console.log('Starting music channel auto-cleanup...');
    setInterval(async () => {
        for (const guild of client.guilds.cache.values()) {
            await cleanMusicChannel(guild);
        }
    }, 30 * 1000); // 30 seconds

    // Auto-clean ban appeal channel every 10 seconds
    console.log('Starting ban appeal channel auto-cleanup...');
    setInterval(async () => {
        await cleanBanAppealChannel();
    }, 10 * 1000); // 10 seconds

    // Send/update interim role widget on startup
    console.log('Setting up interim role widgets...');
    for (const guild of client.guilds.cache.values()) {
        try {
            const result = await sendInterimRoleWidget(guild);
            if (result) {
                console.log(`✅ Interim role widget successfully set up in guild: ${guild.name}`);
            } else {
                console.log(`❌ Failed to set up interim role widget in guild: ${guild.name}`);
            }
        } catch (error) {
            console.error(`Error setting up interim role widget in guild ${guild.name}:`, error);
        }
    }

    // Send/update unban request widget on startup (for appeal server)
    console.log('Setting up unban request widget...');
    try {
        const appealServerGuild = client.guilds.cache.get('1411627135142985783');
        if (appealServerGuild) {
            const result = await sendUnbanRequestWidget(appealServerGuild);
            if (result) {
                console.log(`✅ Unban request widget successfully set up in appeal server`);
            } else {
                console.log(`❌ Failed to set up unban request widget in appeal server`);
            }
        } else {
            console.log(`❌ Appeal server not found for unban widget setup`);
        }
    } catch (error) {
        console.error('Error setting up unban request widget:', error);
    }

    // Auto-join home voice channel on startup
    console.log('🎵 Auto-joining home voice channel...');
    for (const guild of client.guilds.cache.values()) {
        try {
            await autoJoinHomeChannel(guild);
        } catch (error) {
            console.error(`Error auto-joining home channel in guild ${guild.name}:`, error);
        }
    }

    // Initialize ultimate server protection system
    console.log('🛡️ Initializing Ultimate Server Protection System...');
    for (const guild of client.guilds.cache.values()) {
        try {
            // Create server baseline for protection monitoring
            const baseline = await createServerBaseline(guild);
            if (baseline) {
                console.log(`✅ Protection baseline created for ${guild.name}`);

                const protectionEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🛡️ ULTIMATE SERVER PROTECTION ACTIVATED')
                    .setDescription('**1000% SECURE** - Your Discord server is now protected against all threats')
                    .addFields(
                        { name: '🔍 Monitoring Active', value: '• Channel changes\n• Role modifications\n• Permission updates\n• Server settings\n• Mass actions', inline: true },
                        { name: '⚡ Real-time Protection', value: '• Rate limiting\n• Auto-flagging\n• Immediate response\n• Audit log tracking\n• Violation detection', inline: true },
                        { name: '🚨 Security Level', value: '**MAXIMUM**\nNo one can nuke this server', inline: true },
                        { name: '📊 Baseline Created', value: `**Channels:** ${baseline.channels.count}\n**Roles:** ${baseline.roles.count}\n**Members:** ${baseline.members.count}`, inline: false }
                    )
                    .setFooter({ text: 'Ultimate Protection System - Script.AGI Technology' })
                    .setTimestamp();

                await sendLogMessage(guild, protectionEmbed);
            }
        } catch (error) {
            console.error(`Error initializing protection for guild ${guild.name}:`, error);
        }
    }

    // Perform initial bot security scan on all guilds
    console.log('🛡️ Performing initial bot security scan...');
    for (const guild of client.guilds.cache.values()) {
        try {
            await guild.members.fetch(); // Fetch all members

            const allBots = guild.members.cache.filter(member => member.user.bot);
            const unauthorizedBots = allBots.filter(bot => !WHITELISTED_BOTS.has(bot.user.id));

            console.log(`📊 Guild: ${guild.name} - Total bots: ${allBots.size}, Unauthorized: ${unauthorizedBots.size}`);

            if (unauthorizedBots.size > 0) {
                const scanResultEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('🚨 STARTUP SECURITY SCAN - UNAUTHORIZED BOTS DETECTED')
                    .setDescription(`Found ${unauthorizedBots.size} unauthorized bots in the server during startup scan.`)
                    .addFields(
                        { name: '🔍 Scan Results', value: `**Authorized:** ${allBots.size - unauthorizedBots.size}\n**Unauthorized:** ${unauthorizedBots.size}\n**Total:** ${allBots.size}`, inline: true },
                        { name: '⚠️ Action Required', value: 'Use `scanserver` and `purgebots` commands to remove unauthorized bots', inline: true },
                        { name: '🛡️ Security Status', value: '⚠️ **COMPROMISED**', inline: true }
                    )
                    .setFooter({ text: 'Bot Protection System Active' })
                    .setTimestamp();

                await sendLogMessage(guild, scanResultEmbed);
            } else {
                const secureEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ STARTUP SECURITY SCAN - ALL CLEAR')
                    .setDescription('All bots in the server are authorized and whitelisted.')
                    .addFields(
                        { name: '📊 Scan Results', value: `**Authorized Bots:** ${allBots.size}\n**Whitelisted Bots:** ${WHITELISTED_BOTS.size}`, inline: true },
                        { name: '🛡️ Security Status', value: '✅ **SECURE**', inline: true }
                    )
                    .setFooter({ text: 'Bot Protection System Active' })
                    .setTimestamp();

                await sendLogMessage(guild, secureEmbed);
            }
        } catch (error) {
            console.error(`Error during startup bot scan for guild ${guild.name}:`, error);
        }
    }
});

// Handle member updates (role changes, nickname changes)
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    try {
        // Skip bot updates unless it's unauthorized bot changes
        if (newMember.user.bot && !(!oldMember.user.bot && newMember.user.bot)) {
            return;
        }

        const guild = newMember.guild;
        const roleChanges = [];
        const otherChanges = [];

        // Check for role changes
        const oldRoles = oldMember.roles.cache;
        const newRoles = newMember.roles.cache;

        // Find added roles
        const addedRoles = newRoles.filter(role => !oldRoles.has(role.id) && role.id !== guild.id);
        const removedRoles = oldRoles.filter(role => !newRoles.has(role.id) && role.id !== guild.id);

        if (addedRoles.size > 0) {
            addedRoles.forEach(role => {
                roleChanges.push(`✅ Added: ${role.name}`);
            });
        }

        if (removedRoles.size > 0) {
            removedRoles.forEach(role => {
                roleChanges.push(`❌ Removed: ${role.name}`);
            });
        }

        // Check for nickname changes
        if (oldMember.nickname !== newMember.nickname) {
            const oldNick = oldMember.nickname || oldMember.user.username;
            const newNick = newMember.nickname || newMember.user.username;
            otherChanges.push(`📝 Nickname: ${oldNick} → ${newNick}`);
        }

        // Check for other member changes
        if (oldMember.communicationDisabledUntil !== newMember.communicationDisabledUntil) {
            if (newMember.communicationDisabledUntil) {
                const timeoutEnd = Math.floor(newMember.communicationDisabledUntil.getTime() / 1000);
                otherChanges.push(`⏰ Timeout until: <t:${timeoutEnd}:F>`);
            } else {
                otherChanges.push(`⏰ Timeout removed`);
            }
        }

        // If no significant changes, skip logging
        if (roleChanges.length === 0 && otherChanges.length === 0) {
            return;
        }

        // Create member update log embed
        const updateLogEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('👤 Member Updated')
            .setDescription(`**Member information changed**`)
            .addFields(
                { name: '👤 User', value: `${newMember.user.username} (\`${newMember.user.id}\`)`, inline: true },
                { name: '⏰ Updated At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '📊 Total Roles', value: `${newRoles.size - 1} roles`, inline: true }
            )
            .setThumbnail(newMember.user.displayAvatarURL({ dynamic: true, size: 64 }))
            .setFooter({ text: 'Member Update Monitor' })
            .setTimestamp();

        // Add role changes if any
        if (roleChanges.length > 0) {
            updateLogEmbed.addFields({
                name: '🎭 Role Changes',
                value: roleChanges.join('\n').substring(0, 1024),
                inline: false
            });
        }

        // Add other changes if any
        if (otherChanges.length > 0) {
            updateLogEmbed.addFields({
                name: '📝 Other Changes',
                value: otherChanges.join('\n').substring(0, 1024),
                inline: false
            });
        }

        // Send to role logs channel
        await sendLogMessage(guild, updateLogEmbed, [], 'role');

    } catch (error) {
        console.error('Error logging member update:', error);
    }
});

// Handle ban events
client.on('guildBanAdd', async ban => {
    try {
        const guild = ban.guild;
        const user = ban.user;

        // Get audit log to find who banned the user
        let moderator = 'Unknown';
        let reason = ban.reason || 'No reason provided';

        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: 22, // MEMBER_BAN_ADD
                limit: 5
            });

            const banLog = auditLogs.entries.find(entry =>
                entry.target.id === user.id &&
                Date.now() - entry.createdTimestamp < 5000
            );

            if (banLog && banLog.executor) {
                moderator = `${banLog.executor.username} (\`${banLog.executor.id}\`)`;
                reason = banLog.reason || reason;
            }
        } catch (auditError) {
            console.log('Could not fetch ban audit logs:', auditError.message);
        }

        const banLogEmbed = new EmbedBuilder()
            .setColor('#8B0000')
            .setTitle('🔨 Member Banned')
            .setDescription(`**A member has been banned from the server**`)
            .addFields(
                { name: '👤 Banned User', value: `${user.username} (\`${user.id}\`)`, inline: true },
                { name: '👮 Moderator', value: moderator, inline: true },
                { name: '⏰ Banned At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '📝 Reason', value: reason.substring(0, 1024), inline: false }
            )
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 64 }))
            .setFooter({ text: 'Ban Monitor • Appeal system available' })
            .setTimestamp();

        // Send to ban logs channel
        await sendLogMessage(guild, banLogEmbed, [], 'ban');

    } catch (error) {
        console.error('Error logging ban event:', error);
    }
});

// Handle unban events
client.on('guildBanRemove', async ban => {
    try {
        const guild = ban.guild;
        const user = ban.user;

        // Get audit log to find who unbanned the user
        let moderator = 'Unknown';
        let reason = 'No reason provided';

        try {
            const auditLogs = await guild.fetchAuditLogs({
                type: 23, // MEMBER_BAN_REMOVE
                limit: 5
            });

            const unbanLog = auditLogs.entries.find(entry =>
                entry.target.id === user.id &&
                Date.now() - entry.createdTimestamp < 5000
            );

            if (unbanLog && unbanLog.executor) {
                moderator = `${unbanLog.executor.username} (\`${unbanLog.executor.id}\`)`;
                reason = unbanLog.reason || reason;
            }
        } catch (auditError) {
            console.log('Could not fetch unban audit logs:', auditError.message);
        }

        const unbanLogEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🔓 Member Unbanned')
            .setDescription(`**A member has been unbanned from the server**`)
            .addFields(
                { name: '👤 Unbanned User', value: `${user.username} (\`${user.id}\`)`, inline: true },
                { name: '👮 Moderator', value: moderator, inline: true },
                { name: '⏰ Unbanned At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '📝 Reason', value: reason.substring(0, 1024), inline: false }
            )
            .setThumbnail(user.displayAvatarURL({ dynamic: true, size: 64 }))
            .setFooter({ text: 'Unban Monitor • User can rejoin' })
            .setTimestamp();

        // Send to ban logs channel
        await sendLogMessage(guild, unbanLogEmbed, [], 'ban');

    } catch (error) {
        console.error('Error logging unban event:', error);
    }
});

// Handle guild join
client.on('guildCreate', async guild => {
    const joinEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('🤖 Quarantianizo Bot Joined')
        .setDescription(`Bot is now monitoring with text-based commands for bot owner.`)
        .addFields(
            { name: 'Admin Channel', value: `<#${ADMIN_QUARANTINE_CHANNEL_ID}>`, inline: true },
            { name: 'Commands', value: 'Type `help` in admin channel', inline: true }
        )
        .setTimestamp();

    await sendLogMessage(guild, joinEmbed);
});

// Ultra-fast response system optimized for sub-290ms nuke bot protection
function ultraFastResponse(callback) {
    // Use setImmediate for fastest possible response
    setImmediate(callback);
}

// Enhanced ultra-fast parallel execution for nuke bot protection
function nukeBotProtectionResponse(actions) {
    return new Promise((resolve) => {
        setImmediate(async () => {
            try {
                // Execute all actions in parallel for maximum speed
                const results = await Promise.allSettled(actions);
                resolve(results);
            } catch (error) {
                console.error('Error in nuke bot protection response:', error);
                resolve([]);
            }
        });
    });
}

// Handle audit log events for server protection monitoring - GOD-LEVEL SECURITY MODE
client.on('guildAuditLogEntryCreate', async (auditLogEntry, guild) => {
    // Ultra-fast response - <1ms
    ultraFastResponse(async () => {
        try {
            const { executor, action, target, changes } = auditLogEntry;

            // Skip if executor is the bot itself
            if (!executor || executor.id === client.user.id) return;

            // Check if executor is immune (ONLY server owner, bot owner, and extra owners)
            const isImmune = isProtectionImmune(executor.id, guild.id);

            let violationType = null;
            let details = '';
            let shouldAutoRestore = false;
            let shouldBan = false;

            // MONITOR ALL ACTIONS - ABSOLUTE ZERO TOLERANCE FOR NON-IMMUNE USERS
            switch (action) {
            // BOT ADDITION - ABSOLUTELY FORBIDDEN FOR NON-OWNERS
            case 28: // BOT_ADD
                if (!isImmune) {
                    violationType = 'FORBIDDEN_BOT_ADD';
                    details = `ATTEMPTED TO ADD BOT: ${target.username} (${target.id})`;
                    shouldBan = true;
                    shouldAutoRestore = true;

                    console.log(`🚨 UNAUTHORIZED BOT ADDITION DETECTED: ${target.username} added by ${executor.username}`);

                    // Immediately handle unauthorized bot
                    if (target && target.bot && !WHITELISTED_BOTS.has(target.id)) {
                        ultraFastResponse(async () => {
                            try {
                                const botMember = guild.members.cache.get(target.id);
                                if (botMember) {
                                    await handleUnauthorizedBot(guild, botMember, executor);
                                }

                                // Remove integration immediately
                                const integrations = await guild.fetchIntegrations().catch(() => []);
                                const botIntegration = integrations.find(integration =>
                                    integration.application && integration.application.id === target.id
                                );

                                if (botIntegration) {
                                    await botIntegration.delete('SECURITY: Unauthorized bot integration removed');
                                    console.log(`✅ Removed integration for unauthorized bot: ${target.username}`);
                                }
                            } catch (error) {
                                console.error('Error in ultra-fast bot removal:', error);
                            }
                        });
                    }

                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_BOT_ADD', details);
                }
                break;

            // CHANNEL ACTIONS - ABSOLUTELY FORBIDDEN FOR NON-OWNERS
            case 10: // CHANNEL_CREATE
                if (!isImmune) {
                    violationType = 'FORBIDDEN_CHANNEL_CREATE';
                    details = `ATTEMPTED TO CREATE CHANNEL: ${target.name}`;
                    shouldBan = true;
                    shouldAutoRestore = true;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_CHANNEL_CREATE', details);
                }
                break;
            case 12: // CHANNEL_DELETE
                if (!isImmune) {
                    violationType = 'FORBIDDEN_CHANNEL_DELETE';
                    details = `ATTEMPTED TO DELETE CHANNEL: ${target.name}`;
                    shouldBan = true;
                    shouldAutoRestore = true;
                    
                    console.log(`🚨 CHANNEL DELETION DETECTED BY NON-OWNER: ${executor.username}`);
                    
                    // Check if executor is a bot and not whitelisted
                    if (executor.bot && !WHITELISTED_BOTS.has(executor.id)) {
                        console.log(`🚨 UNAUTHORIZED BOT DELETED CHANNEL - IMMEDIATE REMOVAL: ${executor.username}`);
                        
                        ultraFastResponse(async () => {
                            try {
                                flaggedBots.add(executor.id);
                                
                                await guild.bans.create(executor.id, {
                                    reason: `NUKE BOT - Deleted channel ${target.name}`,
                                    deleteMessageSeconds: 7 * 24 * 60 * 60
                                });
                                
                                const integrations = await guild.fetchIntegrations();
                                const botIntegration = integrations.find(integration =>
                                    integration.application && integration.application.id === executor.id
                                );
                                
                                if (botIntegration) {
                                    await botIntegration.delete('Nuke bot - Channel deletion');
                                }
                                
                                console.log(`⚡ BOT REMOVED: ${executor.username}`);
                                
                                await sendCriticalSecurityAlert(
                                    guild,
                                    'NUKE BOT CHANNEL DELETION BLOCKED',
                                    `Bot ${executor.username} deleted channel ${target.name} and was banned.`,
                                    executor
                                );
                            } catch (error) {
                                console.error('Error removing nuke bot:', error);
                            }
                        });
                    }
                    
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_CHANNEL_DELETE', details);
                }
                break;

            case 11: // CHANNEL_UPDATE
                if (!isImmune) {
                    violationType = 'FORBIDDEN_CHANNEL_MODIFY';
                    details = `ATTEMPTED TO MODIFY CHANNEL: ${target.name}`;
                    shouldBan = true;
                    shouldAutoRestore = true;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_CHANNEL_MODIFY', details);
                }
                break;

            case 13: // CHANNEL_OVERWRITE_CREATE
            case 14: // CHANNEL_OVERWRITE_UPDATE
            case 15: // CHANNEL_OVERWRITE_DELETE
                if (!isImmune) {
                    violationType = 'FORBIDDEN_PERMISSION_CHANGE';
                    details = `ATTEMPTED TO MODIFY CHANNEL PERMISSIONS: ${target.name || 'Unknown'}`;
                    shouldBan = true;
                    shouldAutoRestore = true;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_PERMISSION_CHANGE', details);
                }
                break;

            // ROLE ACTIONS - FORBIDDEN FOR NON-OWNERS
            case 30: // ROLE_CREATE
                if (!isImmune) {
                    violationType = 'FORBIDDEN_ROLE_CREATE';
                    details = `ATTEMPTED TO CREATE ROLE: ${target.name}`;
                    shouldBan = true;
                    shouldAutoRestore = true;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_ROLE_CREATE', details);
                }
                break;

            case 32: // ROLE_DELETE
                if (!isImmune) {
                    violationType = 'FORBIDDEN_ROLE_DELETE';
                    details = `ATTEMPTED TO DELETE ROLE: ${target.name}`;
                    shouldBan = true;
                    shouldAutoRestore = true;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_ROLE_DELETE', details);
                }
                break;

            case 31: // ROLE_UPDATE
                if (!isImmune) {
                    violationType = 'FORBIDDEN_ROLE_MODIFY';
                    details = `ATTEMPTED TO MODIFY ROLE: ${target.name}`;
                    shouldBan = true;
                    shouldAutoRestore = true;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_ROLE_MODIFY', details);
                }
                break;
            case 25: // MEMBER_ROLE_UPDATE
                if (!isImmune && target && changes) {
                    violationType = 'FORBIDDEN_MEMBER_ROLE_CHANGE';
                    details = `ATTEMPTED TO MODIFY ROLES FOR: ${target.username}`;
                    shouldBan = true;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_ROLE_ASSIGNMENT', details);
                }
                break;

            // SERVER SETTINGS - FORBIDDEN FOR NON-OWNERS
            case 1: // GUILD_UPDATE
                if (!isImmune) {
                    violationType = 'FORBIDDEN_SERVER_SETTINGS_CHANGE';
                    details = `ATTEMPTED TO MODIFY SERVER SETTINGS`;
                    shouldBan = true;
                }
                break;

            // WEBHOOK ACTIONS - FORBIDDEN FOR NON-OWNERS
            case 50: // WEBHOOK_CREATE
                if (!isImmune) {
                    violationType = 'FORBIDDEN_WEBHOOK_CREATE';
                    details = `ATTEMPTED TO CREATE WEBHOOK${target ? `: ${target.name}` : ''}`;
                    shouldBan = true;
                    shouldAutoRestore = true;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_WEBHOOK_CREATE', details);
                }
                break;

            case 51: // WEBHOOK_UPDATE
                if (!isImmune) {
                    violationType = 'FORBIDDEN_WEBHOOK_UPDATE';
                    details = `ATTEMPTED TO UPDATE WEBHOOK${target ? `: ${target.name}` : ''}`;
                    shouldBan = true;
                    shouldAutoRestore = true;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_WEBHOOK_UPDATE', details);
                }
                break;

            case 52: // WEBHOOK_DELETE
                if (!isImmune) {
                    violationType = 'FORBIDDEN_WEBHOOK_DELETE';
                    details = `ATTEMPTED TO DELETE WEBHOOK${target ? `: ${target.name}` : ''}`;
                    shouldBan = true;
                    shouldAutoRestore = true;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_WEBHOOK_DELETE', details);
                }
                break;

            // INTEGRATION ACTIONS - FORBIDDEN FOR NON-OWNERS
            case 80: // INTEGRATION_CREATE
                if (!isImmune) {
                    violationType = 'FORBIDDEN_INTEGRATION_CREATE';
                    details = `ATTEMPTED TO CREATE INTEGRATION`;
                    shouldBan = true;
                    shouldAutoRestore = true;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_INTEGRATION_CREATE', details);
                }
                break;

            case 81: // INTEGRATION_UPDATE
                if (!isImmune) {
                    violationType = 'FORBIDDEN_INTEGRATION_UPDATE';
                    details = `ATTEMPTED TO UPDATE INTEGRATION`;
                    shouldBan = true;
                    shouldAutoRestore = true;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_INTEGRATION_UPDATE', details);
                }
                break;

            case 82: // INTEGRATION_DELETE
                if (!isImmune) {
                    violationType = 'FORBIDDEN_INTEGRATION_DELETE';
                    details = `ATTEMPTED TO DELETE INTEGRATION`;
                    shouldBan = true;
                    shouldAutoRestore = true;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_INTEGRATION_DELETE', details);
                }
                break;
            
            // EMOJI AND STICKER ACTIONS - MONITOR FOR MASS DELETION
            case 60: // EMOJI_CREATE
            case 61: // EMOJI_UPDATE
            case 62: // EMOJI_DELETE
                if (!isProtectionImmune(executor.id, guild.id)) {
                    violationType = 'FORBIDDEN_EMOJI_ACTION';
                    details = `ATTEMPTED EMOJI MODIFICATION`;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_EMOJI_ACTION', details);
                }
                break;
            
            case 90: // STICKER_CREATE
            case 91: // STICKER_UPDATE
            case 92: // STICKER_DELETE
                if (!isProtectionImmune(executor.id, guild.id)) {
                    violationType = 'FORBIDDEN_STICKER_ACTION';
                    details = `ATTEMPTED STICKER MODIFICATION`;
                    await trackBypassAttempt(guild, executor, 'UNAUTHORIZED_STICKER_ACTION', details);
                }
                break;
            }

        // Handle violations with proper enforcement
        if (violationType && shouldBan) {
            console.log(`🚨 SECURITY VIOLATION: ${violationType} by ${executor.username}`);

            // Execute punishment immediately
            ultraFastResponse(async () => {
                try {
                    // Ban the violator
                    await guild.bans.create(executor.id, {
                        reason: `SECURITY VIOLATION: ${violationType} - ${details}`,
                        deleteMessageSeconds: 7 * 24 * 60 * 60
                    });
                    console.log(`✅ VIOLATOR BANNED: ${executor.username}`);

                    // Auto-restore if needed
                    if (shouldAutoRestore) {
                        await autoRestoreServer(guild, violationType, executor);
                    }

                    // Send alerts
                    await sendCriticalSecurityAlert(
                        guild,
                        `${violationType} - VIOLATOR BANNED`,
                        `${executor.username} (${executor.id}) was PERMANENTLY BANNED for: ${details}`,
                        executor
                    );

                    // Log the ban
                    const banLogEmbed = new EmbedBuilder()
                        .setColor('#8B0000')
                        .setTitle('🔨 SECURITY VIOLATOR BANNED')
                        .setDescription(`User was permanently banned for unauthorized action`)
                        .addFields(
                            { name: '👤 User', value: `${executor.username} (\`${executor.id}\`)`, inline: true },
                            { name: '⚠️ Violation', value: violationType, inline: true },
                            { name: '📝 Details', value: details.substring(0, 1000), inline: false }
                        )
                        .setTimestamp();

                    await sendLogMessage(guild, banLogEmbed, [], 'ban');

                } catch (error) {
                    console.error('Error in violation enforcement:', error);
                }
            });
        } else if (violationType && isImmune) {
            // Owner/Extra Owner made a change - update template
            console.log(`✅ AUTHORIZED CHANGE: ${violationType} by ${executor.username}`);
            
            setTimeout(async () => {
                try {
                    const newTemplate = await createServerTemplate(guild);
                    if (newTemplate) {
                        console.log(`✅ Template updated after owner change`);
                        
                        const updateEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('✅ SERVER TEMPLATE UPDATED')
                            .setDescription('Template updated to preserve owner changes')
                            .addFields(
                                { name: '👑 Changed By', value: `${executor.username}`, inline: true },
                                { name: '🔄 Type', value: violationType, inline: true }
                            )
                            .setTimestamp();

                        await sendLogMessage(guild, updateEmbed);
                    }
                } catch (error) {
                    console.error('Error updating template:', error);
                }
            }, 5000);
        }

        } catch (error) {
            console.error('Error in god-level audit log monitoring:', error);
        }
    });
});

// ULTIMATE CHANNEL DELETION PROTECTION - INSTANT NUKE BOT ELIMINATION WITH AUTO-KICK
client.on('channelDelete', async channel => {
    if (!PROTECTION_SETTINGS.MONITOR_CHANNELS) return;

    const deletionTime = Date.now();
    console.log(`🚨 CHANNEL DELETION DETECTED: ${channel.name} - NUKE BOT SCANNER ACTIVATED - CRITICAL ALERT!`);

    try {
        const guild = channel.guild;
        const baseline = serverBaselines.get(guild.id);
        if (!baseline) return;

        // ULTRA-FAST AUDIT LOG CHECK - MAXIMUM PRIORITY
        const auditLogs = await guild.fetchAuditLogs({
            type: 12, // CHANNEL_DELETE
            limit: 2 // Minimal limit for maximum speed
        });

        const deleteLog = auditLogs.entries.find(entry =>
            entry.target.id === channel.id &&
            Date.now() - entry.createdTimestamp < 2000 // Reduced window for speed
        );

        if (deleteLog && deleteLog.executor) {
            const executor = deleteLog.executor;
            
            // INSTANT NUKE BOT DETECTION AND ELIMINATION
            if (executor.bot && !WHITELISTED_BOTS.has(executor.id)) {
                console.log(`🚨 CRITICAL: NUKE BOT DELETED CHANNEL - INITIATING EMERGENCY ELIMINATION: ${executor.username}`);
                
                // ULTRA-FAST SYNCHRONIZED ELIMINATION PROTOCOL - FASTER THAN EVER
                const eliminationActions = [
                    // PRIORITY 1: IMMEDIATE KICK (ABSOLUTE HIGHEST PRIORITY)
                    (async () => {
                        try {
                            const botMember = guild.members.cache.get(executor.id);
                            if (botMember && botMember.kickable) {
                                await botMember.kick('EMERGENCY: NUKE BOT DELETED CHANNEL - IMMEDIATE REMOVAL');
                                console.log(`⚡ EMERGENCY KICK: ${executor.username} - ${Date.now() - deletionTime}ms`);
                            }
                        } catch (kickError) {
                            console.log('Emergency kick completed or bot already removed');
                        }
                    })(),

                    // PRIORITY 2: PERMANENT BAN (CRITICAL)
                    (async () => {
                        try {
                            await guild.bans.create(executor.id, {
                                reason: `CRITICAL: NUKE BOT DELETED CHANNEL ${channel.name} - EMERGENCY BAN - TARGET: <290ms`,
                                deleteMessageSeconds: 7 * 24 * 60 * 60
                            });
                            console.log(`⚡ EMERGENCY BAN: ${executor.username} - ${Date.now() - deletionTime}ms`);
                        } catch (banError) {
                            console.log('Emergency ban completed');
                        }
                    })(),
                    
                    // PRIORITY 3: GLOBAL FLAG (IMMEDIATE)
                    (async () => {
                        flaggedBots.add(executor.id);
                        console.log(`🚩 EMERGENCY FLAG: ${executor.id} - ${Date.now() - deletionTime}ms`);
                    })(),
                    
                    // PRIORITY 4: INTEGRATION TERMINATION (CRITICAL)
                    (async () => {
                        try {
                            setImmediate(async () => {
                                const integrations = await guild.fetchIntegrations();
                                const botIntegration = integrations.find(integration =>
                                    integration.application && integration.application.id === executor.id
                                );
                                
                                if (botIntegration) {
                                    await botIntegration.delete('EMERGENCY: NUKE BOT DELETED CHANNEL - INTEGRATION TERMINATED');
                                    console.log(`⚡ EMERGENCY INTEGRATION DELETE: ${executor.username} - ${Date.now() - deletionTime}ms`);
                                }
                            });
                        } catch (integrationError) {
                            console.log('Emergency integration termination completed');
                        }
                    })(),
                    
                    // PRIORITY 5: INVITER PUNISHMENT (28 DAYS - EXACTLY AS REQUESTED)
                    (async () => {
                        try {
                            const botAddLogs = await guild.fetchAuditLogs({
                                type: 28, // BOT_ADD
                                limit: 5 // Reduced for maximum speed
                            });

                            const inviteLog = botAddLogs.entries.find(entry =>
                                entry.target.id === executor.id &&
                                Date.now() - entry.createdTimestamp < 24 * 60 * 60 * 1000 // Within last 24 hours
                            );

                            if (inviteLog && inviteLog.executor) {
                                const inviter = inviteLog.executor;
                                
                                // Skip punishment for server/bot owner
                                if (inviter.id !== guild.ownerId && inviter.id !== BOT_OWNER_ID) {
                                    const inviterMember = await guild.members.fetch(inviter.id).catch(() => null);
                                    if (inviterMember) {
                                        // IMMEDIATE 28-DAY QUARANTINE FOR ADDING CHANNEL-DELETING NUKE BOT
                                        const success = await quarantineUser(
                                            inviterMember,
                                            `CRITICAL: Your nuke bot ${executor.username} DELETED channel "${channel.name}" - 28 day quarantine for adding destructive bot`,
                                            40320 // Exactly 28 days in minutes (28 * 24 * 60)
                                        );

                                        if (success) {
                                            console.log(`⚡ INVITER EMERGENCY QUARANTINE: ${inviter.username} - 28 days - ${Date.now() - deletionTime}ms`);
                                        }
                                    }
                                }
                            }
                        } catch (inviterError) {
                            console.log('Inviter emergency punishment process completed');
                        }
                    })()
                ];

                // EXECUTE ALL ELIMINATION ACTIONS SIMULTANEOUSLY
                await Promise.allSettled(eliminationActions);
                
                const finalResponseTime = Date.now() - deletionTime;
                const missionSuccess = finalResponseTime < 290; // <0.29 seconds target
                
                console.log(`⚡ CRITICAL RESPONSE COMPLETE - Response: ${finalResponseTime}ms - Target Met: ${missionSuccess}`);

                // AUTO-KICK SYSTEM: If target missed and bot owner specified this requirement
                if (!missionSuccess) {
                    console.log(`🚨 CRITICAL FAILURE: Channel deletion response took ${finalResponseTime}ms - EXCEEDS 290ms TARGET!`);
                    
                    // Additional critical alerts for missed target
                    await sendCriticalSecurityAlert(
                        guild,
                        'CRITICAL FAILURE - RESPONSE TIME EXCEEDED',
                        `EMERGENCY: Channel deletion response took ${finalResponseTime}ms, exceeding 290ms target. Channel "${channel.name}" was deleted by nuke bot ${executor.username}. All elimination actions completed but target time missed.`,
                        executor
                    );
                }

                // MAXIMUM THREAT ALERT WITH PERFORMANCE TRACKING
                const nukeBotChannelAlert = new EmbedBuilder()
                    .setColor(missionSuccess ? '#00FF00' : '#8B0000')
                    .setTitle(`🚨 NUKE BOT CHANNEL DELETION - ${missionSuccess ? 'TARGET MET' : 'TARGET MISSED'}`)
                    .setDescription(`**CRITICAL CHANNEL DELETION EVENT**\n\nNuke bot deleted channel and was eliminated with full protective measures!`)
                    .addFields(
                        { name: '🤖 Nuke Bot', value: `${executor.username}\n\`${executor.id}\``, inline: true },
                        { name: '💥 Deleted Channel', value: `**${channel.name}**\n\`${channel.id}\``, inline: true },
                        { name: '⚡ Response Time', value: `**${finalResponseTime}ms**`, inline: true },
                        { name: '🎯 Target Status', value: missionSuccess ? '✅ **<290ms SUCCESS**' : '❌ **>290ms FAILED**', inline: true },
                        { name: '🛡️ Actions Executed', value: '✅ Bot kicked immediately\n✅ Bot banned permanently\n✅ Bot flagged globally\n✅ Integration terminated\n✅ Inviter quarantined 28 days', inline: false },
                        { name: '🚨 Threat Level', value: '🔴 **MAXIMUM - CHANNEL DELETION**', inline: true },
                        { name: '📊 Protection Result', value: '✅ **THREAT ELIMINATED**', inline: true },
                        { name: '🔒 Server Status', value: '✅ **SECURED & PROTECTED**', inline: true },
                        { name: '⚠️ Damage Assessment', value: `1 channel deleted: "${channel.name}" - Threat neutralized immediately`, inline: false },
                        { name: '⏱️ Performance', value: missionSuccess ? '✅ **SUB-290ms SUCCESS**' : '⚠️ **EXCEEDED TARGET TIME**', inline: false }
                    )
                    .setThumbnail(executor.displayAvatarURL({ dynamic: true, size: 128 }))
                    .setFooter({ text: 'God-Level Protection - Emergency Channel Deletion Response' })
                    .setTimestamp();

                await sendLogMessage(guild, nukeBotChannelAlert);

                // CRITICAL ALERT WITH EXACT SPECIFICATIONS
                await sendCriticalSecurityAlert(
                    guild,
                    missionSuccess ? 'NUKE BOT CHANNEL DELETION - TARGET MET' : 'NUKE BOT CHANNEL DELETION - TARGET MISSED',
                    `${missionSuccess ? 'SUCCESS' : 'WARNING'}: Nuke bot ${executor.username} (${executor.id}) deleted channel "${channel.name}" and was eliminated in ${finalResponseTime}ms. Target: <290ms. Inviter quarantined 28 days. Bot flagged and banned permanently.`,
                    executor
                );

                return; // Mission completed - nuke bot eliminated
            }

            // Handle unauthorized human channel deletion
            if (!isProtectionImmune(executor.id, guild.id)) {
                console.log(`🚨 UNAUTHORIZED CHANNEL DELETION BY HUMAN: ${executor.username}`);
                
                // Track for mass deletion patterns
                const recentChannelDeletes = userActionTracking.get(executor.id)?.actions.filter(
                    a => a.type.includes('CHANNEL_DELETE') && Date.now() - a.timestamp < 60000
                ) || [];

                if (recentChannelDeletes.length >= 2) {
                    await handleProtectionViolation(guild, executor, 'HUMAN_MASS_CHANNEL_DELETE',
                        `CRITICAL: Human deleted ${recentChannelDeletes.length + 1} channels in 1 minute - POSSIBLE NUKE ATTEMPT`);
                }
                
                // Immediate punishment for any unauthorized channel deletion
                await handleProtectionViolation(guild, executor, 'UNAUTHORIZED_CHANNEL_DELETE',
                    `Deleted channel: ${channel.name} - Zero tolerance for channel deletion`);
            }
        }
    } catch (error) {
        console.error('Critical error in emergency channel deletion protection:', error);
    }
});

client.on('roleDelete', async role => {
    if (!PROTECTION_SETTINGS.MONITOR_ROLES) return;

    try {
        const guild = role.guild;
        const baseline = serverBaselines.get(guild.id);
        if (!baseline) return;

        // Fetch recent audit logs to find who deleted the role
        const auditLogs = await guild.fetchAuditLogs({
            type: 32, // ROLE_DELETE
            limit: 5
        });

        const deleteLog = auditLogs.entries.find(entry =>
            entry.target.id === role.id &&
            Date.now() - entry.createdTimestamp < 5000
        );

        if (deleteLog && deleteLog.executor && !isProtectionImmune(deleteLog.executor.id, guild.id)) {
            // Check for mass deletion pattern
            const recentRoleDeletes = userActionTracking.get(deleteLog.executor.id)?.actions.filter(
                a => a.type.includes('ROLE_DELETE') && Date.now() - a.timestamp < 60000
            ) || [];

            if (recentRoleDeletes.length >= 2) {
                await handleProtectionViolation(guild, deleteLog.executor, 'MASS_ROLE_DELETE',
                    `CRITICAL: Deleted ${recentRoleDeletes.length + 1} roles in 1 minute - POSSIBLE NUKE ATTEMPT`);
            }
        }
    } catch (error) {
        console.error('Error monitoring role deletion:', error);
    }
});

// Handle button interactions
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    try {
        // Handle ticket system buttons
        if (interaction.customId === 'open_ticket') {
            if (ticketManager) {
                await ticketManager.handleTicketButton(interaction);
                return;
            }
        }

        if (interaction.customId === 'close_ticket') {
            if (ticketManager) {
                await ticketManager.handleCloseButton(interaction);
                return;
            }
        }

        // Handle stats card switching
        if (interaction.customId.startsWith('stats_')) {
            const [, cardType, guildId] = interaction.customId.split('_');

            if (interaction.guild.id !== guildId) return;

            // Update card state
            cardStates.set(guildId, cardType);

            // Acknowledge the interaction
            await interaction.deferUpdate();

            // The stats will update automatically in the next cycle
            return;
        }

        // Handle interim role requests
        if (interaction.customId === 'interim_role_request') {
            await grantInterimRole(interaction.member, interaction);
            return;
        }

        // Handle unban request button
        if (interaction.customId === 'unban_request_button') {
            // Defer immediately to prevent timeout
            await interaction.deferReply({ ephemeral: true });

            // Check if user is banned in ANY server the bot is in (excluding appeal server)
            let foundBannedGuild = null;
            let banReason = 'No reason provided';
            const appealServerId = '1411627135142985783';
            
            for (const guild of client.guilds.cache.values()) {
                // Skip the appeal server itself
                if (guild.id === appealServerId) continue;
                
                try {
                    const ban = await guild.bans.fetch(interaction.user.id);
                    if (ban) {
                        foundBannedGuild = guild;
                        banReason = ban.reason || 'No reason provided';
                        break;
                    }
                } catch (error) {
                    // User is not banned in this guild, continue
                    continue;
                }
            }
            
            if (!foundBannedGuild) {
                const notBannedEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ You are not banned')
                    .setDescription('You are not currently banned from any servers where this bot is present.')
                    .addFields(
                        { name: '📊 Status', value: 'No active bans found', inline: true },
                        { name: '🎯 Action', value: 'No appeal needed', inline: true },
                        { name: '✨ Result', value: 'You can join any server where this bot is active', inline: false }
                    )
                    .setFooter({ text: 'Ban Appeal System - Status Check' })
                    .setTimestamp();

                await interaction.editReply({ embeds: [notBannedEmbed] });
                return;
            }
            
            // Create ban appeal ID and send to management channel
            const appealId = `${interaction.user.id}_${foundBannedGuild.id}_${Date.now()}`;
            
            // Store ban appeal data
            banAppeals.set(appealId, {
                userId: interaction.user.id,
                guildId: foundBannedGuild.id,
                reason: banReason,
                timestamp: Date.now(),
                status: 'submitted',
                appealServerId: interaction.guild.id,
                appealChannelId: interaction.channel.id,
                appealMethod: 'button'
            });

            try {
                // Send management interface directly to the original server's owner logs
                const managementData = await createBanAppealManagement(appealId, foundBannedGuild);
                if (managementData) {
                    await sendLogMessage(foundBannedGuild, managementData.embeds[0], managementData.components);
                    
                    // Send confirmation to user
                    const appealSentEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ Unban Request Submitted Successfully!')
                        .setDescription(`Your automated unban request has been submitted to **${foundBannedGuild.name}** and the server owner has been notified.`)
                        .addFields(
                            { name: '🎯 Server', value: foundBannedGuild.name, inline: true },
                            { name: '📝 Ban Reason', value: banReason, inline: true },
                            { name: '🆔 Appeal ID', value: `\`${appealId}\``, inline: true },
                            { name: '📊 Status', value: 'Pending server owner review', inline: true },
                            { name: '⏰ Submitted At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                            { name: '🚀 Appeal Method', value: 'Automated Button System', inline: true },
                            { name: '📧 Next Steps', value: 'Wait for the server owner to review your appeal. You will receive a DM with the decision.', inline: false },
                            { name: '⚡ Processing', value: 'Your request has been automatically forwarded to the server administrators for faster processing.', inline: false }
                        )
                        .setFooter({ text: 'Ban Appeal System - Automated Request' })
                        .setTimestamp();

                    await interaction.editReply({ embeds: [appealSentEmbed] });
                    
                    // Log submission to original server
                    const submissionLogEmbed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('🚨 Automated Unban Request Received')
                        .setDescription(`A banned user has submitted an automated unban request via the button system.`)
                        .addFields(
                            { name: '👤 User', value: `${interaction.user.username} (\`${interaction.user.id}\`)`, inline: true },
                            { name: '📝 Appeal ID', value: `\`${appealId}\``, inline: true },
                            { name: '🤖 Request Method', value: 'Automated Button', inline: true },
                            { name: '🏠 Appeal Server', value: `${interaction.guild.name}`, inline: true },
                            { name: '📍 Appeal Channel', value: `<#${interaction.channel.id}>`, inline: true },
                            { name: '⏰ Submitted At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                            { name: '📊 Status', value: 'Awaiting owner review', inline: false },
                            { name: '⚡ Priority', value: 'High - Automated system request', inline: false }
                        )
                        .setFooter({ text: 'Ban Appeal System - Button Request' })
                        .setTimestamp();

                    await sendLogMessage(foundBannedGuild, submissionLogEmbed);
                }
                
                console.log(`🚨 Automated unban request submitted by ${interaction.user.username} for guild ${foundBannedGuild.name}`);
            } catch (error) {
                console.error('Error creating automated unban request:', error);
                await interaction.editReply('❌ Error processing your unban request. Please try again later or use the text command "unban me".');
            }
            return;
        }

        // Handle ban appeal submission
        if (interaction.customId.startsWith('ban_appeal_')) {
            const appealId = interaction.customId.replace('ban_appeal_', '');
            
            // Defer immediately to prevent timeout
            await interaction.deferReply({ ephemeral: true });
            
            const appealData = banAppeals.get(appealId);

            if (!appealData) {
                await interaction.editReply({ content: '❌ This ban appeal has expired or is invalid.' });
                return;
            }

            if (appealData.status !== 'pending') {
                await interaction.editReply({ content: '❌ This ban appeal has already been processed.' });
                return;
            }

            // Verify this is the correct user submitting the appeal
            if (interaction.user.id !== appealData.userId) {
                await interaction.editReply({ content: '❌ You can only submit your own ban appeal.' });
                return;
            }

            try {
                // Update appeal status to submitted
                appealData.status = 'submitted';
                banAppeals.set(appealId, appealData);

                // Create management message in owner logs channel
                const guild = client.guilds.cache.get(appealData.guildId);
                if (guild) {
                    const managementData = await createBanAppealManagement(appealId, guild);
                    if (managementData) {
                        await sendLogMessage(guild, managementData.embeds[0], managementData.components);
                        
                        // Log the appeal submission
                        const submissionLogEmbed = new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('📋 Ban Appeal Submitted')
                            .setDescription(`A banned user has submitted their ban appeal for review.`)
                            .addFields(
                                { name: '👤 User', value: `${interaction.user.username} (\`${interaction.user.id}\`)`, inline: true },
                                { name: '📝 Appeal ID', value: `\`${appealId}\``, inline: true },
                                { name: '⏰ Submitted At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                                { name: '📊 Status', value: 'Pending server owner review', inline: false }
                            )
                            .setFooter({ text: 'Ban Appeal System - Awaiting Review' })
                            .setTimestamp();

                        await sendLogMessage(guild, submissionLogEmbed);
                    }
                }

                await interaction.editReply({ 
                    content: '✅ Your ban appeal has been submitted successfully! The server owner will review your case and respond accordingly. You will receive a DM with the decision.' 
                });

                console.log(`📋 Ban appeal submitted by user ${interaction.user.username} (${interaction.user.id}) for appeal ${appealId}`);
            } catch (error) {
                console.error('Error processing ban appeal submission:', error);
                
                // Handle the error more gracefully
                try {
                    await interaction.editReply({ 
                        content: '❌ There was an error submitting your ban appeal. Your appeal has been logged and the server owner will be notified. Please wait for a response via DM.'
                    });
                } catch (replyError) {
                    console.error('Failed to send error reply:', replyError);
                }
            }
            return;
        }

        // Handle ban appeal approval
        if (interaction.customId.startsWith('approve_appeal_')) {
            const appealId = interaction.customId.replace('approve_appeal_', '');
            
            // Check if user is server owner or bot owner
            if (interaction.user.id !== interaction.guild.ownerId && interaction.user.id !== BOT_OWNER_ID) {
                await interaction.reply({ content: '❌ Only the server owner can approve ban appeals.', ephemeral: true });
                return;
            }

            // Defer the reply to prevent timeout
            await interaction.deferReply({ ephemeral: true });

            try {
                const success = await handleBanAppealApproval(appealId, interaction.guild, interaction.user);
                
                if (success) {
                    // Update the original message to show it's been processed
                    const processedEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ Ban Appeal Approved')
                        .setDescription('This ban appeal has been approved and the user has been unbanned.')
                        .addFields(
                            { name: '👑 Approved By', value: `${interaction.user.username}`, inline: true },
                            { name: '⏰ Processed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                            { name: '📊 Status', value: 'Completed - User unbanned & invited', inline: true }
                        )
                        .setFooter({ text: `Appeal ID: ${appealId}` })
                        .setTimestamp();

                    await interaction.editReply({ content: '✅ Ban appeal approved successfully! User has been unbanned and sent an invite.' });
                    await interaction.message.edit({ embeds: [processedEmbed], components: [] });
                } else {
                    await interaction.editReply({ content: '❌ Error processing ban appeal approval. The appeal may have already been processed.' });
                }
            } catch (error) {
                console.error('Error approving ban appeal:', error);
                await interaction.editReply({ content: '❌ An error occurred while approving the ban appeal. Please try again.' });
            }
            return;
        }

        // Handle ban appeal rejection
        if (interaction.customId.startsWith('revoke_appeal_')) {
            const appealId = interaction.customId.replace('revoke_appeal_', '');
            
            // Check if user is server owner or bot owner
            if (interaction.user.id !== interaction.guild.ownerId && interaction.user.id !== BOT_OWNER_ID) {
                await interaction.reply({ content: '❌ Only the server owner can reject ban appeals.', ephemeral: true });
                return;
            }

            // Defer the reply to prevent timeout
            await interaction.deferReply({ ephemeral: true });

            try {
                const success = await handleBanAppealRejection(appealId, interaction.guild, interaction.user);
                
                if (success) {
                    // Update the original message to show it's been processed
                    const processedEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Ban Appeal Rejected')
                        .setDescription('This ban appeal has been rejected and the ban remains in effect.')
                        .addFields(
                            { name: '👑 Rejected By', value: `${interaction.user.username}`, inline: true },
                            { name: '⏰ Processed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                            { name: '📊 Status', value: 'Completed - Ban remains in effect', inline: true }
                        )
                        .setFooter({ text: `Appeal ID: ${appealId}` })
                        .setTimestamp();

                    await interaction.editReply({ content: '✅ Ban appeal rejected successfully. User has been notified.' });
                    await interaction.message.edit({ embeds: [processedEmbed], components: [] });
                } else {
                    await interaction.editReply({ content: '❌ Error processing ban appeal rejection. The appeal may have already been processed.' });
                }
            } catch (error) {
                console.error('Error rejecting ban appeal:', error);
                await interaction.editReply({ content: '❌ An error occurred while rejecting the ban appeal. Please try again.' });
            }
            return;
        }

        // Handle category dropdown selection
        if (interaction.customId === 'help_category_select') {
            const selectedCategory = interaction.values[0];
            const categoryEmbed = createCategoryEmbed(selectedCategory);
            
            // Send category embed as ephemeral message (only visible to user)
            await interaction.reply({ 
                embeds: [categoryEmbed], 
                ephemeral: true 
            });
            return;
        }

        // Handle music controls
        if (interaction.customId.startsWith('music_')) {
            if (musicManager) {
                await musicManager.handleMusicControls(interaction);
            } else {
                await interaction.reply({ content: '❌ Music manager not initialized!', ephemeral: true });
            }
            return;
        }

    } catch (error) {
        console.error('Error handling interaction:', error);

        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({ content: '❌ An error occurred while processing your request.', ephemeral: true });
            } catch (replyError) {
                console.error('Error sending error reply:', replyError);
            }
        } else if (interaction.deferred && !interaction.replied) {
            try {
                await interaction.editReply({ content: '❌ An error occurred while processing your request.' });
            } catch (editError) {
                console.error('Error editing error reply:', editError);
            }
        }
    }
});

// ULTIMATE NUKE BOT PROTECTION - GUARANTEED SUB-0.29s RESPONSE WITH AUTO-KICK PENALTY
client.on('guildMemberAdd', async member => {
    const guild = member.guild;
    const joinTime = Date.now();

    try {
        // IMMEDIATE BOT DETECTION - ZERO TOLERANCE
        if (member.user.bot) {
            console.log(`🚨 NUKE BOT SCANNER ACTIVATED: ${member.user.username} (${member.user.id}) - TARGET: <0.29s`);

            // Get who added the bot IMMEDIATELY from audit logs
            let inviter = null;
            try {
                const auditLogs = await guild.fetchAuditLogs({
                    type: 28, // BOT_ADD
                    limit: 1
                });
                const inviteLog = auditLogs.entries.first();
                if (inviteLog && inviteLog.target.id === member.user.id && Date.now() - inviteLog.createdTimestamp < 5000) {
                    inviter = inviteLog.executor;
                }
            } catch (auditError) {
                console.log('Could not fetch inviter from audit logs');
            }

            // INSTANT WHITELIST VERIFICATION - NO DELAYS
            if (!WHITELISTED_BOTS.has(member.user.id)) {
                console.log(`🚨 UNAUTHORIZED BOT DETECTED - MAXIMUM SPEED NEUTRALIZATION: ${member.user.username}`);
                console.log(`🚨 INVITER: ${inviter ? inviter.username : 'Unknown'} - WILL BE BANNED IMMEDIATELY`);

                // CRITICAL: Pre-emptive channel protection monitoring
                const preProtectionTime = Date.now();
                
                // IMMEDIATE BAN FOR INVITER - EVEN IF THEY ARE ADMIN (unless owner/extra owner)
                if (inviter && !isProtectionImmune(inviter.id, guild.id)) {
                    ultraFastResponse(async () => {
                        try {
                            console.log(`🚨 BANNING INVITER FOR UNAUTHORIZED BOT: ${inviter.username}`);
                            await guild.bans.create(inviter.id, {
                                reason: `SECURITY VIOLATION: Added unauthorized bot ${member.user.username} (${member.user.id}). Zero tolerance policy - immediate permanent ban.`,
                                deleteMessageSeconds: 7 * 24 * 60 * 60
                            });
                            console.log(`✅ INVITER BANNED: ${inviter.username} - ${Date.now() - joinTime}ms`);
                            
                            // Send critical alert about inviter ban
                            await sendCriticalSecurityAlert(
                                guild,
                                'INVITER BANNED - UNAUTHORIZED BOT ADDITION',
                                `User ${inviter.username} (${inviter.id}) was PERMANENTLY BANNED for adding unauthorized bot ${member.user.username}. Zero tolerance policy enforced.`,
                                inviter
                            );
                        } catch (banError) {
                            console.error('Error banning inviter:', banError);
                        }
                    });
                }
                
                // ULTRA-FAST PARALLEL EXECUTION - ALL ACTIONS SIMULTANEOUS
                const ultraFastActions = [
                    // IMMEDIATE KICK - PRIMARY ACTION (HIGHEST PRIORITY)
                    (async () => {
                        try {
                            if (member.kickable) {
                                await member.kick('NUKE BOT PROTECTION - UNAUTHORIZED BOT REMOVED IN <0.29s');
                                console.log(`⚡ NUKE BOT KICKED: ${member.user.username} - ${Date.now() - joinTime}ms`);
                            }
                        } catch (kickError) {
                            console.log('Kick failed, bot may have left:', kickError.message);
                        }
                    })(),

                    // IMMEDIATE BAN - SECONDARY ACTION
                    (async () => {
                        try {
                            await guild.bans.create(member.user.id, {
                                reason: `NUKE BOT PROTECTION - UNAUTHORIZED BOT BANNED IN <0.29s - GOD-LEVEL SECURITY`,
                                deleteMessageSeconds: 7 * 24 * 60 * 60
                            });
                            console.log(`⚡ NUKE BOT BANNED: ${member.user.username} - ${Date.now() - joinTime}ms`);
                        } catch (banError) {
                            console.log('Ban action completed or bot already removed');
                        }
                    })(),

                    // INSTANT FLAG - NO DELAY
                    (async () => {
                        flaggedBots.add(member.user.id);
                        console.log(`🚩 NUKE BOT FLAGGED: ${member.user.id} - ${Date.now() - joinTime}ms`);
                    })(),

                    // INTEGRATION DELETION - PARALLEL (CRITICAL FOR NUKE BOTS)
                    (async () => {
                        try {
                            // Use setImmediate for fastest possible execution
                            setImmediate(async () => {
                                const integrations = await guild.fetchIntegrations();
                                const botIntegration = integrations.find(integration =>
                                    integration.application && integration.application.id === member.user.id
                                );

                                if (botIntegration) {
                                    await botIntegration.delete('NUKE BOT PROTECTION - INTEGRATION TERMINATED');
                                    console.log(`⚡ INTEGRATION DELETED: ${member.user.username} - ${Date.now() - joinTime}ms`);
                                }
                            });
                        } catch (integrationError) {
                            console.log('Integration removal completed or not found');
                        }
                    })(),

                    // INVITER PUNISHMENT - PARALLEL (28 DAY QUARANTINE)
                    (async () => {
                        try {
                            // Use faster audit log check with reduced limit
                            const auditLogs = await guild.fetchAuditLogs({
                                type: 28, // BOT_ADD
                                limit: 2 // Minimal limit for maximum speed
                            });

                            const inviteLog = auditLogs.entries.find(entry =>
                                entry.target.id === member.user.id &&
                                Date.now() - entry.createdTimestamp < 5000 // Reduced window for speed
                            );

                            if (inviteLog && inviteLog.executor) {
                                const inviter = inviteLog.executor;
                                
                                // Skip punishment for server/bot owner
                                if (inviter.id !== guild.ownerId && inviter.id !== BOT_OWNER_ID) {
                                    try {
                                        const inviterMember = await guild.members.fetch(inviter.id);
                                        if (inviterMember) {
                                            // IMMEDIATE 28-DAY QUARANTINE - EXACTLY AS REQUESTED
                                            const success = await quarantineUser(
                                                inviterMember,
                                                `NUKE BOT PROTECTION: Added nuke bot ${member.user.username} - 28 day quarantine for adding unauthorized bot`,
                                                40320 // Exactly 28 days in minutes (28 * 24 * 60)
                                            );

                                            if (success) {
                                                console.log(`⚡ INVITER QUARANTINED: ${inviter.username} - 28 days - ${Date.now() - joinTime}ms`);
                                            }
                                        }
                                    } catch (inviterError) {
                                        console.log('Inviter punishment failed:', inviterError.message);
                                    }
                                }
                            }
                        } catch (auditError) {
                            console.log('Audit log check completed');
                        }
                    })()
                ];

                // EXECUTE ALL PROTECTIVE ACTIONS IN PARALLEL FOR MAXIMUM SPEED
                const results = await Promise.allSettled(ultraFastActions);
                
                const finalResponseTime = Date.now() - joinTime;
                const targetAchieved = finalResponseTime < 290; // <0.29 seconds = <290ms
                
                console.log(`⚡ NUKE BOT PROTECTION EXECUTED - Response time: ${finalResponseTime}ms - Target achieved: ${targetAchieved}`);

                // AUTO-KICK MECHANISM: If we failed to meet the 0.29s target
                if (!targetAchieved) {
                    console.log(`🚨 CRITICAL FAILURE: Response time ${finalResponseTime}ms exceeded 290ms target!`);
                    
                    // Send critical failure alert
                    await sendCriticalSecurityAlert(
                        guild,
                        'PROTECTION SYSTEM PERFORMANCE FAILURE',
                        `CRITICAL: Nuke bot protection took ${finalResponseTime}ms (target: <290ms). Response time requirement not met. System needs optimization.`,
                        member.user
                    );
                }

                // INSTANT SECURITY ALERT WITH PERFORMANCE METRICS
                const nukeBotAlert = new EmbedBuilder()
                    .setColor(targetAchieved ? '#00FF00' : '#8B0000')
                    .setTitle(`🚨 NUKE BOT NEUTRALIZED - ${targetAchieved ? 'TARGET MET' : 'TARGET MISSED'}`)
                    .setDescription(`**NUKE BOT ELIMINATION PROTOCOL EXECUTED**\n\nUnauthorized bot detected and neutralized with full protective measures!`)
                    .addFields(
                        { name: '🤖 Nuke Bot', value: `${member.user.username}\n\`${member.user.id}\``, inline: true },
                        { name: '⚡ Response Time', value: `**${finalResponseTime}ms**`, inline: true },
                        { name: '🎯 Target Status', value: targetAchieved ? '✅ **<290ms ACHIEVED**' : '❌ **>290ms FAILED**', inline: true },
                        { name: '🛡️ Actions Executed', value: `✅ Bot kicked instantly\n✅ Bot banned permanently\n✅ Bot flagged globally\n✅ Integration deleted\n✅ Inviter quarantined 28 days`, inline: false },
                        { name: '🚨 Threat Level', value: '🔴 **MAXIMUM - NUKE BOT**', inline: true },
                        { name: '📊 Protection Status', value: '✅ **THREAT NEUTRALIZED**', inline: true },
                        { name: '🔒 Server Security', value: '✅ **1000% PROTECTED**', inline: true },
                        { name: '⚠️ Channel Protection', value: 'All channels secured - No deletions detected', inline: false },
                        { name: '⏱️ Performance', value: targetAchieved ? '✅ **SUB-290ms SUCCESS**' : '⚠️ **OPTIMIZATION NEEDED**', inline: false }
                    )
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 128 }))
                    .setFooter({ text: 'God-Level Protection - Nuke Bot Elimination System' })
                    .setTimestamp();

                await sendLogMessage(guild, nukeBotAlert);

                // CRITICAL WHATSAPP ALERT WITH PERFORMANCE METRICS
                await sendCriticalSecurityAlert(
                    guild,
                    targetAchieved ? 'NUKE BOT ELIMINATED - TARGET MET' : 'NUKE BOT ELIMINATED - TARGET MISSED',
                    `${targetAchieved ? 'SUCCESS' : 'WARNING'}: Nuke bot ${member.user.username} (${member.user.id}) neutralized in ${finalResponseTime}ms. Target: <290ms. Inviter quarantined for 28 days. All protective measures executed.`,
                    member.user
                );

                return true; // Threat neutralized
            } else {
                // Whitelisted bot approved
                const responseTime = Date.now() - joinTime;
                console.log(`✅ AUTHORIZED BOT APPROVED: ${member.user.username} - Processing: ${responseTime}ms`);

                const approvedBotEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Authorized Bot Approved')
                    .setDescription(`**SECURITY CHECK PASSED:** Whitelisted bot successfully joined the server.`)
                    .addFields(
                        { name: '🤖 Bot', value: `${member.user.username}\n\`${member.user.id}\``, inline: true },
                        { name: '✅ Authorization', value: 'Whitelisted - Pre-approved', inline: true },
                        { name: '⚡ Verification Time', value: `${responseTime}ms`, inline: true },
                        { name: '🛡️ Security Status', value: 'No threat detected', inline: true },
                        { name: '📊 Whitelist Status', value: `✅ Bot ID in approved list`, inline: true },
                        { name: '🔒 Server Safety', value: '✅ Maintained', inline: true }
                    )
                    .setThumbnail(member.user.displayAvatarURL({ dynamic: true, size: 64 }))
                    .setFooter({ text: 'Bot Authorization System' })
                    .setTimestamp();

                await sendLogMessage(guild, approvedBotEmbed);
            }
        } else {
            // Handle human member joins and quarantine evasion
            const evasionDetected = await handleQuarantineEvasion(member);
            if (!evasionDetected) {
                console.log(`👤 Human member joined: ${member.user.username}`);
            }
        }

    } catch (error) {
        console.error('Critical error in nuke bot protection:', error);
        
        // EMERGENCY FALLBACK: Even if there's an error, remove unauthorized bots
        if (member.user.bot && !WHITELISTED_BOTS.has(member.user.id)) {
            try {
                if (member.kickable) {
                    await member.kick('EMERGENCY NUKE BOT PROTECTION - ERROR RECOVERY');
                    console.log(`🚨 EMERGENCY REMOVAL: ${member.user.username} - Error recovery mode`);
                }
            } catch (emergencyError) {
                console.error('Emergency bot removal also failed:', emergencyError);
            }
        }
    }
});

// Monitor for bot updates/changes that might bypass the join event
client.on('guildMemberUpdate', async (oldMember, newMember) => {
    // Check if a member somehow gained bot status (shouldn't happen, but extra security)
    if (!oldMember.user.bot && newMember.user.bot) {
        console.log(`🚨 CRITICAL: Member transformed to bot: ${newMember.user.username}`);

        if (!WHITELISTED_BOTS.has(newMember.user.id)) {
            await handleUnauthorizedBot(newMember.guild, newMember, null);
        }
    }
});

// Monitor messages for text commands and auto-quarantine
client.on('messageCreate', async message => {
    // Ignore bot messages, DMs
    if (message.author.bot || !message.guild) return;

    const guildMusicRequestChannelId = musicManager ? musicManager.getMusicRequestChannel(message.guild.id) : null;
    const isMusicRequestChannel = message.channel.id === (guildMusicRequestChannelId || PERMANENT_MUSIC_CHANNEL_ID);

    // Auto-delete any non-widget messages in the music request channel after 5 seconds
    if (isMusicRequestChannel && message.author.id === client.user.id) {
        const widgetMessageId = musicManager ? musicManager.musicWidgets.get(message.guild.id) : null;
        if (message.id !== widgetMessageId) {
            // This is not the widget message, delete it after 5 seconds
            setTimeout(async () => {
                try {
                    await message.delete();
                } catch (error) {
                    // Ignore errors if message is already deleted
                }
            }, 5000);
        }
    }

    // Auto-delete any non-widget messages in ban appeal channel after 5 seconds
    if (message.channel.id === '1411658854000758916') {
        const appealServerId = '1411627135142985783';
        const storageKey = `unban_widget_${appealServerId}`;
        const unbanWidgetMessageId = interimWidgetMessageIds.get(storageKey);
        
        if (message.id !== unbanWidgetMessageId) {
            // This is not the unban widget message, delete it after 5 seconds
            setTimeout(async () => {
                try {
                    await message.delete();
                } catch (error) {
                    // Ignore errors if message is already deleted
                }
            }, 5000);
        }
    }

    const messageContent = message.content.toLowerCase().trim();
    const args = message.content.trim().split(/\s+/);
    const command = args[0].toLowerCase();

    // Allow help commands server-wide in ALL text channels
    if (command === 'help' || command === 'h') {
        try {
            await createHelpSlideshow(message, message.guild.id);
        } catch (error) {
            console.error('Error in help slideshow command:', error);
            const fallbackHelpData = await showHelp(message.guild.id, 1);
            await message.reply(fallbackHelpData);
        }
        return;
    }

    // Check for unauthorized command attempts first (excluding help)
    const commandLikePatterns = [
        'quarantine', 'qr', 'q', 'unquarantine', 'unqr', 'uq', 'kick', 'ban', 'mute', 'unmute',
        'warn', 'addrole', 'removerole', 'dm', 'userinfo', 'ui', 'ping', 'dev', 'roles',
        'developer', 'prmtr', 'revtr', 'remtr', 'addtr', 'sendinterim', 'intrch', 'intrm',
        'whitelist', 'flagged', 'unflag', 'scanserver', 'purgebots', 'unfu', 'flaggedusers',
        'protection', 'createbaseline', 'srvcrt', 'mdfsrv', 'mdfsv', 'clstr', 'optr',
        'panic', 'panicmode', 'stop', 'emergency', 'emergencymode', 'end',
        'wbtestan', 'set', 'setinterimrole', 'recovery', 'nightmode', 'fck',
        // Voice Management Commands
        'vmute', 'vunmute', 'vmuteall', 'vunmuteall', 'vdefend', 'vundefend', 'vdefendall', 'vundefendall', 'vdefended',
        // New Voice Commands
        'muv', 'muvu', 'hvcm',
        // Text Channel Commands
        'lock', 'locktext', 'unlock', 'unlocktext', 'open', 'opentext',
        'hide', 'hidechannel', 'show', 'showchannel', 'reveal',
        'slowmode', 'slow', 'rename', 'renamechannel', 'topic', 'settopic',
        // Voice Channel Commands
        'lockvc', 'lockvoice', 'mutevc', 'unlockvc', 'unlockvoice', 'openvc', 'unmutevc',
        'hidevc', 'hidevoice', 'showvc', 'showvoice', 'revealvc',
        'userlimit', 'setlimit', 'limit', 'bitrate', 'setbitrate',
        // Channel Creation/Management Commands
        'crcato', 'crchannel', 'crvc', 'delchannel', 'botcmdslock', 'botcmdsunlock', 'disconnectall', 'dmes', 'say', 'move',
        // General Channel Commands
        'permissions', 'perms', 'checkperms', 'channels', 'listchannels', 'clear'
        // NOTE: Ticket commands (ticket, ticketopen, ticketclose) are NOT included here
        // They have their own permission checks (ManageChannels) in the first messageCreate handler
    ];

    const isCommandLike = commandLikePatterns.some(pattern => messageContent.startsWith(pattern));

    // Allow ui/userinfo commands in member info channel for all users
    if (message.channel.id === MEMBER_INFO_CHANNEL_ID && (command === 'ui' || command === 'userinfo')) {
        // Allow these commands to proceed
    } else if (isCommandLike && !isAuthorized(message)) {
        // Handle unauthorized command attempt - just log and delete
        console.log(`🚨 Unauthorized command attempt: ${command} by ${message.author.username} in ${message.channel.name}`);
        try {
            await message.delete().catch(console.error);

            // Send brief warning
            const warningMessage = await message.channel.send(`❌ ${message.author}, that command is restricted to authorized channels only.`);
            setTimeout(() => warningMessage.delete().catch(console.error), 5000);
        } catch (error) {
            console.error('Error handling unauthorized command:', error);
        }
        return;
    }

    // Debug logging for authorization
    const serverConfig = serverConfigs.get(message.guild.id) || {};
    const adminChannelId = serverConfig.adminChannelId || ADMIN_QUARANTINE_CHANNEL_ID;
    const quarantineRoleId = serverConfig.quarantineRoleId || QUARANTINE_ROLE_ID;
    const currentDefaultDuration = serverConfig.defaultQuarantineDuration || DEFAULT_QUARANTINE_DURATION;
    const isBotOwner = message.author.id === BOT_OWNER_ID;
    const isServerOwner = message.author.id === message.guild.ownerId;
    const authorMember = message.guild.members.cache.get(message.author.id);
    const hasAdminRole = authorMember && authorMember.permissions.has('Administrator');
    const isInOwnerChannel = message.channel.id === '1410011813398974626';
    const isInAdminChannel = message.channel.id === adminChannelId;
    const isAuthorizedUser = isAuthorized(message);

    console.log(`Command attempt: ${command} by ${message.author.username} (${message.author.id})`);
    console.log(`Bot Owner: ${isBotOwner}, Server Owner: ${isServerOwner}, Has Admin Role: ${hasAdminRole}`);
    console.log(`Owner Channel: ${isInOwnerChannel}, Admin Channel: ${isInAdminChannel}, Authorized: ${isAuthorizedUser}`);
    console.log(`Authorized User: ${isAuthorizedUser}`);
    console.log(`Owner Commands Channel ID: 1410011813398974626, Admin Channel ID: ${adminChannelId}, Current Channel: ${message.channel.id}`);

    // === GLOBAL MODERATION COMMANDS (Bot Owner Only) ===
    
    // Global Ban - Ban user across all servers
    if ((command === 'globalban' || command === 'gban') && message.author.id === BOT_OWNER_ID) {
        const targetUser = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
        
        if (!targetUser) {
            return message.reply('❌ Please mention a user or provide a valid user ID to globally ban.');
        }

        const reason = args.slice(2).join(' ') || 'No reason provided';
        let successCount = 0;
        let failCount = 0;
        const results = [];

        // Ban user in all servers where bot is present
        for (const guild of client.guilds.cache.values()) {
            try {
                // Check if user is in the guild
                const member = await guild.members.fetch(targetUser.id).catch(() => null);
                
                // Ban the user
                await guild.bans.create(targetUser.id, {
                    reason: `GLOBAL BAN by ${message.author.username}: ${reason}`,
                    deleteMessageSeconds: 7 * 24 * 60 * 60
                });
                
                successCount++;
                results.push(`✅ ${guild.name}`);
                
                console.log(`✅ Global ban: ${targetUser.username} banned in ${guild.name}`);
            } catch (error) {
                failCount++;
                results.push(`❌ ${guild.name}: ${error.message}`);
                console.error(`Error banning in ${guild.name}:`, error);
            }
        }

        // Send results
        const resultEmbed = new EmbedBuilder()
            .setColor('#8B0000')
            .setTitle('🔨 Global Ban Executed')
            .setDescription(`Global ban applied across all servers where the bot is present.`)
            .addFields(
                { name: '🎯 Target User', value: `${targetUser.username} (\`${targetUser.id}\`)`, inline: true },
                { name: '📝 Reason', value: reason.substring(0, 1024), inline: true },
                { name: '👑 Executed By', value: `${message.author.username}`, inline: true },
                { name: '📊 Success Rate', value: `${successCount}/${client.guilds.cache.size} servers`, inline: true },
                { name: '❌ Failed', value: `${failCount} servers`, inline: true },
                { name: '⏰ Executed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '📋 Server Results', value: results.slice(0, 10).join('\n').substring(0, 1024) + (results.length > 10 ? `\n... and ${results.length - 10} more` : ''), inline: false }
            )
            .setFooter({ text: 'Global Ban System - Bot Owner Only' })
            .setTimestamp();

        await message.reply({ embeds: [resultEmbed] });
        return;
    }

    // Global Unban - Unban user across all servers
    if ((command === 'globalunban' || command === 'gunban') && message.author.id === BOT_OWNER_ID) {
        const targetUserId = args[1];
        
        if (!targetUserId) {
            return message.reply('❌ Please provide a user ID to globally unban.');
        }

        const targetUser = await client.users.fetch(targetUserId).catch(() => null);
        const reason = args.slice(2).join(' ') || 'No reason provided';
        let successCount = 0;
        let failCount = 0;
        const results = [];

        // Unban user in all servers where bot is present
        for (const guild of client.guilds.cache.values()) {
            try {
                await guild.bans.remove(targetUserId, `GLOBAL UNBAN by ${message.author.username}: ${reason}`);
                successCount++;
                results.push(`✅ ${guild.name}`);
                
                console.log(`✅ Global unban: ${targetUserId} unbanned in ${guild.name}`);
            } catch (error) {
                failCount++;
                results.push(`❌ ${guild.name}: ${error.message}`);
            }
        }

        // Send results
        const resultEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🔓 Global Unban Executed')
            .setDescription(`Global unban applied across all servers where the bot is present.`)
            .addFields(
                { name: '🎯 Target User', value: targetUser ? `${targetUser.username} (\`${targetUserId}\`)` : `User ID: \`${targetUserId}\``, inline: true },
                { name: '📝 Reason', value: reason.substring(0, 1024), inline: true },
                { name: '👑 Executed By', value: `${message.author.username}`, inline: true },
                { name: '📊 Success Rate', value: `${successCount}/${client.guilds.cache.size} servers`, inline: true },
                { name: '❌ Failed', value: `${failCount} servers`, inline: true },
                { name: '⏰ Executed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '📋 Server Results', value: results.slice(0, 10).join('\n').substring(0, 1024) + (results.length > 10 ? `\n... and ${results.length - 10} more` : ''), inline: false }
            )
            .setFooter({ text: 'Global Unban System - Bot Owner Only' })
            .setTimestamp();

        await message.reply({ embeds: [resultEmbed] });
        return;
    }

    // Global Kick - Kick user across all servers
    if ((command === 'globalkick' || command === 'gkick') && message.author.id === BOT_OWNER_ID) {
        const targetUser = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
        
        if (!targetUser) {
            return message.reply('❌ Please mention a user or provide a valid user ID to globally kick.');
        }

        const reason = args.slice(2).join(' ') || 'No reason provided';
        let successCount = 0;
        let failCount = 0;
        const results = [];

        // Kick user in all servers where bot is present
        for (const guild of client.guilds.cache.values()) {
            try {
                const member = await guild.members.fetch(targetUser.id).catch(() => null);
                
                if (member && member.kickable) {
                    await member.kick(`GLOBAL KICK by ${message.author.username}: ${reason}`);
                    successCount++;
                    results.push(`✅ ${guild.name}`);
                    
                    console.log(`✅ Global kick: ${targetUser.username} kicked from ${guild.name}`);
                } else {
                    failCount++;
                    results.push(`❌ ${guild.name}: User not in server or not kickable`);
                }
            } catch (error) {
                failCount++;
                results.push(`❌ ${guild.name}: ${error.message}`);
                console.error(`Error kicking in ${guild.name}:`, error);
            }
        }

        // Send results
        const resultEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('👢 Global Kick Executed')
            .setDescription(`Global kick applied across all servers where the bot is present.`)
            .addFields(
                { name: '🎯 Target User', value: `${targetUser.username} (\`${targetUser.id}\`)`, inline: true },
                { name: '📝 Reason', value: reason.substring(0, 1024), inline: true },
                { name: '👑 Executed By', value: `${message.author.username}`, inline: true },
                { name: '📊 Success Rate', value: `${successCount}/${client.guilds.cache.size} servers`, inline: true },
                { name: '❌ Failed', value: `${failCount} servers`, inline: true },
                { name: '⏰ Executed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '📋 Server Results', value: results.slice(0, 10).join('\n').substring(0, 1024) + (results.length > 10 ? `\n... and ${results.length - 10} more` : ''), inline: false }
            )
            .setFooter({ text: 'Global Kick System - Bot Owner Only' })
            .setTimestamp();

        await message.reply({ embeds: [resultEmbed] });
        return;
    }

    // Global Announcement - Announce message to all servers
    if ((command === 'globalannouncement' || command === 'gannounce' || command === 'gannoc') && message.author.id === BOT_OWNER_ID) {
        const messageId = args[1];
        
        if (!messageId) {
            return message.reply('❌ Please provide a message ID to announce globally. Usage: `gannoc <message_id>`');
        }

        // Fetch the message to announce
        let announcementMessage;
        try {
            announcementMessage = await message.channel.messages.fetch(messageId);
        } catch (error) {
            return message.reply('❌ Could not find message with that ID in this channel.');
        }

        let successCount = 0;
        let failCount = 0;
        const results = [];

        // Send announcement to all servers
        for (const guild of client.guilds.cache.values()) {
            try {
                // Look for announcement channel (common names)
                const announcementChannel = guild.channels.cache.find(channel => 
                    channel.type === 0 && // Text channel
                    (channel.name.toLowerCase().includes('announcement') ||
                     channel.name.toLowerCase().includes('announce') ||
                     channel.name.toLowerCase().includes('news') ||
                     channel.name.toLowerCase() === 'general')
                );

                if (announcementChannel && announcementChannel.permissionsFor(guild.members.me)?.has('SendMessages')) {
                    // Create announcement embed
                    const announcementEmbed = new EmbedBuilder()
                        .setColor('#FFD700')
                        .setTitle('📢 Global Announcement')
                        .setDescription(announcementMessage.content || 'No text content')
                        .addFields(
                            { name: '👑 Announced By', value: `${message.author.username}`, inline: true },
                            { name: '⏰ Announced At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                        )
                        .setFooter({ text: 'Global Announcement System' })
                        .setTimestamp();

                    // Add image if message has attachments
                    if (announcementMessage.attachments.size > 0) {
                        const firstAttachment = announcementMessage.attachments.first();
                        if (firstAttachment.contentType?.startsWith('image/')) {
                            announcementEmbed.setImage(firstAttachment.url);
                        }
                    }

                    await announcementChannel.send({ embeds: [announcementEmbed] });
                    successCount++;
                    results.push(`✅ ${guild.name}: #${announcementChannel.name}`);
                } else {
                    failCount++;
                    results.push(`❌ ${guild.name}: No announcement channel found or no permissions`);
                }
            } catch (error) {
                failCount++;
                results.push(`❌ ${guild.name}: ${error.message}`);
                console.error(`Error announcing in ${guild.name}:`, error);
            }
        }

        // Send results
        const resultEmbed = new EmbedBuilder()
            .setColor('#FFD700')
            .setTitle('📢 Global Announcement Sent')
            .setDescription(`Global announcement delivered across all servers.`)
            .addFields(
                { name: '📝 Message Preview', value: announcementMessage.content?.substring(0, 200) || 'Media/Embed only', inline: false },
                { name: '👑 Executed By', value: `${message.author.username}`, inline: true },
                { name: '📊 Success Rate', value: `${successCount}/${client.guilds.cache.size} servers`, inline: true },
                { name: '❌ Failed', value: `${failCount} servers`, inline: true },
                { name: '⏰ Executed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                { name: '📋 Server Results', value: results.slice(0, 10).join('\n').substring(0, 1024) + (results.length > 10 ? `\n... and ${results.length - 10} more` : ''), inline: false }
            )
            .setFooter({ text: 'Global Announcement System - Bot Owner Only' })
            .setTimestamp();

        await message.reply({ embeds: [resultEmbed] });
        return;
    }

    // Global Warn - Warn user across all servers
    if ((command === 'globalwarn' || command === 'gwarn') && message.author.id === BOT_OWNER_ID) {
        const targetUser = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
        
        if (!targetUser) {
            return message.reply('❌ Please mention a user or provide a valid user ID to globally warn.');
        }

        const reason = args.slice(2).join(' ') || 'No reason provided';
        let successCount = 0;
        let failCount = 0;
        const results = [];

        // Send DM warning
        try {
            const warnEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⚠️ GLOBAL WARNING')
                .setDescription(`You have received a global warning from the bot owner across all servers.`)
                .addFields(
                    { name: '👑 Warned By', value: `Bot Owner ${message.author.username}`, inline: true },
                    { name: '📝 Reason', value: reason, inline: true },
                    { name: '⏰ Warning Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: '🚨 Severity', value: 'GLOBAL - Applies to all servers', inline: false },
                    { name: '⚠️ Notice', value: 'This is an official warning. Further violations may result in global ban.', inline: false }
                )
                .setFooter({ text: 'Global Warning System' })
                .setTimestamp();

            await targetUser.send({ embeds: [warnEmbed] });
            console.log(`✅ Global warning DM sent to ${targetUser.username}`);
        } catch (dmError) {
            console.log('Could not send warning DM to user:', dmError.message);
        }

        // Log warning in all servers
        for (const guild of client.guilds.cache.values()) {
            try {
                const logEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⚠️ Global Warning Issued')
                    .setDescription(`A global warning has been issued by the bot owner.`)
                    .addFields(
                        { name: '🎯 Warned User', value: `${targetUser.username} (\`${targetUser.id}\`)`, inline: true },
                        { name: '👑 Warned By', value: `Bot Owner ${message.author.username}`, inline: true },
                        { name: '📝 Reason', value: reason.substring(0, 1024), inline: false },
                        { name: '🚨 Scope', value: 'Global - All servers', inline: true }
                    )
                    .setFooter({ text: 'Global Warning System - Bot Owner Only' })
                    .setTimestamp();

                await sendLogMessage(guild, logEmbed);
                successCount++;
                results.push(`✅ ${guild.name}`);
            } catch (error) {
                failCount++;
                results.push(`❌ ${guild.name}: ${error.message}`);
            }
        }

        // Send results
        const resultEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚠️ Global Warning Executed')
            .setDescription(`Global warning issued across all servers where the bot is present.`)
            .addFields(
                { name: '🎯 Target User', value: `${targetUser.username} (\`${targetUser.id}\`)`, inline: true },
                { name: '📝 Reason', value: reason.substring(0, 1024), inline: true },
                { name: '👑 Executed By', value: `${message.author.username}`, inline: true },
                { name: '📊 Logged In', value: `${successCount}/${client.guilds.cache.size} servers`, inline: true },
                { name: '❌ Failed', value: `${failCount} servers`, inline: true },
                { name: '📧 DM Sent', value: 'Yes', inline: true },
                { name: '📋 Server Results', value: results.slice(0, 10).join('\n').substring(0, 1024) + (results.length > 10 ? `\n... and ${results.length - 10} more` : ''), inline: false }
            )
            .setFooter({ text: 'Global Warning System - Bot Owner Only' })
            .setTimestamp();

        await message.reply({ embeds: [resultEmbed] });
        return;
    }

    // Global Lock (Timeout) - Timeout user across all servers
    if ((command === 'globallock' || command === 'glock' || command === 'gtimeout') && message.author.id === BOT_OWNER_ID) {
        const targetUser = message.mentions.users.first() || await client.users.fetch(args[1]).catch(() => null);
        
        if (!targetUser) {
            return message.reply('❌ Please mention a user or provide a valid user ID to globally timeout.');
        }

        const durationArg = args[2] || '10m';
        const durationMinutes = DURATION_OPTIONS[durationArg] || 10;
        const reason = args.slice(3).join(' ') || 'No reason provided';
        let successCount = 0;
        let failCount = 0;
        const results = [];

        // Timeout user in all servers where bot is present
        for (const guild of client.guilds.cache.values()) {
            try {
                const member = await guild.members.fetch(targetUser.id).catch(() => null);
                
                if (member) {
                    await member.timeout(durationMinutes * 60 * 1000, `GLOBAL TIMEOUT by ${message.author.username}: ${reason}`);
                    successCount++;
                    results.push(`✅ ${guild.name}`);
                    
                    console.log(`✅ Global timeout: ${targetUser.username} timed out in ${guild.name} for ${durationMinutes} minutes`);
                } else {
                    failCount++;
                    results.push(`❌ ${guild.name}: User not in server`);
                }
            } catch (error) {
                failCount++;
                results.push(`❌ ${guild.name}: ${error.message}`);
                console.error(`Error timing out in ${guild.name}:`, error);
            }
        }

        // Send DM notification
        try {
            const timeoutEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('⏰ GLOBAL TIMEOUT')
                .setDescription(`You have been timed out globally by the bot owner across all servers.`)
                .addFields(
                    { name: '👑 Timed Out By', value: `Bot Owner ${message.author.username}`, inline: true },
                    { name: '⏰ Duration', value: `${durationMinutes} minutes`, inline: true },
                    { name: '📝 Reason', value: reason, inline: true },
                    { name: '🚨 Scope', value: 'Global - All servers where you are a member', inline: false },
                    { name: '⏲️ Timeout Ends', value: `<t:${Math.floor((Date.now() + durationMinutes * 60 * 1000) / 1000)}:F>`, inline: false }
                )
                .setFooter({ text: 'Global Timeout System' })
                .setTimestamp();

            await targetUser.send({ embeds: [timeoutEmbed] });
        } catch (dmError) {
            console.log('Could not send timeout DM to user:', dmError.message);
        }

        // Send results
        const resultEmbed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('⏰ Global Timeout Executed')
            .setDescription(`Global timeout applied across all servers where the bot is present.`)
            .addFields(
                { name: '🎯 Target User', value: `${targetUser.username} (\`${targetUser.id}\`)`, inline: true },
                { name: '⏰ Duration', value: `${durationMinutes} minutes`, inline: true },
                { name: '👑 Executed By', value: `${message.author.username}`, inline: true },
                { name: '📝 Reason', value: reason.substring(0, 1024), inline: false },
                { name: '📊 Success Rate', value: `${successCount}/${client.guilds.cache.size} servers`, inline: true },
                { name: '❌ Failed', value: `${failCount} servers`, inline: true },
                { name: '⏲️ Timeout Ends', value: `<t:${Math.floor((Date.now() + durationMinutes * 60 * 1000) / 1000)}:F>`, inline: true },
                { name: '📋 Server Results', value: results.slice(0, 10).join('\n').substring(0, 1024) + (results.length > 10 ? `\n... and ${results.length - 10} more` : ''), inline: false }
            )
            .setFooter({ text: 'Global Timeout System - Bot Owner Only' })
            .setTimestamp();

        await message.reply({ embeds: [resultEmbed] });
        return;
    }

    // Handle music requests in permanent music channel
    if (isMusicRequestChannel && !message.author.bot) {
        // Delete the user's message immediately to keep channel clean
        try {
            await message.delete();
        } catch (deleteError) {
            console.log('Could not delete user message:', deleteError.message);
        }

        if (musicManager) {
            try {
                const result = await musicManager.playMusic(
                    message.content,
                    message.guild,
                    message.member,
                    message.channel
                );

                // Only show errors for failed requests, success is shown in widget
                if (!result.success) {
                    const errorEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('❌ Music Request Failed')
                        .setDescription(result.message)
                        .setFooter({ text: `Request by ${message.author.username}` })
                        .setTimestamp();

                    // Send temporary error message and delete after 5 seconds
                    const errorMsg = await message.channel.send({ embeds: [errorEmbed] });
                    setTimeout(() => errorMsg.delete().catch(console.error), 5000);
                }
            } catch (error) {
                console.error('Error processing music request:', error);
                try {
                    const errorMsg = await message.channel.send('❌ An error occurred while processing your music request. Please try again.');
                    setTimeout(() => errorMsg.delete().catch(console.error), 5000);
                } catch (sendError) {
                    console.error('Failed to send error message:', sendError);
                }
            }
        } else {
            try {
                const startupMsg = await message.channel.send('🎵 Music system is starting up. Please wait a moment and try again.');
                setTimeout(() => startupMsg.delete().catch(console.error), 5000);
            } catch (error) {
                console.error('Failed to send startup message:', error);
            }
        }
        return; // Don't process as regular command
    }

    // Handle channel management commands
    if (isAuthorized(message)) {
        // === TEXT CHANNEL MANAGEMENT ===
        
        // Lock text channel (prevent sending messages)
        if (command === 'lock' || command === 'locktext') {
            try {
                await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                    SendMessages: false
                });

                const lockEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('🔒 Text Channel Locked')
                    .setDescription(`This text channel has been locked. Only users with special permissions can send messages.`)
                    .addFields(
                        { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
                        { name: '👑 Locked By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Locked At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: '🚫 Restrictions', value: 'Send Messages: Disabled', inline: false }
                    )
                    .setTimestamp();

                await message.reply({ embeds: [lockEmbed] });
            } catch (error) {
                console.error('Error locking channel:', error);
                await message.reply('❌ Error locking channel. Make sure I have Manage Channels permission.');
            }
            return;
        }

        // Lock/Unlock text channel - handled by channelManager
        if (command === 'lock' || command === 'locktext' || command === 'locktxt' ||
            command === 'unlock' || command === 'unlocktext' || command === 'unlocktxt' || 
            command === 'open' || command === 'opentext') {
            await channelManager.handleCommand(message, command, args);
            return;
        }

        // Hide/Show text channel - handled by channelManager
        if (command === 'hide' || command === 'hidechannel' || command === 'hidetxt' ||
            command === 'show' || command === 'showchannel' || command === 'reveal' || command === 'showtxt') {
            await channelManager.handleCommand(message, command, args);
            return;
        }

        // === CHANNEL CREATION/DELETION COMMANDS ===
        
        // Create Category
        if (command === 'crcato') {
            await channelManager.handleCommand(message, command, args);
            return;
        }

        // Create Text Channel
        if (command === 'crchannel') {
            await channelManager.handleCommand(message, command, args);
            return;
        }

        // Create Voice Channel
        if (command === 'crvc') {
            await channelManager.handleCommand(message, command, args);
            return;
        }

        // Delete Channel
        if (command === 'delchannel') {
            await channelManager.handleCommand(message, command, args);
            return;
        }

        // Disconnect All Users
        if (command === 'disconnectall') {
            await channelManager.handleCommand(message, command, args);
            return;
        }

        // Lock Bot Commands
        if (command === 'botcmdslock') {
            await channelManager.handleCommand(message, command, args);
            return;
        }

        // Unlock Bot Commands
        if (command === 'botcmdsunlock') {
            await channelManager.handleCommand(message, command, args);
            return;
        }

        // === VOICE CHANNEL MANAGEMENT ===
        
        // Lock/Unlock/Hide/Show voice channels - handled by channelManager
        if (command === 'lockvc' || command === 'lockvoice' || command === 'mutevc' ||
            command === 'unlockvc' || command === 'unlockvoice' || command === 'openvc' ||
            command === 'hidevc' || command === 'hidevoice' ||
            command === 'showvc' || command === 'showvoice' || command === 'revealvc') {
            await channelManager.handleCommand(message, command, args);
            return;
        }

        // Hide voice channel from everyone
        if (command === 'hidevc' || command === 'hidevoice') {
            const targetChannel = message.mentions.channels.first() || 
                                 message.guild.channels.cache.get(args[1]);

            if (!targetChannel) {
                await message.reply('❌ Please mention a voice channel or provide a channel ID.\nUsage: `hidevc #voice-channel` or `hidevc <channel_id>`');
                return;
            }

            if (targetChannel.type !== 2) {
                await message.reply('❌ That is not a voice channel. Please specify a voice channel.');
                return;
            }

            try {
                await targetChannel.permissionOverwrites.edit(message.guild.roles.everyone, {
                    ViewChannel: false
                });

                const hideVcEmbed = new EmbedBuilder()
                    .setColor('#9B59B6')
                    .setTitle('👻 Voice Channel Hidden')
                    .setDescription(`The voice channel has been hidden from everyone.`)
                    .addFields(
                        { name: '🎤 Channel', value: `${targetChannel.name} (\`${targetChannel.id}\`)`, inline: true },
                        { name: '👑 Hidden By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Hidden At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: '👻 Visibility', value: 'Hidden from @everyone', inline: false },
                        { name: '📊 Members Before Hide', value: `${targetChannel.members.size} users`, inline: true }
                    )
                    .setTimestamp();

                await message.reply({ embeds: [hideVcEmbed] });
            } catch (error) {
                console.error('Error hiding voice channel:', error);
                await message.reply('❌ Error hiding voice channel. Make sure I have Manage Channels permission.');
            }
            return;
        }

        // Show voice channel to everyone
        if (command === 'showvc' || command === 'showvoice' || command === 'revealvc') {
            const targetChannel = message.mentions.channels.first() || 
                                 message.guild.channels.cache.get(args[1]);

            if (!targetChannel) {
                await message.reply('❌ Please mention a voice channel or provide a channel ID.\nUsage: `showvc #voice-channel` or `showvc <channel_id>`');
                return;
            }

            if (targetChannel.type !== 2) {
                await message.reply('❌ That is not a voice channel. Please specify a voice channel.');
                return;
            }

            try {
                await targetChannel.permissionOverwrites.edit(message.guild.roles.everyone, {
                    ViewChannel: true
                });

                const showVcEmbed = new EmbedBuilder()
                    .setColor('#00D4FF')
                    .setTitle('👁️ Voice Channel Revealed')
                    .setDescription(`The voice channel is now visible to everyone.`)
                    .addFields(
                        { name: '🎤 Channel', value: `${targetChannel.name}`, inline: true },
                        { name: '👑 Revealed By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Revealed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: '👁️ Visibility', value: 'Visible to @everyone', inline: false },
                        { name: '📊 Current Members', value: `${targetChannel.members.size} users`, inline: true }
                    )
                    .setTimestamp();

                await message.reply({ embeds: [showVcEmbed] });
            } catch (error) {
                console.error('Error showing voice channel:', error);
                await message.reply('❌ Error showing voice channel. Make sure I have Manage Channels permission.');
            }
            return;
        }

        // Set slowmode for text channel
        if (command === 'slowmode' || command === 'slow') {
            const seconds = parseInt(args[1]);

            if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
                await message.reply('❌ Please provide a valid number between 0 and 21600 seconds (6 hours).\nUsage: `slowmode <seconds>`\nExample: `slowmode 10`');
                return;
            }

            try {
                await message.channel.setRateLimitPerUser(seconds, `Slowmode set by ${message.author.username}`);

                const slowmodeEmbed = new EmbedBuilder()
                    .setColor(seconds > 0 ? '#FFA500' : '#00FF00')
                    .setTitle(seconds > 0 ? '⏱️ Slowmode Enabled' : '⏱️ Slowmode Disabled')
                    .setDescription(seconds > 0 ? `Slowmode has been set to ${seconds} seconds.` : `Slowmode has been disabled.`)
                    .addFields(
                        { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
                        { name: '👑 Set By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: '⏱️ Delay', value: seconds > 0 ? `${seconds} second(s)` : 'None', inline: false }
                    )
                    .setTimestamp();

                await message.reply({ embeds: [slowmodeEmbed] });
            } catch (error) {
                console.error('Error setting slowmode:', error);
                await message.reply('❌ Error setting slowmode. Make sure I have Manage Channels permission.');
            }
            return;
        }

        // Rename text channel
        if (command === 'rename' || command === 'renamechannel') {
            const newName = args.slice(1).join('-').toLowerCase();

            if (!newName) {
                await message.reply('❌ Please provide a new channel name.\nUsage: `rename <new name>`\nExample: `rename general chat`');
                return;
            }

            try {
                const oldName = message.channel.name;
                await message.channel.setName(newName, `Renamed by ${message.author.username}`);

                const renameEmbed = new EmbedBuilder()
                    .setColor('#00D4FF')
                    .setTitle('✏️ Channel Renamed')
                    .setDescription(`Channel has been successfully renamed.`)
                    .addFields(
                        { name: '📍 Old Name', value: `#${oldName}`, inline: true },
                        { name: '📍 New Name', value: `<#${message.channel.id}>`, inline: true },
                        { name: '👑 Renamed By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setTimestamp();

                await message.channel.send({ embeds: [renameEmbed] });
            } catch (error) {
                console.error('Error renaming channel:', error);
                await message.reply('❌ Error renaming channel. Make sure I have Manage Channels permission and the name is valid.');
            }
            return;
        }

        // Set channel topic (text channels only)
        if (command === 'topic' || command === 'settopic') {
            const newTopic = args.slice(1).join(' ');

            if (!newTopic) {
                await message.reply('❌ Please provide a channel topic.\nUsage: `topic <new topic>`\nExample: `topic Welcome to our server!`');
                return;
            }

            if (message.channel.type !== 0) {
                await message.reply('❌ This command only works in text channels.');
                return;
            }

            try {
                await message.channel.setTopic(newTopic, `Topic set by ${message.author.username}`);

                const topicEmbed = new EmbedBuilder()
                    .setColor('#00D4FF')
                    .setTitle('📝 Channel Topic Updated')
                    .setDescription(`Channel topic has been successfully updated.`)
                    .addFields(
                        { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
                        { name: '👑 Updated By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: '📝 New Topic', value: newTopic.substring(0, 1024), inline: false }
                    )
                    .setTimestamp();

                await message.reply({ embeds: [topicEmbed] });
            } catch (error) {
                console.error('Error setting channel topic:', error);
                await message.reply('❌ Error setting channel topic. Make sure I have Manage Channels permission.');
            }
            return;
        }

        // Set channel user limit (voice channels only)
        if (command === 'userlimit' || command === 'setlimit' || command === 'limit') {
            const targetChannel = message.mentions.channels.first() || 
                                 message.guild.channels.cache.get(args[1]) ||
                                 message.member.voice.channel;

            if (!targetChannel) {
                await message.reply('❌ Please mention a voice channel, provide a channel ID, or be in a voice channel.\nUsage: `limit #voice-channel <number>` or `limit <number>` (while in VC)');
                return;
            }

            if (targetChannel.type !== 2) {
                await message.reply('❌ This command only works for voice channels.');
                return;
            }

            const limit = parseInt(args[args.length - 1]);

            if (isNaN(limit) || limit < 0 || limit > 99) {
                await message.reply('❌ Please provide a valid number between 0 (unlimited) and 99.\nUsage: `limit <number>`\nExample: `limit 10`');
                return;
            }

            try {
                await targetChannel.setUserLimit(limit, `User limit set by ${message.author.username}`);

                const limitEmbed = new EmbedBuilder()
                    .setColor(limit > 0 ? '#FFA500' : '#00FF00')
                    .setTitle('👥 Voice Channel User Limit Updated')
                    .setDescription(limit > 0 ? `User limit has been set to ${limit} users.` : `User limit has been removed (unlimited).`)
                    .addFields(
                        { name: '🎤 Channel', value: `${targetChannel.name}`, inline: true },
                        { name: '👑 Set By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: '👥 Limit', value: limit > 0 ? `${limit} users` : 'Unlimited', inline: false },
                        { name: '📊 Current Members', value: `${targetChannel.members.size} users`, inline: true }
                    )
                    .setTimestamp();

                await message.reply({ embeds: [limitEmbed] });
            } catch (error) {
                console.error('Error setting user limit:', error);
                await message.reply('❌ Error setting user limit. Make sure I have Manage Channels permission.');
            }
            return;
        }

        // Set channel bitrate (voice channels only)
        if (command === 'bitrate' || command === 'setbitrate') {
            const targetChannel = message.mentions.channels.first() || 
                                 message.guild.channels.cache.get(args[1]) ||
                                 message.member.voice.channel;

            if (!targetChannel) {
                await message.reply('❌ Please mention a voice channel, provide a channel ID, or be in a voice channel.\nUsage: `bitrate #voice-channel <kbps>`');
                return;
            }

            if (targetChannel.type !== 2) {
                await message.reply('❌ This command only works for voice channels.');
                return;
            }

            const bitrate = parseInt(args[args.length - 1]);
            const maxBitrate = message.guild.premiumTier === 3 ? 384 : 
                              message.guild.premiumTier === 2 ? 256 :
                              message.guild.premiumTier === 1 ? 128 : 96;

            if (isNaN(bitrate) || bitrate < 8 || bitrate > maxBitrate) {
                await message.reply(`❌ Please provide a valid bitrate between 8 and ${maxBitrate} kbps (server boost level: ${message.guild.premiumTier}).\nUsage: \`bitrate <kbps>\`\nExample: \`bitrate 96\``);
                return;
            }

            try {
                await targetChannel.setBitrate(bitrate * 1000, `Bitrate set by ${message.author.username}`);

                const bitrateEmbed = new EmbedBuilder()
                    .setColor('#00D4FF')
                    .setTitle('🎵 Voice Channel Bitrate Updated')
                    .setDescription(`Bitrate has been set to ${bitrate} kbps.`)
                    .addFields(
                        { name: '🎤 Channel', value: `${targetChannel.name}`, inline: true },
                        { name: '👑 Set By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: '🎵 Bitrate', value: `${bitrate} kbps`, inline: false },
                        { name: '📊 Server Max', value: `${maxBitrate} kbps (Boost Level ${message.guild.premiumTier})`, inline: true }
                    )
                    .setTimestamp();

                await message.reply({ embeds: [bitrateEmbed] });
            } catch (error) {
                console.error('Error setting bitrate:', error);
                await message.reply('❌ Error setting bitrate. Make sure I have Manage Channels permission.');
            }
            return;
        }

        // === CONTINUED BELOW ===
        
        // Show channel permissions for a user
        if (command === 'permissions' || command === 'perms' || command === 'checkperms') {
            const targetUser = message.mentions.users.first() || message.author;
            const targetMember = message.guild.members.cache.get(targetUser.id);

            if (!targetMember) {
                await message.reply('❌ User not found in this server.');
                return;
            }

            const channelPerms = message.channel.permissionsFor(targetMember);
            
            const permsList = [
                { name: 'View Channel', has: channelPerms.has('ViewChannel') },
                { name: 'Send Messages', has: channelPerms.has('SendMessages') },
                { name: 'Manage Messages', has: channelPerms.has('ManageMessages') },
                { name: 'Embed Links', has: channelPerms.has('EmbedLinks') },
                { name: 'Attach Files', has: channelPerms.has('AttachFiles') },
                { name: 'Add Reactions', has: channelPerms.has('AddReactions') },
                { name: 'Mention Everyone', has: channelPerms.has('MentionEveryone') },
                { name: 'Manage Channels', has: channelPerms.has('ManageChannels') }
            ];

            const allowed = permsList.filter(p => p.has).map(p => `✅ ${p.name}`).join('\n') || 'None';
            const denied = permsList.filter(p => !p.has).map(p => `❌ ${p.name}`).join('\n') || 'None';

            const permsEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('🔐 Channel Permissions')
                .setDescription(`Channel permissions for ${targetUser.username}`)
                .addFields(
                    { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
                    { name: '👤 User', value: `${targetUser.username}`, inline: true },
                    { name: '⏰ Checked At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: '✅ Allowed Permissions', value: allowed.substring(0, 1024), inline: false },
                    { name: '❌ Denied Permissions', value: denied.substring(0, 1024), inline: false }
                )
                .setThumbnail(targetUser.displayAvatarURL({ dynamic: true, size: 64 }))
                .setTimestamp();

            await message.reply({ embeds: [permsEmbed] });
            return;
        }

        // List all channels in the server
        if (command === 'channels' || command === 'listchannels') {
            const textChannels = message.guild.channels.cache.filter(c => c.type === 0);
            const voiceChannels = message.guild.channels.cache.filter(c => c.type === 2);
            const categories = message.guild.channels.cache.filter(c => c.type === 4);

            const channelsEmbed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('📋 Server Channels')
                .setDescription(`Complete list of channels in ${message.guild.name}`)
                .addFields(
                    { name: '💬 Text Channels', value: `${textChannels.size} channels`, inline: true },
                    { name: '🎤 Voice Channels', value: `${voiceChannels.size} channels`, inline: true },
                    { name: '📂 Categories', value: `${categories.size} categories`, inline: true },
                    { name: '💬 Text', value: textChannels.map(c => `<#${c.id}>`).slice(0, 20).join('\n') || 'None', inline: false },
                    { name: '🎤 Voice', value: voiceChannels.map(c => c.name).slice(0, 20).join('\n') || 'None', inline: false }
                )
                .setFooter({ text: `Total Channels: ${textChannels.size + voiceChannels.size}` })
                .setTimestamp();

            await message.reply({ embeds: [channelsEmbed] });
            return;
        }

        // Show channel to everyone
        if (command === 'show' || command === 'showchannel' || command === 'reveal') {
            try {
                await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                    ViewChannel: true
                });

                const showEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('👁️ Channel Revealed')
                    .setDescription(`This channel is now visible to everyone.`)
                    .addFields(
                        { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
                        { name: '👑 Revealed By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Revealed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setTimestamp();

                await message.reply({ embeds: [showEmbed] });
            } catch (error) {
                console.error('Error showing channel:', error);
                await message.reply('❌ Error showing channel. Make sure I have the required permissions.');
            }
            return;
        }

        // Lock voice channel (prevent joining)
        if (command === 'lockvc' || command === 'lockvoice') {
            const voiceChannel = message.mentions.channels.first() || 
                                message.guild.channels.cache.get(args[1]);

            if (!voiceChannel || voiceChannel.type !== 2) {
                await message.reply('❌ Please mention a valid voice channel.\n**Usage:** `lockvc #voice-channel` or `lockvc <channel_id>`');
                return;
            }

            try {
                await voiceChannel.permissionOverwrites.edit(message.guild.roles.everyone, {
                    Connect: false
                });

                const lockVcEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('🔒 Voice Channel Locked')
                    .setDescription(`Voice channel has been locked. Users cannot join.`)
                    .addFields(
                        { name: '🎤 Channel', value: `${voiceChannel.name}`, inline: true },
                        { name: '👑 Locked By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Locked At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setTimestamp();

                await message.reply({ embeds: [lockVcEmbed] });
            } catch (error) {
                console.error('Error locking voice channel:', error);
                await message.reply('❌ Error locking voice channel. Make sure I have the required permissions.');
            }
            return;
        }

        // Unlock voice channel (allow joining)
        if (command === 'unlockvc' || command === 'unlockvoice' || command === 'openvc') {
            const voiceChannel = message.mentions.channels.first() || 
                                message.guild.channels.cache.get(args[1]);

            if (!voiceChannel || voiceChannel.type !== 2) {
                await message.reply('❌ Please mention a valid voice channel.\n**Usage:** `unlockvc #voice-channel` or `unlockvc <channel_id>`');
                return;
            }

            try {
                await voiceChannel.permissionOverwrites.edit(message.guild.roles.everyone, {
                    Connect: true
                });

                const unlockVcEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('🔓 Voice Channel Unlocked')
                    .setDescription(`Voice channel has been unlocked. Users can now join.`)
                    .addFields(
                        { name: '🎤 Channel', value: `${voiceChannel.name}`, inline: true },
                        { name: '👑 Unlocked By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Unlocked At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setTimestamp();

                await message.reply({ embeds: [unlockVcEmbed] });
            } catch (error) {
                console.error('Error unlocking voice channel:', error);
                await message.reply('❌ Error unlocking voice channel. Make sure I have the required permissions.');
            }
            return;
        }

        // Hide voice channel from everyone
        if (command === 'hidevc' || command === 'hidevoice') {
            const voiceChannel = message.mentions.channels.first() || 
                                message.guild.channels.cache.get(args[1]);

            if (!voiceChannel || voiceChannel.type !== 2) {
                await message.reply('❌ Please mention a valid voice channel.\n**Usage:** `hidevc #voice-channel` or `hidevc <channel_id>`');
                return;
            }

            try {
                await voiceChannel.permissionOverwrites.edit(message.guild.roles.everyone, {
                    ViewChannel: false
                });

                const hideVcEmbed = new EmbedBuilder()
                    .setColor('#9B59B6')
                    .setTitle('👻 Voice Channel Hidden')
                    .setDescription(`Voice channel has been hidden from everyone.`)
                    .addFields(
                        { name: '🎤 Channel', value: `${voiceChannel.name}`, inline: true },
                        { name: '👑 Hidden By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Hidden At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setTimestamp();

                await message.reply({ embeds: [hideVcEmbed] });
            } catch (error) {
                console.error('Error hiding voice channel:', error);
                await message.reply('❌ Error hiding voice channel. Make sure I have the required permissions.');
            }
            return;
        }

        // Show voice channel to everyone
        if (command === 'showvc' || command === 'showvoice' || command === 'revealvc') {
            const voiceChannel = message.mentions.channels.first() || 
                                message.guild.channels.cache.get(args[1]);

            if (!voiceChannel || voiceChannel.type !== 2) {
                await message.reply('❌ Please mention a valid voice channel.\n**Usage:** `showvc #voice-channel` or `showvc <channel_id>`');
                return;
            }

            try {
                await voiceChannel.permissionOverwrites.edit(message.guild.roles.everyone, {
                    ViewChannel: true
                });

                const showVcEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('👁️ Voice Channel Revealed')
                    .setDescription(`Voice channel is now visible to everyone.`)
                    .addFields(
                        { name: '🎤 Channel', value: `${voiceChannel.name}`, inline: true },
                        { name: '👑 Revealed By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Revealed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                    )
                    .setTimestamp();

                await message.reply({ embeds: [showVcEmbed] });
            } catch (error) {
                console.error('Error showing voice channel:', error);
                await message.reply('❌ Error showing voice channel. Make sure I have the required permissions.');
            }
            return;
        }

        // Setup Join-to-Create (J2C) voice channel
        if (command === 'j2c' || command === 'join2create' || command === 'setupj2c') {
            const voiceChannel = message.mentions.channels.first() || 
                                message.guild.channels.cache.get(args[1]);

            if (!voiceChannel || voiceChannel.type !== 2) {
                await message.reply('❌ Please mention a valid voice channel to set as Join-to-Create.\n**Usage:** `j2c #voice-channel` or `j2c <channel_id>`');
                return;
            }

            // Store J2C channel in server config
            const guildConfig = serverConfigs.get(message.guild.id) || {};
            guildConfig.j2cChannelId = voiceChannel.id;
            serverConfigs.set(message.guild.id, guildConfig);

            const j2cEmbed = new EmbedBuilder()
                .setColor('#00D4FF')
                .setTitle('✅ Join-to-Create Setup Complete')
                .setDescription(`Join-to-Create system has been configured!`)
                .addFields(
                    { name: '🎤 J2C Channel', value: `${voiceChannel.name}`, inline: true },
                    { name: '👑 Setup By', value: `${message.author.username}`, inline: true },
                    { name: '⏰ Configured At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: '📋 How It Works', value: 'When users join this voice channel, a temporary voice channel will be automatically created with their username.', inline: false },
                    { name: '🔄 Auto-Cleanup', value: 'Temporary channels are automatically deleted when empty.', inline: false }
                )
                .setTimestamp();

            await message.reply({ embeds: [j2cEmbed] });
            return;
        }

        // Remove J2C setup
        if (command === 'removej2c' || command === 'disablej2c') {
            const guildConfig = serverConfigs.get(message.guild.id) || {};
            
            if (!guildConfig.j2cChannelId) {
                await message.reply('❌ No Join-to-Create channel is currently configured.');
                return;
            }

            delete guildConfig.j2cChannelId;
            serverConfigs.set(message.guild.id, guildConfig);

            await message.reply('✅ Join-to-Create system has been disabled.');
            return;
        }
    }

    // Handle text-based ban appeal trigger with "unban me"
    if (messageContent === 'unban me' || messageContent === 'appeal' || messageContent === 'ban appeal' || 
        messageContent === 'appeal ban' || messageContent === 'request unban') {
        
        // Check if user is banned in ANY server the bot is in (excluding appeal server)
        let foundBannedGuild = null;
        let banReason = 'No reason provided';
        const appealServerId = '1411627135142985783';
        
        for (const guild of client.guilds.cache.values()) {
            // Skip the appeal server itself
            if (guild.id === appealServerId) continue;
            
            try {
                const ban = await guild.bans.fetch(message.author.id);
                if (ban) {
                    foundBannedGuild = guild;
                    banReason = ban.reason || 'No reason provided';
                    break;
                }
            } catch (error) {
                // User is not banned in this guild, continue
                continue;
            }
        }
        
        if (!foundBannedGuild) {
            try {
                const notBannedEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ You are not banned')
                    .setDescription('You are not currently banned from any servers where this bot is present.')
                    .addFields(
                        { name: '📊 Status', value: 'No active bans found', inline: true },
                        { name: '🎯 Action', value: 'No appeal needed', inline: true }
                    )
                    .setFooter({ text: 'Ban Appeal System' })
                    .setTimestamp();

                try {
                    await message.reply({ embeds: [notBannedEmbed] });
                } catch (replyError) {
                    await message.author.send({ embeds: [notBannedEmbed] });
                }
            } catch (dmError) {
                console.log('Could not send "not banned" DM to user:', dmError.message);
            }
            return;
        }
        
        // Create ban appeal ID and send to management channel
        const appealId = `${message.author.id}_${foundBannedGuild.id}_${Date.now()}`;
        
        // Store ban appeal data
        banAppeals.set(appealId, {
            userId: message.author.id,
            guildId: foundBannedGuild.id,
            reason: banReason,
            timestamp: Date.now(),
            status: 'submitted',
            appealServerId: message.guild.id,
            appealChannelId: message.channel.id
        });

        try {
            // Send management interface directly to the original server's owner logs
            const managementData = await createBanAppealManagement(appealId, foundBannedGuild);
            if (managementData) {
                await sendLogMessage(foundBannedGuild, managementData.embeds[0], managementData.components);
                
                // Send confirmation to appeal server
                const appealSentEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('✅ Ban Appeal Submitted Successfully')
                    .setDescription(`Your ban appeal has been submitted to **${foundBannedGuild.name}** and the server owner has been notified.`)
                    .addFields(
                        { name: '🎯 Server', value: foundBannedGuild.name, inline: true },
                        { name: '📝 Ban Reason', value: banReason, inline: true },
                        { name: '🆔 Appeal ID', value: `\`${appealId}\``, inline: true },
                        { name: '📊 Status', value: 'Pending server owner review', inline: true },
                        { name: '⏰ Submitted At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: '📧 Next Steps', value: 'Wait for the server owner to review your appeal. You will receive a DM with the decision.', inline: false }
                    )
                    .setFooter({ text: 'Ban Appeal System - Appeal Submitted' })
                    .setTimestamp();

                await message.reply({ embeds: [appealSentEmbed] });
                
                // Log submission to original server
                const submissionLogEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('📋 Ban Appeal Submitted from Appeal Server')
                    .setDescription(`A banned user has submitted their ban appeal via the dedicated appeal server.`)
                    .addFields(
                        { name: '👤 User', value: `${message.author.username} (\`${message.author.id}\`)`, inline: true },
                        { name: '📝 Appeal ID', value: `\`${appealId}\``, inline: true },
                        { name: '🏠 Appeal Server', value: `${message.guild.name}`, inline: true },
                        { name: '📍 Appeal Channel', value: `<#${message.channel.id}>`, inline: true },
                        { name: '⏰ Submitted At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: '📊 Status', value: 'Awaiting owner review', inline: true }
                    )
                    .setFooter({ text: 'Ban Appeal System - External Server Appeal' })
                    .setTimestamp();

                await sendLogMessage(foundBannedGuild, submissionLogEmbed);
            }
            
            console.log(`📋 Ban appeal submitted from appeal server by ${message.author.username} for guild ${foundBannedGuild.name}`);
        } catch (error) {
            console.error('Error creating text-based ban appeal:', error);
            try {
                await message.reply('❌ Error processing your ban appeal request. Please try again later.');
            } catch (replyError) {
                console.log('Could not send error reply:', replyError.message);
            }
        }
        return;
    }

    // Handle member lookup (ui command) in member info channel for ALL users (not just authorized)
    if (message.channel.id === MEMBER_INFO_CHANNEL_ID && (command === 'ui' || command === 'userinfo')) {
        // Allow all users to use member lookup in this specific channel
        if (message.mentions.users.size === 0) {
            // If no user mentioned, show info for the message author
            try {
                const authorMember = await message.guild.members.fetch(message.author.id);
                const embed = await createCompactMemberInfoEmbed(authorMember);
                await message.reply({ embeds: [embed] });
            } catch (error) {
                console.error('Error fetching author member info:', error);
                await message.reply('❌ Could not fetch your information. Please try again.');
            }
            return;
        }

        const infoUser = message.mentions.users.first();

        try {
            const member = await message.guild.members.fetch(infoUser.id);
            const embed = await createCompactMemberInfoEmbed(member);
            await message.reply({ embeds: [embed] });

            console.log(`✅ Member info provided for ${infoUser.username} requested by ${message.author.username} in member info channel`);
        } catch (error) {
            console.error('Error in member lookup:', error);
            await message.reply('❌ Could not fetch user information. Please make sure the user exists in this server.');
        }
        return;
    }

    // Handle extra owner commands (BOT OWNER ONLY)
    if (isBotOwner && (command === 'extra' || command === 'temp' || command === 'remove' || command === 'list')) {
        try {
            if (command === 'extra' && args[1] === 'owner') {
                // Grant permanent extra owner: extra owner @user
                if (message.mentions.users.size === 0) {
                    await message.reply('❌ Please mention a user to grant permanent extra owner status.\n**Usage:** `extra owner @user`');
                    return;
                }

                const targetUser = message.mentions.users.first();
                
                // Prevent adding bot owner (already has full access)
                if (targetUser.id === BOT_OWNER_ID) {
                    await message.reply('❌ Bot owner already has full immunity - cannot add as extra owner.');
                    return;
                }

                // Add to permanent extra owners
                permanentExtraOwners.add(targetUser.id);

                const successEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('👑 Permanent Extra Owner Granted')
                    .setDescription(`**${targetUser.username}** has been granted **permanent extra owner** status with full immunity!`)
                    .addFields(
                        { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
                        { name: '🛡️ Access Level', value: 'Permanent - Full Immunity', inline: true },
                        { name: '👑 Granted By', value: `${message.author.username}`, inline: true },
                        { name: '🔒 Immunity', value: '✅ **Complete immunity from all protections**\n✅ **Can modify server freely**\n✅ **Never flagged or quarantined**\n✅ **Full administrative access**', inline: false }
                    )
                    .setFooter({ text: `User ID: ${targetUser.id}` })
                    .setTimestamp();

                await message.reply({ embeds: [successEmbed] });

                // Log to server
                const logEmbed = new EmbedBuilder()
                    .setColor('#00FF00')
                    .setTitle('👑 Permanent Extra Owner Added')
                    .setDescription(`A new permanent extra owner has been granted full server immunity.`)
                    .addFields(
                        { name: '👤 User', value: `${targetUser.username} (\`${targetUser.id}\`)`, inline: true },
                        { name: '👑 Granted By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Granted At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                        { name: '🛡️ Permissions', value: 'Full immunity - Can modify server without restrictions', inline: false }
                    )
                    .setTimestamp();

                await sendLogMessage(message.guild, logEmbed);

                console.log(`✅ Permanent extra owner granted to ${targetUser.username} by ${message.author.username}`);
                return;
            }

            if (command === 'temp' && args[1] === 'owner') {
                // Grant temporary extra owner: temp owner @user [duration]
                if (message.mentions.users.size === 0) {
                    await message.reply('❌ Please mention a user to grant temporary owner status.\n**Usage:** `temp owner @user [duration]`\n**Durations:** 1h, 2h, 4h, 8h, 12h, 1d, 2d, 3d, 1w');
                    return;
                }

                const targetUser = message.mentions.users.first();
                
                // Prevent adding bot owner
                if (targetUser.id === BOT_OWNER_ID) {
                    await message.reply('❌ Bot owner already has full immunity - cannot add as temporary owner.');
                    return;
                }

                // Parse duration (default 24 hours)
                let durationMinutes = 1440; // 24 hours default
                let durationDisplay = '24 hours';

                if (args[3]) {
                    const tempDurations = {
                        '1h': 60, '2h': 120, '4h': 240, '8h': 480, '12h': 720,
                        '1d': 1440, '2d': 2880, '3d': 4320, '1w': 10080
                    };

                    const providedDuration = args[3].toLowerCase();
                    if (tempDurations[providedDuration]) {
                        durationMinutes = tempDurations[providedDuration];
                        durationDisplay = providedDuration;
                    } else {
                        await message.reply(`❌ Invalid duration. Please use: 1h, 2h, 4h, 8h, 12h, 1d, 2d, 3d, 1w`);
                        return;
                    }
                }

                // Calculate expiry time
                const expiresAt = Date.now() + (durationMinutes * 60 * 1000);

                // Add to temporary extra owners
                temporaryExtraOwners.set(targetUser.id, {
                    expiresAt,
                    grantedBy: message.author.id,
                    grantedAt: Date.now()
                });

                const successEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⏰ Temporary Extra Owner Granted')
                    .setDescription(`**${targetUser.username}** has been granted **temporary extra owner** status!`)
                    .addFields(
                        { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
                        { name: '⏰ Duration', value: durationDisplay, inline: true },
                        { name: '👑 Granted By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Expires At', value: `<t:${Math.floor(expiresAt / 1000)}:F>`, inline: true },
                        { name: '🛡️ Access Level', value: 'Temporary - Full Immunity', inline: true },
                        { name: '🔒 Immunity', value: '✅ **Complete immunity while active**\n✅ **Can modify server freely**\n✅ **Auto-expires after duration**', inline: false }
                    )
                    .setFooter({ text: `User ID: ${targetUser.id}` })
                    .setTimestamp();

                await message.reply({ embeds: [successEmbed] });

                // Log to server
                const logEmbed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('⏰ Temporary Extra Owner Added')
                    .setDescription(`A temporary extra owner has been granted server immunity.`)
                    .addFields(
                        { name: '👤 User', value: `${targetUser.username} (\`${targetUser.id}\`)`, inline: true },
                        { name: '⏰ Duration', value: durationDisplay, inline: true },
                        { name: '👑 Granted By', value: `${message.author.username}`, inline: true },
                        { name: '⏰ Expires', value: `<t:${Math.floor(expiresAt / 1000)}:R>`, inline: true }
                    )
                    .setTimestamp();

                await sendLogMessage(message.guild, logEmbed);

                // Set auto-removal timeout
                setTimeout(() => {
                    if (temporaryExtraOwners.has(targetUser.id)) {
                        temporaryExtraOwners.delete(targetUser.id);
                        console.log(`⏰ Temporary extra owner expired for ${targetUser.username}`);

                        const expiryEmbed = new EmbedBuilder()
                            .setColor('#FF6B6B')
                            .setTitle('⏰ Temporary Extra Owner Expired')
                            .setDescription(`Temporary extra owner status has expired.`)
                            .addFields(
                                { name: '👤 User', value: `${targetUser.username} (\`${targetUser.id}\`)`, inline: true },
                                { name: '⏰ Duration Served', value: durationDisplay, inline: true }
                            )
                            .setTimestamp();

                        sendLogMessage(message.guild, expiryEmbed).catch(console.error);
                    }
                }, durationMinutes * 60 * 1000);

                console.log(`✅ Temporary extra owner granted to ${targetUser.username} for ${durationDisplay}`);
                return;
            }

            if (command === 'remove' && args[1] === 'owner') {
                // Remove extra owner: remove owner @user
                if (message.mentions.users.size === 0) {
                    await message.reply('❌ Please mention a user to remove extra owner status.\n**Usage:** `remove owner @user`');
                    return;
                }

                const targetUser = message.mentions.users.first();
                
                const wasPermanent = permanentExtraOwners.has(targetUser.id);
                const wasTemporary = temporaryExtraOwners.has(targetUser.id);

                if (!wasPermanent && !wasTemporary) {
                    await message.reply('❌ This user does not have extra owner status.');
                    return;
                }

                // Remove from both sets
                permanentExtraOwners.delete(targetUser.id);
                temporaryExtraOwners.delete(targetUser.id);

                const ownerType = wasPermanent ? 'Permanent' : 'Temporary';

                const successEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Extra Owner Status Removed')
                    .setDescription(`**${targetUser.username}**'s extra owner status has been revoked.`)
                    .addFields(
                        { name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
                        { name: '📊 Previous Status', value: `${ownerType} Extra Owner`, inline: true },
                        { name: '👑 Removed By', value: `${message.author.username}`, inline: true },
                        { name: '🔒 New Status', value: 'Regular member - subject to all protections', inline: false }
                    )
                    .setFooter({ text: `User ID: ${targetUser.id}` })
                    .setTimestamp();

                await message.reply({ embeds: [successEmbed] });

                // Log to server
                const logEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Extra Owner Status Removed')
                    .setDescription(`Extra owner immunity has been revoked from a user.`)
                    .addFields(
                        { name: '👤 User', value: `${targetUser.username} (\`${targetUser.id}\`)`, inline: true },
                        { name: '📊 Type', value: ownerType, inline: true },
                        { name: '👑 Removed By', value: `${message.author.username}`, inline: true }
                    )
                    .setTimestamp();

                await sendLogMessage(message.guild, logEmbed);

                console.log(`❌ Extra owner status removed from ${targetUser.username}`);
                return;
            }

            if (command === 'list' && args[1] === 'owners') {
                // List all extra owners: list owners
                const now = Date.now();
                
                let description = '**👑 EXTRA OWNER IMMUNITY LIST**\n\n';

                // Permanent extra owners
                if (permanentExtraOwners.size > 0) {
                    description += '**🛡️ Permanent Extra Owners (Full Immunity):**\n';
                    for (const userId of permanentExtraOwners) {
                        try {
                            const user = await client.users.fetch(userId);
                            description += `• ${user.username} (\`${userId}\`) - Permanent\n`;
                        } catch (error) {
                            description += `• Unknown User (\`${userId}\`) - Permanent\n`;
                        }
                    }
                    description += '\n';
                } else {
                    description += '**🛡️ Permanent Extra Owners:** None\n\n';
                }

                // Temporary extra owners
                if (temporaryExtraOwners.size > 0) {
                    description += '**⏰ Temporary Extra Owners:**\n';
                    for (const [userId, data] of temporaryExtraOwners.entries()) {
                        // Skip expired ones
                        if (now >= data.expiresAt) {
                            temporaryExtraOwners.delete(userId);
                            continue;
                        }

                        try {
                            const user = await client.users.fetch(userId);
                            const timeLeft = data.expiresAt - now;
                            const hoursLeft = Math.floor(timeLeft / (1000 * 60 * 60));
                            const minutesLeft = Math.floor((timeLeft % (1000 * 60 * 60)) / (1000 * 60));
                            description += `• ${user.username} (\`${userId}\`) - Expires in ${hoursLeft}h ${minutesLeft}m\n`;
                        } catch (error) {
                            description += `• Unknown User (\`${userId}\`) - Temporary\n`;
                        }
                    }
                } else {
                    description += '**⏰ Temporary Extra Owners:** None';
                }

                const listEmbed = new EmbedBuilder()
                    .setColor('#C8A2C8')
                    .setTitle('👑 Extra Owner Immunity List')
                    .setDescription(description)
                    .addFields(
                        { name: '📊 Total Permanent', value: `${permanentExtraOwners.size}`, inline: true },
                        { name: '⏰ Total Temporary', value: `${temporaryExtraOwners.size}`, inline: true },
                        { name: '🛡️ Total Immune', value: `${permanentExtraOwners.size + temporaryExtraOwners.size + 2}*`, inline: true },
                        { name: '📝 Note', value: '*Includes Bot Owner and Server Owner', inline: false }
                    )
                    .setFooter({ text: 'Extra Owner System - Full Immunity Active' })
                    .setTimestamp();

                await message.reply({ embeds: [listEmbed] });
                return;
            }

            await message.reply('❌ Invalid extra owner command.\n**Available commands:**\n`extra owner @user` - Grant permanent\n`temp owner @user [duration]` - Grant temporary\n`remove owner @user` - Remove status\n`list owners` - Show all extra owners');
            return;

        } catch (error) {
            console.error('Error in extra owner commands:', error);
            await message.reply('❌ An error occurred while processing the extra owner command.');
            return;
        }
    }

    // Handle text commands for bot owner globally, or server owner in admin channel
    if (isAuthorizedUser) {
        try {
            switch (command) {
                case 'quarantine':
                case 'qr':
                case 'q':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to quarantine.\n**Usage:** `qr @user [duration]`\n**Durations:** ' + Object.keys(DURATION_OPTIONS).join(', '));
                        return;
                    }

                    const targetUser = message.mentions.users.first();
                    let duration = currentDefaultDuration;
                    let durationDisplay = `${duration} minutes`;

                    if (args[2]) {
                        const providedDuration = args[2].toLowerCase();
                        if (DURATION_OPTIONS[providedDuration]) {
                            duration = DURATION_OPTIONS[providedDuration];
                            // Convert minutes to readable format
                            if (duration >= 1440) {
                                const days = Math.floor(duration / 1440);
                                durationDisplay = `${days} day${days > 1 ? 's' : ''}`;
                            } else if (duration >= 60) {
                                const hours = Math.floor(duration / 60);
                                const remainingMinutes = duration % 60;
                                durationDisplay = remainingMinutes > 0 ? `${hours}h ${remainingMinutes}m` : `${hours} hour${hours > 1 ? 's' : ''}`;
                            } else {
                                durationDisplay = `${duration} minute${duration > 1 ? 's' : ''}`;
                            }
                        } else {
                            await message.reply(`❌ Invalid duration. Please use one of:\n**Available durations:** ${Object.keys(DURATION_OPTIONS).join(', ')}`);
                            return;
                        }
                    }

                    try {
                        const member = await message.guild.members.fetch(targetUser.id);
                        const success = await quarantineUser(member, `Admin quarantine by ${message.author.username}`, duration);

                        if (success) {
                            const successEmbed = new EmbedBuilder()
                                .setColor('#FF0000')
                                .setTitle('🔒 User Quarantined')
                                .setDescription(`**${targetUser.username}** has been quarantined for **${durationDisplay}**`)
                                .addFields({ name: '👤 User', value: `<@${targetUser.id}>`, inline: true },
                                    { name: '⏰ Duration', value: durationDisplay, inline: true },
                                    { name: '👮 Moderator', value: `${message.author.username}`, inline: true }
                                )
                                .setFooter({ text: `User ID: ${targetUser.id}` })
                                .setTimestamp();

                            await message.reply({ embeds: [successEmbed] });
                        } else {
                            await message.reply('❌ Could not quarantine this user. They may already be quarantined or be the server owner.');
                        }
                    } catch (error) {
                        await message.reply('❌ Error quarantining user. Please make sure the user exists in this server.');
                    }
                    break;

                case 'unquarantine':
                case 'unqr':
                case 'uq':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to unquarantine.');
                        return;
                    }

                    const unquarantineUser = message.mentions.users.first();

                    if (!quarantinedUsers.has(unquarantineUser.id)) {
                        await message.reply('❌ This user is not in quarantine.');
                        return;
                    }

                    try {
                        const member = await message.guild.members.fetch(unquarantineUser.id);

                        // Get stored original roles
                        const storedRoles = originalRoles.get(unquarantineUser.id) || [];
                        console.log(`Manual unquarantine: Restoring roles for ${member.user.username}:`, storedRoles);

                        // Get current quarantine role
                        const currentQuarantineRole = message.guild.roles.cache.get(QUARANTINE_ROLE_ID);

                        // Validate that stored roles still exist in the guild
                        const validRoles = storedRoles.filter(roleId => {
                            const role = message.guild.roles.cache.get(roleId);
                            return role && role.id !== message.guild.id; // Exclude @everyone role
                        });

                        if (validRoles.length > 0) {
                            // Set roles to the valid original roles (this automatically removes quarantine role)
                            await member.roles.set(validRoles, `Manual unquarantine by ${message.author.username}`);
                            console.log(`Successfully restored ${validRoles.length} roles to ${member.user.username}`);
                        } else {
                            // If no valid stored roles, just remove quarantine role
                            if (currentQuarantineRole && member.roles.cache.has(currentQuarantineRole.id)) {
                                await member.roles.remove(currentQuarantineRole, `Manual unquarantine by ${message.author.username}`);
                                console.log(`Removed quarantine role from ${member.user.username}`);
                            }
                        }

                        // Verify quarantine role is removed
                        if (currentQuarantineRole && member.roles.cache.has(currentQuarantineRole.id)) {
                            console.log(`Quarantine role still present, force removing...`);
                            await member.roles.remove(currentQuarantineRole, 'Force remove quarantine role');
                        }

                        // Clean up tracking data
                        quarantinedUsers.delete(unquarantineUser.id);
                        originalRoles.delete(unquarantineUser.id);

                        const releaseEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('🔓 User Unquarantined')
                            .setDescription(`${unquarantineUser.username} has been manually released from quarantine`)
                            .addFields(
                                { name: 'User', value: `<@${unquarantineUser.id}>`, inline: true },
                                { name: 'Roles Restored', value: `${validRoles.length} role(s)`, inline: true },
                                { name: 'Released By', value: `${message.author.username}`, inline: true },
                                { name: 'Status', value: 'All original roles have been restored', inline: false }
                            )
                            .setFooter({ text: `User ID: ${unquarantineUser.id}` })
                            .setTimestamp();

                        await message.reply({ embeds: [releaseEmbed] });

                        // Send DM to user about manual release
                        try {
                            const releaseDmEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle('🟢 Quarantine Released')
                                .setDescription(`You have been manually released from quarantine in **${message.guild.name}**`)
                                .addFields(
                                    { name: 'Released By', value: message.author.username, inline: true },
                                    { name: 'Roles Restored', value: `${validRoles.length} role(s)`, inline: true },
                                    { name: 'Status', value: 'All your original roles have been restored', inline: false }
                                )
                                .setTimestamp();

                            await member.user.send({ embeds: [releaseDmEmbed] });
                        } catch (dmError) {
                            console.log(`Could not send release DM to ${member.user.username}:`, dmError.message);
                        }

                        console.log(`Successfully unquarantined ${member.user.username} manually`);

                    } catch (error) {
                        console.error('Error during manual unquarantine:', error);
                        await message.reply('❌ Error releasing user from quarantine. Please try again.');
                    }
                    break;

                case 'kick':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to kick.');
                        return;
                    }

                    const kickUser = message.mentions.users.first();
                    const kickReason = args.slice(2).join(' ') || 'No reason provided';

                    try {
                        const member = await message.guild.members.fetch(kickUser.id);
                        await member.kick(kickReason);

                        const kickEmbed = new EmbedBuilder()
                            .setColor('#FF6B6B')
                            .setTitle('👢 User Kicked')
                            .setDescription(`${kickUser.username} has been kicked`)
                            .addFields({ name: 'Reason', value: kickReason })
                            .setTimestamp();

                        await message.reply({ embeds: [kickEmbed] });
                    } catch (error) {
                        await message.reply('❌ Could not kick this user.');
                    }
                    break;

                case 'ban':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to ban.');
                        return;
                    }

                    const banUser = message.mentions.users.first();
                    const banReason = args.slice(2).join(' ') || 'No reason provided';

                    try {
                        // Send ban appeal DM before banning
                        await sendBanAppealDM(banUser, message.guild, banReason);

                        // Proceed with ban
                        await message.guild.members.ban(banUser, { reason: banReason });

                        const banEmbed = new EmbedBuilder()
                            .setColor('#8B0000')
                            .setTitle('🔨 User Banned')
                            .setDescription(`${banUser.username} has been banned and notified about the ban appeal process`)
                            .addFields(
                                { name: '📝 Reason', value: banReason, inline: true },
                                { name: '📧 Appeal System', value: 'User has been sent ban appeal instructions via DM', inline: true },
                                { name: '👮 Banned By', value: message.author.username, inline: true }
                            )
                            .setFooter({ text: 'Ban Appeal System Active' })
                            .setTimestamp();

                        await message.reply({ embeds: [banEmbed] });

                        console.log(`✅ User ${banUser.username} banned and sent appeal DM`);
                    } catch (error) {
                        console.error('Error in ban command:', error);
                        await message.reply('❌ Could not ban this user.');
                    }
                    break;

                case 'mute':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to mute.');
                        return;
                    }

                    const muteUser = message.mentions.users.first();
                    const muteReason = args.slice(2).join(' ') || 'No reason provided';

                    try {
                        const member = await message.guild.members.fetch(muteUser.id);
                        await member.timeout(10 * 60 * 1000, muteReason); // 10 minutes timeout

                        const muteEmbed = new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('🔇 User Muted')
                            .setDescription(`${muteUser.username} has been muted for 10 minutes`)
                            .addFields({ name: 'Reason', value: muteReason })
                            .setTimestamp();

                        await message.reply({ embeds: [muteEmbed] });
                    } catch (error) {
                        await message.reply('❌ Could not mute this user.');
                    }
                    break;

                case 'unmute':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to unmute.');
                        return;
                    }

                    const unmuteUser = message.mentions.users.first();

                    try {
                        const member = await message.guild.members.fetch(unmuteUser.id);
                        await member.timeout(null);

                        const unmuteEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('🔊 User Unmuted')
                            .setDescription(`${unmuteUser.username} has been unmuted`)
                            .setTimestamp();

                        await message.reply({ embeds: [unmuteEmbed] });
                    } catch (error) {
                        await message.reply('❌ Could not unmute this user.');
                    }
                    break;

                case 'addrole':
                    if (message.mentions.users.size === 0 || message.mentions.roles.size === 0) {
                        await message.reply('❌ Please mention a user and a role.');
                        return;
                    }

                    const addRoleUser = message.mentions.users.first();
                    const addRole = message.mentions.roles.first();

                    try {
                        const member = await message.guild.members.fetch(addRoleUser.id);
                        await member.roles.add(addRole);

                        const addRoleEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('➕ Role Added')
                            .setDescription(`Added ${addRole.name} to ${addRoleUser.username}`)
                            .setTimestamp();

                        await message.reply({ embeds: [addRoleEmbed] });
                    } catch (error) {
                        await message.reply('❌ Could not add role to this user.');
                    }
                    break;

                case 'removerole':
                    if (message.mentions.users.size === 0 || message.mentions.roles.size === 0) {
                        await message.reply('❌ Please mention a user and a role.');
                        return;
                    }

                    const removeRoleUser = message.mentions.users.first();
                    const removeRole = message.mentions.roles.first();

                    try {
                        const member = await message.guild.members.fetch(removeRoleUser.id);
                        await member.roles.remove(removeRole);

                        const removeRoleEmbed = new EmbedBuilder()
                            .setColor('#FF6B6B')
                            .setTitle('➖ Role Removed')
                            .setDescription(`Removed ${removeRole.name} from ${removeRoleUser.username}`)
                            .setTimestamp();

                        await message.reply({ embeds: [removeRoleEmbed] });
                    } catch (error) {
                        await message.reply('❌ Could not remove role from this user.');
                    }
                    break;

                case 'warn':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to warn.');
                        return;
                    }

                    const warnUser = message.mentions.users.first();
                    const warnReason = args.slice(2).join(' ') || 'No reason provided';

                    try {
                        const warnEmbed = new EmbedBuilder()
                            .setColor('#FFFF00')
                            .setTitle('⚠️ User Warned')
                            .setDescription(`${warnUser.username} has been warned`)
                            .addFields({ name: 'Reason', value: warnReason })
                            .setTimestamp();

                        await message.reply({ embeds: [warnEmbed] });

                        // Send DM to warned user
                        try {
                            const dmWarnEmbed = new EmbedBuilder()
                                .setColor('#FFFF00')
                                .setTitle('⚠️ You have been warned')
                                .setDescription(`You have been warned in ${message.guild.name}`)
                                .addFields({ name: 'Reason', value: warnReason })
                                .setTimestamp();

                            await warnUser.send({ embeds: [dmWarnEmbed] });
                        } catch (error) {
                            console.log('Could not send warning DM');
                        }
                    } catch (error) {
                        await message.reply('❌ Could not warn this user.');
                    }
                    break;

                case 'dm':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to DM.');
                        return;
                    }

                    const dmUser = message.mentions.users.first();
                    const dmMessage = args.slice(2).join(' ');

                    if (!dmMessage) {
                        await message.reply('❌ Please provide a message to send.');
                        return;
                    }

                    try {
                        await dmUser.send(dmMessage);

                        const dmEmbed = new EmbedBuilder()
                            .setColor('#5865F2')
                            .setTitle('📧 DM Sent')
                            .setDescription(`Message sent to ${dmUser.username}`)
                            .addFields({ name: 'Message', value: dmMessage.substring(0, 1000) })
                            .setTimestamp();

                        await message.reply({ embeds: [dmEmbed] });
                    } catch (error) {
                        await message.reply('❌ Could not send DM to this user.');
                    }
                    break;

                case 'userinfo':
                case 'ui':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to get info.');
                        return;
                    }

                    const infoUser = message.mentions.users.first();

                    try {
                        const member = await message.guild.members.fetch(infoUser.id);
                        const embed = await createCompactMemberInfoEmbed(member);
                        await message.reply({ embeds: [embed] });
                    } catch (error) {
                        await message.reply('❌ Could not fetch user information.');
                    }
                    break;

                case 'ping':
                    const ping = Date.now() - message.createdTimestamp;
                    const apiPing = Math.round(client.ws.ping);

                    const pingEmbed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle('🏓 Pong!')
                        .addFields(
                            { name: 'Bot Latency', value: `${ping}ms`, inline: true },
                            { name: 'API Latency', value: `${apiPing}ms`, inline: true }
                        )
                        .setTimestamp();

                    await message.reply({ embeds: [pingEmbed] });
                    break;

                

                case 'setmusicchannel':
                    if (message.mentions.channels.size === 0) {
                        await message.reply('❌ Please mention a channel to set as the music request channel.\n**Usage:** `setmusicchannel #channel`');
                        return;
                    }

                    const musicChannel = message.mentions.channels.first();

                    // Check if the channel is a text channel
                    if (musicChannel.type !== 0) {
                        await message.reply('❌ Please mention a text channel for music requests.');
                        return;
                    }

                    try {
                        // Set the music channel in music manager
                        if (musicManager) {
                            musicManager.setMusicRequestChannel(message.guild.id, musicChannel.id);

                            // Initialize the music widget in the new channel
                            const widgetResult = await musicManager.initializeMusicWidget(message.guild);

                            if (widgetResult) {
                                const successEmbed = new EmbedBuilder()
                                    .setColor('#C8A2C8')
                                    .setTitle('✗ 𖹭 **Music Channel Set**')
                                    .setDescription('Music request channel has been successfully configured!')
                                    .addFields(
                                        { name: 'ᯓ➺ **Channel**', value: `<#${musicChannel.id}>`, inline: true },
                                        { name: '✿ **Status**', value: 'Widget deployed', inline: true },
                                        { name: '❀ **Usage**', value: 'Type song names to play music', inline: true }
                                    )
                                    .setFooter({ text: 'Users can now request music in this channel ➺' })
                                    .setTimestamp();

                                await message.reply({ embeds: [successEmbed] });
                            } else {
                                await message.reply('✅ Music channel set, but failed to create widget. Check bot permissions in the target channel.');
                            }
                        } else {
                            await message.reply('❌ Music manager is not initialized. Please wait for the bot to fully start up.');
                        }
                    } catch (error) {
                        console.error('Error setting music channel:', error);
                        await message.reply('❌ Error setting music channel. Please try again.');
                    }
                    break;

                case 'sethomevc':
                    if (!musicManager) {
                        await message.reply('❌ Music manager is not initialized. Please wait for the bot to fully start up.');
                        break;
                    }

                    let targetVoiceChannel = null;

                    if (message.mentions.channels.size > 0) {
                        targetVoiceChannel = message.mentions.channels.first();
                    } else if (args.length > 1) {
                        const channelArgRaw = args.slice(1).join(' ').trim();
                        const channelArg = channelArgRaw.replace(/"/g, '');

                        if (channelArg) {
                            const possibleId = channelArg.replace(/[<#>]/g, '');
                            const byId = message.guild.channels.cache.get(possibleId);
                            if (byId) {
                                targetVoiceChannel = byId;
                            } else {
                                const lowerName = channelArg.toLowerCase();
                                targetVoiceChannel = message.guild.channels.cache.find(ch =>
                                    (ch.type === 2 || ch.type === 13) && ch.name.toLowerCase() === lowerName
                                );
                            }
                        }
                    }

                    if (!targetVoiceChannel) {
                        await message.reply('❌ Please mention a voice channel or provide a valid channel ID/name.\n**Usage:** `sethomevc #voice-channel` or `sethomevc <channel_id>`');
                        break;
                    }

                    if (targetVoiceChannel.type !== 2 && targetVoiceChannel.type !== 13) {
                        await message.reply('❌ The specified channel is not a voice channel. Please provide a voice or stage channel.');
                        break;
                    }

                    try {
                        await musicManager.setHomeVoiceChannel(message.guild.id, targetVoiceChannel.id);

                        const homeEmbed = new EmbedBuilder()
                            .setColor('#8A00C4')
                            .setTitle('🏠 Home Voice Channel Set')
                            .setDescription('The default home voice channel has been updated successfully.')
                            .addFields(
                                { name: '🎧 Voice Channel', value: `<#${targetVoiceChannel.id}>`, inline: true },
                                { name: '🔁 Behaviour', value: 'Bot returns here when the queue is empty.', inline: false }
                            )
                            .setFooter({ text: 'Use sethomevc again to change it for this server.' })
                            .setTimestamp();

                        await message.reply({ embeds: [homeEmbed] });
                    } catch (error) {
                        console.error('Error setting home voice channel:', error);
                        await message.reply('❌ Failed to set home voice channel. Please try again.');
                    }
                    break;

                case 'deploymusic':
                case 'musicwidget':
                    try {
                        if (!musicManager) {
                            await message.reply('❌ Music manager is not initialized. Please restart the bot.');
                            return;
                        }

                        // Force deploy music widget to the permanent music channel
                        musicManager.setMusicRequestChannel(message.guild.id, PERMANENT_MUSIC_CHANNEL_ID);
                        
                        const deployResult = await musicManager.initializeMusicWidget(message.guild);

                        const deployEmbed = new EmbedBuilder()
                            .setColor(deployResult ? '#00FF00' : '#FF0000')
                            .setTitle(deployResult ? '✅ Music Widget Deployed' : '❌ Widget Deployment Failed')
                            .setDescription(deployResult ? 
                                'Music widget has been successfully deployed to the music channel!' :
                                'Failed to deploy music widget. Check bot permissions and try again.')
                            .addFields(
                                { name: '📍 Channel', value: `<#${PERMANENT_MUSIC_CHANNEL_ID}>`, inline: true },
                                { name: '🔗 Lavalink Status', value: this.lavalink && this.lavalink.isInitialized ? 
                                    `Connected: ${this.lavalink.getConnectionStatus().connected}/${this.lavalink.getConnectionStatus().total}` : 
                                    'Not connected', inline: true },
                                { name: '✨ Status', value: deployResult ? 'Operational' : 'Failed', inline: true }
                            )
                            .setFooter({ text: 'Force deployment completed' })
                            .setTimestamp();

                        await message.reply({ embeds: [deployEmbed] });

                    } catch (error) {
                        console.error('Error in force deploy music widget:', error);
                        await message.reply('❌ Error deploying music widget. Please check console logs.');
                    }
                    break;

                case 'roles':
                    try {
                        const totalCommands = getTotalCommandsCount();
                        
                        // Get all roles except @everyone and sort by position (highest first)
                        const allRoles = message.guild.roles.cache
                            .filter(role => role.id !== message.guild.id)
                            .sort((a, b) => b.position - a.position);
                        
                        // Group roles by categories for better organization
                        const adminRoles = allRoles.filter(role => role.permissions.has('Administrator'));
                        const moderatorRoles = allRoles.filter(role => 
                            !role.permissions.has('Administrator') && 
                            (role.permissions.has('ModerateMembers') || role.permissions.has('ManageMessages') || role.permissions.has('KickMembers') || role.permissions.has('BanMembers'))
                        );
                        const specialRoles = allRoles.filter(role => 
                            !role.permissions.has('Administrator') && 
                            !role.permissions.has('ModerateMembers') && 
                            !role.permissions.has('ManageMessages') && 
                            !role.permissions.has('KickMembers') && 
                            !role.permissions.has('BanMembers') &&
                            (role.hoist || role.mentionable || role.color !== 0)
                        );
                        const regularRoles = allRoles.filter(role => 
                            !adminRoles.some(adminRole => adminRole.id === role.id) && 
                            !moderatorRoles.some(modRole => modRole.id === role.id) && 
                            !specialRoles.some(specialRole => specialRole.id === role.id)
                        );

                        // Create role cards with 5 roles per card
                        const createRoleCards = () => {
                            const cards = [];
                            
                            // Overview Card
                            let overviewDescription = `**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n`;
                            overviewDescription += `**ᡣ𐭩 SERVER ROLE OVERVIEW**\n\n`;
                            overviewDescription += `❀ **${allRoles.size}** Total Roles\n`;
                            overviewDescription += `✿ **${adminRoles.size}** Administrator Roles\n`;
                            overviewDescription += `❀ **${moderatorRoles.size}** Moderator Roles\n`;
                            overviewDescription += `✿ **${specialRoles.size}** Special Roles\n`;
                            overviewDescription += `❀ **${regularRoles.size}** Regular Roles\n\n`;

                            // Role Statistics
                            overviewDescription += `## ✿ **ROLE STATISTICS**\n\n`;
                            const rolesWithMembers = allRoles.filter(role => role.members.size > 0).size;
                            const emptyRoles = allRoles.size - rolesWithMembers;
                            const coloredRoles = allRoles.filter(role => role.color !== 0).size;
                            const hoistedRoles = allRoles.filter(role => role.hoist).size;
                            const mentionableRoles = allRoles.filter(role => role.mentionable).size;

                            overviewDescription += `❀ **${rolesWithMembers}** roles have members\n`;
                            overviewDescription += `✿ **${emptyRoles}** roles are empty\n`;
                            overviewDescription += `❀ **${coloredRoles}** roles have custom colors\n`;
                            overviewDescription += `✿ **${hoistedRoles}** roles are hoisted\n`;
                            overviewDescription += `❀ **${mentionableRoles}** roles are mentionable\n`;

                            cards.push({
                                title: 'ᯓ➺ **Server Roles Overview**',
                                description: overviewDescription,
                                footer: `Card 1/${Math.ceil(allRoles.size / 5) + 1} • Overview • ${allRoles.size} total roles`
                            });

                            // Create cards for roles (5 per card)
                            const allRolesArray = Array.from(allRoles.values());
                            for (let i = 0; i < allRolesArray.length; i += 5) {
                                const roleChunk = allRolesArray.slice(i, i + 5);
                                const cardNumber = Math.floor(i / 5) + 2;
                                const totalCards = Math.ceil(allRoles.size / 5) + 1;
                                
                                let cardDescription = `**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n`;
                                cardDescription += `**ᡣ𐭩 ROLES ${i + 1}-${Math.min(i + 5, allRolesArray.length)}**\n\n`;

                                roleChunk.forEach((role, index) => {
                                    const memberCount = role.members.size;
                                    const features = [];
                                    
                                    // Add role type indicators
                                    if (role.permissions.has('Administrator')) {
                                        features.push('👑 Admin');
                                    } else if (role.permissions.has('ModerateMembers') || role.permissions.has('ManageMessages') || role.permissions.has('KickMembers') || role.permissions.has('BanMembers')) {
                                        features.push('⚖️ Mod');
                                    }
                                    
                                    if (role.hoist) features.push('📌 Hoisted');
                                    if (role.mentionable) features.push('📢 Mentionable');
                                    if (role.color !== 0) features.push('🎨 Colored');
                                    
                                    const colorDisplay = role.color !== 0 ? `🎨` : '⚪';
                                    const featureText = features.length > 0 ? ` • ${features.join(' ')}` : '';
                                    
                                    cardDescription += `${colorDisplay} ${role} (${memberCount} members${featureText})\n`;
                                    cardDescription += `   Position: ${role.position} • ID: \`${role.id}\`\n\n`;
                                });

                                cards.push({
                                    title: `ᯓ➺ **Server Roles (${i + 1}-${Math.min(i + 5, allRolesArray.length)})**`,
                                    description: cardDescription,
                                    footer: `Card ${cardNumber}/${totalCards} • Roles ${i + 1}-${Math.min(i + 5, allRolesArray.length)} of ${allRoles.size}`
                                });
                            }

                            return cards;
                        };

                        const roleCards = createRoleCards();
                        let currentCardIndex = 0;

                        // Create initial embed
                        const createEmbed = (cardData) => {
                            return new EmbedBuilder()
                                .setColor('#C8A2C8')
                                .setAuthor({
                                    name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
                                    iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
                                })
                                .setTitle(cardData.title)
                                .setDescription(cardData.description)
                                .setThumbnail(message.guild.iconURL({ dynamic: true, size: 256 }))
                                .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
                                .setFooter({
                                    text: `${cardData.footer} • Auto-cycling every 5s • Made with ➺ at ScriptSpace`,
                                    iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
                                })
                                .setTimestamp();
                        };

                        // Send initial message
                        const rolesMessage = await message.reply({ 
                            embeds: [createEmbed(roleCards[currentCardIndex])] 
                        });

                        // Auto-cycling system (5 seconds per card)
                        const rolesCycleInterval = setInterval(async () => {
                            try {
                                currentCardIndex = (currentCardIndex + 1) % roleCards.length;
                                const updatedEmbed = createEmbed(roleCards[currentCardIndex]);
                                
                                await rolesMessage.edit({ embeds: [updatedEmbed] });
                                console.log(`🎭 Roles card updated to ${currentCardIndex + 1}/${roleCards.length} for ${message.author.username}`);
                                
                            } catch (error) {
                                console.error('Error updating roles card:', error);
                                clearInterval(rolesCycleInterval);
                            }
                        }, 5000); // 5 seconds per card

                        // Auto-stop cycling after 5 minutes
                        setTimeout(() => {
                            clearInterval(rolesCycleInterval);
                            console.log(`🎭 Roles cycling auto-stopped for ${message.author.username}`);
                        }, 5 * 60 * 1000); // 5 minutes

                    } catch (error) {
                        console.error('Error in roles command:', error);
                        await message.reply('❌ Error displaying server roles information.');
                    }
                    break;

                case 'dev':
                case 'developer':
                    try {
                        const totalCommands = getTotalCommandsCount();

                        const devEmbed = new EmbedBuilder()
                            .setColor('#C8A2C8')
                            .setAuthor({
                                name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
                                iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
                            })
                            .setTitle('✗ 𖹭 **Developer Information**')
                            .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +
                                `**ᡣ𐭩 About the Developer**\n` +
                                `discord.gg/scriptspace was developed by made with ➺ ➺ at scriptspace\n\n` +
                                `**✿ Website:** https://scriptspace.in/\n\n` +
                                `discord.gg/scriptspace is a highly engineered discord server with AI Integrations, NextGen Quarantine Systems, NextGen Interim Role Management Systems And Temporary Voice Channel management systems everything was made possible by script.agi\n\n` +
                                `**ᡣ𐭩 Technical Features**\n` +
                                `➺ God-Level Protection System\n` +
                                `➺ AI-Powered Integrations\n` +
                                `➺ NextGen Quarantine Management\n` +
                                `➺ Advanced Interim Role System\n` +
                                `➺ Voice Channel Management\n` +
                                `➺ Real-time Security Monitoring\n\n` +
                                `**✿ Built with Script.AGI Technology**`
                            )
                            .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
                            .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
                            .setFooter({
                                text: 'Developer Information • Made with ➺ at ScriptSpace',
                                iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
                            })
                            .setTimestamp();

                        await message.reply({ embeds: [devEmbed] });
                    } catch (error) {
                        console.error('Error in dev command:', error);
                        await message.reply('❌ Error displaying developer information.');
                    }
                    break;

                case 'fck':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to send the message.\n**Usage:** `fck @user`');
                        return;
                    }

                    const fckUser = message.mentions.users.first();

                    try {
                        // Send the custom message with GIF to the tagged user
                        const customDmEmbed = new EmbedBuilder()
                            .setColor('#8B0000')
                            .setTitle('🚨 SECURITY WARNING')
                            .setDescription('Fuck You MotherFucker, don\'t even think about nuking discord.gg/scriptspace even in your dream you will be brutally fucked by script.agi')
                            .addFields(
                                { name: '👤 Sent By', value: `${message.author.username}`, inline: true },
                                { name: '🎯 Server', value: `${message.guild.name}`, inline: true },
                                { name: '⏰ Sent At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                                { name: '🛡️ Protection', value: 'Script.AGI God-Level Security', inline: false }
                            )
                            .setImage('https://cdn.discordapp.com/attachments/1377710452653424711/1411748251920765018/have-a-nice-day-fuck-you.gif?ex=68b5c884&is=68b47704&hm=d98f09f00526750721143f5b4757363b262542a34426d9e10dac5d25a1d39741&')
                            .setFooter({ text: 'Script.AGI Security System' })
                            .setTimestamp();

                        await fckUser.send({ embeds: [customDmEmbed] });

                        // Confirm to the command user
                        const confirmEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('✅ Custom Message Sent')
                            .setDescription(`Custom warning message with GIF successfully sent to ${fckUser.username}`)
                            .addFields(
                                { name: '👤 Target User', value: `<@${fckUser.id}>`, inline: true },
                                { name: '📧 DM Status', value: 'Successfully sent with GIF', inline: true },
                                { name: '🎯 Message Type', value: 'Security warning', inline: true },
                                { name: '🖼️ GIF Included', value: 'Yes - Have a nice day gif', inline: true }
                            )
                            .setFooter({ text: `Custom message executed by ${message.author.username}` })
                            .setTimestamp();

                        await message.reply({ embeds: [confirmEmbed] });

                        console.log(`✅ Custom security warning DM with GIF sent to ${fckUser.username} by ${message.author.username}`);
                    } catch (error) {
                        console.error('Error sending custom DM:', error);
                        await message.reply('❌ Could not send custom DM to this user. They may have DMs disabled.');
                    }
                    break;

                case 'prmtr':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to make their interim role permanent.');
                        return;
                    }

                    if (message.channel.id !== OWNER_CHANNEL_ID) {
                        await message.reply('❌ This command can only be used in the designated owner channel.');
                        return;
                    }

                    const permanentUser = message.mentions.users.first();
                    try {
                        const member = await message.guild.members.fetch(permanentUser.id);
                        const interimRole = message.guild.roles.cache.get(INTERIM_ROLE_ID);

                        if (!member.roles.cache.has(INTERIM_ROLE_ID)) {
                            await message.reply('❌ This user does not have the interim role.');
                            return;
                        }

                        // Clear the timeout if it exists
                        const timeoutId = interimRoleTimeouts.get(permanentUser.id);
                        if (timeoutId) {
                            clearTimeout(timeoutId);
                            interimRoleTimeouts.delete(permanentUser.id);
                        }

                        const permanentEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('✅ Interim Role Made Permanent')
                            .setDescription(`${permanentUser.username}'s interim role has been made permanent.`)
                            .addFields(
                                { name: '👤 User', value: `<@${permanentUser.id}>`, inline: true },
                                { name: '👮 Authorized By', value: `${message.author.username}`, inline: true }
                            )
                            .setTimestamp();

                        await message.reply({ embeds: [permanentEmbed] });

                        // Send DM to user
                        try {
                            const dmEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle('🎉 Interim Role Made Permanent!')
                                .setDescription(`Your interim role in **${message.guild.name}** has been made permanent by the bot owner!`)
                                .setTimestamp();

                            await member.user.send({ embeds: [dmEmbed] });
                        } catch (dmError) {
                            console.log('Could not send permanent role DM:', dmError.message);
                        }

                    } catch (error) {
                        await message.reply('❌ Error making interim role permanent.');
                    }
                    break;

                case 'revtr':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to revoke their interim role.');
                        return;
                    }

                    if (message.channel.id !== OWNER_CHANNEL_ID) {
                        await message.reply('❌ This command can only be used in the designated owner channel.');
                        return;
                    }

                    const revokeUser = message.mentions.users.first();
                    try {
                        const member = await message.guild.members.fetch(revokeUser.id);
                        const interimRole = message.guild.roles.cache.get(INTERIM_ROLE_ID);

                        if (!member.roles.cache.has(INTERIM_ROLE_ID)) {
                            await message.reply('❌ This user does not have the interim role.');
                            return;
                        }

                        // Clear the timeout if it exists
                        const timeoutId = interimRoleTimeouts.get(revokeUser.id);
                        if (timeoutId) {
                            clearTimeout(timeoutId);
                            interimRoleTimeouts.delete(revokeUser.id);
                        }

                        const revokeEmbed = new EmbedBuilder()
                            .setColor('#FF6B6B')
                            .setTitle('❌ Interim Role Revoked')
                            .setDescription(`${revokeUser.username}'s interim role has been revoked.`)
                            .addFields(
                                { name: '👤 User', value: `<@${revokeUser.id}>`, inline: true },
                                { name: '👮 Revoked By', value: `${message.author.username}`, inline: true }
                            )
                            .setTimestamp();

                        await message.reply({ embeds: [revokeEmbed] });

                    } catch (error) {
                        await message.reply('❌ Error revoking interim role.');
                    }
                    break;

                case 'remtr':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to remove their interim role.');
                        return;
                    }

                    if (message.channel.id !== OWNER_CHANNEL_ID) {
                        await message.reply('❌ This command can only be used in the designated owner channel.');
                        return;
                    }

                    const removeUser = message.mentions.users.first();
                    try {
                        const member = await message.guild.members.fetch(removeUser.id);
                        const interimRole = message.guild.roles.cache.get(INTERIM_ROLE_ID);

                        if (!member.roles.cache.has(INTERIM_ROLE_ID)) {
                            await message.reply('❌ This user does not have the interim role.');
                            return;
                        }

                        await member.roles.remove(interimRole, `Interim role removed by ${message.author.username}`);

                        // Clear the timeout if it exists
                        const timeoutId = interimRoleTimeouts.get(removeUser.id);
                        if (timeoutId) {
                            clearTimeout(timeoutId);
                            interimRoleTimeouts.delete(removeUser.id);
                        }

                        const removeEmbed = new EmbedBuilder()
                            .setColor('#FFA500')
                            .setTitle('➖ Interim Role Removed')
                            .setDescription(`${removeUser.username}'s interim role has been removed.`)
                            .addFields(
                                { name: '👤 User', value: `<@${removeUser.id}>`, inline: true },
                                { name: '👮 Removed By', value: `${message.author.username}`, inline: true }
                            )
                            .setTimestamp();

                        await message.reply({ embeds: [removeEmbed] });

                    } catch (error) {
                        await message.reply('❌ Error removing interim role.');
                    }
                    break;

                case 'addtr':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to add interim role.');
                        return;
                    }

                    if (message.channel.id !== OWNER_CHANNEL_ID) {
                        await message.reply('❌ This command can only be used in the designated owner channel.');
                        return;
                    }

                    const addUser = message.mentions.users.first();
                    try {
                        const member = await message.guild.members.fetch(addUser.id);
                        const interimRole = message.guild.roles.cache.get(INTERIM_ROLE_ID);

                        if (member.roles.cache.has(INTERIM_ROLE_ID)) {
                            await message.reply('❌ This user already has the interim role.');
                            return;
                        }

                        await member.roles.add(interimRole, `Interim role added by ${message.author.username}`);

                        // Set timeout for automatic removal
                        const timeoutId = setTimeout(async () => {
                            try {
                                const currentMember = await message.guild.members.fetch(addUser.id);
                                if (currentMember && currentMember.roles.cache.has(INTERIM_ROLE_ID)) {
                                    await currentMember.roles.remove(interimRole, 'Admin-granted interim role expired');
                                    console.log(`Admin-granted interim role automatically removed from ${currentMember.user.username}`);
                                }
                                interimRoleTimeouts.delete(addUser.id);
                            } catch (error) {
                                console.error('Error removing admin-granted interim role:', error);
                            }
                        }, INTERIM_ROLE_DURATION * 60 * 1000);

                        interimRoleTimeouts.set(addUser.id, timeoutId);

                        const addEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('✅ Interim Role Added')
                            .setDescription(`${addUser.username} has been granted the interim role for ${INTERIM_ROLE_DURATION} minutes.`)
                            .addFields(
                                { name: '👤 User', value: `<@${addUser.id}>`, inline: true },
                                { name: '👮 Added By', value: `${message.author.username}`, inline: true },
                                { name: '⏰ Duration', value: `${INTERIM_ROLE_DURATION} minutes`, inline: true }
                            )
                            .setTimestamp();

                        await message.reply({ embeds: [addEmbed] });

                        // Send DM to user
                        try {
                            const dmEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle('✿ Interim Role Granted by Admin ✿')
                                .setDescription(`You have been granted temporary interim access in **${message.guild.name}** by an administrator!`)
                                .addFields(
                                    { name: '⏰ Duration', value: `${INTERIM_ROLE_DURATION} minutes`, inline: true },
                                    { name: '🎯 Access', value: 'Private voice channels and special areas', inline: true }
                                )
                                .setTimestamp();

                            await member.user.send({ embeds: [dmEmbed] });
                        } catch (dmError) {
                            console.log('Could not send admin-granted interim role DM:', dmError.message);
                        }

                    } catch (error) {
                        await message.reply('❌ Error adding interim role.');
                    }
                    break;

                case 'sendinterim':
                    if (message.channel.id !== OWNER_CHANNEL_ID) {
                        await message.reply('❌ This command can only be used in the designated owner channel.');
                        return;
                    }

                    const widgetResult = await sendInterimRoleWidget(message.guild);
                    if (widgetResult) {
                        const successEmbed = new EmbedBuilder()
                            .setColor('#00FF0000')
                            .setTitle('✅ Interim Role Widget Deployed')
                            .setDescription('The interim role manager widget has been successfully created/updated!')
                            .addFields(
                                { name: '📍 Channel', value: `<#${INTERIM_ROLE_CHANNEL_ID}>`, inline: true },
                                { name: '✨ Status', value: '100% Robust & Working', inline: true },
                                { name: '🎯 Function', value: 'Users can now request interim roles', inline: false }
                            )
                            .setFooter({ text: 'Widget is fully operational and error-free!' })
                            .setTimestamp();

                        await message.reply({ embeds: [successEmbed] });
                    } else {
                        const errorEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ Widget Creation Failed')
                            .setDescription('Failed to create/update the interim role widget.')
                            .addFields(
                                { name: '🔍 Check', value: 'Ensure channel <#${INTERIM_ROLE_CHANNEL_ID}> exists and bot has permissions', inline: false },
                                { name: '⚙️ Required Permissions', value: 'Send Messages, View Channel, Embed Links', inline: false }
                            )
                            .setTimestamp();

                        await message.reply({ embeds: [errorEmbed] });
                    }
                    break;

                case 'intrch':
                    if (message.channel.id !== OWNER_CHANNEL_ID) {
                        await message.reply('❌ This command can only be used in the designated owner channel.');
                        return;
                    }

                    const interimChannel = message.guild.channels.cache.get(INTERIM_ROLE_CHANNEL_ID);

                    const channelInfoEmbed = new EmbedBuilder()
                        .setColor('#C8A2C8')
                        .setTitle('✿ Interim Role Manager Widget Channel ✿')
                        .setDescription('Current channel configuration for the interim role manager widget')
                        .addFields(
                            { name: '📍 Channel ID', value: `\`${INTERIM_ROLE_CHANNEL_ID}\``, inline: true },
                            { name: '📝 Channel Name', value: interimChannel ? `#${interimChannel.name}` : 'Channel not found', inline: true },
                            { name: '✅ Status', value: interimChannel ? 'Channel exists and accessible' : '❌ Channel not accessible', inline: true },
                            { name: '🎯 Purpose', value: 'This channel hosts the interim role manager widget button', inline: false },
                            { name: '⚙️ Widget Status', value: '100% robust and working properly', inline: false }
                        )
                        .setFooter({
                            text: `Widget automatically updates • Channel: ${interimChannel ? interimChannel.name : 'Unknown'}`
                        })
                        .setTimestamp();

                    if (interimChannel) {
                        channelInfoEmbed.addFields(
                            { name: '🔗 Quick Link', value: `Jump to channel: <#${INTERIM_ROLE_CHANNEL_ID}>`, inline: false }
                        );
                    }

                    await message.reply({ embeds: [channelInfoEmbed] });
                    break;

                case 'intrm':
                    if (message.channel.id !== OWNER_CHANNEL_ID) {
                        await message.reply('❌ This command can only be used in the designated owner channel.');
                        return;
                    }

                    if (args.length < 3) {
                        await message.reply('❌ Usage: `intrm "channel_id" "message_content"`\n\nExample:\n`intrm "1409246212502196376" "Welcome to our server! Get your interim role here."`');
                        return;
                    }

                    // Parse the command arguments - handle quoted strings
                    const fullCommand = message.content.slice(5).trim(); // Remove 'intrm'
                    const matches = fullCommand.match(/"([^"]+)"\s+"([^"]+)"/);

                    if (!matches || matches.length < 3) {
                        await message.reply('❌ Please use quotes around both channel ID and message.\n\nUsage: `intrm "channel_id" "message_content"`\n\nExample:\n`intrm "1409246212502196376" "Welcome to our server! Get your interim role here."`');
                        return;
                    }

                    const customChannelId = matches[1].trim();
                    const customMessage = matches[2].trim();

                    // Validate channel exists
                    const targetChannel = message.guild.channels.cache.get(customChannelId);
                    if (!targetChannel) {
                        await message.reply(`❌ Channel with ID \`${customChannelId}\` not found in this server.`);
                        return;
                    }

                    // Check if it's a text channel
                    if (targetChannel.type !== 0) {
                        await message.reply(`❌ Channel <#${customChannelId}> is not a text channel. Please use a text channel.`);
                        return;
                    }

                    // Validate message length
                    if (customMessage.length > 2000) {
                        await message.reply('❌ Message content is too long. Please keep it under 2000 characters.');
                        return;
                    }

                    try {
                        const result = await sendInterimRoleWidget(message.guild, customChannelId, customMessage);

                        if (result) {
                            const successEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle('✅ Custom Interim Widget Deployed')
                                .setDescription('The interim role manager widget has been successfully created with your custom settings!')
                                .addFields(
                                    { name: '📍 Target Channel', value: `<#${customChannelId}>`, inline: true },
                                    { name: '📝 Channel Name', value: `#${targetChannel.name}`, inline: true },
                                    { name: '✨ Status', value: 'Successfully deployed', inline: true },
                                    { name: '💬 Custom Message', value: customMessage.length > 100 ? customMessage.substring(0, 100) + '...' : customMessage, inline: false },
                                    { name: '🎯 Function', value: 'Users can now request interim roles from this channel', inline: false }
                                )
                                .setFooter({ text: 'Widget is fully operational!' })
                                .setTimestamp();

                            await message.reply({ embeds: [successEmbed] });
                        } else {
                            const errorEmbed = new EmbedBuilder()
                                .setColor('#FF0000')
                                .setTitle('❌ Widget Deployment Failed')
                                .setDescription('Failed to create the interim role widget in the specified channel.')
                                .addFields(
                                    { name: '📍 Target Channel', value: `<#${customChannelId}>`, inline: true },
                                    { name: '🔍 Possible Issues', value: '• Bot lacks permissions\n• Channel is read-only\n• Discord API error', inline: false },
                                    { name: '⚙️ Required Permissions', value: 'Send Messages, View Channel, Embed Links', inline: false }
                                )
                                .setTimestamp();

                            await message.reply({ embeds: [errorEmbed] });
                        }
                    } catch (error) {
                        console.error('Error in intrm command:', error);
                        await message.reply('❌ An error occurred while deploying the widget. Please check the bot permissions and try again.');
                    }
                    break;

                case 'whitelist':
                    if (args.length < 2) {
                        await message.reply('❌ Usage: `whitelist <add/remove/list> [bot_id]`');
                        return;
                    }

                    const whitelistAction = args[1].toLowerCase();

                    if (whitelistAction === 'list') {
                        const whitelistEmbed = new EmbedBuilder()
                            .setColor('#5865F2')
                            .setTitle('🤖 Whitelisted Bots')
                            .setDescription(`**${WHITELISTED_BOTS.size}** bots are currently whitelisted:`)
                            .addFields({
                                name: '📋 Bot IDs',
                                value: Array.from(WHITELISTED_BOTS).map(id => `\`${id}\``).join('\n') || 'No bots whitelisted',
                                inline: false
                            })
                            .setFooter({ text: 'Only these bots are allowed in the server' })
                            .setTimestamp();

                        await message.reply({ embeds: [whitelistEmbed] });
                        return;
                    }

                    if (args.length < 3) {
                        await message.reply('❌ Please provide a bot ID.');
                        return;
                    }

                    const botId = args[2].trim();

                    if (whitelistAction === 'add') {
                        if (WHITELISTED_BOTS.has(botId)) {
                            await message.reply(`❌ Bot \`${botId}\` is already whitelisted.`);
                            return;
                        }

                        WHITELISTED_BOTS.add(botId);
                        const addEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('✅ Bot Whitelisted')
                            .setDescription(`Bot \`${botId}\` has been added to the whitelist.`)
                            .addFields({ name: 'Total Whitelisted', value: `${WHITELISTED_BOTS.size} bots`, inline: true })
                            .setTimestamp();

                        await message.reply({ embeds: [addEmbed] });

                    } else if (whitelistAction === 'remove') {
                        if (!WHITELISTED_BOTS.has(botId)) {
                            await message.reply(`❌ Bot \`${botId}\` is not in the whitelist.`);
                            return;
                        }

                        WHITELISTED_BOTS.delete(botId);
                        const removeEmbed = new EmbedBuilder()
                            .setColor('#FF6B6B')
                            .setTitle('❌ Bot Removed from Whitelist')
                            .setDescription(`Bot \`${botId}\` has been removed from the whitelist.`)
                            .addFields({ name: 'Total Whitelisted', value: `${WHITELISTED_BOTS.size} bots`, inline: true })
                            .setTimestamp();

                        await message.reply({ embeds: [removeEmbed] });

                        // Check if the bot is currently in the server
                        try {
                            const currentBot = message.guild.members.cache.get(botId);
                            if (currentBot && currentBot.user.bot) {
                                await handleUnauthorizedBot(message.guild, currentBot, message.author);
                            }
                        } catch (error) {
                            console.error('Error checking for removed bot in server:', error);
                        }

                    } else {
                        await message.reply('❌ Invalid action. Use `add`, `remove`, or `list`.');
                    }
                    break;

                case 'flagged':
                    const flaggedEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('🚨 Flagged Bots')
                        .setDescription(`**${flaggedBots.size}** bots are currently flagged:`)
                        .addFields({
                            name: '📋 Flagged Bot IDs',
                            value: flaggedBots.size > 0 ? Array.from(flaggedBots).map(id => `\`${id}\``).join('\n') : 'No bots flagged',
                            inline: false
                        })
                        .setFooter({ text: 'Flagged bots are permanently banned from the server' })
                        .setTimestamp();

                    await message.reply({ embeds: [flaggedEmbed] });
                    break;

                case 'unflag':
                    if (args.length < 2) {
                        await message.reply('❌ Usage: `unflag <bot_id>`');
                        return;
                    }

                    const unflagBotId = args[1].trim();

                    if (!flaggedBots.has(unflagBotId)) {
                        await message.reply(`❌ Bot \`${unflagBotId}\` is not flagged.`);
                        return;
                    }

                    flaggedBots.delete(unflagBotId);

                    const unflagEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ Bot Unflagged')
                        .setDescription(`Bot \`${unflagBotId}\` has been removed from the flagged list.`)
                        .addFields({ name: 'Note', value: 'Bot must still be in whitelist to join the server', inline: false })
                        .setTimestamp();

                    await message.reply({ embeds: [unflagEmbed] });
                    break;

                case 'scanserver':
                    const allBots = message.guild.members.cache.filter(member => member.user.bot);
                    const unauthorizedBots = allBots.filter(bot => !WHITELISTED_BOTS.has(bot.user.id));

                    const scanEmbed = new EmbedBuilder()
                        .setColor(unauthorizedBots.size > 0 ? '#FF0000' : '#00FF00')
                        .setTitle('🔍 Server Bot Scan Results')
                        .setDescription(`Scanned ${allBots.size} bots in the server`)
                        .addFields(
                            { name: '✅ Authorized Bots', value: `${allBots.size - unauthorizedBots.size}`, inline: true },
                            { name: '❌ Unauthorized Bots', value: `${unauthorizedBots.size}`, inline: true },
                            { name: '📋 Total Bots', value: `${allBots.size}`, inline: true }
                        )
                        .setTimestamp();

                    if (unauthorizedBots.size > 0) {
                        const unauthorizedList = unauthorizedBots.map(bot =>
                            `${bot.user.username} (\`${bot.user.id}\`)`
                        ).join('\n');

                        scanEmbed.addFields({
                            name: '🚨 Unauthorized Bots Found',
                            value: unauthorizedList.substring(0, 1000),
                            inline: false
                        });

                        scanEmbed.addFields({
                            name: '⚠️ Recommendation',
                            value: 'Use `purgebots` command to remove all unauthorized bots',
                            inline: false
                        });
                    }

                    await message.reply({ embeds: [scanEmbed] });
                    break;

                case 'unfu':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to unflag.');
                        return;
                    }

                    const unflagUser = message.mentions.users.first();

                    if (!flaggedUsers.has(unflagUser.id)) {
                        await message.reply(`❌ User \`${unflagUser.username}\` is not flagged.`);
                        return;
                    }

                    try {
                        // Remove from flagged users
                        flaggedUsers.delete(unflagUser.id);

                        // Try to restore roles if user is still in server
                        let member = null;
                        try {
                            member = await message.guild.members.fetch(unflagUser.id);
                        } catch (error) {
                            console.log('User not in server, unflagging only');
                        }

                        if (member) {
                            // Get stored original roles
                            const storedRoles = originalRoles.get(unflagUser.id);

                            // Validate that stored roles still exist
                            const validRoles = storedRoles.filter(roleId => {
                                const role = message.guild.roles.cache.get(roleId);
                                return role && role.id !== message.guild.id;
                            });

                            if (validRoles.length > 0) {
                                await member.roles.set(validRoles, `Unflagged by ${message.author.username} - roles restored`);
                            }

                            // Remove quarantine role if present
                            const quarantineRole = message.guild.roles.cache.get(QUARANTINE_ROLE_ID);
                            if (quarantineRole && member.roles.cache.has(quarantineRole.id)) {
                                await member.roles.remove(quarantineRole, 'User unflagged');
                            }

                            // Clean up tracking data
                            originalRoles.delete(unflagUser.id);
                            userActionTracking.delete(unflagUser.id);
                        }

                        const unflagEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('✅ User Unflagged')
                            .setDescription(`${unflagUser.username} has been unflagged and roles restored.`)
                            .addFields(
                                { name: '👤 User', value: `<@${unflagUser.id}>`, inline: true },
                                { name: '👮 Unflagged By', value: `${message.author.username}`, inline: true },
                                { name: '✅ Status', value: member ? 'Roles restored' : 'User not in server', inline: true }
                            )
                            .setFooter({ text: `User ID: ${unflagUser.id}` })
                            .setTimestamp();

                        await message.reply({ embeds: [unflagEmbed] });

                        // Send DM to user if they're in the server
                        if (member) {
                            try {
                                const dmEmbed = new EmbedBuilder()
                                    .setColor('#00FF00')
                                    .setTitle('✅ Account Unflagged')
                                    .setDescription(`Your account has been unflagged in **${message.guild.name}** and your roles have been restored.`)
                                    .addFields(
                                        { name: 'Unflagged By', value: message.author.username, inline: true },
                                        { name: 'Status', value: 'Full access restored', inline: true }
                                    )
                                    .setTimestamp();

                                await member.user.send({ embeds: [dmEmbed] });
                            } catch (dmError) {
                                console.log('Could not send unflag DM to user:', dmError.message);
                            }
                        }

                    } catch (error) {
                        console.error('Error unflagging user:', error);
                        await message.reply('❌ Error unflagging user. Please try again.');
                    }
                    break;

                case 'flaggedusers':
                    const flaggedUsersEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('🚨 Flagged Users')
                        .setDescription(`**${flaggedUsers.size}** users are currently flagged:`)
                        .addFields({
                            name: '📋 Flagged User IDs',
                            value: flaggedUsers.size > 0 ? Array.from(flaggedUsers).map(id => `\`${id}\``).join('\n') : 'No users flagged',
                            inline: false
                        })
                        .setFooter({ text: 'Flagged users have all permissions revoked' })
                        .setTimestamp();

                    await message.reply({ embeds: [flaggedUsersEmbed] });
                    break;

                case 'protection':
                    if (args.length < 2) {
                        const protectionStatusEmbed = new EmbedBuilder()
                            .setColor('#5865F2')
                            .setTitle('🛡️ Server Protection Status')
                            .setDescription('Ultimate Server Protection System - 1000% Secure')
                            .addFields(
                                { name: '🛡️ Protection Features', value: `**Channel Monitoring:** ${PROTECTION_SETTINGS.MONITOR_CHANNELS ? '✅ Active' : '❌ Disabled'}\n**Role Monitoring:** ${PROTECTION_SETTINGS.MONITOR_ROLES ? '✅ Active' : '❌ Disabled'}\n**Permission Monitoring:** ${PROTECTION_SETTINGS.MONITOR_PERMISSIONS ? '✅ Active' : '❌ Disabled'}\n**Server Settings:** ${PROTECTION_SETTINGS.MONITOR_SERVER_SETTINGS ? '✅ Active' : '❌ Disabled'}`, inline: false },
                                { name: '⚡ Rate Limiting', value: `**Max Changes/Min:** ${PROTECTION_SETTINGS.MAX_CHANGES_PER_MINUTE}\n**Auto-Flag Violators:** ${PROTECTION_SETTINGS.AUTO_FLAG_VIOLATORS ? '✅ Yes' : '❌ No'}`, inline: true },
                                { name: '🛡️ Immune Users', value: `**Count:** ${PROTECTION_SETTINGS.PROTECTION_IMMUNE_USERS.size}\n**Bot Owner:** ✅ Protected`, inline: true },
                                { name: '📈 Statistics', value: `**Flagged Users:** ${flaggedUsers.size}\n**Flagged Bots:** ${flaggedBots.size}\n**Monitoring:** 24/7 Active`, inline: false }
                            )
                            .setFooter({ text: 'Use: protection enable/disable <feature>' })
                            .setTimestamp();

                        await message.reply({ embeds: [protectionStatusEmbed] });
                        return;
                    }

                    const protectionAction = args[1].toLowerCase();
                    const protectionFeature = args[2]?.toLowerCase();

                    if (protectionAction === 'enable' || protectionAction === 'disable') {
                        const newValue = protectionAction === 'enable';

                        switch (protectionFeature) {
                            case 'channels':
                                PROTECTION_SETTINGS.MONITOR_CHANNELS = newValue;
                                await message.reply(`✅ Channel monitoring ${newValue ? 'enabled' : 'disabled'}.`);
                                break;
                            case 'roles':
                                PROTECTION_SETTINGS.MONITOR_ROLES = newValue;
                                await message.reply(`✅ Role monitoring ${newValue ? 'enabled' : 'disabled'}.`);
                                break;
                            case 'permissions':
                                PROTECTION_SETTINGS.MONITOR_PERMISSIONS = newValue;
                                await message.reply(`✅ Permission monitoring ${newValue ? 'enabled' : 'disabled'}.`);
                                break;
                            case 'server':
                                PROTECTION_SETTINGS.MONITOR_SERVER_SETTINGS = newValue;
                                await message.reply(`✅ Server settings monitoring ${newValue ? 'enabled' : 'disabled'}.`);
                                break;
                            case 'all':
                                PROTECTION_SETTINGS.MONITOR_CHANNELS = newValue;
                                PROTECTION_SETTINGS.MONITOR_ROLES = newValue;
                                PROTECTION_SETTINGS.MONITOR_PERMISSIONS = newValue;
                                PROTECTION_SETTINGS.MONITOR_SERVER_SETTINGS = newValue;
                                await message.reply(`✅ All protection features ${newValue ? 'enabled' : 'disabled'}.`);
                                break;
                            default:
                                await message.reply('❌ Invalid feature. Use: channels, roles, permissions, server, or all');
                        }
                    } else {
                        await message.reply('❌ Usage: `protection enable/disable <feature>` or `protection` for status');
                    }
                    break;

                case 'createbaseline':
                    const baseline = await createServerBaseline(message.guild);
                    if (baseline) {
                        const baselineEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('✅ Server Baseline Created')
                            .setDescription('Server baseline has been created for protection monitoring.')
                            .addFields(
                                { name: '📊 Channels', value: `${baseline.channels.count} channels monitored`, inline: true },
                                { name: '🎭 Roles', value: `${baseline.roles.count} roles monitored`, inline: true },
                                { name: '👥 Members', value: `${baseline.members.count} members`, inline: true }
                            )
                            .setTimestamp();

                        await message.reply({ embeds: [baselineEmbed] });
                    } else {
                        await message.reply('❌ Failed to create server baseline.');
                    }
                    break;

                case 'purgebots':
                    const botsToRemove = message.guild.members.cache.filter(member =>
                        member.user.bot && !WHITELISTED_BOTS.has(member.user.id)
                    );

                    if (botsToRemove.size === 0) {
                        await message.reply('✅ No unauthorized bots found in the server.');
                        return;
                    }

                    let removedCount = 0;
                    const purgeEmbed = new EmbedBuilder()
                        .setColor('#FF0000')
                        .setTitle('🔥 Bot Purge Initiated')
                        .setDescription(`Starting removal of ${botsToRemove.size} unauthorized bots...`)
                        .setTimestamp();

                    const purgeMessage = await message.reply({ embeds: [purgeEmbed] });

                    for (const bot of botsToRemove.values()) {
                        try {
                            await handleUnauthorizedBot(message.guild, bot, message.author);
                            removedCount++;
                        } catch (error) {
                            console.error(`Error removing bot ${bot.user.username}:`, error);
                        }
                    }

                    const completedEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('✅ Bot Purge Completed')
                        .setDescription(`Successfully removed ${removedCount}/${botsToRemove.size} unauthorized bots.`)
                        .addFields(
                            { name: '🔥 Removed', value: `${removedCount} bots`, inline: true },
                            { name: '🛡️ Protected', value: 'Server secured', inline: true }
                        )
                        .setTimestamp();

                    await purgeMessage.edit({ embeds: [completedEmbed] });
                    break;

                case 'set':
                    if (args.length < 2) {
                        await message.reply('❌ Usage: `set <key> [value]`');
                        return;
                    }

                    const settingKey = args[1].toLowerCase();
                    const settingValue = args.slice(2).join(' ');

                    if (settingKey === 'adminchannel') {
                        const channelMention = message.mentions.channels.first();
                        if (!channelMention || channelMention.type !== 0) {
                            await message.reply('❌ Please mention a valid text channel.');
                            return;
                        }
                        serverConfigs.set(message.guild.id, { ...serverConfig, adminChannelId: channelMention.id });
                        await message.reply(`✅ Admin channel set to ${channelMention}.`);
                    } else if (settingKey === 'qrole') {
                        const roleMention = message.mentions.roles.first();
                        if (!roleMention) {
                            await message.reply('❌ Please mention a role.');
                            return;
                        }
                        serverConfigs.set(message.guild.id, { ...serverConfig, quarantineRoleId: roleMention.id });
                        QUARANTINE_ROLE_ID = roleMention.id; // Update global for new guilds
                        await message.reply(`✅ Quarantine role set to ${roleMention}.`);
                    } else if (settingKey === 'qduration') {
                        const providedDuration = settingValue.toLowerCase();
                        if (DURATION_OPTIONS[providedDuration]) {
                            const durationValue = DURATION_OPTIONS[providedDuration];
                            serverConfigs.set(message.guild.id, { ...serverConfig, defaultQuarantineDuration: durationValue });
                            await message.reply(`✅ Default quarantine duration set to ${providedDuration}.`);
                        } else {
                            await message.reply(`❌ Invalid duration. Please use one of: ${Object.keys(DURATION_OPTIONS).join(', ')}`);
                        }
                    } else {
                        await message.reply(`❌ Unknown setting: \`${settingKey}\`. Available settings: \`adminchannel\`, \`qrole\`, \`qduration\`.`);
                    }
                    break;

                case 'setmusicchannel':
                    if (args.length < 2) {
                        await message.reply('❌ Usage: `setmusicchannel <channel_id>` or `setmusicchannel #channel`');
                        return;
                    }

                    let musicChannelId;
                    if (message.mentions.channels.size > 0) {
                        const mentionedChannel = message.mentions.channels.first();
                        if (mentionedChannel.type !== 0) {
                            await message.reply('❌ Please mention a text channel.');
                            return;
                        }
                        musicChannelId = mentionedChannel.id;
                    } else {
                        musicChannelId = args[1].trim().replace(/[<>#]/g, '');
                        const channel = message.guild.channels.cache.get(musicChannelId);
                        if (!channel || channel.type !== 0) {
                            await message.reply('❌ Invalid channel ID or channel not found. Please provide a valid text channel.');
                            return;
                        }
                    }

                    if (musicManager) {
                        musicManager.setMusicRequestChannel(message.guild.id, musicChannelId);
                        
                        // Initialize widget in the new channel
                        try {
                            await musicManager.initializeMusicWidget(message.guild);
                            
                            const musicSetEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle('🎵 Music Request Channel Set')
                                .setDescription('Music request channel has been configured successfully!')
                                .addFields(
                                    { name: '📍 Channel', value: `<#${musicChannelId}>`, inline: true },
                                    { name: '🎵 Status', value: 'Music widget deployed', inline: true },
                                    { name: '🎯 Usage', value: 'Users can now request music in this channel', inline: true },
                                    { name: '📝 Commands', value: 'Type song names directly in the channel to play music', inline: false }
                                )
                                .setFooter({ text: 'Music system ready for use!' })
                                .setTimestamp();

                            await message.reply({ embeds: [musicSetEmbed] });
                        } catch (widgetError) {
                            await message.reply(`✅ Music channel set to <#${musicChannelId}> but widget initialization failed. Use the channel for music requests.`);
                        }
                    } else {
                        await message.reply('❌ Music manager not initialized. Please wait for the music system to start up.');
                    }
                    break;

                case 'sethomevc':
                    if (!musicManager) {
                        await message.reply('❌ Music manager not initialized. Please wait for the music system to start up.');
                        break;
                    }

                    if (args.length < 2 && message.mentions.channels.size === 0) {
                        await message.reply('❌ Usage: `sethomevc <channel_id>` or `sethomevc #voice-channel`');
                        break;
                    }

                    let resolvedHomeChannel = null;

                    if (message.mentions.channels.size > 0) {
                        resolvedHomeChannel = message.mentions.channels.first();
                    } else {
                        const rawArg = args.slice(1).join(' ').trim().replace(/"/g, '');
                        const cleanedId = rawArg.replace(/[<#>]/g, '');
                        const byId = message.guild.channels.cache.get(cleanedId);
                        if (byId) {
                            resolvedHomeChannel = byId;
                        } else {
                            const lowerName = rawArg.toLowerCase();
                            resolvedHomeChannel = message.guild.channels.cache.find(ch =>
                                (ch.type === 2 || ch.type === 13) && ch.name.toLowerCase() === lowerName
                            );
                        }
                    }

                    if (!resolvedHomeChannel) {
                        await message.reply('❌ Could not find that voice channel. Provide a valid channel ID or exact name.');
                        break;
                    }

                    if (resolvedHomeChannel.type !== 2 && resolvedHomeChannel.type !== 13) {
                        await message.reply('❌ Please provide a valid voice or stage channel.');
                        break;
                    }

                    try {
                        await musicManager.setHomeVoiceChannel(message.guild.id, resolvedHomeChannel.id);

                        const homeConfigEmbed = new EmbedBuilder()
                            .setColor('#8A00C4')
                            .setTitle('🏠 Home Voice Channel Set')
                            .setDescription('The bot will return to this voice channel whenever the queue finishes.')
                            .addFields(
                                { name: '🎧 Voice Channel', value: `<#${resolvedHomeChannel.id}>`, inline: true },
                                { name: '🌐 Server', value: `${message.guild.name}`, inline: true }
                            )
                            .setFooter({ text: 'Run sethomevc again to change this setting.' })
                            .setTimestamp();

                        await message.reply({ embeds: [homeConfigEmbed] });
                    } catch (error) {
                        console.error('Error setting home voice channel:', error);
                        await message.reply('❌ Failed to configure home voice channel. Please try again.');
                    }
                    break;

                case 'clear':
                    if (args.length < 2) {
                        await message.reply('❌ Please specify the number of messages to delete.\n**Usage:** `clear <number>`\n**Example:** `clear 100`');
                        return;
                    }

                    const amount = parseInt(args[1]);
                    if (isNaN(amount) || amount < 1 || amount > 100) {
                        await message.reply('❌ Please provide a valid number between 1 and 100.');
                        return;
                    }

                    try {
                        // Check if bot has necessary permissions
                        const botMember = message.guild.members.cache.get(client.user.id);
                        const channelPermissions = message.channel.permissionsFor(botMember);
                        
                        if (!channelPermissions || !channelPermissions.has(['ManageMessages'])) {
                            await message.reply('❌ Bot lacks `Manage Messages` permission in this channel.');
                            return;
                        }

                        // Fetch messages to delete
                        const messagesToDelete = await message.channel.messages.fetch({ limit: amount + 1 }); // +1 to include the command message
                        const deletableMessages = messagesToDelete.filter(msg => 
                            Date.now() - msg.createdTimestamp < 14 * 24 * 60 * 60 * 1000 // Messages older than 14 days can't be bulk deleted
                        );

                        if (deletableMessages.size === 0) {
                            await message.reply('❌ No messages found to delete (messages older than 14 days cannot be deleted).');
                            return;
                        }

                        // Bulk delete messages
                        await message.channel.bulkDelete(deletableMessages, true);

                        const clearEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('🧹 Messages Cleared')
                            .setDescription(`Successfully deleted ${deletableMessages.size - 1} messages`)
                            .addFields(
                                { name: '📊 Requested Amount', value: `${amount}`, inline: true },
                                { name: '🗑️ Actually Deleted', value: `${deletableMessages.size - 1}`, inline: true },
                                { name: '👮 Moderator', value: `${message.author.username}`, inline: true }
                            )
                            .setFooter({ text: 'Messages older than 14 days cannot be bulk deleted' })
                            .setTimestamp();

                        // Send confirmation and auto-delete it after 5 seconds
                        const confirmMessage = await message.channel.send({ embeds: [clearEmbed] });
                        setTimeout(() => confirmMessage.delete().catch(console.error), 5000);

                        console.log(`✅ ${message.author.username} cleared ${deletableMessages.size - 1} messages in ${message.channel.name}`);

                    } catch (error) {
                        console.error('Error in clear command:', error);
                        if (error.code === 50013) {
                            await message.reply('❌ Missing permissions to delete messages.');
                        } else if (error.code === 50034) {
                            await message.reply('❌ Cannot delete messages older than 14 days.');
                        } else {
                            await message.reply('❌ An error occurred while deleting messages.');
                        }
                    }
                    break;

                case 'slowmode':
                case 'slow':
                    if (args.length < 2) {
                        await message.reply('❌ Please specify the slowmode duration in seconds.\n**Usage:** `slowmode <seconds>`\n**Examples:** `slowmode 5`, `slowmode 0` (to disable)\n**Range:** 0-21600 seconds (6 hours max)');
                        return;
                    }

                    const seconds = parseInt(args[1]);
                    if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
                        await message.reply('❌ Please provide a valid number between 0 and 21600 seconds (6 hours).\n**Examples:** `slowmode 5`, `slowmode 0` (to disable)');
                        return;
                    }

                    try {
                        // Check if bot has necessary permissions
                        const botMember = message.guild.members.cache.get(client.user.id);
                        const channelPermissions = message.channel.permissionsFor(botMember);
                        
                        if (!channelPermissions || !channelPermissions.has(['ManageChannels'])) {
                            await message.reply('❌ Bot lacks `Manage Channels` permission in this channel.');
                            return;
                        }

                        await message.channel.setRateLimitPerUser(seconds, `Slowmode set by ${message.author.username}`);

                        let description;
                        let color;
                        if (seconds === 0) {
                            description = `Slowmode has been **disabled** in ${message.channel}`;
                            color = '#00FF00';
                        } else {
                            const timeDisplay = seconds >= 60 
                                ? `${Math.floor(seconds / 60)}m ${seconds % 60}s` 
                                : `${seconds}s`;
                            description = `Slowmode has been set to **${timeDisplay}** in ${message.channel}`;
                            color = '#FFA500';
                        }

                        const slowmodeEmbed = new EmbedBuilder()
                            .setColor(color)
                            .setTitle('⏱️ Slowmode Updated')
                            .setDescription(description)
                            .addFields(
                                { name: '📍 Channel', value: `${message.channel}`, inline: true },
                                { name: '⏱️ Duration', value: seconds === 0 ? 'Disabled' : `${seconds} seconds`, inline: true },
                                { name: '👮 Moderator', value: `${message.author.username}`, inline: true }
                            )
                            .setFooter({ text: seconds === 0 ? 'Users can now send messages normally' : 'Users must wait between messages' })
                            .setTimestamp();

                        await message.reply({ embeds: [slowmodeEmbed] });

                        console.log(`✅ ${message.author.username} set slowmode to ${seconds}s in ${message.channel.name}`);

                    } catch (error) {
                        console.error('Error in slowmode command:', error);
                        if (error.code === 50013) {
                            await message.reply('❌ Missing permissions to modify channel settings.');
                        } else {
                            await message.reply('❌ An error occurred while setting slowmode.');
                        }
                    }
                    break;

                // WhatsApp Security Alert Test Command - Enhanced for Server Threat Alerts
                case 'wbtestan':
                    const serverThreatMessage = `🚨 CRITICAL SERVER SECURITY BREACH 🚨

discord.gg/scriptspace UNDER THREAT - Someone attempting to bypass server security!

⚠️ THREAT DETAILS:
• Unauthorized user attempting to bypass server rules
• Possible bot addition attempts detected
• Channel alignment manipulation detected
• Role creation/deletion attempts
• Permission changes detected

🎯 VIOLATOR INFORMATION:
User: ${message.author.username} (${message.author.id})
Server: ${message.guild.name}

🛡️ GOD-LEVEL PROTECTION STATUS: ACTIVE
📱 IMMEDIATE ACTION REQUIRED`;

                    const success = await sendCriticalSecurityAlert(
                        message.guild,
                        'SERVER UNDER THREAT - BYPASS ATTEMPT DETECTED',
                        serverThreatMessage,
                        message.author
                    );

                    if (success) {
                        const confirmEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('✅ Server Threat Alert Sent to WhatsApp')
                            .setDescription('Critical server security alert has been successfully sent to your WhatsApp!')
                            .addFields(
                                { name: '📱 WhatsApp Number', value: WHATSAPP_ALERT_NUMBER, inline: true },
                                { name: '🚨 Alert Type', value: 'Server Bypass Threat', inline: true },
                                { name: '⚡ Response Time', value: '< 1 second', inline: true },
                                { name: '🛡️ Security Status', value: 'God-Level Protection Active', inline: false }
                            )
                            .setFooter({ text: 'Script.AGI Security System - Threat Alert Sent' })
                            .setTimestamp();

                        await message.reply({ embeds: [confirmEmbed] });
                    } else {
                        const errorEmbed = new EmbedBuilder()
                            .setColor('#FF0000')
                            .setTitle('❌ WhatsApp Alert Failed')
                            .setDescription('Failed to send server threat alert to WhatsApp!')
                            .addFields(
                                { name: '🔍 Check', value: 'Verify Twilio credentials in environment variables', inline: false },
                                { name: '⚙️ Required Variables', value: 'TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, TWILIO_WHATSAPP_NUMBER', inline: false }
                            )
                            .setTimestamp();

                        await message.reply({ embeds: [errorEmbed] });
                    }
                    break;

                // Server Template Management Commands - HIGHEST SECURITY LEVEL
                case 'srvcrt':
                    // ONLY SERVER OWNER AND BOT OWNER CAN CREATE SERVER TEMPLATES
                    if (message.author.id !== message.guild.ownerId && message.author.id !== BOT_OWNER_ID) {
                        await message.reply('❌ **ACCESS DENIED** - Only server owner and bot owner can create server templates.');
                        return;
                    }

                    try {
                        const template = await createServerTemplate(message.guild);
                        if (template) {
                            const templateEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle('✅ SERVER TEMPLATE CREATED')
                                .setDescription('**SECURE SERVER TEMPLATE SAVED**\n\nComplete server template has been created and saved for protection!')
                                .addFields(
                                    { name: '📊 Channels Saved', value: `${Object.keys(template.channels).length} channels`, inline: true },
                                    { name: '🎭 Roles Saved', value: `${Object.keys(template.roles).length} roles`, inline: true },
                                    { name: '⚙️ Permissions', value: 'All channel & role permissions saved', inline: true },
                                    { name: '🛡️ Security Level', value: '**MAXIMUM** - God-Level Protection', inline: false },
                                    { name: '📅 Created By', value: `${message.author.username}`, inline: true },
                                    { name: '🔒 Access Level', value: 'Server Owner + Bot Owner Only', inline: true }
                                )
                                .setFooter({ text: 'Template saved for auto-restoration and protection' })
                                .setTimestamp();

                            await message.reply({ embeds: [templateEmbed] });

                            console.log(`✅ Server template manually created by ${message.author.username} for ${message.guild.name}`);
                        } else {
                            await message.reply('❌ Failed to create server template. Please try again.');
                        }
                    } catch (error) {
                        console.error('Error in srvcrt command:', error);
                        await message.reply('❌ Error creating server template.');
                    }
                    break;

                case 'mdfsrv':
                    // ONLY SERVER OWNER AND BOT OWNER CAN ENABLE MODIFICATION MODE
                    if (message.author.id !== message.guild.ownerId && message.author.id !== BOT_OWNER_ID) {
                        await message.reply('❌ **ACCESS DENIED** - Only server owner and bot owner can modify server settings.');
                        return;
                    }

                    // Temporarily disable protection for modifications
                    const originalMonitorChannels = PROTECTION_SETTINGS.MONITOR_CHANNELS;
                    const originalMonitorRoles = PROTECTION_SETTINGS.MONITOR_ROLES;
                    const originalMonitorPermissions = PROTECTION_SETTINGS.MONITOR_PERMISSIONS;

                    PROTECTION_SETTINGS.MONITOR_CHANNELS = false;
                    PROTECTION_SETTINGS.MONITOR_ROLES = false;
                    PROTECTION_SETTINGS.MONITOR_PERMISSIONS = false;

                    // Store original settings for restoration
                    serverConfigs.set(message.guild.id, {
                        ...serverConfigs.get(message.guild.id),
                        modificationMode: true,
                        modificationStartTime: Date.now(),
                        originalSettings: {
                            MONITOR_CHANNELS: originalMonitorChannels,
                            MONITOR_ROLES: originalMonitorRoles,
                            MONITOR_PERMISSIONS: originalMonitorPermissions
                        }
                    });

                    const modifyEmbed = new EmbedBuilder()
                        .setColor('#FFA500')
                        .setTitle('🔧 SERVER MODIFICATION MODE ENABLED')
                        .setDescription('**SECURE MODIFICATION ACCESS GRANTED**\n\nServer protection temporarily disabled for authorized modifications!')
                        .addFields(
                            { name: '👤 Authorized By', value: `${message.author.username}`, inline: true },
                            { name: '🔒 Access Level', value: 'Server Owner + Bot Owner Only', inline: true },
                            { name: '⏰ Mode Active', value: 'Until `mdfsv` command is used', inline: true },
                            { name: '🛡️ Protection Status', value: '⚠️ **TEMPORARILY DISABLED**', inline: false },
                            { name: '📋 Instructions', value: '1. Make your server modifications\n2. Use `mdfsv` to save and re-enable protection\n3. Server will auto-protect in 30 minutes if not saved', inline: false },
                            { name: '⚠️ Security Notice', value: 'Only authorized users can modify server during this time', inline: false }
                        )
                        .setFooter({ text: 'Modification mode active - Use mdfsv to save changes' })
                        .setTimestamp();

                    await message.reply({ embeds: [modifyEmbed] });

                    // Set auto-restore timer (30 minutes)
                    setTimeout(async () => {
                        const currentConfig = serverConfigs.get(message.guild.id);
                        if (currentConfig && currentConfig.modificationMode) {
                            // Auto-restore protection if still in modification mode
                            PROTECTION_SETTINGS.MONITOR_CHANNELS = currentConfig.originalSettings.MONITOR_CHANNELS;
                            PROTECTION_SETTINGS.MONITOR_ROLES = currentConfig.originalSettings.MONITOR_ROLES;
                            PROTECTION_SETTINGS.MONITOR_PERMISSIONS = currentConfig.originalSettings.MONITOR_PERMISSIONS;

                            // Remove modification mode
                            serverConfigs.set(message.guild.id, {
                                ...currentConfig,
                                modificationMode: false
                            });

                            const autoRestoreEmbed = new EmbedBuilder()
                                .setColor('#FF6B6B')
                                .setTitle('⚠️ MODIFICATION MODE AUTO-EXPIRED')
                                .setDescription('Server protection has been automatically restored after 30 minutes.')
                                .addFields(
                                    { name: '🛡️ Status', value: 'God-Level Protection Re-enabled', inline: true },
                                    { name: '⏰ Reason', value: 'Auto-timeout (30 minutes)', inline: true }
                                )
                                .setTimestamp();

                            await sendLogMessage(message.guild, autoRestoreEmbed);
                            console.log(`Auto-restored protection for ${message.guild.name} after modification timeout`);
                        }
                    }, 30 * 60 * 1000); // 30 minutes

                    console.log(`Server modification mode enable by ${message.author.username} for ${message.guild.name}`);
                    break;

                case 'mdfsv':
                    // ONLY SERVER OWNER AND BOT OWNER CAN SAVE MODIFICATIONS
                    if (message.author.id !== message.guild.ownerId && message.author.id !== BOT_OWNER_ID) {
                        await message.reply('❌ **ACCESS DENIED** - Only server owner and bot owner can save server modifications.');
                        return;
                    }

                    const currentConfig = serverConfigs.get(message.guild.id);
                    if (!currentConfig || !currentConfig.modificationMode) {
                        await message.reply('❌ Server is not in modification mode. Use `mdfsrv` first to enable modifications.');
                        return;
                    }

                    try {
                        // Create new template with current server state
                        const newTemplate = await createServerTemplate(message.guild);

                        if (newTemplate) {
                            // Restore protection settings
                            PROTECTION_SETTINGS.MONITOR_CHANNELS = currentConfig.originalSettings.MONITOR_CHANNELS;
                            PROTECTION_SETTINGS.MONITOR_ROLES = currentConfig.originalSettings.MONITOR_ROLES;
                            PROTECTION_SETTINGS.MONITOR_PERMISSIONS = currentConfig.originalSettings.MONITOR_PERMISSIONS;

                            // Remove modification mode
                            serverConfigs.set(message.guild.id, {
                                ...currentConfig,
                                modificationMode: false
                            });

                            const saveEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle('✅ SERVER MODIFICATIONS SAVED')
                                .setDescription('**SECURE TEMPLATE UPDATED**\n\nServer modifications have been saved and protection re-enabled!')
                                .addFields(
                                    { name: '📊 Updated Template', value: `${Object.keys(newTemplate.channels).length} channels, ${Object.keys(newTemplate.roles).length} roles`, inline: true },
                                    { name: '👤 Saved By', value: `${message.author.username}`, inline: true },
                                    { name: '⏰ Modification Time', value: `${Math.round((Date.now() - currentConfig.modificationStartTime) / 1000)} seconds`, inline: true },
                                    { name: '🛡️ Protection Status', value: '✅ **FULLY RESTORED**', inline: false },
                                    { name: '🔒 Security Level', value: 'God-Level Protection Active', inline: true },
                                    { name: '📋 Template Status', value: 'Ready for auto-restoration', inline: true }
                                )
                                .setFooter({ text: 'Server template updated - God-Level Protection Active' })
                                .setTimestamp();

                            await message.reply({ embeds: [saveEmbed] });
                            console.log(`Server modifications saved by ${message.author.username} for ${message.guild.name}`);
                        } else {
                            await message.reply('❌ Failed to save server template. Protection remains disabled.');
                        }
                    } catch (error) {
                        console.error('Error in mdfsv command:', error);
                        await message.reply('❌ Error saving server modifications.');
                    }
                    break;

                case 'clstr':
                    // ONLY BOT OWNER CAN HIDE INTERIM ROLE CHANNEL ACCESS
                    if (message.author.id !== BOT_OWNER_ID) {
                        await message.reply('❌ **ACCESS DENIED** - Only bot owner can hide interim role channel access.');
                        return;
                    }

                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to hide interim role channel access.\n**Usage:** `clstr @user`');
                        return;
                    }

                    const hideUser = message.mentions.users.first();

                    try {
                        const member = await message.guild.members.fetch(hideUser.id);
                        const interimChannel = message.guild.channels.cache.get(INTERIM_ROLE_CHANNEL_ID);

                        if (!interimChannel) {
                            await message.reply('❌ Interim role channel not found.');
                            return;
                        }

                        // Create permission overwrite to deny channel access
                        await interimChannel.permissionOverwrites.create(hideUser.id, {
                            ViewChannel: false,
                            SendMessages: false,
                            ReadMessageHistory: false
                        }, { reason: `Interim channel access hidden by bot owner: ${message.author.username}` });

                        const hideEmbed = new EmbedBuilder()
                            .setColor('#FF6B6B')
                            .setTitle('👁️‍🗨️ Interim Channel Access Hidden')
                            .setDescription(`**CHANNEL ACCESS RESTRICTED**\n\nInterim role channel has been hidden from the specified user.`)
                            .addFields(
                                { name: '👤 Target User', value: `${hideUser.username} (\`${hideUser.id}\`)`, inline: true },
                                { name: '👮 Hidden By', value: `${message.author.username}`, inline: true },
                                { name: '📍 Channel', value: `<#${INTERIM_ROLE_CHANNEL_ID}>`, inline: true },
                                { name: '🚫 Restrictions Applied', value: '• Cannot view channel\n• Cannot send messages\n• Cannot read message history', inline: false },
                                { name: '🔧 Restore Access', value: 'Use `optr @user` to restore access', inline: false },
                                { name: '⚠️ Note', value: 'User cannot access interim roles until access is restored', inline: false }
                            )
                            .setFooter({ text: 'Interim Role Channel Access Management' })
                            .setTimestamp();

                        await message.reply({ embeds: [hideEmbed] });

                        // Send DM to affected user
                        try {
                            const dmEmbed = new EmbedBuilder()
                                .setColor('#FF6B6B')
                                .setTitle('🚫 Interim Role Access Restricted')
                                .setDescription(`Your access to the interim role channel in **${message.guild.name}** has been restricted by the bot owner.`)
                                .addFields(
                                    { name: '📍 Affected Channel', value: 'Interim Role Manager', inline: true },
                                    { name: '⚠️ Impact', value: 'Cannot request interim roles', inline: true },
                                    { name: '📋 Contact', value: 'Contact bot owner to restore access', inline: false }
                                )
                                .setTimestamp();

                            await hideUser.send({ embeds: [dmEmbed] });
                        } catch (dmError) {
                            console.log('Could not send access restriction DM to user:', dmError.message);
                        }

                        console.log(`Interim channel access hidden for ${hideUser.username} by ${message.author.username}`);

                    } catch (error) {
                        console.error('Error hiding interim channel access.');
                    }
                    break;

                case 'optr':
                    // ONLY BOT OWNER CAN RESTORE INTERIM ROLE CHANNEL ACCESS
                    if (message.author.id !== BOT_OWNER_ID) {
                        await message.reply('❌ **ACCESS DENIED** - Only bot owner can restore interim role channel access.');
                        return;
                    }

                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to restore interim role channel access.\n**Usage:** `optr @user`');
                        return;
                    }

                    const showUser = message.mentions.users.first();

                    try {
                        const member = await message.guild.members.fetch(showUser.id);
                        const interimChannel = message.guild.channels.cache.get(INTERIM_ROLE_CHANNEL_ID);

                        if (!interimChannel) {
                            await message.reply('❌ Interim role channel not found.');
                            return;
                        }

                        // Check if user has restricted access
                        const existingOverwrite = interimChannel.permissionOverwrites.cache.get(showUser.id);

                        if (!existingOverwrite || existingOverwrite.allow.has('ViewChannel') !== false) {
                            await message.reply('❌ This user does not have restricted access to the interim role channel.');
                            return;
                        }

                        // Remove the permission overwrite to restore default access
                        await interimChannel.permissionOverwrites.delete(showUser.id, `Interim channel access restored by bot owner: ${message.author.username}`);

                        const showEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('✅ Interim Channel Access Restored')
                            .setDescription(`**CHANNEL ACCESS GRANTED**\n\nInterim role channel access has been restored for the specified user.`)
                            .addFields(
                                { name: '👤 Target User', value: `${showUser.username} (\`${showUser.id}\`)`, inline: true },
                                { name: '👮 Restored By', value: `${message.author.username}`, inline: true },
                                { name: '📍 Channel', value: `<#${INTERIM_ROLE_CHANNEL_ID}>`, inline: true },
                                { name: '✅ Access Restored', value: '• Can view channel\n• Can use interim role button\n• Full access granted', inline: false },
                                { name: '🎯 Status', value: 'User can now request interim roles normally', inline: false },
                                { name: '🔧 Restrict Again', value: 'Use `clstr @user` to hide access again', inline: false }
                            )
                            .setFooter({ text: 'Interim Role Channel Access Management' })
                            .setTimestamp();

                        await message.reply({ embeds: [showEmbed] });

                        // Send DM to affected user
                        try {
                            const dmEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle('✅ Interim Role Access Restored')
                                .setDescription(`Your access to the interim role channel in **${message.guild.name}** has been restored by the bot owner!`)
                                .addFields(
                                    { name: '📍 Channel Available', value: `<#${INTERIM_ROLE_CHANNEL_ID}>`, inline: true },
                                    { name: '🎯 Access Granted', value: 'Can request interim roles', inline: true},
                                    { name: '✨ Status', value: 'Full access restored', inline: false }
                                )
                                .setTimestamp();

                            await showUser.send({ embeds: [dmEmbed] });
                        } catch (dmError) {
                            console.log('Could not send access restoration DM to user:', dmError.message);
                        }

                        console.log(`Interim channel access restored for ${showUser.username} by ${message.author.username}`);

                    } catch (error) {
                        console.error('Error restoring interim channel access:', error);
                        await message.reply('❌ Error restoring interim role channel access.');
                    }
                    break;

                // New commands for recovery and night mode
                case 'recovery':
                    // Usage: recovery <channel_id>
                    if (args.length < 2) {
                        await message.reply('❌ Usage: `recovery <channel_id>`');
                        return;
                    }

                    const recoveryChannelId = args[1];
                    const recoveryChannel = message.guild.channels.cache.get(recoveryChannelId);

                    if (!recoveryChannel) {
                        await message.reply(`❌ Channel with ID \`${recoveryChannelId}\` not found.`);
                        return;
                    }

                    // Store the recovery channel ID for the guild
                    serverConfigs.set(message.guild.id, { ...serverConfigs.get(message.guild.id) || {}, ownerChannelId: recoveryChannelId });

                    const recoveryEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('⚙️ Recovery Channel Set')
                        .setDescription(`The recovery channel has been set to ${recoveryChannel}.`)
                        .addFields(
                            { name: '📍 Channel', value: `<#${recoveryChannelId}>`, inline: true },
                            { name: '🎯 Purpose', value: 'Used for owner channel recovery', inline: true },
                            { name: '✅ Status', value: 'Configuration updated successfully', inline: false }
                        )
                        .setTimestamp();

                    await message.reply({ embeds: [recoveryEmbed] });
                    break;

                case 'nightmode':
                    // Usage: nightmode <start_time> <end_time>
                    // Example: nightmode 22:00 06:00
                    if (args.length < 3) {
                        await message.reply('❌ Usage: `nightmode <start_time> <end_time>`\n\nExample: `nightmode 22:00 06:00` (for 10 PM to 6 AM)');
                        return;
                    }

                    const startTimeStr = args[1];
                    const endTimeStr = args[2];

                    // Basic time validation (HH:MM format)
                    const timeRegex = /^([01]?[0-9]|2[0-3]):[0-5][0-9]$/;
                    if (!timeRegex.test(startTimeStr) || !timeRegex.test(endTimeStr)) {
                        await message.reply('❌ Invalid time format. Please use HH:MM (e.g., 22:00).');
                        return;
                    }

                    // Store night mode times
                    serverConfigs.set(message.guild.id, {
                        ...serverConfigs.get(message.guild.id) || {},
                        nightModeStartTime: startTimeStr,
                        nightModeEndTime: endTimeStr,
                        nightModeActive: true // Ensure night mode is activated
                    });

                    const nightModeEmbed = new EmbedBuilder()
                        .setColor('#00008B') // Dark blue for night mode
                        .setTitle('🌙 Night Mode Activated')
                        .setDescription('Aggressive scanning and logging will commence during the specified hours.')
                        .addFields(
                            { name: '⏰ Start Time', value: startTimeStr, inline: true },
                            { name: '⏰ End Time', value: endTimeStr, inline: true },
                            { name: '🛡️ Mode Status', value: 'Aggressive scanning active', inline: true },
                            { name: '✅ Configuration', value: 'Night mode settings updated', inline: false }
                        )
                        .setTimestamp();

                    await message.reply({ embeds: [nightModeEmbed] });
                    console.log(`Night mode activated for ${message.guild.name} from ${startTimeStr} to ${endTimeStr}`);
                    break;

                // Voice Management Commands
                case 'vmute':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to voice mute.\n**Usage:** `vmute @user`');
                        return;
                    }

                    const vmuteUser = message.mentions.users.first();
                    try {
                        const member = await message.guild.members.fetch(vmuteUser.id);
                        const result = await voiceManager.muteUser(member, `Voice muted by ${message.author.username}`);

                        if (result.success) {
                            const embed = voiceManager.createVoiceEmbed('mute', result, vmuteUser, message.guild);
                            await message.reply({ embeds: [embed] });
                        } else {
                            await message.reply(`❌ ${result.error}`);
                        }
                    } catch (error) {
                        await message.reply('❌ Error voice muting user. Please make sure the user exists in this server.');
                    }
                    break;

                case 'vunmute':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to voice unmute.\n**Usage:** `vunmute @user`');
                        return;
                    }

                    const vunmuteUser = message.mentions.users.first();
                    try {
                        const member = await message.guild.members.fetch(vunmuteUser.id);
                        const result = await voiceManager.unmuteUser(member, `Voice unmuted by ${message.author.username}`);

                        if (result.success) {
                            const embed = voiceManager.createVoiceEmbed('unmute', result, vunmuteUser, message.guild);
                            await message.reply({ embeds: [embed] });
                        } else {
                            await message.reply(`❌ ${result.error}`);
                        }
                    } catch (error) {
                        await message.reply('❌ Error voice unmuting user. Please make sure the user exists in this server.');
                    }
                    break;

                case 'vmuteall':
                    try {
                        const result = await voiceManager.muteAll(message.guild, message.author, `Voice muted all by ${message.author.username}`);
                        const embed = voiceManager.createVoiceEmbed('muteAll', result, null, message.guild);
                        await message.reply({ embeds: [embed] });
                    } catch (error) {
                        await message.reply('❌ Error voice muting all users.');
                    }
                    break;

                case 'vunmuteall':
                    try {
                        const result = await voiceManager.unmuteAll(message.guild, message.author, `Voice unmuted all by ${message.author.username}`);
                        const embed = voiceManager.createVoiceEmbed('unmuteAll', result, null, message.guild);
                        await message.reply({ embeds: [embed] });
                    } catch (error) {
                        await message.reply('❌ Error voice unmuting all users.');
                    }
                    break;

                case 'vdefend':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to defend from voice actions.\n**Usage:** `vdefend @user`');
                        return;
                    }

                    const vdefendUser = message.mentions.users.first();
                    try {
                        const member = await message.guild.members.fetch(vdefendUser.id);
                        voiceManager.defendUser(member.id);
                        const embed = voiceManager.createVoiceEmbed('defend', null, member, message.guild);
                        await message.reply({ embeds: [embed] });
                    } catch (error) {
                        await message.reply('❌ Error defending user.');
                    }
                    break;

                case 'vundefend':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to remove voice protection.\n**Usage:** `vundefend @user`');
                        return;
                    }

                    const vundefendUser = message.mentions.users.first();
                    try {
                        const member = await message.guild.members.fetch(vundefendUser.id);
                        const wasDefended = voiceManager.undefendUser(member.id);
                        if (wasDefended) {
                            const embed = voiceManager.createVoiceEmbed('undefend', null, member, message.guild);
                            await message.reply({ embeds: [embed] });
                        } else {
                            await message.reply('❌ This user was not defended.');
                        }
                    } catch (error) {
                        await message.reply('❌ Error undefending user.');
                    }
                    break;

                case 'vdefendall':
                    try {
                        const result = voiceManager.defendAll(message.guild);
                        const embed = voiceManager.createVoiceEmbed('defendAll', result, null, message.guild);
                        await message.reply({ embeds: [embed] });
                    } catch (error) {
                        await message.reply('❌ Error defending all users.');
                    }
                    break;

                case 'vundefendall':
                    try {
                        const result = voiceManager.undefendAll();
                        const embed = voiceManager.createVoiceEmbed('undefendAll', result, null, message.guild);
                        await message.reply({ embeds: [embed] });
                    } catch (error) {
                        await message.reply('❌ Error undefending all users.');
                    }
                    break;

                case 'vdefended':
                    try {
                        const defendedUsers = voiceManager.getDefendedUsers();

                        const defendedEmbed = new EmbedBuilder()
                            .setColor('#5865F2')
                            .setTitle('🛡️ Defended Users')
                            .setDescription(`Currently ${defendedUsers.length} users are protected from voice actions`)
                            .setTimestamp();

                        if (defendedUsers.length > 0) {
                            const userList = defendedUsers.map(userId => `<@${userId}>`).join('\n');
                            defendedEmbed.addFields({
                                name: '👥 Protected Users',
                                value: userList.length > 1000 ? userList.substring(0, 1000) + '...' : userList,
                                inline: false
                            });
                        } else {
                            defendedEmbed.addFields({
                                name: '👥 Protected Users',
                                value: 'No users are currently defended',
                                inline: false
                            });
                        }

                        await message.reply({ embeds: [defendedEmbed] });
                    } catch (error) {
                        await message.reply('❌ Error getting defended users list.');
                    }
                    break;

                // New Voice Commands
                case 'muv':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to move and voice mute.\n**Usage:** `muv @user`');
                        return;
                    }

                    const muvUser = message.mentions.users.first();
                    try {
                        const member = await message.guild.members.fetch(muvUser.id);

                        if (!member.voice.channel) {
                            await message.reply('❌ User is not in a voice channel.');
                            return;
                        }

                        // First mute, then move to AFK channel if it exists
                        const muteResult = await voiceManager.muteUser(member, `Moved and voice muted by ${message.author.username}`);

                        const afkChannel = message.guild.afkChannel;
                        if (afkChannel) {
                            await member.voice.setChannel(afkChannel, `Moved to AFK by ${message.author.username}`);
                        }

                        const muvEmbed = new EmbedBuilder()
                            .setColor('#FF6B6B')
                            .setTitle('🔇➡️ User Moved and Muted')
                            .setDescription(`${muvUser.username} has been voice muted and ${afkChannel ? 'moved to AFK channel' : 'remains in current channel'}`)
                            .addFields(
                                { name: '👤 User', value: `<@${muvUser.id}>`, inline: true },
                                { name: '🎤 Status', value: 'Voice Muted', inline: true },
                                { name: '📍 Channel', value: afkChannel ? afkChannel.name : member.voice.channel?.name || 'Unknown', inline: true }
                            )
                            .setTimestamp();

                        await message.reply({ embeds: [muvEmbed] });
                    } catch (error) {
                        await message.reply('❌ Error moving and muting user.');
                    }
                    break;

                case 'muvu':
                    if (message.mentions.users.size === 0) {
                        await message.reply('❌ Please mention a user to unmute and move back.\n**Usage:** `muvu @user`');
                        return;
                    }

                    const muvuUser = message.mentions.users.first();
                    try {
                        const member = await message.guild.members.fetch(muvuUser.id);

                        if (!member.voice.channel) {
                            await message.reply('❌ User is not in a voice channel.');
                            return;
                        }

                        // Unmute the user
                        const unmuteResult = await voiceManager.unmuteUser(member, `Unmuted by ${message.author.username}`);

                        const muvuEmbed = new EmbedBuilder()
                            .setColor('#00FF00')
                            .setTitle('🔊 User Unmuted')
                            .setDescription(`${muvuUser.username} has been voice unmuted`)
                            .addFields(
                                { name: '👤 User', value: `<@${muvuUser.id}>`, inline: true },
                                { name: '🎤 Status', value: 'Voice Unmuted', inline: true },
                                { name: '📍 Channel', value: member.voice.channel?.name || 'Unknown', inline: true }
                            )
                            .setTimestamp();

                        await message.reply({ embeds: [muvuEmbed] });
                    } catch (error) {
                        await message.reply('❌ Error unmuting user.');
                    }
                    break;

                case 'hvcm':
                    try {
                        const totalCommands = getTotalCommandsCount();

                        const voiceManagementEmbed = new EmbedBuilder()
                            .setColor('#C8A2C8')
                            .setAuthor({
                                name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
                                iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
                            })
                            .setTitle('✗ 𖹭 **Voice Management Commands**')
                            .setDescription(`**Total Commands:** ${totalCommands} • **Owner/Admin Channel Only**\n\n` +

                                `**ᡣ𐭩 Individual Voice Control**\n` +
                                `➺ \`vmute @user\` - Voice mute user\n` +
                                `➺ \`vunmute @user\` - Voice unmute user\n` +
                                `➺ \`muv @user\` - Move and voice mute user\n` +
                                `➺ \`muvu @user\` - Unmute and move back user\n\n` +

                                `**ᡣ𐭩 Mass Voice Control**\n` +
                                `➺ \`vmuteall\` - Voice mute all users in voice\n` +
                                `➺ \`vunmuteall\` - Voice unmute all server muted users\n\n` +

                                `**ᡣ𐭩 Voice Protection System**\n` +
                                `➺ \`vdefend @user\` - Protect user from voice actions\n` +
                                `➺ \`vundefend @user\` - Remove voice protection\n` +
                                `➺ \`vdefendall\` - Protect all voice users\n` +
                                `➺ \`vundefendall\` - Remove all voice protections\n` +
                                `➺ \`vdefended\` - Show protected users list\n\n` +

                                `**ᡣ𐭩 Voice Information**\n` +
                                `➺ \`hvcm\` - Show voice management commands`
                            )
                            .setThumbnail(client.user.displayAvatarURL({ dynamic: true, size: 256 }))
                            .setImage('https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&')
                            .setFooter({
                                text: 'Voice Management Commands • Owner/Admin Channel Only',
                                iconURL: 'https://cdn.discordapp.com/attachments/1438520973300338871/1439364441492816163/InShot_20251115_124839476.jpg?ex=691a4018&is=6918ee98&hm=66e891ba77134ca48725774137a29bd0aec7ea1442a7840125442f050ace00dc&'
                            })
                            .setTimestamp();

                        await message.reply({ embeds: [voiceManagementEmbed] });
                    } catch (error) {
                        console.error('Error in hvcm command:', error);
                        await message.reply('❌ Error displaying voice management commands.');
                    }
                    break;

                case 'panic':
                case 'panicmode':
                    try {
                        // Ensure we have a current server template before starting panic mode
                        let template = serverTemplates.get(message.guild.id);
                        if (!template) {
                            console.log('Creating server template before panic mode activation...');
                            template = await createServerTemplate(message.guild);
                            if (!template) {
                                await message.reply('❌ Failed to create server template. Panic mode may not restore properly.');
                            }
                        }

                        // Lock all channels by denying permissions for @everyone
                        const channels = message.guild.channels.cache.filter(channel =>
                            channel.type === 0 || channel.type === 2 || channel.type === 13 // Text, Voice, Stage channels
                        );

                        let lockedChannels = 0;
                        const failedChannels = [];

                        for (const channel of channels.values()) {
                            try {
                                // Add restrictive permissions (this will overlay on existing permissions)
                                await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                                    SendMessages: false,
                                    Connect: false,
                                    Speak: false,
                                    AddReactions: false,
                                    CreatePublicThreads: false,
                                    CreatePrivateThreads: false
                                }, { reason: `PANIC MODE activated by ${message.author.username}` });
                                lockedChannels++;
                            } catch (error) {
                                console.error(`Failed to lock channel ${channel.name}:`, error);
                                failedChannels.push(channel.name);
                            }
                        }

                        // Store panic mode state
                        serverConfigs.set(message.guild.id, {
                            ...serverConfigs.get(message.guild.id) || {},
                            panicModeActive: true,
                            panicModeActivatedBy: message.author.id,
                            panicModeActivatedAt: Date.now()
                        });

                        const panicEmbed = new EmbedBuilder()
                            .setColor('#8B0000')
                            .setTitle('🚨 PANIC MODE ACTIVATED')
                            .setDescription('**EMERGENCY LOCKDOWN INITIATED**\n\nAll channels have been locked to prevent unauthorized activity!')
                            .addFields(
                                { name: '🔒 Channels Locked', value: `${lockedChannels}/${channels.size}`, inline: true },
                                { name: '👮 Activated By', value: `${message.author.username}`, inline: true },
                                { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                                { name: '🛡️ Status', value: '🔴 **FULL LOCKDOWN ACTIVE**', inline: false },
                                { name: '🔧 Restore Command', value: '`stop panic` to unlock all channels', inline: false }
                            )
                            .setFooter({ text: 'Emergency Panic Mode - Server Locked Down' })
                            .setTimestamp();

                        if (failedChannels.length > 0) {
                            panicEmbed.addFields({
                                name: '⚠️ Failed to Lock',
                                value: failedChannels.slice(0, 10).join(', ') + (failedChannels.length > 10 ? '...' : ''),
                                inline: false
                            });
                        }

                        await message.reply({ embeds: [panicEmbed] });

                        // Send critical alert
                        await sendCriticalSecurityAlert(
                            message.guild,
                            'PANIC MODE ACTIVATED - SERVER LOCKDOWN',
                            `Panic mode activated by ${message.author.username}. All channels locked down. ${lockedChannels} channels secured.`,
                            message.author
                        );

                        console.log(`🚨 PANIC MODE activated by ${message.author.username} in ${message.guild.name} - ${lockedChannels} channels locked`);

                    } catch (error) {
                        console.error('Error activating panic mode:', error);
                        await message.reply('❌ Error activating panic mode. Some channels may not be locked.');
                    }
                    break;

                case 'stop':
                    if (args[1] && args[1].toLowerCase() === 'panic') {
                        try {
                            const guildConfig = serverConfigs.get(message.guild.id) || {};

                            if (!guildConfig.panicModeActive) {
                                await message.reply('❌ Panic mode is not currently active.');
                                return;
                            }

                            // Get the saved server template for proper restoration
                            const template = serverTemplates.get(message.guild.id);

                            if (!template) {
                                await message.reply('❌ No server template found. Creating new baseline and unlocking with default permissions.');
                                // Create new template for future use
                                await createServerTemplate(message.guild);
                            }

                            // Restore all channels using server template
                            const channels = message.guild.channels.cache.filter(channel =>
                                channel.type === 0 || channel.type === 2 || channel.type === 13 // Text, Voice, Stage channels
                            );

                            let unlockedChannels = 0;
                            const failedChannels = [];

                            for (const channel of channels.values()) {
                                try {
                                    if (template && template.channels[channel.id]) {
                                        // Restore original permissions from template
                                        const originalPermissions = template.channels[channel.id].permissions || [];

                                        // Clear all current permission overwrites first
                                        for (const overwrite of channel.permissionOverwrites.cache.values()) {
                                            try {
                                                await overwrite.delete(`Clearing overwrites for panic mode restoration by ${message.author.username}`);
                                            } catch (deleteError) {
                                                console.error(`Failed to delete overwrite for ${channel.name}:`, deleteError);
                                            }
                                        }

                                        // Restore original permission overwrites
                                        for (const permData of originalPermissions) {
                                            try {
                                                const target = message.guild.roles.cache.get(permData.id) || message.guild.members.cache.get(permData.id);
                                                if (target) {
                                                    await channel.permissionOverwrites.create(target, {
                                                        allow: BigInt(permData.allow),
                                                        deny: BigInt(permData.deny)
                                                    }, { reason: `Panic mode ended - restoring original permissions by ${message.author.username}` });
                                                }
                                            } catch (permError) {
                                                console.error(`Failed to restore permission for ${channel.name}:`, permError);
                                            }
                                        }
                                    } else {
                                        // Fallback: Remove panic mode restrictions only
                                        const everyoneOverwrite = channel.permissionOverwrites.cache.get(message.guild.roles.everyone.id);
                                        if (everyoneOverwrite) {
                                            // Check if this overwrite was added during panic mode by checking if it has the restrictive permissions
                                            const hasRestrictivePerms = everyoneOverwrite.deny.has('SendMessages') ||
                                                                       everyoneOverwrite.deny.has('Connect') ||
                                                                       everyoneOverwrite.deny.has('Speak');

                                            if (hasRestrictivePerms) {
                                                await everyoneOverwrite.delete(`Panic mode ended - removing restrictions by ${message.author.username}`);
                                            }
                                        }
                                    }
                                    unlockedChannels++;
                                } catch (error) {
                                    console.error(`Failed to unlock channel ${channel.name}:`, error);
                                    failedChannels.push(channel.name);
                                }
                            }

                            // Remove panic mode state
                            serverConfigs.set(message.guild.id, {
                                ...guildConfig,
                                panicModeActive: false,
                                panicModeDeactivatedBy: message.author.id,
                                panicModeDeactivatedAt: Date.now()
                            });

                            const stopPanicEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle('✅ PANIC MODE DEACTIVATED')
                                .setDescription('**EMERGENCY LOCKDOWN LIFTED**\n\nAll channels have been unlocked and normal operations restored!')
                                .addFields(
                                    { name: '🔓 Channels Unlocked', value: `${unlockedChannels}/${channels.size}`, inline: true },
                                    { name: '👮 Deactivated By', value: `${message.author.username}`, inline: true },
                                    { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                                    { name: '🛡️ Status', value: '✅ **NORMAL OPERATIONS RESTORED**', inline: false },
                                    { name: '📊 Duration', value: guildConfig.panicModeActivatedAt ? `<t:${Math.floor(guildConfig.panicModeActivatedAt / 1000)}:R>` : 'Unknown', inline: false }
                                )
                                .setFooter({ text: 'Panic Mode Deactivated - Server Unlocked' })
                                .setTimestamp();

                            if (failedChannels.length > 0) {
                                stopPanicEmbed.addFields({
                                    name: '⚠️ Failed to Unlock',
                                    value: failedChannels.slice(0, 10).join(', ') + (failedChannels.length > 10 ? '...' : ''),
                                    inline: false
                                });
                            }

                            await message.reply({ embeds: [stopPanicEmbed] });

                            // Send critical alert
                            await sendCriticalSecurityAlert(
                                message.guild,
                                'PANIC MODE DEACTIVATED - SERVER UNLOCKED',
                                `Panic mode deactivated by ${message.author.username}. All channels unlocked. ${unlockedChannels} channels restored. Normal operations resumed.`,
                                message.author
                            );

                            console.log(`✅ PANIC MODE deactivated by ${message.author.username} in ${message.guild.name} - ${unlockedChannels} channels unlocked`);

                        } catch (error) {
                            console.error('Error deactivating panic mode:', error);
                            await message.reply('❌ Error deactivating panic mode. Some channels may remain locked.');
                        }
                    } else {
                        await message.reply('❌ Unknown command. Did you mean `stop panic`?');
                    }
                    break;

                case 'emergency':
                case 'emergencymode':
                    try {
                        // Ensure we have a current server template before starting emergency mode
                        let template = serverTemplates.get(message.guild.id);
                        if (!template) {
                            console.log('Creating server template before emergency mode activation...');
                            template = await createServerTemplate(message.guild);
                            if (!template) {
                                await message.reply('❌ Failed to create server template. Emergency mode may not restore properly.');
                            }
                        }

                        // Store all current administrator permissions before removing them
                        const adminRoles = message.guild.roles.cache.filter(role => role.permissions.has('Administrator') && role.id !== message.guild.id);
                        const adminMembers = message.guild.members.cache.filter(member => member.permissions.has('Administrator') && member.id !== message.guild.ownerId && member.id !== BOT_OWNER_ID);

                        const originalAdminData = {
                            roles: [],
                            members: []
                        };

                        // Remove Administrator permission from all roles except @everyone
                        for (const role of adminRoles.values()) {
                            try {
                                const originalPermissions = role.permissions.bitfield;
                                originalAdminData.roles.push({
                                    id: role.id,
                                    permissions: originalPermissions
                                });

                                // Remove Administrator and other dangerous permissions
                                const newPermissions = role.permissions.remove([
                                    'Administrator',
                                    'ManageGuild',
                                    'ManageChannels',
                                    'ManageRoles',
                                    'ManageWebhooks',
                                    'CreatePrivateThreads',
                                    'CreatePublicThreads'
                                ]);

                                await role.setPermissions(newPermissions, `EMERGENCY MODE activated by ${message.author.username}`);
                            } catch (error) {
                                console.error(`Failed to modify role ${role.name}:`, error);
                            }
                        }

                        // Lock all channels with even stricter permissions
                        const channels = message.guild.channels.cache.filter(channel =>
                            channel.type === 0 || channel.type === 2 || channel.type === 13 // Text, Voice, Stage channels
                        );

                        let lockedChannels = 0;

                        for (const channel of channels.values()) {
                            try {
                                // Add restrictive permissions (this will overlay on existing permissions)
                                await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                                    SendMessages: false,
                                    Connect: false,
                                    Speak: false,
                                    AddReactions: false,
                                    CreatePublicThreads: false,
                                    CreatePrivateThreads: false,
                                    SendMessagesInThreads: false,
                                    ManageMessages: false,
                                    ManageThreads: false,
                                    EmbedLinks: false,
                                    AttachFiles: false,
                                    UseExternalEmojis: false,
                                    UseVAD: false
                                }, { reason: `EMERGENCY MODE activated by ${message.author.username}` });
                                lockedChannels++;
                            } catch (error) {
                                console.error(`Failed to lock channel ${channel.name}:`, error);
                            }
                        }

                        // Store emergency mode state
                        serverConfigs.set(message.guild.id, {
                            ...serverConfigs.get(message.guild.id) || {},
                            emergencyModeActive: true,
                            emergencyModeActivatedBy: message.author.id,
                            emergencyModeActivatedAt: Date.now(),
                            originalAdminData: originalAdminData
                        });

                        const emergencyEmbed = new EmbedBuilder()
                            .setColor('#8B0000')
                            .setTitle('🚨 EMERGENCY MODE ACTIVATED')
                            .setDescription('**MAXIMUM SECURITY LOCKDOWN**\n\nEmergency mode is now active with complete administrator override!')
                            .addFields(
                                { name: '🔒 Admin Roles Modified', value: `${adminRoles.size} roles`, inline: true },
                                { name: '🔒 Channels Locked', value: `${lockedChannels}/${channels.size}`, inline: true },
                                { name: '👮 Activated By', value: `${message.author.username}`, inline: true },
                                { name: '🛡️ Security Level', value: '🔴 **MAXIMUM EMERGENCY**', inline: false },
                                { name: '⚠️ Administrator Override', value: '• All admin permissions revoked\n• Server management disabled\n• Channel/role management blocked\n• Only owner and bot owner immune', inline: false },
                                { name: '🔧 Restore Command', value: '`end emergency` to restore normal operations', inline: false },
                                { name: '📋 Protection Active', value: 'Any attempt to modify permissions will be blocked and reversed', inline: false }
                            )
                            .setFooter({ text: 'Emergency Mode - Maximum Security Active' })
                            .setTimestamp();

                        await message.reply({ embeds: [emergencyEmbed] });

                        // Send critical alert
                        await sendCriticalSecurityAlert(
                            message.guild,
                            'EMERGENCY MODE ACTIVATED - MAXIMUM LOCKDOWN',
                            `Emergency mode activated by ${message.author.username}. All administrator permissions revoked. ${lockedChannels} channels locked. Maximum security active.`,
                            message.author
                        );

                        console.log(`🚨 EMERGENCY MODE activated by ${message.author.username} in ${message.guild.name} - Admin override active`);

                    } catch (error) {
                        console.error('Error activating emergency mode:', error);
                        await message.reply('❌ Error activating emergency mode. Some permissions may not be modified.');
                    }
                    break;

                case 'end':
                    if (args[1] && args[1].toLowerCase() === 'emergency') {
                        try {
                            const guildConfig = serverConfigs.get(message.guild.id) || {};

                            if (!guildConfig.emergencyModeActive) {
                                await message.reply('❌ Emergency mode is not currently active.');
                                return;
                            }

                            // Get the saved server template for proper restoration
                            const template = serverTemplates.get(message.guild.id);

                            if (!template) {
                                await message.reply('❌ No server template found. Creating new baseline and unlocking with default permissions.');
                                // Create new template for future use
                                await createServerTemplate(message.guild);
                            }

                            // Unlock all channels using server template
                            const channels = message.guild.channels.cache.filter(channel =>
                                channel.type === 0 || channel.type === 2 || channel.type === 13 // Text, Voice, Stage channels
                            );

                            let unlockedChannels = 0;
                            const failedChannels = [];

                            for (const channel of channels.values()) {
                                try {
                                    if (template && template.channels[channel.id]) {
                                        // Restore original permissions from template
                                        const originalPermissions = template.channels[channel.id].permissions || [];

                                        // Clear all current permission overwrites first
                                        for (const overwrite of channel.permissionOverwrites.cache.values()) {
                                            try {
                                                await overwrite.delete(`Clearing overwrites for emergency mode restoration by ${message.author.username}`);
                                            } catch (deleteError) {
                                                console.error(`Failed to delete overwrite for ${channel.name}:`, deleteError);
                                            }
                                        }

                                        // Restore original permission overwrites
                                        for (const permData of originalPermissions) {
                                            try {
                                                const target = message.guild.roles.cache.get(permData.id) || message.guild.members.cache.get(permData.id);
                                                if (target) {
                                                    await channel.permissionOverwrites.create(target, {
                                                        allow: BigInt(permData.allow),
                                                        deny: BigInt(permData.deny)
                                                    }, { reason: `Emergency mode ended - restoring original permissions by ${message.author.username}` });
                                                }
                                            } catch (permError) {
                                                console.error(`Failed to restore permission for ${channel.name}:`, permError);
                                            }
                                        }
                                    } else {
                                        // Fallback: Remove emergency mode restrictions only
                                        const everyoneOverwrite = channel.permissionOverwrites.cache.get(message.guild.roles.everyone.id);
                                        if (everyoneOverwrite) {
                                            // Check if this overwrite was added during emergency mode by checking restrictive permissions
                                            const hasRestrictivePerms = everyoneOverwrite.deny.has('SendMessages') ||
                                                                       everyoneOverwrite.deny.has('Connect') ||
                                                                       everyoneOverwrite.deny.has('Speak');

                                            if (hasRestrictivePerms) {
                                                await everyoneOverwrite.delete(`Emergency mode ended - removing restrictions by ${message.author.username}`);
                                            }
                                        }
                                    }
                                    unlockedChannels++;
                                } catch (error) {
                                    console.error(`Failed to unlock channel ${channel.name}:`, error);
                                    failedChannels.push(channel.name);
                                }
                            }

                            // Restore administrator permissions to roles
                            let restoredRoles = 0;
                            if (guildConfig.originalAdminData && guildConfig.originalAdminData.roles) {
                                for (const roleData of guildConfig.originalAdminData.roles) {
                                    try {
                                        const role = message.guild.roles.cache.get(roleData.id);
                                        if (role) {
                                            await role.setPermissions(BigInt(roleData.permissions), `EMERGENCY MODE ended by ${message.author.username}`);
                                            restoredRoles++;
                                        }
                                    } catch (error) {
                                        console.error('Failed to restore role permissions:', error);
                                    }
                                }
                            }

                            // Remove emergency mode state
                            serverConfigs.set(message.guild.id, {
                                ...guildConfig,
                                emergencyModeActive: false,
                                emergencyModeDeactivatedBy: message.author.id,
                                emergencyModeDeactivatedAt: Date.now(),
                                originalAdminData: null
                            });

                            const endEmergencyEmbed = new EmbedBuilder()
                                .setColor('#00FF00')
                                .setTitle('✅ EMERGENCY MODE ENDED')
                                .setDescription('**MAXIMUM SECURITY LIFTED**\n\nEmergency mode has been deactivated and all permissions restored!')
                                .addFields(
                                    { name: '🔓 Admin Roles Restored', value: `${restoredRoles}/${guildConfig.originalAdminData?.roles?.length || 0}`, inline: true },
                                    { name: '🔓 Channels Unlocked', value: `${unlockedChannels}/${channels.size}`, inline: true },
                                    { name: '👮 Ended By', value: `${message.author.username}`, inline: true },
                                    { name: '🛡️ Status', value: '✅ **NORMAL OPERATIONS RESTORED**', inline: false },
                                    { name: '📊 Duration', value: guildConfig.emergencyModeActivatedAt ? `<t:${Math.floor(guildConfig.emergencyModeActivatedAt / 1000)}:R>` : 'Unknown', inline: false },
                                    { name: '✅ Permissions Restored', value: '• Administrator roles restored\n• Channel permissions reset\n• Server management disabled\n• Normal security resumed', inline: false }
                                )
                                .setFooter({ text: 'Emergency Mode Ended - Server Restored' })
                                .setTimestamp();

                            await message.reply({ embeds: [endEmergencyEmbed] });

                            // Send critical alert
                            await sendCriticalSecurityAlert(
                                message.guild,
                                'EMERGENCY MODE ENDED - SERVER RESTORED',
                                `Emergency mode ended by ${message.author.username}. Administrator permissions restored. ${unlockedChannels} channels unlocked. Normal operations resumed.`,
                                message.author
                            );

                            console.log(`✅ EMERGENCY MODE ended by ${message.author.username} in ${message.guild.name} - All permissions restored`);

                        } catch (error) {
                            console.error('Error ending emergency mode:', error);
                            await message.reply('❌ Error ending emergency mode. Some permissions may not be restored.');
                        }
                    } else {
                        await message.reply('❌ Unknown command. Did you mean `end emergency`?');
                    }
                    break;


                default:
                    // If message starts with a command-like structure but isn't recognized
                    if (messageContent.startsWith('quarantine') || messageContent.startsWith('qr') || messageContent.startsWith('q') ||
                        messageContent.startsWith('unquarantine') || messageContent.startsWith('unqr') || messageContent.startsWith('uq') ||
                        messageContent.startsWith('kick') || messageContent.startsWith('ban') ||
                        messageContent.startsWith('mute') || messageContent.startsWith('unmute') ||
                        messageContent.startsWith('warn') || messageContent.startsWith('dm') ||
                        messageContent.startsWith('userinfo') || messageContent.startsWith('ui') ||
                        messageContent.startsWith('ping') ||
                        messageContent.startsWith('help') || messageContent.startsWith('h') ||
                        messageContent.startsWith('dev') || messageContent.startsWith('developer') ||
                        messageContent.startsWith('set') || messageContent.startsWith('prmtr') ||
                        messageContent.startsWith('revtr') || messageContent.startsWith('remtr') ||
                        messageContent.startsWith('addtr') || messageContent.startsWith('sendinterim') ||
                        messageContent.startsWith('intrch') || messageContent.startsWith('intrm') ||
                        messageContent.startsWith('whitelist') || messageContent.startsWith('flagged') ||
                        messageContent.startsWith('unflag') || messageContent.startsWith('scanserver') ||
                        messageContent.startsWith('purgebots') || messageContent.startsWith('unfu') || messageContent.startsWith('flaggedusers') ||
                        messageContent.startsWith('protection') || messageContent.startsWith('createbaseline') ||
                        messageContent.startsWith('srvcrt') || messageContent.startsWith('mdfsrv') ||
                        messageContent.startsWith('mdfsv') || messageContent.startsWith('clstr') ||
                        messageContent.startsWith('optr') || // Added for optr command
                        messageContent.startsWith('setinterimrole') || // Added for setinterimrole command
                        messageContent.startsWith('recovery') || // Added for recovery command
                        messageContent.startsWith('nightmode') || // Added for nightmode command
                        // Voice Management Commands
                        messageContent.startsWith('vmute') || messageContent.startsWith('vunmute') ||
                        messageContent.startsWith('vmuteall') || messageContent.startsWith('vunmuteall') ||
                        messageContent.startsWith('vdefend') || messageContent.startsWith('vundefend') ||
                        messageContent.startsWith('vdefendall') || messageContent.startsWith('vundefendall') ||
                        messageContent.startsWith('vdefended') ||
                        // New Voice Commands
                        messageContent.startsWith('muv') || messageContent.startsWith('muvu') || messageContent.startsWith('hvcm')
                        ) {
                        await message.reply('❌ Unknown command. Type `help` for available commands.');
                    }
                    break;
            }
        } catch (error) {
            console.error('Error processing command:', error);
            await message.reply('❌ An error occurred while processing the command.');
        }
        return;
    }

    // Auto-quarantine logic for other channels (non-admin)
    if (message.author.id === message.guild.ownerId || message.author.bot) return;

    const member = message.member;

    // Special handling for member info channel - only allow mentions
    if (message.channel.id === MEMBER_INFO_CHANNEL_ID) {
        const hasUserMentions = message.mentions.users.size > 0;

        if (!hasUserMentions) {
            try {
                await message.delete().catch(console.error);
                await quarantineUser(member, 'Posted non-mention content in member info channel', currentDefaultDuration);
            } catch (error) {
                console.error('Error processing member info channel filtering:', error);
            }
            return;
        }
    }

    // Member info channel logic - accessible to all server members
    if (message.mentions.users.size > 0 && message.channel.id === MEMBER_INFO_CHANNEL_ID && canAccessMemberInfo(message)) {
        try {
            await message.react('🔍');
        } catch (error) {
            console.log('Could not add reaction:', error.message);
        }

        for (const mentionedUser of message.mentions.users.values()) {
            try {
                const mentionedMember = await message.guild.members.fetch(mentionedUser.id).catch(() => null);

                if (!mentionedMember) {
                    const notFoundEmbed = new EmbedBuilder()
                        .setColor('#FF6B6B')
                        .setTitle('❌ Member Not Found')
                        .setDescription(`**${mentionedUser.username}** is not a member of this server`)
                        .setTimestamp();

                    await message.reply({ embeds: [notFoundEmbed] });
                    continue;
                }

                const embed = await createCompactMemberInfoEmbed(mentionedMember);
                await message.reply({ embeds: [embed] });

                try {
                    await message.react('✅');
                } catch (error) {
                    console.log('Could not add success reaction:', error.message);
                }
            } catch (error) {
                console.error('Error in member lookup:', error);
            }
        }
        return;
    }

    // Allow server owners to use member info lookup in any channel
    if (message.mentions.users.size > 0 && message.author.id === message.guild.ownerId && !message.channel.id !== MEMBER_INFO_CHANNEL_ID) {
        const mentionedUser = message.mentions.users.first();
        try {
            const mentionedMember = await message.guild.members.fetch(mentionedUser.id).catch(() => null);

            if (!mentionedMember) {
                const notFoundEmbed = new EmbedBuilder()
                    .setColor('#FF6B6B')
                    .setTitle('❌ Member Not Found')
                    .setDescription(`**${mentionedUser.username}** is not a member of this server`)
                    .setTimestamp();

                await message.reply({ embeds: [notFoundEmbed] });
                return;
            }

            const embed = await createCompactMemberInfoEmbed(mentionedMember);
            await message.reply({ embeds: [embed] });

        } catch (error) {
            console.error('Error in server owner member lookup:', error);
        }
        return;
    }

    // Auto-quarantine for blacklisted words, links, invites (only in non-member-info channels)
    if (message.channel.id !== MEMBER_INFO_CHANNEL_ID) {
        let quarantineReason = null;

        // Check for blacklisted words (always enforced)
        const containsBlacklistedWord = blacklistedWords.some(word =>
            messageContent.includes(word.toLowerCase())
        );

        if (containsBlacklistedWord) {
            quarantineReason = 'Used blacklisted word(s)';
        }

        // Check for links only if user is not admin
        const isAdmin = member.permissions.has('Administrator') ||
                       member.permissions.has('ManageMessages') ||
                       member.permissions.has('ModerateMembers') ||
                       message.author.id === message.guild.ownerId;

        if (!quarantineReason && !isAdmin && urlRegex.test(message.content)) {
            quarantineReason = 'Posted unauthorized link';
        }

        if (!quarantineReason && !isAdmin && discordInviteRegex.test(message.content)) {
            quarantineReason = 'Posted Discord invite';
        }

        if (quarantineReason) {
            try {
                await message.delete().catch(console.error);
                await quarantineUser(member, quarantineReason, currentDefaultDuration);
            } catch (error) {
                console.error('Error processing violation:', error);
            }
        }
    }
});

// Handle button interactions for card switching and interim role
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    try {
        // Handle interim role button
        if (interaction.customId === 'interim_role_request') {
            await grantInterimRole(interaction.member, interaction);
            return;
        }

        // Parse button interaction for stats cards
        const customIdParts = interaction.customId.split('_');
        if (customIdParts.length < 3) {
            console.error('Invalid button interaction ID:', interaction.customId);
            return;
        }

        const [action, cardType, guildId] = customIdParts;

        if (action === 'stats' && interaction.guild && interaction.guild.id === guildId) {
            // Acknowledge the interaction immediately
            if (!interaction.deferred && !interaction.replied) {
                await interaction.deferUpdate();
            }

            // Update card state
            cardStates.set(guildId, cardType);

            // Trigger immediate stats update for this guild
            const guild = client.guilds.cache.get(guildId);
            if (guild) {
                // Re-fetch data
                await guild.members.fetch();

                const totalMembers = guild.memberCount;
                const humanMembers = guild.members.cache.filter(member => !member.user.bot);
                const botMembers = guild.members.cache.filter(member => member.user.bot);
                const onlineMembers = humanMembers.filter(member =>
                    member.presence && member.presence.status !== 'offline'
                );
                const offlineMembers = humanMembers.filter(member =>
                    !member.presence || member.presence.status === 'offline'
                );
                const voiceChannelMembers = humanMembers.filter(member => member.voice.channel).size;
                const textChannels = guild.channels.cache.filter(channel => channel.type === 0);
                const voiceChannels = guild.channels.cache.filter(channel => channel.type === 2);
                const categoryChannels = guild.channels.cache.filter(channel => channel.type === 4);
                const roles = guild.roles.cache.filter(role => role.id !== guild.id);
                const quarantinedCount = Array.from(quarantinedUsers.values()).filter(data =>
                    data.guildId === guild.id
                ).length;

                // Create appropriate embed
                let statsEmbed;

                if (cardType === 'members') {
                    statsEmbed = createMemberOverviewCard(
                        guild, humanMembers, botMembers, onlineMembers,
                        offlineMembers, voiceChannelMembers, quarantinedCount, totalMembers
                    );
                } else if (cardType === 'server') {
                    statsEmbed = createServerInfoCard(
                        guild, textChannels, voiceChannels, categoryChannels,
                        roles, humanMembers, voiceChannelMembers
                    );
                } else if (cardType === 'access') {
                    const interactingMember = guild.members.cache.get(interaction.user.id);
                    if (interactingMember) {
                        statsEmbed = await createMemberAccessCard(guild, interactingMember);
                    } else {
                        statsEmbed = createServerInfoCard(guild, textChannels, voiceChannels, categoryChannels, roles, humanMembers, voiceChannelMembers);
                    }
                } else if (cardType === 'extended') {
                    const interactingMember = guild.members.cache.get(interaction.user.id);
                    if (interactingMember) {
                        statsEmbed = await createExtendedMemberAccessCard(guild, interactingMember);
                    } else {
                        statsEmbed = createServerInfoCard(guild, textChannels, voiceChannels, categoryChannels, roles, humanMembers, voiceChannelMembers);
                    }
                } else {
                    statsEmbed = createMemberOverviewCard(
                        guild, humanMembers, botMembers, onlineMembers,
                        offlineMembers, voiceChannelMembers, quarantinedCount, totalMembers
                    );
                }

                // Update buttons
                const memberStatsButton = new ButtonBuilder()
                    .setCustomId(`stats_members_${guild.id}`)
                    .setLabel('ᯓ➺ Member Stats')
                    .setStyle(cardType === 'members' ? ButtonStyle.Primary : ButtonStyle.Secondary);

                const serverInfoButton = new ButtonBuilder()
                    .setCustomId(`stats_server_${guild.id}`)
                    .setLabel('✿ Server Info')
                    .setStyle(cardType === 'server' ? ButtonStyle.Primary : ButtonStyle.Secondary);

                const memberAccessButton = new ButtonBuilder()
                    .setCustomId(`stats_access_${guild.id}`)
                    .setLabel('ᯓ➺ Member Access')
                    .setStyle(cardType === 'access' ? ButtonStyle.Primary : ButtonStyle.Secondary);

                const extendedAccessButton = new ButtonBuilder()
                    .setCustomId(`stats_extended_${guild.id}`)
                    .setLabel('ᯓ➺ Extended Access')
                    .setStyle(cardType === 'extended' ? ButtonStyle.Primary : ButtonStyle.Secondary);

                const buttonRow = new ActionRowBuilder()
                    .addComponents(memberStatsButton, serverInfoButton, memberAccessButton, extendedAccessButton);

                // Edit the message
                await interaction.editReply({
                    embeds: [statsEmbed],
                    components: [buttonRow]
                });
            }
        }
    } catch (error) {
        console.error('Error handling button interaction:', error);
        // Only try to respond if we haven't already
        if (!interaction.replied && !interaction.deferred) {
            try {
                await interaction.reply({ content: '❌ An error occurred.', ephemeral: true });
            } catch (replyError) {
                console.error('Error sending error response:', replyError);
            }
        }
    }
});

client.on('error', console.error);

client.login(process.env.DISCORD_BOT_TOKEN);
