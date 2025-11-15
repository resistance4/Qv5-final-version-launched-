
const { EmbedBuilder, PermissionFlagsBits } = require('discord.js');

class RoleManager {
    constructor(client) {
        this.client = client;
    }

    // Check if user is authorized for slash commands
    isAuthorizedSlash(interaction) {
        const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';
        const isBotOwner = interaction.user.id === BOT_OWNER_ID;
        const isServerOwner = interaction.user.id === interaction.guild.ownerId;
        const isInOwnerChannel = interaction.channel.id === '1410011813398974626';

        return isBotOwner || (isServerOwner && isInOwnerChannel);
    }

    // Check if user is authorized (bot owner or server owner in any channel)
    isAuthorized(message) {
        const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';
        const OWNER_CHANNEL_ID = '1410011813398974626';
        
        const isBotOwner = message.author.id === BOT_OWNER_ID;
        const isServerOwner = message.author.id === message.guild.ownerId;
        const hasAdminRole = message.member && message.member.permissions.has('Administrator');
        const isInOwnerChannel = message.channel.id === OWNER_CHANNEL_ID;

        // Bot owner can use commands anywhere
        if (isBotOwner) {
            return true;
        }

        // Server owner can use commands anywhere
        if (isServerOwner) {
            return true;
        }

        // Admins can use commands in owner channel or admin channel
        if (hasAdminRole && isInOwnerChannel) {
            return true;
        }

        return false;
    }

    // Send log message to designated log channel
    async sendLogMessage(guild, embed) {
        try {
            const ROLE_LOGS_CHANNEL_ID = '1411976584990298203';
            const logsChannel = guild.channels.cache.get(ROLE_LOGS_CHANNEL_ID);
            
            if (logsChannel) {
                await logsChannel.send({ embeds: [embed] });
            }
        } catch (error) {
            console.error('Error sending role log message:', error);
        }
    }

