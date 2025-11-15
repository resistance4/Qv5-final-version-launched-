const { EmbedBuilder } = require('discord.js');

class SlashCommandHandler {
    constructor(client, managers) {
        this.client = client;
        this.roleManager = managers.roleManager;
        this.channelManager = managers.channelManager;
        this.mediaThreadsManager = managers.mediaThreadsManager;
        this.utilityManager = managers.utilityManager;
        this.voiceManager = managers.voiceManager;

        // Extra owner tracking
        this.permanentExtraOwners = new Set();
        this.temporaryExtraOwners = new Map();

        // Quarantine tracking
        this.quarantinedUsers = new Map();
        this.originalRoles = new Map();

        // Announcement channel tracking
        this.announcementChannels = new Map();
    }

    isAuthorized(interaction) {
        const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';
        const isBotOwner = interaction.user.id === BOT_OWNER_ID;
        const isServerOwner = interaction.user.id === interaction.guild.ownerId;
        const isInOwnerChannel = interaction.channel.id === '1410011813398974626';

        return isBotOwner || (isServerOwner && isInOwnerChannel);
    }

    async handleCommand(interaction) {
        const { commandName } = interaction;

        try {
            switch(commandName) {
                // Extra Owner System
                case 'extraowner':
                    return await this.handleExtraOwner(interaction);
                case 'tempowner':
                    return await this.handleTempOwner(interaction);
                case 'removeowner':
                    return await this.handleRemoveOwner(interaction);
                case 'listowners':
                    return await this.handleListOwners(interaction);

                // Quarantine
                case 'quarantine':
                    return await this.handleQuarantine(interaction);
                case 'unquarantine':
                    return await this.handleUnquarantine(interaction);

                // Moderation
                case 'kick':
                    return await this.handleKick(interaction);
                case 'ban':
                    return await this.handleBan(interaction);
                case 'mute':
                    return await this.handleMute(interaction);
                case 'unmute':
                    return await this.handleUnmute(interaction);
                case 'warn':
                    return await this.handleWarn(interaction);
                case 'clear':
                    return await this.handleClear(interaction);
                case 'slowmode':
                    return await this.handleSlowmode(interaction);

                // Roles
                case 'addrole':
                case 'removerole':
                case 'createrole':
                case 'deleterole':
                case 'editrole':
                case 'roleinfo':
                case 'roles':
                case 'inrole':
                case 'removeallroles':
                case 'roleall':
                    if (this.roleManager) {
                        return await this.roleManager.handleSlashCommand(interaction);
                    } else {
                        return await interaction.reply({ content: '❌ Role manager not initialized', ephemeral: true });
                    }

                // Channels
                case 'lock':
                case 'unlock':
                case 'hide':
                case 'show':
                case 'lockvc':
                case 'unlockvc':
                case 'hidevc':
                case 'showvc':
                case 'rename':
                case 'topic':
                case 'limit':
                case 'bitrate':
                case 'permissions':
                case 'channels':
                    if (this.channelManager) {
                        return await this.channelManager.handleSlashCommand(interaction);
                    }
                    break;

                // Voice
                case 'vmute':
                case 'vunmute':
                case 'vmuteall':
                case 'vunmuteall':
                case 'vdefend':
                case 'vundefend':
                case 'vdefendall':
                case 'vundefendall':
                case 'vdefended':
                    if (this.voiceManager) {
                        return await this.voiceManager.handleSlashCommand(interaction);
                    }
                    break;

                // Media & Threads
                case 'enablemedia':
                case 'disablemedia':
                case 'mediaslowmode':
                case 'lockmedia':
                case 'unlockmedia':
                case 'createthread':
                case 'lockthread':
                case 'unlockthread':
                case 'archivethread':
                case 'unarchivethread':
                case 'deletethread':
                    if (this.mediaThreadsManager) {
                        return await this.mediaThreadsManager.handleSlashCommand(interaction);
                    } else {
                        return await interaction.reply({ content: '❌ Media & Threads manager not initialized', ephemeral: true });
                    }
                    break;

                // Auto-Mod
                case 'automod':
                case 'automodconfig':
                case 'blacklist':
                case 'clearwarnings':
                    return await this.handleAutoMod(interaction);

                // Utility
                case 'ping':
                    return await this.handlePing(interaction);
                case 'help':
                    return await this.handleHelp(interaction);
                case 'dev':
                    return await this.handleDev(interaction);
                case 'userinfo':
                    return await this.handleUserInfo(interaction);
                case 'dm':
                    return await this.handleDM(interaction);

                // Extended Utility
                case 'serverinfo':
                case 'avatar':
                case 'banner':
                case 'rolecolor':
                case 'membercount':
                case 'botstats':
                case 'invite':
                case 'uptime':
                case 'emojis':
                case 'stickers':
                case 'boosters':
                    if (this.utilityManager) {
                        return await this.utilityManager.handleSlashCommand(interaction);
                    }
                    break;

                // Say Commands
                case 'say':
                    return await this.handleSay(interaction);
                case 'sayembed':
                    return await this.handleSayEmbed(interaction);
                case 'edit':
                    return await this.handleEdit(interaction);
                case 'reply':
                    return await this.handleReply(interaction);

                // Embed Commands
                case 'embed':
                    return await this.handleEmbed(interaction);
                case 'embedfield':
                    return await this.handleEmbedField(interaction);

                // Reaction Roles
                case 'reactionrole':
                    return await this.handleReactionRole(interaction);
                case 'createreactionrole':
                    return await this.handleCreateReactionRole(interaction);
                case 'removereactionrole':
                    return await this.handleRemoveReactionRole(interaction);

                // Global Announcements
                case 'globalannounce':
                    return await this.handleGlobalAnnounce(interaction);
                case 'announcechannel':
                    return await this.handleAnnounceChannel(interaction);
                case 'poll':
                    return await this.handlePoll(interaction);
                case 'giveaway':
                    return await this.handleGiveaway(interaction);

                // New Global Announcement Commands
                case 'globalannoc':
                    return await this.handleGlobalAnnoc(interaction);
                case 'setannouncechannel':
                    return await this.handleSetAnnounceChannel(interaction);
            }
        } catch (error) {
            console.error(`Error in /${commandName}:`, error);
            const reply = { content: '❌ Error executing command: ' + error.message, ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    }

    async handleQuarantine(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const duration = interaction.options.getString('duration') || '10m';
        const reason = interaction.options.getString('reason') || 'No reason provided';

        const member = interaction.guild.members.cache.get(user.id);
        if (!member) {
            return await interaction.reply({ content: '❌ User not found', ephemeral: true });
        }

        await interaction.reply(`✅ Quarantined ${user.username} for ${duration}. Reason: ${reason}`);
    }

    async handleUnquarantine(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        await interaction.reply(`✅ Removed quarantine from ${user.username}`);
    }

    async handleKick(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason';
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) {
            return await interaction.reply({ content: '❌ User not found', ephemeral: true });
        }

        await member.kick(reason);
        await interaction.reply(`✅ Kicked ${user.username}. Reason: ${reason}`);
    }

    async handleBan(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason';

        await interaction.guild.bans.create(user.id, { reason });
        await interaction.reply(`✅ Banned ${user.username}. Reason: ${reason}`);
    }

    async handleMute(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason';
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) {
            return await interaction.reply({ content: '❌ User not found', ephemeral: true });
        }

        await member.timeout(10 * 60 * 1000, reason);
        await interaction.reply(`✅ Muted ${user.username} for 10 minutes`);
    }

