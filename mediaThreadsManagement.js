
const { EmbedBuilder, PermissionFlagsBits, ChannelType } = require('discord.js');

class MediaThreadsManager {
    constructor(client, serverConfigs) {
        this.client = client;
        this.serverConfigs = serverConfigs || new Map();
        this.mediaChannels = new Map(); // channelId -> config
    }

    // Check if user is authorized
    isAuthorized(message) {
        const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';
        const OWNER_CHANNEL_ID = '1410011813398974626';
        const serverConfig = this.serverConfigs?.get?.(message.guild.id) || {};
        const adminChannelId = serverConfig.adminChannelId || OWNER_CHANNEL_ID;
        
        const isBotOwner = message.author.id === BOT_OWNER_ID;
        const isServerOwner = message.author.id === message.guild.ownerId;
        const hasAdminRole = message.member && message.member.permissions.has('Administrator');
        const isInOwnerChannel = message.channel.id === OWNER_CHANNEL_ID;
        const isInAdminChannel = message.channel.id === adminChannelId;

        // Bot owner can use commands anywhere
        if (isBotOwner) {
            return true;
        }

        // Server owner can use commands anywhere
        if (isServerOwner) {
            return true;
        }

        // Admins can use commands in owner channel or admin channel
        if (hasAdminRole && (isInOwnerChannel || isInAdminChannel)) {
            return true;
        }

        return false;
    }

