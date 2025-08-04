// Virtual Account Credit Monitoring & Testing Utility
// utils/virtualAccountMonitor.js

import VirtualAccount from '../src/models/VirtualAccount.js';
import Transaction from '../src/models/Transaction.js';
import Wallet from '../src/models/Wallet.js';
import User from '../src/models/User.js';
import WalletService from '../src/services/WalletService.js';
import { sendTransactionNotificationEmail } from './emails/sendEmails.js';
import mongoose from 'mongoose';

class VirtualAccountMonitor {
    constructor() {
        this.processedTransactions = new Set();
        this.failedAttempts = new Map();
        this.maxRetries = 3;
    }

    /**
     * ⚠️ COMPREHENSIVE: Test virtual account credit flow
     */
    async testVirtualAccountCredit(userId, amount = 1000, mockData = {}) {
        try {
            console.log('🧪 Testing virtual account credit flow...');

            // Find user's virtual account
            const virtualAccount = await VirtualAccount.findOne({ user: userId })
                .populate('user', 'email firstName username');

            if (!virtualAccount) {
                throw new Error('Virtual account not found for user');
            }

            const accountNumber = virtualAccount.accounts[0]?.accountNumber;
            if (!accountNumber) {
                throw new Error('No account number found in virtual account');
            }

            // Create test transaction data
            const testReference = `test_va_${Date.now()}`;
            const testData = {
                paymentReference: testReference,
                amountPaid: amount,
                destinationAccountNumber: accountNumber,
                customerName: mockData.customerName || 'Test Customer',
                sourceAccountNumber: mockData.sourceAccount || '0987654321',
                sourceBankName: mockData.sourceBank || 'Test Bank',
                paidOn: new Date().toISOString(),
                currency: 'NGN',
                ...mockData
            };

            console.log('Test data:', testData);

            // Get wallet balance before credit
            const balanceBefore = await WalletService.getBalance(userId);
            console.log('Wallet balance before:', balanceBefore.balance);

            // Process the credit
            const result = await this.processVirtualAccountCredit(testData);

            // Get wallet balance after credit
            const balanceAfter = await WalletService.getBalance(userId);
            console.log('Wallet balance after:', balanceAfter.balance);

            // Verify the credit
            const expectedBalance = balanceBefore.balance + amount;
            const actualBalance = balanceAfter.balance;
            const isBalanceCorrect = Math.abs(actualBalance - expectedBalance) < 0.01;

            // Find the transaction
            const transaction = await Transaction.findOne({ reference: testReference });

            const testResult = {
                success: result.success && isBalanceCorrect && !!transaction,
                balanceBefore: balanceBefore.balance,
                balanceAfter: actualBalance,
                expectedBalance,
                creditAmount: amount,
                isBalanceCorrect,
                transactionCreated: !!transaction,
                transactionId: transaction?._id,
                reference: testReference,
                processingResult: result
            };

            console.log('✅ Virtual account credit test completed:', testResult);
            return testResult;

        } catch (error) {
            console.error('❌ Virtual account credit test failed:', error);
            return {
                success: false,
                error: error.message,
                stack: error.stack
            };
        }
    }

