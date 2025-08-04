// config/multer.js - Updated Multer Configuration with Cloudinary Integration
import multer from 'multer';
import cloudinary from './cloudinary.js';

// Configure storage - using memory storage for direct Cloudinary upload
const storage = multer.memoryStorage();

// File filter function for images
const imageFileFilter = (req, file, cb) => {
    // Allowed image types
    const allowedMimes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'image/gif'
    ];

    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files (JPEG, PNG, WebP, GIF) are allowed!'), false);
    }
};

// File filter for documents (KYC)
const documentFileFilter = (req, file, cb) => {
    const allowedMimes = [
        'image/jpeg',
        'image/jpg',
        'image/png',
        'image/webp',
        'application/pdf'
    ];

    if (allowedMimes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error('Only image files and PDF documents are allowed!'), false);
    }
};

// Profile image upload configuration
export const profileImageUpload = multer({
    storage,
    fileFilter: imageFileFilter,
    limits: {
        fileSize: 5 * 1024 * 1024, // 5MB
        files: 1,
    },
});

// KYC document upload configuration
export const kycDocumentUpload = multer({
    storage,
    fileFilter: documentFileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024, // 10MB
        files: 5,
    },
});

// Cloudinary upload helper functions
export const uploadToCloudinary = (buffer, options = {}) => {
    return new Promise((resolve, reject) => {
        const defaultOptions = {
            folder: 'hovapay/uploads',
            quality: 'auto',
            fetch_format: 'auto',
            overwrite: true,
            invalidate: true,
            ...options
        };

        cloudinary.uploader.upload_stream(
            defaultOptions,
            (error, result) => {
                if (error) {
                    console.error('Cloudinary upload error:', error);
                    reject(error);
                } else {
                    resolve(result);
                }
            }
        ).end(buffer);
    });
};

// Profile image specific upload
export const uploadProfileImage = async (buffer, userId) => {
    try {
        const result = await uploadToCloudinary(buffer, {
            folder: 'hovapay/profile_images',
            public_id: `user_${userId}_${Date.now()}`,
            transformation: [
                { width: 400, height: 400, crop: 'fill', gravity: 'face' },
                { quality: 'auto', fetch_format: 'auto' }
            ]
        });

        return {
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
            width: result.width,
            height: result.height
        };
    } catch (error) {
        console.error('Profile image upload error:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// KYC document upload
export const uploadKycDocument = async (buffer, userId, documentType) => {
    try {
        const result = await uploadToCloudinary(buffer, {
            folder: `hovapay/kyc_documents/${userId}`,
            public_id: `${documentType}_${Date.now()}`,
            quality: 'auto',
            fetch_format: 'auto'
        });

        return {
            success: true,
            url: result.secure_url,
            public_id: result.public_id,
            format: result.format,
            bytes: result.bytes
        };
    } catch (error) {
        console.error('KYC document upload error:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// Delete image from Cloudinary
export const deleteFromCloudinary = async (publicId) => {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        return {
            success: result.result === 'ok',
            result
        };
    } catch (error) {
        console.error('Cloudinary delete error:', error);
        return {
            success: false,
            error: error.message
        };
    }
};

// Error handling middleware for multer
export const handleMulterError = (error, req, res, next) => {
    if (error instanceof multer.MulterError) {
        switch (error.code) {
            case 'LIMIT_FILE_SIZE':
                return res.status(400).json({
                    status: 'error',
                    message: 'File too large. Please check the size limits.',
                    code: 'FILE_TOO_LARGE'
                });
            case 'LIMIT_FILE_COUNT':
                return res.status(400).json({
                    status: 'error',
                    message: 'Too many files uploaded.',
                    code: 'TOO_MANY_FILES'
                });
            case 'LIMIT_UNEXPECTED_FILE':
                return res.status(400).json({
                    status: 'error',
                    message: 'Unexpected field name for file upload.',
                    code: 'UNEXPECTED_FIELD'
                });
            default:
                return res.status(400).json({
                    status: 'error',
                    message: 'File upload error: ' + error.message,
                    code: 'UPLOAD_ERROR'
                });
        }
    }

    if (error.message.includes('Only') && error.message.includes('allowed')) {
        return res.status(400).json({
            status: 'error',
            message: error.message,
            code: 'INVALID_FILE_TYPE'
        });
    }

    next(error);
};

export default {
    profileImageUpload,
    kycDocumentUpload,
    uploadToCloudinary,
    uploadProfileImage,
    uploadKycDocument,
    deleteFromCloudinary,
    handleMulterError
};