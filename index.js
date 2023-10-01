const ytdl = require('ytdl-core');
const search = require("youtube-search")
const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder } = require('discord.js');
require("dotenv").config(); //to start process from .env file
const { joinVoiceChannel } = require('@discordjs/voice');
const { createAudioPlayer, NoSubscriberBehavior, createAudioResource, StreamType, AudioPlayerStatus } = require('@discordjs/voice');
const fetch = require('node-fetch');


const { Client, Events, Collection, GatewayIntentBits } = require('discord.js')

const { Player } = require('discord-player')
const { Routes } = require('discord-api-types/v9')
const { REST } = require('@discordjs/rest');
const { connect } = require('node:http2');
const { channel } = require('node:diagnostics_channel');

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


// (async () => {
// 	try {
// 		console.log(`Started refreshing ${commands.length} application (/) commands.`);

// 		// The put method is used to fully refresh all commands in the guild with the current set
// 		const data = await rest.put(
// 			Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
// 			{ body: commands },
// 		);

// 		console.log(`Successfully reloaded ${data.length} application (/) commands.`);
// 	} catch (error) {
// 		// And of course, make sure you catch and log any errors!
// 		console.error(error);
// 	}
// })();

// Creating the player
client.player = createAudioPlayer();

// Creating song queue
client.queue = []

// Saving last play message to be deleted on new play
let prevMsg = ''

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
});

// Make queue embeded message
const queueEmbed = () => {
	// Preview queue
	let desc = ''
	// Added songs to the queue message
	client.queue.forEach((song, index) => {
		if(index > 24) { // Limiting to showing max 24 in queue for now
			return
		}
		desc += `${index + 1}. ${song}\n`
	});
	// Desc being empty results in an error
	if(desc == '') desc = "Queue is empty"
	const queueEmbed = new EmbedBuilder()
	.setColor(0x0099FF)
	.setTitle('Queue')
	.setDescription(desc)
	return queueEmbed
}

// Shuffle the queue
const shuffleQueue = array => {
	for (let i = array.length - 1; i > 0; i--) {
	  const j = Math.floor(Math.random() * (i + 1));
	  const temp = array[i];
	  array[i] = array[j];
	  array[j] = temp;
	}
  }

// Make a request to the Spotify API to get a new access token
function getNewSpotifyAccessToken() {
	const authString = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');

	return fetch('https://accounts.spotify.com/api/token', {
		method: 'POST',
		headers: {
		'Authorization': `Basic ${authString}`,
		'Content-Type': 'application/x-www-form-urlencoded'
		},
		body: 'grant_type=client_credentials'
	})
	.then(response => response.json())
	.then(data => {
		const accessToken = data.access_token;
		console.log(accessToken)
		console.log(process.env.SPOTIFY_ACCESS_TOKEN)
		process.env.SPOTIFY_ACCESS_TOKEN = `${accessToken}`
		console.log(process.env.SPOTIFY_ACCESS_TOKEN)
	// Use the new access token to make requests to the Spotify API
	})
	.catch(error => {
		console.error(error);
	});

}

// Getting tracks from Spotify playlist using their API
function getSpotifyTracks(playlistId) {
	// Make a request to the Spotify API
	return fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
		headers: {
		'Authorization': `Bearer ${process.env.SPOTIFY_ACCESS_TOKEN}`
		}
	})
	.then(response => {
		return response.json()}
		)
	.then(data => {
		return data
	})
}

// Retry method for getting tracks from Spotify playlist using their API
function getSpotifyTracksRetry(playlistId) {
	return getSpotifyTracks(playlistId)
	.then(data => {
		// Get new access token if expired and try again
		if (data.error && data.error.status == 401) {
			return getNewSpotifyAccessToken()
			.then(status => {
				return getSpotifyTracks(playlistId)
			})
		}
		return data
	})
}



// Adding a song to the queue
function addToQueue(item) {
	client.queue.push(item)
}

// Downloading song audio from YouTube
function getYoutubeResource(url) {
	const stream = ytdl(url, {
		quality: 'highestaudio',
      	highWaterMark: 1<<25,
	})

	const resource = createAudioResource(stream, {
		inputType: StreamType.Arbitrary,
		inlineVolume: true,
	})
	console.log("resource", resource)
	console.log("resource.volume", resource.volume)
	resource.volume.setVolume(0.75);
	return resource
}

// Function to get YouTube link for a given request
function searchYoutube(query, message) {

	var opts = {
		maxResults: 10,
		key: process.env.GOOGLE_KEY
	  };
	  
	  // Searching YouTube
	  search(query, opts)
	  .then(results => {
		let link = results.results[0].link
		curSong = results.results[0].title;
		message.channel.send(`Now playing: ${curSong}`).then((result) => {
			console.log(result)
			console.log("prevMsg", prevMsg)
			console.log("result.id", result.id)
			if(prevMsg == '') prevMsg = result.id
			else {
				console.log("channel", message.channel)
				console.log("channel.messages", message.channel.messages)
				message.channel.messages.delete(prevMsg);
				prevMsg = result.id;
			}
			console.log("prevMsg 2", prevMsg)
		})

		//client.prevMsg = ''

		return getYoutubeResource(link)
	})
	.then(resource => {
		playSong(resource, message)
	})	
	.catch( err => console.log(err));

}

