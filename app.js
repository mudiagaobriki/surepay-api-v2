import dotenv from "dotenv";
import { connect } from "./config/database.js";
import express from "express";
import cron from "node-cron";
import cors from "cors";
import bodyParser from "body-parser";
import { initSentry, addSentryErrorHandler } from "./config/sentry.js";
import { handleMulterError } from "./config/multer.js";
import http from 'http';
import { Server } from 'socket.io';
import jwt from 'jsonwebtoken';
import Chat from './src/models/Chat.js';

// Import existing routes
import userRoute from "./src/routes/userRoute.js";
import adminRoute from "./src/routes/adminRoute.js";
import profileRoute from "./src/routes/profileRoute.js";
import whatsappRoute from "./src/routes/whatsappRoute.js";
import messageRoute from "./src/routes/messagesRoute.js";
import walletRoute from "./src/routes/walletRoutes.js";
import betWalletFundingRoute from "./src/routes/betWalletFundingRoutes.js";
import chatRoute from './src/routes/chatRoute.js';
import smsRoute from './src/routes/smsRoute.js';

// Import enhanced bill payment routes
import billPaymentRoute from "./src/routes/billPaymentRoutes.js";
import enhancedBillPaymentRoute from "./src/routes/enhancedBillPaymentRoute.js";
import giftCardRoute from "./src/routes/giftCardRoutes.js";
import flightRoutes from './src/routes/flightBookingRoutes.js';
import settingsRouter from './src/routes/settingsRoute.js';

// Import enhanced middleware
// import { rateLimitMiddleware, globalRateLimit } from "./src/middleware/rateLimit.js";
import { requestLogger } from "./src/middleware/requestLogger.js";
import { healthCheckMiddleware } from "./src/middleware/healthCheck.js";

dotenv.config();
connect();

const app = express();

// Initialize Sentry before any other middleware
initSentry(app);

// CORS configuration - Enhanced with additional headers for new services
const corsOptions = {
  origin: process.env.NODE_ENV === 'production'
    ? [
      'https://yourdomain.com',
      'https://www.yourdomain.com'
    ]
    : ['http://localhost:3000', 'http://localhost:8081', 'http://localhost:19000'],
  credentials: true,
  optionsSuccessStatus: 200,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: [
    'Origin',
    'X-Requested-With',
    'Content-Type',
    'Accept',
    'Authorization',
    'Cache-Control',
    'Pragma',
    'x-access-token',
    'X-API-Key',
    'X-Service-Type' // Added for enhanced services
  ],
  exposedHeaders: ['Content-Length', 'Content-Range', 'X-Total-Count', 'X-Rate-Limit-Remaining']
};

app.use(cors(corsOptions));

// Handle preflight requests
app.options('*', cors(corsOptions));

// Trust proxy for proper IP detection (important for rate limiting and logging)
app.set('trust proxy', 1);

// Apply global rate limiting for enhanced security
// app.use('/api/', globalRateLimit);

// Enhanced request logging middleware
app.use(requestLogger);

// Body parsing middleware - Set limits for file uploads
app.use(bodyParser.urlencoded({
  extended: true,
  limit: '50mb',
  parameterLimit: 50000
}));
app.use(bodyParser.json({
  limit: '50mb'
}));
app.use(bodyParser.raw({
  limit: '50mb',
  type: ['application/octet-stream', 'image/*']
}));

// Express JSON middleware with increased limit for file uploads
app.use(express.json({
  limit: "50mb",
  verify: (req, res, buf) => {
    // Store raw body for webhook verification if needed
    req.rawBody = buf;
  }
}));

// Express URL encoded middleware
app.use(express.urlencoded({
  extended: true,
  limit: "50mb"
}));

// Custom middleware to log requests in development
if (process.env.NODE_ENV === 'development') {
  app.use((req, res, next) => {
    console.log(`${new Date().toISOString()} - ${req.method} ${req.path}`);
    if (req.body && Object.keys(req.body).length > 0) {
      console.log('Body:', JSON.stringify(req.body, null, 2).substring(0, 500));
    }
    next();
  });
}

