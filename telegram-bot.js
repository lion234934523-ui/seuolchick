// ============================================================================
// SEOUL CHICK — TELEGRAM BOT & WEB SERVER (ALL-IN-ONE)
// ============================================================================
// Ushbu skript saytni va Telegram Botni bitta buyruq orqali ishga tushiradi.
// Hech qanday qo'shimcha npm kutubxona kerak emas (Built-in Node.js).
// ============================================================================

const http = require('http');
const https = require('https');
const fs = require('fs');
const path = require('path');

// Konfiguratsiyani yuklash
const CONFIG_FILE = path.join(__dirname, 'bot-config.json');
let config = {
  botToken: "",
  adminChatId: "",
  webAppUrl: "http://localhost:3000",
  port: 3000
};

if (fs.existsSync(CONFIG_FILE)) {
  try {
    const raw = fs.readFileSync(CONFIG_FILE, 'utf8');
    config = { ...config, ...JSON.parse(raw) };
  } catch(e) {
    console.error("Config o'qishda xatolik:", e.message);
  }
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.webp': 'image/webp',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.ttf': 'font/ttf'
};

// 1. TELEGRAM BOT API HELPER (Native Fetch)
async function callTelegramApi(method, body = {}) {
  if (!config.botToken) {
    console.warn("⚠️ Bot Token kiritilmagan. bot-config.json fayliga tokenni kiriting.");
    return null;
  }
  const url = `https://api.telegram.org/bot${config.botToken}/${method}`;
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch(err) {
    console.error(`Telegram API (${method}) xatolik:`, err.message);
    return null;
  }
}

// Telegramga admin xabar yuborish
async function notifyAdminInTelegram(messageText, extraParams = {}) {
  if (!config.adminChatId) {
    console.warn("⚠️ Admin Chat ID kiritilmagan. bot-config.json ga adminChatId kiriting.");
    return;
  }
  return callTelegramApi('sendMessage', {
    chat_id: config.adminChatId,
    text: messageText,
    parse_mode: 'HTML',
    ...extraParams
  });
}

// 2. BOT INIT & MENU BUTTON SOZLAMALARI
async function initTelegramBot() {
  if (!config.botToken) {
    console.log("ℹ️ Telegram Bot Token topilmadi. Faqat Web Server ishlamoqda.");
    return;
  }

  const me = await callTelegramApi('getMe');
  if (me && me.ok) {
    console.log(`🤖 Telegram Bot ulandi: @${me.result.username} (${me.result.first_name})`);

    // Pastki Menu tugmasini (Mini App) o'rnatish
    if (config.webAppUrl && config.webAppUrl.startsWith('https://')) {
      const menuRes = await callTelegramApi('setChatMenuButton', {
        menu_button: {
          type: 'web_app',
          text: '🍗 Buyurtma berish',
          web_app: { url: config.webAppUrl }
        }
      });
      if (menuRes && menuRes.ok) {
        console.log("✅ Telegram pastki 'Buyurtma berish' Menu tugmasi muvaffaqiyatli bog'landi!");
      }
    }

    startLongPolling();
  } else {
    console.error("❌ Telegram Bot Token noto'g'ri yoki Telegramga ulanib bo'lmadi:", me);
  }
}