// Function to play song given the resource needed
function playSong(resource, message) {

	const player = client.player

	// Bot join voice channel
	const connection = joinVoiceChannel({
		channelId: message.member.voice.channel.id,
		guildId: message.member.voice.channel.guild.id,
		adapterCreator: message.member.voice.channel.guild.voiceAdapterCreator,
	});
	
	// Play song
	try{
		player.play(resource);
		connection.subscribe(player);
	} catch (error) {
		console.log('yup')
		console.error(error);
	  }
}

function handleRequest(query, message) {
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

			// Parsing link to get playlist id
			let playlistId = query.split('/').pop().split('?')[0];
			console.log(playlistId)
		 	getSpotifyTracksRetry(playlistId)
			.then(data => {
				//console.log(data)

				// Play the first song in the playlist
				searchYoutube(data.items[0].track.name + ' ' + data.items[0].track.artists[0].name, message)

				// Add the rest of the playlist to the queue
				for (let i = 1; i < data.items.length; i++) {
					//console.log("Adding to queue from playlist: " + data.items[i].track.name + ' ' + data.items[i].track.artists[0].name)
					addToQueue(data.items[i].track.name + ' ' + data.items[i].track.artists[0].name)
				}
				//console.log("current queue: [" + client.queue + "]") 
			})

		} else {
			// Have to search for song
			searchYoutube(query, message)
		}

}

client.on(Events.MessageCreate, (message) => {

	
	if (!message || !message.content || message.content == '') {
		return
	}

	if(!message.content.startsWith('!')) {
		return
	}
	console.log(message)
	if (message.content.startsWith('!help')) {
		// List of commands
		// Preview queue
		let desc = ''
		desc += '!p / !play <YouTube link / Spotify song link / Spotify playlist link / name of song>\n'
		desc += '!q <YouTube link / Spotify song link / Spotify playlist link / name of song>\n'
		desc += '!pause\n'
		desc += '!unpause\n'
		desc += '!skip\n'
		desc += '!shuffle\n'
		const helpEmbed = new EmbedBuilder()
		.setColor(0x0099FF)
		.setTitle('List of bot commands')
		.addFields(
			{ name: 'Play audio', value: '\n**Command: **`!p <YouTube link / Spotify song link / Spotify playlist link / name of song>.`\n **Example**: !p https://www.youtube.com/watch?v=JuYeHPFR3f0\n **Example**: !p Pokemon theme song\n **Example**: !p https://open.spotify.com/playlist/1unCkH5i66vPZUI2ZA8R8H?si=5f29bd6644524455' },
			{ name: 'Add to queue', value: '**Command: **`!q <YouTube link / Spotify song link / Spotify playlist link / name of song>.`\n **Example**: !q https://www.youtube.com/watch?v=JuYeHPFR3f0\n **Example**: !q Pokemon theme song\n **Example**: !q https://open.spotify.com/playlist/1unCkH5i66vPZUI2ZA8R8H?si=5f29bd6644524455' },
			{ name: 'Pause audio', value: '**Command: **`!pause`' },
			{ name: 'Unpause audio', value: '**Command: **`!unpause`' },
			{ name: 'Shuffle queue', value: '**Command: **`!shuffle`' },
		)
		return message.channel.send({ embeds: [helpEmbed] });
	}

	else if (message.content.startsWith('!skip')) {
		// Stopping player makes it idle which triggers next song
		console.log("Trying to stop...")
		client.player.stop()
	}

	else if (message.content.startsWith('!shuffle')) {
		// Shuffling queue and preview new queue

		if(client.queue.length == 0) {
			// Queue empty, tell user nothing shuffled
			return message.channel.send("Can't shuffle, the queue is empty!")
		}

		shuffleQueue(client.queue)
		message.channel.send("Queue shuffled!");
		return message.channel.send({ embeds: [queueEmbed()] });
		
	}

	else if (message.content.startsWith('!pause')) {
		console.log("Trying to pause...")
		client.player.pause()
		return message.channel.send("Song paused")
	}

	else if (message.content.startsWith('!unpause')) {
		console.log("Trying to unpause...")
		client.player.unpause()
		return message.channel.send("Song unpaused")
	}

	else if (message.content.startsWith('!q')) {
		const query = message.content.slice(3);
		if(query == '') { 
			// Preview queue
			embed = queueEmbed()
			message.channel.send({ embeds: [embed] });

		}else { 
			// Add to queue
			addToQueue(query)
			message.reply(`Added to queue`);
		}
	}

	else if (message.content.startsWith('!p')) {

		// Slicing song from command
		const query = message.content.slice(3);
		console.log("sliced query: " + query)

		if(query == '' || query == null) {
			console.log('query was empty')
			return
		}

		// Getting voice channel
	  	const voiceChannel = message.member.voice.channel;

		// Ensuring user is in the voice channel
	  	if (!voiceChannel) return message.channel.send('You need to be in a voice channel to play music!');
	  	console.log("verified user is in the voice channel")	

		handleRequest(query, message)

	  	try {

			client.player.on('error', error => {
				console.error(`Error: ${error}`);
				client.player.play(getNextResource());
			});

			client.player.on(AudioPlayerStatus.Paused, () => {
				console.log('paused')
		});

			client.player.on(AudioPlayerStatus.Idle, () => {
				// Playing next song in queue if queue not empty
				console.log('idle')
				console.log(AudioPlayerStatus)
				if (client.queue.length > 0) { 
					let next = client.queue.shift()
					console.log('next is ' + next)
					handleRequest(next, message)
				}
		});

	  } catch (error) {
		console.error(error);
	  }
		
	}
	else {
		console.log("not a message")
		console.log(message.content)
		message.channel.send("Not a command!")
	}
  });

client.on(Events.InteractionCreate, async interaction => {
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