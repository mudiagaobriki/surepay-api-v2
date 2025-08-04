// models/BetWalletFunding.js - Bet Wallet Funding Transaction Model
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const betWalletFundingSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        // Platform Information
        platform: {
            type: String,
            enum: ["bet9ja", "sportybet", "nairabet", "betway", "1xbet", "betking", "merrybet"],
            required: true
        },

        // Account Details
        accountIdentifier: { type: String, required: true }, // Username, email, or account ID
        accountName: { type: String, required: true },
        customerPhone: { type: String },

        // Funding Details
        amount: { type: Number, required: true },
        fundingType: {
            type: String,
            enum: ["instant", "voucher", "direct"],
            default: "instant"
        },
        fundingMethod: { type: String }, // How the funding was processed

        // Transaction Details
        transactionRef: { type: String, unique: true, required: true },
        ninejaPayRef: { type: String }, // 9JaPay reference

        // Status and Timestamps
        status: {
            type: String,
            enum: ["pending", "completed", "failed", "cancelled"],
            default: "pending"
        },
        paymentMethod: { type: String, default: "wallet" },

        // Voucher Information (for voucher funding)
        voucherCode: { type: String },
        voucherPin: { type: String },
        voucherExpiryDate: { type: Date },

        // Instructions and Metadata
        fundingInstructions: { type: String },
        description: { type: String },
        metadata: { type: Object }, // Additional details from 9JaPay

        // Completion Details
        completedAt: { type: Date },

        // Technical Details
        userAgent: { type: String },
        ipAddress: { type: String }
    },
    {
        collection: "bet_wallet_fundings",
        timestamps: true,
        versionKey: false,
    }
);

// Indexes for better query performance
betWalletFundingSchema.index({ user: 1, platform: 1 });
betWalletFundingSchema.index({ transactionRef: 1 });
betWalletFundingSchema.index({ ninejaPayRef: 1 });
betWalletFundingSchema.index({ status: 1 });
betWalletFundingSchema.index({ createdAt: -1 });
betWalletFundingSchema.index({ platform: 1, status: 1 });

// Virtual for funding summary
betWalletFundingSchema.virtual('fundingSummary').get(function() {
    return {
        platform: this.platform,
        accountName: this.accountName,
        amount: this.amount,
        fundingType: this.fundingType,
        status: this.status,
        hasVoucher: !!this.voucherCode
    };
});

// Method to check if funding can be retried
betWalletFundingSchema.methods.canRetry = function() {
    return this.status === 'failed' &&
        this.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000); // Within 24 hours
};

// Method to get platform-specific information
betWalletFundingSchema.methods.getPlatformInfo = function() {
    const platformInfo = {
        bet9ja: {
            name: 'Bet9ja',
            logo: 'https://bet9ja.com/favicon.ico',
            color: '#006838',
            website: 'https://bet9ja.com',
            supportedFunding: ['instant', 'voucher']
        },
        sportybet: {
            name: 'SportyBet',
            logo: 'https://sportybet.com/favicon.ico',
            color: '#ff6b35',
            website: 'https://sportybet.com',
            supportedFunding: ['instant', 'voucher']
        },
        nairabet: {
            name: 'NairaBet',
            logo: 'https://nairabet.com/favicon.ico',
            color: '#1e3a8a',
            website: 'https://nairabet.com',
            supportedFunding: ['instant', 'direct']
        },
        betway: {
            name: 'Betway',
            logo: 'https://betway.com/favicon.ico',
            color: '#00a859',
            website: 'https://betway.com.ng',
            supportedFunding: ['instant', 'voucher']
        },
        '1xbet': {
            name: '1xBet',
            logo: 'https://1xbet.com/favicon.ico',
            color: '#1f5582',
            website: 'https://1xbet.com.ng',
            supportedFunding: ['instant', 'direct']
        },
        betking: {
            name: 'BetKing',
            logo: 'https://betking.com/favicon.ico',
            color: '#ff9500',
            website: 'https://betking.com',
            supportedFunding: ['instant', 'voucher']
        },
        merrybet: {
            name: 'MerryBet',
            logo: 'https://merrybet.com/favicon.ico',
            color: '#0066cc',
            website: 'https://merrybet.com',
            supportedFunding: ['instant', 'voucher']
        }
    };

    return platformInfo[this.platform] || {
        name: this.platform.charAt(0).toUpperCase() + this.platform.slice(1),
        logo: null,
        color: '#333333',
        website: null,
        supportedFunding: ['instant']
    };
};

