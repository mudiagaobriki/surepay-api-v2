// models/FlightBooking.js - Flight Booking Transaction Model
import mongoose from "mongoose";
import mongoosePaginate from "mongoose-paginate-v2";

const { Schema } = mongoose;

const passengerSchema = new Schema({
    type: {
        type: String,
        enum: ["adult", "child", "infant"],
        required: true
    },
    title: {
        type: String,
        enum: ["Mr", "Mrs", "Ms", "Dr", "Prof"],
        required: true
    },
    firstName: { type: String, required: true },
    lastName: { type: String, required: true },
    dateOfBirth: { type: Date, required: true },
    gender: {
        type: String,
        enum: ["male", "female"],
        required: true
    },
    passportNumber: { type: String },
    nationality: { type: String, default: "NG" },
    frequentFlyerNumber: { type: String },
    specialRequests: [String], // Meal preferences, wheelchair, etc.
}, { _id: false });

const flightSegmentSchema = new Schema({
    flightNumber: { type: String, required: true },
    airline: { type: String, required: true },
    airlineCode: { type: String, required: true },
    aircraft: { type: String },

    // Route Information
    origin: {
        code: { type: String, required: true }, // LOS, ABV, etc.
        name: { type: String, required: true },
        city: { type: String, required: true },
        country: { type: String, required: true },
        terminal: { type: String }
    },
    destination: {
        code: { type: String, required: true },
        name: { type: String, required: true },
        city: { type: String, required: true },
        country: { type: String, required: true },
        terminal: { type: String }
    },

    // Timing
    departureTime: { type: Date, required: true },
    arrivalTime: { type: Date, required: true },
    duration: { type: String }, // "2h 30m"

    // Class and Seating
    class: {
        type: String,
        enum: ["economy", "premium_economy", "business", "first"],
        required: true
    },
    seats: [{
        passengerIndex: Number,
        seatNumber: String,
        seatType: String // Window, Aisle, Middle
    }],

    // Baggage
    baggage: {
        cabin: { weight: Number, pieces: Number },
        checked: { weight: Number, pieces: Number }
    },

    // Status
    status: {
        type: String,
        enum: ["confirmed", "cancelled", "delayed", "boarding", "departed", "arrived"],
        default: "confirmed"
    }
}, { _id: false });

const flightBookingSchema = new Schema(
    {
        user: {
            type: Schema.Types.ObjectId,
            ref: "User",
            required: true
        },

        // Booking Information
        bookingType: {
            type: String,
            enum: ["one-way", "round-trip", "multi-city"],
            required: true
        },
        bookingReference: { type: String, unique: true, required: true },
        pnr: { type: String }, // Passenger Name Record

        // Passengers
        passengers: [passengerSchema],

        // Flight Details
        flights: [flightSegmentSchema],

        // Pricing
        totalAmount: { type: Number, required: true },
        basePrice: { type: Number, required: true },
        taxes: { type: Number, default: 0 },
        fees: { type: Number, default: 0 },
        currency: { type: String, default: "NGN" },

        // Payment
        paymentMethod: { type: String, default: "wallet" },
        transactionRef: { type: String, unique: true, required: true },

        // Contact Information
        contactInfo: {
            email: { type: String, required: true },
            phone: { type: String, required: true },
            emergencyContact: {
                name: String,
                phone: String,
                relationship: String
            }
        },

        // Status and Processing
        status: {
            type: String,
            enum: ["pending", "confirmed", "cancelled", "completed", "refunded"],
            default: "pending"
        },

        // Booking Management
        bookingDate: { type: Date, default: Date.now },
        confirmationDate: { type: Date },
        cancellationDate: { type: Date },
        cancellationReason: { type: String },

        // Travel Dates
        departureDate: { type: Date, required: true },
        returnDate: { type: Date }, // For round-trip bookings

        // Service Provider
        provider: {
            type: String,
            enum: ["amadeus", "sabre", "travelport", "vtpass"],
            default: "amadeus"
        },
        providerBookingId: { type: String },

        // Additional Services
        additionalServices: [{
            type: {
                type: String,
                enum: ["insurance", "priority_boarding", "extra_baggage", "seat_selection", "meal"]
            },
            description: String,
            price: Number
        }],

        // Metadata
        metadata: { type: Object },
        userAgent: { type: String },
        ipAddress: { type: String }
    },
    {
        collection: "flight_bookings",
        timestamps: true,
        versionKey: false,
    }
);

// Indexes for better query performance
flightBookingSchema.index({ user: 1, status: 1 });
flightBookingSchema.index({ bookingReference: 1 });
flightBookingSchema.index({ transactionRef: 1 });
flightBookingSchema.index({ departureDate: 1 });
flightBookingSchema.index({ provider: 1 });

// Virtual for booking summary
flightBookingSchema.virtual('bookingSummary').get(function() {
    const outbound = this.flights[0];
    const inbound = this.flights.length > 1 ? this.flights[this.flights.length - 1] : null;

    return {
        route: inbound ?
            `${outbound.origin.code} ⇄ ${outbound.destination.code}` :
            `${outbound.origin.code} → ${outbound.destination.code}`,
        passengers: this.passengers.length,
        totalAmount: this.totalAmount,
        status: this.status,
        departureDate: this.departureDate
    };
});

// Method to check if booking can be cancelled
flightBookingSchema.methods.canCancel = function() {
    if (this.status !== 'confirmed') return false;

    // Check if departure is more than 24 hours away
    const now = new Date();
    const departure = new Date(this.departureDate);
    const hoursUntilDeparture = (departure - now) / (1000 * 60 * 60);

    return hoursUntilDeparture >= 24;
};

// Method to calculate refund amount
flightBookingSchema.methods.calculateRefund = function() {
    if (!this.canCancel()) return 0;

    const now = new Date();
    const departure = new Date(this.departureDate);
    const hoursUntilDeparture = (departure - now) / (1000 * 60 * 60);

    // Refund policy:
    // More than 7 days: 90% refund
    // 2-7 days: 70% refund
    // 1-2 days: 50% refund
    if (hoursUntilDeparture >= 168) return this.totalAmount * 0.9; // 7+ days
    if (hoursUntilDeparture >= 48) return this.totalAmount * 0.7;  // 2-7 days
    if (hoursUntilDeparture >= 24) return this.totalAmount * 0.5;  // 1-2 days

    return 0;
};

// Method to generate e-ticket
flightBookingSchema.methods.generateETicket = function() {
    return {
        bookingReference: this.bookingReference,
        pnr: this.pnr,
        passengers: this.passengers,
        flights: this.flights,
        contactInfo: this.contactInfo,
        issueDate: new Date(),
        validForTravel: this.status === 'confirmed'
    };
};

flightBookingSchema.plugin(mongoosePaginate);

const FlightBooking = mongoose.model("FlightBooking", flightBookingSchema);

export default FlightBooking;