import dotenv from 'dotenv';
import twilio from 'twilio';

dotenv.config();

const { TWILIO_ACCOUNT_SSID, TWILIO_AUTH_TOKEN } = process.env; // Destructuring for clarity
const twilioNumber = '+15162520183'; // Your Twilio WhatsApp number
const client = twilio(TWILIO_ACCOUNT_SSID, TWILIO_AUTH_TOKEN);

const recipientNumbers = ['+2348138885831'];

const sendMessage = async (recipient) => {
    try {
        const message = await client.messages.create({
            body: 'Hello from Twilio!',
            from: twilioNumber,
            to: recipient,
        });

        console.log(`Message sent to ${recipient}: ${message.sid}`);
    } catch (error) {
        console.error(`Error sending message to ${recipient}: ${error}`);
    }
};

recipientNumbers.forEach(sendMessage);
