// models/BetWalletFunding.js - Updated Bet Wallet Funding Model for VTU Africa
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
            enum: ["bet9ja", "sportybet", "nairabet", "betway", "1xbet", "betking"],
            required: true
        },

        // Account Details
        accountIdentifier: { type: String, required: true }, // User ID for betting platform
        accountName: { type: String, required: true },
        customerPhone: { type: String },

        // Funding Details
        amount: { type: Number, required: true }, // Amount to fund betting account
        serviceCharge: { type: Number, default: 30 }, // VTU Africa service charge
        totalAmountCharged: { type: Number }, // Total charged to user wallet (amount + charge)

        fundingType: {
            type: String,
            enum: ["instant"], // VTU Africa only supports instant funding
            default: "instant"
        },
        fundingMethod: { type: String, default: "vtu-africa-instant" },

        // Transaction Details
        transactionRef: { type: String, unique: true, required: true },
        vtAfricaRef: { type: String }, // VTU Africa reference from response

        // Provider Information
        provider: { type: String, default: "vtu-africa" },

        // Status and Timestamps
        status: {
            type: String,
            enum: ["pending", "completed", "failed", "cancelled"],
            default: "pending"
        },
        paymentMethod: { type: String, default: "wallet" },

        // Instructions and Metadata
        fundingInstructions: { type: String },
        description: { type: String },
        metadata: { type: Object }, // VTU Africa response data and additional details
        responseData: { type: Object }, // Raw VTU Africa API response

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
betWalletFundingSchema.index({ vtAfricaRef: 1 });
betWalletFundingSchema.index({ status: 1 });
betWalletFundingSchema.index({ createdAt: -1 });
betWalletFundingSchema.index({ platform: 1, status: 1 });
betWalletFundingSchema.index({ provider: 1 });

// Virtual for funding summary
betWalletFundingSchema.virtual('fundingSummary').get(function() {
    return {
        platform: this.platform,
        accountName: this.accountName,
        fundingAmount: this.amount,
        serviceCharge: this.serviceCharge,
        totalCharged: this.totalAmountCharged || (this.amount + (this.serviceCharge || 30)),
        fundingType: this.fundingType,
        status: this.status,
        provider: this.provider || 'vtu-africa'
    };
});

// Method to check if funding can be retried
betWalletFundingSchema.methods.canRetry = function() {
    return this.status === 'failed' &&
        this.createdAt > new Date(Date.now() - 24 * 60 * 60 * 1000) && // Within 24 hours
        this.provider === 'vtu-africa'; // Only for VTU Africa transactions
};

