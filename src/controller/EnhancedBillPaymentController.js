// controller/EnhancedBillPaymentController.js - Extended with Sports Betting, Flight Booking, and International Airtime
import BillPayment from '../models/BillPayment.js';
import SportsBet from '../models/SportsBet.js';
import FlightBooking from '../models/FlightBooking.js';
import InternationalAirtime from '../models/InternationalAirtime.js';
import User from '../models/User.js';
import VTPassService from '../services/VTPassService.js';
import SportsBettingService from '../services/SportsBettingService.js';
import FlightBookingService from '../services/FlightBookingService.js';
import InternationalAirtimeService from '../services/InternationalAirtimeService.js';
import WalletService from '../services/WalletService.js';
import {
    sendBillPaymentEmail,
    sendTransactionNotificationEmail
} from '../../utils/emails/sendEmails.js';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import BillPaymentController from "./BillPaymentController.js";

function EnhancedBillPaymentController() {
    // Import all existing methods from original BillPaymentController
    const originalController = BillPaymentController();

    // ==================== SPORTS BETTING ENDPOINTS ====================

    /**
     * Get available sports for betting
     */
    const getSports = async (req, res) => {
        try {
            console.log('Fetching available sports for betting...');
            const sports = await SportsBettingService.getSports();

            res.status(200).json({
                success: true,
                message: 'Sports retrieved successfully',
                data: sports
            });
        } catch (error) {
            console.error('Error fetching sports:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch sports',
                error: error.message
            });
        }
    };

    /**
     * Get leagues for a specific sport
     */
    const getLeagues = async (req, res) => {
        try {
            const { sportId } = req.params;

            if (!sportId) {
                return res.status(400).json({
                    success: false,
                    message: 'Sport ID is required'
                });
            }

            console.log(`Fetching leagues for sport: ${sportId}`);
            const leagues = await SportsBettingService.getLeagues(sportId);

            res.status(200).json({
                success: true,
                message: 'Leagues retrieved successfully',
                data: leagues
            });
        } catch (error) {
            console.error('Error fetching leagues:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch leagues',
                error: error.message
            });
        }
    };

    /**
     * Get matches for betting
     */
    const getMatches = async (req, res) => {
        try {
            const { sportId } = req.params;
            const { leagueId } = req.query;

            if (!sportId) {
                return res.status(400).json({
                    success: false,
                    message: 'Sport ID is required'
                });
            }

            console.log(`Fetching matches for sport: ${sportId}, league: ${leagueId || 'all'}`);
            const matches = await SportsBettingService.getMatches(sportId, leagueId);

            res.status(200).json({
                success: true,
                message: 'Matches retrieved successfully',
                data: matches
            });
        } catch (error) {
            console.error('Error fetching matches:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch matches',
                error: error.message
            });
        }
    };

    /**
     * Place a sports bet
     */
    const placeBet = async (req, res) => {
        try {
            const schema = Joi.object({
                betType: Joi.string().valid('single', 'accumulator', 'system', 'combo').required(),
                sport: Joi.string().required(),
                league: Joi.string().optional(),
                matches: Joi.array().items(
                    Joi.object({
                        matchId: Joi.string().required(),
                        homeTeam: Joi.string().required(),
                        awayTeam: Joi.string().required(),
                        market: Joi.string().required(),
                        selection: Joi.string().required(),
                        odds: Joi.number().min(1.01).required(),
                        kickoffTime: Joi.date().optional()
                    })
                ).min(1).required(),
                stake: Joi.number().min(50).max(1000000).required(),
                potentialWinnings: Joi.number().required(),
                totalOdds: Joi.number().required(),
                bookmaker: Joi.string().valid('bet9ja', 'sportybet', 'nairabet', 'betway', '1xbet', 'betking').required(),
                paymentMethod: Joi.string().valid('wallet').default('wallet')
            });

            const { error, value } = schema.validate(req.body, { abortEarly: false });

            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    details: error.details.map(err => err.message)
                });
            }

            const userId = req.user.id;

            // Get user details
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Validate bet slip
            const validation = SportsBettingService.validateBetSlip(value);
            if (!validation.isValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid bet slip',
                    errors: validation.errors
                });
            }

            // Check wallet balance
            const walletInfo = await WalletService.getBalance(userId);
            if (walletInfo.balance < value.stake) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient wallet balance',
                    required: value.stake,
                    available: walletInfo.balance
                });
            }

            // Generate transaction reference
            const transactionRef = `BET_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

            // Create sports bet record
            const sportsBet = await SportsBet.create({
                user: userId,
                betType: value.betType,
                sport: value.sport,
                league: value.league,
                matches: value.matches,
                stake: value.stake,
                potentialWinnings: value.potentialWinnings,
                totalOdds: value.totalOdds,
                transactionRef,
                bookmaker: value.bookmaker,
                status: 'pending',
                paymentMethod: value.paymentMethod,
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip
            });

            // Debit wallet
            await WalletService.debitWallet(
                userId,
                value.stake,
                'bill_payment',
                transactionRef,
                {
                    sportsBetId: sportsBet._id,
                    serviceType: 'sports_betting',
                    bookmaker: value.bookmaker
                }
            );

            try {
                // Place bet with bookmaker
                const betResult = await SportsBettingService.placeBet({
                    ...value,
                    transactionRef
                });

                // Update bet record
                sportsBet.betSlip = betResult.betSlip;
                sportsBet.status = betResult.status === 'placed' ? 'placed' : 'failed';
                sportsBet.metadata = betResult.data;
                await sportsBet.save();

                if (betResult.success) {
                    // Send success email
                    try {
                        await sendBillPaymentEmail(
                            {
                                serviceType: 'sports_betting',
                                serviceID: value.bookmaker,
                                amount: value.stake,
                                potentialWinnings: value.potentialWinnings,
                                betSlip: betResult.betSlip,
                                transactionRef,
                                matches: value.matches
                            },
                            user,
                            true,
                            {
                                walletBalance: (await WalletService.getBalance(userId)).balance,
                                vtpassMessage: `Bet placed successfully. Bet slip: ${betResult.betSlip}`
                            }
                        );
                    } catch (emailError) {
                        console.error('Error sending bet email:', emailError);
                    }

                    res.status(200).json({
                        success: true,
                        message: 'Bet placed successfully',
                        data: {
                            transactionRef,
                            betSlip: betResult.betSlip,
                            stake: value.stake,
                            potentialWinnings: value.potentialWinnings,
                            status: sportsBet.status,
                            bookmaker: value.bookmaker
                        }
                    });
                } else {
                    throw new Error(betResult.message || 'Bet placement failed');
                }
            } catch (betError) {
                // Refund wallet and update status
                await WalletService.creditWallet(
                    userId,
                    value.stake,
                    'refund',
                    `refund-${transactionRef}`,
                    { sportsBetId: sportsBet._id, reason: 'Bet placement failed' }
                );

                sportsBet.status = 'failed';
                sportsBet.metadata = { error: betError.message };
                await sportsBet.save();

                res.status(500).json({
                    success: false,
                    message: 'Bet placement failed',
                    error: betError.message,
                    refunded: true
                });
            }
        } catch (error) {
            console.error('Error placing bet:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to place bet',
                error: error.message
            });
        }
    };

    /**
     * Get bet status
     */
    const getBetStatus = async (req, res) => {
        try {
            const { transactionRef } = req.params;
            const userId = req.user.id;

            const sportsBet = await SportsBet.findOne({
                transactionRef,
                user: userId
            });

            if (!sportsBet) {
                return res.status(404).json({
                    success: false,
                    message: 'Bet not found'
                });
            }

            // Check status with bookmaker if bet is placed
            if (sportsBet.status === 'placed' && sportsBet.betSlip) {
                try {
                    const statusResult = await SportsBettingService.checkBetStatus(sportsBet.betSlip);

                    if (statusResult.success && statusResult.status !== sportsBet.status) {
                        // Update bet status
                        sportsBet.status = statusResult.status;
                        if (statusResult.status === 'won') {
                            sportsBet.actualWinnings = statusResult.winnings;
                            sportsBet.settledAt = new Date(statusResult.settledAt);

                            // Credit winnings to wallet
                            await WalletService.creditWallet(
                                userId,
                                statusResult.winnings,
                                'bill_payment',
                                `win-${transactionRef}`,
                                { sportsBetId: sportsBet._id, reason: 'Bet winnings' }
                            );
                        }
                        await sportsBet.save();
                    }
                } catch (statusError) {
                    console.error('Error checking bet status:', statusError);
                }
            }

            res.status(200).json({
                success: true,
                data: sportsBet
            });
        } catch (error) {
            console.error('Error getting bet status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get bet status',
                error: error.message
            });
        }
    };

    // ==================== FLIGHT BOOKING ENDPOINTS ====================

    /**
     * Search for flights
     */
    const searchFlights = async (req, res) => {
        try {
            const schema = Joi.object({
                origin: Joi.string().length(3).required(), // IATA code
                destination: Joi.string().length(3).required(),
                departureDate: Joi.date().min('now').required(),
                returnDate: Joi.date().min(Joi.ref('departureDate')).optional(),
                adults: Joi.number().min(1).max(9).default(1),
                children: Joi.number().min(0).max(8).default(0),
                infants: Joi.number().min(0).max(2).default(0),
                travelClass: Joi.string().valid('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST').default('ECONOMY'),
                limit: Joi.number().min(1).max(100).default(50)
            });

            const { error, value } = schema.validate(req.query, { abortEarly: false });

            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    details: error.details.map(err => err.message)
                });
            }

            console.log('Searching flights with params:', value);
            const searchResults = await FlightBookingService.searchFlights(value);

            res.status(200).json({
                success: true,
                message: 'Flight search completed successfully',
                data: searchResults
            });
        } catch (error) {
            console.error('Error searching flights:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to search flights',
                error: error.message
            });
        }
    };

    /**
     * Book a flight
     */
    const bookFlight = async (req, res) => {
        try {
            const schema = Joi.object({
                flightOffer: Joi.object().required(),
                travelers: Joi.array().items(
                    Joi.object({
                        type: Joi.string().valid('adult', 'child', 'infant').required(),
                        title: Joi.string().valid('Mr', 'Mrs', 'Ms', 'Dr', 'Prof').required(),
                        firstName: Joi.string().required(),
                        lastName: Joi.string().required(),
                        dateOfBirth: Joi.date().required(),
                        gender: Joi.string().valid('male', 'female').required(),
                        passportNumber: Joi.string().optional(),
                        nationality: Joi.string().default('NG')
                    })
                ).min(1).required(),
                contactInfo: Joi.object({
                    email: Joi.string().email().required(),
                    phone: Joi.string().required(),
                    emergencyContact: Joi.object({
                        name: Joi.string().optional(),
                        phone: Joi.string().optional(),
                        relationship: Joi.string().optional()
                    }).optional()
                }).required(),
                paymentMethod: Joi.string().valid('wallet').default('wallet')
            });

            const { error, value } = schema.validate(req.body, { abortEarly: false });

            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    details: error.details.map(err => err.message)
                });
            }

            const userId = req.user.id;

            // Get user details
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Validate passenger data
            const passengerValidation = FlightBookingService.validatePassengerData(value.travelers);
            if (!passengerValidation.isValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid passenger data',
                    errors: passengerValidation.errors
                });
            }

            const totalAmount = value.flightOffer.price.total;

            // Check wallet balance
            const walletInfo = await WalletService.getBalance(userId);
            if (walletInfo.balance < totalAmount) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient wallet balance',
                    required: totalAmount,
                    available: walletInfo.balance
                });
            }

            // Generate references
            const transactionRef = `FLT_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;
            const bookingReference = `PNR${Date.now().toString().slice(-6)}`;

            // Create flight booking record
            const flightBooking = await FlightBooking.create({
                user: userId,
                bookingType: value.flightOffer.itineraries.length > 1 ? 'round-trip' : 'one-way',
                bookingReference,
                passengers: value.travelers,
                flights: value.flightOffer.itineraries.map(itinerary => ({
                    segments: itinerary.segments.map(segment => ({
                        flightNumber: segment.number,
                        airline: segment.carrierCode,
                        airlineCode: segment.carrierCode,
                        origin: {
                            code: segment.departure.iataCode,
                            name: segment.departure.iataCode,
                            city: segment.departure.iataCode,
                            country: 'Unknown',
                            terminal: segment.departure.terminal
                        },
                        destination: {
                            code: segment.arrival.iataCode,
                            name: segment.arrival.iataCode,
                            city: segment.arrival.iataCode,
                            country: 'Unknown',
                            terminal: segment.arrival.terminal
                        },
                        departureTime: new Date(segment.departure.at),
                        arrivalTime: new Date(segment.arrival.at),
                        duration: segment.duration,
                        class: 'economy', // Default class
                        status: 'confirmed'
                    }))
                })),
                totalAmount,
                basePrice: value.flightOffer.price.base,
                taxes: value.flightOffer.price.total - value.flightOffer.price.base,
                fees: 0,
                paymentMethod: value.paymentMethod,
                transactionRef,
                contactInfo: value.contactInfo,
                departureDate: new Date(value.flightOffer.itineraries[0].segments[0].departure.at),
                returnDate: value.flightOffer.itineraries.length > 1 ?
                    new Date(value.flightOffer.itineraries[1].segments[0].departure.at) : null,
                provider: 'amadeus',
                status: 'pending',
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip
            });

            // Debit wallet
            await WalletService.debitWallet(
                userId,
                totalAmount,
                'bill_payment',
                transactionRef,
                {
                    flightBookingId: flightBooking._id,
                    serviceType: 'flight_booking',
                    bookingReference
                }
            );

            try {
                // Book flight with provider
                const bookingResult = await FlightBookingService.bookFlight({
                    flightOffer: value.flightOffer,
                    travelers: value.travelers,
                    contactInfo: value.contactInfo
                });

                // Update booking record
                flightBooking.pnr = bookingResult.booking.pnr;
                flightBooking.providerBookingId = bookingResult.booking.id;
                flightBooking.status = 'confirmed';
                flightBooking.confirmationDate = new Date();
                flightBooking.metadata = bookingResult.booking;
                await flightBooking.save();

                // Send confirmation email
                try {
                    await sendBillPaymentEmail(
                        {
                            serviceType: 'flight_booking',
                            serviceID: 'flight',
                            amount: totalAmount,
                            bookingReference,
                            pnr: bookingResult.booking.pnr,
                            transactionRef,
                            passengers: value.travelers
                        },
                        user,
                        true,
                        {
                            walletBalance: (await WalletService.getBalance(userId)).balance,
                            vtpassMessage: `Flight booked successfully. PNR: ${bookingResult.booking.pnr}`
                        }
                    );
                } catch (emailError) {
                    console.error('Error sending flight booking email:', emailError);
                }

                res.status(200).json({
                    success: true,
                    message: 'Flight booked successfully',
                    data: {
                        transactionRef,
                        bookingReference,
                        pnr: bookingResult.booking.pnr,
                        totalAmount,
                        status: 'confirmed',
                        eTicket: flightBooking.generateETicket()
                    }
                });
            } catch (bookingError) {
                // Refund wallet and update status
                await WalletService.creditWallet(
                    userId,
                    totalAmount,
                    'refund',
                    `refund-${transactionRef}`,
                    { flightBookingId: flightBooking._id, reason: 'Flight booking failed' }
                );

                flightBooking.status = 'cancelled';
                flightBooking.cancellationReason = bookingError.message;
                flightBooking.cancellationDate = new Date();
                await flightBooking.save();

                res.status(500).json({
                    success: false,
                    message: 'Flight booking failed',
                    error: bookingError.message,
                    refunded: true
                });
            }
        } catch (error) {
            console.error('Error booking flight:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to book flight',
                error: error.message
            });
        }
    };

    /**
     * Get flight booking details
     */
    const getFlightBooking = async (req, res) => {
        try {
            const { transactionRef } = req.params;
            const userId = req.user.id;

            const flightBooking = await FlightBooking.findOne({
                transactionRef,
                user: userId
            });

            if (!flightBooking) {
                return res.status(404).json({
                    success: false,
                    message: 'Flight booking not found'
                });
            }

            res.status(200).json({
                success: true,
                data: {
                    ...flightBooking.toObject(),
                    eTicket: flightBooking.generateETicket(),
                    canCancel: flightBooking.canCancel(),
                    refundAmount: flightBooking.calculateRefund()
                }
            });
        } catch (error) {
            console.error('Error getting flight booking:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get flight booking',
                error: error.message
            });
        }
    };

    /**
     * Search airports
     */
    const searchAirports = async (req, res) => {
        try {
            const { keyword } = req.query;

            if (!keyword || keyword.length < 2) {
                return res.status(400).json({
                    success: false,
                    message: 'Keyword must be at least 2 characters'
                });
            }

            const airports = await FlightBookingService.searchAirports(keyword);

            res.status(200).json({
                success: true,
                data: airports
            });
        } catch (error) {
            console.error('Error searching airports:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to search airports',
                error: error.message
            });
        }
    };

    // ==================== INTERNATIONAL AIRTIME ENDPOINTS ====================

    /**
     * Get supported countries for international airtime
     */
    const getInternationalCountries = async (req, res) => {
        try {
            console.log('Fetching supported countries for international airtime...');
            const countries = await InternationalAirtimeService.getSupportedCountries();

            res.status(200).json({
                success: true,
                message: 'Countries retrieved successfully',
                data: countries // This returns { success: true, countries: [...] }
            });
        } catch (error) {
            console.error('Error fetching international countries:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch countries',
                error: error.message
            });
        }
    };

    /**
     * Get operators for a country
     * Uses: GET /api/get-international-airtime-operators?code={countryCode}&product_type_id=1
     */
    const getInternationalOperators = async (req, res) => {
        try {
            const { countryCode } = req.params;
            const { product_type_id = 1 } = req.query; // Default to Mobile Top Up

            if (!countryCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Country code is required'
                });
            }

            console.log(`Fetching operators for country: ${countryCode}, product type: ${product_type_id}`);
            const operators = await InternationalAirtimeService.getOperators(countryCode, product_type_id);

            res.status(200).json({
                success: true,
                message: 'Operators retrieved successfully',
                data: operators // This returns { success: true, operators: [...] }
            });
        } catch (error) {
            console.error('Error fetching international operators:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch operators',
                error: error.message
            });
        }
    };

    /**
     * Get products for an operator
     * Uses: GET /api/service-variations?serviceID=foreign-airtime&operator_id={operatorId}&product_type_id=1
     */
    const getInternationalProducts = async (req, res) => {
        try {
            const { operatorId } = req.params;
            const { product_type_id = 1 } = req.query; // Default to Mobile Top Up

            if (!operatorId) {
                return res.status(400).json({
                    success: false,
                    message: 'Operator ID is required'
                });
            }

            console.log(`Fetching products for operator: ${operatorId}, product type: ${product_type_id}`);
            const products = await InternationalAirtimeService.getProducts(operatorId, product_type_id);

            res.status(200).json({
                success: true,
                message: 'Products retrieved successfully',
                data: products // This returns { success: true, products: [...] }
            });
        } catch (error) {
            console.error('Error fetching international products:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch products',
                error: error.message
            });
        }
    };

    /**
     * Purchase international airtime
     * Uses: POST /api/pay with serviceID=foreign-airtime
     */
    const purchaseInternationalAirtime = async (req, res) => {
        try {
            // Debug incoming request
            console.log('🌍 International airtime purchase request:', {
                body: req.body,
                amount: req.body.amount,
                amountType: typeof req.body.amount,
                userId: req.user?.id
            });

            const schema = Joi.object({
                country: Joi.object({
                    code: Joi.string().length(2).required(),
                    name: Joi.string().required(),
                    dialingCode: Joi.string().required(),
                    flag: Joi.string().optional(),
                    region: Joi.string().optional()
                }).required(),
                operator: Joi.object({
                    id: Joi.alternatives().try(Joi.string(), Joi.number()).required(),
                    name: Joi.string().required(),
                    logo: Joi.string().optional(),
                    type: Joi.string().optional()
                }).required(),
                phoneNumber: Joi.string().required().messages({
                    'string.empty': 'Phone number is required',
                    'any.required': 'Phone number is required'
                }),
                // FIXED: Handle both string and number inputs for amount
                amount: Joi.alternatives().try(
                    // Accept number directly
                    Joi.number().positive(),
                    // Accept string that can be converted to positive number
                    Joi.string().custom((value, helpers) => {
                        // Remove any whitespace
                        const cleaned = value.trim();

                        // Check if it's a valid number string
                        if (!/^\d+(\.\d+)?$/.test(cleaned)) {
                            return helpers.error('number.base');
                        }

                        const num = parseFloat(cleaned);

                        // Check if it's a positive number
                        if (isNaN(num) || num <= 0) {
                            return helpers.error('number.positive');
                        }

                        // Return the converted number
                        return num;
                    })
                ).required().messages({
                    'any.required': 'Amount is required',
                    'number.base': 'Amount must be a valid number',
                    'number.positive': 'Amount must be a positive number',
                    'alternatives.match': 'Amount must be a positive number'
                }),
                localCurrency: Joi.string().length(3).required().messages({
                    'string.length': 'Currency must be a 3-letter code (e.g., USD, GHS)',
                    'any.required': 'Currency is required'
                }),
                productCode: Joi.string().required().messages({
                    'any.required': 'Product code is required'
                }),
                denomination: Joi.string().required().messages({
                    'any.required': 'Denomination is required'
                }),
                productName: Joi.string().required().messages({
                    'any.required': 'Product name is required'
                }),
                paymentMethod: Joi.string().valid('wallet').default('wallet')
            });

            const { error, value } = schema.validate(req.body, {
                abortEarly: false,
                convert: true,
                stripUnknown: true
            });

            if (error) {
                console.log('❌ Validation errors:', error.details.map(d => ({
                    field: d.path.join('.'),
                    message: d.message,
                    value: d.context?.value
                })));

                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    details: error.details.map(err => err.message)
                });
            }

            // Ensure amount is definitely a number after validation
            const amount = typeof value.amount === 'string' ? parseFloat(value.amount) : value.amount;

            if (isNaN(amount) || amount <= 0) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid amount value',
                    details: ['Amount must be a positive number']
                });
            }

            // Update the validated value
            value.amount = amount;

            console.log('✅ Validation passed:', {
                amount: value.amount,
                amountType: typeof value.amount,
                country: value.country.code,
                operator: value.operator.name,
                phoneNumber: value.phoneNumber?.substring(0, 5) + '***'
            });

            const userId = req.user.id;

            // Get user details
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Convert to naira equivalent
            console.log('💱 Converting currency:', {
                amount: value.amount,
                from: value.localCurrency,
                to: 'NGN'
            });

            const conversion = await InternationalAirtimeService.convertCurrency(
                value.amount,
                value.localCurrency,
                'NGN'
            );

            if (!conversion.success) {
                console.log('❌ Currency conversion failed:', conversion.error);
                return res.status(400).json({
                    success: false,
                    message: 'Failed to calculate price in Naira',
                    error: conversion.error
                });
            }

            const nairaAmount = conversion.convertedAmount;

            console.log('✅ Currency conversion successful:', {
                original: `${value.amount} ${value.localCurrency}`,
                converted: `₦${nairaAmount}`,
                rate: conversion.exchangeRate
            });

            // Check wallet balance
            const walletInfo = await WalletService.getBalance(userId);
            if (walletInfo.balance < nairaAmount) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient wallet balance',
                    required: nairaAmount,
                    available: walletInfo.balance
                });
            }

            // Generate transaction reference
            const transactionRef = `INTL_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`;

            // Create international airtime record
            const internationalAirtime = await InternationalAirtime.create({
                user: userId,
                country: value.country,
                operator: value.operator,
                phoneNumber: value.phoneNumber,
                amount: value.amount,
                localCurrency: value.localCurrency,
                nairaEquivalent: nairaAmount,
                exchangeRate: conversion.exchangeRate,
                productCode: value.productCode,
                denomination: value.denomination,
                productName: value.productName,
                transactionRef,
                status: 'pending',
                paymentMethod: value.paymentMethod,
                userAgent: req.headers['user-agent'],
                ipAddress: req.ip
            });

            console.log('📝 Transaction record created:', {
                id: internationalAirtime._id,
                transactionRef,
                amount: `${value.amount} ${value.localCurrency} (₦${nairaAmount})`
            });

            // Debit wallet
            await WalletService.debitWallet(
                userId,
                nairaAmount,
                'bill_payment',
                transactionRef,
                {
                    internationalAirtimeId: internationalAirtime._id,
                    serviceType: 'international_airtime',
                    country: value.country.code,
                    operator: value.operator.name
                }
            );

            console.log('💳 Wallet debited:', `₦${nairaAmount}`);

            try {
                // Purchase airtime via VTPass/Service
                console.log('🛒 Purchasing airtime via service...');
                const purchaseResult = await InternationalAirtimeService.purchaseAirtime(value);

                console.log('📨 Purchase result:', {
                    success: purchaseResult.success,
                    status: purchaseResult.status,
                    transactionRef: purchaseResult.transactionRef
                });

                // Update airtime record
                internationalAirtime.vtpassRef = purchaseResult.vtpassRef;
                internationalAirtime.status = purchaseResult.status;
                internationalAirtime.deliveryMethod = purchaseResult.data?.deliveryMethod || 'instant';
                internationalAirtime.deliveredAt = purchaseResult.status === 'completed' ? new Date() : null;
                internationalAirtime.instructions = purchaseResult.data?.instructions;
                internationalAirtime.responseData = purchaseResult.data;
                await internationalAirtime.save();

                if (purchaseResult.success) {
                    // Send success email
                    try {
                        await sendBillPaymentEmail(
                            {
                                serviceType: 'international_airtime',
                                serviceID: 'foreign-airtime',
                                amount: nairaAmount,
                                phoneNumber: value.phoneNumber,
                                country: value.country.name,
                                operator: value.operator.name,
                                denomination: value.denomination,
                                transactionRef
                            },
                            user,
                            true,
                            {
                                walletBalance: (await WalletService.getBalance(userId)).balance,
                                vtpassMessage: `International airtime sent successfully to ${value.phoneNumber}`
                            }
                        );
                    } catch (emailError) {
                        console.error('❌ Error sending international airtime email:', emailError);
                    }

                    console.log('✅ Purchase successful');
                    res.status(200).json({
                        success: true,
                        message: 'International airtime purchased successfully',
                        data: {
                            transactionRef,
                            phoneNumber: value.phoneNumber,
                            amount: value.amount,
                            currency: value.localCurrency,
                            nairaAmount,
                            status: internationalAirtime.status,
                            deliveryMethod: internationalAirtime.deliveryMethod,
                            instructions: internationalAirtime.getDeliveryInstructions()
                        }
                    });
                } else {
                    throw new Error(purchaseResult.message || 'Purchase failed');
                }
            } catch (purchaseError) {
                console.error('❌ Purchase failed:', purchaseError.message);

                // Refund wallet and update status
                await WalletService.creditWallet(
                    userId,
                    nairaAmount,
                    'refund',
                    `refund-${transactionRef}`,
                    { internationalAirtimeId: internationalAirtime._id, reason: 'Purchase failed' }
                );

                internationalAirtime.status = 'failed';
                internationalAirtime.responseData = { error: purchaseError.message };
                await internationalAirtime.save();

                console.log('💰 Wallet refunded:', `₦${nairaAmount}`);

                res.status(500).json({
                    success: false,
                    message: 'International airtime purchase failed',
                    error: purchaseError.message,
                    refunded: true
                });
            }
        } catch (error) {
            console.error('❌ Error purchasing international airtime:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to purchase international airtime',
                error: error.message
            });
        }
    };

    /**
     * Get international airtime transaction status
     */
    const getInternationalAirtimeStatus = async (req, res) => {
        try {
            const { transactionRef } = req.params;
            const userId = req.user.id;

            const internationalAirtime = await InternationalAirtime.findOne({
                transactionRef,
                user: userId
            });

            if (!internationalAirtime) {
                return res.status(404).json({
                    success: false,
                    message: 'Transaction not found'
                });
            }

            // Check status with provider if pending
            if (internationalAirtime.status === 'pending' || internationalAirtime.status === 'processing') {
                try {
                    const statusResult = await InternationalAirtimeService.checkTransactionStatus(transactionRef);

                    if (statusResult.success && statusResult.status !== internationalAirtime.status) {
                        internationalAirtime.status = statusResult.status;
                        if (statusResult.status === 'completed') {
                            internationalAirtime.deliveredAt = new Date();
                        }
                        await internationalAirtime.save();
                    }
                } catch (statusError) {
                    console.error('Error checking international airtime status:', statusError);
                }
            }

            res.status(200).json({
                success: true,
                data: {
                    ...internationalAirtime.toObject(),
                    canRetry: internationalAirtime.canRetry(),
                    formattedPhone: internationalAirtime.formatPhoneNumber(),
                    deliveryInstructions: internationalAirtime.getDeliveryInstructions()
                }
            });
        } catch (error) {
            console.error('Error getting international airtime status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get transaction status',
                error: error.message
            });
        }
    };

    /**
     * Get exchange rates
     */
    const getExchangeRates = async (req, res) => {
        try {
            const rates = await InternationalAirtimeService.getExchangeRates();

            res.status(200).json({
                success: true,
                message: 'Exchange rates retrieved successfully',
                data: rates
            });
        } catch (error) {
            console.error('Error getting exchange rates:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get exchange rates',
                error: error.message
            });
        }
    };

    /**
     * Get product types for a country (additional endpoint)
     * Uses: GET /api/get-international-airtime-product-types?code={countryCode}
     */
    const getInternationalProductTypes = async (req, res) => {
        try {
            const { countryCode } = req.params;

            if (!countryCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Country code is required'
                });
            }

            console.log(`Fetching product types for country: ${countryCode}`);
            const productTypes = await InternationalAirtimeService.getProductTypes(countryCode);

            res.status(200).json({
                success: true,
                message: 'Product types retrieved successfully',
                data: productTypes // This returns { success: true, productTypes: [...] }
            });
        } catch (error) {
            console.error('Error fetching international product types:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch product types',
                error: error.message
            });
        }
    };

    // ==================== ENHANCED PAYMENT HISTORY ====================

    /**
     * Get enhanced payment history including all service types
     */
    const getEnhancedPaymentHistory = async (req, res) => {
        try {
            const userId = req.user.id;
            const { page = 1, limit = 10, serviceType } = req.query;

            const options = {
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                sort: { createdAt: -1 }
            };

            let allTransactions = [];

            // Get regular bill payments
            if (!serviceType || serviceType === 'bill_payment') {
                const billPayments = await BillPayment.paginate({ user: userId }, options);
                allTransactions = allTransactions.concat(billPayments.docs.map(payment => ({
                    ...payment.toObject(),
                    category: 'bill_payment'
                })));
            }

            // Get sports bets
            if (!serviceType || serviceType === 'sports_betting') {
                const sportsBets = await SportsBet.paginate({ user: userId }, options);
                allTransactions = allTransactions.concat(sportsBets.docs.map(bet => ({
                    ...bet.toObject(),
                    category: 'sports_betting',
                    amount: bet.stake
                })));
            }

            // Get flight bookings
            if (!serviceType || serviceType === 'flight_booking') {
                const flightBookings = await FlightBooking.paginate({ user: userId }, options);
                allTransactions = allTransactions.concat(flightBookings.docs.map(booking => ({
                    ...booking.toObject(),
                    category: 'flight_booking',
                    amount: booking.totalAmount
                })));
            }

            // Get international airtime
            if (!serviceType || serviceType === 'international_airtime') {
                const internationalAirtime = await InternationalAirtime.paginate({ user: userId }, options);
                allTransactions = allTransactions.concat(internationalAirtime.docs.map(airtime => ({
                    ...airtime.toObject(),
                    category: 'international_airtime',
                    amount: airtime.nairaEquivalent
                })));
            }

            // Sort by creation date
            allTransactions.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

            // Paginate results
            const startIndex = (page - 1) * limit;
            const endIndex = startIndex + limit;
            const paginatedTransactions = allTransactions.slice(startIndex, endIndex);

            res.status(200).json({
                success: true,
                docs: paginatedTransactions,
                totalDocs: allTransactions.length,
                limit: parseInt(limit),
                page: parseInt(page),
                totalPages: Math.ceil(allTransactions.length / limit),
                hasNextPage: endIndex < allTransactions.length,
                hasPrevPage: page > 1
            });
        } catch (error) {
            console.error('Error fetching enhanced payment history:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch payment history',
                error: error.message
            });
        }
    };

    // Return all methods including original ones and new ones
    return {
        // Original BillPaymentController methods
        ...originalController,

        // Sports Betting methods
        getSports,
        getLeagues,
        getMatches,
        placeBet,
        getBetStatus,

        // Flight Booking methods
        searchFlights,
        bookFlight,
        getFlightBooking,
        searchAirports,

        // International Airtime methods
        getInternationalCountries,
        getInternationalOperators,
        getInternationalProducts,
        purchaseInternationalAirtime,
        getInternationalAirtimeStatus,
        getExchangeRates,
        getInternationalProductTypes,

        // Enhanced methods
        getEnhancedPaymentHistory
    };
}

export default EnhancedBillPaymentController;