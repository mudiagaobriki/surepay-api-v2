// debug-webhook-signatures.cjs - Debug webhook signature issues
import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'https://hovapay-api.onrender.com';
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || 'sk_test_your_actual_paystack_secret_key';

// Debug Paystack signature generation vs server expectation
async function debugPaystackSignature() {
    console.log('\n🔍 DEBUGGING PAYSTACK SIGNATURE VERIFICATION');
    console.log('='.repeat(60));

    const payload = {
        event: 'charge.success',
        data: {
            id: 123456,
            status: 'success',
            reference: `debug_test_${Date.now()}`,
            amount: 100000,
            currency: 'NGN',
            paid_at: new Date().toISOString(),
            channel: 'card'
        }
    };

    console.log('1. Payload Object:');
    console.log(JSON.stringify(payload, null, 2));

    console.log('\n2. Payload Serialization Tests:');

    // Test different serialization methods
    const serializations = [
        { name: 'JSON.stringify(payload)', value: JSON.stringify(payload) },
        { name: 'JSON.stringify(payload, null, 0)', value: JSON.stringify(payload, null, 0) },
        { name: 'JSON.stringify(payload, null, 2)', value: JSON.stringify(payload, null, 2) },
        { name: 'JSON.stringify(payload).replace(/\\s/g, "")', value: JSON.stringify(payload).replace(/\s/g, '') }
    ];

    const signatures = {};

    serializations.forEach((ser, index) => {
        const signature = crypto
            .createHmac('sha512', PAYSTACK_SECRET)
            .update(ser.value)
            .digest('hex');

        signatures[ser.name] = signature;

        console.log(`\n${index + 1}. ${ser.name}:`);
        console.log(`   Length: ${ser.value.length}`);
        console.log(`   Preview: ${ser.value.substring(0, 100)}...`);
        console.log(`   Signature: ${signature}`);
    });

    console.log('\n3. Testing Against Server:');

    // Test each signature against the server
    for (const [method, signature] of Object.entries(signatures)) {
        try {
            console.log(`\nTesting ${method}:`);
            console.log(`Signature: ${signature}`);

            const response = await axios.post(`${BASE_URL}/api/wallet/webhook/paystack`, payload, {
                headers: {
                    'X-Paystack-Signature': signature,
                    'Content-Type': 'application/json',
                    'User-Agent': 'PaystackBot/1.0'
                },
                timeout: 10000,
                validateStatus: () => true // Accept all status codes
            });

            console.log(`Response: ${response.status} - ${JSON.stringify(response.data)}`);

            if (response.data.status === 'success') {
                console.log(`✅ SUCCESS with method: ${method}`);
                return { method, signature, success: true };
            }
        } catch (error) {
            console.log(`❌ ERROR with ${method}: ${error.message}`);
        }
    }

    return { success: false };
}

// Test if the server is receiving the correct data
async function debugServerReceive() {
    console.log('\n🔍 DEBUGGING SERVER DATA RECEPTION');
    console.log('='.repeat(60));

    const payload = {
        event: 'charge.success',
        data: {
            reference: `debug_receive_${Date.now()}`,
            amount: 50000
        }
    };

    // Use a known incorrect signature to see server logs
    const incorrectSignature = 'incorrect_signature_for_debugging';

    try {
        const response = await axios.post(`${BASE_URL}/api/wallet/webhook/paystack`, payload, {
            headers: {
                'X-Paystack-Signature': incorrectSignature,
                'Content-Type': 'application/json',
                'User-Agent': 'DebugBot/1.0'
            },
            timeout: 10000,
            validateStatus: () => true
        });

        console.log('Server response with incorrect signature:');
        console.log('Status:', response.status);
        console.log('Data:', JSON.stringify(response.data, null, 2));
        console.log('Headers:', response.headers);

        return response.data;
    } catch (error) {
        console.error('Debug request failed:', error.message);
        return null;
    }
}

// Test signature verification endpoint directly if available
async function testSignatureEndpoint() {
    console.log('\n🔍 TESTING SIGNATURE VERIFICATION ENDPOINT');
    console.log('='.repeat(60));

    // Create a simple test payload
    const testPayload = { test: 'data', timestamp: Date.now() };
    const testSignature = crypto
        .createHmac('sha512', PAYSTACK_SECRET)
        .update(JSON.stringify(testPayload))
        .digest('hex');

    console.log('Test payload:', testPayload);
    console.log('Test signature:', testSignature);

    // If you have a debug endpoint, test it here
    console.log('Note: Create a debug endpoint in your server to test signature verification directly');
    console.log(`POST /api/wallet/debug/verify-signature`);
    console.log(`Body: { payload: ${JSON.stringify(testPayload)}, signature: "${testSignature}" }`);
}

// Main debug function
async function runDebugTests() {
    console.log('🚀 STARTING WEBHOOK SIGNATURE DEBUG SESSION');
    console.log('='.repeat(60));
    console.log('Base URL:', BASE_URL);
    console.log('Paystack Secret Key:', PAYSTACK_SECRET ? 'SET' : 'NOT SET');
    console.log('Secret Key Length:', PAYSTACK_SECRET ? PAYSTACK_SECRET.length : 0);

    if (PAYSTACK_SECRET && PAYSTACK_SECRET.startsWith('sk_test_')) {
        console.log('✅ Using test secret key (starts with sk_test_)');
    } else if (PAYSTACK_SECRET && PAYSTACK_SECRET.startsWith('sk_live_')) {
        console.log('⚠️  Using live secret key (starts with sk_live_)');
    } else {
        console.log('❌ Secret key format not recognized');
    }

    // Test 1: Debug signature generation methods
    const signatureResult = await debugPaystackSignature();

    // Test 2: Debug server data reception
    await debugServerReceive();

    // Test 3: Test signature endpoint (informational)
    await testSignatureEndpoint();

    console.log('\n' + '='.repeat(60));
    console.log('🎯 DEBUG SUMMARY:');
    console.log('='.repeat(60));

    if (signatureResult.success) {
        console.log(`✅ SOLUTION FOUND: Use ${signatureResult.method}`);
        console.log(`Working signature: ${signatureResult.signature}`);
    } else {
        console.log('❌ NO WORKING SIGNATURE FOUND');
        console.log('Check server logs for PaymentService verification details');
        console.log('Ensure your PaymentService.verifyWebhookSignature() method is implemented correctly');
    }

    console.log('\n🔧 NEXT STEPS:');
    console.log('1. Check server logs for PaymentService signature verification');
    console.log('2. Ensure PAYSTACK_SECRET_KEY environment variable matches test script');
    console.log('3. Update PaymentService with the fixed signature verification code');
    console.log('4. Add debug logging to your webhook handler');
}

// Run if called directly
// if (require.main === module) {
    runDebugTests().catch(console.error);
// }

export default {
    debugPaystackSignature,
    debugServerReceive,
    testSignatureEndpoint,
    runDebugTests
};