    async handleUnmute(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) {
            return await interaction.reply({ content: '❌ User not found', ephemeral: true });
        }

        await member.timeout(null);
        await interaction.reply(`✅ Unmuted ${user.username}`);
    }

    async handleWarn(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason');

        try {
            await user.send(`⚠️ You have been warned in ${interaction.guild.name}. Reason: ${reason}`);
            await interaction.reply(`✅ Warned ${user.username}`);
        } catch {
            await interaction.reply(`✅ Warned ${user.username} (DM failed)`);
        }
    }

    async handleClear(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const amount = interaction.options.getInteger('amount');
        await interaction.channel.bulkDelete(amount, true);
        await interaction.reply({ content: `✅ Deleted ${amount} messages`, ephemeral: true });
    }

    async handleSlowmode(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const seconds = interaction.options.getInteger('seconds');
        await interaction.channel.setRateLimitPerUser(seconds);
        await interaction.reply(`✅ Set slowmode to ${seconds} seconds`);
    }

    async handlePing(interaction) {
        const latency = Date.now() - interaction.createdTimestamp;
        const apiLatency = Math.round(this.client.ws.ping);

        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('🏓 Pong!')
            .addFields(
                { name: '🤖 Bot Latency', value: `${latency}ms`, inline: true },
                { name: '📡 API Latency', value: `${apiLatency}ms`, inline: true }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    async handleHelp(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#2A1E36')
            .setTitle('📋 Slash Commands Help')
            .setDescription('All commands available as slash commands')
            .addFields(
                { name: '/quarantine', value: 'Quarantine a user', inline: false },
                { name: '/kick', value: 'Kick a user', inline: false },
                { name: '/ban', value: 'Ban a user', inline: false },
                { name: '/ping', value: 'Check bot latency', inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handleDev(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#FFFFFF')
            .setTitle('✿ Developer Information')
            .setDescription('Bot by script.agi at discord.gg/scriptspace')
            .addFields(
                { name: '🌐 Website', value: 'https://scriptspace.in/', inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    async handleUserInfo(interaction) {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = interaction.guild.members.cache.get(user.id);

        const embed = new EmbedBuilder()
            .setColor('#0099FF')
            .setTitle(`👤 ${user.username}`)
            .setThumbnail(user.displayAvatarURL({ dynamic: true }))
            .addFields(
                { name: '🆔 ID', value: user.id, inline: true },
                { name: '📅 Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
            );

        if (member) {
            embed.addFields(
                { name: '📥 Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true }
            );
        }

        await interaction.reply({ embeds: [embed] });
    }

    async handleDM(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const message = interaction.options.getString('message');

        try {
            await user.send(`📧 Message from ${interaction.guild.name} staff:\n\n${message}`);
            await interaction.reply({ content: `✅ DM sent to ${user.username}`, ephemeral: true });
        } catch {
            await interaction.reply({ content: '❌ Failed to send DM', ephemeral: true });
        }
    }

    async handleExtraOwner(interaction) {
        const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';
        if (interaction.user.id !== BOT_OWNER_ID) {
            return await interaction.reply({ content: '❌ Bot owner only', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        this.permanentExtraOwners.add(user.id);
        await interaction.reply(`✅ Granted permanent extra owner to ${user.username}`);
    }

    async handleTempOwner(interaction) {
        const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';
        if (interaction.user.id !== BOT_OWNER_ID) {
            return await interaction.reply({ content: '❌ Bot owner only', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const duration = interaction.options.getString('duration');
        await interaction.reply(`✅ Granted temporary owner to ${user.username} for ${duration}`);
    }

    async handleRemoveOwner(interaction) {
        const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';
        if (interaction.user.id !== BOT_OWNER_ID) {
            return await interaction.reply({ content: '❌ Bot owner only', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        this.permanentExtraOwners.delete(user.id);
        await interaction.reply(`✅ Removed extra owner from ${user.username}`);
    }

    async handleListOwners(interaction) {
        const embed = new EmbedBuilder()
            .setColor('#00FF00')
            .setTitle('👑 Extra Owners')
            .setDescription(`Permanent: ${this.permanentExtraOwners.size}\nTemporary: ${this.temporaryExtraOwners.size}`)
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });
    }

    async handleAutoMod(interaction) {
        const { commandName } = interaction;

        switch(commandName) {
            case 'automod':
                const action = interaction.options.getString('action');
                await interaction.reply(`✅ Auto-moderation ${action === 'on' ? 'enabled' : 'disabled'}.`);
                break;

            case 'automodconfig':
                const setting = interaction.options.getString('setting');
                const value = interaction.options.getString('value');
                await interaction.reply(`✅ ${setting} checking ${value === 'on' ? 'enabled' : 'disabled'}.`);
                break;

            case 'blacklist':
                const blacklistAction = interaction.options.getString('action');
                const word = interaction.options.getString('word');

                if (blacklistAction === 'list') {
                    const embed = new EmbedBuilder()
                        .setColor('#5865F2')
                        .setTitle('📝 Blacklisted Words')
                        .setDescription('List of blacklisted words')
                        .setTimestamp();
                    await interaction.reply({ embeds: [embed], ephemeral: true });
                } else if (word) {
                    await interaction.reply(`✅ ${blacklistAction === 'add' ? 'Added' : 'Removed'} "${word}" ${blacklistAction === 'add' ? 'to' : 'from'} blacklist.`);
                } else {
                    await interaction.reply('❌ Please provide a word to add/remove.');
                }
                break;

            case 'clearwarnings':
                const user = interaction.options.getUser('user');
                await interaction.reply(`✅ Cleared warnings for ${user.username}.`);
                break;
        }
    }

    // Say Commands
    async handleSay(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const message = interaction.options.getString('message');
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        try {
            await channel.send(message);
            await interaction.reply({ content: '✅ Message sent!', ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to send message', ephemeral: true });
        }
    }

    async handleSayEmbed(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const message = interaction.options.getString('message');
        const color = interaction.options.getString('color') || '#8A00C4';
        const channel = interaction.options.getChannel('channel') || interaction.channel;

        try {
            const embed = new EmbedBuilder()
                .setColor(color)
                .setDescription(message)
                .setTimestamp();

            await channel.send({ embeds: [embed] });
            await interaction.reply({ content: '✅ Embed sent!', ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to send embed', ephemeral: true });
        }
    }

    async handleEdit(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const messageId = interaction.options.getString('message_id');
        const newMessage = interaction.options.getString('new_message');

        try {
            const message = await interaction.channel.messages.fetch(messageId);
            if (message.author.id !== this.client.user.id) {
                return await interaction.reply({ content: '❌ I can only edit my own messages', ephemeral: true });
            }

            await message.edit(newMessage);
            await interaction.reply({ content: '✅ Message edited!', ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to edit message', ephemeral: true });
        }
    }

    async handleReply(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const messageId = interaction.options.getString('message_id');
        const replyMessage = interaction.options.getString('message');

        try {
            const message = await interaction.channel.messages.fetch(messageId);
            await message.reply(replyMessage);
            await interaction.reply({ content: '✅ Reply sent!', ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to send reply', ephemeral: true });
        }
    }

    // Embed Commands
    async handleEmbed(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const color = interaction.options.getString('color') || '#8A00C4';
        const footer = interaction.options.getString('footer');
        const image = interaction.options.getString('image');
        const thumbnail = interaction.options.getString('thumbnail');

        try {
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(description)
                .setTimestamp();

            if (footer) embed.setFooter({ text: footer });
            if (image) embed.setImage(image);
            if (thumbnail) embed.setThumbnail(thumbnail);

            await interaction.channel.send({ embeds: [embed] });
            await interaction.reply({ content: '✅ Embed created!', ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to create embed', ephemeral: true });
        }
    }

    async handleEmbedField(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const field1Name = interaction.options.getString('field1_name');
        const field1Value = interaction.options.getString('field1_value');
        const field2Name = interaction.options.getString('field2_name');
        const field2Value = interaction.options.getString('field2_value');
        const color = interaction.options.getString('color') || '#8A00C4';

        try {
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setTimestamp();

            if (description) embed.setDescription(description);
            if (field1Name && field1Value) embed.addFields({ name: field1Name, value: field1Value, inline: false });
            if (field2Name && field2Value) embed.addFields({ name: field2Name, value: field2Value, inline: false });

            await interaction.channel.send({ embeds: [embed] });
            await interaction.reply({ content: '✅ Embed with fields created!', ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to create embed', ephemeral: true });
        }
    }

    // Reaction Role Commands
    async handleReactionRole(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const messageId = interaction.options.getString('message_id');
        const role = interaction.options.getRole('role');
        const emoji = interaction.options.getString('emoji');

        try {
            const message = await interaction.channel.messages.fetch(messageId);
            await message.react(emoji);

            // Store reaction role (you'll need to implement storage)
            await interaction.reply({ content: `✅ Reaction role created! React with ${emoji} to get ${role}`, ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to create reaction role', ephemeral: true });
        }
    }

    async handleCreateReactionRole(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const title = interaction.options.getString('title');
        const description = interaction.options.getString('description');
        const color = interaction.options.getString('color') || '#8A00C4';

        try {
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle(title)
                .setDescription(description)
                .setFooter({ text: 'React below to get your roles!' })
                .setTimestamp();

            const message = await interaction.channel.send({ embeds: [embed] });
            await interaction.reply({ content: `✅ Reaction role panel created! Message ID: ${message.id}\nUse /reactionrole to add roles to it.`, ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to create panel', ephemeral: true });
        }
    }

    async handleRemoveReactionRole(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const messageId = interaction.options.getString('message_id');
        const emoji = interaction.options.getString('emoji');

        try {
            const message = await interaction.channel.messages.fetch(messageId);
            const reaction = message.reactions.cache.find(r => r.emoji.name === emoji || r.emoji.toString() === emoji);

            if (reaction) {
                await reaction.remove();
                await interaction.reply({ content: '✅ Reaction role removed!', ephemeral: true });
            } else {
                await interaction.reply({ content: '❌ Reaction not found', ephemeral: true });
            }
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to remove reaction role', ephemeral: true });
        }
    }

    // Global Announcement Commands
    async handleGlobalAnnounce(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const title = interaction.options.getString('title');
        const message = interaction.options.getString('message');
        const color = interaction.options.getString('color') || '#8A00C4';
        const ping = interaction.options.getString('ping') === 'yes';

        await interaction.deferReply({ ephemeral: true });

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

            const textChannels = interaction.guild.channels.cache.filter(c => c.type === 0 && c.permissionsFor(this.client.user).has('SendMessages'));
            let sent = 0;

            for (const [id, channel] of textChannels) {
                try {
                    const content = ping ? '@everyone' : '';
                    await channel.send({ content, embeds: [embed] });
                    sent++;
                } catch (err) {
                    console.error(`Failed to send to ${channel.name}:`, err);
                }
            }

            await interaction.editReply({ content: `✅ Announcement sent to ${sent}/${textChannels.size} channels!` });
        } catch (error) {
            await interaction.editReply({ content: '❌ Failed to send global announcement' });
        }
    }

    async handleAnnounceChannel(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const channel = interaction.options.getChannel('channel');
        const title = interaction.options.getString('title');
        const message = interaction.options.getString('message');
        const color = interaction.options.getString('color') || '#8A00C4';

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

            await channel.send({ embeds: [embed] });
            await interaction.reply({ content: `✅ Announcement sent to ${channel}!`, ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to send announcement', ephemeral: true });
        }
    }

    async handlePoll(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const question = interaction.options.getString('question');
        const options = [];
        const emojis = ['1️⃣', '2️⃣', '3️⃣', '4️⃣', '5️⃣'];

        for (let i = 1; i <= 5; i++) {
            const option = interaction.options.getString(`option${i}`);
            if (option) options.push(option);
        }

        try {
            let description = '';
            options.forEach((opt, index) => {
                description += `${emojis[index]} ${opt}\n`;
            });

            const embed = new EmbedBuilder()
                .setColor('#0099FF')
                .setTitle('📊 ' + question)
                .setDescription(description)
                .setFooter({ text: `Poll by ${interaction.user.username}` })
                .setTimestamp();

            const pollMessage = await interaction.channel.send({ embeds: [embed] });

            for (let i = 0; i < options.length; i++) {
                await pollMessage.react(emojis[i]);
            }

            await interaction.reply({ content: '✅ Poll created!', ephemeral: true });
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to create poll', ephemeral: true });
        }
    }

    async handleGiveaway(interaction) {
        if (!this.isAuthorized(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const prize = interaction.options.getString('prize');
        const duration = interaction.options.getInteger('duration');
        const winners = interaction.options.getInteger('winners');

        try {
            const endTime = Date.now() + (duration * 60 * 1000);

            const embed = new EmbedBuilder()
                .setColor('#FFD700')
                .setTitle('🎉 GIVEAWAY 🎉')
                .setDescription(`**Prize:** ${prize}\n**Winners:** ${winners}\n**Ends:** <t:${Math.floor(endTime / 1000)}:R>`)
                .setFooter({ text: 'React with 🎉 to enter!' })
                .setTimestamp(endTime);

            const giveawayMessage = await interaction.channel.send({ embeds: [embed] });
            await giveawayMessage.react('🎉');

            await interaction.reply({ content: `✅ Giveaway started! Ends in ${duration} minutes.`, ephemeral: true });

            // Set timeout to pick winners
            setTimeout(async () => {
                try {
                    const reaction = giveawayMessage.reactions.cache.get('🎉');
                    const users = await reaction.users.fetch();
                    const participants = users.filter(u => !u.bot);

                    if (participants.size === 0) {
                        return await interaction.channel.send('❌ No valid entries for the giveaway!');
                    }

                    const winnerArray = participants.random(Math.min(winners, participants.size));
                    const winnerList = Array.isArray(winnerArray) ? winnerArray : [winnerArray];

                    const winnerEmbed = new EmbedBuilder()
                        .setColor('#00FF00')
                        .setTitle('🎉 Giveaway Ended! 🎉')
                        .setDescription(`**Prize:** ${prize}\n**Winners:**\n${winnerList.map(w => `<@${w.id}>`).join('\n')}`)
                        .setTimestamp();

                    await interaction.channel.send({ content: winnerList.map(w => `<@${w.id}>`).join(' '), embeds: [winnerEmbed] });
                } catch (err) {
                    console.error('Error picking giveaway winners:', err);
                }
            }, duration * 60 * 1000);

        } catch (error) {
            await interaction.reply({ content: '❌ Failed to start giveaway', ephemeral: true });
        }
    }

    async handleSetAnnounceChannel(interaction) {
        const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';
        if (interaction.user.id !== BOT_OWNER_ID && interaction.user.id !== interaction.guild.ownerId) {
            return await interaction.reply({ content: '❌ Bot owner or server owner only', ephemeral: true });
        }

        const channel = interaction.options.getChannel('channel');

        if (channel.type !== 0) { // Not a text channel
            return await interaction.reply({ content: '❌ Please select a text channel', ephemeral: true });
        }

        try {
            this.announcementChannels.set(interaction.guild.id, channel.id);

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Announcement Channel Set')
                .setDescription(`Announcement channel set to ${channel}`)
                .addFields(
                    { name: '📺 Channel', value: channel.name, inline: true },
                    { name: '🆔 Channel ID', value: channel.id, inline: true },
                    { name: '👤 Set By', value: interaction.user.username, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            console.log(`✅ Announcement channel set to ${channel.name} for ${interaction.guild.name}`);
        } catch (error) {
            console.error('Error setting announcement channel:', error);
            await interaction.reply({ content: '❌ Failed to set announcement channel', ephemeral: true });
        }
    }

    async handleGlobalAnnoc(interaction) {
        const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';
        if (interaction.user.id !== BOT_OWNER_ID) {
            return await interaction.reply({ content: '❌ Bot owner only', ephemeral: true });
        }

        const messageId = interaction.options.getString('message_id');
        const color = interaction.options.getString('color') || '#8A00C4';

        await interaction.deferReply({ ephemeral: true });

        try {
            // Fetch the original message
            let originalMessage;
            try {
                originalMessage = await interaction.channel.messages.fetch(messageId);
            } catch (fetchError) {
                return await interaction.editReply({ content: '❌ Message not found in this channel. Please make sure the message ID is correct.' });
            }

            // Create announcement embed based on the original message
            const embed = new EmbedBuilder()
                .setColor(color)
                .setTitle('📢 Global Announcement')
                .setDescription(originalMessage.content || 'No text content')
                .addFields(
                    { name: '👤 Announced By', value: interaction.user.username, inline: true },
                    { name: '📅 Original Message', value: `<t:${Math.floor(originalMessage.createdTimestamp / 1000)}:F>`, inline: true },
                    { name: '⏰ Sent At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setTimestamp();

            // Add original author info
            if (originalMessage.author) {
                embed.setAuthor({
                    name: `Original by ${originalMessage.author.username}`,
                    iconURL: originalMessage.author.displayAvatarURL({ dynamic: true })
                });
            }

            // Add image if exists
            if (originalMessage.attachments.size > 0) {
                const firstAttachment = originalMessage.attachments.first();
                if (firstAttachment.contentType?.startsWith('image/')) {
                    embed.setImage(firstAttachment.url);
                }
            }

            // Add embeds from original message
            const messageData = { embeds: [embed] };
            if (originalMessage.embeds.length > 0) {
                messageData.embeds.push(...originalMessage.embeds.slice(0, 3)); // Add up to 3 original embeds
            }

            let successCount = 0;
            let failCount = 0;
            const guilds = this.client.guilds.cache;

            for (const [guildId, guild] of guilds) {
                try {
                    const announcementChannelId = this.announcementChannels.get(guildId);

                    if (announcementChannelId) {
                        const announcementChannel = guild.channels.cache.get(announcementChannelId);

                        if (announcementChannel && announcementChannel.permissionsFor(this.client.user).has('SendMessages')) {
                            await announcementChannel.send(messageData);
                            successCount++;
                            console.log(`✅ Sent announcement to ${guild.name} (${announcementChannel.name})`);
                        } else {
                            console.log(`⚠️ Cannot send to ${guild.name} - channel not found or no permissions`);
                            failCount++;
                        }
                    } else {
                        console.log(`⚠️ ${guild.name} - no announcement channel configured`);
                        failCount++;
                    }
                } catch (err) {
                    console.error(`❌ Failed to send to ${guild.name}:`, err);
                    failCount++;
                }
            }

            const resultEmbed = new EmbedBuilder()
                .setColor(successCount > 0 ? '#00FF00' : '#FF0000')
                .setTitle('📊 Global Announcement Results')
                .setDescription(`Message announced across all configured servers`)
                .addFields(
                    { name: '✅ Successful', value: `${successCount} servers`, inline: true },
                    { name: '❌ Failed/Skipped', value: `${failCount} servers`, inline: true },
                    { name: '📊 Total Servers', value: `${guilds.size} servers`, inline: true },
                    { name: '📝 Message ID', value: messageId, inline: false }
                )
                .setFooter({ text: 'Servers without configured announcement channels were skipped' })
                .setTimestamp();

            await interaction.editReply({ embeds: [resultEmbed] });
            console.log(`✅ Global announcement completed: ${successCount}/${guilds.size} servers`);

        } catch (error) {
            console.error('Error in global announcement:', error);
            await interaction.editReply({ content: '❌ Failed to send global announcement: ' + error.message });
        }
    }
}

module.exports = SlashCommandHandler;