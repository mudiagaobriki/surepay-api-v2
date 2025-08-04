import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const http = async (url) => {
    try {
        const { data } = await axios(url, {
            params: {
                api_token: process.env.DATA_TOKEN,
            },
        });
        return data;
    } catch (e) {
        console.error(e);
    }
};

export default http;
