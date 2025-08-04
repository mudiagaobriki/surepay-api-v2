// controller/BetWalletFundingController.js - Bet Wallet Funding with 9JaPay Integration
import BillPayment from '../models/BillPayment.js';
import BetWalletFunding from '../models/BetWalletFunding.js';
import User from '../models/User.js';
import VTPassService from '../services/VTPassService.js';
import NinejaPayService from '../services/NinejaPayService.js';
import WalletService from '../services/WalletService.js';
import {
    sendBillPaymentEmail,
    sendTransactionNotificationEmail
} from '../../utils/emails/sendEmails.js';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import BillPaymentController from "./BillPaymentController.js";

function BetWalletFundingController() {
    // Import all existing methods from original BillPaymentController
    const originalController = BillPaymentController();

    // ==================== BET WALLET FUNDING ENDPOINTS ====================

    /**
     * Get supported betting platforms for wallet funding
     */
    const getSupportedBettingPlatforms = async (req, res) => {
        try {
            console.log('Fetching supported betting platforms for wallet funding...');
            const platforms = await NinejaPayService.getSupportedBettingPlatforms();

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
     * Get funding options for a specific betting platform
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
            const fundingOptions = await NinejaPayService.getPlatformFundingOptions(platformId);

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
     * Verify betting account for wallet funding
     */
    const verifyBettingAccount = async (req, res) => {
        try {
            const schema = Joi.object({
                platform: Joi.string().valid('bet9ja', 'sportybet', 'nairabet', 'betway', '1xbet', 'betking', 'merrybet').required(),
                accountIdentifier: Joi.string().required(), // Username, email, or account ID
                customerPhone: Joi.string().optional() // Some platforms may require phone verification
            });

            const { error, value } = schema.validate(req.body, { abortEarly: false });

            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    details: error.details.map(err => err.message)
                });
            }

            console.log(`Verifying betting account for platform: ${value.platform}`);

            // Verify account with 9JaPay
            const verificationResult = await NinejaPayService.verifyBettingAccount({
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
                        maxAmount: verificationResult.maxAmount || 500000
                    }
                });
            } else {
                res.status(400).json({
                    success: false,
                    message: 'Account verification failed',
                    error: verificationResult.message
                });
            }
        } catch (error) {
            console.error('Error verifying betting account:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to verify betting account',
                error: error.message
            });
        }
    };

    /**
     * Fund betting wallet
     */
    const fundBettingWallet = async (req, res) => {
        try {
            const schema = Joi.object({
                platform: Joi.string().valid('bet9ja', 'sportybet', 'nairabet', 'betway', '1xbet', 'betking', 'merrybet').required(),
                accountIdentifier: Joi.string().required(),
                accountName: Joi.string().required(),
                amount: Joi.number().min(100).max(500000).required(),
                fundingType: Joi.string().valid('instant', 'voucher', 'direct').default('instant'),
                paymentMethod: Joi.string().valid('wallet').default('wallet'),
                customerPhone: Joi.string().optional(),
                description: Joi.string().optional()
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

            // Validate funding amount for platform
            const platformLimits = await NinejaPayService.getPlatformLimits(value.platform);
            if (value.amount < platformLimits.minAmount || value.amount > platformLimits.maxAmount) {
                return res.status(400).json({
                    success: false,
                    message: `Amount must be between ₦${platformLimits.minAmount} and ₦${platformLimits.maxAmount}`,
                    limits: platformLimits
                });
            }

            // Check wallet balance
            const walletInfo = await WalletService.getBalance(userId);
            if (walletInfo.balance < value.amount) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient wallet balance',
                    required: value.amount,
                    available: walletInfo.balance
                });
            }

            // Generate transaction reference
            const transactionRef = `BETWALLET_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

            // Create bet wallet funding record
            const betWalletFunding = await BetWalletFunding.create({
                user: userId,
                platform: value.platform,
                accountIdentifier: value.accountIdentifier,
                accountName: value.accountName,
                amount: value.amount,
                fundingType: value.fundingType,
                transactionRef,
                status: 'pending',
                paymentMethod: value.paymentMethod,
                customerPhone: value.customerPhone,
                description: value.description,
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip
            });

            // Debit wallet
            await WalletService.debitWallet(
                userId,
                value.amount,
                'bill_payment',
                transactionRef,
                {
                    betWalletFundingId: betWalletFunding._id,
                    serviceType: 'bet_wallet_funding',
                    platform: value.platform
                }
            );

            try {
                // Fund betting wallet through 9JaPay
                const fundingResult = await NinejaPayService.fundBettingWallet({
                    platform: value.platform,
                    accountIdentifier: value.accountIdentifier,
                    amount: value.amount,
                    fundingType: value.fundingType,
                    transactionRef,
                    customerPhone: value.customerPhone
                });

                // Update bet wallet funding record
                betWalletFunding.ninejaPayRef = fundingResult.reference;
                betWalletFunding.status = fundingResult.status === 'successful' ? 'completed' : 'failed';
                betWalletFunding.fundingMethod = fundingResult.fundingMethod;
                betWalletFunding.voucherCode = fundingResult.voucherCode; // If voucher funding
                betWalletFunding.fundingInstructions = fundingResult.instructions;
                betWalletFunding.metadata = fundingResult.data;
                await betWalletFunding.save();

                if (fundingResult.success) {
                    // Send success email - FIXED: Added missing phone and account info
                    try {
                        await sendBillPaymentEmail(
                            {
                                serviceType: 'bet_wallet_funding',
                                serviceID: value.platform,
                                amount: value.amount,
                                accountName: value.accountName,
                                accountIdentifier: value.accountIdentifier,
                                phone: value.customerPhone || user.phone || '', // Added phone
                                billersCode: value.accountIdentifier, // Added billersCode using accountIdentifier
                                voucherCode: fundingResult.voucherCode,
                                transactionRef,
                                platform: value.platform,
                                // Additional bet wallet specific fields
                                fundingType: value.fundingType,
                                fundingMethod: fundingResult.fundingMethod,
                                instructions: fundingResult.instructions
                            },
                            user,
                            true,
                            {
                                walletBalance: (await WalletService.getBalance(userId)).balance,
                                vtpassMessage: `Betting wallet funded successfully. ${fundingResult.instructions || ''}`
                            }
                        );
                    } catch (emailError) {
                        console.error('Error sending bet wallet funding email:', emailError);
                    }

                    res.status(200).json({
                        success: true,
                        message: 'Betting wallet funded successfully',
                        data: {
                            transactionRef,
                            platform: value.platform,
                            accountName: value.accountName,
                            accountIdentifier: value.accountIdentifier, // Include in response
                            amount: value.amount,
                            status: betWalletFunding.status,
                            fundingMethod: fundingResult.fundingMethod,
                            voucherCode: fundingResult.voucherCode,
                            instructions: fundingResult.instructions
                        }
                    });
                } else {
                    throw new Error(fundingResult.message || 'Wallet funding failed');
                }
            } catch (fundingError) {
                // Refund wallet and update status
                await WalletService.creditWallet(
                    userId,
                    value.amount,
                    'refund',
                    `refund-${transactionRef}`,
                    { betWalletFundingId: betWalletFunding._id, reason: 'Wallet funding failed' }
                );

                betWalletFunding.status = 'failed';
                betWalletFunding.metadata = { error: fundingError.message };
                await betWalletFunding.save();

                res.status(500).json({
                    success: false,
                    message: 'Betting wallet funding failed',
                    error: fundingError.message,
                    refunded: true
                });
            }
        } catch (error) {
            console.error('Error funding betting wallet:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fund betting wallet',
                error: error.message
            });
        }
    };

    /**
     * Get bet wallet funding status
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

            // Check status with 9JaPay if pending
            if (betWalletFunding.status === 'pending' && betWalletFunding.ninejaPayRef) {
                try {
                    const statusResult = await NinejaPayService.checkFundingStatus(betWalletFunding.ninejaPayRef);

                    if (statusResult.success && statusResult.status !== betWalletFunding.status) {
                        // Update funding status
                        betWalletFunding.status = statusResult.status;
                        if (statusResult.status === 'completed') {
                            betWalletFunding.completedAt = new Date();
                        }
                        await betWalletFunding.save();
                    }
                } catch (statusError) {
                    console.error('Error checking bet wallet funding status:', statusError);
                }
            }

            res.status(200).json({
                success: true,
                data: {
                    ...betWalletFunding.toObject(),
                    canRetry: betWalletFunding.canRetry(),
                    platformInfo: betWalletFunding.getPlatformInfo(),
                    fundingInstructions: betWalletFunding.getFundingInstructions()
                }
            });
        } catch (error) {
            console.error('Error getting bet wallet funding status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get funding status',
                error: error.message
            });
        }
    };

    /**
     * Get user's bet wallet funding history
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

            res.status(200).json({
                success: true,
                data: fundingHistory
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
     * Get platform statistics and limits
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
                        user: mongoose.Types.ObjectId(userId),
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
                        lastFunding: { $max: '$createdAt' }
                    }
                }
            ]);

            // Get platform limits and info
            const platformInfo = await NinejaPayService.getPlatformInfo(platformId);

            res.status(200).json({
                success: true,
                data: {
                    platform: platformInfo,
                    userStats: userStats[0] || {
                        totalFunded: 0,
                        totalTransactions: 0,
                        averageAmount: 0,
                        lastFunding: null
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

            // Get bet wallet funding
            if (!serviceType || serviceType === 'bet_wallet_funding') {
                const betWalletFundings = await BetWalletFunding.paginate({ user: userId }, options);
                allTransactions = allTransactions.concat(betWalletFundings.docs.map(funding => ({
                    ...funding.toObject(),
                    category: 'bet_wallet_funding'
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
                hasPrevPage: page > 1
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

    // Return all methods including original ones and new ones
    return {
        // Original BillPaymentController methods
        ...originalController,

        // Bet Wallet Funding methods
        getSupportedBettingPlatforms,
        getPlatformFundingOptions,
        verifyBettingAccount,
        fundBettingWallet,
        getBetWalletFundingStatus,
        getBetWalletFundingHistory,
        getPlatformStats,

        // Enhanced methods
        getEnhancedPaymentHistory
    };
}

export default BetWalletFundingController;