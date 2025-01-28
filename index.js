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
		console.error(`Error: ${error}`);
		client.player.play(getNextResource());
		// console.log("Queue is: " + client.queue)
		// const next = client.queue.shift(); // Get the next song from the queue
		// if (next) {
		// console.log("Next is: " + next)
		// handleRequest(next); // Play the next song
		// } else {
		// console.log('Queue is empty');
		// }
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

function addToBegginingOfQueue(item) {
	console.log(client.queue)
	client.queue.unshift(item)
	console.log(client.queue)
}

// Downloading song audio from YouTube
async function getYoutubeResource(url) {
	console.log("pls1 " + url)
	// stream = ytdl(url, {
	// 	filter: 'audio',
	//  })
	 //ytdl(url).pipe(require("fs").createWriteStream("video.mp4"));
	 await new Promise((resolve) => { // wait
		ytdl(url, {filter: 'audioonly'}).pipe(require("fs").createWriteStream("video.mp4"))
		.on('close', () => {
		  resolve(); // finish
		})
	  })

	// Get video info
// ytdl.getBasicInfo("http://www.youtube.com/watch?v=aqz-KE-bpKQ").then(info => {
// 	console.log(info.videoDetails.title);
//   });
  
  // Get video info with download formats
  //info = await ytdl.getInfo(url)
  console.log("pls2 ")
  //console.log(info.formats)
  //const audioItem = info.formats.find(info => info.mimeType === 'audio/mp4; codecs="mp4a.40.2"');
// console.log("audioItem " + audioItem.url)

//   console.log("items " + audioItem)
  test = 'https://rr2---sn-gvbxgn-tt1e7.googlevideo.com/videoplayback?expire=1736140280&ei=mBF7Z_q6ErjBlu8Pzu2M6Qo&ip=99.246.174.72&id=o-AATJGE5EFd6OEclWa2a1Pw5fE_saWyJHyIy4h59D4j_v&itag=140&source=youtube&requiressl=yes&xpc=EgVo2aDSNQ%3D%3D&met=1736118680%2C&mh=m2&mm=31%2C26&mn=sn-gvbxgn-tt1e7%2Csn-vgqsknse&ms=au%2Conr&mv=m&mvi=2&pcm2cms=yes&pl=18&rms=au%2Cau&gcr=ca&initcwndbps=4633750&bui=AfMhrI97d5Em0cOdyLKC3oAc9olAwJJ085XK4ZcK9NCLmWVxiKBfE010-qAFQHLNLmBub3cWZWkOuhTM&spc=x-caUBL6xgqaMFOYmN48hIdSPwlU53dZ1arL-5ZER6RGm8O7AHD10uqcEb8C&vprv=1&svpuc=1&mime=audio%2Fmp4&rqh=1&gir=yes&clen=3247302&dur=200.597&lmt=1728734922741583&mt=1736118291&fvip=2&keepalive=yes&fexp=51326932%2C51335594%2C51371294&c=IOS&txp=5532434&sparams=expire%2Cei%2Cip%2Cid%2Citag%2Csource%2Crequiressl%2Cxpc%2Cgcr%2Cbui%2Cspc%2Cvprv%2Csvpuc%2Cmime%2Crqh%2Cgir%2Cclen%2Cdur%2Clmt&sig=AJfQdSswRQIhAOG3xXcAvI5tsqUb2Ntk8QvkRmay3UFwmMCma_uGV3ZzAiBf2wJVLSyjsiUedJWjLIp6Iae9nTI6NGdeGeUu42INsQ%3D%3D&lsparams=met%2Cmh%2Cmm%2Cmn%2Cms%2Cmv%2Cmvi%2Cpcm2cms%2Cpl%2Crms%2Cinitcwndbps&lsig=AGluJ3MwRQIgUDr3yq28BlaNSvRK0LAU7ZHDfW6nC_n1eQSfr2Fv7J4CIQC9AgML_8Myj1pbNXCJg7t68FXnxXAVdjXMaj3dzD_Yng%3D%3D'
  //const audioItem = items.find(item => item.mimeType === 'audio/mp4; codecs="mp4a.40.2"');

	// console.log("stream " + audioItem)
	// console.log("pls2 " + audioItem)

	const resource = createAudioResource("./video.mp4")
	console.log("pls3")
	console.log("resource", resource)
	// console.log("resource.volume", resource.volume)
	// resource.volume.setVolume(0.75);
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
		console.log(results)
		if (results.status === 403) {
			console.error('Forbidden: Check your credentials or API key.');
			results.text().then(text => console.error(text));
		  }
		let link = results.results[0].link
		curSong = results.results[0].title;
		

		msgChannel.send(`Now playing: ${htmlDecode(curSong)}`).then((result) => {
			console.log(result)
			console.log("prevMsg", prevMsg)
			console.log("result.id", result.id)
			if(prevMsg == '') prevMsg = result.id
			else {
				console.log("channel", msgChannel)
				console.log("channel.messages", msgChannel.messages)
				msgChannel.messages.delete(prevMsg);
				prevMsg = result.id;
			}
			console.log("prevMsg 2", prevMsg)
		})

		//client.prevMsg = ''
		console.log("????")

		return getYoutubeResource(link)
	})
	.then(resource => {
		console.log("WHY")
		playSong(resource)
		console.log("WHY2")
	})	
	.catch( err => console.log("heyyyy" + err));

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
		console.log("?")
		player.play(resource);
		console.log("?!")
		connection.subscribe(player);
		console.log("?!!")
	} catch (error) {
		console.log('yup')
		console.error(error);
	  }
}

