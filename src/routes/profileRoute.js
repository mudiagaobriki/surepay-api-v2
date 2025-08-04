// routes/profileRoute.js - Enhanced Profile Routes with Biometric Management
import { Router } from 'express';
import multer from 'multer';
import ProfileControllerFactory from '../controller/ProfileController.js';
import { authMiddleware } from '../middleware/auth.js';

const profileRouter = Router();
const ProfileController = ProfileControllerFactory();

// Configure multer for file uploads
const storage = multer.memoryStorage();
const upload = multer({
    storage,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB limit
    },
    fileFilter: (req, file, cb) => {
        // Check file type
        if (file.mimetype.startsWith('image/')) {
            cb(null, true);
        } else {
            cb(new Error('Only image files are allowed!'), false);
        }
    }
});

// ==================== SPECIFIC ROUTES FIRST ====================
// This prevents "user" from being treated as an ID parameter

// Enhanced user profile routes
profileRouter.get('/user', authMiddleware, ProfileController.getUserProfile);
profileRouter.put('/update', authMiddleware, ProfileController.editProfile);

// Profile image management
profileRouter.post('/upload-image',
    authMiddleware,
    upload.single('image'),
    ProfileController.uploadProfileImage
);

// ==================== TRANSACTION PIN MANAGEMENT ====================
profileRouter.post('/pin/set', authMiddleware, ProfileController.setTransactionPin);
profileRouter.post('/pin/change', authMiddleware, ProfileController.changeTransactionPin);
profileRouter.post('/pin/verify', authMiddleware, ProfileController.verifyTransactionPin);

// ==================== ENHANCED BIOMETRIC MANAGEMENT ====================

// Core biometric settings
profileRouter.post('/biometric/toggle', authMiddleware, ProfileController.toggleBiometricSetting);
profileRouter.get('/biometric/status', authMiddleware, ProfileController.getBiometricStatus);
profileRouter.post('/biometric/reset', authMiddleware, ProfileController.resetBiometricSettings);

// Biometric authentication tracking
profileRouter.post('/biometric/record-attempt', authMiddleware, ProfileController.recordBiometricAttempt);
profileRouter.get('/biometric/history', authMiddleware, ProfileController.getBiometricHistory);
profileRouter.post('/biometric/test', authMiddleware, ProfileController.testBiometricAuth);

// Device management for biometrics
profileRouter.post('/biometric/enroll-device', authMiddleware, ProfileController.enrollBiometricDevice);
profileRouter.post('/biometric/remove-device', authMiddleware, ProfileController.removeBiometricDevice);
profileRouter.get('/biometric/devices', authMiddleware, ProfileController.getBiometricDevices);

// ==================== SECURITY OVERVIEW ====================
profileRouter.get('/security/overview', authMiddleware, ProfileController.getSecurityOverview);
profileRouter.post('/security/preferences', authMiddleware, ProfileController.updateSecurityPreferences);

// ==================== ADMIN/PUBLIC ROUTES ====================
profileRouter.post('/new', ProfileController.newProfile);
profileRouter.get('/all/:page/:perPage', ProfileController.allProfiles);
profileRouter.post('/edit', ProfileController.editProfile);

// ==================== PARAMETERIZED ROUTES (LAST) ====================
// This prevents conflicts with specific routes like /user
profileRouter.get('/:id', ProfileController.selectProfile);
profileRouter.delete('/:id', authMiddleware, ProfileController.deleteProfile);

// ==================== ERROR HANDLING MIDDLEWARE ====================
profileRouter.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        if (error.code === 'LIMIT_FILE_SIZE') {
            return res.status(400).json({
                status: 'error',
                message: 'File too large. Maximum size is 5MB.'
            });
        }
        if (error.code === 'LIMIT_UNEXPECTED_FILE') {
            return res.status(400).json({
                status: 'error',
                message: 'Unexpected field name. Use "image" as the field name.'
            });
        }
    }

    if (error.message === 'Only image files are allowed!') {
        return res.status(400).json({
            status: 'error',
            message: 'Only image files are allowed!'
        });
    }

    next(error);
});

export default profileRouter;