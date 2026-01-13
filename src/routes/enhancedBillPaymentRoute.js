// routes/enhancedBillPaymentRoutes.js - Complete Enhanced Routes (Corrected)
import express from 'express';
import EnhancedBillPaymentController from '../controller/EnhancedBillPaymentController.js';
import { authMiddleware } from '../middleware/auth.js';
// import { rateLimitMiddleware } from '../middleware/rateLimit.js';
import smsRoute from "./smsRoute.js";

const router = express.Router();

// Initialize controller
const {
    // Original methods (from base BillPaymentController)
    getServiceCategories,
    getServicesByCategory,
    getServiceVariations,
    verifyCustomer,
    payBill,
    getTransactionStatus,
    getPaymentHistory,
    refreshServices,
    getCacheInfo,
    testVTPassConnection,
    testVTPassCredentials,
    testAvailableServices,
    getVTPassBalance,
    getVTPassSupport,
    diagnoseVTPassIssues,
    getInsuranceVariations,
    getVehicleColors,
    getEngineCapacities,
    getStates,
    getLGAs,
    getVehicleMakes,
    getVehicleModels,

    // Sports Betting methods
    getSports,
    getLeagues,
    getMatches,
    placeBet,
    getBetStatus,

    // Flight Booking methods
    searchFlights,
    bookFlight,
    getFlightBooking,
    searchAirports,

    // International Airtime methods (corrected)
    getInternationalCountries,
    getInternationalProductTypes,  // Added missing method
    getInternationalOperators,
    getInternationalProducts,
    purchaseInternationalAirtime,
    getInternationalAirtimeStatus,
    getExchangeRates,

    // Enhanced methods
    getEnhancedPaymentHistory,
    getAdminEnhancedHistory
} = EnhancedBillPaymentController();

// ==================== PUBLIC ROUTES (No Authentication Required) ====================

// Original VTPass service routes
router.get('/services/categories', getServiceCategories);
router.get('/services/:category', getServicesByCategory);
router.get('/services/variations/:serviceId', getServiceVariations);

// Insurance-specific routes for third-party motor insurance
router.get('/insurance/variations', getInsuranceVariations);
router.get('/insurance/vehicle-colors', getVehicleColors);
router.get('/insurance/engine-capacities', getEngineCapacities);
router.get('/insurance/states', getStates);
router.get('/insurance/lgas/:stateCode', getLGAs);
router.get('/insurance/vehicle-makes', getVehicleMakes);
router.get('/insurance/vehicle-models/:makeCode', getVehicleModels);

// Sports Betting public routes
router.get('/sports', getSports);
router.get('/sports/:sportId/leagues', getLeagues);
router.get('/sports/:sportId/matches', getMatches);

// Flight Booking public routes
router.get('/flights/search', searchFlights);
router.get('/flights/airports/search', searchAirports);

// ==================== CORRECTED INTERNATIONAL AIRTIME PUBLIC ROUTES ====================

/**
 * @route   GET /api/bills/international-airtime/countries
 * @desc    Get supported countries for international airtime
 * @access  Public
 * @vtpass  GET /api/get-international-airtime-countries
 * @returns {
 *   success: boolean,
 *   data: {
 *     success: boolean,
 *     countries: Array<{
 *       code: string,        // ISO 2-letter country code (e.g., 'GH', 'KE')
 *       name: string,        // Country name (e.g., 'Ghana', 'Kenya')
 *       flag?: string        // Country flag emoji
 *     }>
 *   }
 * }
 */
router.get('/international-airtime/countries', getInternationalCountries);

/**
 * @route   GET /api/bills/international-airtime/product-types/:countryCode
 * @desc    Get product types for a country (Mobile Top Up, Mobile Data, etc.)
 * @access  Public
 * @vtpass  GET /api/get-international-airtime-product-types?code={countryCode}
 * @param   countryCode - ISO 2-letter country code (e.g., 'GH', 'KE')
 * @returns {
 *   success: boolean,
 *   data: {
 *     success: boolean,
 *     productTypes: Array<{
 *       product_type_id: number,  // Product type ID (1=Mobile Top Up, 4=Mobile Data)
 *       name: string             // Product type name
 *     }>
 *   }
 * }
 */
