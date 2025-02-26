const mineflayer = require('mineflayer');
const fs = require('fs');

// baca settings.json
const settings = JSON.parse(fs.readFileSync('settings.json', 'utf8'));
const bots = new Map();
let botHistory = fs.existsSync('hsbot.json') ? JSON.parse(fs.readFileSync('hsbot.json', 'utf8')) : [];

// simpan history
function saveHistory() {
  fs.writeFileSync('hsbot.json', JSON.stringify(botHistory, null, 2));
}

// fungsi buat bikin bot
function createBot(username, port, version) {
  const bot = mineflayer.createBot({
    host: settings.server.ip,
    port: parseInt(port),
    username: username,
    password: settings["bot-account"].password || undefined,
    auth: settings["bot-account"].type,
    version: version
  });

  const botId = bots.size + 1;
  bots.set(username, bot);
  botHistory.push({ id: botId, username, createdAt: new Date().toISOString() });
  saveHistory();

  // auto reconnect
  bot.on('end', () => {
    console.log(`bot ${username} disconnected, reconnecting in ${settings.utils["auto-recconect-delay"] / 1000} seconds...`);
    bots.delete(username);
    setTimeout(() => createBot(username, port, version), settings.utils["auto-recconect-delay"]);
  });

  bot.on('kicked', (reason) => console.log(`bot ${username} kicked: ${reason}`));

  // auto auth
  if (settings.utils["auto-auth"].enabled) {
    bot.once('spawn', () => {
      console.log(`bot ${username} spawned`);
      setTimeout(() => {
        bot.chat(`/register ${settings.utils["auto-auth"].password} ${settings.utils["auto-auth"].password}`);
        setTimeout(() => bot.chat(`/login ${settings.utils["auto-auth"].password}`), 1000);
      }, 1000);
    });
  }

  // anti-afk
  if (settings.utils["anti-afk"].enabled) {
    bot.once('spawn', () => {
      setInterval(() => {
        bot.setControlState('jump', true);
        setTimeout(() => bot.setControlState('jump', false), 100);
        if (settings.utils["anti-afk"].sneak) {
          bot.setControlState('sneak', true);
          setTimeout(() => bot.setControlState('sneak', false), 100);
        }
      }, 5000);
    });
  }

  // chat messages (spam)
  if (settings.utils["chat-messages"].enabled) {
    let msgIndex = 0;
    bot.once('spawn', () => {
      setInterval(() => {
        const messages = settings.utils["chat-messages"].messages;
        if (messages.length > 0 && messages[msgIndex]) {
          bot.chat(messages[msgIndex]);
          if (settings.utils["chat-messages"].repeat) {
            msgIndex = (msgIndex + 1) % messages.length;
          }
        }
      }, settings.utils["chat-messages"]["repeat-delay"] * 1000);
    });
  }

  // chat log
  if (settings.utils["chat-log"]) {
    bot.on('chat', (username, message) => {
      if (username !== bot.username) {
        console.log(`[${username}]: ${message}`);
      }
    });
  }

  bot.on('error', (err) => console.log(`bot ${username} error: ${err}`));
}

// command via console
process.stdin.on('data', (data) => {
  const input = data.toString().trim();

  // tambah bot: /addbt "username" "port" "version"
  if (input.startsWith('/addbt ')) {
    const args = input.match(/"[^"]*"|[^\s"]+/g);
    if (args && args.length === 4) {
      const username = args[1].replace(/"/g, '');
      const port = args[2].replace(/"/g, '');
      const version = args[3].replace(/"/g, '');
      if (bots.has(username)) {
        console.log(`bot ${username} already exists`);
      } else {
        createBot(username, port, version);
        console.log(`added bot: ${username}`);
      }
    } else {
      console.log('wrong format! use: /addbt "username" "port" "version"');
    }
  }

  // kirim pesan: /msg "username bot" <pesan>
  else if (input.startsWith('/msg ')) {
    const args = input.match(/"[^"]*"|[^\s"]+/g);
    if (args && args.length >= 3) {
      const botUsername = args[1].replace(/"/g, '');
      const message = input.slice(input.indexOf(args[2])).replace(/"/g, '');
      const bot = bots.get(botUsername);
      if (bot) {
        bot.chat(message);
        console.log(`bot ${botUsername} executed: ${message}`);
      } else {
        console.log(`bot ${botUsername} not found`);
      }
    } else {
      console.log('wrong format! use: /msg "username bot" <message>');
    }
  }

  // stop bot tertentu: /stopbt "username bot"
  else if (input.startsWith('/stopbt ')) {
    const args = input.match(/"[^"]*"|[^\s"]+/g);
    if (args && args.length === 2) {
      const botUsername = args[1].replace(/"/g, '');
      const bot = bots.get(botUsername);
      if (bot) {
        bot.quit();
        bots.delete(botUsername);
        console.log(`stopped bot: ${botUsername}`);
      } else {
        console.log(`bot ${botUsername} not found`);
      }
    } else {
      console.log('wrong format! use: /stopbt "username bot"');
    }
  }

  // join bot ulang: /joinbt "username bot"
  else if (input.startsWith('/joinbt ')) {
    const args = input.match(/"[^"]*"|[^\s"]+/g);
    if (args && args.length === 2) {
      const botUsername = args[1].replace(/"/g, '');
      const bot = bots.get(botUsername);
      if (bot) {
        bot.quit(); // matiin dulu
        bots.delete(botUsername);
        setTimeout(() => {
          createBot(botUsername, settings.server.port.toString(), settings.server.version);
          console.log(`rejoining bot: ${botUsername}`);
        }, 1000); // delay 1 detik sebelum join lagi
      } else {
        console.log(`bot ${botUsername} not found`);
      }
    } else {
      console.log('wrong format! use: /joinbt "username bot"');
    }
  }

  // stop semua bot
  else if (input === '/stop') {
    bots.forEach(bot => bot.quit());
    process.exit();
    console.log('stopped all bots');
  }
});

console.log('bot ready! type /addbt "username" "port" "version" to add a bot');