// 3. TELEGRAM BOT POLLING (XABARLARNI QABUL QILISH)
let lastUpdateId = 0;
async function startLongPolling() {
  while (true) {
    try {
      const updates = await callTelegramApi('getUpdates', {
        offset: lastUpdateId + 1,
        timeout: 25
      });

      if (updates && updates.ok && Array.isArray(updates.result)) {
        for (const update of updates.result) {
          lastUpdateId = update.update_id;
          handleTelegramUpdate(update);
        }
      }
    } catch(e) {
      console.warn("Polling xatosi, 3 soniyadan keyin qayta uriniladi:", e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

// Xabarlarni boshqarish (/start va web_app_data)
async function handleTelegramUpdate(update) {
  if (!update.message) return;
  const msg = update.message;
  const chatId = msg.chat.id;
  const text = msg.text || '';
  const fromUser = msg.from;

  console.log(`📩 Xabar [${chatId}] (@${fromUser.username || fromUser.first_name}): ${text}`);

  // Adminni avtomatik aniqlash va bog'lash (@Jacob_media yoki birinchi kirgan admin)
  const isJacobMedia = fromUser.username && fromUser.username.toLowerCase() === 'jacob_media';
  if ((isJacobMedia || !config.adminChatId) && config.adminChatId !== String(chatId)) {
    config.adminChatId = String(chatId);
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2), 'utf8');
    console.log(`👑 ADMIN MUVAFFAQIYATLI BOG'LANDI! Chat ID: ${chatId} (@${fromUser.username})`);
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: `👑 <b>Assalomu alaykum, Admin (@${fromUser.username || fromUser.first_name})!</b>\n\nSiz <b>«SEOUL CHICK»</b> botiga bosh administrator sifatida muvaffaqiyatli ulandingiz!\nEndi mijozlar Mini App orqali bergan barcha buyurtmalar darhol shu yerga kelib tushadi.`,
      parse_mode: 'HTML'
    });
  }

  // /admin komandasi
  if (text.startsWith('/admin')) {
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: `💬 Admin / Texnik yordam: @Jacob_media\n📍 Manzil: Toshkent, Yahyo G'ulomov ko'chasi (Amir Temur)`,
      parse_mode: 'HTML'
    });
    return;
  }

  // Telegram Mini App (web_app_data) orqali kelgan buyurtmani qabul qilish
  if (msg.web_app_data) {
    try {
      const order = JSON.parse(msg.web_app_data.data);
      console.log("⚡ WebApp dan buyurtma ma'lumoti keldi:", order.orderNum);
      let adminNotice = `⚡ <b>YANGI BUYURTMA #${order.orderNum}</b>\n\n`;
      adminNotice += `👤 <b>Mijoz:</b> ${order.name}\n`;
      adminNotice += `📞 <b>Telefon:</b> ${order.phone}\n`;
      if (order.tgUsername) adminNotice += `✈️ <b>Telegram:</b> @${order.tgUsername}\n`;
      if (order.locationUrl) adminNotice += `🗺️ <b>Xarita:</b> <a href="${order.locationUrl}">Lokatsiyani ko'rish</a>\n`;
      adminNotice += `\n<pre>${order.receipt || ''}</pre>`;

      if (config.adminChatId) {
        await notifyAdminInTelegram(adminNotice);
      }
      // Mijozga tasdiq xabari
      await callTelegramApi('sendMessage', {
        chat_id: chatId,
        text: `✅ <b>Rahmat! Buyurtmangiz qabul qilindi (#${order.orderNum}).</b>\n\nTez orada operatorimiz siz bilan bog'lanadi.\nSavollar bo'lsa: @Jacob_media`,
        parse_mode: 'HTML'
      });
      return;
    } catch(e) {
      console.warn("web_app_data parsing xatosi:", e.message);
    }
  }

  // /start komandasi
  if (text.startsWith('/start')) {
    const welcomeHtml = `
🍗 <b>Assalomu alaykum, ${fromUser.first_name}!</b>

<b>«SEOUL CHICK»</b> — Toshkentdagi haqiqiy koreyscha qarsildoq tovuq va stritfud yetkazib berish xizmatining rasmiy Mini App botiga xush kelibsiz!

👇 Pastdagi <b>«🍴 Menyu / Buyurtma berish»</b> tugmasini bosib, taomnoma bilan tanishing va buyurtma bering:
    `.trim();

    const replyMarkup = config.webAppUrl && config.webAppUrl.startsWith('https://') ? {
      inline_keyboard: [
        [
          { text: "🍗 Menyu va Buyurtma berish", web_app: { url: config.webAppUrl } }
        ],
        [
          { text: "📞 Aloqa / Admin", url: "https://t.me/Jacob_media" },
          { text: "📍 Amir Temur filiali", url: "https://maps.google.com/?q=41.3111,69.2797" }
        ]
      ]
    } : {
      inline_keyboard: [
        [
          { text: "💬 Admin bilan bog'lanish", url: "https://t.me/Jacob_media" }
        ]
      ]
    };

    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: welcomeHtml,
      parse_mode: 'HTML',
      reply_markup: replyMarkup
    });
    return;
  }

  // /myid komandasi (o'z chat_id sini bilish uchun)
  if (text === '/myid' || text === '/id') {
    await callTelegramApi('sendMessage', {
      chat_id: chatId,
      text: `🆔 Sizning Telegram Chat ID: <code>${chatId}</code>\nUshbu ID ni <code>bot-config.json</code> faylidagi <code>adminChatId</code> qatoriga qo'ying.`,
      parse_mode: 'HTML'
    });
    return;
  }
}

