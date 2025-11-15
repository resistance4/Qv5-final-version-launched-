const { 
    PermissionFlagsBits, 
    ChannelType, 
    EmbedBuilder, 
    ActionRowBuilder, 
    ButtonBuilder, 
    ButtonStyle 
} = require('discord.js');

class TicketManager {
    constructor(client) {
        this.client = client;
        // Store ticket panel configurations: guildId -> { channelId, messageId, roleId, message }
        this.ticketPanels = new Map();
        // Store active tickets: ticketChannelId -> { userId, guildId, createdAt }
        this.activeTickets = new Map();
        // Track ticket numbers per guild: guildId -> ticketNumber (for backward compatibility)
        this.ticketNumbers = new Map();
        // Track ticket numbers per user in each guild: 'guildId-userId' -> ticketNumber
        this.userTicketNumbers = new Map();
    }

    /**
     * Create a ticket panel in a specific channel
     * @param {Message} message - The original message
     * @param {string} channelId - The channel ID where the panel will be created
     * @param {string} panelMessage - The message to display in the panel (null for default)
     * @param {string} roleId - The role ID to ping when a ticket is created (optional)
     */
    async createTicketPanel(message, channelId, panelMessage, roleId = null) {
        try {
            const guild = message.guild;
            
            console.log(`[TicketManager] Creating panel in guild ${guild.id}, channel ${channelId}`);
            
            // Fetch the channel
            const channel = await guild.channels.fetch(channelId).catch(err => {
                console.error(`[TicketManager] Failed to fetch channel ${channelId}:`, err);
                return null;
            });

            if (!channel) {
                console.error(`[TicketManager] Channel ${channelId} not found`);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error: Invalid Channel')
                    .setDescription('The provided channel ID is invalid or the channel does not exist.')
                    .addFields({ name: 'Provided Channel ID', value: channelId })
                    .setTimestamp();
                return message.reply({ embeds: [errorEmbed] });
            }

            if (!channel.isTextBased()) {
                console.error(`[TicketManager] Channel ${channelId} is not a text channel`);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error: Invalid Channel Type')
                    .setDescription('The provided channel must be a text channel!')
                    .addFields({ name: 'Channel', value: `${channel}` })
                    .setTimestamp();
                return message.reply({ embeds: [errorEmbed] });
            }

            console.log(`[TicketManager] Target channel validated: ${channel.name}`);

            // Check permissions - both guild-level AND channel-specific
            const botMember = guild.members.me;
            
            // Check if bot can send messages in the target channel
            const channelPermissions = channel.permissionsFor(botMember);
            if (!channelPermissions) {
                console.error(`[TicketManager] Cannot verify permissions for channel ${channelId}`);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error: Permission Check Failed')
                    .setDescription('Unable to verify permissions in the target channel!')
                    .setTimestamp();
                return message.reply({ embeds: [errorEmbed] });
            }
            
            if (!channelPermissions.has(PermissionFlagsBits.ViewChannel)) {
                console.error(`[TicketManager] Bot cannot view channel ${channelId}`);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error: Missing Permissions')
                    .setDescription('I cannot view the target channel! Please check my permissions.')
                    .addFields({ name: 'Required Permission', value: 'View Channel' })
                    .setTimestamp();
                return message.reply({ embeds: [errorEmbed] });
            }
            
            if (!channelPermissions.has(PermissionFlagsBits.SendMessages)) {
                console.error(`[TicketManager] Bot cannot send messages in channel ${channelId}`);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error: Missing Permissions')
                    .setDescription('I cannot send messages in the target channel! Please check my permissions.')
                    .addFields({ name: 'Required Permission', value: 'Send Messages' })
                    .setTimestamp();
                return message.reply({ embeds: [errorEmbed] });
            }
            
            if (!channelPermissions.has(PermissionFlagsBits.EmbedLinks)) {
                console.error(`[TicketManager] Bot cannot embed links in channel ${channelId}`);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error: Missing Permissions')
                    .setDescription('I need the "Embed Links" permission in the target channel!')
                    .addFields({ name: 'Required Permission', value: 'Embed Links' })
                    .setTimestamp();
                return message.reply({ embeds: [errorEmbed] });
            }
            
            // Check guild-level permissions needed for creating ticket channels
            if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
                console.error(`[TicketManager] Bot lacks Manage Channels permission`);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error: Missing Permissions')
                    .setDescription('I need the "Manage Channels" permission to create ticket channels!')
                    .addFields({ name: 'Required Permission', value: 'Manage Channels' })
                    .setTimestamp();
                return message.reply({ embeds: [errorEmbed] });
            }

            if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
                console.error(`[TicketManager] Bot lacks Manage Roles permission`);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error: Missing Permissions')
                    .setDescription('I need the "Manage Roles" permission to manage ticket permissions!')
                    .addFields({ name: 'Required Permission', value: 'Manage Roles' })
                    .setTimestamp();
                return message.reply({ embeds: [errorEmbed] });
            }

