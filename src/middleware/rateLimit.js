// middleware/rateLimit.js - Rate Limiting Middleware for Enhanced Bill Payment API
import rateLimit from 'express-rate-limit';
import RedisStore from 'rate-limit-redis';
import Redis from 'ioredis';

// Redis connection for rate limiting (optional, falls back to memory store)
let redisClient = null;
try {
    if (process.env.REDIS_URL) {
        redisClient = new Redis(process.env.REDIS_URL, {
            retryDelayOnFailover: 100,
            maxRetriesPerRequest: 3,
            lazyConnect: true
        });
        console.log('Rate limiting using Redis store');
    }
} catch (error) {
    console.warn('Redis not available for rate limiting, using memory store:', error.message);
}

/**
 * Create rate limiting middleware
 * @param {number} max - Maximum number of requests per window
 * @param {number} windowMinutes - Time window in minutes
 * @param {object} options - Additional rate limit options
 */
export const rateLimitMiddleware = (max = 100, windowMinutes = 15, options = {}) => {
    const config = {
        windowMs: windowMinutes * 60 * 1000, // Convert minutes to milliseconds
        max,
        message: {
            success: false,
            message: `Too many requests. Maximum ${max} requests allowed per ${windowMinutes} minutes.`,
            retryAfter: windowMinutes * 60
        },
        standardHeaders: true, // Return rate limit info in the `RateLimit-*` headers
        legacyHeaders: false, // Disable the `X-RateLimit-*` headers
        keyGenerator: (req) => {
            // Generate key based on user ID (if authenticated) or IP address
            const userId = req.user?.id;
            const ip = req.ip || req.connection.remoteAddress;
            return userId ? `user:${userId}` : `ip:${ip}`;
        },
        skip: (req) => {
            // Skip rate limiting for admin users (optional)
            return req.user?.role === 'admin';
        },
        onLimitReached: (req, res, options) => {
            console.warn('Rate limit reached:', {
                key: options.keyGenerator(req),
                route: req.route?.path,
                method: req.method,
                timestamp: new Date().toISOString()
            });
        },
        ...options
    };

    // Use Redis store if available
    if (redisClient) {
        config.store = new RedisStore({
            sendCommand: (...args) => redisClient.call(...args)
        });
    }

    return rateLimit(config);
};

/**
 * Strict rate limiting for sensitive operations
 */
export const strictRateLimit = rateLimitMiddleware(5, 15, {
    message: {
        success: false,
        message: 'Too many attempts. Please wait 15 minutes before trying again.',
        retryAfter: 15 * 60
    }
});

/**
 * Moderate rate limiting for payment operations
 */
export const paymentRateLimit = rateLimitMiddleware(10, 15, {
    message: {
        success: false,
        message: 'Payment rate limit exceeded. Maximum 10 payments per 15 minutes.',
        retryAfter: 15 * 60
    }
});

/**
 * Lenient rate limiting for data fetching
 */
export const dataRateLimit = rateLimitMiddleware(100, 15, {
    message: {
        success: false,
        message: 'Too many data requests. Please slow down.',
        retryAfter: 15 * 60
    }
});

/**
 * Search-specific rate limiting
 */
export const searchRateLimit = rateLimitMiddleware(50, 15, {
    message: {
        success: false,
        message: 'Search rate limit exceeded. Maximum 50 searches per 15 minutes.',
        retryAfter: 15 * 60
    }
});

/**
 * Expensive operation rate limiting (flights, complex searches)
 */
export const expensiveOperationRateLimit = rateLimitMiddleware(20, 15, {
    message: {
        success: false,
        message: 'Resource-intensive operation limit reached. Please wait before trying again.',
        retryAfter: 15 * 60
    }
});

/**
 * User-specific rate limiting based on subscription tier
 */
export const tierBasedRateLimit = (req, res, next) => {
    const user = req.user;

    if (!user) {
        return rateLimitMiddleware(50, 15)(req, res, next);
    }

    // Define limits based on user tier
    const tierLimits = {
        basic: { max: 100, window: 15 },
        premium: { max: 500, window: 15 },
        enterprise: { max: 2000, window: 15 },
        admin: { max: 10000, window: 15 }
    };

    const userTier = user.subscriptionTier || 'basic';
    const limits = tierLimits[userTier];

    return rateLimitMiddleware(limits.max, limits.window)(req, res, next);
};