// Method to get funding instructions based on type
betWalletFundingSchema.methods.getFundingInstructions = function() {
    const platformInfo = this.getPlatformInfo();

    if (this.fundingType === 'voucher' && this.voucherCode) {
        return {
            type: 'voucher',
            title: `${platformInfo.name} Voucher Code`,
            instructions: [
                `Login to your ${platformInfo.name} account`,
                'Go to Deposit/Fund Wallet section',
                'Select "Voucher/PIN" as payment method',
                `Enter voucher code: ${this.voucherCode}`,
                this.voucherPin ? `Enter PIN: ${this.voucherPin}` : null,
                'Complete the funding process'
            ].filter(Boolean),
            voucherCode: this.voucherCode,
            voucherPin: this.voucherPin,
            expiryDate: this.voucherExpiryDate
        };
    } else if (this.fundingType === 'instant') {
        return {
            type: 'instant',
            title: 'Instant Funding',
            instructions: [
                `Your ${platformInfo.name} wallet has been funded instantly`,
                'The funds should reflect in your betting account within 2-5 minutes',
                'If funds don\'t reflect, please contact support'
            ]
        };
    } else if (this.fundingType === 'direct') {
        return {
            type: 'direct',
            title: 'Direct Transfer',
            instructions: [
                `Funds have been transferred directly to your ${platformInfo.name} account`,
                'Check your betting account balance',
                'Contact support if you don\'t see the funds within 10 minutes'
            ]
        };
    }

    return {
        type: 'general',
        title: 'Funding Completed',
        instructions: [
            this.fundingInstructions || 'Your betting wallet has been funded successfully',
            'Check your betting account for the updated balance'
        ]
    };
};

// Method to format account identifier for display
betWalletFundingSchema.methods.getDisplayAccountIdentifier = function() {
    const identifier = this.accountIdentifier;

    // If it looks like an email, mask it
    if (identifier.includes('@')) {
        const [local, domain] = identifier.split('@');
        const maskedLocal = local.length > 2 ?
            local.charAt(0) + '*'.repeat(local.length - 2) + local.charAt(local.length - 1) :
            local;
        return `${maskedLocal}@${domain}`;
    }

    // If it's a long identifier, mask the middle
    if (identifier.length > 6) {
        return identifier.substring(0, 3) + '*'.repeat(identifier.length - 6) + identifier.substring(identifier.length - 3);
    }

    return identifier;
};

// Method to calculate funding fee (if any)
betWalletFundingSchema.methods.getFundingFee = function() {
    // Most betting platforms don't charge for wallet funding
    // But some may have fees for certain funding methods
    const feeStructure = {
        bet9ja: { instant: 0, voucher: 0 },
        sportybet: { instant: 0, voucher: 0 },
        nairabet: { instant: 0, direct: 0 },
        betway: { instant: 0, voucher: 0 },
        '1xbet': { instant: 0, direct: 0 },
        betking: { instant: 0, voucher: 0 },
        merrybet: { instant: 0, voucher: 0 }
    };

    const platformFees = feeStructure[this.platform] || {};
    return platformFees[this.fundingType] || 0;
};

// Static method to get platform statistics
betWalletFundingSchema.statics.getPlatformStats = async function(userId, platform, dateRange = 30) {
    const startDate = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000);

    const stats = await this.aggregate([
        {
            $match: {
                user: mongoose.Types.ObjectId(userId),
                platform: platform,
                status: 'completed',
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: null,
                totalAmount: { $sum: '$amount' },
                totalTransactions: { $sum: 1 },
                averageAmount: { $avg: '$amount' },
                lastFunding: { $max: '$createdAt' },
                fundingTypes: { $push: '$fundingType' }
            }
        }
    ]);

    const result = stats[0] || {
        totalAmount: 0,
        totalTransactions: 0,
        averageAmount: 0,
        lastFunding: null,
        fundingTypes: []
    };

    // Count funding types
    const fundingTypeCounts = result.fundingTypes.reduce((acc, type) => {
        acc[type] = (acc[type] || 0) + 1;
        return acc;
    }, {});

    return {
        ...result,
        fundingTypeCounts,
        dateRange
    };
};

// Static method to get user's favorite platforms
betWalletFundingSchema.statics.getFavoritePlatforms = async function(userId, limit = 5) {
    const platforms = await this.aggregate([
        {
            $match: {
                user: mongoose.Types.ObjectId(userId),
                status: 'completed'
            }
        },
        {
            $group: {
                _id: '$platform',
                totalAmount: { $sum: '$amount' },
                totalTransactions: { $sum: 1 },
                lastUsed: { $max: '$createdAt' }
            }
        },
        {
            $sort: { totalTransactions: -1, totalAmount: -1 }
        },
        {
            $limit: limit
        }
    ]);

    return platforms.map(platform => ({
        platform: platform._id,
        totalAmount: platform.totalAmount,
        totalTransactions: platform.totalTransactions,
        lastUsed: platform.lastUsed
    }));
};

betWalletFundingSchema.plugin(mongoosePaginate);

const BetWalletFunding = mongoose.model("BetWalletFunding", betWalletFundingSchema);

export default BetWalletFunding;