    /**
     * ⚠️ ROBUST: Process virtual account credit with comprehensive error handling
     */
    async processVirtualAccountCredit(eventData) {
        const processingId = `${eventData.paymentReference}_${Date.now()}`;

        try {
            console.log(`[${processingId}] Processing virtual account credit:`, {
                reference: eventData.paymentReference,
                amount: eventData.amountPaid,
                accountNumber: eventData.destinationAccountNumber
            });

            // Prevent duplicate processing
            if (this.processedTransactions.has(eventData.paymentReference)) {
                console.log(`[${processingId}] Transaction already processed`);
                return {
                    success: true,
                    message: 'Transaction already processed',
                    duplicate: true
                };
            }

            // Check failure history
            const failureKey = eventData.paymentReference;
            const failures = this.failedAttempts.get(failureKey) || 0;

            if (failures >= this.maxRetries) {
                console.error(`[${processingId}] Max retries exceeded for transaction`);
                return {
                    success: false,
                    message: 'Max retries exceeded',
                    failures
                };
            }

            // Find virtual account with retry logic
            let virtualAccount = null;
            let findAttempts = 0;
            const maxFindAttempts = 3;

            while (!virtualAccount && findAttempts < maxFindAttempts) {
                try {
                    virtualAccount = await VirtualAccount.findOne({
                        'accounts.accountNumber': eventData.destinationAccountNumber
                    }).populate('user', 'email firstName username');

                    if (!virtualAccount) {
                        findAttempts++;
                        console.log(`[${processingId}] Virtual account not found, attempt ${findAttempts}/${maxFindAttempts}`);

                        if (findAttempts < maxFindAttempts) {
                            await new Promise(resolve => setTimeout(resolve, 1000));
                        }
                    }
                } catch (findError) {
                    findAttempts++;
                    console.error(`[${processingId}] Error finding virtual account:`, findError);

                    if (findAttempts < maxFindAttempts) {
                        await new Promise(resolve => setTimeout(resolve, 2000));
                    }
                }
            }

            if (!virtualAccount) {
                console.error(`[${processingId}] Virtual account not found after ${maxFindAttempts} attempts`);
                this.failedAttempts.set(failureKey, failures + 1);
                return {
                    success: false,
                    message: 'Virtual account not found',
                    accountNumber: eventData.destinationAccountNumber
                };
            }

            console.log(`[${processingId}] Virtual account found for user:`, virtualAccount.user._id);

            // Check for existing transaction
            const existingTransaction = await Transaction.findOne({
                reference: eventData.paymentReference
            });

            if (existingTransaction) {
                console.log(`[${processingId}] Transaction already exists`);
                this.processedTransactions.add(eventData.paymentReference);
                return {
                    success: true,
                    message: 'Transaction already exists',
                    transactionId: existingTransaction._id,
                    existing: true
                };
            }

            // Process the wallet credit with retries
            let creditResult = null;
            let creditAttempts = 0;
            const maxCreditAttempts = 3;

            while (!creditResult && creditAttempts < maxCreditAttempts) {
                try {
                    creditResult = await WalletService.creditWallet(
                        virtualAccount.user._id,
                        eventData.amountPaid,
                        'virtual_account_credit',
                        eventData.paymentReference,
                        {
                            virtualAccountNumber: eventData.destinationAccountNumber,
                            senderName: eventData.customerName,
                            senderAccount: eventData.sourceAccountNumber,
                            senderBank: eventData.sourceBankName,
                            description: `Bank transfer from ${eventData.customerName}`,
                            gateway: 'monnify',
                            eventData: eventData,
                            processedAt: new Date(),
                            processingId
                        }
                    );

                    console.log(`[${processingId}] ✅ Wallet credited successfully:`, {
                        newBalance: creditResult.balance,
                        creditedAmount: creditResult.credited
                    });

                } catch (creditError) {
                    creditAttempts++;
                    console.error(`[${processingId}] Credit attempt ${creditAttempts} failed:`, creditError);

                    // Handle duplicate key error
                    if (creditError.message?.includes('already exists')) {
                        console.log(`[${processingId}] Duplicate transaction detected`);
                        this.processedTransactions.add(eventData.paymentReference);
                        return {
                            success: true,
                            message: 'Transaction already processed (duplicate)',
                            duplicate: true
                        };
                    }

                    if (creditAttempts < maxCreditAttempts) {
                        const delay = creditAttempts * 2000; // Exponential backoff
                        console.log(`[${processingId}] Retrying credit in ${delay}ms...`);
                        await new Promise(resolve => setTimeout(resolve, delay));
                    } else {
                        throw creditError;
                    }
                }
            }

            if (!creditResult) {
                throw new Error('Failed to credit wallet after all attempts');
            }

            // Mark as processed
            this.processedTransactions.add(eventData.paymentReference);

            // Send email notification asynchronously
            this.sendCreditNotificationEmail(virtualAccount.user, creditResult.transaction)
                .catch(emailError => {
                    console.error(`[${processingId}] Email notification failed:`, emailError);
                });

            // Clear any failure history
            this.failedAttempts.delete(failureKey);

            return {
                success: true,
                message: 'Virtual account credited successfully',
                userId: virtualAccount.user._id,
                amount: eventData.amountPaid,
                newBalance: creditResult.balance,
                transactionId: creditResult.transaction._id,
                reference: eventData.paymentReference,
                processingId
            };

        } catch (error) {
            console.error(`[${processingId}] ❌ Virtual account credit failed:`, error);

            // Track failure
            const failureKey = eventData.paymentReference;
            const failures = this.failedAttempts.get(failureKey) || 0;
            this.failedAttempts.set(failureKey, failures + 1);

            return {
                success: false,
                message: error.message,
                error: error.stack,
                failures: failures + 1,
                processingId
            };
        }
    }

