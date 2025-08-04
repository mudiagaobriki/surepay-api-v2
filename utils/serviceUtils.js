// utils/serviceUtils.js - Service Integration Utilities for Enhanced Bill Payment
import crypto from 'crypto';
import axios from 'axios';

// ==================== COMMON SERVICE UTILITIES ====================

/**
 * Generate unique transaction reference
 */
export const generateTransactionRef = (prefix = 'TXN', length = 8) => {
    const timestamp = Date.now();
    const randomString = crypto.randomBytes(length).toString('hex').toUpperCase();
    return `${prefix}_${timestamp}_${randomString.substring(0, length)}`;
};

/**
 * Generate request ID for VTPass
 */
export const generateVTPassRequestId = () => {
    return Date.now().toString() + Math.random().toString(36).substr(2, 6);
};

/**
 * Create API signature for authenticated requests
 */
export const createApiSignature = (data, secretKey) => {
    const message = typeof data === 'string' ? data : JSON.stringify(data);
    return crypto.createHmac('sha256', secretKey).update(message).digest('hex');
};

/**
 * Validate and format phone numbers
 */
export const phoneUtils = {
    // Format Nigerian phone numbers
    formatNigerianPhone: (phone) => {
        let cleaned = phone.replace(/\D/g, '');

        if (cleaned.startsWith('234')) {
            cleaned = '+' + cleaned;
        } else if (cleaned.startsWith('0')) {
            cleaned = '+234' + cleaned.substring(1);
        } else if (!cleaned.startsWith('+')) {
            cleaned = '+234' + cleaned;
        }

        return cleaned;
    },

    // Validate international phone number
    validateInternationalPhone: (phone, countryCode) => {
        const patterns = {
            US: /^\+1[2-9]\d{9}$/,
            GB: /^\+44[1-9]\d{8,9}$/,
            CA: /^\+1[2-9]\d{9}$/,
            NG: /^\+234[789][01]\d{8}$/,
            // Add more patterns as needed
        };

        const pattern = patterns[countryCode];
        if (!pattern) {
            return { isValid: false, error: 'Country not supported' };
        }

        if (!pattern.test(phone)) {
            return { isValid: false, error: `Invalid ${countryCode} phone number format` };
        }

        return { isValid: true };
    },

    // Extract country code from international phone
    extractCountryCode: (phone) => {
        const cleanPhone = phone.replace(/\D/g, '');

        if (cleanPhone.startsWith('1') && cleanPhone.length === 11) return 'US';
        if (cleanPhone.startsWith('44')) return 'GB';
        if (cleanPhone.startsWith('234')) return 'NG';
        // Add more country codes as needed

        return null;
    }
};

/**
 * Currency utilities
 */
export const currencyUtils = {
    // Format currency for display
    formatCurrency: (amount, currency = 'NGN') => {
        const formatters = {
            NGN: new Intl.NumberFormat('en-NG', {
                style: 'currency',
                currency: 'NGN',
                minimumFractionDigits: 0
            }),
            USD: new Intl.NumberFormat('en-US', {
                style: 'currency',
                currency: 'USD'
            }),
            EUR: new Intl.NumberFormat('en-EU', {
                style: 'currency',
                currency: 'EUR'
            }),
            GBP: new Intl.NumberFormat('en-GB', {
                style: 'currency',
                currency: 'GBP'
            })
        };

        const formatter = formatters[currency] || formatters.NGN;
        return formatter.format(amount);
    },

    // Validate currency amounts
    validateAmount: (amount, currency = 'NGN') => {
        const limits = {
            NGN: { min: 1, max: 10000000 },
            USD: { min: 0.01, max: 25000 },
            EUR: { min: 0.01, max: 22000 },
            GBP: { min: 0.01, max: 20000 }
        };

        const { min, max } = limits[currency] || limits.NGN;

        if (amount < min) {
            return { isValid: false, error: `Minimum amount is ${min} ${currency}` };
        }

        if (amount > max) {
            return { isValid: false, error: `Maximum amount is ${max} ${currency}` };
        }

        return { isValid: true };
    },

    // Get currency symbol
    getCurrencySymbol: (currency) => {
        const symbols = {
            NGN: '₦',
            USD: '$',
            EUR: '€',
            GBP: '£',
            CAD: 'C',
            AUD: 'A',
            JPY: '¥',
            CNY: '¥',
            INR: '₹'
        };

        return symbols[currency] || currency;
    }
};

