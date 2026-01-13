import { Router } from 'express';
import AdminControllerFactory from '../controller/AdminController.js';
import AdminAnalyticsController from '../controller/AdminAnalyticsController.js';

import { authMiddleware } from '../middleware/auth.js';

const adminRouter = Router();
const AdminController = AdminControllerFactory;

// Protect all admin routes
adminRouter.use(authMiddleware);

// Analytics Routes
// Analytics Routes
adminRouter.get('/analytics/overview', AdminAnalyticsController.getOverview);
adminRouter.get('/analytics/user-growth', AdminAnalyticsController.getUserGrowth);
adminRouter.get('/analytics/chart', AdminAnalyticsController.getChartData);
adminRouter.get('/analytics/status-distribution', AdminAnalyticsController.getStatusDistribution);
adminRouter.get('/analytics/service-usage', AdminAnalyticsController.getServiceUsage);

// Service Management
adminRouter.get('/services', AdminController.getServices);
adminRouter.post('/services/toggle', AdminController.toggleService);

// System Logs
adminRouter.get('/audit-logs', AdminController.getAuditLogs);

// KYC Management
adminRouter.get('/kyc/pending', AdminController.getKYCRequests);
adminRouter.post('/kyc/review', AdminController.updateKYCStatus);

// Notification Center
adminRouter.get('/admin/notifications', AdminController.getAdminNotifications);
adminRouter.post('/admin/notifications', AdminController.createNotification);
adminRouter.delete('/admin/notifications/:id', AdminController.deleteNotification);

// Settings
adminRouter.post('/settings/profile', AdminController.updateProfile);
adminRouter.post('/settings/password', AdminController.changePassword);
adminRouter.get('/me', AdminController.getMe);

// User listing with pagination and optional search
adminRouter.get('/all-users/:page/:perPage', AdminController.allUsers);

// Get user details
adminRouter.get('/user/:email', AdminController.selectUserByEmail);
adminRouter.get('/user-by-id/:id', AdminController.selectUserById);

// Modify user
adminRouter.post('/edit-user', AdminController.editUser);

// Delete user
adminRouter.post('/delete-user', AdminController.deleteUser);

export default adminRouter;
