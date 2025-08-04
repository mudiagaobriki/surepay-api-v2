// backend-test.js - Test Paystack connection
import axios from "axios";
const testPaystackConnection = async () => {
    try {
        const response = await axios.get('https://api.paystack.co/bank', {
            headers: {
                Authorization: `Bearer ${process.env.PAYSTACK_SECRET_KEY}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Paystack connection successful');
        console.log('Banks count:', response.data.data.length);
        return true;
    } catch (error) {
        console.error('❌ Paystack connection failed:', error.response?.data || error.message);
        return false;
    }
};

testPaystackConnection();