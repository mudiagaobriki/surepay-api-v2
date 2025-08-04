// utils/serviceManager.js - Utility for managing VTPass services
import VTPassService from '../services/VTPassService.js';
import cron from 'node-cron';

class ServiceManager {
    constructor() {
        this.isAutoRefreshEnabled = process.env.AUTO_REFRESH_SERVICES === 'true';
        this.refreshInterval = process.env.SERVICE_REFRESH_INTERVAL || '0 2 * * *'; // Daily at 2 AM

        if (this.isAutoRefreshEnabled) {
            this.startAutoRefresh();
        }
    }

    /**
     * Start automatic service refresh using cron
     */
    startAutoRefresh() {
        console.log('Starting automatic service refresh...');
        console.log(`Refresh interval: ${this.refreshInterval}`);

        cron.schedule(this.refreshInterval, async () => {
            try {
                console.log('Auto-refreshing VTPass services...');
                await this.refreshAllServices();
                console.log('Auto-refresh completed successfully');
            } catch (error) {
                console.error('Auto-refresh failed:', error);
            }
        });
    }

    /**
     * Manually refresh all services
     */
    async refreshAllServices() {
        try {
            console.log('Refreshing all VTPass services...');

            const startTime = Date.now();
            const categories = await VTPassService.refreshServices();
            const endTime = Date.now();

            const cacheInfo = VTPassService.getCacheInfo();

            const refreshStats = {
                duration: endTime - startTime,
                timestamp: new Date().toISOString(),
                categoriesCount: cacheInfo.categoriesCount,
                servicesCount: cacheInfo.servicesCount,
                success: true
            };

            console.log('Service refresh completed:', refreshStats);
            return refreshStats;

        } catch (error) {
            console.error('Service refresh failed:', error);
            throw error;
        }
    }

    /**
     * Check service health
     */
    async checkServiceHealth() {
        try {
            console.log('Checking VTPass service health...');

            const healthCheck = {
                timestamp: new Date().toISOString(),
                vtpassConnection: await VTPassService.testConnection(),
                cacheInfo: VTPassService.getCacheInfo(),
                autoRefreshEnabled: this.isAutoRefreshEnabled
            };

            // Test a few critical services
            const criticalServices = ['mtn', 'dstv', 'ikeja-electric'];
            const serviceTests = {};

            for (const serviceId of criticalServices) {
                try {
                    const variations = await VTPassService.getVariations(serviceId);
                    serviceTests[serviceId] = {
                        available: variations.response_description === '000',
                        hasVariations: variations.content?.variations?.length > 0
                    };
                } catch (error) {
                    serviceTests[serviceId] = {
                        available: false,
                        error: error.message
                    };
                }
            }

            healthCheck.serviceTests = serviceTests;
            healthCheck.overallHealth = Object.values(serviceTests).every(test => test.available) ? 'healthy' : 'degraded';

            console.log('Service health check completed:', healthCheck.overallHealth);
            return healthCheck;

        } catch (error) {
            console.error('Service health check failed:', error);
            return {
                timestamp: new Date().toISOString(),
                overallHealth: 'unhealthy',
                error: error.message
            };
        }
    }

    /**
     * Get service statistics
     */
    async getServiceStats() {
        try {
            const cacheInfo = VTPassService.getCacheInfo();

            // Get breakdown by category if cache exists
            let categoryBreakdown = {};
            if (cacheInfo.hasCache) {
                const categories = await VTPassService.getServiceCategories();

                for (const category of categories.content) {
                    const services = await VTPassService.getServices(category.identifier);
                    categoryBreakdown[category.identifier] = {
                        name: category.name,
                        count: services.content.length,
                        services: services.content.map(service => ({
                            serviceID: service.serviceID,
                            name: service.name,
                            hasVariations: service.hasVariations
                        }))
                    };
                }
            }

            return {
                cache: cacheInfo,
                categories: categoryBreakdown,
                summary: {
                    totalCategories: Object.keys(categoryBreakdown).length,
                    totalServices: Object.values(categoryBreakdown).reduce((sum, cat) => sum + cat.count, 0),
                    lastUpdated: cacheInfo.lastUpdated
                }
            };

        } catch (error) {
            console.error('Error getting service stats:', error);
            throw error;
        }
    }

    /**
     * Monitor service changes
     */
    async monitorServiceChanges() {
        try {
            console.log('Monitoring VTPass service changes...');

            const currentStats = await this.getServiceStats();

            // Store current state for comparison (in production, use database)
            const previousStats = this.previousStats || null;
            this.previousStats = currentStats;

            if (!previousStats) {
                console.log('No previous stats for comparison');
                return { firstRun: true, currentStats };
            }

            // Compare with previous stats
            const changes = {
                timestamp: new Date().toISOString(),
                categoriesAdded: [],
                categoriesRemoved: [],
                servicesAdded: [],
                servicesRemoved: [],
                servicesModified: []
            };

            // Check for category changes
            const currentCategories = Object.keys(currentStats.categories);
            const previousCategories = Object.keys(previousStats.categories);

            changes.categoriesAdded = currentCategories.filter(cat => !previousCategories.includes(cat));
            changes.categoriesRemoved = previousCategories.filter(cat => !currentCategories.includes(cat));

            // Check for service changes within categories
            for (const categoryId of currentCategories) {
                if (previousStats.categories[categoryId]) {
                    const currentServices = currentStats.categories[categoryId].services.map(s => s.serviceID);
                    const previousServices = previousStats.categories[categoryId].services.map(s => s.serviceID);

                    const added = currentServices.filter(s => !previousServices.includes(s));
                    const removed = previousServices.filter(s => !currentServices.includes(s));

                    if (added.length > 0) {
                        changes.servicesAdded.push({ category: categoryId, services: added });
                    }

                    if (removed.length > 0) {
                        changes.servicesRemoved.push({ category: categoryId, services: removed });
                    }
                }
            }

            const hasChanges = changes.categoriesAdded.length > 0 ||
                changes.categoriesRemoved.length > 0 ||
                changes.servicesAdded.length > 0 ||
                changes.servicesRemoved.length > 0;

            if (hasChanges) {
                console.log('VTPass service changes detected:', changes);
            } else {
                console.log('No VTPass service changes detected');
            }

            return { hasChanges, changes, currentStats };

        } catch (error) {
            console.error('Error monitoring service changes:', error);
            throw error;
        }
    }

    /**
     * Generate service report
     */
    async generateServiceReport() {
        try {
            console.log('Generating VTPass service report...');

            const [stats, health] = await Promise.all([
                this.getServiceStats(),
                this.checkServiceHealth()
            ]);

            const report = {
                generatedAt: new Date().toISOString(),
                summary: stats.summary,
                health: health,
                categories: stats.categories,
                recommendations: []
            };

            // Add recommendations based on findings
            if (health.overallHealth !== 'healthy') {
                report.recommendations.push('Some services are experiencing issues. Check VTPass API status.');
            }

            if (!stats.cache.isValid) {
                report.recommendations.push('Service cache is stale. Consider refreshing services.');
            }

            if (stats.summary.totalServices < 20) {
                report.recommendations.push('Low number of services detected. Verify VTPass API connectivity.');
            }

            console.log('Service report generated successfully');
            return report;

        } catch (error) {
            console.error('Error generating service report:', error);
            throw error;
        }
    }
}

// Export singleton instance
const serviceManager = new ServiceManager();
export default serviceManager;

// Export individual functions for direct use
export const {
    refreshAllServices,
    checkServiceHealth,
    getServiceStats,
    monitorServiceChanges,
    generateServiceReport
} = serviceManager;