function handleRequest(query) {
	if (query.startsWith('https://www.youtube.com/')) {
			// Playing a YouTube song
			resource = getYoutubeResource(query)
			playSong(resource)
		
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
				searchYoutube(data.items[0].track.name + ' ' + data.items[0].track.artists[0].name)

				// Add the rest of the playlist to the queue
				for (let i = 1; i < data.items.length; i++) {
					//console.log("Adding to queue from playlist: " + data.items[i].track.name + ' ' + data.items[i].track.artists[0].name)
					addToQueue(data.items[i].track.name + ' ' + data.items[i].track.artists[0].name)
				}
				//console.log("current queue: [" + client.queue + "]") 
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
	console.log(message)
	
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

	else if (message.content.startsWith('!qn')) {
		const query = message.content.slice(4);
		if(query == '') { 
			// Preview queue
			embed = queueEmbed()
			message.channel.send({ embeds: [embed] });

		}else { 
			// Add to queue
			addToBegginingOfQueue(query)
			message.reply(`Added to queue`);
		}
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

		handleRequest(query)

	//   	try {

	// 		client.player.on('error', error => {
	// 			console.error(`Error: ${error}`);
	// 			client.player.play(getNextResource());
	// 		});

	// 		client.player.on(AudioPlayerStatus.Paused, () => {
	// 			console.log('paused')
	// 	});

	// 		client.player.on(AudioPlayerStatus.Idle, () => {
	// 			// Playing next song in queue if queue not empty
	// 			console.log('idle')
	// 			console.log(AudioPlayerStatus)
	// 			if (client.queue.length > 0) { 
	// 				let next = client.queue.shift()
	// 				console.log('next is ' + next)
	// 				handleRequest(next, message)
	// 			}
	// 	});

	//   } catch (error) {
	// 	console.error(error);
	//   }
		
	}
	else if (message.content.startsWith('!playp')) {
		const query = message.content.slice(7);
		let test = 'https://open.spotify.com/playlist/5LFX7CQ59WmhXeHSSGIrXK?si=d0986224585f4378'
		if (query == "test") {
			handleRequest(test)
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
//client.login(process.env.TOKEN);
client.login(process.env.TOKEN);