// Enhanced security headers middleware
app.use((req, res, next) => {
  // Security headers
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('X-Powered-By', 'Surepay-API'); // Custom header

  // For file uploads, allow larger content
  if (req.path.includes('/upload')) {
    res.setHeader('Access-Control-Max-Age', '86400'); // 24 hours
  }

  // Add rate limit headers for transparency
  if (req.rateLimit) {
    res.setHeader('X-Rate-Limit-Limit', req.rateLimit.limit);
    res.setHeader('X-Rate-Limit-Remaining', req.rateLimit.remaining);
    res.setHeader('X-Rate-Limit-Reset', new Date(req.rateLimit.resetTime));
  }

  next();
});

// ==================== HEALTH CHECK ENDPOINTS ====================

// Basic health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
    version: process.env.npm_package_version || '1.0.0',
    services: {
      database: 'connected',
      api: 'operational'
    }
  });
});

// Detailed health check with service monitoring
app.get('/health/detailed', healthCheckMiddleware);

// Service status endpoint for enhanced monitoring
app.get('/status', async (req, res) => {
  try {
    const serviceStatus = {
      api: 'operational',
      database: 'connected',
      vtpass: 'checking',
      sportsBetting: 'checking',
      flightBooking: 'checking',
      internationalAirtime: 'checking',
      giftCards: 'checking'
    };

    // Add service health checks here
    // This would integrate with your existing health check logic

    res.status(200).json({
      status: 'operational',
      services: serviceStatus,
      timestamp: new Date().toISOString(),
      uptime: process.uptime(),
      version: process.env.npm_package_version || '1.0.0'
    });
  } catch (error) {
    res.status(503).json({
      status: 'degraded',
      error: error.message,
      timestamp: new Date().toISOString()
    });
  }
});

// ==================== API ROUTES ====================

// Existing routes with enhanced rate limiting
app.use("/api/users", userRoute);
app.use("/api/admins", adminRoute);
app.use("/api/profiles", profileRoute);
app.use("/api/whatsapp", whatsappRoute);
app.use("/api/messages", messageRoute);
app.use("/api/wallet", walletRoute);
app.use("/api/bet", betWalletFundingRoute);
app.use("/api/chat", chatRoute);
app.use("/api/sms", smsRoute);
app.use("/api/settings", settingsRouter);

// Enhanced bill payment routes with backward compatibility
app.use("/api/bills", billPaymentRoute); // Existing route for backward compatibility
app.use("/api/bills/enhanced", enhancedBillPaymentRoute); // New enhanced features

// Alternative mounting for enhanced features (optional)
app.use("/api/v2/bills", enhancedBillPaymentRoute); // Version 2 API
app.use("/api/gift-cards", giftCardRoute); // Gift card functionality
app.use('/api/flights', flightRoutes);

// Welcome route with authentication middleware
app.get("/welcome", (req, res) => {
  res.status(200).json({
    message: "Welcome to Surepay API - Enhanced Edition",
    user: req.user || null,
    timestamp: new Date().toISOString(),
    features: [
      "Traditional Bill Payments",
      "Sports Betting Integration",
      "Flight Booking System",
      "International Airtime",
      "Enhanced Security & Rate Limiting"
    ]
  });
});

