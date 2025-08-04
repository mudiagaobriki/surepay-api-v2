// Fixed userRoute.js - Added missing enhanced OTP endpoints
import { Router } from 'express';
import UserControllerFactory from '../controller/UserController.js';
import User from '../models/User.js';
import {authMiddleware} from '../middleware/auth.js';

const userRouter = Router();
const UserController = UserControllerFactory();

// Registration and Authentication
userRouter.post('/register', UserController.register);
userRouter.post('/login', UserController.login);
userRouter.post('/validate-username', UserController.isUsernameExists);

// Email Verification
userRouter.get('/email/verify/:verifyToken', UserController.verifyUser);
userRouter.post('/email/verify/resend', UserController.resendVerificationLink);

// ==================== ENHANCED OTP ENDPOINTS (MISSING - ADDING NOW) ====================

// NEW: Enhanced Password Reset with Email + SMS
userRouter.post('/password-reset/send-otp', UserController.sendForgotPwdOTPEnhanced);
userRouter.post('/password-reset/verify-otp', UserController.verifyResetOTPEnhanced);

// NEW: Enhanced Account Verification with Email + SMS
userRouter.post('/account-verification/send-otp', UserController.sendAccountVerificationOTP);
userRouter.post('/account-verification/verify-otp', UserController.verifyAccountVerificationOTP);

// NEW: OTP Service Status and Health Check
userRouter.get('/otp-service/status', UserController.getOTPServiceStatus);

// ==================== LEGACY ENDPOINTS (for backward compatibility) ====================

// Legacy password reset endpoints
userRouter.post('/email/forgot-password', UserController.forgotPassword);
userRouter.post('/reset-password', UserController.resetPassword);
userRouter.post('/email/password-reset', UserController.resetPassword2);
userRouter.post('/email/password-reset-otp', UserController.sendForgotPwdOTP);
userRouter.post('/email/verify-reset-otp', UserController.verifyResetOTP);

// Legacy enhanced endpoints (keeping for compatibility)
userRouter.post('/email/password-reset-otp-enhanced', UserController.sendForgotPwdOTPEnhanced);
userRouter.post('/email/verify-reset-otp-enhanced', UserController.verifyResetOTPEnhanced);

// ==================== BIOMETRIC AUTHENTICATION ====================

// Biometric login - main endpoint for logging in with biometrics
userRouter.post('/biometric-login', UserController.biometricLogin);

// Check if a user can use biometric login (public endpoint)
userRouter.post('/check-biometric-eligibility', UserController.checkBiometricEligibility);

// Setup biometric authentication (requires authentication)
userRouter.post('/setup-biometric', authMiddleware, UserController.setupBiometricAuth);

// Validate biometric data before login (optional, for enhanced security)
userRouter.post('/validate-biometric', UserController.validateBiometricAuth);

// ==================== LOGOUT ====================

// Logout endpoint
userRouter.get('/logout', async (req, res) => {
    try {
        const { email } = req.query;
        if (!email) {
            return res.status(400).json({ status: 'error', msg: 'Email is required' });
        }

        const user = await User.findOneAndUpdate(
            { email },
            { loginToken: null, lastActiveAt: new Date() },
            { new: true }
        );

        if (!user) {
            return res.status(404).json({ status: 'error', msg: 'User not found' });
        }

        res.status(200).json({ status: 'success', msg: 'Logged out successfully' });
    } catch (error) {
        console.error('Logout error:', error);
        res.status(500).json({ status: 'error', msg: 'Internal server error' });
    }
});

export default userRouter;