            console.log(`[TicketManager] All permissions validated`);

            // Create the ticket panel embed
            const embed = new EmbedBuilder()
                .setTitle('🎫 Support Ticket System')
                .setDescription(panelMessage || 'Click the button below to open a support ticket.\n\nOur staff team will assist you shortly!')
                .setColor('#5865F2')
                .setFooter({ text: 'Click the button below to create a ticket' })
                .setTimestamp();

            // Create the button
            const button = new ButtonBuilder()
                .setCustomId('open_ticket')
                .setLabel('📩 Open Ticket')
                .setStyle(ButtonStyle.Primary);

            const row = new ActionRowBuilder().addComponents(button);

            console.log(`[TicketManager] Sending panel message to channel ${channel.name}...`);

            // Send the panel message
            let panelMsg;
            try {
                panelMsg = await channel.send({
                    embeds: [embed],
                    components: [row]
                });
                console.log(`[TicketManager] Panel message sent successfully (ID: ${panelMsg.id})`);
            } catch (sendError) {
                console.error(`[TicketManager] Failed to send panel message:`, sendError);
                const errorEmbed = new EmbedBuilder()
                    .setColor('#FF0000')
                    .setTitle('❌ Error: Failed to Send Panel')
                    .setDescription('Failed to send the ticket panel message to the target channel!')
                    .addFields(
                        { name: 'Error Code', value: sendError.code ? String(sendError.code) : 'Unknown' },
                        { name: 'Error Message', value: sendError.message || 'Unknown error' }
                    )
                    .setTimestamp();
                return message.reply({ embeds: [errorEmbed] });
            }

            // Store the panel configuration
            this.ticketPanels.set(guild.id, {
                channelId: channel.id,
                messageId: panelMsg.id,
                roleId: roleId,
                message: panelMessage
            });

            console.log(`[TicketManager] Panel configuration stored for guild ${guild.id}`);

            // Initialize ticket number for this guild if not exists
            if (!this.ticketNumbers.has(guild.id)) {
                this.ticketNumbers.set(guild.id, 0);
            }

            const confirmEmbed = new EmbedBuilder()
                .setTitle('✅ Ticket Panel Created Successfully')
                .setDescription(`The ticket panel has been successfully created in ${channel}!\n\nUsers can now click the button to open support tickets.`)
                .setColor('#00FF00')
                .addFields(
                    { name: '📍 Channel', value: `${channel}`, inline: true },
                    { name: '🆔 Message ID', value: panelMsg.id, inline: true },
                    { name: '🔔 Role to Ping', value: roleId ? `<@&${roleId}>` : 'None', inline: true }
                )
                .setFooter({ text: 'Ticket system is now active!' })
                .setTimestamp();