router.get('/international-airtime/product-types/:countryCode', getInternationalProductTypes);

/**
 * @route   GET /api/bills/international-airtime/operators/:countryCode
 * @desc    Get operators for a country and product type
 * @access  Public
 * @vtpass  GET /api/get-international-airtime-operators?code={countryCode}&product_type_id={productTypeId}
 * @param   countryCode - ISO 2-letter country code (e.g., 'GH', 'KE')
 * @query   product_type_id - Product type ID (default: 1 for Mobile Top Up)
 * @returns {
 *   success: boolean,
 *   data: {
 *     success: boolean,
 *     operators: Array<{
 *       operator_id: number,     // VTPass operator ID
 *       name: string,           // Operator name (e.g., 'MTN Ghana')
 *       logo?: string          // Operator logo URL
 *     }>
 *   }
 * }
 */
router.get('/international-airtime/operators/:countryCode', getInternationalOperators);

/**
 * @route   GET /api/bills/international-airtime/products/:operatorId
 * @desc    Get products/variations for an operator
 * @access  Public
 * @vtpass  GET /api/service-variations?serviceID=foreign-airtime&operator_id={operatorId}&product_type_id={productTypeId}
 * @param   operatorId - VTPass operator ID
 * @query   product_type_id - Product type ID (default: 1 for Mobile Top Up)
 * @returns {
 *   success: boolean,
 *   data: {
 *     success: boolean,
 *     products: Array<{
 *       code: string,           // VTPass variation code for purchase
 *       name: string,           // Product name/description
 *       amount: number,         // Amount in local currency
 *       currency: string,       // Local currency code
 *       denomination: string,   // Display denomination (e.g., '5 GHS')
 *       fixedPrice: boolean,    // Whether price is fixed or variable
 *       variationRate?: number, // Rate for variable pricing
 *       chargedAmount?: number  // Charged amount in NGN (for fixed price)
 *     }>
 *   }
 * }
 */
router.get('/international-airtime/products/:operatorId', getInternationalProducts);

/**
 * @route   GET /api/bills/international-airtime/exchange-rates
 * @desc    Get current exchange rates for international airtime
 * @access  Public
 * @returns {
 *   success: boolean,
 *   data: {
 *     success: boolean,
 *     base: string,           // Base currency (NGN)
 *     rates: object,          // Exchange rates object
 *     lastUpdated: string     // ISO timestamp
 *   }
 * }
 */
router.get('/international-airtime/exchange-rates', getExchangeRates);

// Support and diagnostic routes
router.get('/vtpass-support', getVTPassSupport);

// Admin/Development routes for service management (with authentication)
router.post('/services/refresh', authMiddleware, refreshServices);
router.get('/services/cache-info', authMiddleware, getCacheInfo);
router.get('/test-vtpass', authMiddleware, testVTPassConnection);
router.get('/test-credentials', authMiddleware, testVTPassCredentials);
router.get('/test-services', authMiddleware, testAvailableServices);
router.get('/vtpass-balance', authMiddleware, getVTPassBalance);
router.get('/diagnose-vtpass', authMiddleware, diagnoseVTPassIssues);

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
router.post('/verify', verifyCustomer);

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
router.post('/pay', payBill);

// SMS routes - Mount SMS routes under /sms
router.use('/sms', smsRoute);

// Transaction management
router.get('/transactions/:transactionRef', getTransactionStatus);
router.get('/history', getPaymentHistory);

// Enhanced payment history (includes all service types)
router.get('/enhanced-history', getEnhancedPaymentHistory);

// Admin enhanced history (view all transactions)
router.get('/admin/enhanced-history', getAdminEnhancedHistory);

// ==================== SPORTS BETTING ROUTES ====================

