// src/models/GiftCard.js
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const giftCardSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        // Transaction identifiers
        transactionRef: {
            type: String,
            unique: true,
            required: true
        },
        reloadlyTransactionId: {
            type: String,
            unique: true,
            sparse: true // Allow null values but ensure uniqueness when present
        },
        customIdentifier: {
            type: String,
            required: true
        },

        // Product information
        productId: {
            type: Number,
            required: true
        },
        productName: {
            type: String,
            required: true
        },
        brand: {
            type: String,
            required: true
        },
        country: {
            code: { type: String, required: true },
            name: { type: String, required: true }
        },
        category: {
            type: String,
            default: 'gift-card'
        },

        // Purchase details
        quantity: {
            type: Number,
            required: true,
            min: 1,
            max: 10
        },
        unitPriceUSD: {
            type: Number,
            required: true
        },
        totalAmountUSD: {
            type: Number,
            required: true
        },
        exchangeRate: {
            type: Number,
            required: true
        },
        totalAmountNGN: {
            type: Number,
            required: true
        },
        serviceCharge: {
            type: Number,
            default: 0
        },
        totalChargedNGN: {
            type: Number,
            required: true
        },

        // Recipient information
        recipientEmail: {
            type: String,
            required: true
        },
        recipientPhone: {
            countryCode: String,
            phoneNumber: String
        },
        senderName: String,
        personalMessage: String,

        // Gift card details (populated after successful purchase)
        giftCards: [{
            cardNumber: String,
            pin: String,
            serialNumber: String,
            expiryDate: Date,
            instructions: String,
            termsAndConditions: String
        }],

        // Transaction status and tracking
        status: {
            type: String,
            enum: ["pending", "processing", "completed", "failed", "cancelled"],
            default: "pending"
        },

        // Payment information
        paymentMethod: {
            type: String,
            default: "wallet"
        },

        // Timestamps
        purchasedAt: Date,
        deliveredAt: Date,

        // API responses and metadata
        reloadlyResponse: {
            type: Object,
            default: {}
        },
        errorDetails: {
            type: Object,
            default: null
        },

        // Additional metadata
        metadata: {
            userAgent: String,
            ipAddress: String,
            deviceType: String,
            source: {
                type: String,
                default: 'web'
            }
        },

        // Delivery preferences
        deliveryMethod: {
            type: String,
            enum: ['email', 'sms', 'both'],
            default: 'email'
        },

        // Gift card usage tracking (optional)
        usageStatus: {
            type: String,
            enum: ['unused', 'partially_used', 'fully_used', 'expired'],
            default: 'unused'
        },

        // For gift cards sent to others
        isGift: {
            type: Boolean,
            default: false
        },

        // Refund information (if applicable)
        refundStatus: {
            type: String,
            enum: ['none', 'requested', 'processing', 'completed', 'rejected'],
            default: 'none'
        },
        refundAmount: {
            type: Number,
            default: 0
        },
        refundedAt: Date,
        refundReference: String,
        lastCardFetchAttempt: {
            type: Date,
            default: null
        },
        cardFetchAttempts: {
            type: Number,
            default: 0
        },
        cardDetailsFetched: {
            type: Boolean,
            default: false
        },
        cardDetailsFetchedAt: {
            type: Date,
            default: null
        }
    },
    {
        collection: "gift_cards",
        timestamps: true,
        versionKey: false,
        toJSON: { virtuals: true },
        toObject: { virtuals: true }
    }
);

// Indexes for better query performance
giftCardSchema.index({ user: 1, createdAt: -1 });
giftCardSchema.index({ transactionRef: 1 });
giftCardSchema.index({ reloadlyTransactionId: 1 });
giftCardSchema.index({ status: 1 });
giftCardSchema.index({ recipientEmail: 1 });
giftCardSchema.index({ productId: 1 });
giftCardSchema.index({ country: 1 });
giftCardSchema.index({ createdAt: -1 });

// Virtual for total savings (if there's a discount)
giftCardSchema.virtual('savings').get(function() {
    if (this.serviceCharge > 0) {
        return Math.max(0, this.totalAmountNGN - this.totalChargedNGN);
    }
    return 0;
});

// Virtual for display status
giftCardSchema.virtual('displayStatus').get(function() {
    const statusMap = {
        'pending': 'Processing Payment',
        'processing': 'Purchasing Gift Card',
        'completed': 'Delivered Successfully',
        'failed': 'Purchase Failed',
        'cancelled': 'Order Cancelled'
    };
    return statusMap[this.status] || this.status;
});

// Method to check if transaction can be refunded
giftCardSchema.methods.canBeRefunded = function() {
    const refundWindow = 24 * 60 * 60 * 1000; // 24 hours in milliseconds
    const timeSincePurchase = Date.now() - this.createdAt.getTime();

    return (
        this.status === 'completed' &&
        this.refundStatus === 'none' &&
        timeSincePurchase <= refundWindow &&
        this.usageStatus === 'unused'
    );
};

// Method to mask sensitive card details for API responses
giftCardSchema.methods.toSafeJSON = function() {
    const obj = this.toObject();

    // Mask sensitive gift card details
    if (obj.giftCards && obj.giftCards.length > 0) {
        obj.giftCards = obj.giftCards.map(card => ({
            cardNumber: card.cardNumber ? `****${card.cardNumber.slice(-4)}` : null,
            pin: card.pin ? '****' : null,
            serialNumber: card.serialNumber,
            expiryDate: card.expiryDate,
            instructions: card.instructions,
            termsAndConditions: card.termsAndConditions
        }));
    }

    return obj;
};

// Static method to get gift card statistics
giftCardSchema.statics.getStatistics = async function(userId = null, dateRange = null) {
    const matchStage = {};

    if (userId) {
        matchStage.user = new mongoose.Types.ObjectId(userId);
    }

    if (dateRange) {
        matchStage.createdAt = {
            $gte: new Date(dateRange.start),
            $lte: new Date(dateRange.end)
        };
    }

    const stats = await this.aggregate([
        { $match: matchStage },
        {
            $group: {
                _id: null,
                totalTransactions: { $sum: 1 },
                totalAmountNGN: { $sum: '$totalChargedNGN' },
                totalAmountUSD: { $sum: '$totalAmountUSD' },
                totalGiftCards: { $sum: '$quantity' },
                completedTransactions: {
                    $sum: { $cond: [{ $eq: ['$status', 'completed'] }, 1, 0] }
                },
                failedTransactions: {
                    $sum: { $cond: [{ $eq: ['$status', 'failed'] }, 1, 0] }
                },
                avgTransactionValue: { $avg: '$totalChargedNGN' },
                popularBrands: { $push: '$brand' }
            }
        }
    ]);

    return stats[0] || {
        totalTransactions: 0,
        totalAmountNGN: 0,
        totalAmountUSD: 0,
        totalGiftCards: 0,
        completedTransactions: 0,
        failedTransactions: 0,
        avgTransactionValue: 0,
        popularBrands: []
    };
};

// Plugin for pagination
giftCardSchema.plugin(mongoosePaginate);

const GiftCard = mongoose.model("GiftCard", giftCardSchema);

export default GiftCard;