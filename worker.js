// Bot token - Replace with your actual bot token
// Made by @Elabcode
// Copyright 2025 Elabcode. All rights reserved.
// Deployed on Cloudflare Workers
// Version 7.0
const BOT_TOKEN = "7720878098:AAFoXGnIDIg-EAvVDeVPn714Vi_1QqZtX5w"; // Insert your bot token here

const API_ENDPOINTS = {
    TELEGRAM_API: `https://api.telegram.org/bot${BOT_TOKEN}`
};

// Bot configuration
const BOT_CONFIG = {
    ADMIN_ID: 8250489814, // Replace with your admin user ID
    WEBHOOK_URL: 'https://your-worker.your-subdomain.workers.dev', // ← REPLACE WITH YOUR ACTUAL WORKER URL
    CHANNEL_USERNAME: '@Elabcode', // Channel that users must join
    CHANNEL_ID: -1002135819634 // Replace with your channel ID (with -100 prefix)
};

// Star donation amounts
const STAR_AMOUNTS = [
    { label: '⭐ 1 Star', amount: 1 },
    { label: '⭐⭐⭐ 3 Stars', amount: 3 },
    { label: '⭐⭐⭐⭐⭐ 5 Stars', amount: 5 },
    { label: '⭐⭐⭐⭐⭐⭐⭐⭐⭐ 10 Stars', amount: 10 },
    { label: '⭐⭐⭐⭐⭐ 25 Stars', amount: 25 },
    { label: '⭐⭐⭐⭐⭐ 50 Stars', amount: 50 },
    { label: '⭐⭐⭐⭐⭐ 70 Stars', amount: 70 },
    { label: '💫 100 Stars', amount: 100 },
    { label: '✨ 250 Stars', amount: 250 },
    { label: '🌟 500 Stars', amount: 500 },
    { label: '💎 1000 Stars', amount: 1000 },
    { label: '🔥 5000 Stars', amount: 5000 },
    { label: '🚀 10000 Stars', amount: 10000 },
    { label: '🎯 100000 Stars', amount: 100000 }
];

// Mapping of chat types and effect IDs
const types = {
    1: { name: 'User', effect_id: '5107584321108051014' }, // 👍 Thumbs Up
    2: { name: 'Private Channel', effect_id: '5046589136895476101' }, // 💩 Poop
    3: { name: 'Private Group', effect_id: '5104858069142078462' }, // 👎 Thumbs Down
    4: { name: 'Public Channel', effect_id: '5104841245755180586' }, // 🔥 Fire
    5: { name: 'Public Group', effect_id: '5046509860389126442' }, // 🎉 Confetti
    6: { name: 'Bot', effect_id: '5046509860389126442' }, // 🎉 Confetti
    7: { name: 'Premium User', effect_id: '5046509860389126442' } // 🎉 Confetti
};

// Message effect ID for the /start command
const START_EFFECT_ID = "5104841245755180586"; // 🔥 Fire

// In-memory storage (in production, use a proper database)
let botStats = {
    totalUsers: 0,
    totalCommands: 0,
    totalDonations: 0,
    donationAmount: 0,
    lastUpdate: Date.now()
};

let donatedUsers = new Map();
let broadcastState = new Map(); // Track broadcast state for admin

function logError(message, data = null) {
    const timestamp = new Date().toISOString();
    const logMessage = `[${timestamp}] ${message}`;
    console.log(logMessage);
    if (data) {
        console.log(`[${timestamp}] Data: ${JSON.stringify(data, null, 2)}`);
    }
}

// Webhook setup functions
async function setWebhook() {
    try {
        const response = await fetch(`${API_ENDPOINTS.TELEGRAM_API}/setWebhook`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                url: BOT_CONFIG.WEBHOOK_URL,
                max_connections: 100,
                allowed_updates: ['message', 'callback_query', 'pre_checkout_query', 'chat_member', 'my_chat_member']
            })
        });
        
        const result = await response.json();
        logError('Webhook setup result:', result);
        return result;
    } catch (error) {
        logError('Webhook setup error:', error);
        return { ok: false, error: error.message };
    }
}

async function getWebhookInfo() {
    try {
        const response = await fetch(`${API_ENDPOINTS.TELEGRAM_API}/getWebhookInfo`);
        const result = await response.json();
        logError('Webhook info:', result);
        return result;
    } catch (error) {
        logError('Webhook info error:', error);
        return { ok: false, error: error.message };
    }
}

async function deleteWebhook() {
    try {
        const response = await fetch(`${API_ENDPOINTS.TELEGRAM_API}/deleteWebhook`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                drop_pending_updates: true
            })
        });
        
        const result = await response.json();
        logError('Webhook deleted:', result);
        return result;
    } catch (error) {
        logError('Webhook delete error:', error);
        return { ok: false, error: error.message };
    }
}

// Check if user is admin in channel
async function isUserAdminInChannel(userId) {
    try {
        const response = await fetch(`${API_ENDPOINTS.TELEGRAM_API}/getChatMember`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: BOT_CONFIG.CHANNEL_ID,
                user_id: userId
            })
        });
        
        const result = await response.json();
        if (result.ok) {
            const status = result.result.status;
            return ['creator', 'administrator'].includes(status);
        }
        return false;
    } catch (error) {
        logError('Error checking channel admin status:', error);
        return false;
    }
}

// Check if user joined channel
async function hasUserJoinedChannel(userId) {
    try {
        const response = await fetch(`${API_ENDPOINTS.TELEGRAM_API}/getChatMember`, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                chat_id: BOT_CONFIG.CHANNEL_ID,
                user_id: userId
            })
        });
        
        const result = await response.json();
        if (result.ok) {
            const status = result.result.status;
            return status !== 'left' && status !== 'kicked';
        }
        return false;
    } catch (error) {
        logError('Error checking channel membership:', error);
        return false;
    }
}

// Notify admin about donation
async function notifyAdminAboutDonation(donationDetails) {
    const adminId = BOT_CONFIG.ADMIN_ID;
    const notificationText = `🎉 <b>New Donation Received!</b>\n\n` +
                           `💫 <b>Donation Details:</b>\n` +
                           `• Amount: ${donationDetails.amount} ⭐ Stars\n` +
                           `• From: ${donationDetails.userName}\n` +
                           `• User ID: <code>${donationDetails.userId}</code>\n` +
                           `• Username: ${donationDetails.userUsername || 'No username'}\n` +
                           `• Transaction ID: <code>${donationDetails.transactionId}</code>\n` +
                           `• Date: ${new Date().toLocaleString()}\n\n` +
                           `💰 <b>Total Donations:</b>\n` +
                           `• This User: ${donationDetails.userTotal} ⭐\n` +
                           `• All Time: ${botStats.donationAmount} ⭐\n\n` +
                           `<blockquote>Thank you for the support! 🙏</blockquote>`;
    
    await sendHTMLMessage(BOT_TOKEN, adminId, notificationText, null, true);
}

function createInlineKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: 'ℹ️ About', callback_data: 'about' },
                { text: '🆘 Help', callback_data: 'help' },
                { text: '📢 Channel', url: 'https://t.me/Elabcode' }
            ],
            [
                { text: '⭐ Donate Stars', callback_data: 'donate_stars' }
            ]
        ]
    };
}

function createDonationKeyboard() {
    const keyboard = [];
    for (let i = 0; i < STAR_AMOUNTS.length; i += 2) {
        const row = [];
        row.push({ 
            text: STAR_AMOUNTS[i].label, 
            callback_data: `donate_${STAR_AMOUNTS[i].amount}` 
        });
        if (i + 1 < STAR_AMOUNTS.length) {
            row.push({ 
                text: STAR_AMOUNTS[i + 1].label, 
                callback_data: `donate_${STAR_AMOUNTS[i + 1].amount}` 
            });
        }
        keyboard.push(row);
    }
    keyboard.push([{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]);
    
    return { inline_keyboard: keyboard };
}

function createAdminKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '📢 Broadcast', callback_data: 'admin_broadcast' },
                { text: '📊 Bot Status', callback_data: 'admin_status' }
            ],
            [
                { text: '💰 Donated Users', callback_data: 'admin_donated' },
                { text: '⚙️ Settings', callback_data: 'admin_settings' }
            ],
            [
                { text: '🔙 Main Menu', callback_data: 'back_to_menu' }
            ]
        ]
    };
}

function createBroadcastKeyboard() {
    return {
        inline_keyboard: [
            [
                { text: '📌 Pin Broadcast', callback_data: 'broadcast_pin' },
                { text: '📤 Send Normally', callback_data: 'broadcast_normal' }
            ],
            [
                { text: '🔙 Admin Panel', callback_data: 'admin_panel' }
            ]
        ]
    };
}

async function sendInvoice(chatId, amount) {
    logError(`Sending invoice for ${amount} stars to chat: ${chatId}`);
    try {
        const response = await fetch(`${API_ENDPOINTS.TELEGRAM_API}/sendInvoice`, {
            method: 'POST', 
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ 
                chat_id: chatId,
                title: `Donate ${amount} Stars to Bot ✨`,
                description: `Support our bot development with ${amount} Telegram Stars! Every star helps us improve and maintain the bot. Thank you! 🌟`,
                payload: JSON.stringify({ amount: amount }),
                provider_token: "TEST", // Use actual provider token in production
                currency: 'XTR',
                prices: [{ label: `⭐ ${amount} Stars`, amount: amount * 100 }] // Amount in cents
            })
        });
        const data = await response.json();
        logError(`sendInvoice API response: ${JSON.stringify(data, null, 2)}`);
        if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
        return data;
    } catch (error) {
        logError(`sendInvoice error: ${error.message}`);
        await sendHTMLMessage(BOT_TOKEN, chatId, "*❌ Failed to send donation invoice.*\nPlease try again later.");
        return false;
    }
}

async function handlePreCheckout(query) {
    logError(`Handling pre-checkout query: ${query.id}`);
    try {
        const response = await fetch(`${API_ENDPOINTS.TELEGRAM_API}/answerPreCheckoutQuery`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                pre_checkout_query_id: query.id,
                ok: true
            })
        });
        const data = await response.json();
        if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
        
        return true;
    } catch (error) {
        logError(`handlePreCheckout error: ${error.message}`);
        return false;
    }
}

async function processRefund(chatId, userId, chargeId) {
    logError(`Processing refund for user: ${userId}, transaction: ${chargeId}`);
    try {
        const response = await fetch(`${API_ENDPOINTS.TELEGRAM_API}/refundStarPayment`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                telegram_payment_charge_id: chargeId
            })
        });
        const data = await response.json();
        logError(`Refund API response: ${JSON.stringify(data, null, 2)}`);
        if (!data.ok) throw new Error(`Telegram API error: ${data.description}`);
        await sendHTMLMessage(BOT_TOKEN, chatId, "Refund processed successfully ✅");
    } catch (error) {
        logError(`processRefund error: ${error.message}`);
        await sendHTMLMessage(BOT_TOKEN, chatId, "❌ Refund failed.\nPlease verify the details and retry.");
    }
}

// Function to edit message with inline keyboard
async function editMessage(token, chat_id, message_id, text, keyboard = null) {
    const url = `https://api.telegram.org/bot${token}/editMessageText`;
    const payload = {
        chat_id: chat_id,
        message_id: message_id,
        text: text,
        parse_mode: 'HTML'
    };
    
    if (keyboard) {
        payload.reply_markup = keyboard;
    }
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            logError(`HTTP error! status: ${response.status}`);
            return false;
        }
        
        const result = await response.json();
        if (!result.ok) {
            logError(`Telegram API error for edit message: ${JSON.stringify(result)}`);
            return false;
        }
        
        return true;
    } catch (error) {
        logError(`Failed to edit message: ${error.message}`);
        return false;
    }
}

