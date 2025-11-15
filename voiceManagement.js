
const { EmbedBuilder } = require('discord.js');

// Voice Management Functions
class VoiceManager {
    constructor() {
        this.defendedUsers = new Set(); // Store defended users
    }

    // Mute a specific user
    async muteUser(member, reason = 'Voice muted by admin') {
        try {
            if (member.voice.channel) {
                await member.voice.setMute(true, reason);
                return { success: true, channel: member.voice.channel.name };
            }
            return { success: false, error: 'User not in voice channel' };
        } catch (error) {
            console.error('Error muting user:', error);
            return { success: false, error: error.message };
        }
    }

    // Unmute a specific user
    async unmuteUser(member, reason = 'Voice unmuted by admin') {
        try {
            if (member.voice.channel) {
                await member.voice.setMute(false, reason);
                return { success: true, channel: member.voice.channel.name };
            }
            return { success: false, error: 'User not in voice channel' };
        } catch (error) {
            console.error('Error unmuting user:', error);
            return { success: false, error: error.message };
        }
    }

    // Mute all users in voice channels
    async muteAll(guild, executor, reason = 'Voice muted all by admin') {
        let mutedCount = 0;
        const failedUsers = [];

        try {
            const voiceMembers = guild.members.cache.filter(member => 
                member.voice.channel && 
                !member.user.bot && 
                member.id !== executor.id && // Don't mute the executor
                member.id !== guild.ownerId && // Don't mute server owner
                !this.isDefended(member.id) // Don't mute defended users
            );

            for (const member of voiceMembers.values()) {
                try {
                    await member.voice.setMute(true, reason);
                    mutedCount++;
                } catch (error) {
                    console.error(`Failed to mute ${member.user.username}:`, error);
                    failedUsers.push(member.user.username);
                }
            }

            return { mutedCount, totalUsers: voiceMembers.size, failedUsers };
        } catch (error) {
            console.error('Error in muteAll:', error);
            return { mutedCount: 0, totalUsers: 0, failedUsers: [] };
        }
    }

    // Unmute all users in voice channels
    async unmuteAll(guild, executor, reason = 'Voice unmuted all by admin') {
        let unmutedCount = 0;
        const failedUsers = [];

        try {
            const voiceMembers = guild.members.cache.filter(member => 
                member.voice.channel && 
                !member.user.bot &&
                member.voice.serverMute // Only unmute those who are server muted
            );

            for (const member of voiceMembers.values()) {
                try {
                    await member.voice.setMute(false, reason);
                    unmutedCount++;
                } catch (error) {
                    console.error(`Failed to unmute ${member.user.username}:`, error);
                    failedUsers.push(member.user.username);
                }
            }

            return { unmutedCount, totalUsers: voiceMembers.size, failedUsers };
        } catch (error) {
            console.error('Error in unmuteAll:', error);
            return { unmutedCount: 0, totalUsers: 0, failedUsers: [] };
        }
    }

    // Defend a user (add to defended list and protect from muting)
    defendUser(userId) {
        this.defendedUsers.add(userId);
        return true;
    }

    // Undefend a user (remove from defended list)
    undefendUser(userId) {
        const wasDefended = this.defendedUsers.has(userId);
        this.defendedUsers.delete(userId);
        return wasDefended;
    }

    // Defend all current voice channel users
    defendAll(guild) {
        const voiceMembers = guild.members.cache.filter(member => 
            member.voice.channel && !member.user.bot
        );

        let defendedCount = 0;
        for (const member of voiceMembers.values()) {
            this.defendedUsers.add(member.id);
            defendedCount++;
        }

        return { defendedCount, totalUsers: voiceMembers.size };
    }

    // Undefend all users
    undefendAll() {
        const previousCount = this.defendedUsers.size;
        this.defendedUsers.clear();
        return previousCount;
    }

    // Check if user is defended
    isDefended(userId) {
        return this.defendedUsers.has(userId);
    }

    // Get all defended users
    getDefendedUsers() {
        return Array.from(this.defendedUsers);
    }

