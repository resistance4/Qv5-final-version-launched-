
const { EmbedBuilder, AuditLogEvent, PermissionFlagsBits } = require('discord.js');

class SecurityManager {
    constructor(client) {
        this.client = client;
        this.BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';
        
        // Security settings per guild
        this.securitySettings = new Map(); // guildId -> settings
        
        // Violation tracking
        this.violationTracking = new Map(); // userId -> { count, violations: [] }
        
        // Whitelist for trusted users (won't trigger anti-nuke)
        this.whitelistedUsers = new Map(); // guildId -> Set of userIds
    }

    // Initialize security settings for a guild
    initializeGuild(guildId) {
        if (!this.securitySettings.has(guildId)) {
            this.securitySettings.set(guildId, {
                enabled: false,
                antiRoleCreate: false,
                antiRoleDelete: false,
                antiRoleUpdate: false,
                antiRolePermissionUpdate: false,
                antiRoleReorder: false,
                antiChannelCreate: false,
                antiChannelDelete: false,
                antiChannelUpdate: false,
                antiChannelPermissionUpdate: false,
                antiChannelReorder: false,
                antiChannelNameModification: false,
                antiBan: false,
                antiKick: false,
                antiWebhook: false,
                antiBot: false,
                antiServer: false,
                antiEmojiDelete: false,
                antiEmojiCreate: false,
                antiEmojiUpdate: false,
                antiMemberRoleUpdate: false,
                logChannel: '1410019894568681617',
                maxViolations: 3,
                punishmentType: 'ban', // ban, kick, or quarantine
                quarantineDuration: 120 // 2 hours
            });
        }
        return this.securitySettings.get(guildId);
    }

    // Check if user is authorized
    isAuthorized(message) {
        const isBotOwner = message.author.id === this.BOT_OWNER_ID;
        const isServerOwner = message.author.id === message.guild.ownerId;
        const isInOwnerChannel = message.channel.id === '1410011813398974626';
        
        return isBotOwner || (isServerOwner && isInOwnerChannel);
    }

    // Check if user is whitelisted or immune
    isImmune(userId, guildId) {
        // Bot owner, server owner, and whitelisted bots are always immune
        const guild = this.client.guilds.cache.get(guildId);
        if (!guild) return false;
        
        const isBotOwner = userId === this.BOT_OWNER_ID;
        const isServerOwner = userId === guild.ownerId;
        const isBot = userId === this.client.user.id;
        
        // Check if user is a bot member and check if they're whitelisted
        const member = guild.members.cache.get(userId);
        const isWhitelistedBot = member && member.user.bot && global.WHITELISTED_BOTS && global.WHITELISTED_BOTS.has(userId);
        
        // Check whitelist
        const whitelist = this.whitelistedUsers.get(guildId);
        const isWhitelisted = whitelist && whitelist.has(userId);
        
        return isBotOwner || isServerOwner || isBot || isWhitelisted || isWhitelistedBot;
    }