// Function to answer callback query
async function answerCallbackQuery(token, callback_query_id, text = null, show_alert = false) {
    const url = `https://api.telegram.org/bot${token}/answerCallbackQuery`;
    const payload = {
        callback_query_id: callback_query_id
    };
    
    if (text) {
        payload.text = text;
    }
    if (show_alert) {
        payload.show_alert = show_alert;
    }
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        if (!response.ok) {
            logError(`HTTP error! status: ${response.status}`);
            return false;
        }
        
        const result = await response.json();
        if (!result.ok) {
            logError(`Telegram API error for answer callback: ${JSON.stringify(result)}`);
            return false;
        }
        
        return true;
    } catch (error) {
        logError(`Failed to answer callback query: ${error.message}`);
        return false;
    }
}

async function sendHTMLMessage(token, chat_id, text, keyboard = null, disable_link_preview = false, message_effect_id = null) {
    const url = `https://api.telegram.org/bot${token}/sendMessage`;
    const payload = {
        chat_id: chat_id,
        text: text,
        parse_mode: 'HTML'
    };
    
    if (keyboard) {
        payload.reply_markup = keyboard;
    }
    if (disable_link_preview) {
        payload.disable_web_page_preview = true;
    }
    if (message_effect_id) {
        payload.message_effect_id = message_effect_id;
    }
    
    logError(`Sending message payload: ${JSON.stringify(payload, null, 2)}`);
    
    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload)
        });
        
        const responseText = await response.text();
        logError(`Response status: ${response.status}, Response body: ${responseText}`);
        
        if (!response.ok) {
            logError(`HTTP error! status: ${response.status}, body: ${responseText}`);
            return false;
        }
        
        const result = JSON.parse(responseText);
        if (!result.ok) {
            logError(`Telegram API error for chat_id ${chat_id}: ${JSON.stringify(result)}`);
            return false;
        }
        
        logError(`Message sent successfully to chat_id ${chat_id}`);
        return result.result;
    } catch (error) {
        logError(`Failed to send message to chat_id ${chat_id}: ${error.message}`);
        return false;
    }
}