    /**
     * Send credit notification email asynchronously
     */
    async sendCreditNotificationEmail(user, transaction) {
        try {
            if (!user || !transaction) {
                console.log('Missing user or transaction for email notification');
                return;
            }

            await sendTransactionNotificationEmail(transaction, user);
            console.log('✅ Virtual account credit email sent successfully to:', user.email);
            return true;
        } catch (error) {
            console.error('❌ Failed to send virtual account credit email:', error);
            return false;
        }
    }

    /**
     * ⚠️ NEW: Monitor virtual account transactions in real-time
     */
    async monitorVirtualAccountTransactions() {
        try {
            console.log('🔍 Starting virtual account transaction monitoring...');

            // Get all virtual accounts
            const virtualAccounts = await VirtualAccount.find({ status: 'active' })
                .populate('user', 'email firstName username');

            console.log(`Monitoring ${virtualAccounts.length} virtual accounts`);

            const accountNumbers = virtualAccounts.flatMap(va =>
                va.accounts.map(acc => acc.accountNumber)
            );

            // Check for recent transactions that might not have been processed
            const recentTransactions = await Transaction.find({
                type: 'virtual_account_credit',
                createdAt: { $gte: new Date(Date.now() - 24 * 60 * 60 * 1000) } // Last 24 hours
            }).populate('user', 'email');

            const monitoringResult = {
                totalVirtualAccounts: virtualAccounts.length,
                activeAccountNumbers: accountNumbers,
                recentTransactions: recentTransactions.length,
                processedTransactionsCount: this.processedTransactions.size,
                failedAttemptsCount: this.failedAttempts.size,
                transactions: recentTransactions.map(tx => ({
                    id: tx._id,
                    amount: tx.amount,
                    reference: tx.reference,
                    userEmail: tx.user?.email,
                    createdAt: tx.createdAt,
                    status: tx.status
                }))
            };

            console.log('📊 Monitoring results:', monitoringResult);
            return monitoringResult;

        } catch (error) {
            console.error('❌ Error monitoring virtual accounts:', error);
            throw error;
        }
    }

    /**
     * ⚠️ NEW: Validate virtual account setup
     */
    async validateVirtualAccountSetup(userId) {
        try {
            console.log('🔍 Validating virtual account setup for user:', userId);

            const user = await User.findById(userId);
            if (!user) {
                throw new Error('User not found');
            }

            const virtualAccount = await VirtualAccount.findOne({ user: userId });
            const wallet = await Wallet.findOne({ user: userId });

            const validation = {
                userId,
                userExists: !!user,
                userEmail: user?.email,
                hasVirtualAccount: !!virtualAccount,
                virtualAccountStatus: virtualAccount?.status,
                accountCount: virtualAccount?.accounts?.length || 0,
                accounts: virtualAccount?.accounts || [],
                hasWallet: !!wallet,
                walletBalance: wallet?.balance || 0,
                walletStatus: wallet?.status,
                isSetupComplete: !!user && !!virtualAccount && !!wallet && virtualAccount.status === 'active'
            };

            console.log('✅ Virtual account validation completed:', validation);
            return validation;

        } catch (error) {
            console.error('❌ Virtual account validation failed:', error);
            return {
                userId,
                isSetupComplete: false,
                error: error.message
            };
        }
    }

