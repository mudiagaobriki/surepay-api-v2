// src/routes/giftCardRoutes.js
import express from 'express';
import GiftCardController from '../controller/GiftCardController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();

const {
    getCountries,
    getProductsByCountry,
    getProductById,
    calculatePricing,
    purchaseGiftCard,
    getTransactionStatus,
    getGiftCardHistory,
    getGiftCardDetails,
    testReloadlyConnection
} = GiftCardController();

// ==================== PUBLIC ROUTES ====================

/**
 * @route   GET /api/gift-cards/countries
 * @desc    Get available countries for gift cards
 * @access  Public
 */
router.get('/countries', getCountries);

/**
 * @route   GET /api/gift-cards/products/:countryCode
 * @desc    Get gift card products by country
 * @access  Public
 * @params  countryCode - ISO country code (e.g., "US", "NG", "GB")
 * @query   page - Page number (default: 1)
 * @query   size - Items per page (default: 50, max: 100)
 * @query   search - Search by product name
 */
router.get('/products/:countryCode', getProductsByCountry);

/**
 * @route   GET /api/gift-cards/product/:productId
 * @desc    Get detailed information about a specific gift card product
 * @access  Public
 * @params  productId - Reloadly product ID
 */
router.get('/product/:productId', getProductById);

// ==================== ADMIN/TESTING ROUTES ====================

/**
 * @route   GET /api/gift-cards/test-connection
 * @desc    Test Reloadly API connection (admin only)
 * @access  Private (Admin)
 */
router.get('/test-connection', authMiddleware, testReloadlyConnection);

// ==================== PROTECTED ROUTES (Authentication Required) ====================
router.use(authMiddleware);

/**
 * @route   POST /api/gift-cards/calculate-pricing
 * @desc    Calculate gift card pricing in Naira
 * @access  Private
 * @body    {
 *   productId: number,        // Reloadly product ID
 *   unitPriceUSD: number,     // Price per gift card in USD (1-500)
 *   quantity: number          // Number of gift cards (1-10)
 * }
 * @returns {
 *   productId: number,
 *   quantity: number,
 *   unitPriceUSD: number,
 *   totalAmountUSD: number,
 *   exchangeRate: number,
 *   nairaAmount: number,
 *   serviceCharge: number,
 *   serviceChargePercent: number,
 *   totalChargedNGN: number,
 *   breakdown: {
 *     giftCardCost: number,
 *     processingFee: number,
 *     total: number
 *   }
 * }
 */
router.post('/calculate-pricing', calculatePricing);

/**
 * @route   POST /api/gift-cards/purchase
 * @desc    Purchase a gift card
 * @access  Private
 * @body    {
 *   productId: number,        // Reloadly product ID
 *   unitPriceUSD: number,     // Price per gift card in USD
 *   quantity: number,         // Number of gift cards (1-10)
 *   recipientEmail: string,   // Email to send gift card to
 *   recipientPhone?: {        // Optional phone number
 *     countryCode: string,
 *     phoneNumber: string
 *   },
 *   senderName?: string,      // Optional sender name
 *   personalMessage?: string, // Optional personal message
 *   isGift: boolean,         // Whether this is a gift
 *   paymentMethod: string    // Currently only "wallet"
 * }
 * @returns {
 *   transactionRef: string,
 *   reloadlyTransactionId: string,
 *   status: string,
 *   productName: string,
 *   brand: string,
 *   quantity: number,
 *   totalAmountUSD: number,
 *   totalChargedNGN: number,
 *   recipientEmail: string,
 *   deliveredAt: Date,
 *   walletBalance: number,
 *   emailSent: boolean
 * }
 */
router.post('/purchase', purchaseGiftCard);

/**
 * @route   GET /api/gift-cards/transaction/:transactionRef
 * @desc    Get gift card transaction status
 * @access  Private
 * @params  transactionRef - Gift card transaction reference
 * @returns Gift card transaction details with safe card information
 */
router.get('/transaction/:transactionRef', getTransactionStatus);

/**
 * @route   GET /api/gift-cards/history
 * @desc    Get user's gift card purchase history
 * @access  Private
 * @query   page - Page number (default: 1)
 * @query   limit - Items per page (default: 10)
 * @query   status - Filter by status (pending, processing, completed, failed)
 * @query   country - Filter by country code (e.g., "US", "NG")
 * @returns Paginated list of user's gift card transactions
 */
router.get('/history', getGiftCardHistory);

/**
 * @route   GET /api/gift-cards/details/:transactionRef
 * @desc    Get full gift card details including sensitive information (card numbers, PINs)
 * @access  Private (Card holder only)
 * @params  transactionRef - Gift card transaction reference
 * @security This endpoint returns sensitive gift card details and should only be accessible
 *           to the card purchaser. Card details include numbers, PINs, and redemption codes.
 * @returns {
 *   transactionRef: string,
 *   productName: string,
 *   brand: string,
 *   quantity: number,
 *   status: string,
 *   giftCards: Array<{
 *     cardNumber: string,      // Full card number
 *     pin: string,            // Card PIN/code
 *     serialNumber: string,   // Serial number
 *     expiryDate: Date,       // Expiry date
 *     instructions: string,   // Redemption instructions
 *     termsAndConditions: string
 *   }>,
 *   recipientEmail: string,
 *   purchasedAt: Date,
 *   deliveredAt: Date
 * }
 */
router.get('/details/:transactionRef', getGiftCardDetails);

export default router;