/**
 * @route   POST /api/bills/sports-betting/place-bet
 * @desc    Place a sports bet
 * @access  Private
 * @body    {
 *   betType: string,        // 'single', 'accumulator', 'system', 'combo'
 *   sport: string,          // 'football', 'basketball', etc.
 *   league?: string,        // Optional league identifier
 *   matches: Array<{        // Array of match selections
 *     matchId: string,
 *     homeTeam: string,
 *     awayTeam: string,
 *     market: string,       // '1X2', 'Over/Under', etc.
 *     selection: string,    // 'Home Win', 'Over 2.5', etc.
 *     odds: number,         // Decimal odds (e.g. 2.50)
 *     kickoffTime?: Date
 *   }>,
 *   stake: number,          // Amount to wager (min: 50, max: 1,000,000)
 *   potentialWinnings: number, // Calculated potential winnings
 *   totalOdds: number,      // Combined odds for accumulator
 *   bookmaker: string,      // 'bet9ja', 'sportybet', etc.
 *   paymentMethod?: string  // Default: 'wallet'
 * }
 */
router.post('/sports-betting/place-bet', placeBet);

/**
 * @route   GET /api/bills/sports-betting/bet-status/:transactionRef
 * @desc    Get bet status and update if necessary
 * @access  Private
 */
router.get('/sports-betting/bet-status/:transactionRef', getBetStatus);

// ==================== FLIGHT BOOKING ROUTES ====================

/**
 * @route   POST /api/bills/flights/book
 * @desc    Book a flight
 * @access  Private
 * @body    {
 *   flightOffer: object,    // Flight offer from search results
 *   travelers: Array<{      // Passenger information
 *     type: string,         // 'adult', 'child', 'infant'
 *     title: string,        // 'Mr', 'Mrs', 'Ms', 'Dr', 'Prof'
 *     firstName: string,
 *     lastName: string,
 *     dateOfBirth: Date,
 *     gender: string,       // 'male', 'female'
 *     passportNumber?: string,
 *     nationality?: string  // Default: 'NG'
 *   }>,
 *   contactInfo: {          // Contact information
 *     email: string,
 *     phone: string,
 *     emergencyContact?: {
 *       name?: string,
 *       phone?: string,
 *       relationship?: string
 *     }
 *   },
 *   paymentMethod?: string  // Default: 'wallet'
 * }
 */
router.post('/flights/book', bookFlight);

/**
 * @route   GET /api/bills/flights/booking/:transactionRef
 * @desc    Get flight booking details
 * @access  Private
 */
router.get('/flights/booking/:transactionRef', getFlightBooking);

// ==================== CORRECTED INTERNATIONAL AIRTIME PROTECTED ROUTES ====================

/**
 * @route   POST /api/bills/international-airtime/purchase
 * @desc    Purchase international airtime using VTPass foreign-airtime service
 * @access  Private
 * @vtpass  POST /api/pay with serviceID=foreign-airtime
 * @body    {
 *   country: {              // Destination country
 *     code: string,         // ISO 2-letter country code (e.g., 'GH', 'KE')
 *     name: string,         // Country name (e.g., 'Ghana', 'Kenya')
 *     dialingCode: string,  // International dialing code (e.g., '+233', '+254')
 *     flag?: string,        // Country flag emoji
 *     region?: string       // Region name (optional)
 *   },
 *   operator: {             // Mobile operator
 *     id: number|string,    // VTPass operator ID
 *     name: string,         // Operator name (e.g., 'MTN Ghana')
 *     logo?: string,        // Operator logo URL (optional)
 *     type?: string         // Operator type (optional)
 *   },
 *   productCode: string,    // VTPass variation code from service-variations endpoint
 *   phoneNumber: string,    // Recipient phone number (will be formatted to international)
 *   amount: number,         // Amount in local currency
 *   localCurrency: string,  // Local currency code (e.g., 'GHS', 'KES')
 *   denomination: string,   // Display denomination (e.g., '5 GHS', '10 KES')
 *   productName: string,    // Product name/description
 *   paymentMethod?: string  // Default: 'wallet'
 * }
 * @returns {
 *   success: boolean,
 *   message: string,
 *   data: {
 *     transactionRef: string,     // Our transaction reference
 *     phoneNumber: string,        // Recipient phone number
 *     amount: number,             // Amount in local currency
 *     currency: string,           // Local currency code
 *     nairaAmount: number,        // Amount charged in NGN
 *     status: string,             // Transaction status
 *     deliveryMethod: string,     // Delivery method (usually 'instant')
 *     instructions: string        // Delivery instructions
 *   }
 * }
 */