// Function to create the home page
function createHomePage() {
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Chat ID Finder - Telegram WebApp</title>
    <script src="https://telegram.org/js/telegram-web-app.js"></script>
    <style>
        * {
            margin: 0;
            padding: 0;
            box-sizing: border-box;
        }
        
        :root {
            --tg-theme-bg-color: #ffffff;
            --tg-theme-text-color: #000000;
            --tg-theme-hint-color: #999999;
            --tg-theme-link-color: #2481cc;
            --tg-theme-button-color: #2481cc;
            --tg-theme-button-text-color: #ffffff;
            --tg-theme-secondary-bg-color: #f1f1f1;
            --primary-gradient: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
            --card-shadow: 0 8px 32px rgba(0,0,0,0.1);
            --border-radius: 16px;
            --transition: all 0.3s cubic-bezier(0.4, 0, 0.2, 1);
        }
        
        body {
            font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Oxygen, Ubuntu, Cantarell, sans-serif;
            line-height: 1.6;
            color: var(--tg-theme-text-color);
            background: var(--tg-theme-bg-color);
            min-height: 100vh;
            overflow-x: hidden;
            transition: var(--transition);
        }
        
        .tg-theme-dark {
            --tg-theme-bg-color: #17212b;
            --tg-theme-text-color: #ffffff;
            --tg-theme-hint-color: #708499;
            --tg-theme-secondary-bg-color: #2b5278;
        }
        
        .container {
            max-width: 1200px;
            margin: 0 auto;
            padding: 16px;
            min-height: 100vh;
        }
        
        /* User Profile Section */
        .user-profile {
            background: var(--tg-theme-secondary-bg-color);
            border-radius: var(--border-radius);
            padding: 20px;
            margin-bottom: 24px;
            box-shadow: var(--card-shadow);
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
            transition: var(--transition);
        }
        
        .user-profile:hover {
            transform: translateY(-2px);
            box-shadow: 0 12px 40px rgba(0,0,0,0.15);
            animation: gentleGlow 2s ease-in-out infinite;
        }
        
        @keyframes gentleGlow {
            0%, 100% { box-shadow: 0 12px 40px rgba(0,0,0,0.15); }
            50% { box-shadow: 0 12px 40px rgba(102, 126, 234, 0.2); }
        }
        
        .user-info {
            display: flex;
            align-items: center;
            gap: 16px;
            margin-bottom: 16px;
        }
        
        .user-avatar {
            width: 60px;
            height: 60px;
            border-radius: 50%;
            background: var(--primary-gradient);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 24px;
            color: white;
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
            flex-shrink: 0;
        }
        
        .user-details h3 {
            font-size: 1.25rem;
            margin-bottom: 4px;
            color: var(--tg-theme-text-color);
        }
        
        .user-details p {
            color: var(--tg-theme-hint-color);
            font-size: 0.9rem;
        }
        
        .user-stats {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(120px, 1fr));
            gap: 12px;
            margin-top: 16px;
        }
        
        .stat-item {
            background: rgba(255,255,255,0.1);
            padding: 12px;
            border-radius: 8px;
            text-align: center;
            transition: var(--transition);
        }
        
        .stat-item:hover {
            background: rgba(255,255,255,0.2);
        }
        
        .stat-value {
            font-size: 1.1rem;
            font-weight: bold;
            color: var(--tg-theme-text-color);
        }
        
        .stat-label {
            font-size: 0.8rem;
            color: var(--tg-theme-hint-color);
            margin-top: 4px;
        }
        
        .header {
            text-align: center;
            padding: 32px 0;
            background: var(--primary-gradient);
            border-radius: var(--border-radius);
            margin-bottom: 24px;
            color: white;
            position: relative;
            overflow: hidden;
        }
        
        .header::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: linear-gradient(45deg, rgba(255,255,255,0.1) 0%, transparent 50%, rgba(255,255,255,0.1) 100%);
            animation: shimmer 3s infinite;
        }
        
        .header::after {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            bottom: 0;
            background: radial-gradient(circle at 50% 50%, rgba(255,255,255,0.1) 0%, transparent 70%);
            animation: pulse 4s ease-in-out infinite;
        }
        
        @keyframes shimmer {
            0% { transform: translateX(-100%); }
            100% { transform: translateX(100%); }
        }
        
        @keyframes pulse {
            0%, 100% { opacity: 0.3; transform: scale(1); }
            50% { opacity: 0.6; transform: scale(1.05); }
        }
        
        .header h1 {
            font-size: 2.5rem;
            margin-bottom: 12px;
            text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
            position: relative;
            z-index: 1;
        }
        
        .header p {
            font-size: 1.1rem;
            opacity: 0.95;
            position: relative;
            z-index: 1;
        }
        
        .bot-card {
            background: var(--tg-theme-bg-color);
            border-radius: var(--border-radius);
            padding: 32px;
            margin: 24px 0;
            box-shadow: var(--card-shadow);
            text-align: center;
            border: 1px solid rgba(255,255,255,0.1);
            transition: var(--transition);
            position: relative;
            overflow: hidden;
        }
        
        .bot-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
            transition: left 0.5s;
        }
        
        .bot-card:hover::before {
            left: 100%;
        }
        
        .bot-card:hover {
            transform: translateY(-4px);
            box-shadow: 0 16px 48px rgba(0,0,0,0.15);
        }
        
        .bot-avatar {
            width: 100px;
            height: 100px;
            border-radius: 50%;
            margin: 0 auto 20px;
            background: var(--primary-gradient);
            display: flex;
            align-items: center;
            justify-content: center;
            font-size: 2.5rem;
            color: white;
            box-shadow: 0 8px 24px rgba(0,0,0,0.2);
            transition: var(--transition);
            position: relative;
            z-index: 1;
        }
        
        .bot-avatar:hover {
            transform: scale(1.05) rotate(5deg);
            animation: wiggle 0.5s ease-in-out;
        }
        
        @keyframes wiggle {
            0%, 100% { transform: scale(1.05) rotate(5deg); }
            25% { transform: scale(1.05) rotate(-5deg); }
            50% { transform: scale(1.05) rotate(5deg); }
            75% { transform: scale(1.05) rotate(-3deg); }
        }
        
        .bot-name {
            font-size: 2rem;
            color: var(--tg-theme-text-color);
            margin-bottom: 12px;
            font-weight: 700;
            position: relative;
            z-index: 1;
        }
        
        .bot-description {
            font-size: 1rem;
            color: var(--tg-theme-hint-color);
            margin-bottom: 24px;
            max-width: 600px;
            margin-left: auto;
            margin-right: auto;
            line-height: 1.7;
            position: relative;
            z-index: 1;
        }
        
        .cta-button {
            display: inline-flex;
            align-items: center;
            gap: 8px;
            background: var(--tg-theme-button-color);
            color: var(--tg-theme-button-text-color);
            padding: 16px 32px;
            text-decoration: none;
            border-radius: 50px;
            font-size: 1rem;
            font-weight: 600;
            transition: var(--transition);
            box-shadow: 0 4px 16px rgba(36, 129, 204, 0.3);
            position: relative;
            z-index: 1;
            border: none;
            cursor: pointer;
        }
        
        .cta-button:hover {
            transform: translateY(-2px);
            box-shadow: 0 8px 24px rgba(36, 129, 204, 0.4);
            background: #1a6bb8;
            animation: buttonPulse 1.5s ease-in-out infinite;
        }
        
        .cta-button:active {
            transform: translateY(0) scale(0.98);
            animation: none;
        }
        
        @keyframes buttonPulse {
            0%, 100% { box-shadow: 0 8px 24px rgba(36, 129, 204, 0.4); }
            50% { box-shadow: 0 8px 24px rgba(36, 129, 204, 0.6), 0 0 20px rgba(36, 129, 204, 0.3); }
        }
        
        .features-section {
            background: var(--tg-theme-bg-color);
            border-radius: var(--border-radius);
            padding: 32px;
            margin: 24px 0;
            box-shadow: var(--card-shadow);
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .section-title {
            text-align: center;
            font-size: 2rem;
            color: var(--tg-theme-text-color);
            margin-bottom: 32px;
            font-weight: 700;
            position: relative;
        }
        
        .section-title::after {
            content: '';
            position: absolute;
            bottom: -8px;
            left: 50%;
            transform: translateX(-50%);
            width: 60px;
            height: 3px;
            background: var(--primary-gradient);
            border-radius: 2px;
        }
        
        .features-grid {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 24px;
            margin-top: 32px;
        }
        
        .feature-card {
            background: var(--tg-theme-secondary-bg-color);
            padding: 24px;
            border-radius: 12px;
            text-align: center;
            transition: var(--transition);
            border: 1px solid rgba(255,255,255,0.1);
            position: relative;
            overflow: hidden;
        }
        
        .feature-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 3px;
            background: var(--primary-gradient);
            transform: scaleX(0);
            transition: transform 0.3s ease;
        }
        
        .feature-card:hover::before {
            transform: scaleX(1);
        }
        
        .feature-card:hover {
            transform: translateY(-6px);
            box-shadow: 0 12px 32px rgba(0,0,0,0.15);
            border-color: var(--tg-theme-button-color);
        }
        
        .feature-icon {
            font-size: 2.5rem;
            margin-bottom: 16px;
            display: block;
            transition: var(--transition);
        }
        
        .feature-card:hover .feature-icon {
            transform: scale(1.1) rotate(5deg);
            animation: bounce 0.6s ease;
        }
        
        @keyframes bounce {
            0%, 20%, 50%, 80%, 100% { transform: scale(1.1) rotate(5deg) translateY(0); }
            40% { transform: scale(1.1) rotate(5deg) translateY(-10px); }
            60% { transform: scale(1.1) rotate(5deg) translateY(-5px); }
        }
        
        .feature-title {
            font-size: 1.2rem;
            color: var(--tg-theme-text-color);
            margin-bottom: 12px;
            font-weight: 600;
        }
        
        .feature-description {
            color: var(--tg-theme-hint-color);
            line-height: 1.6;
            font-size: 0.95rem;
        }
        
        .commands-section {
            background: var(--tg-theme-bg-color);
            border-radius: var(--border-radius);
            padding: 32px;
            margin: 24px 0;
            box-shadow: var(--card-shadow);
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .command-list {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
            gap: 16px;
            margin-top: 24px;
        }
        
        .command-item {
            background: var(--tg-theme-secondary-bg-color);
            padding: 20px;
            border-radius: 12px;
            border-left: 4px solid var(--tg-theme-button-color);
            transition: var(--transition);
            position: relative;
            overflow: hidden;
        }
        
        .command-item::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            width: 4px;
            height: 100%;
            background: var(--primary-gradient);
            transform: scaleY(0);
            transition: transform 0.3s ease;
        }
        
        .command-item:hover::before {
            transform: scaleY(1);
        }
        
        .command-item:hover {
            transform: translateX(4px);
            box-shadow: 0 8px 24px rgba(0,0,0,0.1);
        }
        
        .command-name {
            font-weight: 600;
            color: var(--tg-theme-button-color);
            margin-bottom: 8px;
            font-size: 1rem;
        }
        
        .command-description {
            color: var(--tg-theme-hint-color);
            font-size: 0.9rem;
            line-height: 1.5;
        }
        
        /* Privacy Policy Section */
        .privacy-section {
            background: var(--tg-theme-bg-color);
            border-radius: var(--border-radius);
            padding: 32px;
            margin: 24px 0;
            box-shadow: var(--card-shadow);
            border: 1px solid rgba(255,255,255,0.1);
            position: relative;
            overflow: hidden;
        }
        
        .privacy-section::before {
            content: '';
            position: absolute;
            top: 0;
            left: 0;
            right: 0;
            height: 4px;
            background: linear-gradient(90deg, #667eea, #764ba2, #f093fb, #f5576c);
            background-size: 300% 100%;
            animation: gradientShift 3s ease infinite;
        }
        
        @keyframes gradientShift {
            0%, 100% { background-position: 0% 50%; }
            50% { background-position: 100% 50%; }
        }
        
        .privacy-content {
            display: grid;
            grid-template-columns: repeat(auto-fit, minmax(300px, 1fr));
            gap: 24px;
            margin-top: 32px;
        }
        
        .privacy-card {
            background: var(--tg-theme-secondary-bg-color);
            padding: 24px;
            border-radius: 16px;
            text-align: center;
            transition: var(--transition);
            border: 1px solid rgba(255,255,255,0.1);
            position: relative;
            overflow: hidden;
        }
        
        .privacy-card::before {
            content: '';
            position: absolute;
            top: 0;
            left: -100%;
            width: 100%;
            height: 100%;
            background: linear-gradient(90deg, transparent, rgba(255,255,255,0.1), transparent);
            transition: left 0.6s ease;
        }
        
        .privacy-card:hover::before {
            left: 100%;
        }
        
        .privacy-card:hover {
            transform: translateY(-8px) scale(1.02);
            box-shadow: 0 16px 40px rgba(0,0,0,0.2);
            border-color: var(--tg-theme-button-color);
        }
        
        .privacy-icon {
            font-size: 3rem;
            margin-bottom: 16px;
            display: block;
            animation: float 3s ease-in-out infinite;
        }
        
        .privacy-card:nth-child(2) .privacy-icon {
            animation-delay: 0.5s;
        }
        
        .privacy-card:nth-child(3) .privacy-icon {
            animation-delay: 1s;
        }
        
        @keyframes float {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-10px); }
        }
        
        .privacy-card h3 {
            font-size: 1.3rem;
            color: var(--tg-theme-text-color);
            margin-bottom: 12px;
            font-weight: 600;
        }
        
        .privacy-card p {
            color: var(--tg-theme-hint-color);
            line-height: 1.6;
            font-size: 0.95rem;
        }
        
        .footer {
            background: var(--tg-theme-secondary-bg-color);
            color: var(--tg-theme-text-color);
            text-align: center;
            padding: 32px;
            border-radius: var(--border-radius);
            margin-top: 32px;
            backdrop-filter: blur(10px);
            border: 1px solid rgba(255,255,255,0.1);
        }
        
        .creator-info {
            margin-bottom: 24px;
        }
        
        .creator-name {
            font-size: 1.2rem;
            font-weight: 600;
            margin-bottom: 8px;
            color: var(--tg-theme-text-color);
        }
        
        .social-links {
            display: flex;
            justify-content: center;
            gap: 16px;
            margin-top: 20px;
            flex-wrap: wrap;
        }
        
        .social-link {
            color: var(--tg-theme-text-color);
            text-decoration: none;
            padding: 12px 20px;
            border-radius: 25px;
            background: rgba(255,255,255,0.1);
            transition: var(--transition);
            font-size: 0.9rem;
            font-weight: 500;
            border: 1px solid rgba(255,255,255,0.2);
        }
        
        .social-link:hover {
            background: var(--tg-theme-button-color);
            color: var(--tg-theme-button-text-color);
            transform: translateY(-2px);
            box-shadow: 0 4px 12px rgba(0,0,0,0.2);
        }
        
        /* Loading Animation */
        .loading {
            display: inline-block;
            width: 20px;
            height: 20px;
            border: 3px solid rgba(255,255,255,0.3);
            border-radius: 50%;
            border-top-color: var(--tg-theme-button-color);
            animation: spin 1s ease-in-out infinite;
        }
        
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        
        /* Smooth scrolling */
        html {
            scroll-behavior: smooth;
        }
        
        /* Fade in up animation */
        .fade-in-up {
            animation: fadeInUp 0.6s ease-out forwards;
        }
        
        @keyframes fadeInUp {
            from {
                opacity: 0;
                transform: translateY(30px);
            }
            to {
                opacity: 1;
                transform: translateY(0);
            }
        }
        
        /* Enhanced loading states */
        .loading-shimmer {
            background: linear-gradient(90deg, 
                var(--tg-theme-secondary-bg-color) 25%, 
                rgba(255,255,255,0.1) 50%, 
                var(--tg-theme-secondary-bg-color) 75%);
            background-size: 200% 100%;
            animation: shimmer 1.5s infinite;
        }
        
        /* Parallax effect for header */
        .header {
            background-attachment: fixed;
            background-size: cover;
            background-position: center;
        }
        
        /* Enhanced focus states for accessibility */
        .cta-button:focus,
        .fab:focus,
        .toggle-switch:focus {
            outline: 2px solid var(--tg-theme-button-color);
            outline-offset: 2px;
        }
        
        /* Smooth transitions for all interactive elements */
        * {
            transition: transform 0.3s ease, box-shadow 0.3s ease, opacity 0.3s ease;
        }
        
        /* Settings Panel */
        .settings-panel {
            position: fixed;
            top: 0;
            right: -400px;
            width: 400px;
            height: 100vh;
            background: var(--tg-theme-bg-color);
            box-shadow: -4px 0 20px rgba(0,0,0,0.2);
            transition: right 0.3s ease;
            z-index: 1000;
            padding: 24px;
            overflow-y: auto;
        }
        
        .settings-panel.open {
            right: 0;
        }
        
        .settings-header {
            display: flex;
            justify-content: space-between;
            align-items: center;
            margin-bottom: 24px;
            padding-bottom: 16px;
            border-bottom: 1px solid var(--tg-theme-hint-color);
        }
        
        .settings-title {
            font-size: 1.5rem;
            font-weight: 600;
            color: var(--tg-theme-text-color);
        }
        
        .close-settings {
            background: none;
            border: none;
            font-size: 1.5rem;
            color: var(--tg-theme-hint-color);
            cursor: pointer;
            padding: 8px;
            border-radius: 50%;
            transition: var(--transition);
        }
        
        .close-settings:hover {
            background: var(--tg-theme-secondary-bg-color);
            color: var(--tg-theme-text-color);
        }
        
        .setting-item {
            display: flex;
            justify-content: space-between;
            align-items: center;
            padding: 16px 0;
            border-bottom: 1px solid rgba(255,255,255,0.1);
        }
        
        .setting-label {
            color: var(--tg-theme-text-color);
            font-weight: 500;
        }
        
        .toggle-switch {
            position: relative;
            width: 50px;
            height: 24px;
            background: var(--tg-theme-hint-color);
            border-radius: 12px;
            cursor: pointer;
            transition: var(--transition);
        }
        
        .toggle-switch.active {
            background: var(--tg-theme-button-color);
        }
        
        .toggle-switch::before {
            content: '';
            position: absolute;
            top: 2px;
            left: 2px;
            width: 20px;
            height: 20px;
            background: white;
            border-radius: 50%;
            transition: var(--transition);
        }
        
        .toggle-switch.active::before {
            transform: translateX(26px);
        }
        
        .overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background: rgba(0,0,0,0.5);
            z-index: 999;
            opacity: 0;
            visibility: hidden;
            transition: var(--transition);
        }
        
        .overlay.show {
            opacity: 1;
            visibility: visible;
        }
        
        /* Floating Action Button */
        .fab {
            position: fixed;
            bottom: 24px;
            right: 24px;
            width: 56px;
            height: 56px;
            background: var(--tg-theme-button-color);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            color: white;
            font-size: 1.5rem;
            cursor: pointer;
            box-shadow: 0 4px 16px rgba(0,0,0,0.2);
            transition: var(--transition);
            z-index: 100;
        }
        
        .fab:hover {
            transform: scale(1.1);
            box-shadow: 0 6px 20px rgba(0,0,0,0.3);
        }
        
        /* Notification Toast */
        .toast {
            position: fixed;
            top: 24px;
            left: 50%;
            transform: translateX(-50%) translateY(-100px);
            background: var(--tg-theme-bg-color);
            color: var(--tg-theme-text-color);
            padding: 16px 24px;
            border-radius: 12px;
            box-shadow: 0 8px 32px rgba(0,0,0,0.2);
            z-index: 1001;
            transition: var(--transition);
            border: 1px solid var(--tg-theme-button-color);
        }
        
        .toast.show {
            transform: translateX(-50%) translateY(0);
        }
        
        .toast.success {
            border-color: #4CAF50;
        }
        
        .toast.error {
            border-color: #f44336;
        }
        
        /* Enhanced mobile responsiveness */
        @media (max-width: 768px) {
            .container {
                padding: 12px;
            }
            
            .header h1 {
                font-size: 2rem;
            }
            
            .header p {
                font-size: 1rem;
            }
            
            .bot-name {
                font-size: 1.8rem;
            }
            
            .section-title {
                font-size: 1.8rem;
            }
            
            .features-grid {
                grid-template-columns: 1fr;
                gap: 16px;
            }
            
            .command-list {
                grid-template-columns: 1fr;
                gap: 12px;
            }
            
            .user-profile {
                padding: 16px;
            }
            
            .user-info {
                flex-direction: column;
                text-align: center;
                gap: 12px;
            }
            
            .user-stats {
                grid-template-columns: repeat(2, 1fr);
            }
            
            .social-links {
                flex-direction: column;
                align-items: center;
            }
            
            .social-link {
                width: 100%;
                max-width: 200px;
            }
            
            .settings-panel {
                width: 100%;
                right: -100%;
            }
            
            .fab {
                bottom: 16px;
                right: 16px;
                width: 48px;
                height: 48px;
                font-size: 1.2rem;
            }
            
            .toast {
                left: 16px;
                right: 16px;
                transform: translateY(-100px);
            }
            
            .toast.show {
                transform: translateY(0);
            }
            
            .privacy-content {
                grid-template-columns: 1fr;
                gap: 16px;
            }
            
            .privacy-card {
                padding: 20px;
            }
        }
        
        @media (max-width: 480px) {
            .header {
                padding: 24px 16px;
            }
            
            .bot-card {
                padding: 24px 16px;
            }
            
            .features-section,
            .commands-section {
                padding: 24px 16px;
            }
            
            .user-stats {
                grid-template-columns: 1fr;
            }
        }
    </style>
