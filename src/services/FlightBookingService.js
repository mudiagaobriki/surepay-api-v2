// services/FlightBookingService.js - Flight Booking Service with Amadeus Integration
import axios from 'axios';

class FlightBookingService {
    constructor() {
        this.baseURL = process.env.AMADEUS_BASE_URL || 'https://api.amadeus.com';
        this.apiKey = process.env.AMADEUS_API_KEY;
        this.apiSecret = process.env.AMADEUS_API_SECRET;
        this.accessToken = null;
        this.tokenExpiry = null;

        // // Fallback to demo mode if credentials not available
        // if (!this.apiKey || !this.apiSecret) {
        //     console.warn('Amadeus API credentials not found, using demo service');
        //     this.isDemo = true;
        // }

        console.log('FlightBookingService initialized:', {
            baseURL: this.baseURL,
            hasCredentials: !!(this.apiKey && this.apiSecret),
            isDemo: this.isDemo || false
        });
    }

    /**
     * Get OAuth access token
     */
    async getAccessToken() {
        if (this.accessToken && this.tokenExpiry && Date.now() < this.tokenExpiry) {
            return this.accessToken;
        }

        if (this.isDemo) {
            this.accessToken = 'demo-token';
            this.tokenExpiry = Date.now() + 3600000; // 1 hour
            return this.accessToken;
        }

        try {
            const response = await axios.post(`${this.baseURL}/v1/security/oauth2/token`, {
                grant_type: 'client_credentials',
                client_id: this.apiKey,
                client_secret: this.apiSecret
            }, {
                headers: {
                    'Content-Type': 'application/x-www-form-urlencoded'
                }
            });

            this.accessToken = response.data.access_token;
            this.tokenExpiry = Date.now() + (response.data.expires_in * 1000);

            return this.accessToken;
        } catch (error) {
            console.error('Error getting Amadeus access token:', error);
            throw new Error('Failed to authenticate with flight booking service');
        }
    }

    /**
     * Get authentication headers
     */
    async getHeaders() {
        const token = await this.getAccessToken();
        return {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'Accept': 'application/json'
        };
    }

