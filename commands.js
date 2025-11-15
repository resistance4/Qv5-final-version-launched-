const { REST, Routes, SlashCommandBuilder, PermissionFlagsBits } = require('discord.js');
require('dotenv').config();

const commands = [
    // Extra Owner System
    new SlashCommandBuilder()
        .setName('extraowner')
        .setDescription('Grant permanent extra owner status')
        .addUserOption(option => option.setName('user').setDescription('User to grant extra owner').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('tempowner')
        .setDescription('Grant temporary extra owner status')
        .addUserOption(option => option.setName('user').setDescription('User to grant temporary owner').setRequired(true))
        .addStringOption(option => option.setName('duration').setDescription('Duration (1h, 2h, 4h, 8h, 12h, 1d, 2d, 3d, 1w)').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('removeowner')
        .setDescription('Remove extra owner status')
        .addUserOption(option => option.setName('user').setDescription('User to remove owner status from').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('listowners')
        .setDescription('Show all extra owners')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    // Quarantine System
    new SlashCommandBuilder()
        .setName('quarantine')
        .setDescription('Quarantine a user')
        .addUserOption(option => option.setName('user').setDescription('User to quarantine').setRequired(true))
        .addStringOption(option => option.setName('duration').setDescription('Duration (5m, 10m, 15m, 30m, 1h, 2h, etc.)'))
        .addStringOption(option => option.setName('reason').setDescription('Reason for quarantine'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('unquarantine')
        .setDescription('Remove quarantine from a user')
        .addUserOption(option => option.setName('user').setDescription('User to unquarantine').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    // Basic Moderation
    new SlashCommandBuilder()
        .setName('kick')
        .setDescription('Kick a user from the server')
        .addUserOption(option => option.setName('user').setDescription('User to kick').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for kick'))
        .setDefaultMemberPermissions(PermissionFlagsBits.KickMembers),

    new SlashCommandBuilder()
        .setName('ban')
        .setDescription('Ban a user from the server')
        .addUserOption(option => option.setName('user').setDescription('User to ban').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for ban'))
        .setDefaultMemberPermissions(PermissionFlagsBits.BanMembers),

    new SlashCommandBuilder()
        .setName('mute')
        .setDescription('Timeout a user for 10 minutes')
        .addUserOption(option => option.setName('user').setDescription('User to mute').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for mute'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('unmute')
        .setDescription('Remove timeout from a user')
        .addUserOption(option => option.setName('user').setDescription('User to unmute').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('warn')
        .setDescription('Send a warning to a user')
        .addUserOption(option => option.setName('user').setDescription('User to warn').setRequired(true))
        .addStringOption(option => option.setName('reason').setDescription('Reason for warning').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    new SlashCommandBuilder()
        .setName('clear')
        .setDescription('Delete messages in bulk')
        .addIntegerOption(option => option.setName('amount').setDescription('Number of messages to delete (1-100)').setRequired(true).setMinValue(1).setMaxValue(100))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('slowmode')
        .setDescription('Set channel slowmode')
        .addIntegerOption(option => option.setName('seconds').setDescription('Slowmode in seconds (0-21600)').setRequired(true).setMinValue(0).setMaxValue(21600))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    // Role Management
    new SlashCommandBuilder()
        .setName('addrole')
        .setDescription('Add a role to a user')
        .addUserOption(option => option.setName('user').setDescription('User to add role to').setRequired(true))
        .addRoleOption(option => option.setName('role').setDescription('Role to add').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('removerole')
        .setDescription('Remove a role from a user')
        .addUserOption(option => option.setName('user').setDescription('User to remove role from').setRequired(true))
        .addRoleOption(option => option.setName('role').setDescription('Role to remove').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('createrole')
        .setDescription('Create a new role')
        .addStringOption(option => option.setName('name').setDescription('Role name').setRequired(true))
        .addStringOption(option => option.setName('color').setDescription('Role color (hex code)')),

    new SlashCommandBuilder()
        .setName('deleterole')
        .setDescription('Delete a role')
        .addRoleOption(option => option.setName('role').setDescription('Role to delete').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('editrole')
        .setDescription('Edit role properties')
        .addRoleOption(option => option.setName('role').setDescription('Role to edit').setRequired(true))
        .addStringOption(option => 
            option.setName('property')
                .setDescription('Property to edit')
                .setRequired(true)
                .addChoices(
                    { name: 'Name', value: 'name' },
                    { name: 'Color', value: 'color' },
                    { name: 'Admin Permissions', value: 'admin' },
                    { name: 'Text Permissions', value: 'text' },
                    { name: 'Voice Permissions', value: 'voice' }
                ))
        .addStringOption(option => option.setName('value').setDescription('New value'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('roleinfo')
        .setDescription('Show role information')
        .addRoleOption(option => option.setName('role').setDescription('Role to show info for').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('roles')
        .setDescription('List all server roles')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('inrole')
        .setDescription('List all members with a specific role')
        .addRoleOption(option => option.setName('role').setDescription('Role to check').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('removeallroles')
        .setDescription('Remove all roles from a user')
        .addUserOption(option => option.setName('user').setDescription('User to remove all roles from').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('roleall')
        .setDescription('Give a role to all members with another role')
        .addRoleOption(option => option.setName('source_role').setDescription('Source role').setRequired(true))
        .addRoleOption(option => option.setName('target_role').setDescription('Target role to give').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    // Channel Management
    new SlashCommandBuilder()
        .setName('lock')
        .setDescription('Lock current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('unlock')
        .setDescription('Unlock current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('hide')
        .setDescription('Hide current channel from @everyone')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('show')
        .setDescription('Show current channel to @everyone')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('lockvc')
        .setDescription('Lock a voice channel')
        .addChannelOption(option => option.setName('channel').setDescription('Voice channel to lock').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('unlockvc')
        .setDescription('Unlock a voice channel')
        .addChannelOption(option => option.setName('channel').setDescription('Voice channel to unlock').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('hidevc')
        .setDescription('Hide a voice channel')
        .addChannelOption(option => option.setName('channel').setDescription('Voice channel to hide').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('showvc')
        .setDescription('Show a voice channel')
        .addChannelOption(option => option.setName('channel').setDescription('Voice channel to show').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('rename')
        .setDescription('Rename current channel')
        .addStringOption(option => option.setName('name').setDescription('New channel name').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('topic')
        .setDescription('Set channel topic')
        .addStringOption(option => option.setName('topic').setDescription('New channel topic').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('limit')
        .setDescription('Set user limit for voice channel')
        .addChannelOption(option => option.setName('channel').setDescription('Voice channel').setRequired(true))
        .addIntegerOption(option => option.setName('limit').setDescription('User limit (0-99)').setRequired(true).setMinValue(0).setMaxValue(99))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('bitrate')
        .setDescription('Set bitrate for voice channel')
        .addChannelOption(option => option.setName('channel').setDescription('Voice channel').setRequired(true))
        .addIntegerOption(option => option.setName('bitrate').setDescription('Bitrate in kbps (8-384)').setRequired(true).setMinValue(8).setMaxValue(384))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    // Voice Management
    new SlashCommandBuilder()
        .setName('vmute')
        .setDescription('Voice mute a user')
        .addUserOption(option => option.setName('user').setDescription('User to voice mute').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

    new SlashCommandBuilder()
        .setName('vunmute')
        .setDescription('Voice unmute a user')
        .addUserOption(option => option.setName('user').setDescription('User to voice unmute').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

    new SlashCommandBuilder()
        .setName('vmuteall')
        .setDescription('Voice mute all users in voice channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

    new SlashCommandBuilder()
        .setName('vunmuteall')
        .setDescription('Voice unmute all server muted users')
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

    new SlashCommandBuilder()
        .setName('vdefend')
        .setDescription('Protect a user from voice muting')
        .addUserOption(option => option.setName('user').setDescription('User to protect').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

    new SlashCommandBuilder()
        .setName('vundefend')
        .setDescription('Remove voice mute protection from a user')
        .addUserOption(option => option.setName('user').setDescription('User to unprotect').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

    new SlashCommandBuilder()
        .setName('vdefendall')
        .setDescription('Protect all voice channel users from voice muting')
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

    new SlashCommandBuilder()
        .setName('vundefendall')
        .setDescription('Remove all voice mute protections')
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

    new SlashCommandBuilder()
        .setName('vdefended')
        .setDescription('List all protected users')
        .setDefaultMemberPermissions(PermissionFlagsBits.MuteMembers),

    // Media & Threads
    new SlashCommandBuilder()
        .setName('enablemedia')
        .setDescription('Enable media-only mode for current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('disablemedia')
        .setDescription('Disable media-only mode for current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('mediaslowmode')
        .setDescription('Set slowmode for media channel')
        .addIntegerOption(option => option.setName('seconds').setDescription('Slowmode in seconds (0-21600)').setRequired(true).setMinValue(0).setMaxValue(21600))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('lockmedia')
        .setDescription('Lock media channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('unlockmedia')
        .setDescription('Unlock media channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('createthread')
        .setDescription('Create a new thread')
        .addStringOption(option => option.setName('name').setDescription('Thread name').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads),

    new SlashCommandBuilder()
        .setName('lockthread')
        .setDescription('Lock current thread')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads),

    new SlashCommandBuilder()
        .setName('unlockthread')
        .setDescription('Unlock current thread')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads),

    new SlashCommandBuilder()
        .setName('archivethread')
        .setDescription('Archive current thread')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads),

    new SlashCommandBuilder()
        .setName('unarchivethread')
        .setDescription('Unarchive current thread')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads),

    new SlashCommandBuilder()
        .setName('deletethread')
        .setDescription('Delete current thread')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageThreads),

    // Auto-Mod
    new SlashCommandBuilder()
        .setName('automod')
        .setDescription('Toggle auto-moderation')
        .addStringOption(option => 
            option.setName('action')
                .setDescription('Enable or disable')
                .setRequired(true)
                .addChoices(
                    { name: 'Enable', value: 'on' },
                    { name: 'Disable', value: 'off' }
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('automodconfig')
        .setDescription('Configure auto-moderation settings')
        .addStringOption(option =>
            option.setName('setting')
                .setDescription('Setting to configure')
                .setRequired(true)
                .addChoices(
                    { name: 'Blacklist', value: 'blacklist' },
                    { name: 'URLs', value: 'urls' },
                    { name: 'Invites', value: 'invites' },
                    { name: 'Spam', value: 'spam' },
                    { name: 'Mentions', value: 'mentions' }
                ))
        .addStringOption(option =>
            option.setName('value')
                .setDescription('Value (on/off)')
                .setRequired(true)
                .addChoices(
                    { name: 'On', value: 'on' },
                    { name: 'Off', value: 'off' }
                ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('blacklist')
        .setDescription('Manage blacklisted words')
        .addStringOption(option =>
            option.setName('action')
                .setDescription('Action to perform')
                .setRequired(true)
                .addChoices(
                    { name: 'Add', value: 'add' },
                    { name: 'Remove', value: 'remove' },
                    { name: 'List', value: 'list' }
                ))
        .addStringOption(option => option.setName('word').setDescription('Word to add/remove'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('clearwarnings')
        .setDescription('Clear warnings for a user')
        .addUserOption(option => option.setName('user').setDescription('User to clear warnings for').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ModerateMembers),

    // Utility
    new SlashCommandBuilder()
        .setName('ping')
        .setDescription('Check bot latency'),

    new SlashCommandBuilder()
        .setName('help')
        .setDescription('Show help menu with all commands'),

    new SlashCommandBuilder()
        .setName('dev')
        .setDescription('Show developer information'),

    new SlashCommandBuilder()
        .setName('userinfo')
        .setDescription('Show user information')
        .addUserOption(option => option.setName('user').setDescription('User to show info for')),

    new SlashCommandBuilder()
        .setName('dm')
        .setDescription('Send a direct message to a user')
        .addUserOption(option => option.setName('user').setDescription('User to DM').setRequired(true))
        .addStringOption(option => option.setName('message').setDescription('Message to send').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('permissions')
        .setDescription('Check channel permissions for a user')
        .addUserOption(option => option.setName('user').setDescription('User to check permissions for'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('channels')
        .setDescription('List all server channels')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    // Link & Embed Control
    new SlashCommandBuilder()
        .setName('locklinks')
        .setDescription('Prevent users from sending links in current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('unlocklinks')
        .setDescription('Allow users to send links in current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('lockembeds')
        .setDescription('Prevent embeds from appearing in current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('unlockembeds')
        .setDescription('Allow embeds to appear in current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('lockattachments')
        .setDescription('Prevent file attachments in current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('unlockattachments')
        .setDescription('Allow file attachments in current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('lockreactions')
        .setDescription('Prevent reactions in current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('unlockreactions')
        .setDescription('Allow reactions in current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    // Extended Channel Management
    new SlashCommandBuilder()
        .setName('lockall')
        .setDescription('Lock all text channels in the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('unlockall')
        .setDescription('Unlock all text channels in the server')
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('nuke')
        .setDescription('Clone and delete current channel (clears all messages)')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('clone')
        .setDescription('Create an exact copy of current channel')
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('setnsfw')
        .setDescription('Mark channel as NSFW')
        .addBooleanOption(option => option.setName('enabled').setDescription('Enable or disable NSFW').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageChannels),

    new SlashCommandBuilder()
        .setName('announce')
        .setDescription('Send an announcement embed')
        .addStringOption(option => option.setName('title').setDescription('Announcement title').setRequired(true))
        .addStringOption(option => option.setName('message').setDescription('Announcement message').setRequired(true))
        .addStringOption(option => option.setName('color').setDescription('Embed color (hex code, default: #8A00C4)')),

    // Extended Utility Commands
    new SlashCommandBuilder()
        .setName('serverinfo')
        .setDescription('Show detailed server information'),

    new SlashCommandBuilder()
        .setName('avatar')
        .setDescription('Get user avatar')
        .addUserOption(option => option.setName('user').setDescription('User to get avatar from')),

    new SlashCommandBuilder()
        .setName('banner')
        .setDescription('Get user banner')
        .addUserOption(option => option.setName('user').setDescription('User to get banner from')),

    new SlashCommandBuilder()
        .setName('rolecolor')
        .setDescription('Get role color information')
        .addRoleOption(option => option.setName('role').setDescription('Role to check').setRequired(true)),

    new SlashCommandBuilder()
        .setName('membercount')
        .setDescription('Show server member statistics'),

    new SlashCommandBuilder()
        .setName('botstats')
        .setDescription('Show bot statistics and uptime'),

    new SlashCommandBuilder()
        .setName('invite')
        .setDescription('Get bot invite link'),

    new SlashCommandBuilder()
        .setName('uptime')
        .setDescription('Check how long the bot has been running'),

    new SlashCommandBuilder()
        .setName('emojis')
        .setDescription('List all server emojis'),

    new SlashCommandBuilder()
        .setName('stickers')
        .setDescription('List all server stickers'),

    new SlashCommandBuilder()
        .setName('boosters')
        .setDescription('List all server boosters'),

    // Say Commands
    new SlashCommandBuilder()
        .setName('say')
        .setDescription('Make the bot say something')
        .addStringOption(option => option.setName('message').setDescription('Message to say').setRequired(true))
        .addChannelOption(option => option.setName('channel').setDescription('Channel to send message to'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('sayembed')
        .setDescription('Make the bot say something in an embed')
        .addStringOption(option => option.setName('message').setDescription('Message to say').setRequired(true))
        .addStringOption(option => option.setName('color').setDescription('Embed color (hex code, default: #8A00C4)'))
        .addChannelOption(option => option.setName('channel').setDescription('Channel to send to'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('edit')
        .setDescription('Edit a bot message')
        .addStringOption(option => option.setName('message_id').setDescription('Message ID to edit').setRequired(true))
        .addStringOption(option => option.setName('new_message').setDescription('New message content').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('reply')
        .setDescription('Make the bot reply to a message')
        .addStringOption(option => option.setName('message_id').setDescription('Message ID to reply to').setRequired(true))
        .addStringOption(option => option.setName('message').setDescription('Reply message').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    // Embed Commands
    new SlashCommandBuilder()
        .setName('embed')
        .setDescription('Create a custom embed')
        .addStringOption(option => option.setName('title').setDescription('Embed title').setRequired(true))
        .addStringOption(option => option.setName('description').setDescription('Embed description').setRequired(true))
        .addStringOption(option => option.setName('color').setDescription('Embed color (hex code, default: #8A00C4)'))
        .addStringOption(option => option.setName('footer').setDescription('Embed footer text'))
        .addStringOption(option => option.setName('image').setDescription('Image URL'))
        .addStringOption(option => option.setName('thumbnail').setDescription('Thumbnail URL'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('embedfield')
        .setDescription('Create embed with fields')
        .addStringOption(option => option.setName('title').setDescription('Embed title').setRequired(true))
        .addStringOption(option => option.setName('description').setDescription('Embed description'))
        .addStringOption(option => option.setName('field1_name').setDescription('First field name'))
        .addStringOption(option => option.setName('field1_value').setDescription('First field value'))
        .addStringOption(option => option.setName('field2_name').setDescription('Second field name'))
        .addStringOption(option => option.setName('field2_value').setDescription('Second field value'))
        .addStringOption(option => option.setName('color').setDescription('Embed color (hex code, default: #8A00C4)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    // Reaction Role Commands
    new SlashCommandBuilder()
        .setName('reactionrole')
        .setDescription('Create a reaction role message')
        .addStringOption(option => option.setName('message_id').setDescription('Message ID to add reactions to').setRequired(true))
        .addRoleOption(option => option.setName('role').setDescription('Role to assign').setRequired(true))
        .addStringOption(option => option.setName('emoji').setDescription('Emoji to use').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('createreactionrole')
        .setDescription('Create a new reaction role panel')
        .addStringOption(option => option.setName('title').setDescription('Panel title').setRequired(true))
        .addStringOption(option => option.setName('description').setDescription('Panel description').setRequired(true))
        .addStringOption(option => option.setName('color').setDescription('Embed color (hex code, default: #8A00C4)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    new SlashCommandBuilder()
        .setName('removereactionrole')
        .setDescription('Remove a reaction role')
        .addStringOption(option => option.setName('message_id').setDescription('Message ID').setRequired(true))
        .addStringOption(option => option.setName('emoji').setDescription('Emoji to remove').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageRoles),

    // Global Announcement Commands
    new SlashCommandBuilder()
        .setName('globalannounce')
        .setDescription('Send announcement to all text channels')
        .addStringOption(option => option.setName('title').setDescription('Announcement title').setRequired(true))
        .addStringOption(option => option.setName('message').setDescription('Announcement message').setRequired(true))
        .addStringOption(option => option.setName('color').setDescription('Embed color (hex code, default: #8A00C4)'))
        .addStringOption(option => option.setName('ping').setDescription('Ping @everyone').addChoices(
            { name: 'Yes', value: 'yes' },
            { name: 'No', value: 'no' }
        ))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('globalannoc')
        .setDescription('Announce a message to all server announcement channels')
        .addStringOption(option => option.setName('message_id').setDescription('Message ID to announce').setRequired(true))
        .addStringOption(option => option.setName('color').setDescription('Embed color (hex code, default: #8A00C4)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('setannouncechannel')
        .setDescription('Set announcement channel for this server')
        .addChannelOption(option => option.setName('channel').setDescription('Channel for announcements').setRequired(true))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

    new SlashCommandBuilder()
        .setName('announcechannel')
        .setDescription('Send announcement to specific channel')
        .addChannelOption(option => option.setName('channel').setDescription('Channel to announce in').setRequired(true))
        .addStringOption(option => option.setName('title').setDescription('Announcement title').setRequired(true))
        .addStringOption(option => option.setName('message').setDescription('Announcement message').setRequired(true))
        .addStringOption(option => option.setName('color').setDescription('Embed color (hex code, default: #8A00C4)'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('poll')
        .setDescription('Create a poll')
        .addStringOption(option => option.setName('question').setDescription('Poll question').setRequired(true))
        .addStringOption(option => option.setName('option1').setDescription('First option').setRequired(true))
        .addStringOption(option => option.setName('option2').setDescription('Second option').setRequired(true))
        .addStringOption(option => option.setName('option3').setDescription('Third option'))
        .addStringOption(option => option.setName('option4').setDescription('Fourth option'))
        .addStringOption(option => option.setName('option5').setDescription('Fifth option'))
        .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages),

    new SlashCommandBuilder()
        .setName('giveaway')
        .setDescription('Start a giveaway')
        .addStringOption(option => option.setName('prize').setDescription('Giveaway prize').setRequired(true))
        .addIntegerOption(option => option.setName('duration').setDescription('Duration in minutes').setRequired(true).setMinValue(1))
        .addIntegerOption(option => option.setName('winners').setDescription('Number of winners').setRequired(true).setMinValue(1).setMaxValue(10))
        .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),
];

async function registerCommands() {
    const token = process.env.TOKEN || process.env.DISCORD_TOKEN;
    if (!token) {
        console.error('❌ No bot token found in environment variables');
        return false;
    }

    const rest = new REST({ version: '10' }).setToken(token);

    try {
        console.log('🔄 Started refreshing application (/) commands...');

        await rest.put(
            Routes.applicationCommands(process.env.CLIENT_ID || '1408559977131671582'),
            { body: commands.map(cmd => cmd.toJSON()) }
        );

        console.log('✅ Successfully reloaded application (/) commands!');
        return true;
    } catch (error) {
        console.error('❌ Error registering slash commands:', error);
        return false;
    }
}

module.exports = { registerCommands, commands };