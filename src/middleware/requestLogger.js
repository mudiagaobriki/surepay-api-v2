export const requestLogger = (req, res, next) => {
    const start = Date.now();

    // Log request
    console.log(`📥 ${req.method} ${req.originalUrl}`, {
        ip: req.ip,
        userAgent: req.get('User-Agent'),
        userId: req.user?.id,
        timestamp: new Date().toISOString()
    });

    // Override res.json to log responses
    const originalJson = res.json;
    res.json = function(body) {
        const duration = Date.now() - start;

        console.log(`📤 ${req.method} ${req.originalUrl} - ${res.statusCode}`, {
            duration: `${duration}ms`,
            size: JSON.stringify(body).length,
            success: body.success !== false,
            timestamp: new Date().toISOString()
        });

        return originalJson.call(this, body);
    };

    next();
};