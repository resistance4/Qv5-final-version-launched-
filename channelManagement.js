const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

class ChannelManager {
    constructor(client, serverConfigs) {
        this.client = client;
        this.serverConfigs = serverConfigs || new Map();
    }

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

    async sendLogMessage(guild, embed) {
        try {
            const LOGS_CHANNEL_ID = '1410019894568681617';
            const logsChannel = guild.channels.cache.get(LOGS_CHANNEL_ID);
            if (logsChannel) {
                await logsChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error sending channel log:', error);
        }
    }

    async handleCommand(message, command, args) {
        // Check authorization for all commands except info commands
        const infoCommands = ['permissions', 'perms', 'channels', 'listchannels'];
        if (!infoCommands.includes(command) && !this.isAuthorized(message)) {
            await message.reply('❌ You are not authorized to use this command.');
            return true;
        }

        try {
            switch(command) {
                // Category and Channel Creation Commands
                case 'crcato':
                    return await this.createCategory(message, args);
                case 'catorename':
                    return await this.renameCategory(message, args);
                case 'crchannel':
                    return await this.createChannel(message, args);
                case 'crvc':
                    return await this.createVoiceChannel(message, args);
                case 'delchannel':
                    return await this.deleteChannel(message, args);

                // Text Channel Commands
                case 'lock':
                case 'locktext':
                case 'locktxt':
                    if (message.mentions.roles.size > 0) {
                        return await this.lockChannelForRole(message, args);
                    }
                    return await this.lockChannel(message);
                case 'unlock':
                case 'unlocktext':
                case 'open':
                case 'opentext':
                    if (message.mentions.roles.size > 0) {
                        return await this.unlockChannelForRole(message, args);
                    }
                    return await this.unlockChannel(message);
                case 'unlocktxt':
                    return await this.unlockChannelForRole(message, args);
                case 'hide':
                case 'hidechannel':
                    return await this.hideChannel(message);
                case 'hidetxt':
                    return await this.hideTextForRole(message, args);
                case 'show':
                case 'showchannel':
                case 'reveal':
                    if (message.mentions.roles.size > 0) {
                        return await this.showTextForRole(message, args);
                    }
                    return await this.showChannel(message);
                case 'showtxt':
                    return await this.showTextForRole(message, args);
                case 'slowmode':
                case 'slow':
                    return await this.setSlowmode(message, args);
                case 'rename':
                case 'renamechannel':
                    return await this.renameChannel(message, args);
                case 'topic':
                case 'settopic':
                    return await this.setTopic(message, args);

                // Voice Channel Commands
                case 'lockvc':
                case 'lockvoice':
                case 'mutevc':
                    if (message.mentions.roles.size > 0) {
                        return await this.lockVoiceForRole(message, args);
                    }
                    return await this.lockVoiceChannel(message, args);
                case 'unlockvc':
                case 'unlockvoice':
                case 'openvc':
                    if (message.mentions.roles.size > 0) {
                        return await this.unlockVoiceForRole(message, args);
                    }
                    return await this.unlockVoiceChannel(message, args);
                case 'hidevc':
                case 'hidevoice':
                    if (message.mentions.roles.size > 0) {
                        return await this.hideVoiceForRole(message, args);
                    }
                    return await this.hideVoiceChannel(message, args);
                case 'showvc':
                case 'showvoice':
                case 'revealvc':
                    if (message.mentions.roles.size > 0) {
                        return await this.showVoiceForRole(message, args);
                    }
                    return await this.showVoiceChannel(message, args);
                case 'limit':
                case 'userlimit':
                    return await this.setUserLimit(message, args);
                case 'bitrate':
                case 'setbitrate':
                    return await this.setBitrate(message, args);

                // J2C Commands
                case 'j2c':
                case 'join2create':
                case 'setupj2c':
                    return await this.setupJ2C(message, args);
                case 'removej2c':
                case 'disablej2c':
                    return await this.removeJ2C(message);

                // Bot Commands and Message Management
                case 'botcmdslock':
                    return await this.lockBotCommands(message);
                case 'botcmdsunlock':
                    return await this.unlockBotCommands(message);
                case 'dmes':
                    return await this.deleteMessage(message, args);
                case 'say':
                    return await this.sendEmbed(message, args);
                case 'disconnectall':
                    return await this.disconnectAll(message);
                case 'move':
                    return await this.moveChannel(message, args);

                // Info Commands
                case 'permissions':
                case 'perms':
                    return await this.checkPermissions(message, args);
                case 'channels':
                case 'listchannels':
                    return await this.listChannels(message);

                default:
                    return false;
            }
        } catch (error) {
            console.error(`Error in channel command ${command}:`, error);
            await message.reply(`❌ Error executing command: ${error.message}`);
            return true;
        }
    }

    // Role-based Permission Methods
    async lockChannelForRole(message, args) {
        const role = message.mentions.roles.first();
        if (!role) {
            await message.reply('❌ Please mention a role. Usage: `lock @role`');
            return true;
        }

        try {
            await message.channel.permissionOverwrites.edit(role, {
                SendMessages: false
            });

            const lockEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔒 Text Channel Locked for Role')
                .setDescription(`Channel ${message.channel} has been locked for ${role}`)
                .addFields(
                    { name: '👮 Locked By', value: message.author.username, inline: true },
                    { name: '📍 Channel', value: message.channel.name, inline: true },
                    { name: '🎭 Role', value: role.toString(), inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [lockEmbed] });
            await this.sendLogMessage(message.guild, lockEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to lock channel for role: ' + error.message);
            return true;
        }
    }

    async hideTextForRole(message, args) {
        const role = message.mentions.roles.first();
        if (!role) {
            await message.reply('❌ Please mention a role. Usage: `hidetxt @role`');
            return true;
        }

        try {
            await message.channel.permissionOverwrites.edit(role, {
                ViewChannel: false
            });

            const hideEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('👁️ Text Channel Hidden for Role')
                .setDescription(`Channel ${message.channel} has been hidden from ${role}`)
                .addFields(
                    { name: '👮 Hidden By', value: message.author.username, inline: true },
                    { name: '📍 Channel', value: message.channel.name, inline: true },
                    { name: '🎭 Role', value: role.toString(), inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [hideEmbed] });
            await this.sendLogMessage(message.guild, hideEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to hide channel for role: ' + error.message);
            return true;
        }
    }

    async lockVoiceForRole(message, args) {
        const role = message.mentions.roles.first();
        if (!role) {
            await message.reply('❌ Please mention a role. Usage: `lockvc @role`');
            return true;
        }

        const channel = message.member.voice.channel;
        if (!channel) {
            await message.reply('❌ You must be in a voice channel to use this command.');
            return true;
        }

        try {
            await channel.permissionOverwrites.edit(role, {
                Connect: false
            });

            const lockEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔒 Voice Channel Locked for Role')
                .setDescription(`Voice channel ${channel.name} has been locked for ${role}`)
                .addFields(
                    { name: '👮 Locked By', value: message.author.username, inline: true },
                    { name: '🎤 Channel', value: channel.name, inline: true },
                    { name: '🎭 Role', value: role.toString(), inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [lockEmbed] });
            await this.sendLogMessage(message.guild, lockEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to lock voice channel for role: ' + error.message);
            return true;
        }
    }

    async hideVoiceForRole(message, args) {
        const role = message.mentions.roles.first();
        if (!role) {
            await message.reply('❌ Please mention a role. Usage: `hidevc @role`');
            return true;
        }

        const channel = message.member.voice.channel;
        if (!channel) {
            await message.reply('❌ You must be in a voice channel to use this command.');
            return true;
        }

        try {
            await channel.permissionOverwrites.edit(role, {
                ViewChannel: false
            });

            const hideEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('👁️ Voice Channel Hidden for Role')
                .setDescription(`Voice channel ${channel.name} has been hidden from ${role}`)
                .addFields(
                    { name: '👮 Hidden By', value: message.author.username, inline: true },
                    { name: '🎤 Channel', value: channel.name, inline: true },
                    { name: '🎭 Role', value: role.toString(), inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [hideEmbed] });
            await this.sendLogMessage(message.guild, hideEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to hide voice channel for role: ' + error.message);
            return true;
        }
    }

    async unlockChannelForRole(message, args) {
        const role = message.mentions.roles.first();
        if (!role) {
            await message.reply('❌ Please mention a role. Usage: `unlocktxt @role`');
            return true;
        }

        try {
            await message.channel.permissionOverwrites.edit(role, {
                SendMessages: null
            });

            const unlockEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🔓 Text Channel Unlocked for Role')
                .setDescription(`Channel ${message.channel} has been unlocked for ${role}`)
                .addFields(
                    { name: '👮 Unlocked By', value: message.author.username, inline: true },
                    { name: '📍 Channel', value: message.channel.name, inline: true },
                    { name: '🎭 Role', value: role.toString(), inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [unlockEmbed] });
            await this.sendLogMessage(message.guild, unlockEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to unlock channel for role: ' + error.message);
            return true;
        }
    }

    async showTextForRole(message, args) {
        const role = message.mentions.roles.first();
        if (!role) {
            await message.reply('❌ Please mention a role. Usage: `showtxt @role`');
            return true;
        }

        try {
            await message.channel.permissionOverwrites.edit(role, {
                ViewChannel: null
            });

            const showEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('👁️ Text Channel Shown for Role')
                .setDescription(`Channel ${message.channel} is now visible to ${role}`)
                .addFields(
                    { name: '👮 Shown By', value: message.author.username, inline: true },
                    { name: '📍 Channel', value: message.channel.name, inline: true },
                    { name: '🎭 Role', value: role.toString(), inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [showEmbed] });
            await this.sendLogMessage(message.guild, showEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to show channel for role: ' + error.message);
            return true;
        }
    }

    async unlockVoiceForRole(message, args) {
        const role = message.mentions.roles.first();
        if (!role) {
            await message.reply('❌ Please mention a role. Usage: `unlockvc @role`');
            return true;
        }

        const channel = message.member.voice.channel;
        if (!channel) {
            await message.reply('❌ You must be in a voice channel to use this command.');
            return true;
        }

        try {
            await channel.permissionOverwrites.edit(role, {
                Connect: null
            });

            const unlockEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🔓 Voice Channel Unlocked for Role')
                .setDescription(`Voice channel ${channel.name} has been unlocked for ${role}`)
                .addFields(
                    { name: '👮 Unlocked By', value: message.author.username, inline: true },
                    { name: '🎤 Channel', value: channel.name, inline: true },
                    { name: '🎭 Role', value: role.toString(), inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [unlockEmbed] });
            await this.sendLogMessage(message.guild, unlockEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to unlock voice channel for role: ' + error.message);
            return true;
        }
    }

    async showVoiceForRole(message, args) {
        const role = message.mentions.roles.first();
        if (!role) {
            await message.reply('❌ Please mention a role. Usage: `showvc @role`');
            return true;
        }

        const channel = message.member.voice.channel;
        if (!channel) {
            await message.reply('❌ You must be in a voice channel to use this command.');
            return true;
        }

        try {
            await channel.permissionOverwrites.edit(role, {
                ViewChannel: null
            });

            const showEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('👁️ Voice Channel Shown for Role')
                .setDescription(`Voice channel ${channel.name} is now visible to ${role}`)
                .addFields(
                    { name: '👮 Shown By', value: message.author.username, inline: true },
                    { name: '🎤 Channel', value: channel.name, inline: true },
                    { name: '🎭 Role', value: role.toString(), inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [showEmbed] });
            await this.sendLogMessage(message.guild, showEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to show voice channel for role: ' + error.message);
            return true;
        }
    }

    // Text Channel Methods
    async lockChannel(message) {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                SendMessages: false
            });

            const lockEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔒 Channel Locked')
                .setDescription(`Channel ${message.channel} has been locked`)
                .addFields(
                    { name: '👮 Locked By', value: message.author.username, inline: true },
                    { name: '📍 Channel', value: message.channel.name, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [lockEmbed] });
            await this.sendLogMessage(message.guild, lockEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to lock channel: ' + error.message);
            return true;
        }
    }

    async unlockChannel(message) {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                SendMessages: null
            });

            const unlockEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🔓 Channel Unlocked')
                .setDescription(`Channel ${message.channel} has been unlocked`)
                .addFields(
                    { name: '👮 Unlocked By', value: message.author.username, inline: true },
                    { name: '📍 Channel', value: message.channel.name, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [unlockEmbed] });
            await this.sendLogMessage(message.guild, unlockEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to unlock channel: ' + error.message);
            return true;
        }
    }

    async hideChannel(message) {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                ViewChannel: false
            });

            const hideEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('👁️ Channel Hidden')
                .setDescription(`Channel has been hidden from @everyone`)
                .addFields(
                    { name: '👮 Hidden By', value: message.author.username, inline: true },
                    { name: '📍 Channel', value: message.channel.name, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [hideEmbed] });
            await this.sendLogMessage(message.guild, hideEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to hide channel: ' + error.message);
            return true;
        }
    }

    async showChannel(message) {
        try {
            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                ViewChannel: null
            });

            const showEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('👁️ Channel Revealed')
                .setDescription(`Channel is now visible to @everyone`)
                .addFields(
                    { name: '👮 Revealed By', value: message.author.username, inline: true },
                    { name: '📍 Channel', value: message.channel.name, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [showEmbed] });
            await this.sendLogMessage(message.guild, showEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to show channel: ' + error.message);
            return true;
        }
    }

    async setSlowmode(message, args) {
        const seconds = parseInt(args[0]);
        if (isNaN(seconds) || seconds < 0 || seconds > 21600) {
            await message.reply('❌ Please provide a valid number between 0 and 21600 seconds.');
            return true;
        }

        try {
            await message.channel.setRateLimitPerUser(seconds);

            const slowmodeEmbed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('⏰ Slowmode Updated')
                .setDescription(`Slowmode set to ${seconds} seconds`)
                .addFields(
                    { name: '👮 Set By', value: message.author.username, inline: true },
                    { name: '📍 Channel', value: message.channel.name, inline: true },
                    { name: '⏱️ Duration', value: `${seconds}s`, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [slowmodeEmbed] });
            await this.sendLogMessage(message.guild, slowmodeEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to set slowmode: ' + error.message);
            return true;
        }
    }

    async renameChannel(message, args) {
        const newName = args.join('-').toLowerCase();
        if (!newName) {
            await message.reply('❌ Please provide a new channel name.');
            return true;
        }

        try {
            const oldName = message.channel.name;
            await message.channel.setName(newName);

            const renameEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('📝 Channel Renamed')
                .setDescription(`Channel name updated`)
                .addFields(
                    { name: '👮 Renamed By', value: message.author.username, inline: true },
                    { name: '📍 Old Name', value: oldName, inline: true },
                    { name: '📍 New Name', value: newName, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [renameEmbed] });
            await this.sendLogMessage(message.guild, renameEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to rename channel: ' + error.message);
            return true;
        }
    }

    async setTopic(message, args) {
        const topic = args.join(' ');
        if (!topic) {
            await message.reply('❌ Please provide a topic.');
            return true;
        }

        try {
            await message.channel.setTopic(topic);

            const topicEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('📋 Topic Updated')
                .setDescription(`Channel topic has been set`)
                .addFields(
                    { name: '👮 Set By', value: message.author.username, inline: true },
                    { name: '📍 Channel', value: message.channel.name, inline: true },
                    { name: '📋 Topic', value: topic, inline: false }
                )
                .setTimestamp();

            await message.reply({ embeds: [topicEmbed] });
            await this.sendLogMessage(message.guild, topicEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to set topic: ' + error.message);
            return true;
        }
    }

    // Voice Channel Methods
    async lockVoiceChannel(message, args) {
        const channel = message.mentions.channels.first();
        if (!channel || channel.type !== 2) {
            await message.reply('❌ Please mention a valid voice channel.');
            return true;
        }

        try {
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                Connect: false
            });

            const lockEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔒 Voice Channel Locked')
                .setDescription(`Voice channel has been locked`)
                .addFields(
                    { name: '👮 Locked By', value: message.author.username, inline: true },
                    { name: '🎤 Channel', value: channel.name, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [lockEmbed] });
            await this.sendLogMessage(message.guild, lockEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to lock voice channel: ' + error.message);
            return true;
        }
    }

    async unlockVoiceChannel(message, args) {
        const channel = message.mentions.channels.first();
        if (!channel || channel.type !== 2) {
            await message.reply('❌ Please mention a valid voice channel.');
            return true;
        }

        try {
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                Connect: null
            });

            const unlockEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🔓 Voice Channel Unlocked')
                .setDescription(`Voice channel has been unlocked`)
                .addFields(
                    { name: '👮 Unlocked By', value: message.author.username, inline: true },
                    { name: '🎤 Channel', value: channel.name, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [unlockEmbed] });
            await this.sendLogMessage(message.guild, unlockEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to unlock voice channel: ' + error.message);
            return true;
        }
    }

    async hideVoiceChannel(message, args) {
        const channel = message.mentions.channels.first();
        if (!channel || channel.type !== 2) {
            await message.reply('❌ Please mention a valid voice channel.');
            return true;
        }

        try {
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                ViewChannel: false
            });

            const hideEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('👁️ Voice Channel Hidden')
                .setDescription(`Voice channel hidden from @everyone`)
                .addFields(
                    { name: '👮 Hidden By', value: message.author.username, inline: true },
                    { name: '🎤 Channel', value: channel.name, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [hideEmbed] });
            await this.sendLogMessage(message.guild, hideEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to hide voice channel: ' + error.message);
            return true;
        }
    }

    async showVoiceChannel(message, args) {
        const channel = message.mentions.channels.first();
        if (!channel || channel.type !== 2) {
            await message.reply('❌ Please mention a valid voice channel.');
            return true;
        }

        try {
            await channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                ViewChannel: null
            });

            const showEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('👁️ Voice Channel Revealed')
                .setDescription(`Voice channel visible to @everyone`)
                .addFields(
                    { name: '👮 Revealed By', value: message.author.username, inline: true },
                    { name: '🎤 Channel', value: channel.name, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [showEmbed] });
            await this.sendLogMessage(message.guild, showEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to show voice channel: ' + error.message);
            return true;
        }
    }

    async setUserLimit(message, args) {
        const channel = message.mentions.channels.first();
        const limit = parseInt(args[1]);

        if (!channel || channel.type !== 2) {
            await message.reply('❌ Please mention a valid voice channel.');
            return true;
        }

        if (isNaN(limit) || limit < 0 || limit > 99) {
            await message.reply('❌ Please provide a valid limit between 0 and 99.');
            return true;
        }

        try {
            await channel.setUserLimit(limit);

            const limitEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('👥 User Limit Set')
                .setDescription(`Voice channel user limit updated`)
                .addFields(
                    { name: '👮 Set By', value: message.author.username, inline: true },
                    { name: '🎤 Channel', value: channel.name, inline: true },
                    { name: '👥 Limit', value: limit === 0 ? 'Unlimited' : `${limit} users`, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [limitEmbed] });
            await this.sendLogMessage(message.guild, limitEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to set user limit: ' + error.message);
            return true;
        }
    }

    async setBitrate(message, args) {
        const channel = message.mentions.channels.first();
        const bitrate = parseInt(args[1]) * 1000;

        if (!channel || channel.type !== 2) {
            await message.reply('❌ Please mention a valid voice channel.');
            return true;
        }

        if (isNaN(bitrate) || bitrate < 8000 || bitrate > 384000) {
            await message.reply('❌ Please provide a valid bitrate between 8 and 384 kbps.');
            return true;
        }

        try {
            await channel.setBitrate(bitrate);

            const bitrateEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('🎵 Bitrate Updated')
                .setDescription(`Voice channel bitrate has been set`)
                .addFields(
                    { name: '👮 Set By', value: message.author.username, inline: true },
                    { name: '🎤 Channel', value: channel.name, inline: true },
                    { name: '🎵 Bitrate', value: `${bitrate / 1000} kbps`, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [bitrateEmbed] });
            await this.sendLogMessage(message.guild, bitrateEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to set bitrate: ' + error.message);
            return true;
        }
    }

    async setupJ2C(message, args) {
        const channel = message.mentions.channels.first();
        if (!channel || channel.type !== 2) {
            await message.reply('❌ Please mention a valid voice channel for Join-to-Create.');
            return true;
        }

        const config = this.serverConfigs.get(message.guild.id) || {};
        config.j2cChannelId = channel.id;
        this.serverConfigs.set(message.guild.id, config);

        const j2cEmbed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('✅ Join-to-Create Enabled')
            .setDescription(`Users joining this channel will get their own temporary voice channel`)
            .addFields(
                { name: '👮 Set By', value: message.author.username, inline: true },
                { name: '🎤 Trigger Channel', value: channel.name, inline: true }
            )
            .setTimestamp();

        await message.reply({ embeds: [j2cEmbed] });
        await this.sendLogMessage(message.guild, j2cEmbed);
        return true;
    }

    async removeJ2C(message) {
        const config = this.serverConfigs.get(message.guild.id) || {};
        if (!config.j2cChannelId) {
            await message.reply('❌ Join-to-Create is not enabled on this server.');
            return true;
        }

        delete config.j2cChannelId;
        this.serverConfigs.set(message.guild.id, config);

        const removeEmbed = new EmbedBuilder()
            .setColor('#FF6B6B')
            .setTitle('❌ Join-to-Create Disabled')
            .setDescription(`Join-to-Create system has been disabled`)
            .addFields(
                { name: '👮 Disabled By', value: message.author.username, inline: true }
            )
            .setTimestamp();

        await message.reply({ embeds: [removeEmbed] });
        await this.sendLogMessage(message.guild, removeEmbed);
        return true;
    }

    async checkPermissions(message, args) {
        const user = message.mentions.users.first() || message.author;
        const member = message.guild.members.cache.get(user.id);

        if (!member) {
            await message.reply('❌ User not found.');
            return true;
        }

        const permissions = message.channel.permissionsFor(member);
        const keyPerms = [];

        if (permissions.has(PermissionFlagsBits.Administrator)) keyPerms.push('Administrator');
        if (permissions.has(PermissionFlagsBits.ManageChannels)) keyPerms.push('Manage Channels');
        if (permissions.has(PermissionFlagsBits.ManageRoles)) keyPerms.push('Manage Roles');
        if (permissions.has(PermissionFlagsBits.ManageMessages)) keyPerms.push('Manage Messages');
        if (permissions.has(PermissionFlagsBits.SendMessages)) keyPerms.push('Send Messages');
        if (permissions.has(PermissionFlagsBits.ViewChannel)) keyPerms.push('View Channel');

        const permEmbed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('🔑 Channel Permissions')
            .setDescription(`Permissions for ${user.username} in ${message.channel}`)
            .addFields(
                { name: '👤 User', value: user.username, inline: true },
                { name: '📍 Channel', value: message.channel.name, inline: true },
                { name: '🔑 Key Permissions', value: keyPerms.length > 0 ? keyPerms.join(', ') : 'No special permissions', inline: false }
            )
            .setTimestamp();

        await message.reply({ embeds: [permEmbed] });
        return true;
    }

    async listChannels(message) {
        const textChannels = message.guild.channels.cache.filter(c => c.type === 0);
        const voiceChannels = message.guild.channels.cache.filter(c => c.type === 2);
        const categories = message.guild.channels.cache.filter(c => c.type === 4);

        const channelEmbed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle('📋 Server Channels')
            .setDescription(`Channel overview for ${message.guild.name}`)
            .addFields(
                { name: '💬 Text Channels', value: `${textChannels.size}`, inline: true },
                { name: '🎤 Voice Channels', value: `${voiceChannels.size}`, inline: true },
                { name: '📁 Categories', value: `${categories.size}`, inline: true }
            )
            .setTimestamp();

        await message.reply({ embeds: [channelEmbed] });
        return true;
    }

    // Handle slash commands
    async handleSlashCommand(interaction) {
        if (!this.isAuthorizedSlash(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const { commandName } = interaction;

        try {
            switch(commandName) {
                case 'lock':
                    return await this.lockChannelSlash(interaction);
                case 'unlock':
                    return await this.unlockChannelSlash(interaction);
                case 'hide':
                    return await this.hideChannelSlash(interaction);
                case 'show':
                    return await this.showChannelSlash(interaction);
                case 'lockvc':
                    return await this.lockVoiceChannelSlash(interaction);
                case 'unlockvc':
                    return await this.unlockVoiceChannelSlash(interaction);
                case 'locklinks':
                    return await this.lockLinksSlash(interaction);
                case 'unlocklinks':
                    return await this.unlockLinksSlash(interaction);
                case 'lockembeds':
                    return await this.lockEmbedsSlash(interaction);
                case 'unlockembeds':
                    return await this.unlockEmbedsSlash(interaction);
                case 'lockattachments':
                    return await this.lockAttachmentsSlash(interaction);
                case 'unlockattachments':
                    return await this.unlockAttachmentsSlash(interaction);
                case 'lockreactions':
                    return await this.lockReactionsSlash(interaction);
                case 'unlockreactions':
                    return await this.unlockReactionsSlash(interaction);
                case 'lockall':
                    return await this.lockAllChannelsSlash(interaction);
                case 'unlockall':
                    return await this.unlockAllChannelsSlash(interaction);
                case 'nuke':
                    return await this.nukeChannelSlash(interaction);
                case 'clone':
                    return await this.cloneChannelSlash(interaction);
                case 'setnsfw':
                    return await this.setNSFWSlash(interaction);
                case 'announce':
                    return await this.announceSlash(interaction);
                case 'crchannel':
                    return await this.createChannelSlash(interaction);
                case 'delchannel':
                    return await this.deleteChannelSlash(interaction);
                case 'botcmdslock':
                    return await this.lockBotCommandsSlash(interaction);
                case 'botcmdsunlock':
                    return await this.unlockBotCommandsSlash(interaction);
                case 'dmes':
                    return await this.deleteMessageSlash(interaction);
                case 'say':
                    return await this.sendEmbedSlash(interaction);
                case 'crvc':
                    return await this.createVoiceChannelSlash(interaction);
                case 'disconnectall':
                    return await this.disconnectAllSlash(interaction);
                case 'move':
                    return await this.moveChannelSlash(interaction);
                default:
                    await interaction.reply({ content: '❌ Unknown channel command', ephemeral: true });
            }
        } catch (error) {
            console.error('Error in channel slash command:', error);
            const reply = { content: '❌ Error: ' + error.message, ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    }

    isAuthorizedSlash(interaction) {
        const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';
        const OWNER_CHANNEL_ID = '1410011813398974626';
        const serverConfig = this.serverConfigs?.get?.(interaction.guild.id) || {};
        const adminChannelId = serverConfig.adminChannelId || OWNER_CHANNEL_ID;


        const isBotOwner = interaction.user.id === BOT_OWNER_ID;
        const isServerOwner = interaction.user.id === interaction.guild.ownerId;
        const hasAdminRole = interaction.member && interaction.member.roles.cache.some(role => role.permissions.has('Administrator'));
        const isInOwnerChannel = interaction.channel.id === OWNER_CHANNEL_ID;
        const isInAdminChannel = interaction.channel.id === adminChannelId;


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

    async lockChannelSlash(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                SendMessages: false
            });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔒 Channel Locked')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Locked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to lock channel', ephemeral: true });
        }
    }

    async unlockChannelSlash(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                SendMessages: null
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🔓 Channel Unlocked')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Unlocked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to unlock channel', ephemeral: true });
        }
    }

