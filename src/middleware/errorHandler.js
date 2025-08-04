export const errorHandler = (err, req, res, next) => {
    console.error('Global Error Handler:', {
        error: err.message,
        stack: err.stack,
        url: req.originalUrl,
        method: req.method,
        userId: req.user?.id,
        timestamp: new Date().toISOString()
    });

    // Handle specific error types
    if (err.name === 'ValidationError') {
        return res.status(400).json({
            success: false,
            message: 'Validation failed',
            errors: Object.values(err.errors).map(e => e.message)
        });
    }

    if (err.name === 'UnauthorizedError') {
        return res.status(401).json({
            success: false,
            message: 'Authentication required'
        });
    }

    if (err.code === 11000) {
        return res.status(409).json({
            success: false,
            message: 'Duplicate entry'
        });
    }

    if (err.status === 429) {
        return res.status(429).json({
            success: false,
            message: 'Too many requests',
            retryAfter: err.retryAfter
        });
    }

    // Default error response
    res.status(err.status || 500).json({
        success: false,
        message: err.message || 'Internal server error',
        ...(process.env.NODE_ENV === 'development' && { stack: err.stack })
    });
};