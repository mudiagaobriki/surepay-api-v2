import VTPassService from '../services/VTPassService.js';
import SportsBettingService from '../services/SportsBettingService.js';
import FlightBookingService from '../services/FlightBookingService.js';
import InternationalAirtimeService from '../services/InternationalAirtimeService.js';

export const healthCheckMiddleware = async (req, res) => {
    const healthChecks = {
        database: { status: 'checking' },
        vtpass: { status: 'checking' },
        sportsBetting: { status: 'checking' },
        flightBooking: { status: 'checking' },
        internationalAirtime: { status: 'checking' }
    };

    try {
        // Database check (assuming mongoose)
        const mongoose = await import('mongoose');
        healthChecks.database = {
            status: mongoose.connection.readyState === 1 ? 'healthy' : 'unhealthy',
            readyState: mongoose.connection.readyState
        };
    } catch (error) {
        healthChecks.database = {
            status: 'unhealthy',
            error: error.message
        };
    }

    // VTPass service check
    try {
        const vtpassHealth = await VTPassService.testConnection();
        healthChecks.vtpass = {
            status: vtpassHealth.success ? 'healthy' : 'unhealthy',
            ...vtpassHealth
        };
    } catch (error) {
        healthChecks.vtpass = {
            status: 'unhealthy',
            error: error.message
        };
    }

    // Sports betting service check
    try {
        const sportsHealth = await SportsBettingService.testConnection();
        healthChecks.sportsBetting = {
            status: sportsHealth.success ? 'healthy' : 'unhealthy',
            ...sportsHealth
        };
    } catch (error) {
        healthChecks.sportsBetting = {
            status: 'unhealthy',
            error: error.message
        };
    }

    // Flight booking service check
    try {
        const flightHealth = await FlightBookingService.testConnection();
        healthChecks.flightBooking = {
            status: flightHealth.success ? 'healthy' : 'unhealthy',
            ...flightHealth
        };
    } catch (error) {
        healthChecks.flightBooking = {
            status: 'unhealthy',
            error: error.message
        };
    }

    // International airtime service check
    try {
        const airtimeHealth = await InternationalAirtimeService.testConnection();
        healthChecks.internationalAirtime = {
            status: airtimeHealth.success ? 'healthy' : 'unhealthy',
            ...airtimeHealth
        };
    } catch (error) {
        healthChecks.internationalAirtime = {
            status: 'unhealthy',
            error: error.message
        };
    }

    // Calculate overall health
    const healthyServices = Object.values(healthChecks).filter(
        service => service.status === 'healthy'
    ).length;

    const totalServices = Object.keys(healthChecks).length;
    const overallHealth = healthyServices === totalServices ? 'healthy' :
        healthyServices > 0 ? 'degraded' : 'unhealthy';

    const responseStatus = overallHealth === 'healthy' ? 200 :
        overallHealth === 'degraded' ? 206 : 503;

    res.status(responseStatus).json({
        status: overallHealth,
        services: healthChecks,
        summary: {
            healthy: healthyServices,
            total: totalServices,
            percentage: Math.round((healthyServices / totalServices) * 100)
        },
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        memory: process.memoryUsage(),
        environment: process.env.NODE_ENV || 'development'
    });
};