    /**
     * ⚠️ NEW: Reconcile virtual account transactions
     */
    async reconcileVirtualAccountTransactions(days = 7) {
        try {
            console.log(`🔍 Reconciling virtual account transactions for last ${days} days...`);

            const startDate = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

            // Get all virtual account credit transactions
            const transactions = await Transaction.find({
                type: 'virtual_account_credit',
                createdAt: { $gte: startDate }
            }).populate('user', 'email firstName');

            // Group by user
            const userTransactions = transactions.reduce((acc, tx) => {
                const userId = tx.user._id.toString();
                if (!acc[userId]) {
                    acc[userId] = {
                        user: tx.user,
                        transactions: [],
                        totalAmount: 0,
                        count: 0
                    };
                }
                acc[userId].transactions.push(tx);
                acc[userId].totalAmount += tx.amount;
                acc[userId].count++;
                return acc;
            }, {});

            // Validate wallet balances
            const reconciliation = [];
            for (const [userId, data] of Object.entries(userTransactions)) {
                try {
                    const walletIntegrity = await WalletService.verifyWalletIntegrity(userId);
                    reconciliation.push({
                        userId,
                        userEmail: data.user.email,
                        transactionCount: data.count,
                        totalCredited: data.totalAmount,
                        walletBalance: walletIntegrity.walletBalance,
                        calculatedBalance: walletIntegrity.calculatedBalance,
                        isValid: walletIntegrity.isValid,
                        difference: walletIntegrity.difference
                    });
                } catch (error) {
                    reconciliation.push({
                        userId,
                        userEmail: data.user.email,
                        error: error.message,
                        isValid: false
                    });
                }
            }

            const summary = {
                periodDays: days,
                totalTransactions: transactions.length,
                totalUsers: Object.keys(userTransactions).length,
                totalAmount: transactions.reduce((sum, tx) => sum + tx.amount, 0),
                validBalances: reconciliation.filter(r => r.isValid).length,
                invalidBalances: reconciliation.filter(r => !r.isValid).length,
                reconciliation
            };

            console.log('📊 Reconciliation completed:', summary);
            return summary;

        } catch (error) {
            console.error('❌ Reconciliation failed:', error);
            throw error;
        }
    }

    /**
     * ⚠️ NEW: Retry failed virtual account credits
     */
    async retryFailedCredits() {
        try {
            console.log('🔄 Retrying failed virtual account credits...');

            const retryResults = [];

            for (const [reference, attempts] of this.failedAttempts.entries()) {
                if (attempts < this.maxRetries) {
                    console.log(`Retrying failed credit: ${reference} (attempt ${attempts + 1})`);

                    // Note: You would need the original eventData to retry
                    // This is a placeholder for the retry logic
                    retryResults.push({
                        reference,
                        previousAttempts: attempts,
                        retryStatus: 'pending' // Would be updated after actual retry
                    });
                }
            }

            console.log(`🔄 Retry initiated for ${retryResults.length} failed credits`);
            return retryResults;

        } catch (error) {
            console.error('❌ Retry failed credits error:', error);
            throw error;
        }
    }

