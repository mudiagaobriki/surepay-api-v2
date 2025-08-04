// routes/betWalletFundingRoutes.js - Bet Wallet Funding Routes with 9JaPay
import express from 'express';
import BetWalletFundingController from '../controller/BetWalletFundingController.js';
import { authMiddleware } from '../middleware/auth.js';
import smsRoute from "./smsRoute.js";

const router = express.Router();

// Initialize controller
const {
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
} = BetWalletFundingController();


// Bet Wallet Funding public routes
router.get('/bet-wallet/platforms', getSupportedBettingPlatforms);
router.get('/bet-wallet/platforms/:platformId/funding-options', getPlatformFundingOptions);

// ==================== PROTECTED ROUTES (Authentication Required) ====================
router.use(authMiddleware);

// ==================== ORIGINAL BILL PAYMENT ROUTES ====================

/**
 * @route   POST /api/bills/verify
 * @desc    Verify customer details for a service
 * @access  Private
 * @body    {
 *   serviceID: string,      // Service identifier (e.g., 'ikeja-electric')
 *   billersCode: string,    // Customer identifier (meter number, account number, etc.)
 *   type?: string,          // Variation type for services with multiple options
 *   amount?: number         // Amount for services requiring amount validation
 * }
 */
// router.post('/verify', verifyCustomer);

/**
 * @route   POST /api/bills/pay
 * @desc    Pay a bill
 * @access  Private
 * @body    {
 *   serviceID: string,      // Service identifier
 *   billersCode: string,    // Customer identifier
 *   variation_code?: string, // Variation code for services with options
 *   amount: number,         // Amount to pay
 *   phone: string,          // Customer phone number
 *   email?: string,         // Customer email (optional)
 *   customerName?: string,  // Customer name (optional)
 *   paymentMethod?: string  // 'wallet' or 'card' (default: 'wallet')
 * }
 */

// ==================== BET WALLET FUNDING ROUTES ====================

/**
 * @route   POST /api/bills/bet-wallet/verify-account
 * @desc    Verify betting account for wallet funding
 * @access  Private
 * @body    {
 *   platform: string,           // 'bet9ja', 'sportybet', 'nairabet', etc.
 *   accountIdentifier: string,  // Username, email, or account ID
 *   customerPhone?: string      // Optional phone for verification
 * }
 * @response {
 *   success: boolean,
 *   data: {
 *     accountName: string,
 *     accountId: string,
 *     platform: string,
 *     verified: boolean,
 *     minAmount: number,
 *     maxAmount: number
 *   }
 * }
 */
router.post('/bet-wallet/verify-account', verifyBettingAccount);

/**
 * @route   POST /api/bills/bet-wallet/fund
 * @desc    Fund a betting wallet using 9JaPay
 * @access  Private
 * @body    {
 *   platform: string,           // 'bet9ja', 'sportybet', 'nairabet', etc.
 *   accountIdentifier: string,  // Username, email, or account ID
 *   accountName: string,        // Account holder name
 *   amount: number,             // Amount to fund (min: 100, max: 500,000)
 *   fundingType: string,        // 'instant', 'voucher', 'direct'
 *   paymentMethod?: string,     // Default: 'wallet'
 *   customerPhone?: string,     // Optional phone
 *   description?: string        // Optional description
 * }
 * @response {
 *   success: boolean,
 *   data: {
 *     transactionRef: string,
 *     platform: string,
 *     accountName: string,
 *     amount: number,
 *     status: string,
 *     fundingMethod: string,
 *     voucherCode?: string,     // If voucher funding
 *     instructions: string
 *   }
 * }
 */
router.post('/bet-wallet/fund', fundBettingWallet);

/**
 * @route   GET /api/bills/bet-wallet/status/:transactionRef
 * @desc    Get bet wallet funding status
 * @access  Private
 * @response {
 *   success: boolean,
 *   data: {
 *     transactionRef: string,
 *     platform: string,
 *     amount: number,
 *     status: string,
 *     fundingMethod: string,
 *     voucherCode?: string,
 *     instructions: string,
 *     canRetry: boolean,
 *     platformInfo: object,
 *     fundingInstructions: object
 *   }
 * }
 */
router.get('/bet-wallet/status/:transactionRef', getBetWalletFundingStatus);

/**
 * @route   GET /api/bills/bet-wallet/history
 * @desc    Get user's bet wallet funding history
 * @access  Private
 * @query   {
 *   page?: number,      // Page number (default: 1)
 *   limit?: number,     // Results per page (default: 10)
 *   platform?: string  // Filter by platform
 * }
 * @response {
 *   success: boolean,
 *   data: {
 *     docs: Array,
 *     totalDocs: number,
 *     limit: number,
 *     page: number,
 *     totalPages: number,
 *     hasNextPage: boolean,
 *     hasPrevPage: boolean
 *   }
 * }
 */
router.get('/bet-wallet/history', getBetWalletFundingHistory);

