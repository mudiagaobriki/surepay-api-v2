import SystemSetting from "../models/SystemSetting.js";

const getSettings = async (req, res) => {
    try {
        const settings = await SystemSetting.find({});

        // Group by 'group' field for frontend consumption
        const groupedSettings = settings.reduce((acc, setting) => {
            if (!acc[setting.group]) {
                acc[setting.group] = [];
            }
            acc[setting.group].push(setting);
            return acc;
        }, {});

        // Ensure all groups exist even if empty
        const groups = ['general', 'finance', 'limits', 'security', 'notifications'];
        groups.forEach(group => {
            if (!groupedSettings[group]) {
                groupedSettings[group] = [];
            }
        });

        res.status(200).json({
            status: 'success',
            data: groupedSettings
        });
    } catch (error) {
        console.error('Get settings error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to fetch settings'
        });
    }
};

const updateSetting = async (req, res) => {
    try {
        const { key } = req.params;
        const { value } = req.body;

        const setting = await SystemSetting.findOneAndUpdate(
            { key },
            { value, updatedBy: req.user?.userId },
            { new: true }
        );

        if (!setting) {
            return res.status(404).json({
                status: 'error',
                message: 'Setting not found'
            });
        }

        res.status(200).json({
            status: 'success',
            data: setting,
            message: 'Setting updated successfully'
        });
    } catch (error) {
        console.error('Update setting error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to update setting'
        });
    }
};

const seedSettings = async (req, res) => {
    try {
        // Clear existing settings
        await SystemSetting.deleteMany({});

        const defaultSettings = [
            // General
            { key: 'site_name', value: 'Surepay', type: 'string', description: 'Application Name', group: 'general', isPublic: true },
            { key: 'support_email', value: 'support@surepay.com', type: 'string', description: 'Support Email Address', group: 'general', isPublic: true },
            { key: 'maintenance_mode', value: false, type: 'boolean', description: 'Enable Maintenance Mode', group: 'general' },

            // Finance
            { key: 'currency_code', value: 'NGN', type: 'string', description: 'Default Currency', group: 'finance', isPublic: true },
            { key: 'transaction_fee_flat', value: 50, type: 'number', description: 'Flat Transaction Fee', group: 'finance' },
            { key: 'transaction_fee_percent', value: 1.5, type: 'number', description: 'Percentage Transaction Fee', group: 'finance' },

            // Limits
            { key: 'min_transaction_amount', value: 100, type: 'number', description: 'Minimum Transaction Amount', group: 'limits' },
            { key: 'max_transaction_amount', value: 1000000, type: 'number', description: 'Maximum Transaction Amount', group: 'limits' },
            { key: 'daily_limit_tier_1', value: 50000, type: 'number', description: 'Daily Limit (Tier 1)', group: 'limits' },

            // Security
            { key: 'max_login_attempts', value: 5, type: 'number', description: 'Max Login Attempts before Lockout', group: 'security' },
            { key: 'session_timeout_mins', value: 30, type: 'number', description: 'Session Timeout (Minutes)', group: 'security' },
            { key: 'require_2fa_admin', value: true, type: 'boolean', description: 'Require 2FA for Admins', group: 'security' },

            // Notifications
            { key: 'enable_email_alerts', value: true, type: 'boolean', description: 'Enable System Email Alerts', group: 'notifications' }
        ];

        await SystemSetting.insertMany(defaultSettings);

        res.status(200).json({
            status: 'success',
            message: 'Default settings seeded successfully'
        });
    } catch (error) {
        console.error('Seed settings error:', error);
        res.status(500).json({
            status: 'error',
            message: 'Failed to seed settings'
        });
    }
};

export default {
    getSettings,
    updateSetting,
    seedSettings
};