    // Send log message
    async sendLogMessage(guild, embed) {
        try {
            const LOGS_CHANNEL_ID = '1410019894568681617';
            const logsChannel = guild.channels.cache.get(LOGS_CHANNEL_ID);
            
            if (logsChannel) {
                await logsChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error sending media/threads log message:', error);
        }
    }

    // Enable Media Channel
    async enableMedia(message) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const channel = message.channel;
        
        this.mediaChannels.set(channel.id, {
            enabled: true,
            slowmode: 0
        });

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('📸 Media Channel Enabled')
            .setDescription(`This channel is now media-only. Non-media messages will be deleted.`)
            .addFields(
                { name: '📺 Channel', value: `${channel}`, inline: true },
                { name: '👑 Enabled By', value: `${message.author.username}`, inline: true },
                { name: '⏰ Enabled At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setFooter({ text: 'Media Channel Management' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
        await this.sendLogMessage(message.guild, embed);
    }

    // Disable Media Channel
    async disableMedia(message) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const channel = message.channel;
        
        if (!this.mediaChannels.has(channel.id)) {
            return message.reply('❌ This channel is not configured as a media-only channel.');
        }

        this.mediaChannels.delete(channel.id);

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('📸 Media Channel Disabled')
            .setDescription(`This channel is no longer media-only.`)
            .addFields(
                { name: '📺 Channel', value: `${channel}`, inline: true },
                { name: '👑 Disabled By', value: `${message.author.username}`, inline: true },
                { name: '⏰ Disabled At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setFooter({ text: 'Media Channel Management' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
        await this.sendLogMessage(message.guild, embed);
    }

    // Set Media Slowmode
    async mediaSlowmode(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const seconds = parseInt(args[1]);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
            return message.reply('❌ Please provide a valid slowmode time (0-21600 seconds).');
        }

        const channel = message.channel;
        const config = this.mediaChannels.get(channel.id) || { enabled: false };
        config.slowmode = seconds;
        this.mediaChannels.set(channel.id, config);

        try {
            await channel.setRateLimitPerUser(seconds, `Media slowmode set by ${message.author.username}`);

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⏱️ Media Slowmode Set')
                .setDescription(`Slowmode has been set for this media channel`)
                .addFields(
                    { name: '📺 Channel', value: `${channel}`, inline: true },
                    { name: '⏱️ Slowmode', value: `${seconds} seconds`, inline: true },
                    { name: '👑 Set By', value: `${message.author.username}`, inline: true }
                )
                .setFooter({ text: 'Media Channel Management' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
        } catch (error) {
            console.error('Error setting media slowmode:', error);
            await message.reply('❌ Failed to set slowmode.');
        }
    }

    // Lock Media Channel
    async lockMedia(message) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const channel = message.channel;

        try {
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                SendMessages: false,
                AttachFiles: false
            }, { reason: `Media channel locked by ${message.author.username}` });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔒 Media Channel Locked')
                .setDescription(`This media channel has been locked`)
                .addFields(
                    { name: '📺 Channel', value: `${channel}`, inline: true },
                    { name: '👑 Locked By', value: `${message.author.username}`, inline: true },
                    { name: '⏰ Locked At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Media Channel Management' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
        } catch (error) {
            console.error('Error locking media channel:', error);
            await message.reply('❌ Failed to lock media channel.');
        }
    }

    // Unlock Media Channel
    async unlockMedia(message) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const channel = message.channel;

        try {
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                SendMessages: true,
                AttachFiles: true
            }, { reason: `Media channel unlocked by ${message.author.username}` });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🔓 Media Channel Unlocked')
                .setDescription(`This media channel has been unlocked`)
                .addFields(
                    { name: '📺 Channel', value: `${channel}`, inline: true },
                    { name: '👑 Unlocked By', value: `${message.author.username}`, inline: true },
                    { name: '⏰ Unlocked At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Media Channel Management' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
        } catch (error) {
            console.error('Error unlocking media channel:', error);
            await message.reply('❌ Failed to unlock media channel.');
        }
    }

    // Create Thread
    async createThread(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const threadName = args.slice(1).join(' ');
        if (!threadName) {
            return message.reply('❌ Please provide a name for the thread.');
        }

        try {
            const thread = await message.channel.threads.create({
                name: threadName,
                reason: `Thread created by ${message.author.username}`
            });

            const embed = new EmbedBuilder()
                .setColor('#00D4FF')
                .setTitle('🧵 Thread Created')
                .setDescription(`A new thread has been created`)
                .addFields(
                    { name: '🧵 Thread', value: `${thread}`, inline: true },
                    { name: '📺 Parent Channel', value: `${message.channel}`, inline: true },
                    { name: '👑 Created By', value: `${message.author.username}`, inline: true }
                )
                .setFooter({ text: 'Thread Management' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
        } catch (error) {
            console.error('Error creating thread:', error);
            await message.reply('❌ Failed to create thread.');
        }
    }

    // Lock Thread
    async lockThread(message) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        if (!message.channel.isThread()) {
            return message.reply('❌ This command can only be used in a thread.');
        }

        try {
            await message.channel.setLocked(true, `Thread locked by ${message.author.username}`);

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔒 Thread Locked')
                .setDescription(`This thread has been locked`)
                .addFields(
                    { name: '🧵 Thread', value: `${message.channel}`, inline: true },
                    { name: '👑 Locked By', value: `${message.author.username}`, inline: true },
                    { name: '⏰ Locked At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Thread Management' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
        } catch (error) {
            console.error('Error locking thread:', error);
            await message.reply('❌ Failed to lock thread.');
        }
    }

    // Unlock Thread
    async unlockThread(message) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        if (!message.channel.isThread()) {
            return message.reply('❌ This command can only be used in a thread.');
        }

        try {
            await message.channel.setLocked(false, `Thread unlocked by ${message.author.username}`);

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🔓 Thread Unlocked')
                .setDescription(`This thread has been unlocked`)
                .addFields(
                    { name: '🧵 Thread', value: `${message.channel}`, inline: true },
                    { name: '👑 Unlocked By', value: `${message.author.username}`, inline: true },
                    { name: '⏰ Unlocked At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Thread Management' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
        } catch (error) {
            console.error('Error unlocking thread:', error);
            await message.reply('❌ Failed to unlock thread.');
        }
    }

    // Archive Thread
    async archiveThread(message) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        if (!message.channel.isThread()) {
            return message.reply('❌ This command can only be used in a thread.');
        }

        try {
            await message.channel.setArchived(true, `Thread archived by ${message.author.username}`);

            const embed = new EmbedBuilder()
                .setColor('#808080')
                .setTitle('📦 Thread Archived')
                .setDescription(`This thread has been archived`)
                .addFields(
                    { name: '🧵 Thread', value: `${message.channel}`, inline: true },
                    { name: '👑 Archived By', value: `${message.author.username}`, inline: true },
                    { name: '⏰ Archived At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Thread Management' })
                .setTimestamp();

            await this.sendLogMessage(message.guild, embed);
        } catch (error) {
            console.error('Error archiving thread:', error);
            await message.reply('❌ Failed to archive thread.');
        }
    }

    // Unarchive Thread
    async unarchiveThread(message) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        if (!message.channel.isThread()) {
            return message.reply('❌ This command can only be used in a thread.');
        }

        try {
            await message.channel.setArchived(false, `Thread unarchived by ${message.author.username}`);

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('📂 Thread Unarchived')
                .setDescription(`This thread has been unarchived`)
                .addFields(
                    { name: '🧵 Thread', value: `${message.channel}`, inline: true },
                    { name: '👑 Unarchived By', value: `${message.author.username}`, inline: true },
                    { name: '⏰ Unarchived At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Thread Management' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
        } catch (error) {
            console.error('Error unarchiving thread:', error);
            await message.reply('❌ Failed to unarchive thread.');
        }
    }

    // Delete Thread
    async deleteThread(message) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        if (!message.channel.isThread()) {
            return message.reply('❌ This command can only be used in a thread.');
        }

        const threadName = message.channel.name;
        const threadId = message.channel.id;

        try {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🗑️ Thread Deleted')
                .setDescription(`A thread has been deleted`)
                .addFields(
                    { name: '🧵 Thread Name', value: threadName, inline: true },
                    { name: '🆔 Thread ID', value: `\`${threadId}\``, inline: true },
                    { name: '👑 Deleted By', value: `${message.author.username}`, inline: true },
                    { name: '⏰ Deleted At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Thread Management' })
                .setTimestamp();

            await this.sendLogMessage(message.guild, embed);
            await message.channel.delete(`Thread deleted by ${message.author.username}`);
        } catch (error) {
            console.error('Error deleting thread:', error);
            await message.reply('❌ Failed to delete thread.');
        }
    }

    // Handle all media and thread commands
    async handleCommand(message, command, args) {
        switch (command) {
            case 'enablemedia':
            case 'mediachannel':
                await this.enableMedia(message);
                break;
            case 'disablemedia':
                await this.disableMedia(message);
                break;
            case 'mediaslowmode':
            case 'mediaslow':
                await this.mediaSlowmode(message, args);
                break;
            case 'lockmedia':
                await this.lockMedia(message);
                break;
            case 'unlockmedia':
            case 'openmedia':
                await this.unlockMedia(message);
                break;
            case 'createthread':
            case 'newthread':
                await this.createThread(message, args);
                break;
            case 'lockthread':
                await this.lockThread(message);
                break;
            case 'unlockthread':
            case 'openthread':
                await this.unlockThread(message);
                break;
            case 'archivethread':
                await this.archiveThread(message);
                break;
            case 'unarchivethread':
                await this.unarchiveThread(message);
                break;
            case 'deletethread':
            case 'removethread':
                await this.deleteThread(message);
                break;
        }
    }

    // Check if message contains media (attachments or embeds)
    hasMedia(message) {
        return message.attachments.size > 0 || message.embeds.length > 0;
    }

    // Handle message creation in media channels
    async handleMessage(message) {
        if (message.author.bot) return;
        
        const config = this.mediaChannels.get(message.channel.id);
        if (!config || !config.enabled) return;

        // Check if message has media
        if (!this.hasMedia(message)) {
            try {
                await message.delete();
                const warning = await message.channel.send(`${message.author}, this is a media-only channel. Please only post images, videos, or other media.`);
                setTimeout(() => warning.delete().catch(() => {}), 5000);
            } catch (error) {
                console.error('Error enforcing media-only channel:', error);
            }
        }
    }

    // Handle slash commands
    async handleSlashCommand(interaction) {
        const { commandName } = interaction;

        try {
            const message = {
                channel: interaction.channel,
                author: interaction.user,
                guild: interaction.guild,
                member: interaction.member,
                reply: async (options) => interaction.reply(options)
            };

            switch(commandName) {
                case 'enablemedia':
                    return await this.enableMedia(message);
                case 'disablemedia':
                    return await this.disableMedia(message);
                case 'mediaslowmode':
                    const slowSeconds = interaction.options.getInteger('seconds');
                    const slowArgs = ['mediaslowmode', slowSeconds];
                    return await this.mediaSlowmode(message, slowArgs);
                case 'lockmedia':
                    return await this.lockMedia(message);
                case 'unlockmedia':
                    return await this.unlockMedia(message);
                case 'createthread':
                    const threadName = interaction.options.getString('name');
                    const args = ['createthread', threadName];
                    return await this.createThread(message, args);
                case 'lockthread':
                    return await this.lockThread(message);
                case 'unlockthread':
                    return await this.unlockThread(message);
                case 'archivethread':
                    return await this.archiveThread(message);
                case 'unarchivethread':
                    return await this.unarchiveThread(message);
                case 'deletethread':
                    return await this.deleteThread(message);
                default:
                    await interaction.reply({ content: '❌ Unknown media/thread command', ephemeral: true });
            }
        } catch (error) {
            console.error('Error in media/thread slash command:', error);
            const reply = { content: '❌ Error executing command: ' + error.message, ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    }
}

module.exports = MediaThreadsManager;

module.exports = MediaThreadsManager;