            console.log(`[TicketManager] Ticket panel created successfully`);
            return message.reply({ embeds: [confirmEmbed] });

        } catch (error) {
            console.error('[TicketManager] Error creating ticket panel:', error);
            console.error('[TicketManager] Error details:', {
                message: error.message,
                code: error.code,
                stack: error.stack
            });
            
            // Provide more specific error message with embed
            const errorEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Error Creating Ticket Panel')
                .setTimestamp();

            if (error.code === 50013) {
                errorEmbed.setDescription('**Missing Permissions**\nI don\'t have the required permissions to create the panel in that channel.')
                    .addFields({ name: 'Error Code', value: '50013 - Missing Permissions' });
            } else if (error.code === 50001) {
                errorEmbed.setDescription('**Missing Access**\nI don\'t have access to that channel.')
                    .addFields({ name: 'Error Code', value: '50001 - Missing Access' });
            } else if (error.code === 10003) {
                errorEmbed.setDescription('**Unknown Channel**\nThe specified channel was not found.')
                    .addFields({ name: 'Error Code', value: '10003 - Unknown Channel' });
            } else {
                errorEmbed.setDescription('An unexpected error occurred while creating the ticket panel.')
                    .addFields(
                        { name: 'Error Message', value: error.message || 'Unknown error' },
                        { name: 'Error Code', value: error.code ? String(error.code) : 'None' }
                    );
            }
            
            return message.reply({ embeds: [errorEmbed] });
        }
    }

    /**
     * Handle ticket button interaction
     * @param {ButtonInteraction} interaction - The button interaction
     */
    async handleTicketButton(interaction) {
        try {
            if (interaction.customId !== 'open_ticket') return;

            await interaction.deferReply({ ephemeral: true });

            const guild = interaction.guild;
            const member = interaction.member;
            
            // Check if bot has required permissions
            const botMember = guild.members.me;
            if (!botMember.permissions.has(PermissionFlagsBits.ManageChannels)) {
                return interaction.editReply({
                    content: '❌ I need the "Manage Channels" permission to create ticket channels!',
                    ephemeral: true
                });
            }
            
            if (!botMember.permissions.has(PermissionFlagsBits.ManageRoles)) {
                return interaction.editReply({
                    content: '❌ I need the "Manage Roles" permission to set up ticket permissions!',
                    ephemeral: true
                });
            }

            // Check if user already has an active ticket
            const existingTicket = this.findUserTicket(guild.id, member.id);
            if (existingTicket) {
                return interaction.editReply({
                    content: `❌ You already have an active ticket: <#${existingTicket}>`,
                    ephemeral: true
                });
            }

            // Get or create the Tickets category
            let ticketCategory = guild.channels.cache.find(
                c => c.name.toLowerCase() === 'tickets' && c.type === ChannelType.GuildCategory
            );

            if (!ticketCategory) {
                try {
                    ticketCategory = await guild.channels.create({
                        name: 'Tickets',
                        type: ChannelType.GuildCategory,
                        permissionOverwrites: [
                            {
                                id: guild.id, // @everyone
                                deny: [PermissionFlagsBits.ViewChannel]
                            }
                        ]
                    });
                } catch (categoryError) {
                    console.error('Error creating Tickets category:', categoryError);
                    return interaction.editReply({
                        content: '❌ Failed to create Tickets category. Please check bot permissions!',
                        ephemeral: true
                    });
                }
            }

            // Get ticket number for this specific user
            const userKey = `${guild.id}-${member.id}`;
            let userTicketNumber = this.userTicketNumbers.get(userKey) || 0;
            userTicketNumber++;
            this.userTicketNumbers.set(userKey, userTicketNumber);

            // Get clean username (alphanumeric only, lowercase)
            let cleanUsername = member.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
            if (!cleanUsername) cleanUsername = 'user'; // Fallback if username has no alphanumeric chars
            
            // Create the ticket channel with username-number format
            let ticketChannel;
            try {
                ticketChannel = await guild.channels.create({
                    name: `${cleanUsername}-${userTicketNumber}`,
                    type: ChannelType.GuildText,
                    parent: ticketCategory.id,
                    permissionOverwrites: [
                        {
                            id: guild.id, // @everyone
                            deny: [PermissionFlagsBits.ViewChannel]
                        },
                        {
                            id: member.id, // Ticket creator
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ReadMessageHistory,
                                PermissionFlagsBits.AttachFiles,
                                PermissionFlagsBits.EmbedLinks
                            ]
                        },
                        {
                            id: this.client.user.id, // Bot
                            allow: [
                                PermissionFlagsBits.ViewChannel,
                                PermissionFlagsBits.SendMessages,
                                PermissionFlagsBits.ManageChannels,
                                PermissionFlagsBits.ReadMessageHistory
                            ]
                        }
                    ]
                });
            } catch (channelError) {
                console.error('Error creating ticket channel:', channelError);
                // Rollback the ticket number since channel creation failed
                this.userTicketNumbers.set(userKey, userTicketNumber - 1);
                return interaction.editReply({
                    content: '❌ Failed to create ticket channel. Please contact a server administrator!',
                    ephemeral: true
                });
            }

            // Add permissions for server owner
            try {
                if (guild.ownerId) {
                    await ticketChannel.permissionOverwrites.create(guild.ownerId, {
                        [PermissionFlagsBits.ViewChannel]: true,
                        [PermissionFlagsBits.SendMessages]: true,
                        [PermissionFlagsBits.ReadMessageHistory]: true,
                        [PermissionFlagsBits.ManageChannels]: true
                    });
                }

                // Add permissions for all administrator roles
                const adminRoles = guild.roles.cache.filter(
                    role => role.permissions.has(PermissionFlagsBits.Administrator)
                );
                for (const [roleId, adminRole] of adminRoles) {
                    await ticketChannel.permissionOverwrites.create(roleId, {
                        [PermissionFlagsBits.ViewChannel]: true,
                        [PermissionFlagsBits.SendMessages]: true,
                        [PermissionFlagsBits.ReadMessageHistory]: true,
                        [PermissionFlagsBits.ManageChannels]: true
                    });
                }
            } catch (permError) {
                console.error('Error setting admin permissions (non-critical):', permError);
                // Continue anyway - the ticket channel was created, admin perms are optional
            }

            // Store the ticket
            this.activeTickets.set(ticketChannel.id, {
                userId: member.id,
                guildId: guild.id,
                ticketNumber: userTicketNumber,
                username: cleanUsername,
                createdAt: Date.now()
            });

            // Get panel config for role ping
            const panelConfig = this.ticketPanels.get(guild.id);
            let pingContent = `${member}`;
            
            if (panelConfig && panelConfig.roleId) {
                pingContent = `${member} | <@&${panelConfig.roleId}>`;
            }

            // Create welcome embed
            const welcomeEmbed = new EmbedBuilder()
                .setTitle(`🎫 Ticket ${cleanUsername}-${userTicketNumber}`)
                .setDescription(
                    `Welcome ${member}!\n\n` +
                    `Thank you for creating a ticket. Our staff team will be with you shortly.\n\n` +
                    `Please describe your issue in detail.`
                )
                .setColor('#5865F2')
                .addFields(
                    { name: '📌 Ticket Creator', value: `${member}`, inline: true },
                    { name: '🕐 Created At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'To close this ticket, an admin can use ticketclose or click the button below' })
                .setTimestamp();

            // Create close button
            const closeButton = new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('🔒 Close Ticket')
                .setStyle(ButtonStyle.Danger);

            const row = new ActionRowBuilder().addComponents(closeButton);

            // Send welcome message
            try {
                await ticketChannel.send({
                    content: pingContent,
                    embeds: [welcomeEmbed],
                    components: [row]
                });
            } catch (sendError) {
                console.error('Error sending welcome message to ticket:', sendError);
                // Ticket was created but welcome message failed - still notify user
                return interaction.editReply({
                    content: `✅ Your ticket has been created: ${ticketChannel}\n⚠️ (Welcome message failed to send)`,
                    ephemeral: true
                });
            }

            // Reply to the user
            return interaction.editReply({
                content: `✅ Your ticket has been created: ${ticketChannel}`,
                ephemeral: true
            });

        } catch (error) {
            console.error('Error handling ticket button:', error);
            console.error('Error stack:', error.stack);
            try {
                return interaction.editReply({
                    content: `❌ An error occurred while creating your ticket!\n\`\`\`${error.message}\`\`\``,
                    ephemeral: true
                });
            } catch (e) {
                console.error('Error sending error message:', e);
            }
        }
    }

    /**
     * Handle ticket close button interaction
     * @param {ButtonInteraction} interaction - The button interaction
     */
    async handleCloseButton(interaction) {
        try {
            if (interaction.customId !== 'close_ticket') return;

            const channel = interaction.channel;
            const member = interaction.member;

            // Check if this is a ticket channel
            if (!this.activeTickets.has(channel.id)) {
                return interaction.reply({
                    content: '❌ This is not a valid ticket channel!',
                    ephemeral: true
                });
            }

            // Check if user has permission to close tickets
            const canClose = 
                member.permissions.has(PermissionFlagsBits.ManageChannels) ||
                member.permissions.has(PermissionFlagsBits.Administrator) ||
                member.id === interaction.guild.ownerId;

            if (!canClose) {
                return interaction.reply({
                    content: '❌ You do not have permission to close this ticket!',
                    ephemeral: true
                });
            }

            await interaction.deferReply();

            // Get ticket info
            const ticketInfo = this.activeTickets.get(channel.id);

            // Create closing embed
            const closingEmbed = new EmbedBuilder()
                .setTitle('🔒 Ticket Closing')
                .setDescription('This ticket will be closed in 5 seconds...')
                .setColor('#FF0000')
                .addFields(
                    { name: 'Closed By', value: `${member}`, inline: true },
                    { name: 'Ticket Number', value: `#${ticketInfo.ticketNumber}`, inline: true }
                )
                .setTimestamp();

            await interaction.editReply({ embeds: [closingEmbed] });

            // Wait 5 seconds then delete
            setTimeout(async () => {
                try {
                    this.activeTickets.delete(channel.id);
                    await channel.delete('Ticket closed');
                } catch (error) {
                    console.error('Error deleting ticket channel:', error);
                }
            }, 5000);

        } catch (error) {
            console.error('Error handling close button:', error);
            try {
                return interaction.reply({
                    content: '❌ An error occurred while closing the ticket!',
                    ephemeral: true
                });
            } catch (e) {
                console.error('Error sending error message:', e);
            }
        }
    }

    /**
     * Close a ticket using a command
     * @param {Message} message - The message object
     * @param {string} channelId - The channel ID or mention (optional, defaults to current channel)
     */
    async closeTicket(message, channelId = null) {
        try {
            const guild = message.guild;
            const member = message.member;

            // Check permissions
            const canClose = 
                member.permissions.has(PermissionFlagsBits.ManageChannels) ||
                member.permissions.has(PermissionFlagsBits.Administrator) ||
                member.id === guild.ownerId;

            if (!canClose) {
                return message.reply('❌ You do not have permission to close tickets!');
            }

            // Determine which channel to close
            let targetChannel;
            if (channelId) {
                // Remove < > and # from channel mention
                const cleanId = channelId.replace(/[<#>]/g, '');
                targetChannel = await guild.channels.fetch(cleanId).catch(() => null);
            } else {
                targetChannel = message.channel;
            }

            if (!targetChannel) {
                return message.reply('❌ Invalid channel! Please provide a valid channel ID or mention.');
            }

            // Check if it's a ticket channel
            if (!this.activeTickets.has(targetChannel.id)) {
                return message.reply('❌ This is not a valid ticket channel!');
            }

            // Get ticket info
            const ticketInfo = this.activeTickets.get(targetChannel.id);

            // Create closing embed
            const closingEmbed = new EmbedBuilder()
                .setTitle('🔒 Ticket Closed')
                .setDescription('This ticket has been closed by a staff member.')
                .setColor('#FF0000')
                .addFields(
                    { name: 'Closed By', value: `${member}`, inline: true },
                    { name: 'Ticket Number', value: `#${ticketInfo.ticketNumber}`, inline: true }
                )
                .setTimestamp();

            // Send closing message in the ticket channel
            await targetChannel.send({ embeds: [closingEmbed] });

            // If the command was used in a different channel, confirm there
            if (message.channel.id !== targetChannel.id) {
                const confirmEmbed = new EmbedBuilder()
                    .setTitle('✅ Ticket Closed')
                    .setDescription(`Successfully closed ticket: ${targetChannel}`)
                    .setColor('#00FF00')
                    .setTimestamp();

                await message.reply({ embeds: [confirmEmbed] });
            }

            // Wait 5 seconds then delete
            setTimeout(async () => {
                try {
                    this.activeTickets.delete(targetChannel.id);
                    await targetChannel.delete('Ticket closed by command');
                } catch (error) {
                    console.error('Error deleting ticket channel:', error);
                }
            }, 5000);

        } catch (error) {
            console.error('Error closing ticket:', error);
            return message.reply('❌ An error occurred while closing the ticket!');
        }
    }

    /**
     * Find a user's active ticket in a guild
     * @param {string} guildId - The guild ID
     * @param {string} userId - The user ID
     * @returns {string|null} - The ticket channel ID or null
     */
    findUserTicket(guildId, userId) {
        for (const [channelId, ticketInfo] of this.activeTickets.entries()) {
            if (ticketInfo.guildId === guildId && ticketInfo.userId === userId) {
                return channelId;
            }
        }
        return null;
    }

    /**
     * Get all active tickets for a guild
     * @param {string} guildId - The guild ID
     * @returns {Array} - Array of ticket information
     */
    getGuildTickets(guildId) {
        const tickets = [];
        for (const [channelId, ticketInfo] of this.activeTickets.entries()) {
            if (ticketInfo.guildId === guildId) {
                tickets.push({ channelId, ...ticketInfo });
            }
        }
        return tickets;
    }

    /**
     * Clean up deleted ticket channels
     * @param {string} channelId - The deleted channel ID
     */
    handleChannelDelete(channelId) {
        if (this.activeTickets.has(channelId)) {
            this.activeTickets.delete(channelId);
            console.log(`🧹 Cleaned up deleted ticket channel: ${channelId}`);
        }
    }
}

module.exports = TicketManager;
