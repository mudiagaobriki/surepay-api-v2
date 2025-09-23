// controllers/FlightBookingController.js - Updated with streamlined services
import FlightBookingService from '../services/FlightBookingService.js';
import FlightEmailService from '../../utils/emails/flightEmailService.js';
import FlightBooking from '../models/FlightBooking.js';
import WalletService from '../services/WalletService.js';
import Joi from 'joi';

/**
 * Updated Flight Booking Controller using streamlined services
 */
const FlightBookingController = () => {

    // Validation schemas
    const searchSchema = Joi.object({
        origin: Joi.string().length(3).required(),
        destination: Joi.string().length(3).required(),
        departureDate: Joi.date().min('now').required(),
        returnDate: Joi.date().greater(Joi.ref('departureDate')).optional(),
        adults: Joi.number().integer().min(1).max(9).default(1),
        children: Joi.number().integer().min(0).max(8).default(0),
        infants: Joi.number().integer().min(0).max(8).default(0),
        travelClass: Joi.string().valid('ECONOMY', 'PREMIUM_ECONOMY', 'BUSINESS', 'FIRST').default('ECONOMY'),
        limit: Joi.number().integer().min(1).max(100).default(50)
    });

    const passengerSchema = Joi.object({
        type: Joi.string().valid('adult', 'child', 'infant').required(),
        title: Joi.string().valid('Mr', 'Mrs', 'Ms', 'Dr', 'Prof').required(),
        firstName: Joi.string().min(2).max(50).required(),
        lastName: Joi.string().min(2).max(50).required(),
        dateOfBirth: Joi.date().max('now').required(),
        gender: Joi.string().valid('male', 'female').required(),
        passportNumber: Joi.string().optional(),
        passportExpiry: Joi.date().when('passportNumber', {
            is: Joi.exist(),
            then: Joi.date().min('now').required(),
            otherwise: Joi.optional()
        }),
        nationality: Joi.string().length(2).default('NG'),
        frequentFlyerNumber: Joi.string().optional(),
        specialRequests: Joi.array().items(Joi.string()).optional()
    });

    const bookingSchema = Joi.object({
        flightOffer: Joi.object().required(),
        passengers: Joi.array().items(passengerSchema).min(1).required(),
        contactInfo: Joi.object({
            email: Joi.string().email().required(),
            phone: Joi.string().required(),
            emergencyContact: Joi.object({
                name: Joi.string().optional(),
                phone: Joi.string().optional(),
                relationship: Joi.string().optional()
            }).optional()
        }).required(),
        additionalServices: Joi.array().items(Joi.object({
            type: Joi.string().valid('insurance', 'priority_boarding', 'extra_baggage', 'seat_selection', 'meal').required(),
            description: Joi.string().required(),
            price: Joi.number().min(0).required()
        })).optional()
    });

    /**
     * Search for flights
     */
    const searchFlights = async (req, res) => {
        try {
            const { error, value } = searchSchema.validate(req.query, { stripUnknown: true });

            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid search parameters',
                    errors: error.details.map(detail => ({
                        field: detail.path.join('.'),
                        message: detail.message
                    }))
                });
            }

            // Validate passenger totals
            const totalPassengers = value.adults + value.children + value.infants;
            if (totalPassengers > 9) {
                return res.status(400).json({
                    success: false,
                    message: 'Maximum 9 passengers allowed per booking'
                });
            }

            if (value.infants > value.adults) {
                return res.status(400).json({
                    success: false,
                    message: 'Number of infants cannot exceed number of adults'
                });
            }

            console.log('Searching flights:', value);

            const searchResult = await FlightBookingService.searchFlights(value);

            if (!searchResult.success) {
                return res.status(500).json({
                    success: false,
                    message: 'Flight search failed',
                    error: searchResult.error
                });
            }

            res.status(200).json({
                success: true,
                message: `Found ${searchResult.flights.length} flights`,
                data: {
                    flights: searchResult.flights,
                    searchParams: value,
                    meta: searchResult.meta,
                    dictionaries: searchResult.dictionaries
                }
            });

        } catch (error) {
            console.error('Error in flight search:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error during flight search',
                error: error.message
            });
        }
    };

    /**
     * Get flight pricing details
     */
    const getFlightPricing = async (req, res) => {
        try {
            const { flightOfferId } = req.params;

            if (!flightOfferId) {
                return res.status(400).json({
                    success: false,
                    message: 'Flight offer ID is required'
                });
            }

            const pricingResult = await FlightBookingService.getPriceDetails(flightOfferId);

            if (!pricingResult.success) {
                return res.status(400).json({
                    success: false,
                    message: 'Failed to get flight pricing',
                    error: pricingResult.error
                });
            }

            res.status(200).json({
                success: true,
                data: pricingResult.priceDetails,
                warnings: pricingResult.warnings
            });

        } catch (error) {
            console.error('Error getting flight pricing:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get flight pricing',
                error: error.message
            });
        }
    };

    /**
     * Book a flight
     */
    const bookFlight = async (req, res) => {
        try {
            const userId = req.user.id;

            // Validate booking data
            const { error, value } = bookingSchema.validate(req.body, { stripUnknown: true });

            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid booking data',
                    errors: error.details.map(detail => ({
                        field: detail.path.join('.'),
                        message: detail.message
                    }))
                });
            }

            // Validate passengers using service
            const passengerValidation = FlightBookingService.validatePassengerData(value.passengers);
            if (!passengerValidation.isValid) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid passenger data',
                    errors: passengerValidation.errors
                });
            }

            // Calculate total amount
            const basePrice = parseFloat(value.flightOffer.price.total);
            const additionalServicesCost = (value.additionalServices || [])
                .reduce((sum, service) => sum + service.price, 0);
            const totalAmount = basePrice + additionalServicesCost;

            // Check wallet balance
            const userBalance = await WalletService.getBalance(userId);
            if (userBalance.balance < totalAmount) {
                return res.status(400).json({
                    success: false,
                    message: 'Insufficient wallet balance',
                    required: totalAmount,
                    available: userBalance.balance
                });
            }

            // Generate references
            const bookingReference = `BK${Date.now().toString().slice(-8)}`;
            const transactionRef = `FLT_${Date.now()}_${Math.random().toString(36).substr(2, 6).toUpperCase()}`;
            const bookingType = value.flightOffer.itineraries.length > 1 ? 'round-trip' : 'one-way';

            // Create flight booking record
            const flightBooking = await FlightBooking.create({
                user: userId,
                bookingType,
                bookingReference,
                passengers: value.passengers,
                flights: value.flightOffer.itineraries.map((itinerary, index) => ({
                    flightNumber: itinerary.segments[0].number,
                    airline: itinerary.segments[0].carrierCode,
                    airlineCode: itinerary.segments[0].carrierCode,
                    aircraft: itinerary.segments[0].aircraft?.code,
                    origin: {
                        code: itinerary.segments[0].departure.iataCode,
                        name: itinerary.segments[0].departure.iataCode,
                        city: itinerary.segments[0].departure.iataCode,
                        country: 'NG',
                        terminal: itinerary.segments[0].departure.terminal
                    },
                    destination: {
                        code: itinerary.segments[itinerary.segments.length - 1].arrival.iataCode,
                        name: itinerary.segments[itinerary.segments.length - 1].arrival.iataCode,
                        city: itinerary.segments[itinerary.segments.length - 1].arrival.iataCode,
                        country: 'NG',
                        terminal: itinerary.segments[itinerary.segments.length - 1].arrival.terminal
                    },
                    departureTime: new Date(itinerary.segments[0].departure.at),
                    arrivalTime: new Date(itinerary.segments[itinerary.segments.length - 1].arrival.at),
                    duration: itinerary.duration,
                    class: 'economy',
                    status: 'confirmed'
                })),
                totalAmount,
                basePrice: basePrice,
                taxes: parseFloat(value.flightOffer.price.total) - parseFloat(value.flightOffer.price.base || value.flightOffer.price.total),
                fees: additionalServicesCost,
                currency: value.flightOffer.price.currency || 'NGN',
                paymentMethod: 'wallet',
                transactionRef,
                contactInfo: value.contactInfo,
                status: 'pending',
                departureDate: new Date(value.flightOffer.itineraries[0].segments[0].departure.at),
                returnDate: bookingType === 'round-trip' ?
                    new Date(value.flightOffer.itineraries[1].segments[0].departure.at) : null,
                provider: 'amadeus',
                additionalServices: value.additionalServices || [],
                metadata: {
                    originalFlightOffer: value.flightOffer,
                    searchParams: req.body.searchParams
                },
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
                    serviceType: 'bill_payment',
                    bookingReference
                }
            );

            try {
                // Book flight with Amadeus
                const bookingResult = await FlightBookingService.bookFlight({
                    flightOffer: value.flightOffer,
                    travelers: value.passengers,
                    contactInfo: value.contactInfo
                });

                // Update booking with provider details
                flightBooking.pnr = bookingResult.booking.pnr;
                flightBooking.providerBookingId = bookingResult.booking.id;
                flightBooking.status = 'confirmed';
                flightBooking.confirmationDate = new Date();
                flightBooking.metadata.providerResponse = bookingResult.booking;
                await flightBooking.save();

                // Send confirmation email using streamlined service
                try {
                    await FlightEmailService.sendBookingConfirmation({
                        booking: flightBooking,
                        pnr: bookingResult.booking.pnr,
                        eTicket: flightBooking.generateETicket()
                    }, req.user);
                } catch (emailError) {
                    console.error('Failed to send booking confirmation email:', emailError);
                    // Don't fail the booking for email errors
                }

                res.status(201).json({
                    success: true,
                    message: 'Flight booked successfully',
                    data: {
                        bookingReference: flightBooking.bookingReference,
                        pnr: bookingResult.booking.pnr,
                        transactionRef: flightBooking.transactionRef,
                        totalAmount: flightBooking.totalAmount,
                        status: flightBooking.status,
                        passengers: flightBooking.passengers.length,
                        flights: flightBooking.flights.length,
                        eTicket: flightBooking.generateETicket(),
                        canCancel: flightBooking.canCancel(),
                        refundAmount: flightBooking.calculateRefund()
                    }
                });

            } catch (bookingError) {
                console.error('Amadeus booking failed:', bookingError);

                // Refund wallet
                await WalletService.creditWallet(
                    userId,
                    totalAmount,
                    'refund',
                    `${transactionRef}_REFUND`,
                    {
                        originalTransaction: transactionRef,
                        reason: 'Flight booking failed'
                    }
                );

                // Update booking status
                flightBooking.status = 'cancelled';
                flightBooking.cancellationDate = new Date();
                flightBooking.cancellationReason = bookingError.message;
                await flightBooking.save();

                res.status(400).json({
                    success: false,
                    message: 'Flight booking failed',
                    error: bookingError.message,
                    refunded: true,
                    refundAmount: totalAmount
                });
            }

        } catch (error) {
            console.error('Error booking flight:', error);
            res.status(500).json({
                success: false,
                message: 'Internal server error during flight booking',
                error: error.message
            });
        }
    };

    /**
     * Get flight booking details
     */
    const getFlightBooking = async (req, res) => {
        try {
            const userId = req.user.id;
            const { transactionRef } = req.params;

            const flightBooking = await FlightBooking.findOne({
                $or: [
                    { transactionRef },
                    { bookingReference: transactionRef }
                ],
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
                    refundAmount: flightBooking.calculateRefund(),
                    bookingSummary: flightBooking.bookingSummary
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
     * Cancel flight booking
     */
    const cancelFlightBooking = async (req, res) => {
        try {
            const userId = req.user.id;
            const { transactionRef } = req.params;
            const { reason } = req.body;

            const flightBooking = await FlightBooking.findOne({
                $or: [
                    { transactionRef },
                    { bookingReference: transactionRef }
                ],
                user: userId
            });

            if (!flightBooking) {
                return res.status(404).json({
                    success: false,
                    message: 'Flight booking not found'
                });
            }

            if (!flightBooking.canCancel()) {
                return res.status(400).json({
                    success: false,
                    message: 'This booking cannot be cancelled. Cancellation is only allowed 24+ hours before departure.'
                });
            }

            const refundAmount = flightBooking.calculateRefund();

            try {
                // Cancel with provider if provider booking ID exists
                if (flightBooking.providerBookingId) {
                    await FlightBookingService.cancelBooking(flightBooking.providerBookingId);
                }

                // Update booking status
                flightBooking.status = 'cancelled';
                flightBooking.cancellationDate = new Date();
                flightBooking.cancellationReason = reason || 'Cancelled by user';
                await flightBooking.save();

                // Process refund if applicable
                if (refundAmount > 0) {
                    await WalletService.creditWallet(
                        userId,
                        refundAmount,
                        'refund',
                        `${transactionRef}_CANCEL_REFUND`,
                        {
                            originalTransaction: transactionRef,
                            cancellationFee: flightBooking.totalAmount - refundAmount,
                            reason: 'Flight booking cancellation'
                        }
                    );
                }

                // Send cancellation email using streamlined service
                try {
                    await FlightEmailService.sendCancellationEmail({
                        booking: flightBooking,
                        refundAmount,
                        cancellationReason: flightBooking.cancellationReason
                    }, req.user);
                } catch (emailError) {
                    console.error('Failed to send cancellation email:', emailError);
                }

                res.status(200).json({
                    success: true,
                    message: 'Flight booking cancelled successfully',
                    data: {
                        bookingReference: flightBooking.bookingReference,
                        status: flightBooking.status,
                        cancellationDate: flightBooking.cancellationDate,
                        refundAmount,
                        cancellationFee: flightBooking.totalAmount - refundAmount
                    }
                });

            } catch (cancellationError) {
                console.error('Provider cancellation failed:', cancellationError);

                // Still process local cancellation and refund
                flightBooking.status = 'cancelled';
                flightBooking.cancellationDate = new Date();
                flightBooking.cancellationReason = `${reason || 'Cancelled by user'} (Provider cancellation failed: ${cancellationError.message})`;
                await flightBooking.save();

                if (refundAmount > 0) {
                    await WalletService.creditWallet(
                        userId,
                        refundAmount,
                        'refund',
                        `${transactionRef}_CANCEL_REFUND`,
                        {
                            originalTransaction: transactionRef,
                            reason: 'Flight booking cancellation (local only)'
                        }
                    );
                }

                res.status(200).json({
                    success: true,
                    message: 'Flight booking cancelled locally (provider cancellation may need manual processing)',
                    data: {
                        bookingReference: flightBooking.bookingReference,
                        status: flightBooking.status,
                        refundAmount,
                        warning: 'Provider cancellation failed - may need manual processing'
                    }
                });
            }

        } catch (error) {
            console.error('Error cancelling flight booking:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to cancel flight booking',
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
                    message: 'Search keyword must be at least 2 characters long'
                });
            }

            const searchResult = await FlightBookingService.searchAirports(keyword);

            res.status(200).json({
                success: true,
                data: searchResult.airports,
                count: searchResult.airports.length
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

    /**
     * Get user's flight booking history
     */
    const getBookingHistory = async (req, res) => {
        try {
            const userId = req.user.id;
            const { page = 1, limit = 10, status } = req.query;

            const query = { user: userId };
            if (status) {
                query.status = status;
            }

            const options = {
                page: parseInt(page),
                limit: parseInt(limit),
                sort: { createdAt: -1 },
                populate: [
                    { path: 'user', select: 'firstName lastName email' }
                ]
            };

            const bookings = await FlightBooking.paginate(query, options);

            // Add computed fields to each booking
            const enhancedBookings = bookings.docs.map(booking => ({
                ...booking.toObject(),
                bookingSummary: booking.bookingSummary,
                canCancel: booking.canCancel(),
                refundAmount: booking.calculateRefund()
            }));

            res.status(200).json({
                success: true,
                data: {
                    bookings: enhancedBookings,
                    pagination: {
                        totalDocs: bookings.totalDocs,
                        limit: bookings.limit,
                        totalPages: bookings.totalPages,
                        page: bookings.page,
                        pagingCounter: bookings.pagingCounter,
                        hasPrevPage: bookings.hasPrevPage,
                        hasNextPage: bookings.hasNextPage,
                        prevPage: bookings.prevPage,
                        nextPage: bookings.nextPage
                    }
                }
            });

        } catch (error) {
            console.error('Error getting booking history:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get booking history',
                error: error.message
            });
        }
    };

    /**
     * Get travel classes
     */
    const getTravelClasses = async (req, res) => {
        try {
            const travelClasses = FlightBookingService.getTravelClasses();

            res.status(200).json({
                success: true,
                data: travelClasses
            });
        } catch (error) {
            console.error('Error getting travel classes:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to get travel classes',
                error: error.message
            });
        }
    };

    /**
     * Test flight booking service connection
     */
    const testConnection = async (req, res) => {
        try {
            const flightTest = await FlightBookingService.testConnection();
            const emailTest = await FlightEmailService.testConnection();

            res.status(200).json({
                success: true,
                services: {
                    flightBooking: flightTest,
                    email: emailTest
                }
            });
        } catch (error) {
            console.error('Error testing connection:', error);
            res.status(500).json({
                success: false,
                message: 'Connection test failed',
                error: error.message
            });
        }
    };

    return {
        searchFlights,
        getFlightPricing,
        bookFlight,
        getFlightBooking,
        cancelFlightBooking,
        searchAirports,
        getBookingHistory,
        getTravelClasses,
        testConnection
    };
};

export default FlightBookingController;