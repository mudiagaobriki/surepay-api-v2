// routes/betWalletFundingRoutes.js - Updated Bet Wallet Funding Routes with VTU Africa
import express from 'express';
import BetWalletFundingController from '../controller/BetWalletFundingController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

// Initialize controller
const {
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

    // Enhanced methods
    getEnhancedPaymentHistory
} = BetWalletFundingController();

// ==================== PUBLIC ROUTES ====================

/**
 * @route   GET /api/bet-wallet/platforms
 * @desc    Get supported betting platforms from VTU Africa
 * @access  Public
 * @returns {
 *   success: boolean,
 *   data: {
 *     platforms: Array<{
 *       id: string,              // Platform identifier (e.g., 'bet9ja')
 *       name: string,            // API service name
 *       displayName: string,     // Display name
 *       logo: string,            // Platform logo URL
 *       minAmount: number,       // Minimum funding amount
 *       maxAmount: number,       // Maximum funding amount
 *       charge: number,          // VTU Africa service charge (₦30)
 *       color: string,           // Brand color
 *       website: string,         // Platform website
 *       userIdLabel: string,     // Label for user ID field
 *       userIdPlaceholder: string, // Placeholder text
 *       status: string           // Platform status
 *     }>,
 *     meta: {
 *       count: number,
 *       defaultCharge: number,   // VTU Africa fixed charge
 *       currency: string
 *     }
 *   }
 * }
 */
router.get('/platforms', getSupportedBettingPlatforms);

/**
 * @route   GET /api/bet-wallet/platforms/:platformId/funding-options
 * @desc    Get funding options for a specific betting platform (VTU Africa)
 * @access  Public
 * @param   platformId - Platform identifier (e.g., 'bet9ja', 'sportybet')
 * @returns {
 *   success: boolean,
 *   data: {
 *     platform: object,        // Platform details
 *     fundingOptions: {
 *       instant: {
 *         name: string,
 *         description: string,
 *         processingTime: string,
 *         charge: number       // VTU Africa charge
 *       }
 *     },
 *     limits: {
 *       min: number,           // Minimum amount
 *       max: number            // Maximum amount
 *     },
 *     charges: {
 *       fixed: number,         // Fixed charge (₦30)
 *       description: string
 *     }
 *   }
 * }
 */
router.get('/platforms/:platformId/funding-options', getPlatformFundingOptions);

// ==================== ADMIN/DEVELOPMENT ROUTES ====================

/**
 * @route   GET /api/bet-wallet/test-vtu-africa
 * @desc    Test VTU Africa API connection
 * @access  Private (Development)
 */
router.get('/test-vtu-africa', authMiddleware, testVTUAfricaConnection);

/**
 * @route   GET /api/bet-wallet/vtu-africa-balance
 * @desc    Get VTU Africa account balance
 * @access  Private (Admin)
 * @note    VTU Africa doesn't provide balance endpoint - returns info message
 */
router.get('/vtu-africa-balance', authMiddleware, getVTUAfricaBalance);

// ==================== PROTECTED ROUTES (Authentication Required) ====================
router.use(authMiddleware);

// ==================== BET WALLET FUNDING ROUTES (VTU AFRICA) ====================

/**
 * @route   POST /api/bet-wallet/verify-account
 * @desc    Verify betting account for wallet funding (VTU Africa)
 * @access  Private
 * @body    {
 *   platform: string,           // 'bet9ja', 'sportybet', 'nairabet', 'betway', '1xbet', 'betking'
 *   accountIdentifier: string,  // User ID for betting platform (3-50 chars)
 *   customerPhone?: string      // Optional 11-digit phone number
 * }
 * @returns {
 *   success: boolean,
 *   data: {
 *     accountName: string,      // Generated account name
 *     accountId: string,        // User ID
 *     platform: string,         // Platform name
 *     verified: boolean,        // Always true for VTU Africa
 *     minAmount: number,        // 100
 *     maxAmount: number,        // 100000
 *     charge: number           // VTU Africa charge (30)
 *   }
 * }
 */
router.post('/verify-account', verifyBettingAccount);

