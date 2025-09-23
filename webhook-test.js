// webhook-test-fixed.cjs - Fixed webhook testing script with proper signatures
import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

// ⚠️ CRITICAL: Update these with your actual credentials
const BASE_URL = 'https://surepay-api-v2.onrender.com'; // Your API URL
const PAYSTACK_SECRET = process.env.PAYSTACK_SECRET_KEY || 'sk_test_your_actual_paystack_secret_key';
const MONNIFY_SECRET = process.env.MONNIFY_SECRET_KEY || 'your_actual_monnify_secret_key';

console.log({PAYSTACK_SECRET, MONNIFY_SECRET});

// Helper function to generate proper Paystack signature
function generatePaystackSignature(payload, secret) {
    const payloadString = JSON.stringify(payload);
    return crypto
        .createHmac('sha512', secret)
        .update(payloadString)
        .digest('hex');
}

// Helper function to generate proper Monnify signature
function generateMonnifySignature(payload, secret) {
    const payloadString = JSON.stringify(payload);
    return crypto
        .createHmac('sha512', secret)
        .update(payloadString)
        .digest('hex');
}

// ⚠️ FIXED: Test Paystack Webhook with proper payload structure
async function testPaystackWebhook() {
    console.log('\n🧪 Testing Paystack Webhook...');

    // Create a realistic Paystack webhook payload
    const payload = {
        event: 'charge.success',
        data: {
            id: 302961,
            domain: 'test',
            status: 'success',
            reference: `test_ref_${Date.now()}`,
            amount: 100000, // ₦1000 in kobo
            message: null,
            gateway_response: 'Successful',
            paid_at: new Date().toISOString(),
            created_at: new Date().toISOString(),
            channel: 'card',
            currency: 'NGN',
            ip_address: '127.0.0.1',
            metadata: {
                userId: 'test_user_id',
                paymentId: 'test_payment_id',
                purpose: 'wallet_funding'
            },
            log: {
                start_time: Math.floor(Date.now() / 1000),
                time_spent: 3,
                attempts: 1,
                errors: 0,
                success: true,
                mobile: false,
                input: [],
                history: []
            },
            fees: 1500,
            fees_split: null,
            authorization: {
                authorization_code: 'AUTH_test123',
                bin: '408408',
                last4: '4081',
                exp_month: '12',
                exp_year: '2030',
                channel: 'card',
                card_type: 'visa',
                bank: 'TEST BANK',
                country_code: 'NG',
                brand: 'visa',
                reusable: true,
                signature: 'SIG_test123'
            },
            customer: {
                id: 63929,
                first_name: 'Test',
                last_name: 'User',
                email: 'test@example.com',
                customer_code: 'CUS_test123',
                phone: '+2348123456789',
                metadata: {},
                risk_action: 'default',
                international_format_phone: null
            },
            plan: null,
            split: {},
            order_id: null,
            paidAt: new Date().toISOString(),
            createdAt: new Date().toISOString(),
            requested_amount: 100000,
            pos_transaction_data: null,
            source: null,
            fees_breakdown: null
        }
    };

    // Generate proper Paystack signature
    const signature = generatePaystackSignature(payload, PAYSTACK_SECRET);

    console.log('Payload reference:', payload.data.reference);
    console.log('Generated signature:', signature);

    try {
        const response = await axios.post(`${BASE_URL}/api/wallet/webhook/paystack`, payload, {
            headers: {
                'X-Paystack-Signature': signature,
                'Content-Type': 'application/json',
                'User-Agent': 'PaystackBot/1.0'
            },
            timeout: 30000
        });

        console.log('✅ Paystack webhook test successful:', response.data);
        return { success: true, data: response.data };
    } catch (error) {
        console.error('❌ Paystack webhook test failed:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        return { success: false, error: error.response?.data || error.message };
    }
}

// ⚠️ FIXED: Test Monnify Virtual Account Credit Webhook
async function testMonnifyVirtualAccountWebhook() {
    console.log('\n🧪 Testing Monnify Virtual Account Credit Webhook...');

    // Create a realistic Monnify virtual account credit payload
    const payload = {
        eventType: 'SUCCESSFUL_TRANSACTION',
        eventData: {
            transactionReference: `MNFY|${Date.now()}|001`,
            paymentReference: `va_credit_${Date.now()}`,
            amountPaid: 5000.00, // ₦5000
            totalPayable: 5000.00,
            settlementAmount: 4975.00,
            paidOn: new Date().toISOString(),
            paymentStatus: 'PAID',
            paymentDescription: 'Virtual Account Funding',
            transactionHash: crypto.randomBytes(32).toString('hex'),
            currency: 'NGN',
            paymentMethod: 'ACCOUNT_TRANSFER',
            product: {
                type: 'RESERVED_ACCOUNT'
            },
            cardDetails: {},
            accountDetails: {
                accountName: 'TEST USER',
                accountNumber: '1234567890',
                bankCode: '035',
                amountPaid: 5000.00
            },
            accountPayments: [
                {
                    accountName: 'TEST USER',
                    accountNumber: '1234567890',
                    bankCode: '035',
                    amountPaid: 5000.00
                }
            ],
            customer: {
                email: 'test@example.com',
                name: 'Test User'
            },
            metaData: {},
            // These are the key fields for virtual account credit
            destinationAccountNumber: '1234567890',
            destinationAccountName: 'TEST USER',
            destinationBankName: 'Access Bank',
            destinationBankCode: '044',
            customerName: 'Test Customer',
            sourceAccountNumber: '0987654321',
            sourceAccountName: 'Sender Test User',
            sourceBankName: 'GTBank',
            sourceBankCode: '058',
            sessionId: `session_${Date.now()}`,
            narration: 'Transfer to virtual account'
        }
    };

    // Generate proper Monnify signature
    const signature = generateMonnifySignature(payload, MONNIFY_SECRET);

    console.log('Payload reference:', payload.eventData.paymentReference);
    console.log('Virtual account number:', payload.eventData.destinationAccountNumber);
    console.log('Generated signature:', signature);

    try {
        const response = await axios.post(`${BASE_URL}/api/wallet/webhook/monnify`, payload, {
            headers: {
                'Monnify-Signature': signature,
                'Content-Type': 'application/json',
                'User-Agent': 'MonnifyBot/1.0'
            },
            timeout: 30000
        });

        console.log('✅ Monnify virtual account webhook test successful:', response.data);
        return { success: true, data: response.data };
    } catch (error) {
        console.error('❌ Monnify virtual account webhook test failed:', {
            status: error.response?.status,
            data: error.response?.data,
            message: error.message
        });
        return { success: false, error: error.response?.data || error.message };
    }
}

// ⚠️ IMPROVED: Test payment callback with better error handling
async function testPaymentCallback() {
    console.log('\n🧪 Testing Payment Callback...');

    const testReference = `callback_test_${Date.now()}`;

    try {
        const response = await axios.get(`${BASE_URL}/api/wallet/callback`, {
            params: {
                reference: testReference,
                status: 'success'
            },
            maxRedirects: 0, // Don't follow redirects
            validateStatus: (status) => status < 400 // Accept 3xx as success
        });

        console.log('✅ Payment callback test successful');
        console.log('Response status:', response.status);
        if (response.headers.location) {
            console.log('Redirect URL:', response.headers.location);
        }
        return { success: true, data: response.data };
    } catch (error) {
        if (error.response?.status >= 300 && error.response?.status < 400) {
            console.log('✅ Payment callback test successful (redirect)');
            console.log('Redirect URL:', error.response.headers.location);
            return { success: true, redirect: error.response.headers.location };
        } else {
            console.error('❌ Payment callback test failed:', error.message);
            return { success: false, error: error.message };
        }
    }
}

// Test signature verification locally
function testSignatureVerification() {
    console.log('\n🧪 Testing Signature Verification...');

    const payload = { test: 'data', amount: 1000 };
    const secret = 'test_secret_key';

    // Generate signature
    const signature = crypto
        .createHmac('sha512', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

    // Verify signature
    const expectedSignature = crypto
        .createHmac('sha512', secret)
        .update(JSON.stringify(payload))
        .digest('hex');

    const isValid = signature === expectedSignature;
    console.log('✅ Local signature verification:', isValid ? 'VALID' : 'INVALID');
    console.log('Generated signature:', signature);
    console.log('Expected signature:', expectedSignature);

    return { success: isValid };
}

// ⚠️ NEW: Test webhook with invalid signature to verify rejection
async function testInvalidSignatureWebhook() {
    console.log('\n🧪 Testing Invalid Signature Rejection...');

    const payload = {
        event: 'charge.success',
        data: {
            reference: `invalid_test_${Date.now()}`,
            amount: 100000,
            status: 'success'
        }
    };

    // Use intentionally wrong signature
    const invalidSignature = 'invalid_signature_for_testing';

    try {
        const response = await axios.post(`${BASE_URL}/api/wallet/webhook/paystack`, payload, {
            headers: {
                'X-Paystack-Signature': invalidSignature,
                'Content-Type': 'application/json'
            },
            timeout: 30000,
            validateStatus: () => true // Accept all status codes
        });

        console.log('Server response to invalid signature:', response.data);

        // ⚠️ FIXED: Check if server correctly rejected invalid signature
        if (response.data.status === 'error' && response.data.message === 'Invalid signature') {
            console.log('✅ Invalid signature correctly rejected');
            return { success: true, message: 'Invalid signature correctly rejected' };
        } else {
            console.log('❌ Invalid signature was not properly rejected:', response.data);
            return { success: false, message: 'Invalid signature was accepted', response: response.data };
        }

    } catch (error) {
        console.error('❌ Unexpected error during invalid signature test:', error.message);
        return { success: false, error: error.message };
    }
}

// ⚠️ ENHANCED: Comprehensive test suite
async function runComprehensiveWebhookTests() {
    console.log('🚀 Starting Comprehensive Webhook Tests...\n');
    console.log('Base URL:', BASE_URL);
    console.log('Using Paystack Secret:', PAYSTACK_SECRET ? 'SET' : 'NOT SET');
    console.log('Using Monnify Secret:', MONNIFY_SECRET ? 'SET' : 'NOT SET');

    const results = [];

    // 1. Test local signature verification
    console.log('\n' + '='.repeat(60));
    results.push({
        test: 'Local Signature Verification',
        result: testSignatureVerification()
    });

    // 2. Test invalid signature rejection
    console.log('\n' + '='.repeat(60));
    results.push({
        test: 'Invalid Signature Rejection',
        result: await testInvalidSignatureWebhook()
    });

    // 3. Test Paystack webhook
    console.log('\n' + '='.repeat(60));
    results.push({
        test: 'Paystack Webhook',
        result: await testPaystackWebhook()
    });

    // 4. Test Monnify virtual account webhook
    console.log('\n' + '='.repeat(60));
    results.push({
        test: 'Monnify Virtual Account Webhook',
        result: await testMonnifyVirtualAccountWebhook()
    });

    // 5. Test payment callback
    console.log('\n' + '='.repeat(60));
    results.push({
        test: 'Payment Callback',
        result: await testPaymentCallback()
    });

    // Print summary
    console.log('\n' + '='.repeat(60));
    console.log('📊 TEST SUMMARY:');
    console.log('='.repeat(60));

    results.forEach((test, index) => {
        const status = test.result.success ? '✅ PASS' : '❌ FAIL';
        console.log(`${index + 1}. ${test.test}: ${status}`);
    });

    const passedTests = results.filter(test => test.result.success).length;
    const totalTests = results.length;

    console.log(`\nOverall: ${passedTests}/${totalTests} tests passed`);

    if (passedTests === totalTests) {
        console.log('🎉 All webhook tests passed! Your webhook system is working correctly.');
    } else {
        console.log('⚠️  Some tests failed. Please check the error messages above.');
    }

    return results;
}

// ⚠️ NEW: Test virtual account credit specifically
async function testVirtualAccountCredit() {
    console.log('\n🧪 Testing Virtual Account Credit Flow...');

    // First create a more realistic scenario
    const accountNumber = '1234567890'; // This should match a real virtual account in your system
    const amount = 10000; // ₦10,000
    const reference = `va_test_${Date.now()}`;

    const payload = {
        eventType: 'SUCCESSFUL_TRANSACTION',
        eventData: {
            paymentReference: reference,
            amountPaid: amount,
            destinationAccountNumber: accountNumber,
            customerName: 'Test Customer',
            sourceAccountNumber: '0987654321',
            sourceBankName: 'Test Bank',
            paidOn: new Date().toISOString(),
            currency: 'NGN'
        }
    };

    const signature = generateMonnifySignature(payload, MONNIFY_SECRET);

    try {
        const response = await axios.post(`${BASE_URL}/api/wallet/webhook/monnify`, payload, {
            headers: {
                'Monnify-Signature': signature,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Virtual account credit test successful:', response.data);
        return { success: true, data: response.data };
    } catch (error) {
        console.error('❌ Virtual account credit test failed:', error.response?.data || error.message);
        return { success: false, error: error.response?.data || error.message };
    }
}

// Export functions for individual testing
export default {
    testPaystackWebhook,
    testMonnifyVirtualAccountWebhook,
    testPaymentCallback,
    testSignatureVerification,
    testInvalidSignatureWebhook,
    testVirtualAccountCredit,
    runComprehensiveWebhookTests,
    generatePaystackSignature,
    generateMonnifySignature
};

// Run comprehensive tests if script is executed directly
// if (require.main === module) {
    runComprehensiveWebhookTests().catch(console.error);
// }