    async hideChannelSlash(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                ViewChannel: false
            });

            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('👁️ Channel Hidden')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.name, inline: true },
                    { name: '👮 Hidden By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to hide channel', ephemeral: true });
        }
    }

    async showChannelSlash(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                ViewChannel: null
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('👁️ Channel Revealed')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Revealed By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to show channel', ephemeral: true });
        }
    }

    async lockVoiceChannelSlash(interaction) {
        const channel = interaction.options.getChannel('channel');
        if (!channel || channel.type !== 2) {
            return await interaction.reply({ content: '❌ Please select a valid voice channel', ephemeral: true });
        }

        try {
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                Connect: false
            });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔒 Voice Channel Locked')
                .addFields(
                    { name: '🎤 Channel', value: channel.name, inline: true },
                    { name: '👮 Locked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to lock voice channel', ephemeral: true });
        }
    }

    async unlockVoiceChannelSlash(interaction) {
        const channel = interaction.options.getChannel('channel');
        if (!channel || channel.type !== 2) {
            return await interaction.reply({ content: '❌ Please select a valid voice channel', ephemeral: true });
        }

        try {
            await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                Connect: null
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🔓 Voice Channel Unlocked')
                .addFields(
                    { name: '🎤 Channel', value: channel.name, inline: true },
                    { name: '👮 Unlocked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to unlock voice channel', ephemeral: true });
        }
    }

    async lockLinksSlash(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                EmbedLinks: false
            });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔗 Links Locked')
                .setDescription('Users cannot send clickable links in this channel')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Locked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to lock links', ephemeral: true });
        }
    }

    async unlockLinksSlash(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                EmbedLinks: null
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🔗 Links Unlocked')
                .setDescription('Users can now send clickable links')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Unlocked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to unlock links', ephemeral: true });
        }
    }

    async lockEmbedsSlash(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                EmbedLinks: false
            });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('📎 Embeds Locked')
                .setDescription('Link previews and embeds are disabled')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Locked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to lock embeds', ephemeral: true });
        }
    }

    async unlockEmbedsSlash(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                EmbedLinks: null
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('📎 Embeds Unlocked')
                .setDescription('Link previews and embeds are enabled')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Unlocked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to unlock embeds', ephemeral: true });
        }
    }

    async lockAttachmentsSlash(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                AttachFiles: false
            });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('📁 Attachments Locked')
                .setDescription('Users cannot upload files')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Locked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to lock attachments', ephemeral: true });
        }
    }

    async unlockAttachmentsSlash(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                AttachFiles: null
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('📁 Attachments Unlocked')
                .setDescription('Users can now upload files')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Unlocked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to unlock attachments', ephemeral: true });
        }
    }

    async lockReactionsSlash(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                AddReactions: false
            });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('😶 Reactions Locked')
                .setDescription('Users cannot add reactions')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Locked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to lock reactions', ephemeral: true });
        }
    }

    async unlockReactionsSlash(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                AddReactions: null
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('😀 Reactions Unlocked')
                .setDescription('Users can now add reactions')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Unlocked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to unlock reactions', ephemeral: true });
        }
    }

    async lockAllChannelsSlash(interaction) {
        await interaction.deferReply();
        try {
            const textChannels = interaction.guild.channels.cache.filter(c => c.type === 0);
            let locked = 0;

            for (const [id, channel] of textChannels) {
                try {
                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                        SendMessages: false
                    });
                    locked++;
                } catch (err) {
                    console.error(`Failed to lock ${channel.name}:`, err);
                }
            }

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔒 Server Lockdown')
                .setDescription(`Locked ${locked}/${textChannels.size} text channels`)
                .addFields(
                    { name: '👮 Locked By', value: interaction.user.username, inline: true },
                    { name: '📊 Status', value: 'Server in lockdown', inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.editReply({ content: '❌ Failed to lock all channels', ephemeral: true });
        }
    }

    async unlockAllChannelsSlash(interaction) {
        await interaction.deferReply();
        try {
            const textChannels = interaction.guild.channels.cache.filter(c => c.type === 0);
            let unlocked = 0;

            for (const [id, channel] of textChannels) {
                try {
                    await channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                        SendMessages: null
                    });
                    unlocked++;
                } catch (err) {
                    console.error(`Failed to unlock ${channel.name}:`, err);
                }
            }

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🔓 Lockdown Ended')
                .setDescription(`Unlocked ${unlocked}/${textChannels.size} text channels`)
                .addFields(
                    { name: '👮 Unlocked By', value: interaction.user.username, inline: true },
                    { name: '📊 Status', value: 'Server unlocked', inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.editReply({ content: '❌ Failed to unlock all channels', ephemeral: true });
        }
    }

    async nukeChannelSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const oldChannel = interaction.channel;
            const position = oldChannel.position;

            const newChannel = await oldChannel.clone({
                name: oldChannel.name,
                type: oldChannel.type,
                parent: oldChannel.parent,
                position: position,
                reason: `Channel nuked by ${interaction.user.username}`
            });

            await oldChannel.delete();

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('💥 Channel Nuked')
                .setDescription('Channel has been nuked and recreated')
                .addFields(
                    { name: '👮 Nuked By', value: interaction.user.username, inline: true },
                    { name: '📍 Channel', value: newChannel.toString(), inline: true }
                )
                .setTimestamp();

            await newChannel.send({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.editReply({ content: '❌ Failed to nuke channel: ' + error.message });
        }
    }

    async cloneChannelSlash(interaction) {
        await interaction.deferReply({ ephemeral: true });
        try {
            const cloned = await interaction.channel.clone({
                reason: `Channel cloned by ${interaction.user.username}`
            });

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('📋 Channel Cloned')
                .addFields(
                    { name: '👮 Cloned By', value: interaction.user.username, inline: true },
                    { name: '📍 Original', value: interaction.channel.toString(), inline: true },
                    { name: '📍 Clone', value: cloned.toString(), inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.editReply({ content: '❌ Failed to clone channel: ' + error.message });
        }
    }

    async setNSFWSlash(interaction) {
        const enabled = interaction.options.getBoolean('enabled');
        try {
            await interaction.channel.setNSFW(enabled);

            const embed = new EmbedBuilder()
                .setColor(enabled ? '#FF0000' : '#00FF00')
                .setTitle(enabled ? '🔞 NSFW Enabled' : '✅ NSFW Disabled')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Set By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to set NSFW status', ephemeral: true });
        }
    }

    async announceSlash(interaction) {
        const title = interaction.options.getString('title');
        const message = interaction.options.getString('message');
        const color = interaction.options.getString('color') || '#0099FF';

        try {
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('📢 ' + title)
                .setDescription(message)
                .addFields(
                    { name: '👤 Announced By', value: interaction.user.username, inline: true },
                    { name: '⏰ Time', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();

            await interaction.channel.send({ embeds: [embed] });
            await interaction.reply({ content: '✅ Announcement sent!', ephemeral: true });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to send announcement', ephemeral: true });
        }
    }

    // New Commands Implementation
    async renameCategory(message, args) {
        if (args.length < 2) {
            await message.reply('❌ Usage: `catorename <category_id> <new_name>`\nExample: `catorename 1234567890 "New Category Name"`');
            return true;
        }

        const categoryId = args[0];
        const newName = args.slice(1).join(' ').replace(/^["']|["']$/g, '').trim();

        if (!newName) {
            await message.reply('❌ Please provide a new category name.');
            return true;
        }

        if (newName.length > 100) {
            await message.reply('❌ Category name must be 100 characters or less.');
            return true;
        }

        try {
            const category = message.guild.channels.cache.get(categoryId);
            
            if (!category) {
                await message.reply('❌ Category not found. Please provide a valid category ID.');
                return true;
            }

            if (category.type !== 4) {
                await message.reply('❌ The specified channel is not a category.');
                return true;
            }

            const oldName = category.name;
            await category.setName(newName, `Category renamed by ${message.author.username}`);

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('📁 Category Renamed Successfully')
                .setDescription(`Category has been renamed`)
                .addFields(
                    { name: '📂 Old Name', value: oldName, inline: true },
                    { name: '📂 New Name', value: newName, inline: true },
                    { name: '👮 Renamed By', value: message.author.username, inline: true },
                    { name: '🆔 Category ID', value: `\`${category.id}\``, inline: true }
                )
                .setFooter({ text: 'Channel Management System' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
            console.log(`✅ Category renamed: ${oldName} -> ${newName} (ID: ${category.id})`);
            return true;
        } catch (error) {
            console.error('Error renaming category:', error);
            await message.reply(`❌ Failed to rename category: ${error.message}\n\nMake sure I have **Manage Channels** permission.`);
            return true;
        }
    }

    async createCategory(message, args) {
        console.log(`Creating category with args:`, args);

        if (args.length < 1) {
            await message.reply('❌ Usage: `crcato <name> <private|public>`\nExample: `crcato MyCategory private`');
            return true;
        }

        // Check if last argument is private/public
        const lastArg = args[args.length - 1].toLowerCase();
        let visibility = 'public'; // default
        let categoryName;

        if (lastArg === 'private' || lastArg === 'public') {
            visibility = lastArg;
            categoryName = args.slice(0, -1).join(' ').trim();
        } else {
            categoryName = args.join(' ').trim();
        }

        // Remove quotes if present
        categoryName = categoryName.replace(/^["']|["']$/g, '');

        if (!categoryName) {
            await message.reply('❌ Please provide a category name.\nUsage: `crcato <name> <private|public>`');
            return true;
        }

        // Validate category name length (Discord limit is 100 characters)
        if (categoryName.length > 100) {
            await message.reply('❌ Category name must be 100 characters or less.');
            return true;
        }

        // Check if a category with this name already exists to prevent duplicates
        const existingCategory = message.guild.channels.cache.find(
            channel => channel.type === 4 && channel.name.toLowerCase() === categoryName.toLowerCase()
        );
        
        if (existingCategory) {
            await message.reply(`❌ A category with the name "${categoryName}" already exists (ID: \`${existingCategory.id}\`).`);
            return true;
        }

        console.log(`Creating category: "${categoryName}" (${visibility})`);

        try {
            const category = await message.guild.channels.create({
                name: categoryName,
                type: 4, // Category type
                permissionOverwrites: visibility === 'private' ? [
                    {
                        id: message.guild.roles.everyone.id,
                        deny: ['ViewChannel']
                    }
                ] : []
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('📁 Category Created Successfully')
                .setDescription(`Category **${category.name}** has been created`)
                .addFields(
                    { name: '📂 Name', value: category.name, inline: true },
                    { name: '🔒 Visibility', value: visibility === 'private' ? '🔒 Private' : '🌐 Public', inline: true },
                    { name: '👮 Created By', value: message.author.username, inline: true },
                    { name: '🆔 ID', value: `\`${category.id}\``, inline: true },
                    { name: '📊 Position', value: `${category.position}`, inline: true }
                )
                .setFooter({ text: 'Channel Management System' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
            console.log(`✅ Category created successfully: ${category.name} (ID: ${category.id})`);
            return true;
        } catch (error) {
            console.error('Error creating category:', error);
            await message.reply(`❌ Failed to create category: ${error.message}\n\nMake sure I have **Manage Channels** permission.`);
            return true;
        }
    }

    async createChannel(message, args) {
        console.log(`Creating text channel with args:`, args);

        if (args.length < 1) {
            await message.reply('❌ Usage: `crchannel <name> <private|public>`\nExample: `crchannel my-channel private`');
            return true;
        }

        // Check if last argument is private/public
        const lastArg = args[args.length - 1].toLowerCase();
        let visibility = 'public'; // default
        let channelName;

        if (lastArg === 'private' || lastArg === 'public') {
            visibility = lastArg;
            channelName = args.slice(0, -1).join('-').toLowerCase().trim();
        } else {
            channelName = args.join('-').toLowerCase().trim();
        }

        // Remove quotes and clean channel name
        channelName = channelName.replace(/^["']|["']$/g, '');
        // Replace spaces with hyphens for channel names
        channelName = channelName.replace(/\s+/g, '-');
        // Remove invalid characters
        channelName = channelName.replace(/[^a-z0-9-_]/g, '');

        if (!channelName) {
            await message.reply('❌ Please provide a valid channel name.\nUsage: `crchannel <name> <private|public>`');
            return true;
        }

        // Validate channel name length (Discord limit is 100 characters)
        if (channelName.length > 100) {
            await message.reply('❌ Channel name must be 100 characters or less.');
            return true;
        }

        // Check if a text channel with this name already exists to prevent duplicates
        const existingChannel = message.guild.channels.cache.find(
            channel => channel.type === 0 && channel.name === channelName
        );
        
        if (existingChannel) {
            await message.reply(`❌ A text channel with the name "${channelName}" already exists (${existingChannel}).`);
            return true;
        }

        console.log(`Creating text channel: "${channelName}" (${visibility})`);

        try {
            const channel = await message.guild.channels.create({
                name: channelName,
                type: 0, // Text channel
                permissionOverwrites: visibility === 'private' ? [
                    {
                        id: message.guild.roles.everyone.id,
                        deny: ['ViewChannel']
                    }
                ] : []
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('💬 Text Channel Created Successfully')
                .setDescription(`Channel ${channel} has been created`)
                .addFields(
                    { name: '📍 Channel', value: channel.toString(), inline: true },
                    { name: '🔒 Visibility', value: visibility === 'private' ? '🔒 Private' : '🌐 Public', inline: true },
                    { name: '👮 Created By', value: message.author.username, inline: true },
                    { name: '📝 Name', value: channel.name, inline: true },
                    { name: '🆔 ID', value: `\`${channel.id}\``, inline: true },
                    { name: '📊 Position', value: `${channel.position}`, inline: true }
                )
                .setFooter({ text: 'Channel Management System' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
            console.log(`✅ Text channel created successfully: ${channel.name} (ID: ${channel.id})`);
            return true;
        } catch (error) {
            console.error('Error creating text channel:', error);
            await message.reply(`❌ Failed to create channel: ${error.message}\n\nMake sure I have **Manage Channels** permission.`);
            return true;
        }
    }

    async deleteChannel(message, args) {
        if (args.length < 1) {
            await message.reply('❌ Usage: `delchannel <channel_id>` or `delchannel #channel`\nExample: `delchannel 1234567890` or `delchannel #general`');
            return true;
        }

        // Check for channel mention first
        let channel = message.mentions.channels.first();

        // If no mention, try to get by ID
        if (!channel) {
            const channelId = args[0].replace(/[<#>]/g, ''); // Remove channel mention characters if present
            channel = message.guild.channels.cache.get(channelId);
        }

        if (!channel) {
            await message.reply('❌ Channel not found. Please provide a valid channel ID or mention.\nUsage: `delchannel <channel_id>` or `delchannel #channel`');
            return true;
        }

        // Check if bot has permission to delete the channel
        if (!channel.deletable) {
            await message.reply('❌ I cannot delete this channel. It may be a system channel or I lack permissions.');
            return true;
        }

        const channelName = channel.name;
        const channelId = channel.id;
        const channelType = channel.type === 0 ? 'Text Channel' : channel.type === 2 ? 'Voice Channel' : channel.type === 4 ? 'Category' : 'Channel';

        try {
            await channel.delete(`Deleted by ${message.author.username}`);

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🗑️ Channel Deleted Successfully')
                .setDescription(`${channelType} has been permanently deleted`)
                .addFields(
                    { name: '📍 Name', value: channelName, inline: true },
                    { name: '📊 Type', value: channelType, inline: true },
                    { name: '🆔 ID', value: `\`${channelId}\``, inline: true },
                    { name: '👮 Deleted By', value: message.author.username, inline: true },
                    { name: '⏰ Deleted At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Channel Management System' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
            console.log(`✅ Channel deleted successfully: ${channelName} (ID: ${channelId})`);
            return true;
        } catch (error) {
            console.error('Error deleting channel:', error);
            await message.reply(`❌ Failed to delete channel: ${error.message}\n\nMake sure I have **Manage Channels** permission and the channel is deletable.`);
            return true;
        }
    }

    async lockBotCommands(message) {
        try {
            const currentPerms = message.channel.permissionOverwrites.cache.get(message.guild.roles.everyone.id);
            const alreadyLocked = currentPerms?.deny?.has('UseApplicationCommands');

            if (alreadyLocked) {
                await message.reply('ℹ️ Bot commands are already locked in this channel.');
                return true;
            }

            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                UseApplicationCommands: false
            });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🤖 Bot Commands Locked Successfully')
                .setDescription('Slash commands are now disabled for @everyone in this channel')
                .addFields(
                    { name: '📍 Channel', value: message.channel.toString(), inline: true },
                    { name: '👮 Locked By', value: message.author.username, inline: true },
                    { name: '⏰ Locked At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: '🔒 Status', value: '🔴 **SLASH COMMANDS DISABLED**', inline: false },
                    { name: '💡 Note', value: 'Users with Manage Channels permission can still use commands', inline: false }
                )
                .setFooter({ text: 'Bot Command Management System' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
            console.log(`✅ Bot commands locked in channel: ${message.channel.name}`);
            return true;
        } catch (error) {
            console.error('Error locking bot commands:', error);
            await message.reply(`❌ Failed to lock bot commands: ${error.message}\n\nMake sure I have **Manage Channels** permission.`);
            return true;
        }
    }

    async unlockBotCommands(message) {
        try {
            const currentPerms = message.channel.permissionOverwrites.cache.get(message.guild.roles.everyone.id);
            const alreadyUnlocked = !currentPerms?.deny?.has('UseApplicationCommands');

            if (alreadyUnlocked) {
                await message.reply('ℹ️ Bot commands are already unlocked in this channel.');
                return true;
            }

            await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
                UseApplicationCommands: null
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🤖 Bot Commands Unlocked Successfully')
                .setDescription('Slash commands are now enabled for @everyone in this channel')
                .addFields(
                    { name: '📍 Channel', value: message.channel.toString(), inline: true },
                    { name: '👮 Unlocked By', value: message.author.username, inline: true },
                    { name: '⏰ Unlocked At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true },
                    { name: '🔓 Status', value: '🟢 **SLASH COMMANDS ENABLED**', inline: false },
                    { name: '💡 Note', value: 'All users can now use slash commands in this channel', inline: false }
                )
                .setFooter({ text: 'Bot Command Management System' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
            console.log(`✅ Bot commands unlocked in channel: ${message.channel.name}`);
            return true;
        } catch (error) {
            console.error('Error unlocking bot commands:', error);
            await message.reply(`❌ Failed to unlock bot commands: ${error.message}\n\nMake sure I have **Manage Channels** permission.`);
            return true;
        }
    }

    async deleteMessage(message, args) {
        if (args.length < 1) {
            await message.reply('❌ Usage: `dmes <message_id>`');
            return true;
        }

        const messageId = args[0];

        try {
            const targetMessage = await message.channel.messages.fetch(messageId);
            await targetMessage.delete();

            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('🗑️ Message Deleted')
                .addFields(
                    { name: '🆔 Message ID', value: messageId, inline: true },
                    { name: '📍 Channel', value: message.channel.toString(), inline: true },
                    { name: '👮 Deleted By', value: message.author.username, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to delete message: ' + error.message);
            return true;
        }
    }

    async sendEmbed(message, args) {
        if (args.length < 2) {
            await message.reply('❌ Usage: `say <title> / <message> / [image_link] / [video_link] / [@role]`\nUse `/` to separate parts');
            return true;
        }

        const parts = args.join(' ').split('/').map(p => p.trim());

        if (parts.length < 2) {
            await message.reply('❌ Please provide at least a title and message separated by `/`');
            return true;
        }

        const title = parts[0];
        const description = parts[1];
        const imageUrl = parts[2] || null;
        const videoUrl = parts[3] || null;
        const roleText = parts[4] || null;

        try {
            const embed = new EmbedBuilder()
                .setColor('#af7cd2')
                .setTitle(title)
                .setDescription(description)
                .setFooter({ text: `Sent by ${message.author.username}` })
                .setTimestamp();

            if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
                embed.setImage(imageUrl);
            }

            const messageContent = {};
            messageContent.embeds = [embed];

            if (roleText && roleText.includes('@')) {
                const roleMention = message.mentions.roles.first();
                if (roleMention) {
                    messageContent.content = roleMention.toString();
                }
            }

            if (videoUrl && (videoUrl.startsWith('http://') || videoUrl.startsWith('https://'))) {
                messageContent.content = (messageContent.content || '') + '\n' + videoUrl;
            }

            await message.channel.send(messageContent);
            await message.delete().catch(() => {});

            const logEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('📢 Embed Sent')
                .addFields(
                    { name: '👮 Sent By', value: message.author.username, inline: true },
                    { name: '📍 Channel', value: message.channel.toString(), inline: true },
                    { name: '📋 Title', value: title, inline: false }
                )
                .setTimestamp();

            await this.sendLogMessage(message.guild, logEmbed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to send embed: ' + error.message);
            return true;
        }
    }

    async createVoiceChannel(message, args) {
        if (args.length < 1) {
            await message.reply('❌ Usage: `crvc <name> <private|public> [limit]`\nExample: `crvc MyVoice private 10`');
            return true;
        }

        // Parse arguments for name, visibility, and limit
        let visibility = 'public';
        let limit = 0;
        let channelName;

        // Check if second-to-last arg is private/public and last is a number
        const lastArg = args[args.length - 1];
        const secondLastArg = args.length > 1 ? args[args.length - 2].toLowerCase() : '';

        if ((secondLastArg === 'private' || secondLastArg === 'public') && !isNaN(parseInt(lastArg))) {
            visibility = secondLastArg;
            limit = parseInt(lastArg);
            channelName = args.slice(0, -2).join(' ').trim();
        } else if (lastArg.toLowerCase() === 'private' || lastArg.toLowerCase() === 'public') {
            visibility = lastArg.toLowerCase();
            channelName = args.slice(0, -1).join(' ').trim();
        } else if (!isNaN(parseInt(lastArg))) {
            limit = parseInt(lastArg);
            channelName = args.slice(0, -1).join(' ').trim();
        } else {
            channelName = args.join(' ').trim();
        }

        // Remove quotes if present
        channelName = channelName.replace(/^["']|["']$/g, '');

        if (!channelName) {
            await message.reply('❌ Please provide a voice channel name.\nUsage: `crvc <name> <private|public> [limit]`');
            return true;
        }

        if (limit < 0 || limit > 99) {
            await message.reply('❌ User limit must be between 0 and 99 (0 = unlimited).');
            return true;
        }

        // Validate channel name length
        if (channelName.length > 100) {
            await message.reply('❌ Voice channel name must be 100 characters or less.');
            return true;
        }

        // Check if a voice channel with this name already exists to prevent duplicates
        const existingVoiceChannel = message.guild.channels.cache.find(
            channel => channel.type === 2 && channel.name.toLowerCase() === channelName.toLowerCase()
        );
        
        if (existingVoiceChannel) {
            await message.reply(`❌ A voice channel with the name "${channelName}" already exists (ID: \`${existingVoiceChannel.id}\`).`);
            return true;
        }

        console.log(`Creating voice channel: "${channelName}" (${visibility}, limit: ${limit})`);

        try {
            const voiceChannel = await message.guild.channels.create({
                name: channelName,
                type: 2, // Voice channel
                userLimit: limit,
                permissionOverwrites: visibility === 'private' ? [
                    {
                        id: message.guild.roles.everyone.id,
                        deny: ['ViewChannel', 'Connect']
                    }
                ] : []
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎤 Voice Channel Created Successfully')
                .setDescription(`Voice channel **${voiceChannel.name}** has been created`)
                .addFields(
                    { name: '🎤 Name', value: voiceChannel.name, inline: true },
                    { name: '🔒 Visibility', value: visibility === 'private' ? '🔒 Private' : '🌐 Public', inline: true },
                    { name: '👥 User Limit', value: limit === 0 ? '♾️ Unlimited' : `${limit} users`, inline: true },
                    { name: '👮 Created By', value: message.author.username, inline: true },
                    { name: '🆔 ID', value: `\`${voiceChannel.id}\``, inline: true },
                    { name: '📊 Position', value: `${voiceChannel.position}`, inline: true }
                )
                .setFooter({ text: 'Voice Channel Management System' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
            console.log(`✅ Voice channel created successfully: ${voiceChannel.name} (ID: ${voiceChannel.id})`);
            return true;
        } catch (error) {
            console.error('Error creating voice channel:', error);
            await message.reply(`❌ Failed to create voice channel: ${error.message}\n\nMake sure I have **Manage Channels** permission.`);
            return true;
        }
    }

    async disconnectAll(message) {
        try {
            // Get all members in voice channels across the server
            const voiceMembers = message.guild.members.cache.filter(member => 
                member.voice.channel && 
                !member.user.bot && 
                member.id !== message.author.id && // Don't disconnect the executor
                member.id !== message.guild.ownerId // Don't disconnect server owner
            );

            if (voiceMembers.size === 0) {
                await message.reply('❌ No members in voice channels to disconnect (excluding you, server owner, and bots).');
                return true;
            }

            let disconnectedCount = 0;
            const failedUsers = [];
            const channelCounts = new Map();

            for (const [id, member] of voiceMembers) {
                try {
                    const channelName = member.voice.channel.name;
                    channelCounts.set(channelName, (channelCounts.get(channelName) || 0) + 1);

                    await member.voice.disconnect(`Mass disconnect by ${message.author.username}`);
                    disconnectedCount++;
                } catch (error) {
                    console.error(`Failed to disconnect ${member.user.tag}:`, error);
                    failedUsers.push(member.user.username);
                }
            }

            const channelBreakdown = Array.from(channelCounts.entries())
                .map(([channel, count]) => `🎤 ${channel}: ${count} user(s)`)
                .join('\n');

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔌 Mass Disconnect Completed')
                .setDescription(`Successfully disconnected users from all voice channels`)
                .addFields(
                    { name: '📊 Total Disconnected', value: `${disconnectedCount}/${voiceMembers.size} users`, inline: true },
                    { name: '❌ Failed', value: `${failedUsers.length}`, inline: true },
                    { name: '👮 Executed By', value: message.author.username, inline: true },
                    { name: '🛡️ Protected', value: 'Server owner, executor & bots excluded', inline: false }
                )
                .setFooter({ text: 'Voice Management System' })
                .setTimestamp();

            if (channelBreakdown) {
                embed.addFields({
                    name: '📍 Channel Breakdown',
                    value: channelBreakdown.substring(0, 1024),
                    inline: false
                });
            }

            if (failedUsers.length > 0) {
                embed.addFields({
                    name: '⚠️ Failed Users',
                    value: failedUsers.slice(0, 10).join(', ') + (failedUsers.length > 10 ? `... and ${failedUsers.length - 10} more` : ''),
                    inline: false
                });
            }

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
            console.log(`✅ Disconnected ${disconnectedCount} users from voice channels`);
            return true;
        } catch (error) {
            console.error('Error in disconnectAll:', error);
            await message.reply(`❌ Failed to disconnect members: ${error.message}\n\nMake sure I have **Move Members** permission.`);
            return true;
        }
    }

    async moveChannel(message, args) {
        if (!message.member.voice.channel) {
            await message.reply('❌ You are not in a voice channel.');
            return true;
        }
        if (args.length < 1) {
            await message.reply('❌ Usage: `move <channel_id|channel_name>`');
            return true;
        }

        const targetIdentifier = args.join(' ');
        let targetChannel = message.guild.channels.cache.find(c => c.name.toLowerCase() === targetIdentifier.toLowerCase() && c.type === 2);

        if (!targetChannel) {
            targetChannel = message.guild.channels.cache.get(targetIdentifier);
            if (!targetChannel || targetChannel.type !== 2) {
                await message.reply('❌ Please provide a valid voice channel ID or name.');
                return true;
            }
        }

        try {
            await message.member.voice.setChannel(targetChannel);

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('➡️ Moved to Voice Channel')
                .addFields(
                    { name: '🎤 Moved To', value: targetChannel.name, inline: true },
                    { name: '👮 Moved By', value: message.author.username, inline: true }
                )
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
            return true;
        } catch (error) {
            await message.reply('❌ Failed to move to voice channel: ' + error.message);
            return true;
        }
    }

    // Slash Command Implementations for New Commands
    async createChannelSlash(interaction) {
        const channelName = interaction.options.getString('name');
        const visibility = interaction.options.getString('visibility'); // 'private' or 'public'

        if (!channelName) {
            return await interaction.reply({ content: '❌ Please provide a channel name.', ephemeral: true });
        }

        try {
            const channel = await interaction.guild.channels.create({
                name: channelName,
                type: 0,
                permissionOverwrites: visibility === 'private' ? [
                    {
                        id: interaction.guild.roles.everyone.id,
                        deny: ['ViewChannel']
                    }
                ] : []
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('💬 Channel Created')
                .addFields(
                    { name: '📍 Channel', value: channel.toString(), inline: true },
                    { name: '🔒 Visibility', value: visibility === 'private' ? 'Private' : 'Public', inline: true },
                    { name: '👮 Created By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to create channel: ' + error.message, ephemeral: true });
        }
    }

    async deleteChannelSlash(interaction) {
        const channel = interaction.options.getChannel('channel');
        if (!channel) {
            return await interaction.reply({ content: '❌ Please specify a channel to delete.', ephemeral: true });
        }

        try {
            const channelName = channel.name;
            await channel.delete(`Deleted by ${interaction.user.username}`);

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🗑️ Channel Deleted')
                .addFields(
                    { name: '📍 Channel', value: channelName, inline: true },
                    { name: '🆔 ID', value: channel.id, inline: true },
                    { name: '👮 Deleted By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to delete channel: ' + error.message, ephemeral: true });
        }
    }

    async lockBotCommandsSlash(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                UseApplicationCommands: false
            });

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🤖 Bot Commands Locked')
                .setDescription('Bot commands are now disabled for @everyone in this channel')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Locked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to lock bot commands', ephemeral: true });
        }
    }

    async unlockBotCommandsSlash(interaction) {
        try {
            await interaction.channel.permissionOverwrites.edit(interaction.guild.roles.everyone, {
                UseApplicationCommands: null
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🤖 Bot Commands Unlocked')
                .setDescription('Bot commands are now enabled for @everyone in this channel')
                .addFields(
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Unlocked By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to unlock bot commands', ephemeral: true });
        }
    }

    async deleteMessageSlash(interaction) {
        const messageId = interaction.options.getString('message_id');

        try {
            const targetMessage = await interaction.channel.messages.fetch(messageId);
            await targetMessage.delete();

            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('🗑️ Message Deleted')
                .addFields(
                    { name: '🆔 Message ID', value: messageId, inline: true },
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '👮 Deleted By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to delete message: ' + error.message, ephemeral: true });
        }
    }

    async sendEmbedSlash(interaction) {
        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const imageUrl = interaction.options.getString('image_url');
        const videoUrl = interaction.options.getString('video_url');
        const roleMention = interaction.options.getRole('role');

        try {
            const embed = new EmbedBuilder()
                .setColor('#af7cd2')
                .setTitle(title)
                .setDescription(description)
                .setFooter({ text: `Sent by ${interaction.user.username}` })
                .setTimestamp();

            if (imageUrl && (imageUrl.startsWith('http://') || imageUrl.startsWith('https://'))) {
                embed.setImage(imageUrl);
            }

            const messageContent = {};
            messageContent.embeds = [embed];

            if (roleMention) {
                messageContent.content = roleMention.toString();
            }

            if (videoUrl && (videoUrl.startsWith('http://') || videoUrl.startsWith('https://'))) {
                messageContent.content = (messageContent.content || '') + '\n' + videoUrl;
            }

            await interaction.channel.send(messageContent);
            await interaction.reply({ content: '✅ Embed sent!', ephemeral: true });

            const logEmbed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('📢 Embed Sent')
                .addFields(
                    { name: '👮 Sent By', value: interaction.user.username, inline: true },
                    { name: '📍 Channel', value: interaction.channel.toString(), inline: true },
                    { name: '📋 Title', value: title, inline: false }
                )
                .setTimestamp();

            await this.sendLogMessage(interaction.guild, logEmbed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to send embed: ' + error.message, ephemeral: true });
        }
    }

    async createVoiceChannelSlash(interaction) {
        const channelName = interaction.options.getString('name');
        const limit = interaction.options.getNumber('limit') || 0;

        if (!channelName) {
            return await interaction.reply({ content: '❌ Please provide a voice channel name.', ephemeral: true });
        }

        if (limit < 0 || limit > 99) {
            return await interaction.reply({ content: '❌ Please provide a valid limit between 0 and 99.', ephemeral: true });
        }

        try {
            const voiceChannel = await interaction.guild.channels.create({
                name: channelName,
                type: 2,
                userLimit: limit
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('🎤 Voice Channel Created')
                .addFields(
                    { name: '🎤 Name', value: voiceChannel.name, inline: true },
                    { name: '👥 Limit', value: limit === 0 ? 'Unlimited' : `${limit} users`, inline: true },
                    { name: '👮 Created By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to create voice channel: ' + error.message, ephemeral: true });
        }
    }

    async disconnectAllSlash(interaction) {
        const channel = interaction.member.voice.channel;
        if (!channel) {
            return await interaction.reply({ content: '❌ You are not in a voice channel.', ephemeral: true });
        }

        const members = channel.members.filter(m => m.id !== interaction.user.id);

        if (members.size === 0) {
            return await interaction.reply({ content: '❌ No other members in the voice channel to disconnect.', ephemeral: true });
        }

        try {
            let disconnectedCount = 0;
            for (const [id, member] of members) {
                try {
                    await member.voice.setChannel(null);
                    disconnectedCount++;
                } catch (error) {
                    console.error(`Failed to disconnect ${member.user.tag}:`, error);
                }
            }

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🔌 Disconnected All')
                .setDescription(`Disconnected ${disconnectedCount} members from ${channel.name}`)
                .addFields(
                    { name: '👮 Action By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to disconnect members: ' + error.message, ephemeral: true });
        }
    }

    async moveChannelSlash(interaction) {
        const channel = interaction.member.voice.channel;
        if (!channel) {
            return await interaction.reply({ content: '❌ You are not in a voice channel.', ephemeral: true });
        }

        const targetChannel = interaction.options.getChannel('channel');
        if (!targetChannel || targetChannel.type !== 2) {
            return await interaction.reply({ content: '❌ Please specify a valid voice channel to move to.', ephemeral: true });
        }

        try {
            await interaction.member.voice.setChannel(targetChannel);

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('➡️ Moved to Voice Channel')
                .addFields(
                    { name: '🎤 Moved To', value: targetChannel.name, inline: true },
                    { name: '👮 Moved By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to move to voice channel: ' + error.message, ephemeral: true });
        }
    }
}

module.exports = ChannelManager;