    // Create voice channel
    async createVoiceChannel(guild, name, isPrivate = false, executor) {
        try {
            const permissions = isPrivate ? [
                {
                    id: guild.roles.everyone,
                    deny: ['Connect', 'ViewChannel']
                },
                {
                    id: executor.id,
                    allow: ['Connect', 'ViewChannel', 'ManageChannels']
                }
            ] : [];

            const channel = await guild.channels.create({
                name: name,
                type: 2, // Voice channel
                permissionOverwrites: permissions,
                reason: `Voice channel created by ${executor.username}`
            });

            return { success: true, channel };
        } catch (error) {
            console.error('Error creating voice channel:', error);
            return { success: false, error: error.message };
        }
    }

    // Disconnect all users from voice channels
    async disconnectAll(guild, executor) {
        let disconnectedCount = 0;
        const failedUsers = [];

        try {
            const voiceMembers = guild.members.cache.filter(member => 
                member.voice.channel && 
                !member.user.bot &&
                member.id !== executor.id && // Don't disconnect executor
                member.id !== guild.ownerId // Don't disconnect server owner
            );

            for (const member of voiceMembers.values()) {
                try {
                    await member.voice.disconnect(`Disconnected by ${executor.username}`);
                    disconnectedCount++;
                } catch (error) {
                    console.error(`Failed to disconnect ${member.user.username}:`, error);
                    failedUsers.push(member.user.username);
                }
            }

            return { disconnectedCount, totalUsers: voiceMembers.size, failedUsers };
        } catch (error) {
            console.error('Error in disconnectAll:', error);
            return { disconnectedCount: 0, totalUsers: 0, failedUsers: [] };
        }
    }

    // Move user to target voice channel
    async moveUser(member, targetChannel, executor) {
        try {
            if (!member.voice.channel) {
                return { success: false, error: 'User not in voice channel' };
            }

            if (!targetChannel || targetChannel.type !== 2) {
                return { success: false, error: 'Invalid target voice channel' };
            }

            const oldChannel = member.voice.channel;
            await member.voice.setChannel(targetChannel, `Moved by ${executor.username}`);

            return { 
                success: true, 
                oldChannel: oldChannel.name, 
                newChannel: targetChannel.name 
            };
        } catch (error) {
            console.error('Error moving user:', error);
            return { success: false, error: error.message };
        }
    }

    // Handle voice state updates (required by index.js)
    handleVoiceStateUpdate(oldState, newState) {
        // This method can be used for voice state monitoring if needed
        // Currently just a placeholder to prevent the error
        if (oldState.channelId !== newState.channelId) {
            // User joined/left/moved voice channels
            console.log(`Voice state update: ${newState.member?.user?.username || 'Unknown'} moved channels`);
        }
    }