// Method to get platform-specific information (updated for VTU Africa)
betWalletFundingSchema.methods.getPlatformInfo = function() {
    const platformInfo = {
        bet9ja: {
            name: 'Bet9ja',
            displayName: 'Bet9ja',
            logo: 'https://bet9ja.com/favicon.ico',
            color: '#006838',
            website: 'https://bet9ja.com',
            supportedFunding: ['instant'],
            provider: 'VTU Africa',
            userIdLabel: 'Bet9ja User ID'
        },
        sportybet: {
            name: 'SportyBet',
            displayName: 'SportyBet',
            logo: 'https://sportybet.com/favicon.ico',
            color: '#ff6b35',
            website: 'https://sportybet.com',
            supportedFunding: ['instant'],
            provider: 'VTU Africa',
            userIdLabel: 'SportyBet User ID'
        },
        nairabet: {
            name: 'NairaBet',
            displayName: 'NairaBet',
            logo: 'https://nairabet.com/favicon.ico',
            color: '#1e3a8a',
            website: 'https://nairabet.com',
            supportedFunding: ['instant'],
            provider: 'VTU Africa',
            userIdLabel: 'NairaBet User ID'
        },
        betway: {
            name: 'Betway',
            displayName: 'Betway',
            logo: 'https://betway.com/favicon.ico',
            color: '#00a859',
            website: 'https://betway.com.ng',
            supportedFunding: ['instant'],
            provider: 'VTU Africa',
            userIdLabel: 'Betway User ID'
        },
        '1xbet': {
            name: '1xBet',
            displayName: '1xBet',
            logo: 'https://1xbet.com/favicon.ico',
            color: '#1f5582',
            website: 'https://1xbet.com.ng',
            supportedFunding: ['instant'],
            provider: 'VTU Africa',
            userIdLabel: '1xBet User ID'
        },
        betking: {
            name: 'BetKing',
            displayName: 'BetKing',
            logo: 'https://betking.com/favicon.ico',
            color: '#ff9500',
            website: 'https://betking.com',
            supportedFunding: ['instant'],
            provider: 'VTU Africa',
            userIdLabel: 'BetKing User ID'
        }
    };

    const info = platformInfo[this.platform] || {
        name: this.platform.charAt(0).toUpperCase() + this.platform.slice(1),
        displayName: this.platform.charAt(0).toUpperCase() + this.platform.slice(1),
        logo: null,
        color: '#333333',
        website: null,
        supportedFunding: ['instant'],
        provider: 'VTU Africa',
        userIdLabel: 'User ID'
    };

    // Add VTU Africa specific info
    return {
        ...info,
        limits: {
            min: 100,
            max: 100000
        },
        charges: {
            fixed: this.serviceCharge || 30,
            description: 'VTU Africa service charge'
        }
    };
};

// Method to get funding instructions (updated for VTU Africa)
betWalletFundingSchema.methods.getFundingInstructions = function() {
    const platformInfo = this.getPlatformInfo();

    if (this.status === 'completed') {
        return {
            type: 'completed',
            title: `${platformInfo.displayName} Wallet Funded`,
            instructions: [
                `Your ${platformInfo.displayName} wallet has been funded with ₦${this.amount}`,
                'Funds should reflect in your betting account within 1-2 minutes',
                'You can now place bets on your betting platform',
                'If funds don\'t reflect within 5 minutes, please contact support'
            ],
            fundingAmount: this.amount,
            serviceCharge: this.serviceCharge || 30,
            totalCharged: this.totalAmountCharged || (this.amount + (this.serviceCharge || 30)),
            provider: 'VTU Africa',
            estimatedDelivery: '1-2 minutes'
        };
    } else if (this.status === 'pending') {
        return {
            type: 'pending',
            title: 'Processing Wallet Funding',
            instructions: [
                `Processing ₦${this.amount} funding to your ${platformInfo.displayName} account`,
                'VTU Africa is processing your request',
                'You will receive a notification once completed',
                'Processing typically takes 1-2 minutes'
            ],
            provider: 'VTU Africa'
        };
    } else if (this.status === 'failed') {
        return {
            type: 'failed',
            title: 'Wallet Funding Failed',
            instructions: [
                `Failed to fund your ${platformInfo.displayName} wallet`,
                'Your wallet has been refunded automatically',
                'Please check your betting account details and try again',
                'Contact support if the problem persists'
            ],
            canRetry: this.canRetry(),
            provider: 'VTU Africa'
        };
    }

    return {
        type: 'general',
        title: 'Wallet Funding',
        instructions: [
            this.fundingInstructions || `Funding your ${platformInfo.displayName} wallet via VTU Africa`,
            'Please wait for processing to complete'
        ],
        provider: 'VTU Africa'
    };
};

// Method to format account identifier for display
betWalletFundingSchema.methods.getDisplayAccountIdentifier = function() {
    const identifier = this.accountIdentifier;

    // For user IDs, mask the middle part if it's long
    if (identifier.length > 6) {
        return identifier.substring(0, 3) + '*'.repeat(identifier.length - 6) + identifier.substring(identifier.length - 3);
    }

    return identifier;
};

// Method to calculate VTU Africa service charge
betWalletFundingSchema.methods.getServiceCharge = function() {
    // VTU Africa has a fixed charge of ₦30 per transaction
    return this.serviceCharge || 30;
};