/**
 * Date and time utilities
 */
export const dateUtils = {
    // Format date for display
    formatDate: (date, format = 'full') => {
        const d = new Date(date);

        const formats = {
            full: d.toLocaleString('en-NG', {
                year: 'numeric',
                month: 'long',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            }),
            short: d.toLocaleDateString('en-NG'),
            time: d.toLocaleTimeString('en-NG', {
                hour: '2-digit',
                minute: '2-digit'
            }),
            iso: d.toISOString()
        };

        return formats[format] || formats.full;
    },

    // Calculate age from date of birth
    calculateAge: (dateOfBirth) => {
        const today = new Date();
        const birth = new Date(dateOfBirth);
        let age = today.getFullYear() - birth.getFullYear();
        const monthDiff = today.getMonth() - birth.getMonth();

        if (monthDiff < 0 || (monthDiff === 0 && today.getDate() < birth.getDate())) {
            age--;
        }

        return age;
    },

    // Check if date is in the future
    isFutureDate: (date) => {
        return new Date(date) > new Date();
    },

    // Add days to date
    addDays: (date, days) => {
        const result = new Date(date);
        result.setDate(result.getDate() + days);
        return result;
    }
};

/**
 * Error handling utilities
 */
export const errorUtils = {
    // Create standardized error response
    createErrorResponse: (message, code = 'UNKNOWN_ERROR', details = null) => {
        return {
            success: false,
            error: {
                code,
                message,
                details,
                timestamp: new Date().toISOString()
            }
        };
    },

    // Map VTPass error codes to user-friendly messages
    mapVTPassError: (vtpassResponse) => {
        const errorMappings = {
            '000': 'Transaction successful',
            '001': 'Transaction failed - Please try again',
            '002': 'Insufficient balance',
            '003': 'Invalid service ID',
            '004': 'Invalid customer details',
            '005': 'Service temporarily unavailable',
            '006': 'Invalid amount',
            '007': 'Transaction pending',
            '008': 'Duplicate transaction',
            '009': 'Network error'
        };

        const code = vtpassResponse?.code || vtpassResponse?.response_description;
        return errorMappings[code] || vtpassResponse?.response_description_text || 'Unknown error occurred';
    },

    // Handle API errors gracefully
    handleApiError: (error, service = 'API') => {
        console.error(`${service} Error:`, error);

        if (error.response) {
            // HTTP error response
            return {
                success: false,
                message: error.response.data?.message || `${service} request failed`,
                status: error.response.status,
                details: error.response.data
            };
        } else if (error.request) {
            // Network error
            return {
                success: false,
                message: `${service} is currently unavailable`,
                details: 'Network error'
            };
        } else {
            // General error
            return {
                success: false,
                message: error.message || `${service} error occurred`,
                details: error.stack
            };
        }
    }
};

/**
 * Validation utilities
 */
