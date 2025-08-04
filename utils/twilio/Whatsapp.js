import dotenv from 'dotenv';
import twilio from 'twilio';

dotenv.config();

const { TWILIO_ACCOUNT_SSID, TWILIO_AUTH_TOKEN } = process.env;
const twilioNumber = 'whatsapp:+14155238886'; // Your Twilio WhatsApp number
const client = twilio(TWILIO_ACCOUNT_SSID, TWILIO_AUTH_TOKEN);

const WhatsAppController = () => {
    const sendWhatsAppMessages = async (req, res) => {
        try {
            const { message, numbers } = req.body ?? {};

            if (!message || !numbers || numbers.length === 0) {
                return res.status(400).json({ status: 'error', msg: 'Message or numbers are missing.' });
            }

            for (const number of numbers) {
                await client.messages.create({
                    body: message,
                    from: twilioNumber,
                    to: number, // Use valid WhatsApp phone number format here
                });

                console.log(`Message sent to ${number}`);
            }

            return res.status(200).json({ status: 'success', msg: 'Messages sent successfully' });
        } catch (error) {
            console.error('Error sending WhatsApp message:', error);
            return res.status(500).json({ status: 'error', msg: 'Failed to send message' });
        }
    };

    return {
        sendWhatsAppMessages,
    };
};

export default WhatsAppController;
