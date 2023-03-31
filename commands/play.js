const { SlashCommandBuilder } = require('discord.js');
const { MessageEmbed } = require('discord.js');
const { QueryType } = require('discord-player');
const { Player } = require('discord-player')

module.exports = {
	data: new SlashCommandBuilder()
		.setName('play')
		.setDescription('Replies with Pong!')
        .addSubcommand(subcommand => 
            subcommand
                .setName("search")
                .setDescription("Search for a song via song name.")
                .addStringOption(option => 
                    option
                        .setName("song")
                        .setDescription("Song name")
                        .setRequired(true)
        ))
        .addSubcommand(subcommand => 
            subcommand
                .setName("song")
                .setDescription("Enter song url.")
                .addStringOption(option => 
                    option
                        .setName("url")
                        .setDescription("Song url")
                        .setRequired(true)
        )),
        execute: async ({client, interaction}) => {
            // Verifying user is in voice channel to play song
            console.log(interaction)
            if (!interaction.member.voice.channel) {
                await interaction.reply("Must be in the voice channel to play a song.")
                return
            }

            console.log(client.player)
            // Creating player queue
            const queue = await client.player.createQueue(interaction.guild)
            
            // Connect player to voice channel if not there
            if (!queue.connection) await queue.connect(interaction.member.guild.voice.channel)

            let embed = new MessageEmbed()
            
            if (interaction.options.getSubcommand() === "song") {
                let url = interaction.options.getString("url")
                
                // Searching player for song via YouTube
                const result = await client.player.search(url, {
                    requestedBy: interaction.user,
                    searchEngine: QueryType.YOUTUBE_VIDEO,
                })

                if (result.tracks.length === 0) {
                    await interaction.reply("Can't find song")
                    return
                }

                const song = result.tracks[0]

                // Adding song to queue
                await queue.addTrack(song)

                // Setting embedded message
                embed
                    .setDescription(`Added ${song.title} to queue`)
                    .setThumbnail(song.thumbnail)
                    .setFooter({text: `Duration: ${song.duration}`})


            }
            else if (interaction.options.getSubcommand() === "search") {
                let url = interaction.options.getString("url")
                
                // Searching player for song via YouTube
                const result = await client.player.search(url, {
                    requestedBy: interaction.user,
                    searchEngine: QueryType.AUTO,
                })

                if (result.tracks.length === 0) {
                    await interaction.reply("Can't find song")
                    return
                }

                const song = result.tracks[0]

                // Adding song to queue
                await queue.addTrack(song)

                // Setting embedded message
                embed
                    .setDescription(`Added ${song.title} to queue`)
                    .setThumbnail(song.thumbnail)
                    .setFooter({text: `Duration: ${song.duration}`})
            }

            // Start playing music if not already
            if (!queue.playing) await queue.play()

            interaction.reply({
                embeds: [embed]
            })

        },
}