</head>
<body>
    <div class="container">
        <!-- User Profile Section -->
        <div class="user-profile" id="userProfile" style="display: none;">
            <div class="user-info">
                <div class="user-avatar" id="userAvatar">👤</div>
                <div class="user-details">
                    <h3 id="userName">Loading...</h3>
                    <p id="userInfo">Connecting to Telegram...</p>
                </div>
            </div>
            <div class="user-stats">
                <div class="stat-item">
                    <div class="stat-value" id="userId">-</div>
                    <div class="stat-label">User ID</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" id="userPremium">-</div>
                    <div class="stat-label">Premium</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" id="userLanguage">-</div>
                    <div class="stat-label">Language</div>
                </div>
                <div class="stat-item">
                    <div class="stat-value" id="userPlatform">-</div>
                    <div class="stat-label">Platform</div>
                </div>
            </div>
        </div>

        <div class="header">
            <h1>🤖 Chat ID Finder Bot</h1>
            <p>Advanced Chat ID Finder & User Information Bot</p>
        </div>
        
        <div class="bot-card">
            <div class="bot-avatar">🤖</div>
            <h2 class="bot-name">Chat ID Bot</h2>
            <p class="bot-description">
                The ultimate Telegram bot for finding chat IDs, user information, and creating deep links. 
                Get instant access to user IDs, group IDs, and channel IDs with just a few clicks!
            </p>
            <a href="https://t.me/InstantChatIDBot" class="cta-button" id="startBotBtn">
                <span class="loading" id="loadingSpinner" style="display: none;"></span>
                <span id="buttonText">🚀 Start Using Bot</span>
            </a>
        </div>
        
        <div class="features-section">
            <h2 class="section-title">✨ Key Features</h2>
            <div class="features-grid">
                <div class="feature-card">
                    <div class="feature-icon">🆔</div>
                    <h3 class="feature-title">Instant ID Retrieval</h3>
                    <p class="feature-description">
                        Get user IDs, group IDs, and channel IDs instantly with special message effects and animations.
                    </p>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">📱</div>
                    <h3 class="feature-title">Cross-Platform Links</h3>
                    <p class="feature-description">
                        Generate Android and iOS deep links for users, and universal Telegram links for chats.
                    </p>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">🔒</div>
                    <h3 class="feature-title">Privacy Respect</h3>
                    <p class="feature-description">
                        Handles hidden users gracefully and guides users to get IDs through proper contact sharing.
                    </p>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">📤</div>
                    <h3 class="feature-title">Forward Message Support</h3>
                    <p class="feature-description">
                        Forward any message to get detailed user or chat information automatically.
                    </p>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">⭐</div>
                    <h3 class="feature-title">Star Donation System</h3>
                    <p class="feature-description">
                        Support the bot with Telegram Stars and help keep it running with new features.
                    </p>
                </div>
                
                <div class="feature-card">
                    <div class="feature-icon">⚡</div>
                    <h3 class="feature-title">Lightning Fast</h3>
                    <p class="feature-description">
                        Built on Cloudflare Workers for global speed and reliability with instant responses.
                    </p>
                </div>
            </div>
        </div>
        
        <div class="commands-section">
            <h2 class="section-title">🔧 Available Commands</h2>
            <div class="command-list">
                <div class="command-item">
                    <div class="command-name">/start</div>
                    <div class="command-description">Start the bot and get the main menu with sharing options</div>
                </div>
                
                <div class="command-item">
                    <div class="command-name">/help</div>
                    <div class="command-description">Show detailed help and command information</div>
                </div>
                
                <div class="command-item">
                    <div class="command-name">/me</div>
                    <div class="command-description">Get your own user ID and information</div>
                </div>
                
                <div class="command-item">
                    <div class="command-name">/about</div>
                    <div class="command-description">Learn about the bot and its creator</div>
                </div>
                
                <div class="command-item">
                    <div class="command-name">/donate</div>
                    <div class="command-description">Support the bot creator with donations</div>
                </div>
                
                <div class="command-item">
                    <div class="command-name">/donate_stars</div>
                    <div class="command-description">Donate Telegram Stars to support the bot</div>
                </div>
                
                <div class="command-item">
                    <div class="command-name">/admin</div>
                    <div class="command-description">Admin panel for bot management</div>
                </div>
                
                <div class="command-item">
                    <div class="command-name">/refund</div>
                    <div class="command-description">Refund cmd for admin only</div>
                </div>
                
            </div>
        </div>
        
        <!-- Privacy Policy Section -->
        <div class="privacy-section">
            <h2 class="section-title">🔒 Privacy Policy</h2>
            <div class="privacy-content">
                <div class="privacy-card">
                    <div class="privacy-icon">🛡️</div>
                    <h3>Data Protection</h3>
                    <p>We respect your privacy and do not store any personal data from your chats. All operations are performed in real-time without data retention.</p>
                </div>
                
                <div class="privacy-card">
                    <div class="privacy-icon">⚡</div>
                    <h3>Real-time Processing</h3>
                    <p>Information you share (like users or groups) is processed instantly to retrieve IDs. No data is saved on our servers.</p>
                </div>
                
                <div class="privacy-card">
                    <div class="privacy-icon">🔐</div>
                    <h3>Secure Operations</h3>
                    <p>All bot operations use Telegram's official API with end-to-end encryption. Your data remains secure throughout the process.</p>
                </div>
            </div>
        </div>
        
        <div class="footer">
            <div class="creator-info">
                <div class="creator-name">👨‍💻 Created by @Elabcode</div>
                <div class="creator-name">🛠 Developed by @Elabcode</div>
                <p>Professional developer creating amazing Telegram bots and tools</p>
            </div>
            
            <div class="social-links">
                <a href="https://t.me/Agegnewu0102" class="social-link">👤 Owner</a>
                <a href="https://t.me/Elabcode" class="social-link">📢 Channel</a>
                <a href="https://t.me/Elabsupport" class="social-link">🆘 Support</a>
                <a href="mailto:agegnewu13@gmail.com" class="social-link">📧 Email</a>
            </div>
            
            <p style="margin-top: 20px; opacity: 0.8;">
                Made with ❤️ by @Elabcode | 🛠 Developed by @Elabcode | Powered by Cloudflare Workers
            </p>
        </div>
    </div>

    <!-- Settings Panel -->
    <div class="overlay" id="overlay"></div>
    <div class="settings-panel" id="settingsPanel">
        <div class="settings-header">
            <h3 class="settings-title">⚙️ Settings</h3>
            <button class="close-settings" id="closeSettings">×</button>
        </div>
        
        <div class="setting-item">
            <span class="setting-label">Dark Mode</span>
            <div class="toggle-switch" id="darkModeToggle"></div>
        </div>
        
        <div class="setting-item">
            <span class="setting-label">Haptic Feedback</span>
            <div class="toggle-switch active" id="hapticToggle"></div>
        </div>
        
        <div class="setting-item">
            <span class="setting-label">Auto-expand</span>
            <div class="toggle-switch active" id="autoExpandToggle"></div>
        </div>
        
        <div class="setting-item">
            <span class="setting-label">Show User Profile</span>
            <div class="toggle-switch active" id="showProfileToggle"></div>
        </div>
    </div>

    <!-- Floating Action Button -->
    <div class="fab" id="fab" title="Settings">
        ⚙️
    </div>

    <!-- Toast Notification -->
    <div class="toast" id="toast"></div>

    <script>
        // Global settings state
        const settings = {
            darkMode: false,
            hapticFeedback: true,
            autoExpand: true,
            showProfile: true
        };

        // Telegram WebApp Integration
        document.addEventListener('DOMContentLoaded', function() {
            // Load settings from localStorage
            loadSettings();
            
            // Initialize Telegram WebApp
            if (window.Telegram && window.Telegram.WebApp) {
                const tg = window.Telegram.WebApp;
                
                // Configure WebApp
                tg.ready();
                tg.expand();
                
                // Apply theme
                if (tg.colorScheme === 'dark') {
                    document.body.classList.add('tg-theme-dark');
                }
                
                // Update theme when it changes
                tg.onEvent('themeChanged', function() {
                    if (tg.colorScheme === 'dark') {
                        document.body.classList.add('tg-theme-dark');
                    } else {
                        document.body.classList.remove('tg-theme-dark');
                    }
                });
                
                // Show user profile if user data is available
                if (tg.initDataUnsafe && tg.initDataUnsafe.user) {
                    const user = tg.initDataUnsafe.user;
                    showUserProfile(user, tg);
                } else {
                    // Try to get user data from initData
                    try {
                        const initData = tg.initData;
                        if (initData) {
                            const params = new URLSearchParams(initData);
                            const userParam = params.get('user');
                            if (userParam) {
                                const user = JSON.parse(decodeURIComponent(userParam));
                                showUserProfile(user, tg);
                            }
                        }
                    } catch (e) {
                        console.log('Could not parse user data:', e);
                    }
                }
                
                // Handle main button
                tg.MainButton.setText('🚀 Start Bot');
                tg.MainButton.show();
                tg.MainButton.onClick(function() {
                    tg.openLink('https://t.me/InstantChatIDBot');
                });
                
                // Handle back button
                tg.BackButton.onClick(function() {
                    tg.close();
                });
                
                // Handle viewport changes
                tg.onEvent('viewportChanged', function() {
                    tg.expand();
                });
                
                // Add haptic feedback to buttons
                document.querySelectorAll('.cta-button, .social-link').forEach(button => {
                    button.addEventListener('click', function() {
                        tg.HapticFeedback.impactOccurred('medium');
                    });
                });
                
                // Add haptic feedback to feature cards
                document.querySelectorAll('.feature-card, .command-item').forEach(card => {
                    card.addEventListener('click', function() {
                        if (settings.hapticFeedback) {
                            tg.HapticFeedback.impactOccurred('light');
                        }
                    });
                });
                
            } else {
                // Fallback for non-Telegram environments
                console.log('Telegram WebApp not available, running in browser mode');
                showFallbackProfile();
            }
            
            // Initialize UI components
            initializeSettings();
            initializeFAB();
            initializeToast();
        });
        
        // Settings functionality
        function loadSettings() {
            const savedSettings = localStorage.getItem('chatIdBotSettings');
            if (savedSettings) {
                Object.assign(settings, JSON.parse(savedSettings));
            }
            applySettings();
        }
        
        function saveSettings() {
            localStorage.setItem('chatIdBotSettings', JSON.stringify(settings));
        }
        
        function applySettings() {
            // Apply dark mode
            if (settings.darkMode) {
                document.body.classList.add('tg-theme-dark');
            } else {
                document.body.classList.remove('tg-theme-dark');
            }
            
            // Update toggle switches
            document.getElementById('darkModeToggle').classList.toggle('active', settings.darkMode);
            document.getElementById('hapticToggle').classList.toggle('active', settings.hapticFeedback);
            document.getElementById('autoExpandToggle').classList.toggle('active', settings.autoExpand);
            document.getElementById('showProfileToggle').classList.toggle('active', settings.showProfile);
            
            // Show/hide user profile
            const userProfile = document.getElementById('userProfile');
            if (userProfile) {
                userProfile.style.display = settings.showProfile ? 'block' : 'none';
            }
        }
        
        function initializeSettings() {
            const settingsPanel = document.getElementById('settingsPanel');
            const overlay = document.getElementById('overlay');
            const closeSettings = document.getElementById('closeSettings');
            const fab = document.getElementById('fab');
            
            // Open settings
            fab.addEventListener('click', function() {
                settingsPanel.classList.add('open');
                overlay.classList.add('show');
                if (settings.hapticFeedback && window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
                }
            });
            
            // Close settings
            function closeSettingsPanel() {
                settingsPanel.classList.remove('open');
                overlay.classList.remove('show');
            }
            
            closeSettings.addEventListener('click', closeSettingsPanel);
            overlay.addEventListener('click', closeSettingsPanel);
            
            // Toggle switches
            document.querySelectorAll('.toggle-switch').forEach(toggle => {
                toggle.addEventListener('click', function() {
                    const settingName = this.id.replace('Toggle', '');
                    const settingKey = settingName.charAt(0).toLowerCase() + settingName.slice(1);
                    
                    settings[settingKey] = !settings[settingKey];
                    this.classList.toggle('active', settings[settingKey]);
                    
                    saveSettings();
                    applySettings();
                    
                    if (settings.hapticFeedback && window.Telegram && window.Telegram.WebApp) {
                        window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                    }
                    
                    showToast('Settings updated!', 'success');
                });
            });
        }
        
        function initializeFAB() {
            const fab = document.getElementById('fab');
            
            // Add pulse animation
            setInterval(() => {
                fab.style.animation = 'pulse 2s infinite';
            }, 5000);
            
            // Add CSS for pulse animation
            const style = document.createElement('style');
            style.textContent = \`
                @keyframes pulse {
                    0% { transform: scale(1); }
                    50% { transform: scale(1.05); }
                    100% { transform: scale(1); }
                }
            \`;
            document.head.appendChild(style);
        }
        
        function initializeToast() {
            // Toast functionality is already defined in showToast function
        }
        
        function showToast(message, type = 'info') {
            const toast = document.getElementById('toast');
            toast.textContent = message;
            toast.className = \`toast \${type}\`;
            toast.classList.add('show');
            
            setTimeout(() => {
                toast.classList.remove('show');
            }, 3000);
        }
        
        function showUserProfile(user, tg) {
            if (!settings.showProfile) return;
            
            const userProfile = document.getElementById('userProfile');
            const userName = document.getElementById('userName');
            const userInfo = document.getElementById('userInfo');
            const userAvatar = document.getElementById('userAvatar');
            const userId = document.getElementById('userId');
            const userPremium = document.getElementById('userPremium');
            const userLanguage = document.getElementById('userLanguage');
            const userPlatform = document.getElementById('userPlatform');
            
            // Update user info
            const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
            userName.textContent = fullName || 'Telegram User';
            userInfo.textContent = user.username ? '@' + user.username : 'No username';
            
            // Update avatar with user's first letter
            if (fullName) {
                userAvatar.textContent = fullName.charAt(0).toUpperCase();
            }
            
            // Update stats
            userId.textContent = user.id || '-';
            userPremium.textContent = user.is_premium ? '⭐ Yes' : '❌ No';
            userLanguage.textContent = tg.languageCode || 'en';
            userPlatform.textContent = tg.platform || 'Unknown';
            
            // Show profile with animation
            userProfile.style.display = 'block';
            userProfile.style.opacity = '0';
            userProfile.style.transform = 'translateY(-20px)';
            
            setTimeout(() => {
                userProfile.style.transition = 'all 0.3s ease';
                userProfile.style.opacity = '1';
                userProfile.style.transform = 'translateY(0)';
            }, 100);
            
        }
        
        function showFallbackProfile() {
            if (!settings.showProfile) return;
            
            const userProfile = document.getElementById('userProfile');
            const userName = document.getElementById('userName');
            const userInfo = document.getElementById('userInfo');
            const userId = document.getElementById('userId');
            const userPremium = document.getElementById('userPremium');
            const userLanguage = document.getElementById('userLanguage');
            const userPlatform = document.getElementById('userPlatform');
            
            // Show fallback info
            userName.textContent = 'Web User';
            userInfo.textContent = 'Using web browser';
            userId.textContent = 'Web';
            userPremium.textContent = '❌ No';
            userLanguage.textContent = navigator.language || 'en';
            userPlatform.textContent = 'Web';
            
            userProfile.style.display = 'block';
            
        }
        
        // Enhanced button interactions
        document.getElementById('startBotBtn').addEventListener('click', function(e) {
            const spinner = document.getElementById('loadingSpinner');
            const buttonText = document.getElementById('buttonText');
            
            // Show loading state
            spinner.style.display = 'inline-block';
            buttonText.textContent = 'Opening...';
            
            // Add haptic feedback if available and enabled
            if (settings.hapticFeedback && window.Telegram && window.Telegram.WebApp) {
                window.Telegram.WebApp.HapticFeedback.impactOccurred('medium');
            }
            
            
            // Reset after a delay
            setTimeout(() => {
                spinner.style.display = 'none';
                buttonText.textContent = '🚀 Start Using Bot';
            }, 2000);
        });
        
        // Smooth scroll for internal links
        document.querySelectorAll('a[href^="#"]').forEach(anchor => {
            anchor.addEventListener('click', function (e) {
                e.preventDefault();
                const target = document.querySelector(this.getAttribute('href'));
                if (target) {
                    target.scrollIntoView({
                        behavior: 'smooth',
                        block: 'start'
                    });
                }
            });
        });
        
        // Add loading states to external links
        document.querySelectorAll('a[href^="http"]').forEach(link => {
            link.addEventListener('click', function() {
                if (settings.hapticFeedback && window.Telegram && window.Telegram.WebApp) {
                    window.Telegram.WebApp.HapticFeedback.impactOccurred('light');
                }
                
            });
        });
        
        // Add keyboard shortcuts
        document.addEventListener('keydown', function(e) {
            // Ctrl/Cmd + , to open settings
            if ((e.ctrlKey || e.metaKey) && e.key === ',') {
                e.preventDefault();
                document.getElementById('fab').click();
            }
            
            // Escape to close settings
            if (e.key === 'Escape') {
                const settingsPanel = document.getElementById('settingsPanel');
                if (settingsPanel.classList.contains('open')) {
                    settingsPanel.classList.remove('open');
                    document.getElementById('overlay').classList.remove('show');
                }
            }
        });
        
        window.addEventListener('load', function() {
            // Page loaded successfully
            initializeScrollAnimations();
        });
        
        function initializeScrollAnimations() {
            const observerOptions = {
                threshold: 0.1,
                rootMargin: '0px 0px -50px 0px'
            };
            
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        entry.target.classList.add('animate-in');
                    }
                });
            }, observerOptions);
            
            document.querySelectorAll('.feature-card, .command-item, .privacy-card, .bot-card').forEach(el => {
                el.style.opacity = '0';
                el.style.transform = 'translateY(30px)';
                el.style.transition = 'all 0.6s cubic-bezier(0.4, 0, 0.2, 1)';
                observer.observe(el);
            });
            
            // Add CSS for animate-in class
            const style = document.createElement('style');
            style.textContent = \`
                .animate-in {
                    opacity: 1 !important;
                    transform: translateY(0) !important;
                }
            \`;
            document.head.appendChild(style);
        }
        
        // Add smooth scroll behavior for better UX
        document.documentElement.style.scrollBehavior = 'smooth';
        
        // Made by Elabcode
        function addLoadingAnimations() {
            const elements = document.querySelectorAll('.feature-card, .command-item, .privacy-card');
            elements.forEach((el, index) => {
                el.style.animationDelay = \`\${index * 0.1}s\`;
                el.classList.add('fade-in-up');
            });
        }
        
        function addEnhancedHoverEffects() {
            document.querySelectorAll('.feature-card, .command-item, .privacy-card').forEach(card => {
                card.addEventListener('mouseenter', function() {
                    this.style.transform = 'translateY(-8px) scale(1.02)';
                    this.style.boxShadow = '0 20px 40px rgba(0,0,0,0.15)';
                });
                
                card.addEventListener('mouseleave', function() {
                    this.style.transform = 'translateY(0) scale(1)';
                    this.style.boxShadow = 'var(--card-shadow)';
                });
            });
        }
        
        setTimeout(() => {
            addLoadingAnimations();
            addEnhancedHoverEffects();
        }, 100);
    </script>
</body>
</html>`;
}

