const ytdl = require("@distube/ytdl-core");
const search = require("youtube-search")
const fs = require('node:fs');
const path = require('node:path');
const { EmbedBuilder } = require('discord.js');
require("dotenv").config(); //to start process from .env file
const { joinVoiceChannel } = require('@discordjs/voice');
const { createAudioPlayer, NoSubscriberBehavior, createAudioResource, StreamType, AudioPlayerStatus } = require('@discordjs/voice');
const fetch = require('node-fetch');
const { Client, Events, Collection, GatewayIntentBits } = require('discord.js')
const { REST } = require('@discordjs/rest');

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

// Creating the player
client.player = createAudioPlayer();

// Creating song queue
client.queue = []

// Saving last play message to be deleted on new play
let prevMsg = ''


function htmlDecode (input) {
	// https://www.toptal.com/designers/htmlarrows/punctuation/figure-dash/
	return input.replace('&#38;', "&")
				.replace('&#60;', "<")
				.replace('&#62;', ">")
				.replace('&#43;;', "+")
				.replace('&#39;', "'");
  }

client.channelId = ''
client.guildId = ''
client.adapterCreator = ''
let msgChannel;


// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
});

try {

	client.player.on('error', error => {
		console.error(`AudioPlayer has errored: ${error}`);
		client.player.play(getNextResource());
	});

	client.player.on(AudioPlayerStatus.Paused, () => {
		console.log('AudioPlayer is paused now.')
});

	client.player.on(AudioPlayerStatus.Idle, () => {
		// Playing next song in queue if queue not empty
		console.log(`AudioPlayer idle now. AudioPlayerStatus: ${AudioPlayerStatus}`)
		if (client.queue.length > 0) { 
			console.log('Shifting queue.')
			next = client.queue.shift()
			console.log(`Next in the queue: ${next}`)
			handleRequest(next)
		}
});

} catch (error) {
	console.error(error);
}

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
		process.env.SPOTIFY_ACCESS_TOKEN = `${accessToken}`
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

// Prepending song to queue
function addToBegginingOfQueue(item) {
	client.queue.unshift(item)
}

// Downloading song audio from YouTube
async function getYoutubeResource(url) {
	filename = "song.mp4"
	console.log("Trying to download: " + url)
	 await new Promise((resolve) => { // Waiting for download to finish before continuing
		ytdl(url, {filter: 'audioonly'}).pipe(require("fs").createWriteStream(filename))
		.on('close', () => {
		  resolve(); // Has finished
		})
	  })
  	console.log(`Download has finished. File with name ${filename} created in the current directory.`)
	const resource = createAudioResource("./"+filename)
	console.log("Audio resource created.")
	return resource
}

// Function to get YouTube link for a given request
function searchYoutube(query) {

	var opts = {
		maxResults: 10,
		key: process.env.GOOGLE_KEY
	  };
	  
	  // Searching YouTube
	  search(query, opts)
	  .then(results => {
		console.log(`Results of querying YouTube with the query as ${query}: ${results}`)
		if (results.status === 403) {
			console.error('Forbidden: Check your credentials or API key.');
			results.text().then(text => console.error(text));
		  }
		
		// TODO: Be more defensive here
		let link = results.results[0].link
		curSong = results.results[0].title;
		
		// Send message to channel
		msgChannel.send(`Now playing: ${htmlDecode(curSong)}`).then((result) => {
			console.log(`Result of trying to send message: ${result}`)
			// Keeping track of the previous message the bot sent so we can delete later
			if(prevMsg == '') prevMsg = result.id
			else {
				// Delete the previous message the bot sent, so we don't spam the channel
				msgChannel.messages.delete(prevMsg);
				prevMsg = result.id;
			}
		})
		return getYoutubeResource(link)
	})
	.then(resource => {
		console.log("Retrieved resource from YouTube. Proceed to playSong")
		playSong(resource)
	})	
	.catch( err => console.log(`Error in searchYoutube: ${err}`));

}

// Function to play song given the resource needed
function playSong(resource) {

	const player = client.player

	// Bot join voice channel
	const connection = joinVoiceChannel({
		channelId: client.channelId ,
		guildId: client.guildId,
		adapterCreator: client.adapterCreator,
	});
	
	// Play song
	try{
		console.log("Playing the resource...")
		player.play(resource);
		console.log("Subscribing to the connection...")
		connection.subscribe(player);
	} catch (error) {
		console.log('There was an error trying to play the song.')
		console.error(error);
	  }
}