    /**
     * ⚠️ NEW: Create test virtual account for development
     */
    async createTestVirtualAccount(userEmail) {
        try {
            console.log('🧪 Creating test virtual account for:', userEmail);

            // Find or create test user
            let user = await User.findOne({ email: userEmail });
            if (!user) {
                user = await User.create({
                    email: userEmail,
                    username: userEmail.split('@')[0],
                    firstName: 'Test',
                    lastName: 'User',
                    phone: '+2348123456789',
                    isEmailVerified: true
                });
                console.log('Test user created:', user._id);
            }

            // Create wallet if doesn't exist
            const wallet = await WalletService.getOrCreateWallet(user._id);
            console.log('Wallet ensured for user:', wallet._id);

            // Create test virtual account
            const testAccountData = {
                user: user._id,
                accountReference: `test-va-${Date.now()}`,
                accounts: [{
                    bankName: 'Test Bank',
                    accountNumber: `11${Date.now().toString().slice(-8)}`,
                    accountName: `${user.firstName} ${user.lastName}`.toUpperCase(),
                    bankCode: '999'
                }],
                status: 'active',
                metadata: {
                    testAccount: true,
                    createdFor: 'development',
                    customerEmail: user.email
                }
            };

            const virtualAccount = await VirtualAccount.create(testAccountData);
            console.log('✅ Test virtual account created:', virtualAccount._id);

            return {
                success: true,
                user: {
                    id: user._id,
                    email: user.email,
                    username: user.username
                },
                virtualAccount: {
                    id: virtualAccount._id,
                    accountNumber: virtualAccount.accounts[0].accountNumber,
                    accountName: virtualAccount.accounts[0].accountName,
                    bankName: virtualAccount.accounts[0].bankName
                },
                wallet: {
                    id: wallet._id,
                    balance: wallet.balance
                }
            };

        } catch (error) {
            console.error('❌ Failed to create test virtual account:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * ⚠️ NEW: Simulate virtual account credit for testing
     */
    async simulateVirtualAccountCredit(accountNumber, amount, senderInfo = {}) {
        try {
            console.log('🎭 Simulating virtual account credit:', { accountNumber, amount });

            const mockEventData = {
                paymentReference: `sim_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
                amountPaid: amount,
                destinationAccountNumber: accountNumber,
                customerName: senderInfo.name || 'Test Sender',
                sourceAccountNumber: senderInfo.account || `98${Date.now().toString().slice(-8)}`,
                sourceBankName: senderInfo.bank || 'Test Sender Bank',
                paidOn: new Date().toISOString(),
                currency: 'NGN',
                transactionReference: `MNFY|${Date.now()}|SIM`,
                sessionId: `session_${Date.now()}`,
                narration: senderInfo.narration || 'Test transfer simulation'
            };

            console.log('Simulated event data:', mockEventData);

            const result = await this.processVirtualAccountCredit(mockEventData);

            return {
                success: result.success,
                simulation: true,
                eventData: mockEventData,
                result: result
            };

        } catch (error) {
            console.error('❌ Virtual account credit simulation failed:', error);
            return {
                success: false,
                simulation: true,
                error: error.message
            };
        }
    }

    /**
     * ⚠️ NEW: Audit virtual account transactions
     */
    async auditVirtualAccountTransactions(options = {}) {
        try {
            const {
                startDate = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000), // 30 days ago
                endDate = new Date(),
                userId = null,
                minAmount = null,
                maxAmount = null
            } = options;

            console.log('🔍 Auditing virtual account transactions...', {
                startDate: startDate.toISOString(),
                endDate: endDate.toISOString(),
                userId,
                minAmount,
                maxAmount
            });

            // Build query
            const query = {
                type: 'virtual_account_credit',
                createdAt: { $gte: startDate, $lte: endDate }
            };

            if (userId) {
                query.user = userId;
            }

            if (minAmount !== null || maxAmount !== null) {
                query.amount = {};
                if (minAmount !== null) query.amount.$gte = minAmount;
                if (maxAmount !== null) query.amount.$lte = maxAmount;
            }

            // Get transactions with user details
            const transactions = await Transaction.find(query)
                .populate('user', 'email firstName lastName username')
                .sort({ createdAt: -1 });

            // Calculate statistics
            const totalAmount = transactions.reduce((sum, tx) => sum + tx.amount, 0);
            const avgAmount = transactions.length > 0 ? totalAmount / transactions.length : 0;
            const uniqueUsers = new Set(transactions.map(tx => tx.user._id.toString())).size;

            // Group by status
            const statusGroups = transactions.reduce((acc, tx) => {
                const status = tx.status || 'unknown';
                if (!acc[status]) acc[status] = { count: 0, amount: 0 };
                acc[status].count++;
                acc[status].amount += tx.amount;
                return acc;
            }, {});

            // Group by user
            const userGroups = transactions.reduce((acc, tx) => {
                const userId = tx.user._id.toString();
                if (!acc[userId]) {
                    acc[userId] = {
                        user: tx.user,
                        count: 0,
                        totalAmount: 0,
                        transactions: []
                    };
                }
                acc[userId].count++;
                acc[userId].totalAmount += tx.amount;
                acc[userId].transactions.push({
                    id: tx._id,
                    amount: tx.amount,
                    reference: tx.reference,
                    createdAt: tx.createdAt,
                    status: tx.status
                });
                return acc;
            }, {});

            const auditResult = {
                period: {
                    startDate: startDate.toISOString(),
                    endDate: endDate.toISOString(),
                    days: Math.ceil((endDate - startDate) / (24 * 60 * 60 * 1000))
                },
                summary: {
                    totalTransactions: transactions.length,
                    totalAmount: totalAmount,
                    averageAmount: Math.round(avgAmount * 100) / 100,
                    uniqueUsers: uniqueUsers,
                    statusBreakdown: statusGroups
                },
                userBreakdown: Object.values(userGroups).map(group => ({
                    userId: group.user._id,
                    userEmail: group.user.email,
                    userName: group.user.firstName || group.user.username,
                    transactionCount: group.count,
                    totalAmount: group.totalAmount,
                    averageAmount: Math.round((group.totalAmount / group.count) * 100) / 100,
                    recentTransactions: group.transactions.slice(0, 5) // Last 5 transactions
                })),
                recentTransactions: transactions.slice(0, 10).map(tx => ({
                    id: tx._id,
                    amount: tx.amount,
                    reference: tx.reference,
                    userEmail: tx.user?.email,
                    createdAt: tx.createdAt,
                    status: tx.status,
                    metadata: tx.metadata
                }))
            };

            console.log('📊 Virtual account audit completed:', auditResult.summary);
            return auditResult;

        } catch (error) {
            console.error('❌ Virtual account audit failed:', error);
            throw error;
        }
    }

    /**
     * ⚠️ NEW: Health check for virtual account system
     */
    async healthCheck() {
        try {
            console.log('🏥 Running virtual account system health check...');

            const checks = {
                virtualAccounts: { status: 'unknown', details: {} },
                wallets: { status: 'unknown', details: {} },
                recentTransactions: { status: 'unknown', details: {} },
                webhookProcessing: { status: 'unknown', details: {} },
                emailNotifications: { status: 'unknown', details: {} }
            };

            // Check virtual accounts
            try {
                const totalVA = await VirtualAccount.countDocuments();
                const activeVA = await VirtualAccount.countDocuments({ status: 'active' });
                checks.virtualAccounts = {
                    status: activeVA > 0 ? 'healthy' : 'warning',
                    details: { total: totalVA, active: activeVA }
                };
            } catch (error) {
                checks.virtualAccounts = { status: 'error', details: { error: error.message } };
            }

            // Check wallets
            try {
                const totalWallets = await Wallet.countDocuments();
                const activeWallets = await Wallet.countDocuments({ status: 'active' });
                const totalBalance = await Wallet.aggregate([
                    { $group: { _id: null, total: { $sum: '$balance' } } }
                ]);
                checks.wallets = {
                    status: activeWallets > 0 ? 'healthy' : 'warning',
                    details: {
                        total: totalWallets,
                        active: activeWallets,
                        totalBalance: totalBalance[0]?.total || 0
                    }
                };
            } catch (error) {
                checks.wallets = { status: 'error', details: { error: error.message } };
            }

            // Check recent transactions
            try {
                const last24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
                const recentTx = await Transaction.countDocuments({
                    type: 'virtual_account_credit',
                    createdAt: { $gte: last24h }
                });
                const failedTx = await Transaction.countDocuments({
                    type: 'virtual_account_credit',
                    status: 'failed',
                    createdAt: { $gte: last24h }
                });
                checks.recentTransactions = {
                    status: recentTx > 0 ? 'healthy' : 'info',
                    details: { recent24h: recentTx, failed24h: failedTx }
                };
            } catch (error) {
                checks.recentTransactions = { status: 'error', details: { error: error.message } };
            }

            // Check webhook processing
            const processingStats = this.getStats();
            checks.webhookProcessing = {
                status: processingStats.failedAttempts === 0 ? 'healthy' : 'warning',
                details: processingStats
            };

            // Check email notifications (basic check)
            checks.emailNotifications = {
                status: process.env.EMAIL_SERVICE_CONFIGURED ? 'healthy' : 'warning',
                details: {
                    configured: !!process.env.EMAIL_SERVICE_CONFIGURED,
                    provider: process.env.EMAIL_PROVIDER || 'unknown'
                }
            };

            // Overall health status
            const statuses = Object.values(checks).map(check => check.status);
            const hasErrors = statuses.includes('error');
            const hasWarnings = statuses.includes('warning');

            const overallStatus = hasErrors ? 'error' : hasWarnings ? 'warning' : 'healthy';

            const healthResult = {
                overall: overallStatus,
                timestamp: new Date().toISOString(),
                checks: checks,
                summary: {
                    healthy: statuses.filter(s => s === 'healthy').length,
                    warnings: statuses.filter(s => s === 'warning').length,
                    errors: statuses.filter(s => s === 'error').length,
                    info: statuses.filter(s => s === 'info').length
                }
            };

            console.log(`🏥 Health check completed - Overall status: ${overallStatus}`);
            return healthResult;

        } catch (error) {
            console.error('❌ Health check failed:', error);
            return {
                overall: 'error',
                timestamp: new Date().toISOString(),
                error: error.message
            };
        }
    }

    /**
     * Get monitoring statistics
     */
    getStats() {
        return {
            processedTransactions: this.processedTransactions.size,
            failedAttempts: this.failedAttempts.size,
            maxRetries: this.maxRetries,
            failedReferences: Array.from(this.failedAttempts.keys()),
            processedReferences: Array.from(this.processedTransactions),
            lastUpdated: new Date().toISOString()
        };
    }

    /**
     * Clear monitoring data
     */
    clearStats() {
        this.processedTransactions.clear();
        this.failedAttempts.clear();
        console.log('📊 Monitoring stats cleared');
    }

    /**
     * ⚠️ NEW: Export monitoring data for analysis
     */
    async exportMonitoringData(format = 'json') {
        try {
            const data = {
                timestamp: new Date().toISOString(),
                stats: this.getStats(),
                healthCheck: await this.healthCheck(),
                recentAudit: await this.auditVirtualAccountTransactions({
                    startDate: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000) // Last 7 days
                })
            };

            if (format === 'json') {
                return JSON.stringify(data, null, 2);
            } else if (format === 'csv') {
                // Convert to CSV format for the audit data
                const transactions = data.recentAudit.recentTransactions;
                const csvHeaders = 'ID,Amount,Reference,User Email,Created At,Status\n';
                const csvRows = transactions.map(tx =>
                    `${tx.id},${tx.amount},${tx.reference},${tx.userEmail},${tx.createdAt},${tx.status}`
                ).join('\n');
                return csvHeaders + csvRows;
            }

            return data;

        } catch (error) {
            console.error('❌ Export monitoring data failed:', error);
            throw error;
        }
    }
}

export default new VirtualAccountMonitor();