// routes/monitoringRoutes.js - Routes for virtual account monitoring
import { Router } from 'express';
import MonitoringControllerFactory from '../controller/VirtualAccountMonitoringController.js';
import { authMiddleware } from '../middleware/auth.js';

const monitoringRouter = Router();
const MonitoringController = MonitoringControllerFactory();

// ==================== PUBLIC ENDPOINTS ====================

/**
 * @route   GET /api/monitoring/health
 * @desc    System health check (public for monitoring services)
 * @access  Public
 */
monitoringRouter.get('/health', MonitoringController.healthCheck);

// ==================== ADMIN/AUTHENTICATED ENDPOINTS ====================

// Apply authentication middleware to all routes below
monitoringRouter.use(authMiddleware);

/**
 * @route   GET /api/monitoring/stats
 * @desc    Get monitoring statistics
 * @access  Private
 */
monitoringRouter.get('/stats', MonitoringController.getStats);

/**
 * @route   POST /api/monitoring/stats/clear
 * @desc    Clear monitoring statistics
 * @access  Private (Admin only)
 */
monitoringRouter.post('/stats/clear', MonitoringController.clearStats);

/**
 * @route   GET /api/monitoring/transactions
 * @desc    Monitor virtual account transactions
 * @access  Private
 */
monitoringRouter.get('/transactions', MonitoringController.monitorTransactions);

/**
 * @route   GET /api/monitoring/transactions/audit
 * @desc    Audit virtual account transactions with filters
 * @access  Private
 * @query   {
 *   startDate?: Date,
 *   endDate?: Date,
 *   userId?: string,
 *   minAmount?: number,
 *   maxAmount?: number
 * }
 */
monitoringRouter.get('/transactions/audit', MonitoringController.auditTransactions);

/**
 * @route   POST /api/monitoring/transactions/reconcile
 * @desc    Reconcile virtual account transactions
 * @access  Private (Admin only)
 * @query   { days?: number } - Number of days to reconcile (default: 7)
 */
monitoringRouter.post('/transactions/reconcile', MonitoringController.reconcileTransactions);

/**
 * @route   GET /api/monitoring/users/:userId/validate
 * @desc    Validate virtual account setup for a specific user
 * @access  Private
 */
monitoringRouter.get('/users/:userId/validate', MonitoringController.validateSetup);

/**
 * @route   POST /api/monitoring/test/credit
 * @desc    Test virtual account credit flow
 * @access  Private (Admin only)
 * @body    {
 *   userId: string,
 *   amount?: number,
 *   mockData?: object
 * }
 */
monitoringRouter.post('/test/credit', MonitoringController.testVirtualAccountCredit);

/**
 * @route   POST /api/monitoring/retry-failed
 * @desc    Retry failed virtual account credits
 * @access  Private (Admin only)
 */
monitoringRouter.post('/retry-failed', MonitoringController.retryFailedCredits);

/**
 * @route   GET /api/monitoring/export
 * @desc    Export monitoring data
 * @access  Private (Admin only)
 * @query   { format?: 'json' | 'csv' }
 */
monitoringRouter.get('/export', MonitoringController.exportData);

// ==================== DEVELOPMENT/TESTING ENDPOINTS ====================
// These endpoints are only available in non-production environments

if (process.env.NODE_ENV !== 'production') {
    /**
     * @route   POST /api/monitoring/test/create-account
     * @desc    Create test virtual account (Development only)
     * @access  Private (Admin only)
     * @body    { email: string }
     */
    monitoringRouter.post('/test/create-account', MonitoringController.createTestAccount);

    /**
     * @route   POST /api/monitoring/test/simulate-credit
     * @desc    Simulate virtual account credit (Development only)
     * @access  Private (Admin only)
     * @body    {
     *   accountNumber: string,
     *   amount: number,
     *   senderInfo?: {
     *     name?: string,
     *     account?: string,
     *     bank?: string,
     *     narration?: string
     *   }
     * }
     */
    monitoringRouter.post('/test/simulate-credit', MonitoringController.simulateCredit);
}

export default monitoringRouter;