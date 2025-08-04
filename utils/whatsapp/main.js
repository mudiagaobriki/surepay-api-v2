const { Client } = require('whatsapp-web.js');
const qrcode = require('qrcode-terminal');

const client = new Client();

async function sendWhatsAppMessages(numbers, message) {
    try {
        client.on('qr', (qr) => {
            qrcode.generate(qr, { small: true });
        });

        client.on('authenticated', (session) => {
            console.log('Authenticated');
        });

        await client.initialize();

        for (const number of numbers) {
            await client.sendMessage(number, message);
            console.log(`Message sent to ${number}`);
        }
    } catch (error) {
        console.error('Error sending WhatsApp message:', error);
    }
}

// Example usage
const numbers = ['+2348138885831']; // Array of WhatsApp numbers (without 'whatsapp:')
const message = 'Hello from whatsapp-web.js! This is a test message.'; // Message content
sendWhatsAppMessages(numbers, message);