// Function to handle callback queries
async function handleCallbackQuery(callback_query) {
    const chat_id = callback_query.message.chat.id;
    const message_id = callback_query.message.message_id;
    const callback_data = callback_query.data;
    const callback_query_id = callback_query.id;
    const user_id = callback_query.from.id;
    
    logError(`Handling callback query: ${callback_data} from user: ${user_id}`);
    
    try {
        // Check if user has joined channel for non-admin callbacks
        if (!callback_data.startsWith('admin_') && !callback_data.startsWith('donate_') && 
            !['about', 'help', 'back_to_menu'].includes(callback_data)) {
            const hasJoined = await hasUserJoinedChannel(user_id);
            if (!hasJoined) {
                const join_message = `📢 <b>Join Required</b>\n\n` +
                                  `To use this bot, you need to join our channel first!\n\n` +
                                  `🔗 <b>Channel:</b> ${BOT_CONFIG.CHANNEL_USERNAME}\n\n` +
                                  `✅ <b>Requirements:</b>\n` +
                                  `• Join ${BOT_CONFIG.CHANNEL_USERNAME}\n` +
                                  `• Be an admin in the channel\n` +
                                  `• Then try again\n\n` +
                                  `<blockquote>This helps us grow and maintain the bot! 🙏</blockquote>`;
                
                await editMessage(BOT_TOKEN, chat_id, message_id, join_message);
                await answerCallbackQuery(BOT_TOKEN, callback_query_id, "Please join the channel first!", true);
                return new Response('OK', { status: 200 });
            }
        }
        
        switch (callback_data) {
            case 'about':
                const about_text = "💻 <b>About Chat ID Finder Bot</b>\n\n" +
                                  "🎯 <b>Purpose:</b>\n" +
                                  "This bot helps you find unique IDs for any Telegram user, group, or channel instantly.\n\n" +
                                  "✨ <b>Features:</b>\n" +
                                  "• Instant ID retrieval\n" +
                                  "• Support for all chat types\n" +
                                  "• Special message effects\n" +
                                  "• Advanced admin panel\n" +
                                  "• Multi-amount donation system\n" +
                                  "• Channel membership requirement\n\n" +
                                  "🛠 <b>Technology:</b>\n" +
                                  "• Built with Cloudflare Workers\n" +
                                  "• Powered by Telegram Bot API\n" +
                                  "• Global CDN for speed\n\n" +
                                  "👨‍💻 <b>Creator:</b> @Agegnewu0102\n" +
                                  "🛠 <b>Developer:</b> @Elabcode\n" +
                                  "🆘 <b>Support:</b> @Elabsupport\n\n" +
                                  "<blockquote>🛠 Made with ❤️ By @Elabcode</blockquote>";
                
                const about_keyboard = {
                    inline_keyboard: [
                        [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                    ]
                };
                
                await editMessage(BOT_TOKEN, chat_id, message_id, about_text, about_keyboard);
                await answerCallbackQuery(BOT_TOKEN, callback_query_id);
                break;
                
            case 'help':
                const help_text = "🆘 <b>Help & Commands</b>\n\n" +
                                 "📋 <b>Available Commands:</b>\n" +
                                 "• /start - Start the bot and get main menu\n" +
                                 "• /help - Show this help message\n" +
                                 "• /me - Get your own user ID\n" +
                                 "• /about - About the bot and creator\n" +
                                 "• /donate - Support the bot creator\n" +
                                 "• /donate_stars - Donate stars to the bot\n" +
                                 "• /admin - Admin panel (Admin only)\n" +
                                 "• /refund - Admin only: Process refunds\n\n" +
                                 "🔧 <b>How to Use:</b>\n" +
                                 "1. Join our channel and be admin\n" +
                                 "2. Use the keyboard buttons to share users/chats\n" +
                                 "3. Get instant IDs with special effects\n\n" +
                                 "💡 <b>Tips:</b>\n" +
                                 "• Works with all types of chats and users\n" +
                                 "• Each type has unique message effects\n" +
                                 "• Multiple donation amounts available\n\n" +
                                 "<blockquote>Need more help? Contact @Elabsupport</blockquote>";
                
                const help_keyboard = {
                    inline_keyboard: [
                        [{ text: '🔙 Back to Menu', callback_data: 'back_to_menu' }]
                    ]
                };
                
                await editMessage(BOT_TOKEN, chat_id, message_id, help_text, help_keyboard);
                await answerCallbackQuery(BOT_TOKEN, callback_query_id);
                break;
                
            case 'donate_stars':
                const donate_stars_text = "⭐ <b>Donate Stars to Support the Bot</b>\n\n" +
                                         "🌟 <b>Choose donation amount:</b>\n\n" +
                                         "💫 <b>What you get:</b>\n" +
                                         "• Support bot development\n" +
                                         "• Access to premium features\n" +
                                         "• Priority support\n" +
                                         "• Our eternal gratitude! 💝\n\n" +
                                         "<blockquote>Every star helps us improve the bot! Thank you! 🌟</blockquote>";
                
                const donate_stars_keyboard = createDonationKeyboard();
                
                await editMessage(BOT_TOKEN, chat_id, message_id, donate_stars_text, donate_stars_keyboard);
                await answerCallbackQuery(BOT_TOKEN, callback_query_id);
                break;
                
            case 'back_to_menu':
                const menu_text = "🔗 <b>Quick Actions:</b>";
                const menu_keyboard = createInlineKeyboard();
                
                await editMessage(BOT_TOKEN, chat_id, message_id, menu_text, menu_keyboard);
                await answerCallbackQuery(BOT_TOKEN, callback_query_id);
                break;
                
            // Admin panel callbacks
            case 'admin_panel':
                if (user_id.toString() !== BOT_CONFIG.ADMIN_ID.toString()) {
                    await answerCallbackQuery(BOT_TOKEN, callback_query_id, "Access denied!", true);
                    return new Response('OK', { status: 200 });
                }
                
                const admin_text = "👑 <b>Welcome to Admin Panel</b>\n\n" +
                                  "💼 <b>Available Actions:</b>\n\n" +
                                  "📢 <b>Broadcast</b> - Send message to all users\n" +
                                  "📊 <b>Bot Status</b> - View bot statistics\n" +
                                  "💰 <b>Donated Users</b> - View donation history\n" +
                                  "⚙️ <b>Settings</b> - Bot configuration\n\n" +
                                  "<blockquote>Admin access granted ✅</blockquote>";
                
                const admin_keyboard = createAdminKeyboard();
                await editMessage(BOT_TOKEN, chat_id, message_id, admin_text, admin_keyboard);
                await answerCallbackQuery(BOT_TOKEN, callback_query_id);
                break;
                
            case 'admin_broadcast':
                if (user_id.toString() !== BOT_CONFIG.ADMIN_ID.toString()) {
                    await answerCallbackQuery(BOT_TOKEN, callback_query_id, "Access denied!", true);
                    return new Response('OK', { status: 200 });
                }
                
                const broadcast_text = "📢 <b>Broadcast Message</b>\n\n" +
                                      "Please choose how you want to send the broadcast:\n\n" +
                                      "📌 <b>Pin Broadcast</b> - Message will be pinned in chats\n" +
                                      "📤 <b>Send Normally</b> - Regular broadcast message\n\n" +
                                      "<blockquote>After clicking, please send your broadcast message.</blockquote>";
                
                const broadcast_keyboard = createBroadcastKeyboard();
                await editMessage(BOT_TOKEN, chat_id, message_id, broadcast_text, broadcast_keyboard);
                await answerCallbackQuery(BOT_TOKEN, callback_query_id);
                break;
                
            case 'admin_status':
                if (user_id.toString() !== BOT_CONFIG.ADMIN_ID.toString()) {
                    await answerCallbackQuery(BOT_TOKEN, callback_query_id, "Access denied!", true);
                    return new Response('OK', { status: 200 });
                }
                
                const status_text = "📊 <b>Bot Status & Statistics</b>\n\n" +
                                   "🤖 <b>Bot Information:</b>\n" +
                                   "• Version: 7.0\n" +
                                   "• Platform: Cloudflare Workers\n" +
                                   "• Uptime: 100%\n\n" +
                                   "📈 <b>Statistics:</b>\n" +
                                   `• Total Users: ${botStats.totalUsers}\n` +
                                   `• Total Commands: ${botStats.totalCommands}\n` +
                                   `• Total Donations: ${botStats.totalDonations}\n` +
                                   `• Donation Amount: ${botStats.donationAmount} ⭐\n` +
                                   `• Last Update: ${new Date(botStats.lastUpdate).toLocaleString()}\n\n` +
                                   "🔄 <b>System Status:</b>\n" +
                                   "• Webhook: ✅ Active\n" +
                                   "• Database: ✅ In-Memory\n" +
                                   "• API: ✅ Operational\n\n" +
                                   "<blockquote>All systems operational! 🚀</blockquote>";
                
                const status_keyboard = {
                    inline_keyboard: [
                        [{ text: '🔄 Refresh', callback_data: 'admin_status' }],
                        [{ text: '🔙 Admin Panel', callback_data: 'admin_panel' }]
                    ]
                };
                
                await editMessage(BOT_TOKEN, chat_id, message_id, status_text, status_keyboard);
                await answerCallbackQuery(BOT_TOKEN, callback_query_id);
                break;
                
            case 'admin_donated':
                if (user_id.toString() !== BOT_CONFIG.ADMIN_ID.toString()) {
                    await answerCallbackQuery(BOT_TOKEN, callback_query_id, "Access denied!", true);
                    return new Response('OK', { status: 200 });
                }
                
                let donated_text = "💰 <b>Donated Users</b>\n\n";
                
                if (donatedUsers.size === 0) {
                    donated_text += "No donations received yet.\n";
                } else {
                    donated_text += `Total Donors: ${donatedUsers.size}\n\n`;
                    let count = 1;
                    for (const [userId, data] of donatedUsers) {
                        donated_text += `${count}. User ID: <code>${userId}</code>\n`;
                        donated_text += `   Total: ${data.total} ⭐\n`;
                        donated_text += `   Donations: ${data.donations.length}\n\n`;
                        count++;
                        if (count > 10) break; // Show only first 10
                    }
                    if (donatedUsers.size > 10) {
                        donated_text += `... and ${donatedUsers.size - 10} more donors\n`;
                    }
                }
                
                donated_text += `\n<blockquote>Total Stars Received: ${botStats.donationAmount} ⭐</blockquote>`;
                
                const donated_keyboard = {
                    inline_keyboard: [
                        [{ text: '🔄 Refresh', callback_data: 'admin_donated' }],
                        [{ text: '🔙 Admin Panel', callback_data: 'admin_panel' }]
                    ]
                };
                
                await editMessage(BOT_TOKEN, chat_id, message_id, donated_text, donated_keyboard);
                await answerCallbackQuery(BOT_TOKEN, callback_query_id);
                break;
                
            case 'broadcast_pin':
            case 'broadcast_normal':
                if (user_id.toString() !== BOT_CONFIG.ADMIN_ID.toString()) {
                    await answerCallbackQuery(BOT_TOKEN, callback_query_id, "Access denied!", true);
                    return new Response('OK', { status: 200 });
                }
                
                // Set broadcast state
                broadcastState.set(user_id, {
                    type: callback_data === 'broadcast_pin' ? 'pin' : 'normal',
                    waitingForMessage: true
                });
                
                const broadcast_ready_text = "📢 <b>Broadcast Ready</b>\n\n" +
                                           `Mode: ${callback_data === 'broadcast_pin' ? '📌 Pin Broadcast' : '📤 Normal Broadcast'}\n\n` +
                                           "📝 <b>Please send your broadcast message now:</b>\n\n" +
                                           "💡 <b>Tips:</b>\n" +
                                           "• You can send text, photos, or documents\n" +
                                           "• Use HTML formatting for rich text\n" +
                                           "• The message will be sent to all users\n\n" +
                                           "<blockquote>Send your message now or /cancel to abort</blockquote>";
                
                await editMessage(BOT_TOKEN, chat_id, message_id, broadcast_ready_text);
                await answerCallbackQuery(BOT_TOKEN, callback_query_id, "Now send your broadcast message");
                break;
                
            // Donation amount callbacks
            default:
                if (callback_data.startsWith('donate_')) {
                    const amount = parseInt(callback_data.replace('donate_', ''));
                    await answerCallbackQuery(BOT_TOKEN, callback_query_id, `Sending invoice for ${amount} stars...`);
                    await sendInvoice(chat_id, amount);
                } else {
                    await answerCallbackQuery(BOT_TOKEN, callback_query_id, "Unknown action", true);
                }
                break;
        }
        
        return new Response('OK', { status: 200 });
        
    } catch (error) {
        logError(`Error handling callback query: ${error.message}`);
        await answerCallbackQuery(BOT_TOKEN, callback_query_id, "An error occurred", true);
        return new Response('Internal Server Error', { status: 500 });
    }
}

// Main handler function
async function handleRequest(request) {
    const url = new URL(request.url);
    const path = url.pathname;
    
    // Handle webhook setup via GET requests
    if (request.method === 'GET') {
        if (path === '/setwebhook') {
            const result = await setWebhook();
            return new Response(JSON.stringify(result, null, 2), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        }
        else if (path === '/webhookinfo') {
            const result = await getWebhookInfo();
            return new Response(JSON.stringify(result, null, 2), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        }
        else if (path === '/deletewebhook') {
            const result = await deleteWebhook();
            return new Response(JSON.stringify(result, null, 2), {
                status: 200,
                headers: {
                    'Content-Type': 'application/json',
                },
            });
        }
        else {
            // Serve the home page for other GET requests
            return new Response(createHomePage(), {
                status: 200,
                headers: {
                    'Content-Type': 'text/html;charset=UTF-8',
                },
            });
        }
    }
    
    if (request.method !== 'POST') {
        return new Response('Method not allowed', { status: 405 });
    }
    
    try {
        const content = await request.text();
        const update = JSON.parse(content);
        
        logError(`Received update: ${JSON.stringify(update, null, 2)}`);

        if (!update) {
            logError(`No valid update received: ${JSON.stringify(update)}`);
            return new Response('OK', { status: 200 });
        }

        if (update.callback_query) {
            return handleCallbackQuery(update.callback_query);
        }

        if (update.pre_checkout_query) {
            await handlePreCheckout(update.pre_checkout_query);
            return new Response('OK', { status: 200 });
        }

        if (update.message && update.message.successful_payment) {
            const payment = update.message.successful_payment;
            const chat_id = update.message.chat.id;
            const user_id = update.message.from.id;
            const user = update.message.from;
            const amount = JSON.parse(payment.invoice_payload).amount;
            
            // Record donation
            const userName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || 'Unknown User';
            const userUsername = user.username ? `@${user.username}` : 'No username';
            
            if (!donatedUsers.has(user_id)) {
                donatedUsers.set(user_id, { total: 0, donations: [], name: userName, username: userUsername });
            }
            const userData = donatedUsers.get(user_id);
            userData.total += amount;
            userData.donations.push({
                amount: amount,
                date: new Date().toISOString(),
                transaction_id: payment.telegram_payment_charge_id
            });
            
            botStats.totalDonations++;
            botStats.donationAmount += amount;
            
            // Send success message to user
            const success_text = "🎉 <b>Thank you for your donation!</b>\n\n" +
                                "💝 <b>Payment Details:</b>\n" +
                                `• Amount: ${amount} ⭐ Stars\n` +
                                `• Transaction ID: <code>${payment.telegram_payment_charge_id}</code>\n\n` +
                                "🌟 <b>Your support means the world to us!</b>\n" +
                                "We'll use your donation to improve the bot and add new features.\n\n" +
                                "<blockquote>Thank you for being awesome! 🙏</blockquote>";
            
            await sendHTMLMessage(BOT_TOKEN, chat_id, success_text, null, true);
            
            // Notify admin about the donation
            const donationDetails = {
                amount: amount,
                userId: user_id,
                userName: userName,
                userUsername: userUsername,
                userTotal: userData.total,
                transactionId: payment.telegram_payment_charge_id
            };
            await notifyAdminAboutDonation(donationDetails);
            
            return new Response('OK', { status: 200 });
        }
        
        if (!update.message) {
            logError(`No message in update: ${JSON.stringify(update)}`);
            return new Response('OK', { status: 200 });
        }
        
        const message = update.message;
        const chat_id = message.chat.id;
        const user_id = message.from.id;
        const text = message.text || '';
        
        logError(`Processing message: "${text}" from user: ${user_id}`);
        
        // Update statistics
        botStats.totalCommands++;
        botStats.lastUpdate = Date.now();

        // Handle broadcast message from admin
        if (broadcastState.has(user_id) && broadcastState.get(user_id).waitingForMessage) {
            if (user_id.toString() === BOT_CONFIG.ADMIN_ID.toString()) {
                const broadcastData = broadcastState.get(user_id);
                if (text === '/cancel') {
                    broadcastState.delete(user_id);
                    await sendHTMLMessage(BOT_TOKEN, chat_id, "❌ Broadcast cancelled.", null, true);
                    return new Response('OK', { status: 200 });
                }
                
                // Here you would implement the actual broadcast logic
                // For now, we'll just send a confirmation
                const broadcast_type = broadcastData.type === 'pin' ? '📌 Pinned' : '📤 Normal';
                await sendHTMLMessage(BOT_TOKEN, chat_id, 
                    `✅ <b>Broadcast Ready</b>\n\n` +
                    `Type: ${broadcast_type}\n` +
                    `Message: ${text}\n\n` +
                    `<blockquote>Broadcast feature implementation pending</blockquote>`, 
                    null, true
                );
                broadcastState.delete(user_id);
                return new Response('OK', { status: 200 });
            }
        }

        // Check channel membership for non-admin commands
        if (!text.startsWith('/admin') && user_id.toString() !== BOT_CONFIG.ADMIN_ID.toString()) {
            const hasJoined = await hasUserJoinedChannel(user_id);
            if (!hasJoined) {
                const join_message = `📢 <b>Join Required</b>\n\n` +
                                  `To use this bot, you need to join our channel first!\n\n` +
                                  `🔗 <b>Channel:</b> ${BOT_CONFIG.CHANNEL_USERNAME}\n\n` +
                                  `✅ <b>Requirements:</b>\n` +
                                  `• Join ${BOT_CONFIG.CHANNEL_USERNAME}\n` +
                                  `• Be an admin in the channel\n` +
                                  `• Then try using /start again\n\n` +
                                  `<blockquote>This helps us grow and maintain the bot! 🙏</blockquote>`;
                
                await sendHTMLMessage(BOT_TOKEN, chat_id, join_message);
                return new Response('OK', { status: 200 });
            }
        }
        
        // Start Message Handling
        if (text.startsWith('/start')) {
            logError(`Processing start command: "${text}"`);

            if (text.includes('link_')) {
                const link_id = text.replace('/start link_', '');
                logError(`Link command received for ID: ${link_id}`);

                const isUser = /^\d+$/.test(link_id) && !link_id.startsWith('-100');
                const isChat = /^-100\d+$/.test(link_id);
                
                if (isUser) {
                    logError(`Processing user ID: ${link_id}`);
                    const user_response = `👤 <b>User Information</b>\n🆔 ID: <code>${link_id}</code>`;
                    await sendHTMLMessage(BOT_TOKEN, chat_id, user_response, null, false, null);
                } else if (isChat) {
                    const chat_response = `💬 <b>Chat Information</b>\n🆔 ID: <code>${link_id}</code>`;
                    await sendHTMLMessage(BOT_TOKEN, chat_id, chat_response, null, false, null);
                } else {
                    await sendHTMLMessage(BOT_TOKEN, chat_id, "❌ Invalid ID format. Please try again.", null, true);
                }
                return new Response('OK', { status: 200 });
            }

            if (text === '/start') {
                const reply_text = "👋 <b>Welcome to Chat ID Finder Bot!</b> 🆔\n\n" +
                              "✅ <b>Fetch Any Chat ID Instantly!</b>\n\n" +
                              "🔧 <b>How to Use?</b>\n" +
                              "1️⃣ Click the buttons below to share a chat or user.\n" +
                              "2️⃣ Receive the unique ID instantly.\n\n" +
                              "💎 <b>Features:</b>\n" +
                              "✅ Supports users, bots, private/public groups & channels\n" +
                              "⚡ Fast and reliable\n\n" +
                              "<blockquote>🛠 Made with ❤️ By @Elabcode | Support: @Elabsupport</blockquote>";

                const keyboard = {
                    keyboard: [
                        [
                            { text: '👤 User', request_user: { request_id: 1, user_is_bot: false } }
                        ],
                        [
                            { text: '🌐 Public Group', request_chat: {
                                request_id: 5,
                                chat_is_channel: false,
                                chat_has_username: true
                            }},
                            { text: '🔒 Private Group', request_chat: {
                                request_id: 3,
                                chat_is_channel: false,
                                chat_has_username: false
                            }}
                        ],
                        [
                            { text: '🌐 Public Channel', request_chat: {
                                request_id: 4,
                                chat_is_channel: true,
                                chat_has_username: true
                            }},
                            { text: '🔒 Private Channel', request_chat: {
                                request_id: 2,
                                chat_is_channel: true,
                                chat_has_username: false
                            }}
                        ],
                        [
                            { text: '🤖 Bots', request_user: { request_id: 6, user_is_bot: true }},
                            { text: 'Premium 🌟', request_user: { request_id: 7, user_is_premium: true }}
                        ]
                    ],
                    resize_keyboard: true, 
                    one_time_keyboard: false 
                };

                await sendHTMLMessage(BOT_TOKEN, chat_id, reply_text, keyboard, true, START_EFFECT_ID);
            }
        }
        
        else if (text === '/help') {
            const help_text = "🆘 <b>Help & Commands</b>\n\n" +
                             "📋 <b>Available Commands:</b>\n" +
                             "• /start - Start the bot and get main menu\n" +
                             "• /help - Show this help message\n" +
                             "• /me - Get your own user ID\n" +
                             "• /about - About the bot and creator\n" +
                             "• /donate - Support the bot creator\n" +
                             "• /donate_stars - Donate stars to the bot\n" +
                             "• /admin - Admin panel (Admin only)\n" +
                             "• /refund - Admin only: Process refunds\n\n" +
                             "🔧 <b>How to Use:</b>\n" +
                             "1. Join our channel and be admin\n" +
                             "2. Use the keyboard buttons to share users/chats\n" +
                             "3. Get instant IDs with special effects\n\n" +
                             "💡 <b>Tips:</b>\n" +
                             "• Works with all types of chats and users\n" +
                             "• Each type has unique message effects\n" +
                             "• Multiple donation amounts available\n\n" +
                             "<blockquote>Need more help? Contact @Elabsupport</blockquote>";
            
            const inline_keyboard = createInlineKeyboard();
            await sendHTMLMessage(BOT_TOKEN, chat_id, help_text, inline_keyboard, true);
        }
        
        else if (text === '/me') {
            const user = message.from;
            const user_id = user.id;
            const first_name = user.first_name || '';
            const last_name = user.last_name || '';
            const username = user.username ? `@${user.username}` : 'No username';
            const is_premium = user.is_premium ? 'Yes' : 'No';
            const is_bot = user.is_bot ? 'Yes' : 'No';
            
            const me_text = `👤 <b>Your Information</b>\n\n` +
                           `🆔 <b>User ID:</b> <code>${user_id}</code>\n` +
                           `📝 <b>Name:</b> ${first_name} ${last_name}\n` +
                           `🔗 <b>Username:</b> ${username}\n` +
                           `⭐ <b>Premium:</b> ${is_premium}\n` +
                           `🤖 <b>Bot:</b> ${is_bot}\n\n` +
                           `<blockquote>🛠 Made with ❤️ By @Elabcode</blockquote>`;
            
            const inline_keyboard = createInlineKeyboard();
            await sendHTMLMessage(BOT_TOKEN, chat_id, me_text, inline_keyboard, true);
        }
        
        else if (text === '/about') {
            const about_text = "💻 <b>About Chat ID Finder Bot</b>\n\n" +
                              "🎯 <b>Purpose:</b>\n" +
                              "This bot helps you find unique IDs for any Telegram user, group, or channel instantly.\n\n" +
                              "✨ <b>Features:</b>\n" +
                              "• Instant ID retrieval\n" +
                              "• Support for all chat types\n" +
                              "• Special message effects\n" +
                              "• Advanced admin panel\n" +
                              "• Multi-amount donation system\n" +
                              "• Channel membership requirement\n\n" +
                              "🛠 <b>Technology:</b>\n" +
                              "• Built with Cloudflare Workers\n" +
                              "• Powered by Telegram Bot API\n" +
                              "• Global CDN for speed\n\n" +
                              "👨‍💻 <b>Creator:</b> @Agegnewu0102\n" +
                              "🛠 <b>Developer:</b> @Elabcode\n" +
                              "🆘 <b>Support:</b> @Elabsupport\n\n" +
                              "<blockquote>🛠 Made with ❤️ By @Elabcode</blockquote>";
            
            const inline_keyboard = createInlineKeyboard();
            await sendHTMLMessage(BOT_TOKEN, chat_id, about_text, inline_keyboard, true);
        }
        
        else if (text === '/donate' || text === '/donate_stars') {
            const donate_text = "⭐ <b>Donate Stars to Support the Bot</b>\n\n" +
                               "🌟 <b>Choose donation amount:</b>\n\n" +
                               "💫 <b>What you get:</b>\n" +
                               "• Support bot development\n" +
                               "• Access to premium features\n" +
                               "• Priority support\n" +
                               "• Our eternal gratitude! 💝\n\n" +
                               "<blockquote>Every star helps us improve the bot! Thank you! 🌟</blockquote>";
            
            const donate_keyboard = createDonationKeyboard();
            await sendHTMLMessage(BOT_TOKEN, chat_id, donate_text, donate_keyboard, true);
        }
        
        else if (text === '/admin') {
            if (user_id.toString() !== BOT_CONFIG.ADMIN_ID.toString()) {
                const not_admin_text = "❌ <b>Access Denied</b>\n\n" +
                                      "🔒 <b>This command is admin-only!</b>\n\n" +
                                      "💡 <b>Need help?</b>\n" +
                                      "• Contact @Elabsupport for assistance\n" +
                                      "• Only bot owner can access admin panel\n\n" +
                                      "<blockquote>Admin access required for this command.</blockquote>";
                
                await sendHTMLMessage(BOT_TOKEN, chat_id, not_admin_text, null, true);
                return new Response('OK', { status: 200 });
            }

            const admin_text = "👑 <b>Welcome to Admin Panel</b>\n\n" +
                              "💼 <b>Available Actions:</b>\n\n" +
                              "📢 <b>Broadcast</b> - Send message to all users\n" +
                              "📊 <b>Bot Status</b> - View bot statistics\n" +
                              "💰 <b>Donated Users</b> - View donation history\n" +
                              "⚙️ <b>Settings</b> - Bot configuration\n\n" +
                              "<blockquote>Admin access granted ✅</blockquote>";
            
            const admin_keyboard = createAdminKeyboard();
            await sendHTMLMessage(BOT_TOKEN, chat_id, admin_text, admin_keyboard, true);
        }
        
        else if (text.startsWith('/refund')) {
            const args = text.split(' ');
            
            if (user_id.toString() !== BOT_CONFIG.ADMIN_ID.toString()) {
                const not_admin_text = "❌ <b>Access Denied</b>\n\n" +
                                      "🔒 <b>This command is admin-only!</b>\n\n" +
                                      "💡 <b>Need a refund?</b>\n" +
                                      "• Contact @Elabsupport directly\n" +
                                      "• Provide your transaction details\n" +
                                      "• We'll process it for you\n\n" +
                                      "📧 <b>Contact:</b>\n" +
                                      "• Telegram: @Elabsupport\n" +
                                      "• Email: agegnewu13@gmail.com\n\n" +
                                      "<blockquote>Only administrators can process refunds directly.</blockquote>";
                
                await sendHTMLMessage(BOT_TOKEN, chat_id, not_admin_text, null, true);
                return new Response('OK', { status: 200 });
            }

            if (args.length === 1) {
                const usage_text = "💰 <b>Admin Refund System</b>\n\n" +
                                  "🔧 <b>Command Usage:</b>\n" +
                                  "<code>/refund user_id transaction_id</code>\n\n" +
                                  "📋 <b>Parameters:</b>\n" +
                                  "• <code>user_id</code> - The user's Telegram ID\n" +
                                  "• <code>transaction_id</code> - The payment charge ID\n\n" +
                                  "💡 <b>Example:</b>\n" +
                                  "<code>/refund 123456789 987654321</code>\n\n" +
                                  "⚠️ <b>Important:</b>\n" +
                                  "• Only use for legitimate refunds\n" +
                                  "• Verify transaction details first\n" +
                                  "• Keep records of all refunds\n\n" +
                                  "<blockquote>Admin access granted ✅</blockquote>";
                
                await sendHTMLMessage(BOT_TOKEN, chat_id, usage_text, null, true);
                return new Response('OK', { status: 200 });
            }
            
            if (args.length < 3) {
                logError('Invalid refund command format');
                const error_text = "❌ <b>Invalid Command Format</b>\n\n" +
                                  "📋 <b>Correct Usage:</b>\n" +
                                  "<code>/refund user_id transaction_id</code>\n\n" +
                                  "💡 <b>Example:</b>\n" +
                                  "<code>/refund 123456789 987654321</code>\n\n" +
                                  "🔍 <b>What you need:</b>\n" +
                                  "• User's Telegram ID\n" +
                                  "• Payment transaction ID\n\n" +
                                  "<blockquote>Please provide both parameters.</blockquote>";
                
                await sendHTMLMessage(BOT_TOKEN, chat_id, error_text, null, false, null);
                return new Response('Invalid refund command', { status: 200 });
            }
            
            const refundUserId = args[1];
            const chargeId = args[2];
            
            logError(`Admin refund request: user_id=${refundUserId}, charge_id=${chargeId}`);
            
            const processing_text = "⏳ <b>Processing Refund...</b>\n\n" +
                                   "📋 <b>Details:</b>\n" +
                                   `• User ID: <code>${refundUserId}</code>\n` +
                                   `• Transaction ID: <code>${chargeId}</code>\n\n` +
                                   "🔄 <b>Status:</b> Contacting Telegram API...";
            
            await sendHTMLMessage(BOT_TOKEN, chat_id, processing_text, null, false, null);
            await processRefund(chat_id, refundUserId, chargeId);
        }
        
        // Handle user_shared messages
        if (message.user_shared) {
            logError(`=== USER_SHARED DETECTED ===`);
            logError(`Full user_shared object: ${JSON.stringify(message.user_shared, null, 2)}`);
            
            const request_id = message.user_shared.request_id;
            const shared_user_id = message.user_shared.user_id;
            
            logError(`User shared - request_id: ${request_id}, user_id: ${shared_user_id}`);
            
            if (!request_id || !types[request_id]) {
                logError(`Invalid or missing request_id for user_shared: ${JSON.stringify(message.user_shared)}`);
                const response = "⚠️ <b>Error:</b> Invalid user type shared.";
                await sendHTMLMessage(BOT_TOKEN, chat_id, response);
            } else {
                const type = types[request_id].name;
                const effect_id = types[request_id].effect_id;
                
                if (!shared_user_id || shared_user_id === 'Unknown') {
                    logError(`Missing or invalid user_id in user_shared for request_id ${request_id}`);
                    const response = `⚠️ <b>Error:</b> Unable to retrieve ${type} ID.`;
                    await sendHTMLMessage(BOT_TOKEN, chat_id, response, null, false, effect_id);
                } else {
                    const response = `👤 <b>Shared ${type} Info</b>\n🆔 ID: <code>${shared_user_id}</code>`;
                    
                    const link_keyboard = {
                        inline_keyboard: [
                            [
                                { text: '⭐ Donate Stars', callback_data: 'donate_stars' },
                                { text: '🆘 Help', callback_data: 'help' }
                            ]
                        ]
                    };
                    
                    logError(`Sending user info for ${type} with user_id: ${shared_user_id}, effect_id: ${effect_id}`);

                    let messageSent = await sendHTMLMessage(BOT_TOKEN, chat_id, response, link_keyboard, false, effect_id);
                    if (!messageSent) {
                        logError(`Retrying without message_effect_id for ${type}`);
                        messageSent = await sendHTMLMessage(BOT_TOKEN, chat_id, response, link_keyboard, false, null);
                    }
                    
                    if (!messageSent) {
                        logError(`Failed to send message for ${type}`);
                        const fallback_response = `👤 <b>Shared ${type} Info</b>\n🆔 ID: <code>${shared_user_id}</code>`;
                        await sendHTMLMessage(BOT_TOKEN, chat_id, fallback_response, null, false, null);
                    }
                }
            }
        }
        
        // Handle chat_shared messages
        if (message.chat_shared) {
            logError(`=== CHAT_SHARED DETECTED ===`);
            logError(`Full chat_shared object: ${JSON.stringify(message.chat_shared, null, 2)}`);
            
            const request_id = message.chat_shared.request_id;
            const shared_chat_id = message.chat_shared.chat_id;
            
            logError(`Chat shared - request_id: ${request_id}, chat_id: ${shared_chat_id}`);
            
            if (!request_id || !types[request_id]) {
                logError(`Invalid or missing request_id for chat_shared: ${JSON.stringify(message.chat_shared)}`);
                const response = "⚠️ <b>Error:</b> Invalid chat type shared.";
                await sendHTMLMessage(BOT_TOKEN, chat_id, response);
            } else {
                const type = types[request_id].name;
                const effect_id = types[request_id].effect_id;
                
                if (!shared_chat_id || shared_chat_id === 'Unknown') {
                    logError(`Missing or invalid chat_id in chat_shared for request_id ${request_id}`);
                    const response = `⚠️ <b>Error:</b> Unable to retrieve ${type} ID.`;
                    await sendHTMLMessage(BOT_TOKEN, chat_id, response, null, false, effect_id);
                } else {
                    const response = `💬 <b>Shared ${type} Info</b>\n🆔 ID: <code>${shared_chat_id}</code>`;
                    
                    const link_keyboard = {
                        inline_keyboard: [
                            [
                                { text: '⭐ Donate Stars', callback_data: 'donate_stars' },
                                { text: '🆘 Help', callback_data: 'help' }
                            ]
                        ]
                    };
                    
                    logError(`Sending chat info for ${type} with chat_id: ${shared_chat_id}, effect_id: ${effect_id}`);
                    
                    let messageSent = await sendHTMLMessage(BOT_TOKEN, chat_id, response, link_keyboard, false, effect_id);
                    if (!messageSent) {
                        logError(`Retrying without message_effect_id for ${type}`);
                        messageSent = await sendHTMLMessage(BOT_TOKEN, chat_id, response, link_keyboard, false, null);
                    }
                    
                    if (!messageSent) {
                        logError(`Failed to send message for ${type}`);
                        const fallback_response = `💬 <b>Shared ${type} Info</b>\n🆔 ID: <code>${shared_chat_id}</code>`;
                        await sendHTMLMessage(BOT_TOKEN, chat_id, fallback_response, null, false, null);
                    }
                }
            }
        }
        
        // Handle forwarded messages
        if (message.forward_from || message.forward_from_chat || message.forward_origin) {
            logError(`=== FORWARDED MESSAGE DETECTED ===`);
            
            if (message.forward_origin) {
                const origin = message.forward_origin;
                const forward_date = message.forward_date ? new Date(message.forward_date * 1000).toLocaleString() : 'Unknown';
                
                logError(`Forward origin type: ${origin.type}`);
                
                switch (origin.type) {
                    case 'user':
                        const user = origin.sender_user;
                        if (user) {
                            const user_id = user.id;
                            const first_name = user.first_name || '';
                            const last_name = user.last_name || '';
                            const username = user.username ? '@' + user.username : 'No username';
                            const is_premium = user.is_premium ? 'Yes' : 'No';
                            const is_bot = user.is_bot ? 'Yes' : 'No';
                            
                            const forward_response = "👤 <b>Forwarded User Info</b>\n🆔 ID: <code>" + user_id + "</code>\n📝 Name: " + first_name + " " + last_name + "\n🔗 Username: " + username + "\n⭐ Premium: " + is_premium + "\n🤖 Bot: " + is_bot + "\n📅 Forwarded: " + forward_date;
                            await sendHTMLMessage(BOT_TOKEN, chat_id, forward_response, null, false, null);
                        }
                        break;
                        
                    case 'chat':
                        const chat = origin.sender_chat;
                        if (chat) {
                            const chat_id = chat.id;
                            const title = chat.title || 'No title';
                            const username = chat.username ? '@' + chat.username : 'No username';
                            const type = chat.type || 'Unknown';
                            
                            let chat_type_emoji = '💬';
                            let chat_type_name = 'Chat';
                            
                            switch (type) {
                                case 'group':
                                    chat_type_emoji = '👥';
                                    chat_type_name = 'Group';
                                    break;
                                case 'supergroup':
                                    chat_type_emoji = '👥';
                                    chat_type_name = 'Supergroup';
                                    break;
                                case 'channel':
                                    chat_type_emoji = '📢';
                                    chat_type_name = 'Channel';
                                    break;
                            }
                            
                            const forward_response = chat_type_emoji + " <b>Forwarded " + chat_type_name + " Info</b>\n🆔 ID: <code>" + chat_id + "</code>\n📝 Title: " + title + "\n🔗 Username: " + username + "\n📋 Type: " + chat_type_name + "\n📅 Forwarded: " + forward_date;
                            await sendHTMLMessage(BOT_TOKEN, chat_id, forward_response, null, false, null);
                        }
                        break;
                        
                    case 'hidden_user':
                        const sender_name = message.forward_sender_name || 'Hidden User';
                        const hidden_response = "🔒 <b>Hidden User Detected</b>\n\n👤 <b>Sender:</b> " + sender_name + "\n📅 <b>Forwarded:</b> " + forward_date + "\n\n⚠️ <b>User details are private!</b>\n\n💡 <b>To get this user's ID:</b>\n• Use the \"👤 User\" button below\n• Share this user's contact\n• The bot will then show the user ID";
                        await sendHTMLMessage(BOT_TOKEN, chat_id, hidden_response, null, false, null);
                        break;
                }
            }
        }
        
        // Handle any other messages (non-commands)
        if (text && !text.startsWith('/') && !message.user_shared && !message.chat_shared && !message.forward_from && !message.forward_from_chat && !message.forward_origin) {
            const default_response = `👋 <b>Hello there!</b>\n\nI'm a Chat ID Finder Bot that helps you get IDs for users, groups, and channels.\n\n💡 <b>To get started:</b>\n• Send <code>/start</code> to begin\n• Use the keyboard buttons to share contacts\n• Forward messages to get user/chat info\n\n🔧 <b>Available Commands:</b>\n• <code>/start</code> - Start the bot\n• <code>/help</code> - Show help\n• <code>/me</code> - Get your ID\n• <code>/about</code> - About the bot\n• <code>/donate</code> - Support us\n\n<blockquote>Send /start to begin! 🛠 Made with ❤️ By @Elabcode | Support: @Elabsupport</blockquote>`;
            
            const inline_keyboard = createInlineKeyboard();
            await sendHTMLMessage(BOT_TOKEN, chat_id, default_response, inline_keyboard, true);
        }
        
        return new Response('OK', { status: 200 });
        
    } catch (error) {
        logError(`Error processing request: ${error.message}`);
        return new Response('Internal Server Error', { status: 500 });
    }
}

export default {
    async fetch(request, env, ctx) {
        return handleRequest(request);
    }
};