    /**
     * Make authenticated API request
     */
    async makeRequest(endpoint, method = 'GET', data = null, params = {}) {
        try {
            const headers = await this.getHeaders();

            const config = {
                method,
                url: `${this.baseURL}${endpoint}`,
                headers,
                timeout: 30000
            };

            if (Object.keys(params).length > 0) {
                config.params = params;
            }

            if (data) {
                config.data = data;
            }

            console.log(`Flight API ${method} request to:`, config.url);

            const response = await axios(config);
            return response.data;
        } catch (error) {
            console.error(`Flight API Error (${endpoint}):`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw error;
        }
    }

    /**
     * Search for flights
     */
    async searchFlights(searchParams) {
        try {
            console.log('Searching flights with params:', searchParams);

            // Format dates properly for Amadeus API
            const formatDate = (date) => {
                if (typeof date === 'string') {
                    // If already a string, check if it needs formatting
                    const dateObj = new Date(date);
                    return dateObj.toISOString().split('T')[0]; // YYYY-MM-DD
                }
                if (date instanceof Date) {
                    return date.toISOString().split('T')[0]; // YYYY-MM-DD
                }
                return date;
            };

            const params = {
                originLocationCode: searchParams.origin,
                destinationLocationCode: searchParams.destination,
                departureDate: formatDate(searchParams.departureDate), // FIXED: Format date properly
                adults: searchParams.adults || 1,
                children: searchParams.children || 0,
                infants: searchParams.infants || 0,
                travelClass: searchParams.travelClass || 'ECONOMY',
                currencyCode: 'NGN',
                max: searchParams.limit || 50
            };

            // Format return date if provided
            if (searchParams.returnDate) {
                params.returnDate = formatDate(searchParams.returnDate); // FIXED: Format return date
            }

            console.log('Amadeus API params:', params); // Debug log to verify format

            const response = await this.makeRequest('/v2/shopping/flight-offers', 'GET', null, params);

            return {
                success: true,
                flights: this.transformFlightOffers(response.data || []),
                meta: response.meta || {},
                dictionaries: response.dictionaries || {}
            };
        } catch (error) {
            console.error('Error searching flights:', error);

            // Log the specific error details for debugging
            if (error.response?.data?.errors) {
                console.error('Amadeus API Error Details:', error.response.data.errors);
            }

            // Don't fall back to demo - throw error for production
            throw error;
        }
    }

    /**
     * Get demo flight results
     */
    getDemoFlightResults(searchParams) {
        const departureDate = new Date(searchParams.departureDate);
        const returnDate = searchParams.returnDate ? new Date(searchParams.returnDate) : null;

        const demoFlights = [
            {
                id: 'FLIGHT-001',
                price: {
                    total: 150000,
                    base: 80000,
                    taxes: 70000,
                    currency: 'NGN'
                },
                itineraries: [
                    {
                        duration: 'PT6H30M',
                        segments: [
                            {
                                departure: {
                                    iataCode: searchParams.origin,
                                    terminal: '1',
                                    at: new Date(departureDate.getTime() + 8 * 60 * 60 * 1000).toISOString()
                                },
                                arrival: {
                                    iataCode: searchParams.destination,
                                    terminal: '3',
                                    at: new Date(departureDate.getTime() + 14.5 * 60 * 60 * 1000).toISOString()
                                },
                                carrierCode: 'BA',
                                number: '75',
                                aircraft: { code: '77W' },
                                duration: 'PT6H30M',
                                numberOfStops: 0
                            }
                        ]
                    }
                ],
                travelerPricings: [
                    {
                        travelerId: '1',
                        fareOption: 'STANDARD',
                        travelerType: 'ADULT',
                        price: {
                            currency: 'NGN',
                            total: '150000',
                            base: '80000'
                        }
                    }
                ],
                validatingAirlineCodes: ['BA'],
                fareRules: {
                    currency: 'NGN',
                    rules: [
                        {
                            category: 'EXCHANGE',
                            maxPenaltyAmount: '50000'
                        },
                        {
                            category: 'REFUND',
                            maxPenaltyAmount: '100000'
                        }
                    ]
                }
            },
            {
                id: 'FLIGHT-002',
                price: {
                    total: 120000,
                    base: 80000,
                    taxes: 40000,
                    currency: 'NGN'
                },
                itineraries: [
                    {
                        duration: 'PT8H15M',
                        segments: [
                            {
                                departure: {
                                    iataCode: searchParams.origin,
                                    terminal: '2',
                                    at: new Date(departureDate.getTime() + 12 * 60 * 60 * 1000).toISOString()
                                },
                                arrival: {
                                    iataCode: 'CAI',
                                    terminal: '3',
                                    at: new Date(departureDate.getTime() + 18 * 60 * 60 * 1000).toISOString()
                                },
                                carrierCode: 'MS',
                                number: '851',
                                aircraft: { code: '738' },
                                duration: 'PT6H00M',
                                numberOfStops: 0
                            },
                            {
                                departure: {
                                    iataCode: 'CAI',
                                    terminal: '3',
                                    at: new Date(departureDate.getTime() + 20 * 60 * 60 * 1000).toISOString()
                                },
                                arrival: {
                                    iataCode: searchParams.destination,
                                    terminal: '1',
                                    at: new Date(departureDate.getTime() + 22.25 * 60 * 60 * 1000).toISOString()
                                },
                                carrierCode: 'MS',
                                number: '777',
                                aircraft: { code: '738' },
                                duration: 'PT2H15M',
                                numberOfStops: 0
                            }
                        ]
                    }
                ],
                travelerPricings: [
                    {
                        travelerId: '1',
                        fareOption: 'STANDARD',
                        travelerType: 'ADULT',
                        price: {
                            currency: 'NGN',
                            total: '120000',
                            base: '80000'
                        }
                    }
                ],
                validatingAirlineCodes: ['MS'],
                numberOfStops: 1
            }
        ];

        // Add return flights if round trip
        if (returnDate) {
            demoFlights.forEach(flight => {
                flight.itineraries.push({
                    duration: 'PT6H30M',
                    segments: [
                        {
                            departure: {
                                iataCode: searchParams.destination,
                                terminal: '1',
                                at: new Date(returnDate.getTime() + 10 * 60 * 60 * 1000).toISOString()
                            },
                            arrival: {
                                iataCode: searchParams.origin,
                                terminal: '1',
                                at: new Date(returnDate.getTime() + 16.5 * 60 * 60 * 1000).toISOString()
                            },
                            carrierCode: flight.itineraries[0].segments[0].carrierCode,
                            number: '76',
                            aircraft: { code: '77W' },
                            duration: 'PT6H30M',
                            numberOfStops: 0
                        }
                    ]
                });
            });
        }

        return {
            success: true,
            flights: demoFlights,
            meta: {
                count: demoFlights.length,
                links: {}
            },
            dictionaries: {
                locations: {
                    [searchParams.origin]: {
                        cityCode: searchParams.origin,
                        countryCode: 'NG'
                    },
                    [searchParams.destination]: {
                        cityCode: searchParams.destination,
                        countryCode: 'GB'
                    }
                },
                aircraft: {
                    '77W': 'BOEING 777-300ER',
                    '738': 'BOEING 737-800'
                },
                carriers: {
                    'BA': 'British Airways',
                    'MS': 'EgyptAir'
                }
            }
        };
    }

    /**
     * Transform Amadeus flight offers to our format
     */
    transformFlightOffers(offers) {
        return offers.map(offer => ({
            id: offer.id,
            price: {
                total: parseFloat(offer.price.total),
                base: parseFloat(offer.price.base),
                taxes: parseFloat(offer.price.total) - parseFloat(offer.price.base),
                currency: offer.price.currency
            },
            itineraries: offer.itineraries.map(itinerary => ({
                duration: itinerary.duration,
                segments: itinerary.segments.map(segment => ({
                    departure: segment.departure,
                    arrival: segment.arrival,
                    carrierCode: segment.carrierCode,
                    number: segment.number,
                    aircraft: segment.aircraft,
                    duration: segment.duration,
                    numberOfStops: segment.numberOfStops || 0
                }))
            })),
            travelerPricings: offer.travelerPricings,
            validatingAirlineCodes: offer.validatingAirlineCodes,
            numberOfStops: this.calculateStops(offer.itineraries[0])
        }));
    }

    /**
     * Calculate number of stops for an itinerary
     */
    calculateStops(itinerary) {
        return Math.max(0, itinerary.segments.length - 1);
    }

    /**
     * Get flight price details
     */
    async getPriceDetails(flightOfferId) {
        try {
            if (this.isDemo) {
                return this.getDemoPriceDetails(flightOfferId);
            }

            const response = await this.makeRequest(`/v1/shopping/flight-offers/pricing`, 'POST', {
                data: {
                    type: 'flight-offers-pricing',
                    flightOffers: [{ id: flightOfferId }]
                }
            });

            return {
                success: true,
                priceDetails: response.data.flightOffers[0] || {},
                warnings: response.warnings || []
            };
        } catch (error) {
            console.error('Error getting price details:', error);
            return {
                success: false,
                error: error.response?.data?.errors?.[0]?.detail || error.message
            };
            // return this.getDemoPriceDetails(flightOfferId);
        }
    }

    /**
     * Get demo price details
     */
    getDemoPriceDetails(flightOfferId) {
        return {
            success: true,
            priceDetails: {
                id: flightOfferId,
                price: {
                    currency: 'NGN',
                    total: '150000',
                    base: '80000',
                    taxes: '70000',
                    fees: '0'
                },
                pricingOptions: {
                    fareType: ['PUBLISHED'],
                    includedCheckedBagsOnly: true
                }
            },
            warnings: []
        };
    }

    /**
     * Book a flight
     */
    async bookFlight(bookingData) {
        try {
            console.log('Booking flight with data:', {
                ...bookingData,
                travelers: bookingData.travelers?.length || 0
            });

            if (this.isDemo) {
                return this.createDemoBooking(bookingData);
            }

            const payload = {
                data: {
                    type: 'flight-order',
                    flightOffers: [bookingData.flightOffer],
                    travelers: bookingData.travelers.map((traveler, index) => ({
                        id: (index + 1).toString(),
                        dateOfBirth: traveler.dateOfBirth,
                        name: {
                            firstName: traveler.firstName,
                            lastName: traveler.lastName
                        },
                        gender: traveler.gender.toUpperCase(),
                        contact: {
                            emailAddress: traveler.email || bookingData.contactInfo.email,
                            phones: [{
                                deviceType: 'MOBILE',
                                countryCallingCode: '234',
                                number: (traveler.phone || bookingData.contactInfo.phone).replace(/^\+?234/, '')
                            }]
                        },
                        documents: traveler.passportNumber ? [{
                            documentType: 'PASSPORT',
                            number: traveler.passportNumber,
                            expiryDate: traveler.passportExpiry,
                            issuanceCountry: traveler.nationality || 'NG',
                            validityCountry: traveler.nationality || 'NG',
                            nationality: traveler.nationality || 'NG',
                            holder: true
                        }] : []
                    })),
                    remarks: {
                        general: [{
                            subType: 'GENERAL_MISCELLANEOUS',
                            text: `Booking via ${process.env.APPLICATION_NAME || 'Surepay'}`
                        }]
                    },
                    ticketingAgreement: {
                        option: 'DELAY_TO_CANCEL',
                        delay: '6D'
                    }
                }
            };

            const response = await this.makeRequest('/v1/booking/flight-orders', 'POST', payload);

            return {
                success: true,
                booking: this.transformBookingResponse(response.data),
                warnings: response.warnings || []
            };
        } catch (error) {
            console.error('Error booking flight:', error);
            throw new Error(`Flight booking failed: ${error.response?.data?.errors?.[0]?.detail || error.message}`);
        }
    }

    /**
     * Create demo booking
     */
    createDemoBooking(bookingData) {
        const bookingReference = `PNR${Date.now().toString().slice(-6)}`;
        const pnr = `${bookingReference}${Math.random().toString(36).substr(2, 3).toUpperCase()}`;

        return {
            success: true,
            booking: {
                id: `ORDER_${Date.now()}`,
                reference: bookingReference,
                pnr: pnr,
                status: 'confirmed',
                createdDate: new Date().toISOString(),
                flightOffers: [bookingData.flightOffer],
                travelers: bookingData.travelers,
                associatedRecords: [{
                    reference: pnr,
                    creationDate: new Date().toISOString(),
                    originSystemCode: 'GDS',
                    flightOfferId: bookingData.flightOffer.id
                }]
            },
            warnings: []
        };
    }

    /**
     * Transform booking response
     */
    transformBookingResponse(bookingData) {
        return {
            id: bookingData.id,
            reference: bookingData.associatedRecords?.[0]?.reference,
            pnr: bookingData.associatedRecords?.[0]?.reference,
            status: 'confirmed',
            createdDate: bookingData.creationDate || new Date().toISOString(),
            flightOffers: bookingData.flightOffers,
            travelers: bookingData.travelers,
            associatedRecords: bookingData.associatedRecords
        };
    }

    /**
     * Get booking details
     */
    async getBookingDetails(bookingId) {
        try {
            if (this.isDemo) {
                return this.getDemoBookingDetails(bookingId);
            }

            const response = await this.makeRequest(`/v1/booking/flight-orders/${bookingId}`);

            return {
                success: true,
                booking: this.transformBookingResponse(response.data)
            };
        } catch (error) {
            console.error('Error getting booking details:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get demo booking details
     */
    getDemoBookingDetails(bookingId) {
        return {
            success: true,
            booking: {
                id: bookingId,
                reference: 'PNR123456',
                pnr: 'PNR123456ABC',
                status: 'confirmed',
                createdDate: new Date().toISOString(),
                flightOffers: [],
                travelers: []
            }
        };
    }

    /**
     * Cancel booking
     */
    async cancelBooking(bookingId) {
        try {
            if (this.isDemo) {
                return this.cancelDemoBooking(bookingId);
            }

            const response = await this.makeRequest(`/v1/booking/flight-orders/${bookingId}`, 'DELETE');

            return {
                success: true,
                message: 'Booking cancelled successfully',
                cancellationDetails: response.data
            };
        } catch (error) {
            console.error('Error cancelling booking:', error);
            throw new Error(`Booking cancellation failed: ${error.message}`);
        }
    }

    /**
     * Cancel demo booking
     */
    cancelDemoBooking(bookingId) {
        return {
            success: true,
            message: 'Demo booking cancelled successfully',
            cancellationDetails: {
                id: bookingId,
                status: 'cancelled',
                cancelledAt: new Date().toISOString()
            }
        };
    }

    /**
     * Get airport information
     */
    async getAirportInfo(iataCode) {
        try {
            if (this.isDemo) {
                return this.getDemoAirportInfo(iataCode);
            }

            const response = await this.makeRequest(`/v1/reference-data/locations/${iataCode}`);

            return {
                success: true,
                airport: response.data
            };
        } catch (error) {
            console.error('Error getting airport info:', error);
            return {
                success: false,
                error: error.response?.data?.errors?.[0]?.detail || error.message
            };
            // return this.getDemoAirportInfo(iataCode);
        }
    }

    /**
     * Get demo airport information
     */
    getDemoAirportInfo(iataCode) {
        const airports = {
            'LOS': {
                iataCode: 'LOS',
                name: 'Murtala Muhammed International Airport',
                city: 'Lagos',
                country: 'Nigeria',
                timezone: 'Africa/Lagos'
            },
            'ABV': {
                iataCode: 'ABV',
                name: 'Nnamdi Azikiwe International Airport',
                city: 'Abuja',
                country: 'Nigeria',
                timezone: 'Africa/Lagos'
            },
            'LHR': {
                iataCode: 'LHR',
                name: 'London Heathrow Airport',
                city: 'London',
                country: 'United Kingdom',
                timezone: 'Europe/London'
            },
            'JFK': {
                iataCode: 'JFK',
                name: 'John F. Kennedy International Airport',
                city: 'New York',
                country: 'United States',
                timezone: 'America/New_York'
            }
        };

        return {
            success: true,
            airport: airports[iataCode] || {
                iataCode: iataCode,
                name: `${iataCode} Airport`,
                city: 'Unknown',
                country: 'Unknown'
            }
        };
    }

    /**
     * Search airports by keyword
     */
    async searchAirports(keyword) {
        try {
            if (this.isDemo) {
                return this.searchDemoAirports(keyword);
            }

            const response = await this.makeRequest('/v1/reference-data/locations', 'GET', null, {
                keyword,
                subType: 'AIRPORT',
                view: 'FULL'
            });

            return {
                success: true,
                airports: response.data || []
            };
        } catch (error) {
            console.error('Error searching airports:', error);
            return this.searchDemoAirports(keyword);
        }
    }

    /**
     * Search demo airports
     */
    searchDemoAirports(keyword) {
        const allAirports = [
            { iataCode: 'LOS', name: 'Murtala Muhammed International Airport', city: 'Lagos', country: 'Nigeria' },
            { iataCode: 'ABV', name: 'Nnamdi Azikiwe International Airport', city: 'Abuja', country: 'Nigeria' },
            { iataCode: 'PHC', name: 'Port Harcourt International Airport', city: 'Port Harcourt', country: 'Nigeria' },
            { iataCode: 'KAN', name: 'Mallam Aminu Kano International Airport', city: 'Kano', country: 'Nigeria' },
            { iataCode: 'LHR', name: 'London Heathrow Airport', city: 'London', country: 'United Kingdom' },
            { iataCode: 'JFK', name: 'John F. Kennedy International Airport', city: 'New York', country: 'United States' },
            { iataCode: 'CDG', name: 'Charles de Gaulle Airport', city: 'Paris', country: 'France' },
            { iataCode: 'DXB', name: 'Dubai International Airport', city: 'Dubai', country: 'United Arab Emirates' }
        ];

        const filtered = allAirports.filter(airport =>
            airport.name.toLowerCase().includes(keyword.toLowerCase()) ||
            airport.city.toLowerCase().includes(keyword.toLowerCase()) ||
            airport.iataCode.toLowerCase().includes(keyword.toLowerCase())
        );

        return {
            success: true,
            airports: filtered
        };
    }

    /**
     * Get airline information
     */
    async getAirlineInfo(airlineCode) {
        try {
            if (this.isDemo) {
                return this.getDemoAirlineInfo(airlineCode);
            }

            const response = await this.makeRequest(`/v1/reference-data/airlines`, 'GET', null, {
                airlineCodes: airlineCode
            });

            return {
                success: true,
                airline: response.data?.[0]
            };
        } catch (error) {
            console.error('Error getting airline info:', error);
            return {
                success: false,
                error: error.response?.data?.errors?.[0]?.detail || error.message
            };
            // return this.getDemoAirlineInfo(airlineCode);
        }
    }

    /**
     * Get demo airline information
     */
    getDemoAirlineInfo(airlineCode) {
        const airlines = {
            'BA': { iataCode: 'BA', icaoCode: 'BAW', businessName: 'British Airways' },
            'LH': { iataCode: 'LH', icaoCode: 'DLH', businessName: 'Lufthansa' },
            'AF': { iataCode: 'AF', icaoCode: 'AFR', businessName: 'Air France' },
            'KL': { iataCode: 'KL', icaoCode: 'KLM', businessName: 'KLM Royal Dutch Airlines' },
            'MS': { iataCode: 'MS', icaoCode: 'MSR', businessName: 'EgyptAir' },
            'ET': { iataCode: 'ET', icaoCode: 'ETH', businessName: 'Ethiopian Airlines' }
        };

        return {
            success: true,
            airline: airlines[airlineCode] || {
                iataCode: airlineCode,
                businessName: `${airlineCode} Airlines`
            }
        };
    }

    /**
     * Validate passenger data
     */
    validatePassengerData(passengers) {
        const errors = [];

        if (!passengers || passengers.length === 0) {
            errors.push('At least one passenger is required');
            return { isValid: false, errors };
        }

        passengers.forEach((passenger, index) => {
            if (!passenger.firstName) {
                errors.push(`Passenger ${index + 1}: First name is required`);
            }
            if (!passenger.lastName) {
                errors.push(`Passenger ${index + 1}: Last name is required`);
            }
            if (!passenger.dateOfBirth) {
                errors.push(`Passenger ${index + 1}: Date of birth is required`);
            }
            if (!passenger.gender || !['male', 'female'].includes(passenger.gender.toLowerCase())) {
                errors.push(`Passenger ${index + 1}: Valid gender is required`);
            }
            if (!passenger.type || !['adult', 'child', 'infant'].includes(passenger.type)) {
                errors.push(`Passenger ${index + 1}: Valid passenger type is required`);
            }

            // Age validation
            if (passenger.dateOfBirth) {
                const birthDate = new Date(passenger.dateOfBirth);
                const today = new Date();
                const age = today.getFullYear() - birthDate.getFullYear();

                if (passenger.type === 'adult' && age < 12) {
                    errors.push(`Passenger ${index + 1}: Adult passengers must be 12 years or older`);
                }
                if (passenger.type === 'child' && (age < 2 || age >= 12)) {
                    errors.push(`Passenger ${index + 1}: Child passengers must be between 2-11 years old`);
                }
                if (passenger.type === 'infant' && age >= 2) {
                    errors.push(`Passenger ${index + 1}: Infant passengers must be under 2 years old`);
                }
            }
        });

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Calculate total price including taxes and fees
     */
    calculateTotalPrice(basePrice, passengers, additionalServices = []) {
        let total = basePrice * passengers.filter(p => p.type === 'adult').length;
        total += basePrice * 0.75 * passengers.filter(p => p.type === 'child').length; // 75% for children
        // Infants usually fly free on domestic flights

        // Add additional services
        additionalServices.forEach(service => {
            total += service.price * passengers.length;
        });

        // Add taxes (approximately 15-20% of base price)
        const taxes = total * 0.18;

        return {
            basePrice: total,
            taxes: taxes,
            fees: 0,
            total: total + taxes
        };
    }

    /**
     * Get supported travel classes
     */
    getTravelClasses() {
        return [
            { code: 'ECONOMY', name: 'Economy', description: 'Standard seating and service' },
            { code: 'PREMIUM_ECONOMY', name: 'Premium Economy', description: 'Enhanced comfort and service' },
            { code: 'BUSINESS', name: 'Business', description: 'Premium seating with enhanced amenities' },
            { code: 'FIRST', name: 'First Class', description: 'Luxury travel experience' }
        ];
    }

    /**
     * Test connection to flight booking API
     */
    async testConnection() {
        try {
            if (this.isDemo) {
                return {
                    success: true,
                    message: 'Flight booking service connection successful (demo mode)',
                    isDemo: true
                };
            }

            await this.getAccessToken();

            return {
                success: true,
                message: 'Flight booking service connection successful',
                isDemo: false
            };
        } catch (error) {
            return {
                success: false,
                message: 'Flight booking service connection failed',
                error: error.message
            };
        }
    }
}

export default new FlightBookingService();