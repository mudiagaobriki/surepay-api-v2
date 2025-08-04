// models/User.js - Enhanced User Model with Advanced Biometric Features
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const userSchema = new Schema(
    {
        email: {
            type: String,
            unique: true,
            required: true,
            lowercase: true,
            trim: true,
            index: true
        },
        username: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
            index: true
        },
        phone: {
            type: String,
            unique: true,
            sparse: true,
            trim: true,
            index: true
        },
        firstName: {
            type: String,
            trim: true,
            default: ""
        },
        lastName: {
            type: String,
            trim: true,
            default: ""
        },
        password: {
            type: String,
            required: true,
            select: false // Don't include in queries by default
        },
        loginToken: {
            type: String,
            select: false // Don't include in queries by default
        },
        type: {
            type: String,
            default: "user",
            enum: ["user", "admin", "moderator"]
        },
        status: {
            type: String,
            default: "active",
            enum: ["active", "suspended", "inactive", "pending"]
        },

        // Profile reference
        profile: {
            type: Schema.Types.ObjectId,
            ref: "Profile"
        },

        // Email verification
        emailVerifiedAt: { type: Date },
        verified: {
            type: Boolean,
            default: false,
            index: true
        },

        // Phone verification
        phoneVerified: {
            type: Boolean,
            default: false
        },
        phoneVerifiedAt: { type: Date },

        // Two-factor authentication
        is2faEnabled: {
            type: Boolean,
            default: false
        },
        typeOf2fa: {
            type: String,
            enum: ["sms", "email", "authenticator", "none"],
            default: "none"
        },

        // OTP and verification codes
        otpCode: {
            type: String,
            select: false // Don't include in queries by default
        },
        otpExpiresAt: { type: Date },

        // Transaction PIN for secure transactions
        pin: {
            type: String,
            select: false // Don't include in queries by default
        },
        pinCreatedAt: { type: Date },
        pinUpdatedAt: { type: Date },

        // ==================== ENHANCED BIOMETRIC AUTHENTICATION ====================

        // Basic biometric settings
        biometricSignIn: {
            type: Boolean,
            default: false
        },
        biometricTransactions: {
            type: Boolean,
            default: false
        },

        // Primary biometric method detected and configured
        biometricType: {
            type: String,
            enum: ["Face ID", "Fingerprint", "Iris", "Voice", "none"],
            default: "none"
        },

        // Available fallback biometric methods
        fallbackBiometricTypes: [{
            type: String,
            enum: ["Face ID", "Fingerprint", "Iris", "Voice"]
        }],

        // Hardware security level
        biometricHardwareLevel: {
            type: String,
            enum: ["none", "weak", "strong"],
            default: "none"
        },

        // Biometric usage tracking
        biometricLastUsed: {
            type: Date
        },
        biometricFailureCount: {
            type: Number,
            default: 0
        },
        biometricLockoutUntil: {
            type: Date
        },

        // Device-specific biometric data
        enrolledDevices: [{
            deviceId: {
                type: String,
                required: true
            },
            deviceName: String,
            biometricTypes: [{
                type: String,
                enum: ["Face ID", "Fingerprint", "Iris", "Voice"]
            }],
            enrolledAt: {
                type: Date,
                default: Date.now
            },
            lastUsed: Date,
            isActive: {
                type: Boolean,
                default: true
            },
            hardwareLevel: {
                type: String,
                enum: ["none", "weak", "strong"],
                default: "none"
            }
        }],

        // Biometric authentication history
        biometricHistory: [{
            timestamp: {
                type: Date,
                default: Date.now
            },
            type: {
                type: String,
                enum: ["signin", "transaction", "settings"]
            },
            method: {
                type: String,
                enum: ["Face ID", "Fingerprint", "Iris", "Voice", "fallback"]
            },
            success: Boolean,
            deviceId: String,
            failureReason: String,
            ipAddress: String
        }],

        // Account security settings
        passwordChangedAt: { type: Date },
        failedLoginAttempts: {
            type: Number,
            default: 0
        },
        accountLockedUntil: { type: Date },
        lastLoginAt: { type: Date },
        lastLoginIP: { type: String },

        // Privacy and notification settings
        privacySettings: {
            profileVisibility: {
                type: String,
                enum: ["public", "private", "friends"],
                default: "private"
            },
            emailNotifications: {
                type: Boolean,
                default: true
            },
            smsNotifications: {
                type: Boolean,
                default: true
            },
            transactionNotifications: {
                type: Boolean,
                default: true
            },
            marketingEmails: {
                type: Boolean,
                default: false
            },
            biometricNotifications: {
                type: Boolean,
                default: true
            }
        },

        // Wallet and financial settings
        walletSettings: {
            autoTopUp: {
                type: Boolean,
                default: false
            },
            autoTopUpAmount: {
                type: Number,
                default: 0
            },
            autoTopUpThreshold: {
                type: Number,
                default: 0
            },
            transactionLimit: {
                daily: {
                    type: Number,
                    default: 50000 // Default daily limit in Naira
                },
                monthly: {
                    type: Number,
                    default: 500000 // Default monthly limit in Naira
                }
            },
            biometricTransactionLimit: {
                daily: {
                    type: Number,
                    default: 100000 // Higher limit for biometric auth
                },
                monthly: {
                    type: Number,
                    default: 1000000
                }
            }
        },

        // Device and session management
        devices: [{
            deviceId: String,
            deviceName: String,
            deviceType: {
                type: String,
                enum: ["mobile", "tablet", "desktop", "unknown"]
            },
            lastUsed: Date,
            isActive: {
                type: Boolean,
                default: true
            },
            biometricCapabilities: [{
                type: String,
                enum: ["Face ID", "Fingerprint", "Iris", "Voice"]
            }],
            biometricEnabled: {
                type: Boolean,
                default: false
            }
        }],

        // Account management
        isDeleted: {
            type: Boolean,
            default: false,
            index: true
        },
        deletedAt: { type: Date },
        deletedBy: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },

        // Referral system
        referralCode: {
            type: String,
            unique: true,
            sparse: true
        },
        referredBy: {
            type: Schema.Types.ObjectId,
            ref: "User"
        },
        referralCount: {
            type: Number,
            default: 0
        },

        // KYC (Know Your Customer) information
        kycStatus: {
            type: String,
            enum: ["pending", "submitted", "approved", "rejected", "expired"],
            default: "pending"
        },
        kycLevel: {
            type: Number,
            enum: [0, 1, 2, 3], // 0: No KYC, 1: Basic, 2: Intermediate, 3: Advanced
            default: 0
        },
        kycDocuments: [{
            type: {
                type: String,
                enum: ["passport", "drivers_license", "national_id", "voters_card", "utility_bill", "bank_statement"]
            },
            url: String,
            status: {
                type: String,
                enum: ["pending", "approved", "rejected"],
                default: "pending"
            },
            uploadedAt: {
                type: Date,
                default: Date.now
            },
            reviewedAt: Date,
            reviewedBy: {
                type: Schema.Types.ObjectId,
                ref: "User"
            },
            rejectionReason: String
        }],

        // Security questions for account recovery
        securityQuestions: [{
            question: String,
            answerHash: String // Hashed answer
        }],

        otpCode: {
            type: String,
            select: false // Don't include in queries by default
        },
        otpExpiresAt: {
            type: Date
        },
        otpPurpose: {
            type: String,
            enum: ["password_reset", "account_verification"],
            default: "password_reset"
        },
        otpAttempts: {
            type: Number,
            default: 0
        },
        otpLockoutUntil: {
            type: Date
        },

        // Account tier based on verification level
        accountTier: {
            type: String,
            enum: ["basic", "standard", "premium", "enterprise"],
            default: "basic"
        },

        // Risk assessment
        riskScore: {
            type: Number,
            default: 0,
            min: 0,
            max: 100
        },
        riskFactors: [String],

        // Compliance and regulatory
        sanctionCheckStatus: {
            type: String,
            enum: ["pending", "cleared", "flagged"],
            default: "pending"
        },
        amlStatus: {
            type: String,
            enum: ["pending", "cleared", "flagged"],
            default: "pending"
        },

        // Location and timezone
        timezone: {
            type: String,
            default: "Africa/Lagos"
        },
        country: {
            type: String,
            default: "NG"
        },

        // Activity tracking
        lastActiveAt: {
            type: Date,
            default: Date.now
        },
        activityScore: {
            type: Number,
            default: 0
        },

        // Feature flags for user-specific features
        featureFlags: {
            betaFeatures: {
                type: Boolean,
                default: false
            },
            advancedTrading: {
                type: Boolean,
                default: false
            },
            bulkTransactions: {
                type: Boolean,
                default: false
            },
            enhancedBiometrics: {
                type: Boolean,
                default: true
            }
        }
    },
    {
        collection: "users",
        versionKey: false,
        timestamps: true, // Adds createdAt and updatedAt automatically
        toJSON: {
            virtuals: true,
            transform: function(doc, ret) {
                // Remove sensitive fields when converting to JSON
                delete ret.password;
                delete ret.loginToken;
                delete ret.pin;
                delete ret.otpCode;
                delete ret.securityQuestions;
                return ret;
            }
        },
        toObject: {
            virtuals: true,
            transform: function(doc, ret) {
                // Remove sensitive fields when converting to Object
                delete ret.password;
                delete ret.loginToken;
                delete ret.pin;
                delete ret.otpCode;
                delete ret.securityQuestions;
                return ret;
            }
        }
    }
);

