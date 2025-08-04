// models/InternationalAirtime.js - International Airtime Transaction Model
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const internationalAirtimeSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        // Country and Operator Information
        country: {
            code: { type: String, required: true }, // US, UK, CA, etc.
            name: { type: String, required: true }, // United States, United Kingdom, etc.
            dialingCode: { type: String, required: true }, // +1, +44, etc.
            flag: { type: String }, // Country flag emoji or URL
            region: { type: String } // North America, Europe, etc.
        },

        operator: {
            id: { type: String, required: true }, // VTPass operator ID
            name: { type: String, required: true }, // Verizon, Vodafone, etc.
            logo: { type: String }, // Operator logo URL
            type: {
                type: String,
                enum: ["prepaid", "postpaid", "both"],
                default: "prepaid"
            }
        },

        // Recipient Information
        phoneNumber: {
            type: String,
            required: true,
            validate: {
                validator: function(v) {
                    // International phone number validation
                    return /^\+[1-9]\d{1,14}$/.test(v);
                },
                message: 'Please enter a valid international phone number with country code'
            }
        },

        // Financial Details
        amount: { type: Number, required: true }, // Amount in local currency
        localCurrency: { type: String, required: true }, // USD, EUR, GBP, etc.
        nairaEquivalent: { type: Number, required: true }, // Equivalent in NGN
        exchangeRate: { type: Number, required: true }, // Exchange rate used

        // Product Information
        productCode: { type: String, required: true }, // VTPass product code
        denomination: { type: String, required: true }, // $5, $10, £20, etc.
        productName: { type: String, required: true }, // Product description

        // Transaction Details
        transactionRef: { type: String, unique: true, required: true },
        vtpassRef: { type: String }, // VTPass transaction reference

        // Processing Information
        status: {
            type: String,
            enum: ["pending", "processing", "completed", "failed", "refunded"],
            default: "pending"
        },
        deliveryMethod: {
            type: String,
            enum: ["instant", "manual", "pin"],
            default: "instant"
        },
        deliveryStatus: {
            type: String,
            enum: ["pending", "delivered", "failed"],
            default: "pending"
        },

        // Payment Information
        paymentMethod: { type: String, default: "wallet" },

        // Delivery Information
        deliveredAt: { type: Date },
        pin: { type: String }, // If delivery method is PIN
        instructions: { type: String }, // Recharge instructions

        // Timing
        purchaseDate: { type: Date, default: Date.now },
        expiryDate: { type: Date }, // When the airtime expires

        // Metadata
        responseData: { type: Object }, // VTPass response data
        providerResponse: { type: Object }, // Original provider response
        metadata: { type: Object },

        // Retry Information
        retryCount: { type: Number, default: 0 },
        lastRetryAt: { type: Date },

        // User Context
        userAgent: { type: String },
        ipAddress: { type: String }
    },
    {
        collection: "international_airtime",
        timestamps: true,
        versionKey: false,
    }
);

// Indexes for better query performance
internationalAirtimeSchema.index({ user: 1, status: 1 });
internationalAirtimeSchema.index({ transactionRef: 1 });
internationalAirtimeSchema.index({ "country.code": 1, "operator.id": 1 });
internationalAirtimeSchema.index({ phoneNumber: 1 });
internationalAirtimeSchema.index({ createdAt: -1 });

// Virtual for transaction summary
internationalAirtimeSchema.virtual('transactionSummary').get(function() {
    return {
        recipient: this.phoneNumber,
        country: this.country.name,
        operator: this.operator.name,
        amount: `${this.denomination} (₦${this.nairaEquivalent.toLocaleString()})`,
        status: this.status
    };
});

// Method to format phone number for display
internationalAirtimeSchema.methods.formatPhoneNumber = function() {
    const countryCode = this.country.dialingCode;
    const number = this.phoneNumber.replace(countryCode, '');
    return `${countryCode} ${number}`;
};

// Method to check if transaction can be retried
internationalAirtimeSchema.methods.canRetry = function() {
    if (this.status !== 'failed') return false;
    if (this.retryCount >= 3) return false;

    // Allow retry if last attempt was more than 5 minutes ago
    if (this.lastRetryAt) {
        const timeSinceLastRetry = Date.now() - this.lastRetryAt.getTime();
        return timeSinceLastRetry > 5 * 60 * 1000; // 5 minutes
    }

    return true;
};

// Method to calculate savings vs local rates
internationalAirtimeSchema.methods.calculateSavings = function(localRate) {
    if (!localRate) return null;

    const localCost = this.amount * localRate;
    const ourCost = this.nairaEquivalent;
    const savings = localCost - ourCost;
    const savingsPercentage = (savings / localCost) * 100;

    return {
        localCost,
        ourCost,
        savings,
        savingsPercentage: Math.round(savingsPercentage * 100) / 100
    };
};

// Method to get delivery instructions
internationalAirtimeSchema.methods.getDeliveryInstructions = function() {
    switch (this.deliveryMethod) {
        case 'instant':
            return 'Airtime has been automatically added to your account.';
        case 'pin':
            return `Use PIN: ${this.pin} to recharge your account. ${this.instructions || ''}`;
        case 'manual':
            return this.instructions || 'Please follow the provided instructions to complete the recharge.';
        default:
            return 'Please check with customer support for recharge instructions.';
    }
};

// Static method to get supported countries
internationalAirtimeSchema.statics.getSupportedCountries = function() {
    return this.distinct('country.code').then(codes => {
        return this.aggregate([
            { $match: { 'country.code': { $in: codes } } },
            {
                $group: {
                    _id: '$country.code',
                    name: { $first: '$country.name' },
                    dialingCode: { $first: '$country.dialingCode' },
                    flag: { $first: '$country.flag' },
                    operatorCount: { $addToSet: '$operator.id' }
                }
            },
            {
                $project: {
                    code: '$_id',
                    name: 1,
                    dialingCode: 1,
                    flag: 1,
                    operatorCount: { $size: '$operatorCount' }
                }
            },
            { $sort: { name: 1 } }
        ]);
    });
};

// Static method to get popular destinations
internationalAirtimeSchema.statics.getPopularDestinations = function() {
    return this.aggregate([
        { $match: { status: 'completed' } },
        {
            $group: {
                _id: {
                    countryCode: '$country.code',
                    countryName: '$country.name'
                },
                totalTransactions: { $sum: 1 },
                totalAmount: { $sum: '$nairaEquivalent' }
            }
        },
        { $sort: { totalTransactions: -1 } },
        { $limit: 10 },
        {
            $project: {
                _id: 0,
                country: '$_id',
                totalTransactions: 1,
                totalAmount: 1
            }
        }
    ]);
};

internationalAirtimeSchema.plugin(mongoosePaginate);

const InternationalAirtime = mongoose.model("InternationalAirtime", internationalAirtimeSchema);

export default InternationalAirtime;