    // Create embed for voice command results
    createVoiceEmbed(action, result, user = null, guild) {
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTimestamp();

        switch (action) {
            case 'mute':
                embed.setTitle('🔇 User Voice Muted')
                    .setDescription(`${user.username} has been voice muted`)
                    .addFields(
                        { name: '👤 User', value: `<@${user.id}>`, inline: true },
                        { name: '🎤 Status', value: 'Voice Muted', inline: true },
                        { name: '📍 Channel', value: result.channel || 'Not in voice', inline: true }
                    );
                break;

            case 'unmute':
                embed.setTitle('🔊 User Voice Unmuted')
                    .setDescription(`${user.username} has been voice unmuted`)
                    .addFields(
                        { name: '👤 User', value: `<@${user.id}>`, inline: true },
                        { name: '🎤 Status', value: 'Voice Unmuted', inline: true },
                        { name: '📍 Channel', value: result.channel || 'Not in voice', inline: true }
                    );
                break;

            case 'muteAll':
                embed.setTitle('🔇 Voice Mute All')
                    .setDescription(`Mass voice mute operation completed`)
                    .addFields(
                        { name: '🔇 Muted Users', value: `${result.mutedCount}/${result.totalUsers}`, inline: true },
                        { name: '❌ Failed', value: `${result.failedUsers.length}`, inline: true },
                        { name: '🛡️ Protected', value: 'Server owner, executor & defended users excluded', inline: true }
                    );
                
                if (result.failedUsers.length > 0) {
                    embed.addFields({
                        name: '⚠️ Failed Users',
                        value: result.failedUsers.slice(0, 10).join(', ') + (result.failedUsers.length > 10 ? '...' : ''),
                        inline: false
                    });
                }
                break;

            case 'unmuteAll':
                embed.setTitle('🔊 Voice Unmute All')
                    .setDescription(`Mass voice unmute operation completed`)
                    .addFields(
                        { name: '🔊 Unmuted Users', value: `${result.unmutedCount}/${result.totalUsers}`, inline: true },
                        { name: '❌ Failed', value: `${result.failedUsers.length}`, inline: true },
                        { name: '🎤 Status', value: 'All server mutes removed', inline: true }
                    );

                if (result.failedUsers.length > 0) {
                    embed.addFields({
                        name: '⚠️ Failed Users',
                        value: result.failedUsers.slice(0, 10).join(', ') + (result.failedUsers.length > 10 ? '...' : ''),
                        inline: false
                    });
                }
                break;

            case 'defend':
                embed.setTitle('🛡️ User Defended')
                    .setDescription(`${user.username} is now protected from voice actions`)
                    .addFields(
                        { name: '👤 User', value: `<@${user.id}>`, inline: true },
                        { name: '🛡️ Status', value: 'Protected', inline: true },
                        { name: '⚠️ Note', value: 'Cannot be voice muted', inline: true }
                    );
                break;

            case 'undefend':
                embed.setTitle('🚫 User Undefended')
                    .setDescription(`${user.username} protection has been removed`)
                    .addFields(
                        { name: '👤 User', value: `<@${user.id}>`, inline: true },
                        { name: '🛡️ Status', value: 'Unprotected', inline: true },
                        { name: '⚠️ Note', value: 'Can now be voice muted', inline: true }
                    );
                break;

            case 'defendAll':
                embed.setTitle('🛡️ Defend All')
                    .setDescription(`All voice channel users are now protected`)
                    .addFields(
                        { name: '🛡️ Protected Users', value: `${result.defendedCount}`, inline: true },
                        { name: '📊 Total Users', value: `${result.totalUsers}`, inline: true },
                        { name: '🎤 Scope', value: 'All voice channels', inline: true }
                    );
                break;

            case 'undefendAll':
                embed.setTitle('🚫 Undefend All')
                    .setDescription(`All user protections have been removed`)
                    .addFields(
                        { name: '🚫 Unprotected Users', value: `${result}`, inline: true },
                        { name: '🛡️ Status', value: 'All protections cleared', inline: true },
                        { name: '⚠️ Note', value: 'All users can now be voice muted', inline: true }
                    );
                break;

            case 'createVC':
                embed.setTitle('🎤 Voice Channel Created')
                    .setDescription(`New voice channel created successfully`)
                    .addFields(
                        { name: '📍 Channel', value: result.channel.name, inline: true },
                        { name: '🔒 Privacy', value: result.privacy, inline: true },
                        { name: '👮 Created By', value: user.username, inline: true },
                        { name: '🆔 Channel ID', value: `\`${result.channel.id}\``, inline: false }
                    );
                break;

            case 'disconnectAll':
                embed.setTitle('📤 Disconnect All Users')
                    .setDescription(`Mass disconnect operation completed`)
                    .addFields(
                        { name: '📤 Disconnected', value: `${result.disconnectedCount}/${result.totalUsers}`, inline: true },
                        { name: '❌ Failed', value: `${result.failedUsers.length}`, inline: true },
                        { name: '🛡️ Protected', value: 'Server owner & executor excluded', inline: true }
                    );

                if (result.failedUsers.length > 0) {
                    embed.addFields({
                        name: '⚠️ Failed Users',
                        value: result.failedUsers.slice(0, 10).join(', ') + (result.failedUsers.length > 10 ? '...' : ''),
                        inline: false
                    });
                }
                break;

            case 'moveUser':
                embed.setTitle('🔀 User Moved')
                    .setDescription(`User moved to different voice channel`)
                    .addFields(
                        { name: '👤 User', value: `<@${user.id}>`, inline: true },
                        { name: '📍 From', value: result.oldChannel, inline: true },
                        { name: '📍 To', value: result.newChannel, inline: true }
                    );
                break;
        }

        return embed;
    }
}

module.exports = VoiceManager;
