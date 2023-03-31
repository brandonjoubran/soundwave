const ytdl = require('ytdl-core');
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
client.player = new Player(client, {
	ytdlOptions: {
		quality: "highestaudio", 
		highWaterMark: 1 << 25,
	}
})

// When the client is ready, run this code (only once)
// We use 'c' for the event parameter to keep it separate from the already defined 'client'
client.once(Events.ClientReady, c => {
	console.log(`Ready! Logged in as ${c.user.tag}`);
});


client.on(Events.MessageCreate, (message) => {
	if (message.content.startsWith('!play')) {
		const query = message.content.slice(6);
		console.log("here2")
	  const voiceChannel = message.member.voice.channel;
	  if (!voiceChannel) return message.channel.send('You need to be in a voice channel to play music!');
	  console.log("here3")

	  /*const queue = client.player.createQueue(message.guild, {
		metadata: {
		  channel: message.channel
		}
	  });*/
	  
	  console.log("here4")
	  console.log(query)
	  try {
		const player = createAudioPlayer();

		const connection = joinVoiceChannel({
			channelId: message.member.voice.channel.id,
			guildId: message.member.voice.channel.guild.id,
			adapterCreator: message.member.voice.channel.guild.voiceAdapterCreator,
		});
		/*const stream = ytdl(query, {
			filter: "audioonly",
		  });
		const resource = createAudioResource(stream, {
			inputType: StreamType.Arbitrary,
		 });		//await queue.play('https://www.myinstants.com/media/sounds/baka.mp3');
		*/
		 console.log(player.state)
		 if (player.state.status == 'playing') {
			console.log("SONG ALREADY PLAYING")

		 }
		 player.on(AudioPlayerStatus.Idle, () => {
			console.log("idle")
			const stream = ytdl("https://www.youtube.com/watch?v=JuYeHPFR3f0", {
				filter: "audioonly",
			  });
			const resource = createAudioResource(stream, {
				inputType: StreamType.Arbitrary,
			 });
			player.play(resource);
			message.channel.send(`Now playing: `);
		});

		player.on(AudioPlayerStatus.Playing, () => {
			console.log("SONG ALREADY PLAYING 2")
			console.log("Add to queue...")
			return
		});
		console.log(AudioPlayerStatus.Playing)
		console.log(player.state)
		if (true) {
			const stream = ytdl(query, {
				filter: "audioonly",
				});
			const resource = createAudioResource(stream, {
				inputType: StreamType.Arbitrary,
				});
			player.play(resource);
			message.channel.send(`Now playing: `);
			connection.subscribe(player);
		}

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