// Enhanced API documentation endpoint
app.get('/api/docs', (req, res) => {
  res.status(200).json({
    message: "Surepay API Documentation - Enhanced Edition",
    version: "2.0.0",
    lastUpdated: new Date().toISOString(),
    endpoints: {
      auth: {
        base: "/api/users",
        endpoints: [
          "POST /register - Register new user",
          "POST /login - User login",
          "POST /logout - User logout",
          "GET /email/verify/:token - Verify email",
          "POST /email/verify/resend - Resend verification",
          "POST /email/forgot-password - Request password reset",
          "POST /reset-password - Reset password"
        ]
      },
      profiles: {
        base: "/api/profiles",
        endpoints: [
          "GET /user - Get current user profile",
          "POST /new - Create new profile",
          "POST /edit - Edit profile",
          "POST /upload-image - Upload profile image",
          "POST /pin/set - Set transaction PIN",
          "POST /pin/change - Change transaction PIN",
          "POST /pin/verify - Verify transaction PIN",
          "POST /biometric/toggle - Toggle biometric settings"
        ]
      },
      bills: {
        base: "/api/bills",
        endpoints: [
          "GET /categories - Get service categories",
          "GET /services/:category - Get services by category",
          "POST /pay - Pay bill",
          "GET /transactions - Get transaction history"
        ]
      },
      enhancedBills: {
        base: "/api/bills/enhanced OR /api/v2/bills",
        description: "Enhanced bill payment services with additional features",
        endpoints: [
          // Traditional Bill Payments
          "GET /services/categories - Get service categories",
          "GET /services/:category - Get services by category",
          "POST /verify - Verify customer details",
          "POST /pay - Pay bill",
          "GET /history - Get payment history",
          "GET /enhanced-history - Get unified transaction history",

          // Sports Betting
          "GET /sports - Get available sports",
          "GET /sports/:sportId/leagues - Get leagues for sport",
          "GET /sports/:sportId/matches - Get matches",
          "POST /sports-betting/place-bet - Place a sports bet",
          "GET /sports-betting/bet-status/:transactionRef - Get bet status",

          // Flight Booking
          "GET /flights/search - Search flights",
          "GET /flights/airports/search - Search airports",
          "POST /flights/book - Book a flight",
          "GET /flights/booking/:transactionRef - Get booking details",

          // International Airtime
          "GET /international-airtime/countries - Get supported countries",
          "GET /international-airtime/operators/:countryCode - Get operators",
          "GET /international-airtime/products/:operatorId - Get products",
          "GET /international-airtime/exchange-rates - Get exchange rates",
          "POST /international-airtime/purchase - Purchase international airtime",
          "GET /international-airtime/status/:transactionRef - Get transaction status"
        ]
      },
      wallet: {
        base: "/api/wallet",
        endpoints: [
          "GET /balance - Get wallet balance",
          "POST /fund - Fund wallet",
          "GET /transactions - Get wallet transactions"
        ]
      },
      giftCards: {
        base: "/api/gift-cards",
        description: "Digital gift card purchases via Reloadly API",
        endpoints: [
          "GET /countries - Get available countries",
          "GET /products/:countryCode - Get products by country",
          "GET /product/:productId - Get product details",
          "POST /calculate-pricing - Calculate pricing in Naira",
          "POST /purchase - Purchase gift card",
          "GET /transaction/:transactionRef - Get transaction status",
          "GET /history - Get purchase history",
          "GET /details/:transactionRef - Get card details (sensitive)",
          "GET /test-connection - Test Reloadly connection (admin)"
        ],
        supportedCountries: "200+ countries including US, UK, Canada, Germany, etc.",
        supportedBrands: "Amazon, Google Play, iTunes, Steam, Netflix, Spotify, etc.",
        paymentMethods: ["wallet"],
        currencies: {
          purchase: "USD (converted from NGN)",
          billing: "NGN"
        },
        features: [
          "Real-time exchange rates",
          "Email delivery to recipients",
          "Multiple gift cards per purchase",
          "Personal messages for gifts",
          "Transaction history and tracking",
          "Automatic wallet refunds on failures"
        ]
      },
    },
    features: {
      newInV2_1: [
        "🎁 Digital Gift Card Purchases (200+ countries)",
        "🔄 Real-time USD/NGN Exchange Rates",
        "📧 Email Delivery to Recipients",
        "🎯 Personal Messages for Gifts",
        "🛡️ Secure Card Detail Storage",
        "💰 Automatic Refunds on Failures"
      ],
      newInV2: [
        "Sports Betting Integration",
        "Flight Booking System",
        "International Airtime (200+ countries)",
        "Enhanced Security & Rate Limiting",
        "Unified Transaction History",
        "Real-time Exchange Rates",
        "Advanced Error Handling"
      ],
      security: {
        rateLimit: "Tiered rate limiting based on endpoint type",
        authentication: "JWT Bearer token required for protected endpoints",
        validation: "Comprehensive input validation with Joi schemas",
        cors: "Configurable CORS with security headers"
      },
      rateLimit: {
        global: "1000 requests per 15 minutes",
        payments: "10 requests per 15 minutes",
        searches: "50 requests per 15 minutes",
        sportsBetting: "20 bets per 15 minutes",
        flightBooking: "5 bookings per 15 minutes"
      }
    },
    notes: {
      authentication: "Use Bearer token in Authorization header",
      fileUploads: "Multipart/form-data with 'image' field name",
      maxFileSize: "5MB for profile images, 10MB for documents",
      supportedImageTypes: "JPEG, PNG, WebP, GIF",
      backwardCompatibility: "All existing /api/bills endpoints remain functional",
      enhancedFeatures: "Access via /api/bills/enhanced or /api/v2/bills"
    },
    support: {
      email: "support@Surepay.com",
      documentation: "Visit /api/docs for full documentation",
      healthCheck: "Monitor service status at /health and /status"
    },
    giftCardGuide: {
      quickStart: [
        "1. GET /countries to see available countries",
        "2. GET /products/{countryCode} to browse gift cards",
        "3. POST /calculate-pricing to see costs in Naira",
        "4. POST /purchase to buy gift card",
        "5. GET /details/{transactionRef} to view card details"
      ],
      pricing: {
        exchangeRate: "Dynamic USD to NGN conversion",
        serviceCharge: "2.5% processing fee",
        minimumPurchase: "$1 USD",
        maximumPurchase: "$500 USD",
        maximumQuantity: "10 cards per transaction"
      },
      delivery: {
        method: "Email to recipient",
        timeframe: "5-15 minutes",
        includes: "Card number, PIN, instructions",
        support: "24/7 customer support"
      },
      security: {
        storage: "Encrypted card details",
        access: "Purchaser only",
        masking: "Partial masking in history",
        fullDetails: "Available via /details endpoint"
      }
    }
  });
});

