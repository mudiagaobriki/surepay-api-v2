// test-virtual-account-flow.js - Test the complete virtual account credit flow
import crypto from 'crypto';
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

const BASE_URL = 'https://hovapay-api.onrender.com';
const MONNIFY_SECRET = process.env.MONNIFY_SECRET_KEY;
const AUTH_TOKEN = process.env.TEST_AUTH_TOKEN; // You'll need to set this

// Step 1: Create a test user and virtual account
async function createTestVirtualAccount() {
    console.log('🧪 Step 1: Creating test virtual account...');

    try {
        // Create virtual account for a test user
        const response = await axios.post(`${BASE_URL}/api/wallet/virtual-account`, {}, {
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Virtual account created:', response.data);
        return response.data.data;
    } catch (error) {
        console.error('❌ Failed to create virtual account:', error.response?.data || error.message);
        return null;
    }
}

// Step 2: Simulate bank transfer to virtual account
async function simulateVirtualAccountCredit(accountNumber, amount = 5000) {
    console.log(`🧪 Step 2: Simulating ₦${amount} credit to account ${accountNumber}...`);

    const payload = {
        eventType: 'SUCCESSFUL_TRANSACTION',
        eventData: {
            transactionReference: `MNFY|${Date.now()}|TEST`,
            paymentReference: `va_flow_test_${Date.now()}`,
            amountPaid: amount,
            totalPayable: amount,
            settlementAmount: amount - 25, // Minus fees
            paidOn: new Date().toISOString(),
            paymentStatus: 'PAID',
            paymentDescription: 'Virtual Account Credit Test',
            transactionHash: crypto.randomBytes(32).toString('hex'),
            currency: 'NGN',
            paymentMethod: 'ACCOUNT_TRANSFER',
            product: { type: 'RESERVED_ACCOUNT' },

            // Key fields for virtual account credit
            destinationAccountNumber: accountNumber,
            destinationAccountName: 'TEST USER',
            destinationBankName: 'Test Bank',
            destinationBankCode: '999',
            customerName: 'John Doe',
            sourceAccountNumber: '1234567890',
            sourceAccountName: 'John Doe',
            sourceBankName: 'First Bank',
            sourceBankCode: '011',
            sessionId: `session_${Date.now()}`,
            narration: 'Test virtual account funding'
        }
    };

    // Generate signature
    const signature = crypto
        .createHmac('sha512', MONNIFY_SECRET)
        .update(JSON.stringify(payload))
        .digest('hex');

    console.log('Generated signature:', signature);
    console.log('Payload reference:', payload.eventData.paymentReference);

    try {
        const response = await axios.post(`${BASE_URL}/api/wallet/webhook/monnify`, payload, {
            headers: {
                'Monnify-Signature': signature,
                'Content-Type': 'application/json',
                'User-Agent': 'MonnifyBot/1.0'
            },
            timeout: 30000
        });

        console.log('✅ Virtual account credit webhook response:', response.data);
        return { success: true, data: response.data, reference: payload.eventData.paymentReference };
    } catch (error) {
        console.error('❌ Virtual account credit failed:', error.response?.data || error.message);
        return { success: false, error: error.response?.data || error.message };
    }
}

// Step 3: Check wallet balance after credit
async function checkWalletBalance() {
    console.log('🧪 Step 3: Checking wallet balance...');

    try {
        const response = await axios.get(`${BASE_URL}/api/wallet/balance`, {
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Wallet balance:', response.data);
        return response.data.data;
    } catch (error) {
        console.error('❌ Failed to get wallet balance:', error.response?.data || error.message);
        return null;
    }
}

// Step 4: Check transaction history
async function checkTransactionHistory() {
    console.log('🧪 Step 4: Checking transaction history...');

    try {
        const response = await axios.get(`${BASE_URL}/api/wallet/transactions?limit=5`, {
            headers: {
                'Authorization': `Bearer ${AUTH_TOKEN}`,
                'Content-Type': 'application/json'
            }
        });

        console.log('✅ Recent transactions:', response.data);
        return response.data;
    } catch (error) {
        console.error('❌ Failed to get transaction history:', error.response?.data || error.message);
        return null;
    }
}

// Run complete flow test
async function runCompleteFlowTest() {
    console.log('🚀 TESTING COMPLETE VIRTUAL ACCOUNT CREDIT FLOW');
    console.log('='.repeat(60));

    if (!AUTH_TOKEN) {
        console.log('❌ Please set TEST_AUTH_TOKEN environment variable');
        console.log('   1. Login to your app and get an auth token');
        console.log('   2. Set it in your .env file: TEST_AUTH_TOKEN=your_token_here');
        return;
    }

    // Step 1: Create virtual account
    const virtualAccount = await createTestVirtualAccount();
    if (!virtualAccount) {
        console.log('❌ Cannot proceed without virtual account');
        return;
    }

    const accountNumber = virtualAccount.accountNumber;
    console.log(`📝 Using virtual account: ${accountNumber}`);

    // Step 2: Get initial balance
    const initialBalance = await checkWalletBalance();
    const initialAmount = initialBalance?.balance || 0;
    console.log(`💰 Initial wallet balance: ₦${initialAmount}`);

    // Step 3: Simulate credit
    const creditAmount = 5000;
    const creditResult = await simulateVirtualAccountCredit(accountNumber, creditAmount);

    if (!creditResult.success) {
        console.log('❌ Credit simulation failed');
        return;
    }

    // Wait a moment for processing
    console.log('⏳ Waiting 3 seconds for processing...');
    await new Promise(resolve => setTimeout(resolve, 3000));

    // Step 4: Check new balance
    const finalBalance = await checkWalletBalance();
    const finalAmount = finalBalance?.balance || 0;
    console.log(`💰 Final wallet balance: ₦${finalAmount}`);

    // Step 5: Check transactions
    await checkTransactionHistory();

    // Verify the credit worked
    const expectedAmount = initialAmount + creditAmount;
    const creditWorked = Math.abs(finalAmount - expectedAmount) < 1;

    console.log('\n' + '='.repeat(60));
    console.log('🎯 FLOW TEST RESULTS:');
    console.log('='.repeat(60));
    console.log(`Initial Balance: ₦${initialAmount}`);
    console.log(`Credit Amount: ₦${creditAmount}`);
    console.log(`Expected Balance: ₦${expectedAmount}`);
    console.log(`Actual Balance: ₦${finalAmount}`);
    console.log(`Credit Successful: ${creditWorked ? '✅ YES' : '❌ NO'}`);

    if (creditWorked) {
        console.log('🎉 VIRTUAL ACCOUNT CREDIT FLOW WORKING PERFECTLY!');
    } else {
        console.log('⚠️  Virtual account credit may have issues');
    }

    return {
        success: creditWorked,
        initialBalance: initialAmount,
        creditAmount,
        finalBalance: finalAmount,
        accountNumber,
        reference: creditResult.reference
    };
}

// Export for testing
export default {
    createTestVirtualAccount,
    simulateVirtualAccountCredit,
    checkWalletBalance,
    checkTransactionHistory,
    runCompleteFlowTest
};

// Run if called directly
runCompleteFlowTest().catch(console.error);