// 4. HTTP WEB SERVER & API
const server = http.createServer(async (req, res) => {
  // CORS Headers
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(204);
    res.end();
    return;
  }

  // API: YANGI BUYURTMANI TELEGRAMGA YUBORISH
  if (req.method === 'POST' && req.url === '/api/order') {
    let body = '';
    req.on('data', chunk => { body += chunk; });
    req.on('end', async () => {
      try {
        const orderData = JSON.parse(body);
        console.log("⚡ Yangi buyurtma kelib tushdi:", orderData.orderNum);

        // Telegramga jo'natiladigan formatlangan matn
        let tgMsg = `⚡ <b>YANGI BUYURTMA #${orderData.orderNum || 'SC'}</b>\n`;
        tgMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
        tgMsg += `👤 <b>Mijoz:</b> ${orderData.name || 'Noma\'lum'}\n`;
        tgMsg += `📞 <b>Telefon:</b> ${orderData.phone || 'Noma\'lum'}\n`;
        if (orderData.tgUsername) tgMsg += `✈️ <b>Telegram:</b> @${orderData.tgUsername}\n`;
        tgMsg += `🚚 <b>Turi:</b> ${orderData.orderType === 'delivery' ? 'Yetkazib berish (Dostavka)' : 'Olib ketish'}\n`;
        tgMsg += `📍 <b>Manzil:</b> ${orderData.address || '-'}\n`;
        if (orderData.locationUrl) {
          tgMsg += `🗺️ <b>Xarita:</b> <a href="${orderData.locationUrl}">Lokatsiyani ochish</a>\n`;
        }
        if (orderData.comment) tgMsg += `💬 <b>Izoh:</b> ${orderData.comment}\n`;
        tgMsg += `💳 <b>To'lov turi:</b> ${orderData.payType || 'Naqd'}\n`;
        tgMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
        tgMsg += `📋 <b>TARKIBI:</b>\n`;

        if (Array.isArray(orderData.items)) {
          orderData.items.forEach(it => {
            const sum = ((it.price || 0) * (it.qty || 1)).toLocaleString('ru-RU');
            tgMsg += `• <b>${it.name}</b> x ${it.qty || 1} dona — ${sum} UZS\n`;
            if (it.variantName) tgMsg += `   <i>Porsiya: ${it.variantName}</i>\n`;
            if (it.sauce) tgMsg += `   <i>Sous: ${it.sauce}</i>\n`;
          });
        }

        tgMsg += `━━━━━━━━━━━━━━━━━━━━\n`;
        tgMsg += `💰 <b>JAMI: ${(orderData.totalPrice || 0).toLocaleString('ru-RU')} UZS</b>\n`;

        // Admin telegramiga yuborish
        await notifyAdminInTelegram(tgMsg);

        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: true, message: "Buyurtma qabul qilindi va adminga yuborildi!" }));
      } catch(err) {
        console.error("Order API error:", err);
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ ok: false, error: err.message }));
      }
    });
    return;
  }

  // STATIK FAYLLARNI BERISH (index.html, admin.html, assets, js)
  let reqUrl = decodeURI(req.url.split('?')[0]);
  if (reqUrl === '/' || reqUrl === '') reqUrl = '/index.html';

  let filePath = path.join(__dirname, reqUrl);
  if (!filePath.startsWith(__dirname)) {
    res.writeHead(403);
    res.end('Forbidden');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/html; charset=utf-8' });
      res.end(`<h1>404 Not Found</h1><p>Fayl topilmadi: ${reqUrl}</p>`);
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    res.writeHead(200, { 'Content-Type': contentType });
    fs.createReadStream(filePath).pipe(res);
  });
});

const PORT = config.port || 3000;
server.listen(PORT, () => {
  console.log(`====================================================`);
  console.log(`🚀 SEOUL CHICK SERVER IS RUNNING ON PORT ${PORT}!`);
  console.log(`📍 Web Sayt:     http://localhost:${PORT}`);
  console.log(`🔐 Admin Panel: http://localhost:${PORT}/admin.html (PIN: 0997)`);
  console.log(`====================================================`);

  initTelegramBot();
});