// API root endpoint with service discovery
app.get('/api', (req, res) => {
  res.status(200).json({
    message: "Surepay API - Enhanced Edition",
    version: "2.0.0",
    status: "operational",
    documentation: "/api/docs",
    health: "/health",
    services: {
      traditional: {
        billPayments: "/api/bills",
        wallet: "/api/wallet",
        users: "/api/users",
        profiles: "/api/profiles"
      },
      enhanced: {
        allServices: "/api/bills/enhanced",
        v2API: "/api/v2/bills",
        sportsBetting: "/api/bills/enhanced/sports-betting",
        flightBooking: "/api/bills/enhanced/flights",
        internationalAirtime: "/api/bills/enhanced/international-airtime"
      }
    },
    timestamp: new Date().toISOString()
  });
});


// ==================== CRON JOB FOR CHAT CLEANUP ====================
// This is a fallback to ensure chats are deleted.
cron.schedule('0 2 * * *', async () => { // Runs every day at 2 AM
  console.log('Running daily chat cleanup cron job...');
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
  try {
    const result = await Chat.deleteMany({ createdAt: { $lt: thirtyDaysAgo } });
    console.log(`Chat cleanup successful. Deleted ${result.deletedCount} old chats.`);
  } catch (error) {
    console.error('Error during chat cleanup cron job:', error);
  }
});


// ==================== ERROR HANDLING ====================

// Multer error handling middleware (before general error handler)
app.use(handleMulterError);

