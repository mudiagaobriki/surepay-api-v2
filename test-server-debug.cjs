// test-server-debug.cjs - Test the server debug endpoint
const crypto = require('crypto');
const axios = require('axios');

const BASE_URL = 'https://surepay-api-v2.onrender.com';
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || 'sk_test_your_actual_paystack_secret_key';

async function testServerDebugEndpoint() {
    console.log('🔍 TESTING SERVER DEBUG ENDPOINT');
    console.log('='.repeat(50));

    const payload = {
        event: 'charge.success',
        data: {
            reference: `server_debug_${Date.now()}`,
            amount: 50000,
            status: 'success'
        }
    };

    // Generate signature using same method as test
    const signature = crypto
        .createHmac('sha512', PAYSTACK_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex');

    console.log('Test payload:', payload);
    console.log('Client secret length:', PAYSTACK_SECRET.length);
    console.log('Client secret preview:', PAYSTACK_SECRET.substring(0, 10) + '...');
    console.log('Generated signature:', signature);

    try {
        const response = await axios.post(`${BASE_URL}/api/wallet/debug/verify-signature?gateway=paystack`, payload, {
            headers: {
                'X-Paystack-Signature': signature,
                'Content-Type': 'application/json'
            },
            timeout: 15000
        });

        console.log('\n📊 SERVER RESPONSE:');
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));

        // Analyze the response
        const data = response.data;

        if (data.serverInfo) {
            console.log('\n🔍 SERVER ENVIRONMENT ANALYSIS:');
            console.log('Server Paystack Secret Length:', data.serverInfo.paystackSecretLength);
            console.log('Client Paystack Secret Length:', PAYSTACK_SECRET.length);
            console.log('Server Secret Preview:', data.serverInfo.paystackSecretPreview);
            console.log('Client Secret Preview:', PAYSTACK_SECRET.substring(0, 10) + '...');

            if (data.serverInfo.paystackSecretLength !== PAYSTACK_SECRET.length) {
                console.log('❌ SECRET KEY LENGTH MISMATCH!');
                console.log('This is likely the root cause of signature verification failures.');
            } else {
                console.log('✅ Secret key lengths match');
            }
        }

        if (data.signatureTests) {
            console.log('\n🧪 SIGNATURE TEST RESULTS:');
            data.signatureTests.forEach((test, index) => {
                console.log(`${index + 1}. ${test.method}:`);
                console.log(`   Matches: ${test.matches ? '✅' : '❌'}`);
                console.log(`   Server Signature: ${test.signature}`);
                console.log(`   Client Signature: ${signature}`);
                console.log(`   Match: ${test.signature === signature}`);
            });
        }

        console.log('\n🎯 RECOMMENDATION:', data.recommendation);

        return data;

    } catch (error) {
        console.error('❌ Debug endpoint test failed:', error.message);
        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', error.response.data);
        }
        return null;
    }
}

// Run the test
if (require.main === module) {
    testServerDebugEndpoint().catch(console.error);
}

module.exports = { testServerDebugEndpoint };