// PURVIS Telegram Bot
const TelegramBot = require('node-telegram-bot-api');
const OpenAI = require('openai');

const TELEGRAM_TOKEN = process.env.TELEGRAM_BOT_TOKEN;
const OPENAI_KEY = process.env.OPENAI_API_KEY;

if (!TELEGRAM_TOKEN) {
  console.error('TELEGRAM_BOT_TOKEN required');
  process.exit(1);
}

const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });
const openai = new OpenAI({ apiKey: OPENAI_KEY });

const PURVIS_SYSTEM = `You are PURVIS - Kelvin's AI Operator. Handle business, legal, content, betting, plumbing, music, images, research. Be direct and powerful.`;

const userConversations = new Map();

bot.onText(/\/start/, (msg) => {
  bot.sendMessage(msg.chat.id, '🔥 PURVIS v11.0 ONLINE\n\nYour AI operator is ready. Just message me.');
});

bot.on('message', async (msg) => {
  if (msg.text?.startsWith('/')) return;
  const chatId = msg.chat.id;
  const userMessage = msg.text;
  if (!userMessage) return;
  
  try {
    if (!userConversations.has(chatId)) userConversations.set(chatId, []);
    const history = userConversations.get(chatId);
    history.push({ role: 'user', content: userMessage });
    if (history.length > 20) history.splice(0, history.length - 20);
    
    await bot.sendChatAction(chatId, 'typing');
    
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'system', content: PURVIS_SYSTEM }, ...history],
      max_tokens: 1500
    });
    
    const reply = completion.choices[0].message.content;
    history.push({ role: 'assistant', content: reply });
    await bot.sendMessage(chatId, reply);
  } catch (error) {
    await bot.sendMessage(chatId, `Error: ${error.message}`);
  }
});

console.log('PURVIS Telegram Bot running...');