// Enhanced indexes for better query performance
userSchema.index({ email: 1, isDeleted: 1 });
userSchema.index({ phone: 1, isDeleted: 1 });
userSchema.index({ username: 1, isDeleted: 1 });
userSchema.index({ verified: 1, isDeleted: 1 });
userSchema.index({ kycStatus: 1, kycLevel: 1 });
userSchema.index({ accountTier: 1 });
userSchema.index({ createdAt: -1 });
userSchema.index({ lastActiveAt: -1 });
userSchema.index({ biometricType: 1 });
userSchema.index({ biometricSignIn: 1, biometricTransactions: 1 });
userSchema.index({ 'enrolledDevices.deviceId': 1 });

// Virtual for full name
userSchema.virtual('fullName').get(function() {
    return `${this.firstName || ''} ${this.lastName || ''}`.trim();
});

// Virtual for account age
userSchema.virtual('accountAge').get(function() {
    return this.createdAt ? Math.floor((Date.now() - this.createdAt.getTime()) / (1000 * 60 * 60 * 24)) : 0;
});

// Virtual for verification status
userSchema.virtual('isFullyVerified').get(function() {
    return this.verified && this.phoneVerified && this.kycLevel >= 1;
});

// Virtual for biometric security score
userSchema.virtual('biometricSecurityScore').get(function() {
    let score = 0;

    // Base score for having biometrics enabled
    if (this.biometricSignIn) score += 20;
    if (this.biometricTransactions) score += 20;

    // Hardware level scoring
    if (this.biometricHardwareLevel === 'strong') score += 30;
    else if (this.biometricHardwareLevel === 'weak') score += 15;

    // Primary biometric type scoring
    if (this.biometricType === 'Face ID') score += 15;
    else if (this.biometricType === 'Fingerprint') score += 10;
    else if (this.biometricType === 'Iris') score += 20;

    // Fallback methods add security
    score += Math.min((this.fallbackBiometricTypes?.length || 0) * 5, 15);

    // Reduce score for recent failures
    score -= Math.min((this.biometricFailureCount || 0) * 2, 20);

    return Math.max(0, Math.min(100, score));
});