/**
 * @route   POST /api/bet-wallet/fund
 * @desc    Fund a betting wallet using VTU Africa
 * @access  Private
 * @body    {
 *   platform: string,           // Betting platform
 *   accountIdentifier: string,  // Platform user ID
 *   accountName?: string,       // Optional account name
 *   amount: number,             // Amount to fund (100-100000)
 *   paymentMethod?: string,     // 'wallet' (default)
 *   customerPhone?: string,     // Optional phone number
 *   description?: string        // Optional description (max 200 chars)
 * }
 * @returns {
 *   success: boolean,
 *   data: {
 *     transactionRef: string,         // Our transaction reference
 *     platform: string,               // Platform name
 *     accountName: string,            // Account name
 *     accountIdentifier: string,      // User ID
 *     fundingAmount: number,          // Amount sent to betting platform
 *     serviceCharge: number,          // VTU Africa charge
 *     totalAmountCharged: number,     // Total debited from wallet
 *     status: string,                 // Transaction status
 *     fundingMethod: string,          // 'vtu-africa-instant'
 *     provider: string,               // 'VTU Africa'
 *     vtAfricaReference: string,      // VTU Africa reference
 *     message: string,                // Success message
 *     estimatedDelivery: string       // '1-2 minutes'
 *   }
 * }
 */
router.post('/fund', fundBettingWallet);

/**
 * @route   GET /api/bet-wallet/status/:transactionRef
 * @desc    Get bet wallet funding status (VTU Africa)
 * @access  Private
 * @param   transactionRef - Our transaction reference
 * @returns {
 *   success: boolean,
 *   data: {
 *     // Full BetWalletFunding object plus:
 *     canRetry: boolean,              // Whether retry is allowed
 *     platformInfo: object,           // Platform information
 *     fundingInstructions: object,    // User instructions
 *     provider: string,               // 'VTU Africa'
 *     statusNote: string             // Note about VTU Africa processing
 *   }
 * }
 */
router.get('/status/:transactionRef', getBetWalletFundingStatus);

/**
 * @route   GET /api/bet-wallet/history
 * @desc    Get user's bet wallet funding history (VTU Africa)
 * @access  Private
 * @query   {
 *   page?: number,      // Page number (default: 1)
 *   limit?: number,     // Results per page (default: 10)
 *   platform?: string  // Filter by platform
 * }
 * @returns {
 *   success: boolean,
 *   data: {
 *     docs: Array<{
 *       // BetWalletFunding objects plus:
 *       provider: string,           // 'VTU Africa'
 *       serviceChargeInfo: {
 *         charge: number,           // Service charge
 *         description: string       // Charge description
 *       }
 *     }>,
 *     totalDocs: number,
 *     limit: number,
 *     page: number,
 *     totalPages: number,
 *     hasNextPage: boolean,
 *     hasPrevPage: boolean
 *   }
 * }
 */
router.get('/history', getBetWalletFundingHistory);

/**
 * @route   GET /api/bet-wallet/platforms/:platformId/stats
 * @desc    Get platform statistics and user's funding stats (VTU Africa)
 * @access  Private
 * @param   platformId - Platform identifier
 * @returns {
 *   success: boolean,
 *   data: {
 *     platform: {
 *       // Platform info plus:
 *       provider: string,           // 'VTU Africa'
 *       chargeDescription: string   // Charge info
 *     },
 *     userStats: {
 *       totalFunded: number,        // Total amount funded
 *       totalTransactions: number,  // Number of transactions
 *       averageAmount: number,      // Average transaction
 *       lastFunding: Date,          // Last funding date
 *       totalCharges: number        // Total charges paid
 *     }
 *   }
 * }
 */
router.get('/platforms/:platformId/stats', getPlatformStats);

// ==================== ENHANCED FEATURES ====================

/**
 * @route   GET /api/bet-wallet/enhanced-history
 * @desc    Get enhanced payment history including bet wallet funding (VTU Africa)
 * @access  Private
 * @query   {
 *   page?: number,      // Page number
 *   limit?: number,     // Results per page
 *   serviceType?: string // Filter by service type
 * }
 * @returns {
 *   success: boolean,
 *   docs: Array,        // Mixed transaction types
 *   totalDocs: number,
 *   limit: number,
 *   page: number,
 *   totalPages: number,
 *   hasNextPage: boolean,
 *   hasPrevPage: boolean,
 *   meta: {
 *     provider: string,           // 'VTU Africa'
 *     supportedPlatforms: Array   // Supported platforms
 *   }
 * }
 */