/**
 * @route   GET /api/bills/bet-wallet/platforms/:platformId/stats
 * @desc    Get platform statistics and user's funding stats
 * @access  Private
 * @response {
 *   success: boolean,
 *   data: {
 *     platform: object,     // Platform info (limits, fees, etc.)
 *     userStats: {
 *       totalFunded: number,
 *       totalTransactions: number,
 *       averageAmount: number,
 *       lastFunding: Date
 *     }
 *   }
 * }
 */
router.get('/bet-wallet/platforms/:platformId/stats', getPlatformStats);

// ==================== ENHANCED FEATURES ====================

/**
 * @route   GET /api/bills/bet-wallet/platforms/favorites
 * @desc    Get user's favorite betting platforms
 * @access  Private
 * @response {
 *   success: boolean,
 *   data: Array<{
 *     platform: string,
 *     totalAmount: number,
 *     totalTransactions: number,
 *     lastUsed: Date
 *   }>
 * }
 */
router.get('/bet-wallet/platforms/favorites', async (req, res) => {
    try {
        const userId = req.user.id;
        const { BetWalletFunding } = require('../models/BetWalletFunding.js');

        const favorites = await BetWalletFunding.getFavoritePlatforms(userId, 5);

        res.status(200).json({
            success: true,
            data: favorites
        });
    } catch (error) {
        console.error('Error fetching favorite platforms:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch favorite platforms',
            error: error.message
        });
    }
});

/**
 * @route   GET /api/bills/bet-wallet/summary
 * @desc    Get user's betting wallet funding summary
 * @access  Private
 * @response {
 *   success: boolean,
 *   data: {
 *     totalFunded: number,
 *     totalTransactions: number,
 *     favoritePlatform: string,
 *     monthlyStats: object,
 *     recentTransactions: Array
 *   }
 * }
 */
router.get('/bet-wallet/summary', async (req, res) => {
    try {
        const userId = req.user.id;
        const { BetWalletFunding } = require('../models/BetWalletFunding.js');

        // Get overall stats
        const overallStats = await BetWalletFunding.aggregate([
            {
                $match: {
                    user: mongoose.Types.ObjectId(userId),
                    status: 'completed'
                }
            },
            {
                $group: {
                    _id: null,
                    totalFunded: { $sum: '$amount' },
                    totalTransactions: { $sum: 1 },
                    platforms: { $addToSet: '$platform' }
                }
            }
        ]);

        // Get monthly stats (last 30 days)
        const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
        const monthlyStats = await BetWalletFunding.aggregate([
            {
                $match: {
                    user: mongoose.Types.ObjectId(userId),
                    status: 'completed',
                    createdAt: { $gte: thirtyDaysAgo }
                }
            },
            {
                $group: {
                    _id: null,
                    monthlyFunded: { $sum: '$amount' },
                    monthlyTransactions: { $sum: 1 }
                }
            }
        ]);

        // Get favorite platform
        const favorites = await BetWalletFunding.getFavoritePlatforms(userId, 1);

        // Get recent transactions
        const recentTransactions = await BetWalletFunding.find({
            user: userId
        })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('platform amount status createdAt fundingType');

        const summary = {
            totalFunded: overallStats[0]?.totalFunded || 0,
            totalTransactions: overallStats[0]?.totalTransactions || 0,
            totalPlatforms: overallStats[0]?.platforms?.length || 0,
            favoritePlatform: favorites[0]?.platform || null,
            monthlyStats: {
                funded: monthlyStats[0]?.monthlyFunded || 0,
                transactions: monthlyStats[0]?.monthlyTransactions || 0
            },
            recentTransactions
        };

        res.status(200).json({
            success: true,
            data: summary
        });
    } catch (error) {
        console.error('Error fetching bet wallet summary:', error);
        res.status(500).json({
            success: false,
            message: 'Failed to fetch summary',
            error: error.message
        });
    }
});

// ==================== ERROR HANDLING MIDDLEWARE ====================

// Global error handler for this router
router.use((error, req, res, next) => {
    console.error('Bet Wallet Funding Route Error:', {
        method: req.method,
        url: req.url,
        error: error.message,
        stack: error.stack,
        userId: req.user?.id
    });

    // Handle specific error types
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: Object.values(error.errors).map(err => err.message)
        });
    }

    if (error.name === 'CastError') {
        return res.status(400).json({
            success: false,
            message: 'Invalid ID format'
        });
    }

    if (error.code === 11000) {
        return res.status(400).json({
            success: false,
            message: 'Duplicate entry detected'
        });
    }

    // Rate limit errors
    if (error.status === 429) {
        return res.status(429).json({
            success: false,
            message: 'Too many requests. Please try again later.',
            retryAfter: error.retryAfter
        });
    }

    // Network/external service errors
    if (error.code === 'ECONNREFUSED' || error.code === 'ENOTFOUND') {
        return res.status(503).json({
            success: false,
            message: 'Service temporarily unavailable. Please try again later.'
        });
    }

    // 9JaPay API errors
    if (error.message.includes('9JaPay') || error.message.includes('Wallet funding failed')) {
        return res.status(502).json({
            success: false,
            message: 'Betting wallet funding service error. Please try again.',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }

    // Default error response
    res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
});

export default router;