// Virtual for biometric status
userSchema.virtual('biometricStatus').get(function() {
    if (!this.biometricSignIn && !this.biometricTransactions) return 'disabled';
    if (this.biometricFailureCount >= 5) return 'locked';
    if (this.biometricType === 'none') return 'not_configured';
    return 'active';
});

// ==================== ENHANCED INSTANCE METHODS ====================

// Existing methods
userSchema.methods.isAccountLocked = function() {
    return this.accountLockedUntil && this.accountLockedUntil > Date.now();
};

userSchema.methods.incrementFailedLogins = function() {
    this.failedLoginAttempts += 1;

    // Lock account after 5 failed attempts for 30 minutes
    if (this.failedLoginAttempts >= 5) {
        this.accountLockedUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
    }

    return this.save();
};

userSchema.methods.resetFailedLogins = function() {
    this.failedLoginAttempts = 0;
    this.accountLockedUntil = undefined;
    return this.save();
};

userSchema.methods.updateLastLogin = function(ip) {
    this.lastLoginAt = Date.now();
    this.lastLoginIP = ip;
    this.lastActiveAt = Date.now();
    return this.save();
};

userSchema.methods.generateReferralCode = function() {
    if (!this.referralCode) {
        this.referralCode = `REF${this._id.toString().slice(-8).toUpperCase()}`;
    }
    return this.referralCode;
};

