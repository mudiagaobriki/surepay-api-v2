// routes/flightBookingRoutes.js - Flight Booking Routes
import express from 'express';
import FlightBookingController from '../controller/FlightBookingController.js';
import { authMiddleware } from '../middleware/auth.js';
// import { rateLimitMiddleware } from '../middleware/rateLimit.js';

const router = express.Router();

// Initialize controller
const {
    searchFlights,
    getFlightPricing,
    bookFlight,
    getFlightBooking,
    cancelFlightBooking,
    searchAirports,
    getBookingHistory,
    getTravelClasses,
    testConnection
} = FlightBookingController();

// ==================== PUBLIC ROUTES (No Authentication Required) ====================

/**
 * @route GET /api/flights/search
 * @desc Search for flights
 * @access Public
 * @params origin, destination, departureDate, returnDate?, adults?, children?, infants?, travelClass?, limit?
 */
router.get('/search',searchFlights);

/**
 * @route GET /api/flights/airports/search
 * @desc Search airports by keyword
 * @access Public
 * @params keyword (min 2 characters)
 */
router.get('/airports/search', searchAirports);

/**
 * @route GET /api/flights/travel-classes
 * @desc Get available travel classes
 * @access Public
 */
router.get('/travel-classes', getTravelClasses);

/**
 * @route GET /api/flights/pricing/:flightOfferId
 * @desc Get detailed pricing for a flight offer
 * @access Public
 * @params flightOfferId
 */
router.get('/pricing/:flightOfferId', getFlightPricing);

// ==================== PROTECTED ROUTES (Authentication Required) ====================

/**
 * @route POST /api/flights/book
 * @desc Book a flight
 * @access Private
 * @body { flightOffer, passengers, contactInfo, additionalServices? }
 */
router.post('/book', authMiddleware, bookFlight);

/**
 * @route GET /api/flights/booking/:transactionRef
 * @desc Get flight booking details
 * @access Private
 * @params transactionRef (can be transactionRef or bookingReference)
 */
router.get('/booking/:transactionRef', authMiddleware, getFlightBooking);

/**
 * @route POST /api/flights/cancel/:transactionRef
 * @desc Cancel a flight booking
 * @access Private
 * @params transactionRef
 * @body { reason? }
 */
router.post('/cancel/:transactionRef', authMiddleware, cancelFlightBooking);

/**
 * @route GET /api/flights/history
 * @desc Get user's flight booking history
 * @access Private
 * @params page?, limit?, status?
 */
router.get('/history', authMiddleware, getBookingHistory);

// ==================== ADMIN/DEVELOPMENT ROUTES ====================

/**
 * @route GET /api/flights/test-connection
 * @desc Test flight booking service connection
 * @access Public (in development) / Admin (in production)
 */
router.get('/test-connection', testConnection);

// ==================== ERROR HANDLING MIDDLEWARE ====================

// Handle specific flight booking errors
router.use((error, req, res, next) => {
    console.error('Flight Booking Route Error:', error);

    // Amadeus API specific errors
    if (error.response?.data?.errors) {
        const amadeusErrors = error.response.data.errors.map(err => ({
            code: err.code,
            title: err.title,
            detail: err.detail,
            source: err.source
        }));

        return res.status(error.response.status || 400).json({
            success: false,
            message: 'Flight booking service error',
            errors: amadeusErrors,
            provider: 'amadeus'
        });
    }

    // Validation errors
    if (error.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation error',
            errors: Object.values(error.errors).map(err => ({
                field: err.path,
                message: err.message
            }))
        });
    }

    // JWT/Authentication errors
    if (error.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid authentication token'
        });
    }

    if (error.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Authentication token expired'
        });
    }

    // Rate limiting errors
    if (error.status === 429) {
        return res.status(429).json({
            success: false,
            message: 'Too many requests. Please try again later.',
            retryAfter: error.retryAfter
        });
    }

    // Wallet/Payment errors
    if (error.message?.includes('insufficient')) {
        return res.status(400).json({
            success: false,
            message: 'Insufficient funds in wallet',
            code: 'INSUFFICIENT_FUNDS'
        });
    }

    // Generic server error
    res.status(error.status || 500).json({
        success: false,
        message: error.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: error.stack })
    });
});

export default router;