function handleRequest(query) {
	if (query.startsWith('https://www.youtube.com/')) {
			// Playing a YouTube song
			resource = getYoutubeResource(query)
			getYoutubeResource(query).then(resource => {
				playSong(resource)
			})
		} else if (query.startsWith('https://open.spotify.com/track/')) {
			// https://open.spotify.com/track/2mN6HgN5Cm4slbh35jiDOa?si=1a33bb929eb04840
			// Playing a song from Spotify (TODO)

		} else if (query.startsWith('https://open.spotify.com/playlist/')) {
			// https://open.spotify.com/playlist/1unCkH5i66vPZUI2ZA8R8H?si=5f29bd6644524455
			// Playing a Spotify playlist

			// Parsing link to get playlist id
			let playlistId = query.split('/').pop().split('?')[0];
			console.log(`Trying to play playlist id of: ${playlistId}`)
		 	getSpotifyTracksRetry(playlistId)
			.then(data => {
				// Play the first song in the playlist
				searchYoutube(data.items[0].track.name + ' ' + data.items[0].track.artists[0].name)

				// Add the rest of the playlist to the queue
				for (let i = 1; i < data.items.length; i++) {
					addToQueue(data.items[i].track.name + ' ' + data.items[i].track.artists[0].name)
				}
				// Shuffle playlist
				shuffleQueue(client.queue)
			})

		} else {
			// Have to search for song
			console.log("have to search youtube")
			searchYoutube(query)
		}

}

client.on(Events.MessageCreate, (message) => {

	
	if (!message || !message.content || message.content == '') {
		return
	}

	if(!message.content.startsWith('!')) {
		return
	}
	console.log(`Message: ${message}`)
	
	client.channelId = message.member.voice.channel.id
	client.guildId = message.member.voice.channel.guild.id
	client.adapterCreator = message.member.voice.channel.guild.voiceAdapterCreator
	msgChannel = message.channel

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
		desc += '!qn <YouTube link / Spotify song link / Spotify playlist link / name of song>\n'
		const helpEmbed = new EmbedBuilder()
		.setColor(0x0099FF)
		.setTitle('List of bot commands')
		.addFields(
			{ name: 'Play audio', value: '\n**Command: **`!p <YouTube link / Spotify song link / Spotify playlist link / name of song>.`\n **Example**: !p https://www.youtube.com/watch?v=JuYeHPFR3f0\n **Example**: !p Pokemon theme song\n **Example**: !p https://open.spotify.com/playlist/1unCkH5i66vPZUI2ZA8R8H?si=5f29bd6644524455' },
			{ name: 'Add to queue', value: '**Command: **`!q <YouTube link / Spotify song link / Spotify playlist link / name of song>.`\n **Example**: !q https://www.youtube.com/watch?v=JuYeHPFR3f0\n **Example**: !q Pokemon theme song\n **Example**: !q https://open.spotify.com/playlist/1unCkH5i66vPZUI2ZA8R8H?si=5f29bd6644524455' },
			{ name: 'Pause audio', value: '**Command: **`!pause`' },
			{ name: 'Unpause audio', value: '**Command: **`!unpause`' },
			{ name: 'Shuffle queue', value: '**Command: **`!shuffle`' },
			{ name: 'Queue next', value: '**Command: **`!qn <YouTube link / Spotify song link / Spotify playlist link / name of song>.`\n **Example**: !qn Pokemon theme song\n' },
		)
		return message.channel.send({ embeds: [helpEmbed] });
	}

	else if (message.content.startsWith('!skip')) {
		// Stopping player makes it idle which triggers next song
		console.log("Skip was asked for. Trying to stop...")
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

	else if (message.content.startsWith('!qn')) {
		const query = message.content.slice(4);
		console.log(`Parsed query: ${query}`)
		if(query == '') { 
			// Preview queue
			embed = queueEmbed()
			message.channel.send({ embeds: [embed] });

		}else { 
			// Add to beginning of queue
			addToBegginingOfQueue(query)
			message.reply(`Added to queue!`);
		}
	}

	else if (message.content.startsWith('!q')) {
		const query = message.content.slice(3);
		console.log(`Parsed query: ${query}`)

		if(query == '') { 
			// Preview queue
			embed = queueEmbed()
			message.channel.send({ embeds: [embed] });

		}else { 
			// Add to queue
			addToQueue(query)
			message.reply(`Added to the queue!`);
		}
	}

	else if (message.content.startsWith('!p')) {

		// Slicing song from command
		const query = message.content.slice(3);
		console.log(`Parsed query: ${query}`)

		if(query == '' || query == null) {
			console.log('Query was empty.')
			return
		}

		// Getting voice channel
	  	const voiceChannel = message.member.voice.channel;

		// Ensuring user is in the voice channel
	  	if (!voiceChannel) return message.channel.send('You need to be in a voice channel to play music!');
	  	console.log("Verified user is in the voice channel.")	

		handleRequest(query)
	}
	else if (message.content.startsWith('!playp')) {
		// TODO
		const query = message.content.slice(7);
		let test = 'https://open.spotify.com/playlist/5LFX7CQ59WmhXeHSSGIrXK?si=d0986224585f4378'
		if (query == "test") {
			handleRequest(test)
		}
	}
	else {
		console.log(`Was not a registered command: ${message.content}`)
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