userSchema.methods.canPerformTransaction = function(amount) {
    if (this.isDeleted || !this.verified) return false;

    // Check daily limit
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // This would require a separate transaction tracking system
    // For now, just check basic account status
    return this.status === 'active' && !this.isAccountLocked();
};

// ==================== NEW BIOMETRIC METHODS ====================

userSchema.methods.isBiometricLocked = function() {
    return this.biometricLockoutUntil && this.biometricLockoutUntil > Date.now();
};

userSchema.methods.incrementBiometricFailures = function() {
    this.biometricFailureCount = (this.biometricFailureCount || 0) + 1;

    // Lock biometric access after 5 failures for 15 minutes
    if (this.biometricFailureCount >= 5) {
        this.biometricLockoutUntil = Date.now() + 15 * 60 * 1000; // 15 minutes
        this.biometricSignIn = false;
        this.biometricTransactions = false;
    }

    // Don't save here - return the document
    return this;
};


userSchema.methods.resetBiometricFailures = function() {
    this.biometricFailureCount = 0;
    this.biometricLockoutUntil = undefined;
    // Don't save here - return the document
    return this;
};

userSchema.methods.recordBiometricAttempt = function(type, method, success, deviceId, failureReason, ipAddress) {
    // Don't save here - just update the document in memory
    // The calling function will handle the save

    if (!this.biometricHistory) {
        this.biometricHistory = [];
    }

    this.biometricHistory.push({
        timestamp: new Date(),
        type,
        method,
        success,
        deviceId,
        failureReason,
        ipAddress
    });

    // Keep only last 50 entries
    if (this.biometricHistory.length > 50) {
        this.biometricHistory = this.biometricHistory.slice(-50);
    }

    // Update last used timestamp
    this.biometricLastUsed = new Date();

    if (success) {
        this.biometricFailureCount = 0;
        this.biometricLockoutUntil = undefined;
    } else {
        this.biometricFailureCount = (this.biometricFailureCount || 0) + 1;

        // Lock biometric access after 5 failures for 15 minutes
        if (this.biometricFailureCount >= 5) {
            this.biometricLockoutUntil = Date.now() + 15 * 60 * 1000; // 15 minutes
            this.biometricSignIn = false;
            this.biometricTransactions = false;
        }
    }

    // Return the updated document without saving
    return this;
};

userSchema.methods.enrollDevice = function(deviceInfo) {
    if (!this.enrolledDevices) {
        this.enrolledDevices = [];
    }

    // Check if device already exists
    const existingDevice = this.enrolledDevices.find(d => d.deviceId === deviceInfo.deviceId);

    if (existingDevice) {
        // Update existing device
        existingDevice.deviceName = deviceInfo.deviceName || existingDevice.deviceName;
        existingDevice.biometricTypes = deviceInfo.biometricTypes || existingDevice.biometricTypes;
        existingDevice.lastUsed = new Date();
        existingDevice.isActive = true;
        existingDevice.hardwareLevel = deviceInfo.hardwareLevel || existingDevice.hardwareLevel;
    } else {
        // Add new device
        this.enrolledDevices.push({
            deviceId: deviceInfo.deviceId,
            deviceName: deviceInfo.deviceName,
            biometricTypes: deviceInfo.biometricTypes || [],
            enrolledAt: new Date(),
            lastUsed: new Date(),
            isActive: true,
            hardwareLevel: deviceInfo.hardwareLevel || 'none'
        });
    }

    // Don't save here - return the document
    return this;
};

userSchema.methods.removeDevice = function(deviceId) {
    if (!this.enrolledDevices) return this.save();

    this.enrolledDevices = this.enrolledDevices.filter(d => d.deviceId !== deviceId);
    return this.save();
};

