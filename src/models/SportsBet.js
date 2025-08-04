// models/SportsBet.js - Sports Betting Transaction Model
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const sportsBetSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        // Betting Information
        betType: {
            type: String,
            enum: ["single", "accumulator", "system", "combo"],
            required: true
        },
        sport: {
            type: String,
            enum: ["football", "basketball", "tennis", "cricket", "boxing", "other"],
            default: "football"
        },
        league: { type: String }, // Premier League, Champions League, etc.

        // Bet Details
        matches: [{
            matchId: String,
            homeTeam: String,
            awayTeam: String,
            market: String, // 1X2, Over/Under, Both Teams to Score, etc.
            selection: String, // Home Win, Over 2.5, Yes, etc.
            odds: { type: Number, required: true },
            kickoffTime: Date,
            status: {
                type: String,
                enum: ["pending", "won", "lost", "void", "cancelled"],
                default: "pending"
            }
        }],

        // Financial Details
        stake: { type: Number, required: true }, // Amount wagered
        potentialWinnings: { type: Number, required: true },
        totalOdds: { type: Number, required: true },
        actualWinnings: { type: Number, default: 0 },

        // Transaction Details
        transactionRef: { type: String, unique: true, required: true },
        bookmaker: {
            type: String,
            enum: ["bet9ja", "sportybet", "nairabet", "betway", "1xbet", "betking"],
            required: true
        },

        // Status and Timestamps
        status: {
            type: String,
            enum: ["pending", "placed", "won", "lost", "cancelled", "void"],
            default: "pending"
        },
        betSlip: { type: String }, // Bookmaker's bet slip reference
        paymentMethod: { type: String, default: "wallet" },

        // Settlement
        settledAt: { type: Date },
        settledBy: { type: String },

        // Metadata
        metadata: { type: Object }, // Additional details from bookmaker
        userAgent: { type: String },
        ipAddress: { type: String }
    },
    {
        collection: "sports_bets",
        timestamps: true,
        versionKey: false,
    }
);

// Indexes for better query performance
sportsBetSchema.index({ user: 1, status: 1 });
sportsBetSchema.index({ transactionRef: 1 });
sportsBetSchema.index({ bookmaker: 1, status: 1 });
sportsBetSchema.index({ createdAt: -1 });

// Virtual for bet summary
sportsBetSchema.virtual('betSummary').get(function() {
    return {
        totalMatches: this.matches.length,
        betType: this.betType,
        stake: this.stake,
        potentialReturn: this.potentialWinnings,
        status: this.status
    };
});

// Method to calculate potential winnings
sportsBetSchema.methods.calculatePotentialWinnings = function() {
    if (this.betType === 'single' && this.matches.length === 1) {
        return this.stake * this.matches[0].odds;
    } else if (this.betType === 'accumulator') {
        const totalOdds = this.matches.reduce((acc, match) => acc * match.odds, 1);
        return this.stake * totalOdds;
    }
    return this.potentialWinnings;
};

// Method to check if bet is settleable
sportsBetSchema.methods.canSettle = function() {
    if (this.status !== 'placed') return false;
    return this.matches.every(match =>
        ['won', 'lost', 'void', 'cancelled'].includes(match.status)
    );
};

sportsBetSchema.plugin(mongoosePaginate);

const SportsBet = mongoose.model("SportsBet", sportsBetSchema);

export default SportsBet;