    // Send security log
    async sendSecurityLog(guild, embed) {
        try {
            const settings = this.initializeGuild(guild.id);
            const logsChannel = guild.channels.cache.get(settings.logChannel);
            
            if (logsChannel) {
                await logsChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error sending security log:', error);
        }
    }

    // Track violation
    async trackViolation(guild, user, violationType) {
        const userId = user.id;
        const guildId = guild.id;
        const settings = this.initializeGuild(guildId);
        
        let userViolations = this.violationTracking.get(userId) || { count: 0, violations: [] };
        userViolations.count++;
        userViolations.violations.push({
            type: violationType,
            timestamp: Date.now(),
            guildId: guildId
        });
        
        this.violationTracking.set(userId, userViolations);
        
        // Check if max violations reached
        if (userViolations.count >= settings.maxViolations) {
            await this.punishViolator(guild, user, violationType, userViolations.count);
        }
        
        return userViolations.count;
    }

    // Punish violator based on settings
    async punishViolator(guild, user, violationType, violationCount) {
        const settings = this.initializeGuild(guild.id);
        
        try {
            const member = await guild.members.fetch(user.id).catch(() => null);
            
            if (!member) {
                console.log(`User ${user.username} not in server, cannot punish`);
                return;
            }
            
            const reason = `Anti-Nuke: ${violationCount} security violations - Last: ${violationType}`;
            
            switch (settings.punishmentType) {
                case 'ban':
                    await guild.bans.create(user.id, { reason });
                    break;
                    
                case 'kick':
                    if (member.kickable) {
                        await member.kick(reason);
                    }
                    break;
                    
                case 'quarantine':
                    // Use existing quarantine system if available
                    const QUARANTINE_ROLE_ID = '1404869933430738974';
                    const quarantineRole = guild.roles.cache.get(QUARANTINE_ROLE_ID);
                    if (quarantineRole) {
                        await member.roles.set([quarantineRole.id], reason);
                    }
                    break;
            }
            
            // Send punishment notification
            const punishEmbed = new EmbedBuilder()
                .setColor('#8B0000')
                .setTitle('🚨 ANTI-NUKE VIOLATION - USER PUNISHED')
                .setDescription(`**Security violation detected and user punished**`)
                .addFields(
                    { name: '👤 User', value: `${user.username} (\`${user.id}\`)`, inline: true },
                    { name: '⚠️ Violation Type', value: violationType, inline: true },
                    { name: '🚨 Violation Count', value: `${violationCount}`, inline: true },
                    { name: '⚖️ Punishment', value: settings.punishmentType.toUpperCase(), inline: true },
                    { name: '📊 Status', value: '✅ **THREAT NEUTRALIZED**', inline: true }
                )
                .setFooter({ text: 'Anti-Nuke Security System' })
                .setTimestamp();
            
            await this.sendSecurityLog(guild, punishEmbed);
            
        } catch (error) {
            console.error('Error punishing violator:', error);
        }
    }

    // Monitor role creation
    async monitorRoleCreate(role) {
        const settings = this.initializeGuild(role.guild.id);
        if (!settings.enabled || !settings.antiRoleCreate) return;
        
        try {
            const auditLogs = await role.guild.fetchAuditLogs({
                type: AuditLogEvent.RoleCreate,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, role.guild.id)) return;
            
            // Delete the role
            await role.delete('Anti-Nuke: Unauthorized role creation');
            
            // Track violation
            const violationCount = await this.trackViolation(role.guild, logEntry.executor, 'ROLE_CREATE');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Role Creation Blocked')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '🎭 Role Name', value: role.name, inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(role.guild, embed);
            
        } catch (error) {
            console.error('Error in role create monitor:', error);
        }
    }

    // Monitor role deletion
    async monitorRoleDelete(role) {
        const settings = this.initializeGuild(role.guild.id);
        if (!settings.enabled || !settings.antiRoleDelete) return;
        
        try {
            const auditLogs = await role.guild.fetchAuditLogs({
                type: AuditLogEvent.RoleDelete,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, role.guild.id)) return;
            
            // Recreate the role
            await role.guild.roles.create({
                name: role.name,
                color: role.color,
                permissions: role.permissions,
                position: role.position,
                hoist: role.hoist,
                mentionable: role.mentionable,
                reason: 'Anti-Nuke: Restoring deleted role'
            });
            
            const violationCount = await this.trackViolation(role.guild, logEntry.executor, 'ROLE_DELETE');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Role Deletion Blocked & Restored')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '🎭 Role Name', value: role.name, inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(role.guild, embed);
            
        } catch (error) {
            console.error('Error in role delete monitor:', error);
        }
    }

    // Monitor role updates
    async monitorRoleUpdate(oldRole, newRole) {
        const settings = this.initializeGuild(newRole.guild.id);
        if (!settings.enabled || !settings.antiRoleUpdate) return;
        
        try {
            const auditLogs = await newRole.guild.fetchAuditLogs({
                type: AuditLogEvent.RoleUpdate,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, newRole.guild.id)) return;
            
            // Revert role changes
            await newRole.edit({
                name: oldRole.name,
                color: oldRole.color,
                permissions: oldRole.permissions,
                hoist: oldRole.hoist,
                mentionable: oldRole.mentionable,
                reason: 'Anti-Nuke: Reverting unauthorized role update'
            });
            
            const violationCount = await this.trackViolation(newRole.guild, logEntry.executor, 'ROLE_UPDATE');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Role Update Blocked & Reverted')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '🎭 Role', value: newRole.toString(), inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(newRole.guild, embed);
            
        } catch (error) {
            console.error('Error in role update monitor:', error);
        }
    }

    // Monitor channel creation
    async monitorChannelCreate(channel) {
        if (!channel.guild) return;
        
        const settings = this.initializeGuild(channel.guild.id);
        if (!settings.enabled || !settings.antiChannelCreate) return;
        
        try {
            const auditLogs = await channel.guild.fetchAuditLogs({
                type: AuditLogEvent.ChannelCreate,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, channel.guild.id)) return;
            
            await channel.delete('Anti-Nuke: Unauthorized channel creation');
            
            const violationCount = await this.trackViolation(channel.guild, logEntry.executor, 'CHANNEL_CREATE');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Channel Creation Blocked')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '📺 Channel', value: channel.name, inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(channel.guild, embed);
            
        } catch (error) {
            console.error('Error in channel create monitor:', error);
        }
    }

    // Monitor channel deletion
    async monitorChannelDelete(channel) {
        if (!channel.guild) return;
        
        const settings = this.initializeGuild(channel.guild.id);
        if (!settings.enabled || !settings.antiChannelDelete) return;
        
        try {
            const auditLogs = await channel.guild.fetchAuditLogs({
                type: AuditLogEvent.ChannelDelete,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, channel.guild.id)) return;
            
            // Recreate channel
            const recreated = await channel.guild.channels.create({
                name: channel.name,
                type: channel.type,
                parent: channel.parent,
                position: channel.position,
                topic: channel.topic,
                nsfw: channel.nsfw,
                bitrate: channel.bitrate,
                userLimit: channel.userLimit,
                rateLimitPerUser: channel.rateLimitPerUser,
                reason: 'Anti-Nuke: Restoring deleted channel'
            });
            
            const violationCount = await this.trackViolation(channel.guild, logEntry.executor, 'CHANNEL_DELETE');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Channel Deletion Blocked & Restored')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '📺 Channel', value: channel.name, inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(channel.guild, embed);
            
        } catch (error) {
            console.error('Error in channel delete monitor:', error);
        }
    }

    // Monitor channel updates
    async monitorChannelUpdate(oldChannel, newChannel) {
        if (!newChannel.guild) return;
        
        const settings = this.initializeGuild(newChannel.guild.id);
        if (!settings.enabled || !settings.antiChannelUpdate) return;
        
        try {
            const auditLogs = await newChannel.guild.fetchAuditLogs({
                type: AuditLogEvent.ChannelUpdate,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, newChannel.guild.id)) return;
            
            // Revert channel changes
            await newChannel.edit({
                name: oldChannel.name,
                topic: oldChannel.topic,
                nsfw: oldChannel.nsfw,
                bitrate: oldChannel.bitrate,
                userLimit: oldChannel.userLimit,
                rateLimitPerUser: oldChannel.rateLimitPerUser,
                reason: 'Anti-Nuke: Reverting unauthorized channel update'
            });
            
            const violationCount = await this.trackViolation(newChannel.guild, logEntry.executor, 'CHANNEL_UPDATE');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Channel Update Blocked & Reverted')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '📺 Channel', value: newChannel.toString(), inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(newChannel.guild, embed);
            
        } catch (error) {
            console.error('Error in channel update monitor:', error);
        }
    }

    // Monitor bans
    async monitorBan(ban) {
        const settings = this.initializeGuild(ban.guild.id);
        if (!settings.enabled || !settings.antiBan) return;
        
        try {
            const auditLogs = await ban.guild.fetchAuditLogs({
                type: AuditLogEvent.MemberBanAdd,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, ban.guild.id)) return;
            
            // Unban the user
            await ban.guild.bans.remove(ban.user.id, 'Anti-Nuke: Reverting unauthorized ban');
            
            const violationCount = await this.trackViolation(ban.guild, logEntry.executor, 'MEMBER_BAN');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Ban Blocked & Reverted')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '🎯 Banned User', value: `${ban.user.username}`, inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(ban.guild, embed);
            
        } catch (error) {
            console.error('Error in ban monitor:', error);
        }
    }

    // Monitor kicks
    async monitorKick(member) {
        const settings = this.initializeGuild(member.guild.id);
        if (!settings.enabled || !settings.antiKick) return;
        
        try {
            const auditLogs = await member.guild.fetchAuditLogs({
                type: AuditLogEvent.MemberKick,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, member.guild.id)) return;
            
            const violationCount = await this.trackViolation(member.guild, logEntry.executor, 'MEMBER_KICK');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Kick Detected')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '🎯 Kicked User', value: `${member.user.username}`, inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(member.guild, embed);
            
        } catch (error) {
            console.error('Error in kick monitor:', error);
        }
    }

    // Monitor webhooks
    async monitorWebhookUpdate(channel) {
        if (!channel.guild) return;
        
        const settings = this.initializeGuild(channel.guild.id);
        if (!settings.enabled || !settings.antiWebhook) return;
        
        try {
            const auditLogs = await channel.guild.fetchAuditLogs({
                type: AuditLogEvent.WebhookCreate,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, channel.guild.id)) return;
            
            // Delete all webhooks in channel
            const webhooks = await channel.fetchWebhooks();
            for (const webhook of webhooks.values()) {
                await webhook.delete('Anti-Nuke: Unauthorized webhook creation');
            }
            
            const violationCount = await this.trackViolation(channel.guild, logEntry.executor, 'WEBHOOK_CREATE');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Webhook Creation Blocked')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '📺 Channel', value: channel.toString(), inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(channel.guild, embed);
            
        } catch (error) {
            console.error('Error in webhook monitor:', error);
        }
    }

    // Monitor bot additions
    async monitorBotAdd(member) {
        if (!member.user.bot) return;
        
        const settings = this.initializeGuild(member.guild.id);
        if (!settings.enabled || !settings.antiBot) return;
        
        try {
            const auditLogs = await member.guild.fetchAuditLogs({
                type: AuditLogEvent.BotAdd,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, member.guild.id)) return;
            
            // Kick the bot
            await member.kick('Anti-Nuke: Unauthorized bot addition');
            
            const violationCount = await this.trackViolation(member.guild, logEntry.executor, 'BOT_ADD');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Bot Addition Blocked')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '🤖 Bot', value: `${member.user.username}`, inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(member.guild, embed);
            
        } catch (error) {
            console.error('Error in bot add monitor:', error);
        }
    }

    // Monitor emoji deletion
    async monitorEmojiDelete(emoji) {
        const settings = this.initializeGuild(emoji.guild.id);
        if (!settings.enabled || !settings.antiEmojiDelete) return;
        
        try {
            const auditLogs = await emoji.guild.fetchAuditLogs({
                type: AuditLogEvent.EmojiDelete,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, emoji.guild.id)) return;
            
            const violationCount = await this.trackViolation(emoji.guild, logEntry.executor, 'EMOJI_DELETE');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Emoji Deletion Detected')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '😀 Emoji', value: emoji.name, inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(emoji.guild, embed);
            
        } catch (error) {
            console.error('Error in emoji delete monitor:', error);
        }
    }

    // Monitor emoji creation
    async monitorEmojiCreate(emoji) {
        const settings = this.initializeGuild(emoji.guild.id);
        if (!settings.enabled || !settings.antiEmojiCreate) return;
        
        try {
            const auditLogs = await emoji.guild.fetchAuditLogs({
                type: AuditLogEvent.EmojiCreate,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, emoji.guild.id)) return;
            
            await emoji.delete('Anti-Nuke: Unauthorized emoji creation');
            
            const violationCount = await this.trackViolation(emoji.guild, logEntry.executor, 'EMOJI_CREATE');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Emoji Creation Blocked')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '😀 Emoji', value: emoji.name, inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(emoji.guild, embed);
            
        } catch (error) {
            console.error('Error in emoji create monitor:', error);
        }
    }

    // Monitor emoji updates
    async monitorEmojiUpdate(oldEmoji, newEmoji) {
        const settings = this.initializeGuild(newEmoji.guild.id);
        if (!settings.enabled || !settings.antiEmojiUpdate) return;
        
        try {
            const auditLogs = await newEmoji.guild.fetchAuditLogs({
                type: AuditLogEvent.EmojiUpdate,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, newEmoji.guild.id)) return;
            
            await newEmoji.edit({
                name: oldEmoji.name,
                reason: 'Anti-Nuke: Reverting unauthorized emoji update'
            });
            
            const violationCount = await this.trackViolation(newEmoji.guild, logEntry.executor, 'EMOJI_UPDATE');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Emoji Update Blocked & Reverted')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '😀 Emoji', value: newEmoji.name, inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(newEmoji.guild, embed);
            
        } catch (error) {
            console.error('Error in emoji update monitor:', error);
        }
    }

    // Monitor member role updates
    async monitorMemberRoleUpdate(oldMember, newMember) {
        const settings = this.initializeGuild(newMember.guild.id);
        if (!settings.enabled || !settings.antiMemberRoleUpdate) return;
        
        try {
            const auditLogs = await newMember.guild.fetchAuditLogs({
                type: AuditLogEvent.MemberRoleUpdate,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, newMember.guild.id)) return;
            
            // Revert role changes
            await newMember.roles.set(oldMember.roles.cache, 'Anti-Nuke: Reverting unauthorized role update');
            
            const violationCount = await this.trackViolation(newMember.guild, logEntry.executor, 'MEMBER_ROLE_UPDATE');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Member Role Update Blocked & Reverted')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '🎯 Target', value: `${newMember.user.username}`, inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(newMember.guild, embed);
            
        } catch (error) {
            console.error('Error in member role update monitor:', error);
        }
    }

    // Monitor channel permission updates
    async monitorChannelPermissionUpdate(oldChannel, newChannel) {
        if (!newChannel.guild) return;
        
        const settings = this.initializeGuild(newChannel.guild.id);
        if (!settings.enabled || !settings.antiChannelPermissionUpdate) return;
        
        try {
            // Check if permission overwrites changed
            const oldPerms = oldChannel.permissionOverwrites?.cache || new Map();
            const newPerms = newChannel.permissionOverwrites?.cache || new Map();
            
            if (oldPerms.size === newPerms.size && 
                Array.from(oldPerms.keys()).every(key => newPerms.has(key))) {
                return; // No permission changes
            }
            
            const auditLogs = await newChannel.guild.fetchAuditLogs({
                type: AuditLogEvent.ChannelOverwriteUpdate,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, newChannel.guild.id)) return;
            
            // Revert permission changes
            await newChannel.permissionOverwrites.set(oldPerms, 'Anti-Nuke: Reverting unauthorized channel permission update');
            
            const violationCount = await this.trackViolation(newChannel.guild, logEntry.executor, 'CHANNEL_PERMISSION_UPDATE');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Channel Permission Update Blocked & Reverted')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '📺 Channel', value: newChannel.toString(), inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(newChannel.guild, embed);
            
        } catch (error) {
            console.error('Error in channel permission update monitor:', error);
        }
    }

    // Monitor role reorder (position changes)
    async monitorRoleReorder(oldRole, newRole) {
        const settings = this.initializeGuild(newRole.guild.id);
        if (!settings.enabled || !settings.antiRoleReorder) return;
        
        try {
            // Check if position changed
            if (oldRole.position === newRole.position) return;
            
            const auditLogs = await newRole.guild.fetchAuditLogs({
                type: AuditLogEvent.RoleUpdate,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, newRole.guild.id)) return;
            
            // Revert position change
            await newRole.setPosition(oldRole.position, { relative: false, reason: 'Anti-Nuke: Reverting unauthorized role reorder' });
            
            const violationCount = await this.trackViolation(newRole.guild, logEntry.executor, 'ROLE_REORDER');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Role Reorder Blocked & Reverted')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '🎭 Role', value: newRole.toString(), inline: true },
                    { name: '📊 Old Position', value: `${oldRole.position}`, inline: true },
                    { name: '📊 New Position', value: `${newRole.position}`, inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(newRole.guild, embed);
            
        } catch (error) {
            console.error('Error in role reorder monitor:', error);
        }
    }

    // Monitor channel reorder (position changes)
    async monitorChannelReorder(oldChannel, newChannel) {
        if (!newChannel.guild) return;
        
        const settings = this.initializeGuild(newChannel.guild.id);
        if (!settings.enabled || !settings.antiChannelReorder) return;
        
        try {
            // Check if position changed
            if (oldChannel.position === newChannel.position) return;
            
            const auditLogs = await newChannel.guild.fetchAuditLogs({
                type: AuditLogEvent.ChannelUpdate,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, newChannel.guild.id)) return;
            
            // Revert position change
            await newChannel.setPosition(oldChannel.position, { relative: false, reason: 'Anti-Nuke: Reverting unauthorized channel reorder' });
            
            const violationCount = await this.trackViolation(newChannel.guild, logEntry.executor, 'CHANNEL_REORDER');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Channel Reorder Blocked & Reverted')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '📺 Channel', value: newChannel.toString(), inline: true },
                    { name: '📊 Old Position', value: `${oldChannel.position}`, inline: true },
                    { name: '📊 New Position', value: `${newChannel.position}`, inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(newChannel.guild, embed);
            
        } catch (error) {
            console.error('Error in channel reorder monitor:', error);
        }
    }

    // Monitor channel name modifications
    async monitorChannelNameModification(oldChannel, newChannel) {
        if (!newChannel.guild) return;
        
        const settings = this.initializeGuild(newChannel.guild.id);
        if (!settings.enabled || !settings.antiChannelNameModification) return;
        
        try {
            // Check if name changed
            if (oldChannel.name === newChannel.name) return;
            
            const auditLogs = await newChannel.guild.fetchAuditLogs({
                type: AuditLogEvent.ChannelUpdate,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, newChannel.guild.id)) return;
            
            // Revert name change
            await newChannel.setName(oldChannel.name, 'Anti-Nuke: Reverting unauthorized channel name modification');
            
            const violationCount = await this.trackViolation(newChannel.guild, logEntry.executor, 'CHANNEL_NAME_MODIFICATION');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Channel Name Change Blocked & Reverted')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '📺 Channel', value: newChannel.toString(), inline: true },
                    { name: '📝 Old Name', value: oldChannel.name, inline: true },
                    { name: '📝 New Name', value: newChannel.name, inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(newChannel.guild, embed);
            
        } catch (error) {
            console.error('Error in channel name modification monitor:', error);
        }
    }

    // Monitor role permission updates (enhanced)
    async monitorRolePermissionUpdate(oldRole, newRole) {
        const settings = this.initializeGuild(newRole.guild.id);
        if (!settings.enabled || !settings.antiRolePermissionUpdate) return;
        
        try {
            // Check if permissions changed
            if (oldRole.permissions.bitfield === newRole.permissions.bitfield) return;
            
            const auditLogs = await newRole.guild.fetchAuditLogs({
                type: AuditLogEvent.RoleUpdate,
                limit: 1
            });
            
            const logEntry = auditLogs.entries.first();
            if (!logEntry || !logEntry.executor) return;
            
            if (this.isImmune(logEntry.executor.id, newRole.guild.id)) return;
            
            // Revert permission changes
            await newRole.setPermissions(oldRole.permissions, 'Anti-Nuke: Reverting unauthorized role permission update');
            
            const violationCount = await this.trackViolation(newRole.guild, logEntry.executor, 'ROLE_PERMISSION_UPDATE');
            
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🛡️ Anti-Nuke: Role Permission Update Blocked & Reverted')
                .addFields(
                    { name: '👤 Violator', value: `${logEntry.executor.username}`, inline: true },
                    { name: '🎭 Role', value: newRole.toString(), inline: true },
                    { name: '🚨 Violations', value: `${violationCount}/${settings.maxViolations}`, inline: true }
                )
                .setTimestamp();
            
            await this.sendSecurityLog(newRole.guild, embed);
            
        } catch (error) {
            console.error('Error in role permission update monitor:', error);
        }
    }

    // Enable all security features
    async enableAllSecurity(message) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const settings = this.initializeGuild(message.guild.id);
        
        settings.enabled = true;
        settings.antiRoleCreate = true;
        settings.antiRoleDelete = true;
        settings.antiRoleUpdate = true;
        settings.antiRolePermissionUpdate = true;
        settings.antiRoleReorder = true;
        settings.antiChannelCreate = true;
        settings.antiChannelDelete = true;
        settings.antiChannelUpdate = true;
        settings.antiChannelPermissionUpdate = true;
        settings.antiChannelReorder = true;
        settings.antiChannelNameModification = true;
        settings.antiBan = true;
        settings.antiKick = true;
        settings.antiWebhook = true;
        settings.antiBot = true;
        settings.antiServer = true;
        settings.antiEmojiDelete = true;
        settings.antiEmojiCreate = true;
        settings.antiEmojiUpdate = true;
        settings.antiMemberRoleUpdate = true;

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🛡️ Anti-Nuke Security Enabled')
            .setDescription('**ALL SECURITY FEATURES ACTIVATED**')
            .addFields(
                { name: '✅ Anti Role Create', value: 'Enabled', inline: true },
                { name: '✅ Anti Role Delete', value: 'Enabled', inline: true },
                { name: '✅ Anti Role Update', value: 'Enabled', inline: true },
                { name: '✅ Anti Role Permission Update', value: 'Enabled', inline: true },
                { name: '✅ Anti Role Reorder', value: 'Enabled', inline: true },
                { name: '✅ Anti Channel Create', value: 'Enabled', inline: true },
                { name: '✅ Anti Channel Delete', value: 'Enabled', inline: true },
                { name: '✅ Anti Channel Update', value: 'Enabled', inline: true },
                { name: '✅ Anti Channel Permission Update', value: 'Enabled', inline: true },
                { name: '✅ Anti Channel Reorder', value: 'Enabled', inline: true },
                { name: '✅ Anti Channel Name Modification', value: 'Enabled', inline: true },
                { name: '✅ Anti Ban', value: 'Enabled', inline: true },
                { name: '✅ Anti Kick', value: 'Enabled', inline: true },
                { name: '✅ Anti Webhook', value: 'Enabled', inline: true },
                { name: '✅ Anti Bot', value: 'Enabled', inline: true },
                { name: '✅ Anti Server', value: 'Enabled', inline: true },
                { name: '✅ Anti Emoji Delete', value: 'Enabled', inline: true },
                { name: '✅ Anti Emoji Create', value: 'Enabled', inline: true },
                { name: '✅ Anti Emoji Update', value: 'Enabled', inline: true },
                { name: '✅ Anti Member Role Update', value: 'Enabled', inline: true },
                { name: '⚙️ Max Violations', value: `${settings.maxViolations}`, inline: true },
                { name: '⚖️ Punishment Type', value: settings.punishmentType.toUpperCase(), inline: true },
                { name: '👑 Enabled By', value: message.author.username, inline: true }
            )
            .setFooter({ text: 'Anti-Nuke Security System - Full Protection Active' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
        await this.sendSecurityLog(message.guild, embed);
    }

    // Disable all security features
    async disableAllSecurity(message) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const settings = this.initializeGuild(message.guild.id);
        
        settings.enabled = false;
        settings.antiRoleCreate = false;
        settings.antiRoleDelete = false;
        settings.antiRoleUpdate = false;
        settings.antiRolePermissionUpdate = false;
        settings.antiRoleReorder = false;
        settings.antiChannelCreate = false;
        settings.antiChannelDelete = false;
        settings.antiChannelUpdate = false;
        settings.antiChannelPermissionUpdate = false;
        settings.antiChannelReorder = false;
        settings.antiChannelNameModification = false;
        settings.antiBan = false;
        settings.antiKick = false;
        settings.antiWebhook = false;
        settings.antiBot = false;
        settings.antiServer = false;
        settings.antiEmojiDelete = false;
        settings.antiEmojiCreate = false;
        settings.antiEmojiUpdate = false;
        settings.antiMemberRoleUpdate = false;

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🔓 Anti-Nuke Security Disabled')
            .setDescription('**ALL SECURITY FEATURES DEACTIVATED**')
            .addFields(
                { name: '❌ Anti Role Create', value: 'Disabled', inline: true },
                { name: '❌ Anti Role Delete', value: 'Disabled', inline: true },
                { name: '❌ Anti Role Update', value: 'Disabled', inline: true },
                { name: '❌ Anti Role Permission Update', value: 'Disabled', inline: true },
                { name: '❌ Anti Role Reorder', value: 'Disabled', inline: true },
                { name: '❌ Anti Channel Create', value: 'Disabled', inline: true },
                { name: '❌ Anti Channel Delete', value: 'Disabled', inline: true },
                { name: '❌ Anti Channel Update', value: 'Disabled', inline: true },
                { name: '❌ Anti Channel Permission Update', value: 'Disabled', inline: true },
                { name: '❌ Anti Channel Reorder', value: 'Disabled', inline: true },
                { name: '❌ Anti Channel Name Modification', value: 'Disabled', inline: true },
                { name: '❌ Anti Ban', value: 'Disabled', inline: true },
                { name: '❌ Anti Kick', value: 'Disabled', inline: true },
                { name: '❌ Anti Webhook', value: 'Disabled', inline: true },
                { name: '❌ Anti Bot', value: 'Disabled', inline: true },
                { name: '❌ Anti Server', value: 'Disabled', inline: true },
                { name: '❌ Anti Emoji Delete', value: 'Disabled', inline: true },
                { name: '❌ Anti Emoji Create', value: 'Disabled', inline: true },
                { name: '❌ Anti Emoji Update', value: 'Disabled', inline: true },
                { name: '❌ Anti Member Role Update', value: 'Disabled', inline: true },
                { name: '👑 Disabled By', value: message.author.username, inline: true }
            )
            .setFooter({ text: 'Anti-Nuke Security System - Protection Disabled' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
        await this.sendSecurityLog(message.guild, embed);
    }

    // Show security status
    async showSecurityStatus(message) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const settings = this.initializeGuild(message.guild.id);
        
        const statusEmoji = (enabled) => enabled ? '✅' : '❌';

        const embed = new EmbedBuilder()
            .setColor(settings.enabled ? '#00FF00' : '#FF0000')
            .setTitle('🛡️ Anti-Nuke Security Status')
            .setDescription(`**System Status:** ${settings.enabled ? '✅ ACTIVE' : '❌ INACTIVE'}`)
            .addFields(
                { name: `${statusEmoji(settings.antiRoleCreate)} Anti Role Create`, value: settings.antiRoleCreate ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiRoleDelete)} Anti Role Delete`, value: settings.antiRoleDelete ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiRoleUpdate)} Anti Role Update`, value: settings.antiRoleUpdate ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiRolePermissionUpdate)} Anti Role Permission Update`, value: settings.antiRolePermissionUpdate ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiRoleReorder)} Anti Role Reorder`, value: settings.antiRoleReorder ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiChannelCreate)} Anti Channel Create`, value: settings.antiChannelCreate ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiChannelDelete)} Anti Channel Delete`, value: settings.antiChannelDelete ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiChannelUpdate)} Anti Channel Update`, value: settings.antiChannelUpdate ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiChannelPermissionUpdate)} Anti Channel Permission Update`, value: settings.antiChannelPermissionUpdate ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiChannelReorder)} Anti Channel Reorder`, value: settings.antiChannelReorder ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiChannelNameModification)} Anti Channel Name Modification`, value: settings.antiChannelNameModification ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiBan)} Anti Ban`, value: settings.antiBan ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiKick)} Anti Kick`, value: settings.antiKick ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiWebhook)} Anti Webhook`, value: settings.antiWebhook ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiBot)} Anti Bot`, value: settings.antiBot ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiServer)} Anti Server`, value: settings.antiServer ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiEmojiDelete)} Anti Emoji Delete`, value: settings.antiEmojiDelete ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiEmojiCreate)} Anti Emoji Create`, value: settings.antiEmojiCreate ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiEmojiUpdate)} Anti Emoji Update`, value: settings.antiEmojiUpdate ? 'Enabled' : 'Disabled', inline: true },
                { name: `${statusEmoji(settings.antiMemberRoleUpdate)} Anti Member Role Update`, value: settings.antiMemberRoleUpdate ? 'Enabled' : 'Disabled', inline: true },
                { name: '⚙️ Configuration', value: `Max Violations: ${settings.maxViolations}\nPunishment: ${settings.punishmentType.toUpperCase()}`, inline: false }
            )
            .setFooter({ text: 'Anti-Nuke Security System' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // Handle commands
    async handleCommand(message, command, args) {
        if (command === 'security') {
            const action = args[0]?.toLowerCase();
            
            if (action === 'enable' && args[1]?.toLowerCase() === 'all') {
                await this.enableAllSecurity(message);
            } else if (action === 'disable' && args[1]?.toLowerCase() === 'all') {
                await this.disableAllSecurity(message);
            } else if (action === 'status') {
                await this.showSecurityStatus(message);
            } else {
                await message.reply('❌ Usage: `security enable all` | `security disable all` | `security status`');
            }
        }
    }
}

module.exports = SecurityManager;