userSchema.methods.getBiometricCapabilities = function() {
    const capabilities = {
        hasAnyBiometric: this.biometricSignIn || this.biometricTransactions,
        primaryType: this.biometricType || 'none',
        fallbackTypes: this.fallbackBiometricTypes || [],
        hardwareLevel: this.biometricHardwareLevel || 'none',
        isLocked: this.isBiometricLocked(),
        failureCount: this.biometricFailureCount || 0,
        securityScore: this.biometricSecurityScore,
        enrolledDevicesCount: this.enrolledDevices?.length || 0
    };

    return capabilities;
};

userSchema.methods.canUseBiometric = function(type = 'signin') {
    if (this.isBiometricLocked()) return false;
    if (this.biometricType === 'none') return false;

    if (type === 'signin') {
        return this.biometricSignIn;
    } else if (type === 'transaction') {
        return this.biometricTransactions && !!this.pin;
    }

    return false;
};

// ==================== ENHANCED STATIC METHODS ====================

userSchema.statics.findByEmailOrPhone = function(identifier) {
    return this.findOne({
        $or: [
            { email: identifier },
            { phone: identifier },
            { username: identifier }
        ],
        isDeleted: { $ne: true }
    });
};

userSchema.statics.findVerifiedUsers = function() {
    return this.find({
        verified: true,
        isDeleted: { $ne: true },
        status: 'active'
    });
};

userSchema.statics.findByKycLevel = function(level) {
    return this.find({
        kycLevel: { $gte: level },
        isDeleted: { $ne: true }
    });
};

userSchema.statics.findBiometricUsers = function() {
    return this.find({
        $or: [
            { biometricSignIn: true },
            { biometricTransactions: true }
        ],
        isDeleted: { $ne: true }
    });
};

userSchema.statics.getBiometricStats = function() {
    return this.aggregate([
        {
            $match: { isDeleted: { $ne: true } }
        },
        {
            $group: {
                _id: null,
                totalUsers: { $sum: 1 },
                biometricSignInUsers: {
                    $sum: { $cond: [{ $eq: ['$biometricSignIn', true] }, 1, 0] }
                },
                biometricTransactionUsers: {
                    $sum: { $cond: [{ $eq: ['$biometricTransactions', true] }, 1, 0] }
                },
                faceIdUsers: {
                    $sum: { $cond: [{ $eq: ['$biometricType', 'Face ID'] }, 1, 0] }
                },
                fingerprintUsers: {
                    $sum: { $cond: [{ $eq: ['$biometricType', 'Fingerprint'] }, 1, 0] }
                },
                lockedBiometricUsers: {
                    $sum: { $cond: [{ $gte: ['$biometricFailureCount', 5] }, 1, 0] }
                }
            }
        }
    ]);
};

// ==================== PRE-SAVE MIDDLEWARE ====================

userSchema.pre('save', function(next) {
    // Update lastActiveAt on any save
    this.lastActiveAt = Date.now();

    // Generate referral code if not exists
    if (!this.referralCode && this.isNew) {
        this.generateReferralCode();
    }

    // Set pin timestamps
    if (this.isModified('pin') && this.pin) {
        if (this.isNew) {
            this.pinCreatedAt = Date.now();
        } else {
            this.pinUpdatedAt = Date.now();
        }
    }

    // Set password change timestamp
    if (this.isModified('password') && !this.isNew) {
        this.passwordChangedAt = Date.now();
    }

    // Handle biometric type changes
    if (this.isModified('biometricType') && this.biometricType !== 'none') {
        // Reset failure count when biometric type is set/changed
        this.biometricFailureCount = 0;
        this.biometricLockoutUntil = undefined;
    }

    // Ensure fallback types don't include primary type
    if (this.isModified('biometricType') || this.isModified('fallbackBiometricTypes')) {
        if (this.fallbackBiometricTypes && this.biometricType) {
            this.fallbackBiometricTypes = this.fallbackBiometricTypes.filter(
                type => type !== this.biometricType
            );
        }
    }

    next();
});

// Pre-find middleware to exclude deleted users by default
userSchema.pre(/^find/, function(next) {
    // Only exclude deleted users if not explicitly searching for them
    if (!this.getQuery().isDeleted) {
        this.find({ isDeleted: { $ne: true } });
    }
    next();
});

userSchema.plugin(mongoosePaginate);

const User = mongoose.model("User", userSchema);

export default User;