import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const apiKey = process.env.BULKSMSNG_API_KEY; // API key for Bulk SMS Nigeria
const apiUrl = 'https://www.bulksmsnigeria.com/api/v1/sms/create';

const Sms = () => {
    const sendSMS = async (from, to, body) => {
        const data = {
            api_token: apiKey,
            from,
            to,
            body,
            dnd: 2,
        };

        try {
            const posted = await axios.post(apiUrl, data);

            if (posted) {
                console.log('Data: ', posted?.data);
                return {
                    statusCode: 200, // represents success
                    status: 'success',
                    data: posted?.data,
                };
            }
        } catch (e) {
            return {
                statusCode: 400, // represents error
                status: 'failed',
                message: `Error in sending SMS: ${e?.toString()}`,
            };
        }
    };

    return {
        sendSMS,
    };
};

export default Sms;
