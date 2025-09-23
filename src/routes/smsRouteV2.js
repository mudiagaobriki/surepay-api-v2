// routes/smsV2.js - SMS Routes for Express.js Backend
import express from 'express';
import BillPaymentController from '../controller/BillPaymentController.js';
import { authMiddleware } from '../middleware/auth.js';

const router = express.Router();
const billController = BillPaymentController();

// Apply authentication middleware to all SMS routes
router.use(authMiddleware);

/**
 * @route   GET /api/bills/sms/balance
 * @desc    Get SMS unit balance
 * @access  Private
 */
router.get('/balance', billController.getSMSBalance);

/**
 * @route   POST /api/bills/sms/bulk
 * @desc    Send bulk SMS
 * @access  Private
 * @body    {
 *   recipients: string, // Comma or newline separated phone numbers
 *   message: string,    // SMS message content (max 160 chars)
 *   sender?: string,    // Optional sender ID (max 11 chars)
 *   amount: number,     // Total cost
 *   paymentMethod?: string // Default: 'wallet'
 * }
 */
router.post('/bulk', billController.sendBulkSMS);

/**
 * @route   POST /api/bills/sms/units
 * @desc    Purchase SMS units
 * @access  Private
 * @body    {
 *   units: number,      // Number of SMS units to purchase
 *   amount: number,     // Total cost (units * 4)
 *   paymentMethod?: string // Default: 'wallet'
 * }
 */
router.post('/units', billController.purchaseSMSUnits);

/**
 * @route   GET /api/bills/sms/test-connection
 * @desc    Test SMS API connection
 * @access  Private
 */
router.get('/test-connection', billController.testSMSConnection);

export default router;