/**
 * IP-based rate limiting for public endpoints
 */
export const ipRateLimit = rateLimitMiddleware(200, 15, {
    keyGenerator: (req) => req.ip || req.connection.remoteAddress,
    message: {
        success: false,
        message: 'IP rate limit exceeded. Too many requests from this IP address.',
        retryAfter: 15 * 60
    }
});

/**
 * Global rate limiting for the entire API
 */
export const globalRateLimit = rateLimitMiddleware(1000, 15, {
    keyGenerator: () => 'global',
    message: {
        success: false,
        message: 'API is experiencing high traffic. Please try again later.',
        retryAfter: 15 * 60
    }
});

/**
 * Custom rate limiting for specific services
 */
export const serviceRateLimit = {
    // Sports betting limits
    sportsBetting: rateLimitMiddleware(20, 15, {
        message: {
            success: false,
            message: 'Sports betting rate limit exceeded. Maximum 20 bets per 15 minutes.',
            retryAfter: 15 * 60
        }
    }),

    // Flight booking limits
    flightBooking: rateLimitMiddleware(5, 15, {
        message: {
            success: false,
            message: 'Flight booking rate limit exceeded. Maximum 5 bookings per 15 minutes.',
            retryAfter: 15 * 60
        }
    }),

    // International airtime limits
    internationalAirtime: rateLimitMiddleware(15, 15, {
        message: {
            success: false,
            message: 'International airtime rate limit exceeded. Maximum 15 purchases per 15 minutes.',
            retryAfter: 15 * 60
        }
    }),

    // Bill payment limits
    billPayment: rateLimitMiddleware(30, 15, {
        message: {
            success: false,
            message: 'Bill payment rate limit exceeded. Maximum 30 payments per 15 minutes.',
            retryAfter: 15 * 60
        }
    })
};

/**
 * Rate limiting middleware with custom error handling
 */
export const customRateLimit = (config) => {
    return (req, res, next) => {
        const middleware = rateLimitMiddleware(config.max, config.window, {
            ...config,
            handler: (req, res) => {
                console.warn('Custom rate limit exceeded:', {
                    route: req.originalUrl,
                    method: req.method,
                    user: req.user?.id,
                    ip: req.ip,
                    timestamp: new Date().toISOString(),
                    limit: config.max
                });

                res.status(429).json({
                    success: false,
                    message: config.message || 'Rate limit exceeded',
                    error: 'TOO_MANY_REQUESTS',
                    retryAfter: config.window * 60,
                    limit: config.max,
                    window: config.window
                });
            }
        });

        return middleware(req, res, next);
    };
};

/**
 * Rate limiting for webhook endpoints
 */
export const webhookRateLimit = rateLimitMiddleware(100, 5, {
    keyGenerator: (req) => {
        // Use webhook source or IP for rate limiting
        const source = req.headers['x-webhook-source'] || req.ip;
        return `webhook:${source}`;
    },
    message: {
        success: false,
        message: 'Webhook rate limit exceeded.',
        retryAfter: 5 * 60
    }
});

/**
 * Dynamic rate limiting based on system load
 */
export const adaptiveRateLimit = (baseConfig) => {
    return (req, res, next) => {
        // Check system load/metrics (implement your load checking logic)
        const systemLoad = getSystemLoad(); // Implement this function

        let adjustedMax = baseConfig.max;

        if (systemLoad > 0.8) {
            adjustedMax = Math.floor(baseConfig.max * 0.5); // Reduce by 50%
        } else if (systemLoad > 0.6) {
            adjustedMax = Math.floor(baseConfig.max * 0.7); // Reduce by 30%
        }

        const middleware = rateLimitMiddleware(adjustedMax, baseConfig.window, {
            ...baseConfig,
            headers: true
        });

        return middleware(req, res, next);
    };
};

/**
 * Placeholder for system load checking
 * Implement this based on your monitoring system
 */
function getSystemLoad() {
    // Return a value between 0 and 1 representing system load
    // This is a placeholder - implement based on your metrics
    return Math.random() * 0.5; // Demo: random low load
}

export default rateLimitMiddleware;