// Optional service-specific middleware
export const serviceAccessMiddleware = (allowedServices = []) => {
    return (req, res, next) => {
        const user = req.user;

        if (!user.enabledServices || !Array.isArray(user.enabledServices)) {
            return res.status(403).json({
                success: false,
                message: 'No services enabled for this account'
            });
        }

        const hasAccess = allowedServices.some(service =>
            user.enabledServices.includes(service)
        );

        if (!hasAccess) {
            return res.status(403).json({
                success: false,
                message: 'Access denied for this service'
            });
        }

        next();
    };
};