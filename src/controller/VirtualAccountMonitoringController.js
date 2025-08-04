// controllers/MonitoringController.js - API endpoints for virtual account monitoring
import VirtualAccountMonitor from '../utils/virtualAccountMonitor.js';
import Joi from 'joi';

function MonitoringController() {
    /**
     * Test virtual account credit flow
     */
    const testVirtualAccountCredit = async (req, res) => {
        try {
            const schema = Joi.object({
                userId: Joi.string().required(),
                amount: Joi.number().min(100).max(1000000).default(1000),
                mockData: Joi.object().optional()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    details: error.details.map(err => err.message)
                });
            }

            console.log('Testing virtual account credit for user:', value.userId);

            const result = await VirtualAccountMonitor.testVirtualAccountCredit(
                value.userId,
                value.amount,
                value.mockData
            );

            res.status(200).json({
                success: result.success,
                message: result.success ? 'Virtual account credit test completed' : 'Test failed',
                data: result
            });

        } catch (error) {
            console.error('Error testing virtual account credit:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to test virtual account credit',
                error: error.message
            });
        }
    };

    /**
     * Monitor virtual account transactions
     */
    const monitorTransactions = async (req, res) => {
        try {
            console.log('Monitoring virtual account transactions...');

            const result = await VirtualAccountMonitor.monitorVirtualAccountTransactions();

            res.status(200).json({
                success: true,
                message: 'Virtual account monitoring completed',
                data: result
            });

        } catch (error) {
            console.error('Error monitoring virtual account transactions:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to monitor virtual account transactions',
                error: error.message
            });
        }
    };

    /**
     * Validate virtual account setup for a user
     */
    const validateSetup = async (req, res) => {
        try {
            const { userId } = req.params;

            if (!userId) {
                return res.status(400).json({
                    success: false,
                    message: 'User ID is required'
                });
            }

            console.log('Validating virtual account setup for user:', userId);

            const result = await VirtualAccountMonitor.validateVirtualAccountSetup(userId);

            res.status(200).json({
                success: result.isSetupComplete,
                message: result.isSetupComplete
                    ? 'Virtual account setup is complete'
                    : 'Virtual account setup is incomplete',
                data: result
            });

        } catch (error) {
            console.error('Error validating virtual account setup:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to validate virtual account setup',
                error: error.message
            });
        }
    };

    /**
     * Reconcile virtual account transactions
     */
    const reconcileTransactions = async (req, res) => {
        try {
            const schema = Joi.object({
                days: Joi.number().min(1).max(365).default(7)
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    details: error.details.map(err => err.message)
                });
            }

            console.log(`Reconciling virtual account transactions for last ${value.days} days...`);

            const result = await VirtualAccountMonitor.reconcileVirtualAccountTransactions(value.days);

            const hasInvalidBalances = result.invalidBalances > 0;

            res.status(200).json({
                success: !hasInvalidBalances,
                message: hasInvalidBalances
                    ? `Reconciliation completed with ${result.invalidBalances} invalid balances found`
                    : 'Reconciliation completed successfully - all balances valid',
                data: result
            });

        } catch (error) {
            console.error('Error reconciling virtual account transactions:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to reconcile virtual account transactions',
                error: error.message
            });
        }
    };

    /**
     * Create test virtual account for development
     */
    const createTestAccount = async (req, res) => {
        try {
            // Only allow in development/staging environments
            if (process.env.NODE_ENV === 'production') {
                return res.status(403).json({
                    success: false,
                    message: 'Test account creation not allowed in production'
                });
            }

            const schema = Joi.object({
                email: Joi.string().email().required()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    details: error.details.map(err => err.message)
                });
            }

            console.log('Creating test virtual account for:', value.email);

            const result = await VirtualAccountMonitor.createTestVirtualAccount(value.email);

            res.status(result.success ? 201 : 400).json({
                success: result.success,
                message: result.success
                    ? 'Test virtual account created successfully'
                    : 'Failed to create test virtual account',
                data: result
            });

        } catch (error) {
            console.error('Error creating test virtual account:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to create test virtual account',
                error: error.message
            });
        }
    };

    /**
     * Simulate virtual account credit
     */
    const simulateCredit = async (req, res) => {
        try {
            // Only allow in development/staging environments
            if (process.env.NODE_ENV === 'production') {
                return res.status(403).json({
                    success: false,
                    message: 'Credit simulation not allowed in production'
                });
            }

            const schema = Joi.object({
                accountNumber: Joi.string().required(),
                amount: Joi.number().min(100).max(1000000).required(),
                senderInfo: Joi.object({
                    name: Joi.string().optional(),
                    account: Joi.string().optional(),
                    bank: Joi.string().optional(),
                    narration: Joi.string().optional()
                }).optional()
            });

            const { error, value } = schema.validate(req.body);
            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    details: error.details.map(err => err.message)
                });
            }

            console.log('Simulating virtual account credit:', {
                accountNumber: value.accountNumber,
                amount: value.amount
            });

            const result = await VirtualAccountMonitor.simulateVirtualAccountCredit(
                value.accountNumber,
                value.amount,
                value.senderInfo
            );

            res.status(result.success ? 200 : 400).json({
                success: result.success,
                message: result.success
                    ? 'Virtual account credit simulated successfully'
                    : 'Failed to simulate virtual account credit',
                data: result
            });

        } catch (error) {
            console.error('Error simulating virtual account credit:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to simulate virtual account credit',
                error: error.message
            });
        }
    };

    /**
     * Audit virtual account transactions
     */
    const auditTransactions = async (req, res) => {
        try {
            const schema = Joi.object({
                startDate: Joi.date().optional(),
                endDate: Joi.date().optional(),
                userId: Joi.string().optional(),
                minAmount: Joi.number().optional(),
                maxAmount: Joi.number().optional()
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    details: error.details.map(err => err.message)
                });
            }

            console.log('Auditing virtual account transactions with filters:', value);

            const result = await VirtualAccountMonitor.auditVirtualAccountTransactions(value);

            res.status(200).json({
                success: true,
                message: 'Virtual account audit completed',
                data: result
            });

        } catch (error) {
            console.error('Error auditing virtual account transactions:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to audit virtual account transactions',
                error: error.message
            });
        }
    };

    /**
     * System health check
     */
    const healthCheck = async (req, res) => {
        try {
            console.log('Running virtual account system health check...');

            const result = await VirtualAccountMonitor.healthCheck();

            const statusCode = result.overall === 'healthy' ? 200 :
                result.overall === 'warning' ? 200 : 503;

            res.status(statusCode).json({
                success: result.overall !== 'error',
                message: `System health: ${result.overall}`,
                data: result
            });

        } catch (error) {
            console.error('Error running health check:', error);
            res.status(500).json({
                success: false,
                message: 'Health check failed',
                error: error.message
            });
        }
    };

    /**
     * Get monitoring statistics
     */
    const getStats = async (req, res) => {
        try {
            console.log('Getting monitoring statistics...');

            const stats = VirtualAccountMonitor.getStats();

            res.status(200).json({
                success: true,
                message: 'Monitoring statistics retrieved',
                data: stats
            });

        } catch (error) {
            console.error('Error getting monitoring statistics:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get monitoring statistics',
                error: error.message
            });
        }
    };

    /**
     * Clear monitoring statistics
     */
    const clearStats = async (req, res) => {
        try {
            console.log('Clearing monitoring statistics...');

            VirtualAccountMonitor.clearStats();

            res.status(200).json({
                success: true,
                message: 'Monitoring statistics cleared'
            });

        } catch (error) {
            console.error('Error clearing monitoring statistics:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to clear monitoring statistics',
                error: error.message
            });
        }
    };

    /**
     * Export monitoring data
     */
    const exportData = async (req, res) => {
        try {
            const schema = Joi.object({
                format: Joi.string().valid('json', 'csv').default('json')
            });

            const { error, value } = schema.validate(req.query);
            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    details: error.details.map(err => err.message)
                });
            }

            console.log(`Exporting monitoring data in ${value.format} format...`);

            const data = await VirtualAccountMonitor.exportMonitoringData(value.format);

            const filename = `virtual-account-monitoring-${new Date().toISOString().split('T')[0]}.${value.format}`;

            res.setHeader('Content-Type', value.format === 'csv' ? 'text/csv' : 'application/json');
            res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);

            res.send(data);

        } catch (error) {
            console.error('Error exporting monitoring data:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to export monitoring data',
                error: error.message
            });
        }
    };

    /**
     * Retry failed credits
     */
    const retryFailedCredits = async (req, res) => {
        try {
            console.log('Retrying failed virtual account credits...');

            const result = await VirtualAccountMonitor.retryFailedCredits();

            res.status(200).json({
                success: true,
                message: `Retry initiated for ${result.length} failed credits`,
                data: result
            });

        } catch (error) {
            console.error('Error retrying failed credits:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to retry failed credits',
                error: error.message
            });
        }
    };

    return {
        testVirtualAccountCredit,
        monitorTransactions,
        validateSetup,
        reconcileTransactions,
        createTestAccount,
        simulateCredit,
        auditTransactions,
        healthCheck,
        getStats,
        clearStats,
        exportData,
        retryFailedCredits
    };
}

export default MonitoringController;