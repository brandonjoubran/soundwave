const ytdl = require('ytdl-core');
const search = require("youtube-search")
const fs = require('node:fs');
const path = require('node:path');
require("dotenv").config(); //to start process from .env file
const { joinVoiceChannel } = require('@discordjs/voice');
const { createAudioPlayer, NoSubscriberBehavior, createAudioResource, StreamType, AudioPlayerStatus } = require('@discordjs/voice');


const { Client, Events, Collection, GatewayIntentBits } = require('discord.js')

const { Player } = require('discord-player')
const { Routes } = require('discord-api-types/v9')
const { REST } = require('@discordjs/rest')

// Create a new client instance
const client = new Client({ intents: [
	GatewayIntentBits.Guilds,
	GatewayIntentBits.GuildMessages, 
	GatewayIntentBits.MessageContent,
	GatewayIntentBits.GuildVoiceStates,
] });

const commands = [];
client.commands = new Collection()
// Grab all the command files from the commands directory you created earlier
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

// Grab the SlashCommandBuilder#toJSON() output of each command's data for deployment
for (const file of commandFiles) {
	const command = require(`./commands/${file}`);
	client.commands.set(command.data.name, command)
	commands.push(command.data.toJSON());
}

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);


(async () => {
	try {
		console.log(`Started refreshing ${commands.length} application (/) commands.`);

		// The put method is used to fully refresh all commands in the guild with the current set
		const data = await rest.put(
			Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
			{ body: commands },
		);

		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
	} catch (error) {
		// And of course, make sure you catch and log any errors!
		console.error(error);
	}
})();

// Creating the player
client.player = createAudioPlayer();

client.queue = []

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
});


function getYoutubeResource(url) {
	const stream = ytdl(url, {
		filter: "audioonly",
		quality: 'highestaudio',
      	highWaterMark: 1<<25,
	})

	const resource = createAudioResource(stream, {
		inputType: StreamType.Arbitrary,
	})
	return resource
}

function playSong(resource, message) {

	const player = client.player

	const connection = joinVoiceChannel({
		channelId: message.member.voice.channel.id,
		guildId: message.member.voice.channel.guild.id,
		adapterCreator: message.member.voice.channel.guild.voiceAdapterCreator,
	});
	console.log("joined voice channel")
	console.log("is song currently played: " + player.state.status != 'playing')

	console.log('1')
	player.play(resource);
	console.log('2')
	connection.subscribe(player);
	console.log('3')
}

function parseRequest(query, message) {
	if (query.startsWith('https://www.youtube.com/')) {
			// Playing a YouTube song
			resource = getYoutubeResource(query)
			playSong(resource, message)
		
		} else if (query.startsWith('https://open.spotify.com/track/')) {
			// https://open.spotify.com/track/2mN6HgN5Cm4slbh35jiDOa?si=1a33bb929eb04840
			// Playing a song from Spotify

		} else if (query.startsWith('https://open.spotify.com/playlist/')) {
			// https://open.spotify.com/playlist/1unCkH5i66vPZUI2ZA8R8H?si=5f29bd6644524455
			// Playing a Spotify playlist

		} else {
			// Have to search for song
			var opts = {
				maxResults: 10,
				key: 'AIzaSyANwSNsY6gaZ-1S8XO5ozEgdaR9a-6xDaI'
			  };
			  
			  search(query, opts)
			  .then(results => {
				console.log(results)
				let link = results.results[0].link
				curSong = results.results[0].title;
				message.channel.send(`Now playing: ${curSong}`);
				return getYoutubeResource(link)
			})
			.then(resource => {
				playSong(resource, message)
			})	
			.catch( err => console.log(err));
		}

}

client.on(Events.MessageCreate, (message) => {

	if (message.content.startsWith('!skip')) {
		console.log("Trying to stop...")
		client.player.stop()

		console.log(client.queue.length === 0)
		if (client.queue != 0) {
			console.log(client.queue)
			console.log(client.queue.length)
			console.log("idle!")
			let next = client.queue.pop()
			console.log(client.queue)
			console.log(next)
			const stream = ytdl(next, {
				filter: "audioonly",
				});
			console.log("here?1")
			const resource = createAudioResource(stream, {
				inputType: StreamType.Arbitrary,
				});
			console.log("here?2")
			client.player.play(resource);
			console.log("here?3")
			message.channel.send(`Now playing: `);
			console.log("here?4")
		}
	}

	if (message.content.startsWith('!stop')) {
		console.log("Trying to stop...")
		client.player.stop()
	}

	if (message.content.startsWith('!q')) {
		const query = message.content.slice(3);
		client.queue.push(query)
		message.channel.send(`Added to queue`);
		console.log("current queue: [" + client.queue + "]") 
	}

	if (message.content.startsWith('!play')) {

		// Slicing song from command
		const query = message.content.slice(6);
		console.log("sliced query: " + query)

		// Getting voice channel
	  	const voiceChannel = message.member.voice.channel;

	
	  	if (!voiceChannel) return message.channel.send('You need to be in a voice channel to play music!');
	  	console.log("verified user is in the voice channel")	

		parseRequest(query, message)

	  	try {

			/*client.player.on('error', error => {
				console.error(`Error: ${error}`);
				//client.player.play(getNextResource());
			});*/

			client.player.on(AudioPlayerStatus.Idle, () => {
				console.log("2. current queue: [" + client.queue + "]") 
				if (client.queue.length > 0) { 
					let next = client.queue.pop()
					parseRequest(next, message)
				}
				//connection.subscribe(player);
				//message.channel.send(`Now playing next song`);

		});

	  } catch (error) {
		console.error(error);
	  }
		
	}
  });

client.on(Events.InteractionCreate, async interaction => {
	console.log("here2")
    if (!interaction.isChatInputCommand()) return;
	const command = client.commands.get(interaction.commandName);

	if (!command) {
		console.error(`No command matching ${interaction.commandName} was found.`);
		return;
	}
	console.log(interaction)
	try {
		await command.execute({client, interaction});
	} catch (error) {
		console.error(error);
		if (interaction.replied || interaction.deferred) {
			await interaction.followUp({ content: 'There was an error while executing this command!', ephemeral: true });
		} else {
			await interaction.reply({ content: 'There was an error while executing this command!', ephemeral: true });
		}
	}
});



// Log in to Discord with your client's token
client.login(process.env.TOKEN);
