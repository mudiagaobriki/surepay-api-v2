// test-monnify-direct.js
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const testMonnifyDirect = async () => {
    try {
        console.log('🔄 Testing Monnify API directly...');

        const apiKey = process.env.MONNIFY_API_KEY;
        const secretKey = process.env.MONNIFY_SECRET_KEY;
        const baseUrl = process.env.MONNIFY_BASE_URL;

        console.log('Using base URL:', baseUrl);
        console.log('Using API Key:', apiKey.substring(0, 15) + '...');

        // Test 1: Basic Auth
        const credentials = `${apiKey}:${secretKey}`;
        const encodedCredentials = Buffer.from(credentials).toString('base64');

        console.log('\n🔄 Testing authentication...');
        console.log('Auth header preview:', encodedCredentials.substring(0, 30) + '...');

        // Try the exact request
        const authResponse = await axios({
            method: 'POST',
            url: `${baseUrl}/api/v1/auth/login`,
            headers: {
                'Authorization': `Basic ${encodedCredentials}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            timeout: 30000,
            validateStatus: function (status) {
                return status < 500; // Don't throw error for 4xx status codes
            }
        });

        console.log('\n📊 Response Details:');
        console.log('Status:', authResponse.status);
        console.log('Status Text:', authResponse.statusText);
        console.log('Headers:', JSON.stringify(authResponse.headers, null, 2));
        console.log('Data:', JSON.stringify(authResponse.data, null, 2));

        if (authResponse.status === 200 && authResponse.data.requestSuccessful) {
            console.log('✅ Authentication successful!');

            const accessToken = authResponse.data.responseBody.accessToken;
            console.log('Access token preview:', accessToken.substring(0, 20) + '...');

            // Test 2: Try creating a virtual account
            console.log('\n🔄 Testing virtual account creation...');

            const accountPayload = {
                accountReference: `test-${Date.now()}`,
                accountName: 'Test User Account',
                currencyCode: 'NGN',
                contractCode: process.env.MONNIFY_CONTRACT_CODE,
                customerEmail: 'test@example.com',
                customerName: 'Test User',
                getAllAvailableBanks: false,
                preferredBanks: ["035", "058"]
            };

            console.log('Account payload:', JSON.stringify(accountPayload, null, 2));

            const accountResponse = await axios({
                method: 'POST',
                url: `${baseUrl}/api/v2/bank-transfer/reserved-accounts`,
                headers: {
                    'Authorization': `Bearer ${accessToken}`,
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                data: accountPayload,
                timeout: 60000,
                validateStatus: function (status) {
                    return status < 500;
                }
            });

            console.log('\n📊 Virtual Account Response:');
            console.log('Status:', accountResponse.status);
            console.log('Data:', JSON.stringify(accountResponse.data, null, 2));

            if (accountResponse.status === 200 && accountResponse.data.requestSuccessful) {
                console.log('✅ Virtual account creation successful!');
            } else {
                console.log('❌ Virtual account creation failed');
            }

        } else {
            console.log('❌ Authentication failed');

            if (authResponse.status === 401) {
                console.log('\n🚨 401 Unauthorized - Your credentials might be:');
                console.log('1. From a different environment (prod vs sandbox)');
                console.log('2. Expired or regenerated');
                console.log('3. Not properly activated');
                console.log('\n💡 Try:');
                console.log('- Log into https://app-sandbox.monnify.com/');
                console.log('- Go to Settings > API Keys');
                console.log('- Copy fresh credentials');
                console.log('- Make sure your account is activated');
            }
        }

    } catch (error) {
        console.error('❌ Test failed with error:');
        console.error('Error type:', error.constructor.name);
        console.error('Message:', error.message);

        if (error.code) {
            console.error('Error code:', error.code);
        }

        if (error.response) {
            console.error('Response status:', error.response.status);
            console.error('Response data:', JSON.stringify(error.response.data, null, 2));
        }
    }
};

testMonnifyDirect();