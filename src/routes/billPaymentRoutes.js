// routes/bills.js - Enhanced routes with dynamic service management
import express from 'express';
import BillPaymentController from '../controller/BillPaymentController.js';
import { authMiddleware } from '../middleware/auth.js';
import smsRoute from "./smsRoute.js";

const router = express.Router();
const {
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
} = BillPaymentController();

// Public routes (no authentication required)
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

// Admin/Development routes for service management
router.post('/services/refresh', authMiddleware, refreshServices);
router.get('/services/cache-info', authMiddleware, getCacheInfo);
router.get('/test-vtpass', authMiddleware, testVTPassConnection);
router.get('/test-credentials', authMiddleware, testVTPassCredentials);
router.get('/test-services', authMiddleware, testAvailableServices);
router.get('/vtpass-balance', authMiddleware, getVTPassBalance);
router.get('/vtpass-support', getVTPassSupport);
router.get('/diagnose-vtpass', authMiddleware, diagnoseVTPassIssues);

// Protected routes (authentication required)
router.use(authMiddleware);

// Customer verification
router.post('/verify', verifyCustomer);

// Bill payment
router.post('/pay', payBill);

// SMS routes - Mount SMS routes under /sms
router.use('/sms', smsRoute);

// Transaction management
router.get('/transactions/:transactionRef', getTransactionStatus);
router.get('/history', getPaymentHistory);

export default router;