router.post('/international-airtime/purchase', purchaseInternationalAirtime);

/**
 * @route   GET /api/bills/international-airtime/status/:transactionRef
 * @desc    Get international airtime transaction status
 * @access  Private
 * @param   transactionRef - Transaction reference from purchase
 * @returns {
 *   success: boolean,
 *   data: {
 *     transactionRef: string,         // Transaction reference
 *     status: string,                 // Current status
 *     country: object,                // Country details
 *     operator: object,               // Operator details
 *     phoneNumber: string,            // Recipient phone
 *     amount: number,                 // Local amount
 *     nairaEquivalent: number,        // NGN amount charged
 *     deliveryMethod: string,         // Delivery method
 *     deliveredAt?: Date,             // Delivery timestamp
 *     canRetry: boolean,              // Whether retry is allowed
 *     formattedPhone: string,         // Formatted phone number
 *     deliveryInstructions: string,   // Instructions for user
 *     // ... other transaction fields
 *   }
 * }
 */
router.get('/international-airtime/status/:transactionRef', getInternationalAirtimeStatus);

// ==================== CORRECTED API FLOW DOCUMENTATION ====================

/*
CORRECTED VTPASS INTERNATIONAL AIRTIME API FLOW:

1. Get Countries:
   GET /api/bills/international-airtime/countries
   → VTPass: GET /api/get-international-airtime-countries

2. Get Product Types (optional, for countries with multiple product types):
   GET /api/bills/international-airtime/product-types/GH
   → VTPass: GET /api/get-international-airtime-product-types?code=GH

3. Get Operators:
   GET /api/bills/international-airtime/operators/GH?product_type_id=1
   → VTPass: GET /api/get-international-airtime-operators?code=GH&product_type_id=1

4. Get Products/Variations:
   GET /api/bills/international-airtime/products/1?product_type_id=1
   → VTPass: GET /api/service-variations?serviceID=foreign-airtime&operator_id=1&product_type_id=1

5. Purchase Airtime:
   POST /api/bills/international-airtime/purchase
   → VTPass: POST /api/pay with serviceID=foreign-airtime and variation_code

6. Check Status:
   GET /api/bills/international-airtime/status/INTL_1234567890_ABC123
   → VTPass: POST /api/requery with request_id

EXAMPLE PURCHASE REQUEST:
{
  "country": {
    "code": "GH",
    "name": "Ghana",
    "dialingCode": "+233",
    "flag": "🇬🇭"
  },
  "operator": {
    "id": 1,
    "name": "MTN Ghana"
  },
  "productCode": "foreign-airtime-5-ghs",
  "phoneNumber": "201234567",
  "amount": 5,
  "localCurrency": "GHS",
  "denomination": "5 GHS",
  "productName": "5 GHS Mobile Top Up"
}

VTPASS PAYLOAD GENERATED:
{
  "request_id": "INTL_1234567890_ABC123",
  "serviceID": "foreign-airtime",
  "variation_code": "foreign-airtime-5-ghs",
  "amount": 5,
  "phone": "+233201234567"
}
*/

// ==================== ERROR HANDLING MIDDLEWARE ====================

// Global error handler for this router
router.use((error, req, res, next) => {
    console.error('Enhanced Bill Payment Route Error:', {
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

    // Default error response
    res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
});

export default router;