router.get('/enhanced-history', getEnhancedPaymentHistory);

/**
 * @route   GET /api/bet-wallet/platforms/favorites
 * @desc    Get user's favorite betting platforms (VTU Africa)
 * @access  Private
 * @returns {
 *   success: boolean,
 *   data: Array<{
 *     platform: string,
 *     totalFunded: number,
 *     totalTransactions: number,
 *     totalCharges: number,
 *     averageTransaction: number,
 *     lastUsed: Date,
 *     provider: string           // 'VTU Africa'
 *   }>
 * }
 */
router.get('/platforms/favorites', async (req, res) => {
    try {
        const userId = req.user.id;

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
 * @route   GET /api/bet-wallet/summary
 * @desc    Get user's betting wallet funding summary (VTU Africa)
 * @access  Private
 * @returns {
 *   success: boolean,
 *   data: {
 *     totalFunded: number,
 *     totalTransactions: number,
 *     totalCharges: number,
 *     favoritePlatform: string,
 *     monthlyStats: object,
 *     recentTransactions: Array,
 *     provider: string
 *   }
 * }
 */
router.get('/summary', async (req, res) => {
    try {
        const userId = req.user.id;
        const mongoose = require('mongoose');

        // Get overall stats (VTU Africa only)
        const overallStats = await BetWalletFunding.aggregate([
            {
                $match: {
                    user: mongoose.Types.ObjectId(userId),
                    status: 'completed',
                    provider: 'vtu-africa'
                }
            },
            {
                $group: {
                    _id: null,
                    totalFunded: { $sum: '$amount' },
                    totalTransactions: { $sum: 1 },
                    totalCharges: { $sum: '$serviceCharge' },
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
                    provider: 'vtu-africa',
                    createdAt: { $gte: thirtyDaysAgo }
                }
            },
            {
                $group: {
                    _id: null,
                    monthlyFunded: { $sum: '$amount' },
                    monthlyTransactions: { $sum: 1 },
                    monthlyCharges: { $sum: '$serviceCharge' }
                }
            }
        ]);

        // Get favorite platform
        const favorites = await BetWalletFunding.getFavoritePlatforms(userId, 1);

        // Get recent transactions
        const recentTransactions = await BetWalletFunding.find({
            user: userId,
            provider: 'vtu-africa'
        })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('platform amount serviceCharge totalAmountCharged status createdAt fundingType');

        const summary = {
            totalFunded: overallStats[0]?.totalFunded || 0,
            totalTransactions: overallStats[0]?.totalTransactions || 0,
            totalCharges: overallStats[0]?.totalCharges || 0,
            totalPlatforms: overallStats[0]?.platforms?.length || 0,
            favoritePlatform: favorites[0]?.platform || null,
            monthlyStats: {
                funded: monthlyStats[0]?.monthlyFunded || 0,
                transactions: monthlyStats[0]?.monthlyTransactions || 0,
                charges: monthlyStats[0]?.monthlyCharges || 0
            },
            recentTransactions,
            provider: 'VTU Africa',
            averageCharge: overallStats[0]?.totalTransactions > 0 ?
                (overallStats[0].totalCharges / overallStats[0].totalTransactions) : 30
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
    console.error('VTU Africa Bet Wallet Funding Route Error:', {
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
            message: 'Duplicate transaction reference detected'
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
            message: 'VTU Africa service temporarily unavailable. Please try again later.'
        });
    }

    // VTU Africa API errors
    if (error.message.includes('VTU Africa') || error.message.includes('Wallet funding failed')) {
        return res.status(502).json({
            success: false,
            message: 'Betting wallet funding service error. Please try again.',
            provider: 'VTU Africa',
            error: process.env.NODE_ENV === 'development' ? error.message : undefined
        });
    }

    // Default error response
    res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
        provider: 'VTU Africa',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
});

export default router;