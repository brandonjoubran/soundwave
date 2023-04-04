const ytdl = require('ytdl-core');
const search = require("youtube-search")
const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder } = require('discord.js');
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

function getNewSpotifyAccessToken() {
	const authString = Buffer.from(`${process.env.SPOTIFY_CLIENT_ID}:${process.env.SPOTIFY_CLIENT_SECRET}`).toString('base64');

	// Make a request to the Spotify API to get a new access token
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
		process.env.SPOTIFY_ACCESS_TOKEN = accessToken
		return true
	// Use the new access token to make requests to the Spotify API
	})
	.catch(error => {
		console.error(error);
	});

}

function getSpotifyTracks(playlistId) {
	// Make a request to the Spotify API
	console.log("2")
	return fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
		headers: {
		'Authorization': `Bearer ${process.env.SPOTIFY_ACCESS_TOKEN}`
		}
	})
	.then(response => {
		console.log("3")
		return response.json()}
		)
	.then(data => {
		console.log("4")
		return data
	})
}

function getSpotifyTracksRetry(playlistId) {
	console.log("1")
	return getSpotifyTracks(playlistId)
	.then(data => {
		if (data.error.status == 401) {
			console.log("5")
			return getNewSpotifyAccessToken()
			.then(status => {
				console.log("6")
				return getSpotifyTracks(playlistId)
			})
		}
		return data
	})
}

function addToQueue(item) {
	client.queue.push(item)
}

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
		message.channel.send(`Now playing: ${curSong}`);
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
	console.log("joined voice channel")
	console.log("is song currently played: " + player.state.status != 'playing')

	// Play song
	player.play(resource);
	connection.subscribe(player);
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

		 	getSpotifyTracksRetry(playlistId)
			.then(data => {
				console.log(data)

				// Play the first song in the playlist
				searchYoutube(data.items[0].track.name + ' ' + data.items[0].track.artists[0].name, message)

				// Add the rest of the playlist to the queue
				for (let i = 1; i < data.items.length; i++) {
					console.log("Adding to queue from playlist: " + data.items[i].track.name + ' ' + data.items[i].track.artists[0].name)
					addToQueue(data.items[i].track.name + ' ' + data.items[i].track.artists[0].name)
				}
				console.log("current queue: [" + client.queue + "]") 
			})

			// Make a request to the Spotify API
			/*fetch(`https://api.spotify.com/v1/playlists/${playlistId}/tracks`, {
				headers: {
				'Authorization': `Bearer ${process.env.SPOTIFY_ACCESS_TOKEN}`
				}
			})
			.then(response => {
				if (response.status === 401) {
					return getNewSpotifyAccessToken()
					.then(() => {
						
					})
					for (let i = 0; i < 3; i++) {

					}


				  // Access token has expired
				  console.log('Access token expired. Refreshing...');
				  return refreshAccessToken()
				  .then(newToken => fetchPlaylistTracks(playlistId)) 
				} else {
				return response.json();
			  }})
			.then(data => {
				console.log(data)

				// Play the first song in the playlist
				searchYoutube(data.items[0].track.name + ' ' + data.items[0].track.artists[0].name, message)

				// Add the rest of the playlist to the queue
				for (let i = 1; i < data.items.length; i++) {
					console.log("Adding to queue from playlist: " + data.items[i].track.name + ' ' + data.items[i].track.artists[0].name)
					addToQueue(data.items[i].track.name + ' ' + data.items[i].track.artists[0].name)
				}
				console.log("current queue: [" + client.queue + "]") 

			})
			.catch(error => {
				console.error(error);
			});*/


		} else {
			// Have to search for song
			searchYoutube(query, message)

		}

}

/*curl -X POST "https://accounts.spotify.com/api/token" \
     -H "Content-Type: application/x-www-form-urlencoded" \
     -d "grant_type=client_credentials&client_id=754d782c52814d73b97966fd328e803f&client_secret=e89722e302f54782b59669b2ae7f6309"
*/

client.on(Events.MessageCreate, (message) => {

	if (message.content.startsWith('!skip')) {
		// Stopping player makes it idle which triggers next song
		console.log("Trying to stop...")
		client.player.stop()
	}

	if (message.content.startsWith('!pause')) {
		console.log("Trying to stop...")
		client.player.pause()
	}

	if (message.content.startsWith('!q')) {
		const query = message.content.slice(3);
		if(query == '') { 
			// Preview queue
			let desc = ''
			client.queue.forEach((song, index) => {
				if(index > 24) {
					return
				}
				desc += `${index + 1}. ${song}\n`
			});
			const queueEmbed = new EmbedBuilder()
			.setColor(0x0099FF)
			.setTitle('Queue')
			.setDescription(desc)


			message.channel.send({ embeds: [queueEmbed] });

		}else { 
			// Add to queue
			addToQueue(query)
			message.channel.send(`Added to queue`);
		}
	}

	if (message.content.startsWith('!play') || message.content.startsWith('!p')) {

		// Slicing song from command
		const query = message.content.slice(6);
		console.log("sliced query: " + query)

		// Getting voice channel
	  	const voiceChannel = message.member.voice.channel;

		// Ensuring user is in the voice channel
	  	if (!voiceChannel) return message.channel.send('You need to be in a voice channel to play music!');
	  	console.log("verified user is in the voice channel")	

		handleRequest(query, message)

	  	try {

			/*client.player.on('error', error => {
				console.error(`Error: ${error}`);
				//client.player.play(getNextResource());
			});*/

			client.player.on(AudioPlayerStatus.Idle, () => {
				// Playing next song in queue if queue not empty
				if (client.queue.length > 0) { 
					let next = client.queue.shift()
					console.log('next is ' + next)
					handleRequest(next, message)
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