export const validationUtils = {
    // Validate email format
    isValidEmail: (email) => {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(email);
    },

    // Validate IATA airport code
    isValidIATACode: (code) => {
        return /^[A-Z]{3}$/.test(code);
    },

    // Validate currency code
    isValidCurrencyCode: (code) => {
        return /^[A-Z]{3}$/.test(code);
    },

    // Validate country code
    isValidCountryCode: (code) => {
        return /^[A-Z]{2}$/.test(code);
    },

    // Sanitize input string
    sanitizeString: (str) => {
        return str.trim().replace(/[<>\"'&]/g, '');
    }
};

/**
 * Service status utilities
 */
export const serviceStatusUtils = {
    // Map different service statuses to standardized format
    standardizeStatus: (status, serviceType) => {
        const statusMappings = {
            vtpass: {
                'successful': 'completed',
                'failed': 'failed',
                'pending': 'processing',
                'initiated': 'processing'
            },
            betting: {
                'placed': 'placed',
                'won': 'won',
                'lost': 'lost',
                'void': 'cancelled',
                'pending': 'processing'
            },
            flight: {
                'confirmed': 'confirmed',
                'cancelled': 'cancelled',
                'refunded': 'refunded',
                'pending': 'processing'
            }
        };

        const mapping = statusMappings[serviceType] || {};
        return mapping[status] || status;
    },

    // Check if status allows refund
    canRefund: (status, serviceType) => {
        const refundableStatuses = {
            bill_payment: ['failed'],
            sports_betting: ['failed', 'void'],
            flight_booking: ['confirmed'], // Within cancellation period
            international_airtime: ['failed']
        };

        return refundableStatuses[serviceType]?.includes(status) || false;
    },

    // Get user-friendly status message
    getStatusMessage: (status, serviceType) => {
        const messages = {
            processing: 'Transaction is being processed',
            completed: 'Transaction completed successfully',
            failed: 'Transaction failed',
            cancelled: 'Transaction was cancelled',
            refunded: 'Transaction was refunded',
            placed: 'Bet has been placed successfully',
            won: 'Congratulations! Your bet won',
            lost: 'Your bet was not successful',
            confirmed: 'Booking has been confirmed'
        };

        return messages[status] || 'Status unknown';
    }
};

/**
 * Data transformation utilities
 */
export const transformUtils = {
    // Transform VTPass service data for frontend
    transformVTPassService: (service) => {
        return {
            id: service.serviceID,
            name: service.name,
            category: service.category || 'other',
            image: service.image,
            hasVariations: service.variations?.length > 0,
            minimumAmount: service.minimum_amount,
            maximumAmount: service.maximum_amount,
            serviceType: service.service_type
        };
    },

    // Transform flight offer data
    transformFlightOffer: (offer) => {
        const segments = offer.itineraries?.[0]?.segments || [];
        const firstSegment = segments[0];
        const lastSegment = segments[segments.length - 1];

        return {
            id: offer.id,
            price: offer.price,
            origin: firstSegment?.departure?.iataCode,
            destination: lastSegment?.arrival?.iataCode,
            departureTime: firstSegment?.departure?.at,
            arrivalTime: lastSegment?.arrival?.at,
            duration: offer.itineraries?.[0]?.duration,
            stops: segments.length - 1,
            airline: firstSegment?.carrierCode,
            aircraft: firstSegment?.aircraft?.code
        };
    },

    // Transform transaction for enhanced history
    transformTransactionForHistory: (transaction, category) => {
        const baseTransform = {
            id: transaction._id,
            transactionRef: transaction.transactionRef,
            category,
            status: transaction.status,
            createdAt: transaction.createdAt,
            updatedAt: transaction.updatedAt
        };

        switch (category) {
            case 'bill_payment':
                return {
                    ...baseTransform,
                    serviceType: transaction.serviceType,
                    amount: transaction.amount,
                    currency: 'NGN',
                    description: `${transaction.serviceType} payment`
                };

            case 'sports_betting':
                return {
                    ...baseTransform,
                    amount: transaction.stake,
                    currency: 'NGN',
                    sport: transaction.sport,
                    betType: transaction.betType,
                    potentialWinnings: transaction.potentialWinnings,
                    description: `${transaction.betType} bet on ${transaction.sport}`
                };

            case 'flight_booking':
                return {
                    ...baseTransform,
                    amount: transaction.totalAmount,
                    currency: 'NGN',
                    route: transaction.route,
                    passengers: transaction.travelers?.length,
                    description: `Flight booking: ${transaction.route}`
                };

            case 'international_airtime':
                return {
                    ...baseTransform,
                    amount: transaction.nairaAmount,
                    currency: 'NGN',
                    localAmount: transaction.amount,
                    localCurrency: transaction.localCurrency,
                    country: transaction.country?.name,
                    operator: transaction.operator?.name,
                    description: `International airtime: ${transaction.country?.name}`
                };

            default:
                return baseTransform;
        }
    }
};

/**
 * Caching utilities
 */
export const cacheUtils = {
    // Generate cache key
    generateCacheKey: (prefix, ...params) => {
        return `${prefix}:${params.join(':')}`;
    },

    // Check if cache is valid
    isCacheValid: (timestamp, ttlMinutes = 60) => {
        if (!timestamp) return false;
        const now = Date.now();
        const cacheAge = now - timestamp;
        const ttlMs = ttlMinutes * 60 * 1000;
        return cacheAge < ttlMs;
    },

    // Create cache entry
    createCacheEntry: (data, ttlMinutes = 60) => {
        return {
            data,
            timestamp: Date.now(),
            ttl: ttlMinutes * 60 * 1000,
            expiresAt: Date.now() + (ttlMinutes * 60 * 1000)
        };
    }
};

/**
 * Security utilities
 */
export const securityUtils = {
    // Mask sensitive data
    maskPhoneNumber: (phone) => {
        if (!phone || phone.length < 4) return phone;
        const visible = phone.slice(-4);
        const masked = '*'.repeat(phone.length - 4);
        return masked + visible;
    },

    maskEmail: (email) => {
        if (!email || !email.includes('@')) return email;
        const [local, domain] = email.split('@');
        const maskedLocal = local.charAt(0) + '*'.repeat(local.length - 2) + local.slice(-1);
        return `${maskedLocal}@${domain}`;
    },

    maskCardNumber: (cardNumber) => {
        if (!cardNumber || cardNumber.length < 4) return cardNumber;
        const visible = cardNumber.slice(-4);
        const masked = '*'.repeat(cardNumber.length - 4);
        return masked + visible;
    },

    // Generate secure random string
    generateSecureId: (length = 32) => {
        return crypto.randomBytes(length).toString('hex');
    },

    // Hash sensitive data
    hashData: (data, algorithm = 'sha256') => {
        return crypto.createHash(algorithm).update(data).digest('hex');
    }
};

/**
 * API response utilities
 */
export const responseUtils = {
    // Create success response
    success: (data, message = 'Operation successful') => {
        return {
            success: true,
            message,
            data,
            timestamp: new Date().toISOString()
        };
    },

    // Create error response
    error: (message, code = 'OPERATION_FAILED', details = null) => {
        return {
            success: false,
            error: {
                code,
                message,
                details
            },
            timestamp: new Date().toISOString()
        };
    },

    // Create paginated response
    paginated: (data, pagination, message = 'Data retrieved successfully') => {
        return {
            success: true,
            message,
            data,
            pagination,
            timestamp: new Date().toISOString()
        };
    }
};

/**
 * Service health check utilities
 */
export const healthCheckUtils = {
    // Check external service health
    checkServiceHealth: async (serviceName, url, timeout = 5000) => {
        try {
            const start = Date.now();
            const response = await axios.get(url, { timeout });
            const responseTime = Date.now() - start;

            return {
                service: serviceName,
                status: 'healthy',
                responseTime,
                timestamp: new Date().toISOString()
            };
        } catch (error) {
            return {
                service: serviceName,
                status: 'unhealthy',
                error: error.message,
                timestamp: new Date().toISOString()
            };
        }
    },

    // Aggregate health status
    aggregateHealthStatus: (healthChecks) => {
        const totalServices = healthChecks.length;
        const healthyServices = healthChecks.filter(check => check.status === 'healthy').length;
        const overallStatus = healthyServices === totalServices ? 'healthy' :
            healthyServices > 0 ? 'degraded' : 'unhealthy';

        return {
            overallStatus,
            healthyServices,
            totalServices,
            healthPercentage: Math.round((healthyServices / totalServices) * 100),
            checks: healthChecks,
            timestamp: new Date().toISOString()
        };
    }
};

// Export all utilities
export default {
    generateTransactionRef,
    generateVTPassRequestId,
    createApiSignature,
    phoneUtils,
    currencyUtils,
    dateUtils,
    errorUtils,
    validationUtils,
    serviceStatusUtils,
    transformUtils,
    cacheUtils,
    securityUtils,
    responseUtils,
    healthCheckUtils
};