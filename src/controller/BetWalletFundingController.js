// controller/BetWalletFundingController.js - FIXED VTU Africa Integration
import BillPayment from '../models/BillPayment.js';
import BetWalletFunding from '../models/BetWalletFunding.js';
import User from '../models/User.js';
import VTPassService from '../services/VTPassService.js';
import VTUAfricaService from '../services/VTUAfricaService.js';
import WalletService from '../services/WalletService.js';
import {
    sendBillPaymentEmail,
    sendTransactionNotificationEmail
} from '../../utils/emails/sendEmails.js';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import BillPaymentController from "./BillPaymentController.js";
import mongoose from 'mongoose';

function BetWalletFundingController() {
    // Import all existing methods from original BillPaymentController
    const originalController = BillPaymentController();

    // ==================== BET WALLET FUNDING ENDPOINTS ====================

    /**
     * Get supported betting platforms for wallet funding (VTU Africa)
     */
    const getSupportedBettingPlatforms = async (req, res) => {
        try {
            console.log('Fetching supported betting platforms from VTU Africa...');
            const platforms = await VTUAfricaService.getSupportedBettingPlatforms();

            res.status(200).json({
                success: true,
                message: 'Betting platforms retrieved successfully',
                data: platforms
            });
        } catch (error) {
            console.error('Error fetching betting platforms:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch betting platforms',
                error: error.message
            });
        }
    };

    /**
     * Get funding options for a specific betting platform (VTU Africa)
     */
    const getPlatformFundingOptions = async (req, res) => {
        try {
            const { platformId } = req.params;

            if (!platformId) {
                return res.status(400).json({
                    success: false,
                    message: 'Platform ID is required'
                });
            }

            console.log(`Fetching funding options for platform: ${platformId}`);
            const fundingOptions = await VTUAfricaService.getPlatformFundingOptions(platformId);

            res.status(200).json({
                success: true,
                message: 'Funding options retrieved successfully',
                data: fundingOptions
            });
        } catch (error) {
            console.error('Error fetching funding options:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch funding options',
                error: error.message
            });
        }
    };

    /**
     * FIXED: Verify betting account using REAL VTU Africa API
     */
    const verifyBettingAccount = async (req, res) => {
        try {
            const schema = Joi.object({
                // ALL platforms from VTU Africa service codes list
                platform: Joi.string().valid(
                    'bet9ja', 'betking', '1xbet', 'nairabet', 'betbiga', 'merrybet',
                    'sportybet', 'naijabet', 'betway', 'bangbet', 'melbet',
                    'livescorebet', 'naira-million', 'cloudbet', 'paripesa', 'mylottohub'
                ).required(),
                accountIdentifier: Joi.string().required().min(3).max(50)
                    .pattern(/^\d+$/) // MUST be numeric as per VTU Africa docs
                    .messages({
                        'string.pattern.base': 'User ID must be numeric (numbers only) as required by VTU Africa'
                    }),
                customerPhone: Joi.string().pattern(/^[0-9]{11}$/).optional()
            });

            const { error, value } = schema.validate(req.body, { abortEarly: false });

            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    details: error.details.map(err => err.message)
                });
            }

            console.log(`🔍 Verifying betting account for platform: ${value.platform}`);

            // Use REAL VTU Africa verification API
            const verificationResult = await VTUAfricaService.verifyBettingAccount({
                platform: value.platform,
                accountIdentifier: value.accountIdentifier,
                customerPhone: value.customerPhone
            });

            if (verificationResult.success) {
                res.status(200).json({
                    success: true,
                    message: 'Account verified successfully',
                    data: {
                        accountName: verificationResult.accountName,
                        accountId: verificationResult.accountId,
                        platform: value.platform,
                        verified: true,
                        minAmount: verificationResult.minAmount || 100,
                        maxAmount: verificationResult.maxAmount || 100000,
                        charge: verificationResult.charge || 30,
                        provider: 'VTU Africa',
                        vtuAfricaData: verificationResult.vtuAfricaResponse // Include VTU Africa response
                    }
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Account verification failed',
                    error: verificationResult.message,
                    code: verificationResult.code,
                    provider: 'VTU Africa'
                });
            }
        } catch (error) {
            console.error('❌ Error verifying betting account:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to verify betting account',
                error: error.message
            });
        }
    };


    /**
     * FIXED: Fund betting wallet using VTU Africa with webhook support
     */
    const fundBettingWallet = async (req, res) => {
        try {
            const schema = Joi.object({
                // ALL platforms from VTU Africa service codes list
                platform: Joi.string().valid(
                    'bet9ja', 'betking', '1xbet', 'nairabet', 'betbiga', 'merrybet',
                    'sportybet', 'naijabet', 'betway', 'bangbet', 'melbet',
                    'livescorebet', 'naira-million', 'cloudbet', 'paripesa', 'mylottohub'
                ).required(),
                accountIdentifier: Joi.string().required().min(3).max(50)
                    .pattern(/^\d+$/) // MUST be numeric as per VTU Africa docs
                    .messages({
                        'string.pattern.base': 'User ID must be numeric (numbers only) as required by VTU Africa'
                    }),
                accountName: Joi.string().optional(),
                amount: Joi.number().min(100).max(100000).required(), // VTU Africa limits from docs
                paymentMethod: Joi.string().valid('wallet').default('wallet'),
                customerPhone: Joi.string().pattern(/^[0-9]{11}$/).optional(),
                description: Joi.string().optional().max(200)
            });

            const { error, value } = schema.validate(req.body, { abortEarly: false });

            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    details: error.details.map(err => err.message)
                });
            }

            const userId = req.user.id;

            // Get user details
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // VTU Africa charges ₦30 fixed service charge (from documentation)
            const charge = 30;
            const totalAmount = value.amount + charge;

            // Generate transaction reference and webhook URL
            const transactionRef = `VTUAFRICA_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const baseURL = process.env.WEBHOOK_BASE_URL || `${req.protocol}://${req.get('host')}`;
            const webhookURL = `${baseURL}/api/bet-wallet/webhook/${transactionRef}`;

            console.log('💰 VTU Africa funding calculation (docs compliant):', {
                requestedAmount: value.amount,
                vtAfricaCharge: charge,
                totalAmount: totalAmount,
                webhookURL: webhookURL
            });

            // Check wallet balance
            const walletInfo = await WalletService.getBalance(userId);
            if (walletInfo.balance < totalAmount) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient wallet balance',
                    required: totalAmount,
                    available: walletInfo.balance,
                    breakdown: {
                        fundingAmount: value.amount,
                        serviceCharge: charge,
                        totalRequired: totalAmount,
                        provider: 'VTU Africa'
                    }
                });
            }

            // Create bet wallet funding record
            const betWalletFunding = await BetWalletFunding.create({
                user: userId,
                platform: value.platform,
                accountIdentifier: value.accountIdentifier,
                accountName: value.accountName || `${value.platform.toUpperCase()} Account`,
                amount: value.amount,
                fundingType: 'instant',
                transactionRef,
                status: 'pending',
                paymentMethod: value.paymentMethod,
                customerPhone: value.customerPhone,
                description: value.description,
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip,
                // VTU Africa specific fields
                serviceCharge: charge,
                totalAmountCharged: totalAmount,
                provider: 'vtu-africa',
                webhookURL: webhookURL
            });

            // Debit wallet with total amount
            await WalletService.debitWallet(
                userId,
                totalAmount,
                'bill_payment',
                transactionRef,
                {
                    betWalletFundingId: betWalletFunding._id,
                    serviceType: 'bet_wallet_funding',
                    platform: value.platform,
                    provider: 'vtu-africa',
                    fundingAmount: value.amount,
                    serviceCharge: charge
                }
            );

            try {
                // Fund betting wallet through VTU Africa (documentation compliant)
                console.log('🚀 Initiating VTU Africa bet wallet funding (docs compliant)...');

                const fundingResult = await VTUAfricaService.fundBettingWallet({
                    platform: value.platform,
                    accountIdentifier: value.accountIdentifier,
                    amount: value.amount,
                    transactionRef,
                    customerPhone: value.customerPhone,
                    webhookURL: webhookURL
                });

                console.log('📡 VTU Africa funding result:', {
                    success: fundingResult.success,
                    status: fundingResult.status,
                    reference: fundingResult.reference,
                    vtuAfricaCode: fundingResult.data?.code
                });

                // Update bet wallet funding record
                betWalletFunding.vtAfricaRef = fundingResult.reference || transactionRef;
                betWalletFunding.status = fundingResult.success ? 'completed' : 'failed';
                betWalletFunding.fundingMethod = 'vtu-africa-instant';
                betWalletFunding.responseData = fundingResult.data || {};
                betWalletFunding.completedAt = fundingResult.success ? new Date() : null;

                // Store VTU Africa response metadata
                if (fundingResult.vtuAfricaResponse) {
                    betWalletFunding.metadata = {
                        vtuAfrica: fundingResult.vtuAfricaResponse,
                        webhookConfigured: true,
                        documentationCompliant: true
                    };
                }

                await betWalletFunding.save();

                if (fundingResult.success) {
                    // Send success email
                    try {
                        await sendBillPaymentEmail(
                            {
                                serviceType: 'bet_wallet_funding',
                                serviceID: value.platform,
                                amount: totalAmount,
                                fundingAmount: value.amount,
                                serviceCharge: charge,
                                accountName: betWalletFunding.accountName,
                                accountIdentifier: value.accountIdentifier,
                                phone: value.customerPhone || user.phone || '',
                                billersCode: value.accountIdentifier,
                                transactionRef,
                                platform: value.platform,
                                provider: 'VTU Africa',
                                fundingType: 'instant',
                                fundingMethod: 'vtu-africa-instant'
                            },
                            user,
                            true,
                            {
                                walletBalance: (await WalletService.getBalance(userId)).balance,
                                vtpassMessage: `Betting wallet funded successfully via VTU Africa. ${fundingResult.message || 'Funds should reflect in your betting account within 1-2 minutes.'}`
                            }
                        );
                    } catch (emailError) {
                        console.error('❌ Error sending bet wallet funding email:', emailError);
                    }

                    res.status(200).json({
                        success: true,
                        message: 'Betting wallet funded successfully',
                        data: {
                            transactionRef,
                            platform: value.platform,
                            accountName: betWalletFunding.accountName,
                            accountIdentifier: value.accountIdentifier,
                            fundingAmount: value.amount,
                            serviceCharge: charge,
                            totalAmountCharged: totalAmount,
                            status: betWalletFunding.status,
                            fundingMethod: betWalletFunding.fundingMethod,
                            provider: 'VTU Africa',
                            vtAfricaReference: fundingResult.reference,
                            message: fundingResult.message,
                            estimatedDelivery: '1-2 minutes',
                            webhookConfigured: true,
                            documentationCompliant: true,
                            vtuAfricaResponse: fundingResult.vtuAfricaResponse
                        }
                    });
                } else {
                    throw new Error(fundingResult.message || 'VTU Africa wallet funding failed');
                }
            } catch (fundingError) {
                console.error('❌ VTU Africa funding error:', fundingError);

                // Refund wallet and update status
                await WalletService.creditWallet(
                    userId,
                    totalAmount,
                    'refund',
                    `refund-${transactionRef}`,
                    {
                        betWalletFundingId: betWalletFunding._id,
                        reason: 'VTU Africa wallet funding failed',
                        provider: 'vtu-africa',
                        originalAmount: value.amount,
                        serviceCharge: charge
                    }
                );

                betWalletFunding.status = 'failed';
                betWalletFunding.metadata = {
                    error: fundingError.message,
                    refunded: true,
                    refundAmount: totalAmount,
                    documentationCompliant: true
                };
                await betWalletFunding.save();

                res.status(500).json({
                    success: false,
                    message: 'Betting wallet funding failed',
                    error: fundingError.message,
                    refunded: true,
                    refundAmount: totalAmount,
                    provider: 'VTU Africa'
                });
            }
        } catch (error) {
            console.error('❌ Error funding betting wallet:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fund betting wallet',
                error: error.message
            });
        }
    };

    /**
     * NEW: Handle VTU Africa webhook notifications
     */
    const handleVTUAfricaWebhook = async (req, res) => {
        try {
            const { transactionRef } = req.params;
            const webhookData = req.body;

            console.log('🔔 VTU Africa webhook received:', {
                transactionRef,
                webhookData,
                headers: req.headers,
                ip: req.ip
            });

            // Find the transaction
            const betWalletFunding = await BetWalletFunding.findOne({
                transactionRef: transactionRef
            });

            if (!betWalletFunding) {
                console.error(`❌ Webhook transaction not found: ${transactionRef}`);
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found'
                });
            }

            // Process the webhook using VTU Africa service
            const webhookResult = VTUAfricaService.handleWebhookNotification(webhookData);

            console.log('📝 Webhook processing result:', webhookResult);

            // Update transaction status based on webhook
            if (webhookResult.success) {
                if (webhookResult.status === 'completed' && betWalletFunding.status !== 'completed') {
                    betWalletFunding.status = 'completed';
                    betWalletFunding.completedAt = new Date();

                    // Update metadata with webhook info
                    betWalletFunding.metadata = {
                        ...betWalletFunding.metadata,
                        webhookReceived: true,
                        webhookTimestamp: new Date(),
                        webhookData: webhookData,
                        finalStatus: 'completed'
                    };

                    await betWalletFunding.save();
                    console.log('✅ Transaction updated to completed via webhook:', transactionRef);
                }
            } else {
                // Webhook indicates failure - refund user
                if (betWalletFunding.status === 'pending') {
                    betWalletFunding.status = 'failed';
                    betWalletFunding.metadata = {
                        ...betWalletFunding.metadata,
                        webhookReceived: true,
                        webhookTimestamp: new Date(),
                        webhookData: webhookData,
                        finalStatus: 'failed',
                        failureReason: webhookResult.message
                    };

                    await betWalletFunding.save();

                    // Refund user
                    try {
                        await WalletService.creditWallet(
                            betWalletFunding.user,
                            betWalletFunding.totalAmountCharged,
                            'refund',
                            `webhook-refund-${transactionRef}`,
                            {
                                betWalletFundingId: betWalletFunding._id,
                                reason: 'VTU Africa webhook indicated failure',
                                provider: 'vtu-africa'
                            }
                        );

                        console.log('💰 Refunded user due to webhook failure:', {
                            transactionRef,
                            refundAmount: betWalletFunding.totalAmountCharged
                        });
                    } catch (refundError) {
                        console.error('❌ Error processing webhook refund:', refundError);
                    }
                }
            }

            // Respond to VTU Africa webhook
            res.status(200).json({
                success: true,
                message: 'Webhook processed successfully',
                transactionRef: transactionRef,
                status: webhookResult.status
            });

        } catch (error) {
            console.error('❌ Error processing VTU Africa webhook:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process webhook',
                error: error.message
            });
        }
    };

    /**
     * ENHANCED: Get bet wallet funding status with webhook info
     */
    const getBetWalletFundingStatus = async (req, res) => {
        try {
            const { transactionRef } = req.params;
            const userId = req.user.id;

            const betWalletFunding = await BetWalletFunding.findOne({
                transactionRef,
                user: userId
            });

            if (!betWalletFunding) {
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found'
                });
            }

            console.log('📊 Status check for VTU Africa transaction:', {
                transactionRef,
                currentStatus: betWalletFunding.status,
                provider: 'vtu-africa',
                webhookReceived: !!betWalletFunding.metadata?.webhookReceived
            });

            // Enhanced status info with webhook data
            const statusInfo = {
                ...betWalletFunding.toObject(),
                canRetry: betWalletFunding.canRetry ? betWalletFunding.canRetry() : false,
                platformInfo: betWalletFunding.getPlatformInfo ? betWalletFunding.getPlatformInfo() : null,
                fundingInstructions: betWalletFunding.getFundingInstructions ? betWalletFunding.getFundingInstructions() : null,
                provider: 'VTU Africa',
                webhookStatus: {
                    configured: !!betWalletFunding.webhookURL,
                    received: !!betWalletFunding.metadata?.webhookReceived,
                    timestamp: betWalletFunding.metadata?.webhookTimestamp,
                    finalStatus: betWalletFunding.metadata?.finalStatus
                },
                statusNote: betWalletFunding.status === 'pending' ?
                    'VTU Africa processes transactions instantly. If not completed within 5 minutes, contact support.' :
                    'Transaction processed successfully via VTU Africa.'
            };

            res.status(200).json({
                success: true,
                data: statusInfo
            });
        } catch (error) {
            console.error('❌ Error getting bet wallet funding status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get funding status',
                error: error.message
            });
        }
    };

    /**
     * Get user's bet wallet funding history (VTU Africa)
     */
    const getBetWalletFundingHistory = async (req, res) => {
        try {
            const userId = req.user.id;
            const { page = 1, limit = 10, platform } = req.query;

            const options = {
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                sort: { createdAt: -1 }
            };

            const query = { user: userId };
            if (platform) {
                query.platform = platform;
            }

            const fundingHistory = await BetWalletFunding.paginate(query, options);

            // Add VTU Africa specific information to each record
            const enhancedDocs = fundingHistory.docs.map(doc => ({
                ...doc.toObject(),
                provider: 'VTU Africa',
                serviceChargeInfo: {
                    charge: doc.serviceCharge || 30,
                    description: 'VTU Africa service charge'
                },
                webhookStatus: {
                    configured: !!doc.webhookURL,
                    received: !!doc.metadata?.webhookReceived
                }
            }));

            res.status(200).json({
                success: true,
                data: {
                    ...fundingHistory,
                    docs: enhancedDocs
                }
            });
        } catch (error) {
            console.error('Error fetching bet wallet funding history:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch funding history',
                error: error.message
            });
        }
    };

    /**
     * Get platform statistics and limits (VTU Africa)
     */
    const getPlatformStats = async (req, res) => {
        try {
            const { platformId } = req.params;
            const userId = req.user.id;

            if (!platformId) {
                return res.status(400).json({
                    success: false,
                    message: 'Platform ID is required'
                });
            }

            // Get user's funding stats for this platform
            const userStats = await BetWalletFunding.aggregate([
                {
                    $match: {
                        user: new mongoose.Types.ObjectId(userId),
                        platform: platformId,
                        status: 'completed'
                    }
                },
                {
                    $group: {
                        _id: null,
                        totalFunded: { $sum: '$amount' },
                        totalTransactions: { $sum: 1 },
                        averageAmount: { $avg: '$amount' },
                        lastFunding: { $max: '$createdAt' },
                        totalCharges: { $sum: '$serviceCharge' }
                    }
                }
            ]);

            // Get platform info from VTU Africa
            const platformInfo = {
                id: platformId,
                name: platformId,
                displayName: platformId.charAt(0).toUpperCase() + platformId.slice(1),
                minAmount: 100,
                maxAmount: 100000,
                charge: 30,
                provider: 'VTU Africa'
            };

            res.status(200).json({
                success: true,
                data: {
                    platform: {
                        ...platformInfo,
                        chargeDescription: 'Fixed charge per transaction'
                    },
                    userStats: userStats[0] || {
                        totalFunded: 0,
                        totalTransactions: 0,
                        averageAmount: 0,
                        lastFunding: null,
                        totalCharges: 0
                    }
                }
            });
        } catch (error) {
            console.error('Error fetching platform stats:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch platform statistics',
                error: error.message
            });
        }
    };

    /**
     * Test VTU Africa connection
     */
    const testVTUAfricaConnection = async (req, res) => {
        try {
            console.log('Testing VTU Africa API connection...');
            const connectionTest = await VTUAfricaService.testConnection();

            res.status(200).json({
                success: connectionTest.success,
                message: connectionTest.success
                    ? 'VTU Africa connection successful'
                    : 'VTU Africa connection failed',
                data: connectionTest
            });
        } catch (error) {
            console.error('Error testing VTU Africa connection:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to test VTU Africa connection',
                error: error.message
            });
        }
    };

    /**
     * Get VTU Africa account balance
     */
    const getVTUAfricaBalance = async (req, res) => {
        try {
            console.log('Checking VTU Africa account balance...');
            const balanceResult = await VTUAfricaService.getAccountBalance();

            res.status(200).json({
                success: balanceResult.success,
                message: balanceResult.message,
                data: balanceResult
            });
        } catch (error) {
            console.error('Error checking VTU Africa balance:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check VTU Africa balance',
                error: error.message
            });
        }
    };

    // ==================== ENHANCED PAYMENT HISTORY ====================

    /**
     * Get enhanced payment history including bet wallet funding
     */
    const getEnhancedPaymentHistory = async (req, res) => {
        try {
            const userId = req.user.id;
            const { page = 1, limit = 10, serviceType } = req.query;

            const options = {
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                sort: { createdAt: -1 }
            };

            let allTransactions = [];

            // Get regular bill payments
            if (!serviceType || serviceType === 'bill_payment') {
                const billPayments = await BillPayment.paginate({ user: userId }, options);
                allTransactions = allTransactions.concat(billPayments.docs.map(payment => ({
                    ...payment.toObject(),
                    category: 'bill_payment'
                })));
            }

            // Get bet wallet funding (VTU Africa)
            if (!serviceType || serviceType === 'bet_wallet_funding') {
                const betWalletFundings = await BetWalletFunding.paginate({ user: userId }, options);
                allTransactions = allTransactions.concat(betWalletFundings.docs.map(funding => ({
                    ...funding.toObject(),
                    category: 'bet_wallet_funding',
                    provider: 'VTU Africa'
                })));
            }

            // Sort by creation date
            allTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            // Paginate results
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const paginatedTransactions = allTransactions.slice(startIndex, endIndex);

            res.status(200).json({
                success: true,
                docs: paginatedTransactions,
                totalDocs: allTransactions.length,
                limit: parseInt(limit),
                page: parseInt(page),
                totalPages: Math.ceil(allTransactions.length / limit),
                hasNextPage: endIndex < allTransactions.length,
                hasPrevPage: page > 1,
                meta: {
                    provider: 'VTU Africa',
                    supportedPlatforms: ['bet9ja', 'sportybet', 'nairabet', 'betway', '1xbet', 'betking']
                }
            });
        } catch (error) {
            console.error('Error fetching enhanced payment history:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payment history',
                error: error.message
            });
        }
    };

    // Return all methods including original ones and new VTU Africa ones
    return {
        // Original BillPaymentController methods
        ...originalController,

        // Bet Wallet Funding methods (VTU Africa)
        getSupportedBettingPlatforms,
        getPlatformFundingOptions,
        verifyBettingAccount,
        fundBettingWallet,
        getBetWalletFundingStatus,
        getBetWalletFundingHistory,
        getPlatformStats,

        // VTU Africa specific methods
        testVTUAfricaConnection,
        getVTUAfricaBalance,
        handleVTUAfricaWebhook, // NEW: Webhook handler

        // Enhanced methods
        getEnhancedPaymentHistory
    };
}

export default BetWalletFundingController;