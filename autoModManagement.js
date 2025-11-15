
const { EmbedBuilder } = require('discord.js');

class AutoModManager {
    constructor(client) {
        this.client = client;
        this.BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';
        
        // Auto-mod settings per guild
        this.autoModSettings = new Map(); // guildId -> settings
        
        // Blacklisted words
        this.blacklistedWords = [
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
        
        // URL/Invite detection regex
        this.urlRegex = /(https?:\/\/[^\s]+)/gi;
        this.discordInviteRegex = /(discord\.gg\/[a-zA-Z0-9]+|discord\.com\/invite\/[a-zA-Z0-9]+|discordapp\.com\/invite\/[a-zA-Z0-9]+)/gi;
        
        // User warning tracking
        this.userWarnings = new Map(); // userId -> { count, lastWarning }
    }

    // Initialize auto-mod settings for a guild
    initializeGuild(guildId) {
        if (!this.autoModSettings.has(guildId)) {
            this.autoModSettings.set(guildId, {
                enabled: true,
                checkBlacklist: true,
                checkUrls: true,
                checkInvites: true,
                checkSpam: true,
                checkMentionSpam: true,
                maxWarnings: 3,
                autoQuarantineDuration: 15, // minutes
                logChannel: '1410019894568681617'
            });
        }
        return this.autoModSettings.get(guildId);
    }

    // Check if user is authorized
    isAuthorized(message) {
        const isBotOwner = message.author.id === this.BOT_OWNER_ID;
        const isServerOwner = message.author.id === message.guild.ownerId;
        const isInOwnerChannel = message.channel.id === '1410011813398974626';
        
        return isBotOwner || (isServerOwner && isInOwnerChannel);
    }

    // Send log message
    async sendLogMessage(guild, embed) {
        try {
            const settings = this.initializeGuild(guild.id);
            const logsChannel = guild.channels.cache.get(settings.logChannel);
            
            if (logsChannel) {
                await logsChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error sending auto-mod log:', error);
        }
    }

    // Check message for violations
    async checkMessage(message) {
        if (message.author.bot) return { violation: false };
        if (!message.guild) return { violation: false };
        
        const settings = this.initializeGuild(message.guild.id);
        if (!settings.enabled) return { violation: false };

        const content = message.content.toLowerCase();
        let violationType = null;
        let violationDetails = '';

        // Check blacklisted words
        if (settings.checkBlacklist) {
            for (const word of this.blacklistedWords) {
                if (content.includes(word.toLowerCase())) {
                    violationType = 'BLACKLISTED_WORD';
                    violationDetails = `Used blacklisted word: "${word}"`;
                    break;
                }
            }
        }

        // Check URLs
        if (!violationType && settings.checkUrls) {
            const urls = content.match(this.urlRegex);
            if (urls && urls.length > 0) {
                violationType = 'UNAUTHORIZED_URL';
                violationDetails = `Posted URL: ${urls[0]}`;
            }
        }

        // Check Discord invites
        if (!violationType && settings.checkInvites) {
            const invites = content.match(this.discordInviteRegex);
            if (invites && invites.length > 0) {
                violationType = 'DISCORD_INVITE';
                violationDetails = `Posted Discord invite: ${invites[0]}`;
            }
        }

        // Check mention spam
        if (!violationType && settings.checkMentionSpam) {
            const mentions = message.mentions.users.size + message.mentions.roles.size;
            if (mentions > 5) {
                violationType = 'MENTION_SPAM';
                violationDetails = `Mentioned ${mentions} users/roles`;
            }
        }

        if (violationType) {
            return {
                violation: true,
                type: violationType,
                details: violationDetails
            };
        }

        return { violation: false };
    }

    // Handle violation
    async handleViolation(message, violation) {
        const userId = message.author.id;
        const settings = this.initializeGuild(message.guild.id);

        // Delete the message
        try {
            await message.delete();
        } catch (error) {
            console.error('Error deleting message:', error);
        }

        // Track warnings
        let userWarning = this.userWarnings.get(userId) || { count: 0, lastWarning: 0 };
        userWarning.count++;
        userWarning.lastWarning = Date.now();
        this.userWarnings.set(userId, userWarning);

        // Create violation embed
        const violationEmbed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('⚠️ Auto-Mod Violation Detected')
            .setDescription(`Message deleted for violating auto-moderation rules`)
            .addFields(
                { name: '👤 User', value: `${message.author.username} (\`${message.author.id}\`)`, inline: true },
                { name: '⚠️ Violation Type', value: violation.type, inline: true },
                { name: '🚨 Warning Count', value: `${userWarning.count}/${settings.maxWarnings}`, inline: true },
                { name: '📝 Details', value: violation.details, inline: false },
                { name: '📍 Channel', value: `<#${message.channel.id}>`, inline: true },
                { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setFooter({ text: 'Auto-Moderation System' })
            .setTimestamp();

        await this.sendLogMessage(message.guild, violationEmbed);

        // Send DM warning to user
        try {
            const warningEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⚠️ Auto-Mod Warning')
                .setDescription(`Your message was deleted for violating server rules in **${message.guild.name}**`)
                .addFields(
                    { name: '⚠️ Violation', value: violation.type, inline: true },
                    { name: '🚨 Warnings', value: `${userWarning.count}/${settings.maxWarnings}`, inline: true },
                    { name: '📝 Reason', value: violation.details, inline: false }
                )
                .setFooter({ text: 'Please follow server rules' })
                .setTimestamp();

            await message.author.send({ embeds: [warningEmbed] });
        } catch (error) {
            console.log('Could not send DM warning to user');
        }

        // Auto-quarantine if max warnings reached
        if (userWarning.count >= settings.maxWarnings) {
            return {
                shouldQuarantine: true,
                duration: settings.autoQuarantineDuration,
                reason: `Auto-Mod: ${userWarning.count} violations - Last: ${violation.type}`
            };
        }

        return { shouldQuarantine: false };
    }

    // Toggle auto-mod
    async toggleAutoMod(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const settings = this.initializeGuild(message.guild.id);
        const action = args[1]?.toLowerCase();

        if (action === 'on' || action === 'enable') {
            settings.enabled = true;
            await message.reply('✅ Auto-moderation enabled.');
        } else if (action === 'off' || action === 'disable') {
            settings.enabled = false;
            await message.reply('✅ Auto-moderation disabled.');
        } else {
            const status = settings.enabled ? 'enabled' : 'disabled';
            await message.reply(`Auto-moderation is currently **${status}**. Use \`automod on/off\` to toggle.`);
        }
    }

    // Configure auto-mod settings
    async configureAutoMod(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const settings = this.initializeGuild(message.guild.id);
        const setting = args[1]?.toLowerCase();
        const value = args[2]?.toLowerCase();

        if (!setting) {
            const embed = new EmbedBuilder()
                .setColor('#5865F2')
                .setTitle('⚙️ Auto-Mod Settings')
                .setDescription('Current auto-moderation configuration')
                .addFields(
                    { name: '🛡️ Status', value: settings.enabled ? '✅ Enabled' : '❌ Disabled', inline: true },
                    { name: '📝 Blacklist Check', value: settings.checkBlacklist ? '✅ On' : '❌ Off', inline: true },
                    { name: '🔗 URL Check', value: settings.checkUrls ? '✅ On' : '❌ Off', inline: true },
                    { name: '📨 Invite Check', value: settings.checkInvites ? '✅ On' : '❌ Off', inline: true },
                    { name: '💬 Spam Check', value: settings.checkSpam ? '✅ On' : '❌ Off', inline: true },
                    { name: '👥 Mention Spam Check', value: settings.checkMentionSpam ? '✅ On' : '❌ Off', inline: true },
                    { name: '⚠️ Max Warnings', value: `${settings.maxWarnings}`, inline: true },
                    { name: '⏰ Auto-Quarantine Duration', value: `${settings.autoQuarantineDuration} minutes`, inline: true },
                    { name: '📋 Usage', value: '`automodconfig <setting> <value>`', inline: false }
                )
                .setFooter({ text: 'Auto-Moderation System' })
                .setTimestamp();

            return message.reply({ embeds: [embed] });
        }

        switch (setting) {
            case 'blacklist':
                settings.checkBlacklist = value === 'on';
                await message.reply(`✅ Blacklist checking ${value === 'on' ? 'enabled' : 'disabled'}.`);
                break;
            case 'urls':
                settings.checkUrls = value === 'on';
                await message.reply(`✅ URL checking ${value === 'on' ? 'enabled' : 'disabled'}.`);
                break;
            case 'invites':
                settings.checkInvites = value === 'on';
                await message.reply(`✅ Invite checking ${value === 'on' ? 'enabled' : 'disabled'}.`);
                break;
            case 'spam':
                settings.checkSpam = value === 'on';
                await message.reply(`✅ Spam checking ${value === 'on' ? 'enabled' : 'disabled'}.`);
                break;
            case 'mentions':
                settings.checkMentionSpam = value === 'on';
                await message.reply(`✅ Mention spam checking ${value === 'on' ? 'enabled' : 'disabled'}.`);
                break;
            case 'maxwarnings':
                const warnings = parseInt(value);
                if (isNaN(warnings) || warnings < 1) {
                    return message.reply('❌ Please provide a valid number (1 or higher).');
                }
                settings.maxWarnings = warnings;
                await message.reply(`✅ Max warnings set to ${warnings}.`);
                break;
            case 'duration':
                const duration = parseInt(value);
                if (isNaN(duration) || duration < 1) {
                    return message.reply('❌ Please provide a valid duration in minutes.');
                }
                settings.autoQuarantineDuration = duration;
                await message.reply(`✅ Auto-quarantine duration set to ${duration} minutes.`);
                break;
            default:
                await message.reply('❌ Invalid setting. Available: blacklist, urls, invites, spam, mentions, maxwarnings, duration');
        }
    }

    // Add blacklisted word
    async addBlacklistedWord(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const word = args.slice(1).join(' ').toLowerCase();
        if (!word) {
            return message.reply('❌ Please provide a word to blacklist. Usage: `blacklist add <word>`');
        }

        if (this.blacklistedWords.includes(word)) {
            return message.reply(`❌ "${word}" is already blacklisted.`);
        }

        this.blacklistedWords.push(word);
        await message.reply(`✅ Added "${word}" to blacklist.`);

        const logEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('📝 Blacklist Updated')
            .setDescription(`New word added to blacklist`)
            .addFields(
                { name: '📝 Word', value: word, inline: true },
                { name: '👑 Added By', value: message.author.username, inline: true },
                { name: '📊 Total Blacklisted', value: `${this.blacklistedWords.length}`, inline: true }
            )
            .setTimestamp();

        await this.sendLogMessage(message.guild, logEmbed);
    }

    // Remove blacklisted word
    async removeBlacklistedWord(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const word = args.slice(1).join(' ').toLowerCase();
        if (!word) {
            return message.reply('❌ Please provide a word to remove. Usage: `blacklist remove <word>`');
        }

        const index = this.blacklistedWords.indexOf(word);
        if (index === -1) {
            return message.reply(`❌ "${word}" is not in the blacklist.`);
        }

        this.blacklistedWords.splice(index, 1);
        await message.reply(`✅ Removed "${word}" from blacklist.`);
    }

    // List blacklisted words
    async listBlacklistedWords(message) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('📝 Blacklisted Words')
            .setDescription(`Total: **${this.blacklistedWords.length}** words`)
            .addFields({
                name: '🚫 Words',
                value: this.blacklistedWords.slice(0, 50).join(', ') + (this.blacklistedWords.length > 50 ? '...' : ''),
                inline: false
            })
            .setFooter({ text: `Showing ${Math.min(50, this.blacklistedWords.length)}/${this.blacklistedWords.length} words` })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // Clear user warnings
    async clearWarnings(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const user = message.mentions.users.first();
        if (!user) {
            return message.reply('❌ Please mention a user. Usage: `clearwarnings @user`');
        }

        const hadWarnings = this.userWarnings.has(user.id);
        const warningCount = hadWarnings ? this.userWarnings.get(user.id).count : 0;
        
        this.userWarnings.delete(user.id);
        await message.reply(`✅ Cleared ${warningCount} warning(s) for ${user.username}.`);
    }

    // Handle commands
    async handleCommand(message, command, args) {
        switch (command) {
            case 'automod':
                await this.toggleAutoMod(message, args);
                break;
            case 'automodconfig':
            case 'amc':
                await this.configureAutoMod(message, args);
                break;
            case 'blacklist':
                if (args[1] === 'add') {
                    await this.addBlacklistedWord(message, args.slice(1));
                } else if (args[1] === 'remove') {
                    await this.removeBlacklistedWord(message, args.slice(1));
                } else if (args[1] === 'list') {
                    await this.listBlacklistedWords(message);
                } else {
                    await message.reply('❌ Usage: `blacklist <add/remove/list> [word]`');
                }
                break;
            case 'clearwarnings':
            case 'cw':
                await this.clearWarnings(message, args);
                break;
        }
    }
}

module.exports = AutoModManager;