// Method to get total amount charged to user
betWalletFundingSchema.methods.getTotalCharged = function() {
    return this.totalAmountCharged || (this.amount + this.getServiceCharge());
};

// Method to get VTU Africa transaction details
betWalletFundingSchema.methods.getVTUAfricaDetails = function() {
    const vtuData = this.metadata?.vtuAfrica || this.responseData || {};

    return {
        service: vtuData.service || `${this.platform} Account Funding`,
        network: vtuData.network || this.platform,
        userId: vtuData.userId || this.accountIdentifier,
        requestAmount: vtuData.requestAmount || this.amount,
        charge: vtuData.charge || this.serviceCharge || 30,
        amountCharged: vtuData.amountCharged || this.getTotalCharged(),
        referenceID: vtuData.referenceID || this.vtAfricaRef || this.transactionRef,
        status: vtuData.status || this.status,
        message: vtuData.message || 'Transaction processed via VTU Africa'
    };
};

// Static method to get platform statistics for VTU Africa
betWalletFundingSchema.statics.getPlatformStats = async function(userId, platform, dateRange = 30) {
    const startDate = new Date(Date.now() - dateRange * 24 * 60 * 60 * 1000);

    const stats = await this.aggregate([
        {
            $match: {
                user: mongoose.Types.ObjectId(userId),
                platform: platform,
                status: 'completed',
                provider: 'vtu-africa',
                createdAt: { $gte: startDate }
            }
        },
        {
            $group: {
                _id: null,
                totalFunded: { $sum: '$amount' },
                totalTransactions: { $sum: 1 },
                averageAmount: { $avg: '$amount' },
                lastFunding: { $max: '$createdAt' },
                totalCharges: { $sum: '$serviceCharge' },
                totalAmountCharged: { $sum: '$totalAmountCharged' }
            }
        }
    ]);

    const result = stats[0] || {
        totalFunded: 0,
        totalTransactions: 0,
        averageAmount: 0,
        lastFunding: null,
        totalCharges: 0,
        totalAmountCharged: 0
    };

    return {
        ...result,
        dateRange,
        provider: 'VTU Africa',
        averageCharge: result.totalTransactions > 0 ? (result.totalCharges / result.totalTransactions) : 30
    };
};

// Static method to get user's favorite platforms (VTU Africa)
betWalletFundingSchema.statics.getFavoritePlatforms = async function(userId, limit = 5) {
    const platforms = await this.aggregate([
        {
            $match: {
                user: mongoose.Types.ObjectId(userId),
                status: 'completed',
                provider: 'vtu-africa'
            }
        },
        {
            $group: {
                _id: '$platform',
                totalFunded: { $sum: '$amount' },
                totalTransactions: { $sum: 1 },
                totalCharges: { $sum: '$serviceCharge' },
                lastUsed: { $max: '$createdAt' }
            }
        },
        {
            $sort: { totalTransactions: -1, totalFunded: -1 }
        },
        {
            $limit: limit
        }
    ]);

    return platforms.map(platform => ({
        platform: platform._id,
        totalFunded: platform.totalFunded,
        totalTransactions: platform.totalTransactions,
        totalCharges: platform.totalCharges,
        averageTransaction: platform.totalFunded / platform.totalTransactions,
        lastUsed: platform.lastUsed,
        provider: 'VTU Africa'
    }));
};

// Method to check if transaction is from VTU Africa
betWalletFundingSchema.methods.isVTUAfricaTransaction = function() {
    return this.provider === 'vtu-africa' || this.fundingMethod === 'vtu-africa-instant';
};

// Method to get provider display name
betWalletFundingSchema.methods.getProviderDisplayName = function() {
    return 'VTU Africa';
};

betWalletFundingSchema.plugin(mongoosePaginate);

const BetWalletFunding = mongoose.model("BetWalletFunding", betWalletFundingSchema);

export default BetWalletFunding;