    // Create Role Command
    async createRole(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const roleName = args.slice(1).join(' ');
        if (!roleName) {
            return message.reply('❌ Please provide a name for the role. Usage: `createrole <name>`');
        }

        try {
            const newRole = await message.guild.roles.create({
                name: roleName,
                reason: `Role created by ${message.author.username}`
            });

            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Role Created')
                .setDescription(`Successfully created new role`)
                .addFields(
                    { name: '🎭 Role', value: `${newRole}`, inline: true },
                    { name: '🆔 Role ID', value: `\`${newRole.id}\``, inline: true },
                    { name: '👑 Created By', value: `${message.author.username}`, inline: true },
                    { name: '⏰ Created At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Role Management System' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);

        } catch (error) {
            console.error('Error creating role:', error);
            await message.reply('❌ Failed to create role. Make sure I have the Manage Roles permission.');
        }
    }

    // Delete Role Command
    async deleteRole(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
        if (!role) {
            return message.reply('❌ Please mention a role or provide a valid role ID. Usage: `deleterole @role`');
        }

        if (role.managed) {
            return message.reply('❌ Cannot delete managed roles (bot roles, booster role, etc.)');
        }

        if (role.position >= message.guild.members.me.roles.highest.position) {
            return message.reply('❌ I cannot delete roles higher than or equal to my highest role.');
        }

        const roleName = role.name;
        const roleId = role.id;
        const memberCount = role.members.size;

        try {
            await role.delete(`Role deleted by ${message.author.username}`);

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🗑️ Role Deleted')
                .setDescription(`Successfully deleted role`)
                .addFields(
                    { name: '🎭 Role Name', value: roleName, inline: true },
                    { name: '🆔 Role ID', value: `\`${roleId}\``, inline: true },
                    { name: '👥 Members Had', value: `${memberCount}`, inline: true },
                    { name: '👑 Deleted By', value: `${message.author.username}`, inline: true },
                    { name: '⏰ Deleted At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Role Management System' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);

        } catch (error) {
            console.error('Error deleting role:', error);
            await message.reply('❌ Failed to delete role. Make sure I have the Manage Roles permission.');
        }
    }

    // Edit Role Command
    async editRole(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
        if (!role) {
            return message.reply('❌ Please mention a role. Usage: `editrole @role <name|color|admin|text|voice> [value]`');
        }

        if (role.managed) {
            return message.reply('❌ Cannot edit managed roles (bot roles, booster role, etc.)');
        }

        if (role.position >= message.guild.members.me.roles.highest.position) {
            return message.reply('❌ I cannot edit roles higher than or equal to my highest role.');
        }

        const editType = args[2]?.toLowerCase();
        if (!editType) {
            return message.reply('❌ Please specify what to edit: `name`, `color`, `admin`, `text`, or `voice`');
        }

        // Handle name and color edits
        if (editType === 'name') {
            const newName = args.slice(3).join(' ');
            if (!newName) {
                return message.reply('❌ Please provide a new name. Usage: `editrole @role name <new name>`');
            }

            try {
                await role.setName(newName, `Name changed by ${message.author.username}`);
                
                const embed = new EmbedBuilder()
                    .setColor('#FFA500')
                    .setTitle('✏️ Role Name Updated')
                    .setDescription(`Successfully updated role name`)
                    .addFields(
                        { name: '🎭 Role', value: `${role}`, inline: true },
                        { name: '📝 New Name', value: newName, inline: true },
                        { name: '👑 Updated By', value: `${message.author.username}`, inline: true }
                    )
                    .setFooter({ text: 'Role Management System' })
                    .setTimestamp();

                await message.reply({ embeds: [embed] });
                await this.sendLogMessage(message.guild, embed);
                return;
            } catch (error) {
                console.error('Error changing role name:', error);
                return message.reply('❌ Failed to change role name.');
            }
        }

        if (editType === 'color') {
            const colorValue = args[3];
            if (!colorValue) {
                return message.reply('❌ Please provide a color hex code. Usage: `editrole @role color #FF0000`');
            }

            try {
                await role.setColor(colorValue, `Color changed by ${message.author.username}`);
                
                const embed = new EmbedBuilder()
                    .setColor(colorValue)
                    .setTitle('🎨 Role Color Updated')
                    .setDescription(`Successfully updated role color`)
                    .addFields(
                        { name: '🎭 Role', value: `${role}`, inline: true },
                        { name: '🎨 New Color', value: colorValue, inline: true },
                        { name: '👑 Updated By', value: `${message.author.username}`, inline: true }
                    )
                    .setFooter({ text: 'Role Management System' })
                    .setTimestamp();

                await message.reply({ embeds: [embed] });
                await this.sendLogMessage(message.guild, embed);
                return;
            } catch (error) {
                console.error('Error changing role color:', error);
                return message.reply('❌ Failed to change role color. Make sure the color code is valid.');
            }
        }

        const permissionType = editType;
        if (!['admin', 'text', 'voice'].includes(permissionType)) {
            return message.reply('❌ Please specify permission type: `admin`, `text`, or `voice`');
        }

        let permissions;
        let permissionDescription;

        switch (permissionType) {
            case 'admin':
                permissions = [
                    PermissionFlagsBits.Administrator
                ];
                permissionDescription = 'Administrator (Full Control)';
                break;
            case 'text':
                permissions = [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.SendMessages,
                    PermissionFlagsBits.EmbedLinks,
                    PermissionFlagsBits.AttachFiles,
                    PermissionFlagsBits.AddReactions,
                    PermissionFlagsBits.ReadMessageHistory,
                    PermissionFlagsBits.MentionEveryone
                ];
                permissionDescription = 'Text Channel Permissions';
                break;
            case 'voice':
                permissions = [
                    PermissionFlagsBits.ViewChannel,
                    PermissionFlagsBits.Connect,
                    PermissionFlagsBits.Speak,
                    PermissionFlagsBits.Stream,
                    PermissionFlagsBits.UseVAD,
                    PermissionFlagsBits.MuteMembers,
                    PermissionFlagsBits.DeafenMembers,
                    PermissionFlagsBits.MoveMembers
                ];
                permissionDescription = 'Voice Channel Permissions';
                break;
        }

        try {
            await role.setPermissions(permissions, `Permissions updated by ${message.author.username}`);

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('✏️ Role Permissions Updated')
                .setDescription(`Successfully updated role permissions`)
                .addFields(
                    { name: '🎭 Role', value: `${role}`, inline: true },
                    { name: '📝 Permission Type', value: permissionDescription, inline: true },
                    { name: '👑 Updated By', value: `${message.author.username}`, inline: true },
                    { name: '⏰ Updated At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Role Management System' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);

        } catch (error) {
            console.error('Error editing role:', error);
            await message.reply('❌ Failed to edit role permissions.');
        }
    }

    // Role Info Command
    async roleInfo(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
        if (!role) {
            return message.reply('❌ Please mention a role or provide a valid role ID. Usage: `roleinfo @role`');
        }

        const permissions = role.permissions.toArray();
        const permissionList = permissions.length > 0 ? permissions.slice(0, 10).join(', ') : 'None';
        const hasMore = permissions.length > 10;

        const embed = new EmbedBuilder()
            .setColor(role.color || '#808080')
            .setTitle('🎭 Role Information')
            .setDescription(`Detailed information about ${role}`)
            .addFields(
                { name: '🆔 Role ID', value: `\`${role.id}\``, inline: true },
                { name: '🎨 Color', value: role.hexColor, inline: true },
                { name: '📍 Position', value: `${role.position}`, inline: true },
                { name: '👥 Members', value: `${role.members.size}`, inline: true },
                { name: '📌 Hoisted', value: role.hoist ? 'Yes' : 'No', inline: true },
                { name: '🔔 Mentionable', value: role.mentionable ? 'Yes' : 'No', inline: true },
                { name: '🤖 Managed', value: role.managed ? 'Yes (Bot/Integration)' : 'No', inline: true },
                { name: '⏰ Created', value: `<t:${Math.floor(role.createdTimestamp / 1000)}:F>`, inline: true },
                { name: '📊 Total Permissions', value: `${permissions.length}`, inline: true },
                { name: '🔑 Key Permissions', value: permissionList + (hasMore ? `\n... and ${permissions.length - 10} more` : ''), inline: false }
            )
            .setFooter({ text: 'Role Management System' })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // In Role Command - List all members with a role
    async inRole(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[1]);
        if (!role) {
            return message.reply('❌ Please mention a role or provide a valid role ID. Usage: `inrole @role`');
        }

        const members = role.members;
        if (members.size === 0) {
            return message.reply(`❌ No members have the role ${role}.`);
        }

        const memberList = members.map((member, index) => {
            if (index < 20) {
                return `${index + 1}. ${member.user.username} (\`${member.user.id}\`)`;
            }
        }).filter(Boolean).join('\n');

        const embed = new EmbedBuilder()
            .setColor(role.color || '#808080')
            .setTitle(`👥 Members with Role: ${role.name}`)
            .setDescription(`Total members: **${members.size}**`)
            .addFields(
                { name: '📋 Member List', value: memberList + (members.size > 20 ? `\n... and ${members.size - 20} more members` : ''), inline: false }
            )
            .setFooter({ text: `Role Management System • Showing ${Math.min(20, members.size)}/${members.size} members` })
            .setTimestamp();

        await message.reply({ embeds: [embed] });
    }

    // Remove All Roles Command
    async removeAllRoles(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const targetUser = message.mentions.users.first();
        if (!targetUser) {
            return message.reply('❌ Please mention a user. Usage: `removeallroles @user`');
        }

        const member = message.guild.members.cache.get(targetUser.id);
        if (!member) {
            return message.reply('❌ User not found in this server.');
        }

        // Don't remove roles from server owner or bot owner
        const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';
        if (member.id === message.guild.ownerId || member.id === BOT_OWNER_ID) {
            return message.reply('❌ Cannot remove roles from the server owner or bot owner.');
        }

        const rolesToRemove = member.roles.cache.filter(role => role.id !== message.guild.id);
        const roleCount = rolesToRemove.size;

        if (roleCount === 0) {
            return message.reply(`❌ ${targetUser.username} has no roles to remove.`);
        }

        try {
            await member.roles.set([], `All roles removed by ${message.author.username}`);

            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('🗑️ All Roles Removed')
                .setDescription(`Successfully removed all roles from user`)
                .addFields(
                    { name: '👤 User', value: `${targetUser.username} (\`${targetUser.id}\`)`, inline: true },
                    { name: '🎭 Roles Removed', value: `${roleCount}`, inline: true },
                    { name: '👑 Removed By', value: `${message.author.username}`, inline: true },
                    { name: '⏰ Removed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Role Management System' })
                .setTimestamp();

            await message.reply({ embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);

        } catch (error) {
            console.error('Error removing roles:', error);
            await message.reply('❌ Failed to remove roles. Make sure I have the Manage Roles permission.');
        }
    }

    // Category Role Command - Add role to all channels in a category
    async handleCategoryRole(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const subCommand = args[0]?.toLowerCase();
        
        if (!subCommand || (subCommand !== 'add' && subCommand !== 'sync')) {
            return message.reply('❌ Invalid subcommand. Usage:\n• `catorole add <category_id> @role`\n• `catorole sync <category_id> @role`');
        }

        // Get category ID from args[1]
        const categoryId = args[1];
        if (!categoryId) {
            return message.reply('❌ Please provide a category ID. Usage: `catorole ' + subCommand + ' <category_id> @role`');
        }

        // Get role from mentions
        const role = message.mentions.roles.first();
        if (!role) {
            return message.reply('❌ Please mention a role. Usage: `catorole ' + subCommand + ' <category_id> @role`');
        }

        // Find the category
        const category = message.guild.channels.cache.get(categoryId);
        if (!category) {
            return message.reply('❌ Category not found. Please provide a valid category ID.');
        }

        if (category.type !== 4) { // 4 is GUILD_CATEGORY
            return message.reply('❌ The provided ID is not a category.');
        }

        if (role.managed) {
            return message.reply('❌ Cannot assign managed roles (bot roles, booster role, etc.)');
        }

        if (role.position >= message.guild.members.me.roles.highest.position) {
            return message.reply('❌ I cannot manage roles higher than or equal to my highest role.');
        }

        // Get all channels in the category
        const channelsInCategory = message.guild.channels.cache.filter(
            channel => channel.parentId === categoryId && (channel.type === 0 || channel.type === 2) // Text or Voice
        );

        if (channelsInCategory.size === 0) {
            return message.reply('❌ No channels found in this category.');
        }

        let successCount = 0;
        let failCount = 0;
        const actionText = subCommand === 'sync' ? 'Synchronizing' : 'Adding';
        
        // Send initial processing message
        const processingMessage = await message.reply(`⏳ Processing... ${actionText} ${role} permissions to ${channelsInCategory.size} channels in category **${category.name}**\n\n**Progress:** 0/${channelsInCategory.size} channels processed...`);

        if (subCommand === 'sync') {
            // SYNC mode: Copy category permissions to all channels
            const categoryPermissions = category.permissionOverwrites.cache.get(role.id);
            
            if (!categoryPermissions) {
                await processingMessage.edit('❌ Role does not have permission overrides in the category. Add permissions to the category first.');
                return;
            }

            // Sync permissions from category to all channels
            let processed = 0;
            for (const [channelId, channel] of channelsInCategory) {
                try {
                    // Copy the exact permissions from category to channel
                    await channel.permissionOverwrites.edit(role, {
                        ...categoryPermissions.allow.toArray().reduce((acc, perm) => ({ ...acc, [perm]: true }), {}),
                        ...categoryPermissions.deny.toArray().reduce((acc, perm) => ({ ...acc, [perm]: false }), {})
                    }, `Category role synchronized by ${message.author.username}`);
                    successCount++;
                } catch (error) {
                    console.error(`Error syncing role permissions to ${channel.name}:`, error);
                    failCount++;
                }
                processed++;
                
                // Update progress every 5 channels or at the end
                if (processed % 5 === 0 || processed === channelsInCategory.size) {
                    try {
                        await processingMessage.edit(`⏳ Processing... ${actionText} ${role} permissions to ${channelsInCategory.size} channels in category **${category.name}**\n\n**Progress:** ${processed}/${channelsInCategory.size} channels processed...`);
                    } catch (err) {
                        // Ignore rate limit errors on progress updates
                    }
                }
            }

            const embed = new EmbedBuilder()
                .setColor('#00D4FF')
                .setTitle('🔄 Category Role Synchronization Complete')
                .setDescription(`Successfully synchronized role permissions from category to all channels`)
                .addFields(
                    { name: '📁 Category', value: `${category.name} (\`${category.id}\`)`, inline: true },
                    { name: '🎭 Role', value: `${role}`, inline: true },
                    { name: '👑 Executed By', value: `${message.author.username}`, inline: true },
                    { name: '✅ Successful', value: `${successCount}`, inline: true },
                    { name: '❌ Failed', value: `${failCount}`, inline: true },
                    { name: '📊 Total Channels', value: `${channelsInCategory.size}`, inline: true },
                    { name: '⏰ Completed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Category Role Management System - Sync Mode' })
                .setTimestamp();

            await processingMessage.edit({ content: null, embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
        } else {
            // ADD mode: Add basic permissions to all channels
            let processed = 0;
            for (const [channelId, channel] of channelsInCategory) {
                try {
                    await channel.permissionOverwrites.edit(role, {
                        ViewChannel: true,
                        SendMessages: true,
                        ReadMessageHistory: true
                    }, `Category role added by ${message.author.username}`);
                    successCount++;
                } catch (error) {
                    console.error(`Error adding role permissions to ${channel.name}:`, error);
                    failCount++;
                }
                processed++;
                
                // Update progress every 5 channels or at the end
                if (processed % 5 === 0 || processed === channelsInCategory.size) {
                    try {
                        await processingMessage.edit(`⏳ Processing... ${actionText} ${role} permissions to ${channelsInCategory.size} channels in category **${category.name}**\n\n**Progress:** ${processed}/${channelsInCategory.size} channels processed...`);
                    } catch (err) {
                        // Ignore rate limit errors on progress updates
                    }
                }
            }

            const embed = new EmbedBuilder()
                .setColor('#00D4FF')
                .setTitle('✅ Category Role Assignment Complete')
                .setDescription(`Finished adding role permissions to channels in category`)
                .addFields(
                    { name: '📁 Category', value: `${category.name} (\`${category.id}\`)`, inline: true },
                    { name: '🎭 Role', value: `${role}`, inline: true },
                    { name: '👑 Executed By', value: `${message.author.username}`, inline: true },
                    { name: '✅ Successful', value: `${successCount}`, inline: true },
                    { name: '❌ Failed', value: `${failCount}`, inline: true },
                    { name: '📊 Total Channels', value: `${channelsInCategory.size}`, inline: true },
                    { name: '⏰ Completed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Category Role Management System' })
                .setTimestamp();

            await processingMessage.edit({ content: null, embeds: [embed] });
            await this.sendLogMessage(message.guild, embed);
        }
    }

    // Role All Command - Give a role to all members who have another role
    async roleAll(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        const sourceRole = message.mentions.roles.first();
        const targetRole = message.mentions.roles.last();

        if (!sourceRole || !targetRole || sourceRole.id === targetRole.id) {
            return message.reply('❌ Please mention two different roles. Usage: `roleall @source_role @target_role`');
        }

        const membersWithSourceRole = sourceRole.members;
        if (membersWithSourceRole.size === 0) {
            return message.reply(`❌ No members have the source role ${sourceRole}.`);
        }

        if (targetRole.managed) {
            return message.reply('❌ Cannot assign managed roles (bot roles, booster role, etc.)');
        }

        if (targetRole.position >= message.guild.members.me.roles.highest.position) {
            return message.reply('❌ I cannot assign roles higher than or equal to my highest role.');
        }

        let successCount = 0;
        let failCount = 0;

        const processingMessage = await message.reply(`⏳ Processing... Adding ${targetRole} to ${membersWithSourceRole.size} members with ${sourceRole}`);

        for (const [memberId, member] of membersWithSourceRole) {
            try {
                if (!member.roles.cache.has(targetRole.id)) {
                    await member.roles.add(targetRole, `Bulk role assignment by ${message.author.username}`);
                    successCount++;
                }
            } catch (error) {
                console.error(`Error adding role to ${member.user.username}:`, error);
                failCount++;
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#00D4FF')
            .setTitle('✅ Bulk Role Assignment Complete')
            .setDescription(`Finished assigning roles to members`)
            .addFields(
                { name: '🎭 Source Role', value: `${sourceRole}`, inline: true },
                { name: '🎯 Target Role', value: `${targetRole}`, inline: true },
                { name: '👑 Executed By', value: `${message.author.username}`, inline: true },
                { name: '✅ Successful', value: `${successCount}`, inline: true },
                { name: '❌ Failed', value: `${failCount}`, inline: true },
                { name: '📊 Total Processed', value: `${membersWithSourceRole.size}`, inline: true },
                { name: '⏰ Completed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
            )
            .setFooter({ text: 'Role Management System' })
            .setTimestamp();

        await processingMessage.edit({ content: null, embeds: [embed] });
        await this.sendLogMessage(message.guild, embed);
    }

    // Add Role Command
    async addRole(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        if (message.mentions.users.size === 0 || message.mentions.roles.size === 0) {
            return message.reply('❌ Please mention a user and a role. Usage: `addrole @user @role`');
        }

        const addRoleUser = message.mentions.users.first();
        const addRole = message.mentions.roles.first();

        if (addRole.managed) {
            return message.reply('❌ Cannot assign managed roles (bot roles, booster role, etc.)');
        }

        if (addRole.position >= message.guild.members.me.roles.highest.position) {
            return message.reply('❌ I cannot assign roles higher than or equal to my highest role.');
        }

        try {
            const member = await message.guild.members.fetch(addRoleUser.id);
            await member.roles.add(addRole);

            const addRoleEmbed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('➕ Role Added')
                .setDescription(`Successfully added role to user`)
                .addFields(
                    { name: '👤 User', value: `${addRoleUser.username} (\`${addRoleUser.id}\`)`, inline: true },
                    { name: '🎭 Role', value: `${addRole}`, inline: true },
                    { name: '👑 Added By', value: `${message.author.username}`, inline: true },
                    { name: '⏰ Added At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Role Management System' })
                .setTimestamp();

            await message.reply({ embeds: [addRoleEmbed] });
            await this.sendLogMessage(message.guild, addRoleEmbed);
        } catch (error) {
            console.error('Error adding role:', error);
            await message.reply('❌ Could not add role to this user. Make sure I have the Manage Roles permission.');
        }
    }

    // Remove Role Command
    async removeRole(message, args) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        if (message.mentions.users.size === 0 || message.mentions.roles.size === 0) {
            return message.reply('❌ Please mention a user and a role. Usage: `removerole @user @role`');
        }

        const removeRoleUser = message.mentions.users.first();
        const removeRole = message.mentions.roles.first();

        if (removeRole.managed) {
            return message.reply('❌ Cannot remove managed roles (bot roles, booster role, etc.)');
        }

        if (removeRole.position >= message.guild.members.me.roles.highest.position) {
            return message.reply('❌ I cannot manage roles higher than or equal to my highest role.');
        }

        try {
            const member = await message.guild.members.fetch(removeRoleUser.id);
            await member.roles.remove(removeRole);

            const removeRoleEmbed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('➖ Role Removed')
                .setDescription(`Successfully removed role from user`)
                .addFields(
                    { name: '👤 User', value: `${removeRoleUser.username} (\`${removeRoleUser.id}\`)`, inline: true },
                    { name: '🎭 Role', value: `${removeRole}`, inline: true },
                    { name: '👑 Removed By', value: `${message.author.username}`, inline: true },
                    { name: '⏰ Removed At', value: `<t:${Math.floor(Date.now() / 1000)}:F>`, inline: true }
                )
                .setFooter({ text: 'Role Management System' })
                .setTimestamp();

            await message.reply({ embeds: [removeRoleEmbed] });
            await this.sendLogMessage(message.guild, removeRoleEmbed);
        } catch (error) {
            console.error('Error removing role:', error);
            await message.reply('❌ Could not remove role from this user. Make sure I have the Manage Roles permission.');
        }
    }

    // List Roles Command  
    async listRoles(message) {
        if (!this.isAuthorized(message)) {
            return message.reply('❌ You are not authorized to use this command.');
        }

        try {
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
                let overviewDescription = `**ᯓᡣ𐭩 SERVER ROLE OVERVIEW**\n\n`;
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
                    title: 'ᯓᡣ𐭩 **Server Roles Overview**',
                    description: overviewDescription,
                    footer: `Card 1/${Math.ceil(allRoles.size / 5) + 1} • Overview • ${allRoles.size} total roles`
                });

                // Create cards for roles (5 per card)
                const allRolesArray = Array.from(allRoles.values());
                for (let i = 0; i < allRolesArray.length; i += 5) {
                    const roleChunk = allRolesArray.slice(i, i + 5);
                    const cardNumber = Math.floor(i / 5) + 2;
                    const totalCards = Math.ceil(allRoles.size / 5) + 1;
                    
                    let cardDescription = `**ᯓᡣ𐭩 ROLES ${i + 1}-${Math.min(i + 5, allRolesArray.length)}**\n\n`;

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
                        title: `ᯓᡣ𐭩 **Server Roles (${i + 1}-${Math.min(i + 5, allRolesArray.length)})**`,
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
                    .setColor('#af7cd2')
                    .setAuthor({
                        name: 'Quarantianizo made at discord.gg/scriptspace by script.agi',
                        iconURL: 'https://cdn.discordapp.com/attachments/1377710452653424711/1410001205639254046/a964ff33-1eaf-49ed-b487-331b3ffe3ebd.gif'
                    })
                    .setTitle(cardData.title)
                    .setDescription(cardData.description)
                    .setThumbnail(message.guild.iconURL({ dynamic: true, size: 256 }))
                    .setImage('https://cdn.discordapp.com/attachments/1377710452653424711/1410001205639254046/a964ff33-1eaf-49ed-b487-331b3ffe3ebd.gif')
                    .setFooter({
                        text: `${cardData.footer} • Auto-cycling every 5s • Made with ❤️ at ScriptSpace`,
                        iconURL: 'https://cdn.discordapp.com/attachments/1377710452653424711/1410001205639254046/a964ff33-1eaf-49ed-b487-331b3ffe3ebd.gif'
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

            // Stop auto-cycling after 5 minutes (60 cycles)
            setTimeout(() => {
                clearInterval(rolesCycleInterval);
                console.log(`🎭 Roles auto-cycling stopped for ${message.author.username}`);
            }, 300000); // 5 minutes

        } catch (error) {
            console.error('Error listing roles:', error);
            await message.reply('❌ Failed to list roles. Please try again.');
        }
    }

    // Handle all role management commands
    async handleCommand(message, command, args) {
        switch (command) {
            case 'createrole':
            case 'cr':
                await this.createRole(message, args);
                break;
            case 'deleterole':
            case 'dr':
                await this.deleteRole(message, args);
                break;
            case 'editrole':
            case 'er':
                await this.editRole(message, args);
                break;
            case 'roleinfo':
            case 'ri':
                await this.roleInfo(message, args);
                break;
            case 'inrole':
            case 'membersinrole':
                await this.inRole(message, args);
                break;
            case 'removeallroles':
            case 'rar':
                await this.removeAllRoles(message, args);
                break;
            case 'roleall':
                await this.roleAll(message, args);
                break;
            case 'catorole':
                await this.handleCategoryRole(message, args);
                break;
            case 'addrole':
                await this.addRole(message, args);
                break;
            case 'removerole':
                await this.removeRole(message, args);
                break;
            case 'roles':
                await this.listRoles(message);
                break;
        }
    }

    // Handle slash commands
    async handleSlashCommand(interaction) {
        const { commandName } = interaction;

        try {
            switch(commandName) {
                case 'addrole':
                    return await this.handleAddRoleSlash(interaction);
                case 'removerole':
                    return await this.handleRemoveRoleSlash(interaction);
                case 'createrole':
                    return await this.handleCreateRoleSlash(interaction);
                case 'deleterole':
                    return await this.handleDeleteRoleSlash(interaction);
                case 'editrole':
                    return await this.handleEditRoleSlash(interaction);
                case 'roleinfo':
                    return await this.handleRoleInfoSlash(interaction);
                case 'roles':
                    return await this.handleListRolesSlash(interaction);
                case 'inrole':
                    return await this.handleInRoleSlash(interaction);
                case 'removeallroles':
                    return await this.handleRemoveAllRolesSlash(interaction);
                case 'roleall':
                    return await this.handleRoleAllSlash(interaction);
                default:
                    await interaction.reply({ content: '❌ Unknown role command', ephemeral: true });
            }
        } catch (error) {
            console.error('Error in role slash command:', error);
            const reply = { content: '❌ Error executing role command: ' + error.message, ephemeral: true };
            if (interaction.replied || interaction.deferred) {
                await interaction.followUp(reply);
            } else {
                await interaction.reply(reply);
            }
        }
    }

    async handleAddRoleSlash(interaction) {
        if (!this.isAuthorizedSlash(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) {
            return await interaction.reply({ content: '❌ User not found', ephemeral: true });
        }

        if (role.managed) {
            return await interaction.reply({ content: '❌ Cannot assign managed roles', ephemeral: true });
        }

        try {
            await member.roles.add(role);
            const embed = new EmbedBuilder()
                .setColor('#00FF00')
                .setTitle('✅ Role Added')
                .addFields(
                    { name: '👤 User', value: `${user.username}`, inline: true },
                    { name: '🎭 Role', value: `${role}`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to add role', ephemeral: true });
        }
    }

    async handleRemoveRoleSlash(interaction) {
        if (!this.isAuthorizedSlash(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const role = interaction.options.getRole('role');
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) {
            return await interaction.reply({ content: '❌ User not found', ephemeral: true });
        }

        try {
            await member.roles.remove(role);
            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('✅ Role Removed')
                .addFields(
                    { name: '👤 User', value: `${user.username}`, inline: true },
                    { name: '🎭 Role', value: `${role}`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to remove role', ephemeral: true });
        }
    }

    async handleCreateRoleSlash(interaction) {
        if (!this.isAuthorizedSlash(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const name = interaction.options.getString('name');
        const color = interaction.options.getString('color');

        try {
            const roleData = { name, reason: `Created by ${interaction.user.username}` };
            if (color) roleData.color = color;

            const newRole = await interaction.guild.roles.create(roleData);

            const embed = new EmbedBuilder()
                .setColor(color || '#00FF00')
                .setTitle('✅ Role Created')
                .addFields(
                    { name: '🎭 Role', value: `${newRole}`, inline: true },
                    { name: '🆔 ID', value: `\`${newRole.id}\``, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to create role', ephemeral: true });
        }
    }

    async handleDeleteRoleSlash(interaction) {
        if (!this.isAuthorizedSlash(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const role = interaction.options.getRole('role');

        if (role.managed) {
            return await interaction.reply({ content: '❌ Cannot delete managed roles', ephemeral: true });
        }

        const roleName = role.name;
        try {
            await role.delete(`Deleted by ${interaction.user.username}`);

            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('🗑️ Role Deleted')
                .addFields(
                    { name: '🎭 Role', value: roleName, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to delete role', ephemeral: true });
        }
    }

    async handleEditRoleSlash(interaction) {
        if (!this.isAuthorizedSlash(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const role = interaction.options.getRole('role');
        const property = interaction.options.getString('property');
        const value = interaction.options.getString('value');

        if (role.managed) {
            return await interaction.reply({ content: '❌ Cannot edit managed roles', ephemeral: true });
        }

        try {
            let updateMessage = '';
            
            switch(property) {
                case 'name':
                    if (!value) return await interaction.reply({ content: '❌ Value required for name', ephemeral: true });
                    await role.setName(value);
                    updateMessage = `Name changed to: ${value}`;
                    break;
                case 'color':
                    if (!value) return await interaction.reply({ content: '❌ Value required for color', ephemeral: true });
                    await role.setColor(value);
                    updateMessage = `Color changed to: ${value}`;
                    break;
                case 'admin':
                    await role.setPermissions([PermissionFlagsBits.Administrator]);
                    updateMessage = 'Admin permissions granted';
                    break;
                case 'text':
                    await role.setPermissions([
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.EmbedLinks,
                        PermissionFlagsBits.AttachFiles,
                        PermissionFlagsBits.AddReactions,
                        PermissionFlagsBits.ReadMessageHistory
                    ]);
                    updateMessage = 'Text permissions granted';
                    break;
                case 'voice':
                    await role.setPermissions([
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.Connect,
                        PermissionFlagsBits.Speak,
                        PermissionFlagsBits.Stream
                    ]);
                    updateMessage = 'Voice permissions granted';
                    break;
            }

            const embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('✏️ Role Updated')
                .addFields(
                    { name: '🎭 Role', value: `${role}`, inline: true },
                    { name: '📝 Change', value: updateMessage, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to edit role', ephemeral: true });
        }
    }

    async handleRoleInfoSlash(interaction) {
        if (!this.isAuthorizedSlash(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const role = interaction.options.getRole('role');
        const permissions = role.permissions.toArray();
        const permissionList = permissions.slice(0, 10).join(', ') || 'None';

        const embed = new EmbedBuilder()
            .setColor(role.color || '#808080')
            .setTitle('🎭 Role Information')
            .addFields(
                { name: '🆔 ID', value: `\`${role.id}\``, inline: true },
                { name: '🎨 Color', value: role.hexColor, inline: true },
                { name: '👥 Members', value: `${role.members.size}`, inline: true },
                { name: '🔑 Permissions', value: permissionList + (permissions.length > 10 ? `\n+${permissions.length - 10} more` : ''), inline: false }
            )
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    async handleListRolesSlash(interaction) {
        if (!this.isAuthorizedSlash(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const roles = interaction.guild.roles.cache
            .filter(role => role.id !== interaction.guild.id)
            .sort((a, b) => b.position - a.position)
            .first(20);

        const roleList = roles.map((role, index) => 
            `${index + 1}. ${role} - ${role.members.size} members`
        ).join('\n');

        const embed = new EmbedBuilder()
            .setColor('#af7cd2')
            .setTitle('🎭 Server Roles')
            .setDescription(roleList)
            .setFooter({ text: `Showing ${roles.length}/${interaction.guild.roles.cache.size - 1} roles` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    async handleInRoleSlash(interaction) {
        if (!this.isAuthorizedSlash(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const role = interaction.options.getRole('role');
        const members = role.members;

        if (members.size === 0) {
            return await interaction.reply({ content: `❌ No members have the role ${role}.`, ephemeral: true });
        }

        const memberList = members.map((member, index) => {
            if (index < 20) {
                return `${index + 1}. ${member.user.username} (\`${member.user.id}\`)`;
            }
        }).filter(Boolean).join('\n');

        const embed = new EmbedBuilder()
            .setColor(role.color || '#808080')
            .setTitle(`👥 Members with Role: ${role.name}`)
            .setDescription(`Total members: **${members.size}**`)
            .addFields({
                name: '📋 Member List',
                value: memberList + (members.size > 20 ? `\n... and ${members.size - 20} more members` : ''),
                inline: false
            })
            .setFooter({ text: `Showing ${Math.min(20, members.size)}/${members.size} members` })
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }

    async handleRemoveAllRolesSlash(interaction) {
        if (!this.isAuthorizedSlash(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const user = interaction.options.getUser('user');
        const member = interaction.guild.members.cache.get(user.id);

        if (!member) {
            return await interaction.reply({ content: '❌ User not found in this server.', ephemeral: true });
        }

        const BOT_OWNER_ID = process.env.BOT_OWNER_ID || '1327564898460242015';
        if (member.id === interaction.guild.ownerId || member.id === BOT_OWNER_ID) {
            return await interaction.reply({ content: '❌ Cannot remove roles from the server owner or bot owner.', ephemeral: true });
        }

        const rolesToRemove = member.roles.cache.filter(role => role.id !== interaction.guild.id);
        const roleCount = rolesToRemove.size;

        if (roleCount === 0) {
            return await interaction.reply({ content: `❌ ${user.username} has no roles to remove.`, ephemeral: true });
        }

        try {
            await member.roles.set([], `All roles removed by ${interaction.user.username}`);

            const embed = new EmbedBuilder()
                .setColor('#FF6B6B')
                .setTitle('🗑️ All Roles Removed')
                .addFields(
                    { name: '👤 User', value: `${user.username}`, inline: true },
                    { name: '🎭 Roles Removed', value: `${roleCount}`, inline: true }
                )
                .setTimestamp();

            await interaction.reply({ embeds: [embed] });
            await this.sendLogMessage(interaction.guild, embed);
        } catch (error) {
            await interaction.reply({ content: '❌ Failed to remove roles.', ephemeral: true });
        }
    }

    async handleRoleAllSlash(interaction) {
        if (!this.isAuthorizedSlash(interaction)) {
            return await interaction.reply({ content: '❌ Unauthorized', ephemeral: true });
        }

        const sourceRole = interaction.options.getRole('source_role');
        const targetRole = interaction.options.getRole('target_role');

        const membersWithSourceRole = sourceRole.members;
        if (membersWithSourceRole.size === 0) {
            return await interaction.reply({ content: `❌ No members have the source role ${sourceRole}.`, ephemeral: true });
        }

        await interaction.deferReply();

        let successCount = 0;
        let failCount = 0;

        for (const [memberId, member] of membersWithSourceRole) {
            try {
                if (!member.roles.cache.has(targetRole.id)) {
                    await member.roles.add(targetRole, `Bulk role assignment by ${interaction.user.username}`);
                    successCount++;
                }
            } catch (error) {
                failCount++;
            }
        }

        const embed = new EmbedBuilder()
            .setColor('#00D4FF')
            .setTitle('✅ Bulk Role Assignment Complete')
            .addFields(
                { name: '🎭 Source Role', value: `${sourceRole}`, inline: true },
                { name: '🎯 Target Role', value: `${targetRole}`, inline: true },
                { name: '✅ Successful', value: `${successCount}`, inline: true }
            )
            .setTimestamp();

        await interaction.editReply({ embeds: [embed] });
    }
}

module.exports = RoleManager;