// Enhanced global error handling middleware
app.use((err, req, res, next) => {
  console.error('Global error handler:', {
    error: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined,
    url: req.url,
    method: req.method,
    userId: req.user?.id,
    timestamp: new Date().toISOString(),
    userAgent: req.get('User-Agent'),
    ip: req.ip
  });

  // Mongoose validation errors
  if (err.name === 'ValidationError') {
    const errors = Object.values(err.errors).map(e => e.message);
    return res.status(400).json({
      success: false,
      status: 'error',
      message: 'Validation Error',
      errors: errors,
      timestamp: new Date().toISOString()
    });
  }

  // Mongoose duplicate key error
  if (err.code === 11000) {
    const field = Object.keys(err.keyValue)[0];
    return res.status(409).json({
      success: false,
      status: 'error',
      message: `${field} already exists`,
      field: field,
      timestamp: new Date().toISOString()
    });
  }

  // JWT errors
  if (err.name === 'JsonWebTokenError') {
    return res.status(401).json({
      success: false,
      status: 'error',
      message: 'Invalid token',
      timestamp: new Date().toISOString()
    });
  }

  if (err.name === 'TokenExpiredError') {
    return res.status(401).json({
      success: false,
      status: 'error',
      message: 'Token expired',
      timestamp: new Date().toISOString()
    });
  }

  // File upload errors
  if (err.message && err.message.includes('File too large')) {
    return res.status(413).json({
      success: false,
      status: 'error',
      message: 'File too large',
      maxSize: '5MB for images, 10MB for documents',
      timestamp: new Date().toISOString()
    });
  }

  // Rate limit errors (enhanced handling)
  if (err.status === 429) {
    return res.status(429).json({
      success: false,
      status: 'error',
      message: 'Too many requests, please try again later',
      retryAfter: err.retryAfter || 60,
      limit: err.limit,
      remaining: 0,
      timestamp: new Date().toISOString()
    });
  }

  // Enhanced service errors
  if (err.code === 'SERVICE_UNAVAILABLE') {
    return res.status(503).json({
      success: false,
      status: 'error',
      message: 'Service temporarily unavailable',
      service: err.service,
      retryAfter: 300, // 5 minutes
      timestamp: new Date().toISOString()
    });
  }

  // API errors from external services
  if (err.isAxiosError) {
    return res.status(502).json({
      success: false,
      status: 'error',
      message: 'External service error',
      service: err.config?.baseURL || 'unknown',
      timestamp: new Date().toISOString()
    });
  }

  // Default error response
  const status = err.status || err.statusCode || 500;
  const message = err.message || 'Internal server error';

  res.status(status).json({
    success: false,
    status: 'error',
    message: message,
    ...(process.env.NODE_ENV === 'development' && {
      stack: err.stack,
      details: err
    }),
    timestamp: new Date().toISOString(),
    requestId: req.id || 'unknown'
  });
});

// Enhanced 404 handler for API routes
app.use('/api/*', (req, res) => {
  res.status(404).json({
    success: false,
    status: 'error',
    message: 'API endpoint not found',
    path: req.path,
    method: req.method,
    availableEndpoints: [
      '/api/users',
      '/api/profiles',
      '/api/bills',
      '/api/bills/enhanced',
      '/api/v2/bills',
      '/api/wallet',
      '/api/admins'
    ],
    documentation: '/api/docs',
    timestamp: new Date().toISOString()
  });
});

// Handle undefined routes (non-API)
app.use("*", (req, res) => {
  res.status(404).json({
    success: false,
    message: "Page not found",
    error: {
      statusCode: 404,
      message: "You reached a route that is not defined on this server",
      path: req.path,
      method: req.method
    },
    suggestions: [
      "Check the API documentation at /api/docs",
      "Verify the endpoint URL and method",
      "Ensure you're using the correct API version"
    ],
    timestamp: new Date().toISOString()
  });
});

// Add Sentry error handler after all controllers and middleware
addSentryErrorHandler(app);

// ==================== GRACEFUL SHUTDOWN ====================

// Enhanced graceful shutdown handling
const gracefulShutdown = (signal) => {
  console.log(`Received ${signal}. Starting graceful shutdown...`);

  // Close server gracefully
  const server = app.get('server');
  if (server) {
    server.close(() => {
      console.log('HTTP server closed.');

      // Close database connections, cleanup resources, etc.
      // Add any cleanup logic here

      console.log('Graceful shutdown completed.');
      process.exit(0);
    });

    // Force shutdown after 30 seconds
    setTimeout(() => {
      console.error('Forced shutdown after timeout');
      process.exit(1);
    }, 30000);
  } else {
    process.exit(0);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Enhanced unhandled promise rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);

  // Log to monitoring service in production
  if (process.env.NODE_ENV === 'production') {
    // Send to monitoring service (Sentry, etc.)
    console.error('Unhandled promise rejection in production:', reason);
  } else {
    process.exit(1);
  }
});

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);

  // Always exit on uncaught exceptions
  process.exit(1);
});

export default app;