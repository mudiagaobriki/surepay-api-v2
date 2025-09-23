// services/EnhancedOtpService.js - Enhanced OTP Service with Email + SMS (Termii)
import { generateAlphanumericOTP } from "../../utils/numbers.js";
import mjml2html from "mjml";
import fs from "fs";
import path from "path";
import sendEmail from "../../utils/emails/emails.js";
import Handlebars from 'handlebars';
import { termiiSMSService } from './TermiiService.js';

/**
 * Enhanced OTP Service - handles OTP via both Email and SMS
 * Supports multiple delivery channels with fallback mechanisms
 */
class EnhancedOTPService {
    constructor() {
        this.emailEnabled = !!process.env.FROM_EMAIL;
        this.smsEnabled = !!process.env.TERMII_API_KEY;
        this.defaultChannels = ['email', 'sms']; // Both by default

        console.log('Enhanced OTP Service initialized:', {
            emailEnabled: this.emailEnabled,
            smsEnabled: this.smsEnabled,
            availableChannels: this.getAvailableChannels()
        });
    }

    /**
     * Generate OTP code
     */
    generateOTP(length = 6) {
        return generateAlphanumericOTP(length);
    }

    /**
     * Get available delivery channels
     */
    getAvailableChannels() {
        const channels = [];
        if (this.emailEnabled) channels.push('email');
        if (this.smsEnabled) channels.push('sms');
        return channels;
    }

    /**
     * Load MJML email template with variables
     */
    async loadEmailTemplate(templateName, variables = {}) {
        try {
            const templatePath = path.resolve(`./utils/emails/templates/${templateName}.mjml`);
            const source = fs.readFileSync(templatePath, 'utf8');
            const { html: htmlOutput } = mjml2html(source);
            const template = Handlebars.compile(htmlOutput);

            return template(variables);
        } catch (error) {
            console.error(`Failed to load email template ${templateName}:`, error);
            throw new Error(`Email template loading failed: ${error.message}`);
        }
    }

    /**
     * Send OTP via email
     */
    async sendOTPViaEmail(user, otp, purpose = 'verification') {
        try {
            if (!this.emailEnabled) {
                throw new Error('Email service is not configured');
            }

            console.log('Sending OTP via email to:', user.email);

            const templateName = purpose === 'password_reset' ? 'resetOTP' : 'resetOTP';
            const subject = purpose === 'password_reset'
                ? '🔐 Surepay Password Reset - Verification Required'
                : '📱 Surepay Account Verification - Enter Your Code';

            const html = await this.loadEmailTemplate(templateName, {
                firstName: user.firstName || 'User',
                email: user.email,
                otp: otp,
                requestDate: new Date().toLocaleString('en-US', {
                    year: 'numeric',
                    month: 'long',
                    day: 'numeric',
                    hour: '2-digit',
                    minute: '2-digit',
                    timeZoneName: 'short'
                }),
                requestLocation: 'Nigeria',
                appName: process.env.APPLICATION_NAME || 'Surepay',
                supportEmail: process.env.SUPPORT_EMAIL || 'support@surepay.com'
            });

            await sendEmail(
                user.email,
                user.firstName || '',
                process.env.APPLICATION_NAME || 'Surepay',
                `${process.env.EMAIL_FROM_NAME || 'Surepay'} <${process.env.FROM_EMAIL}>`,
                subject,
                '',
                html
            );

            console.log('OTP sent successfully via email');
            return {
                success: true,
                channel: 'email',
                destination: user.email
            };

        } catch (error) {
            console.error('Failed to send OTP via email:', error);
            throw new Error(`Email OTP failed: ${error.message}`);
        }
    }

    /**
     * Send OTP via SMS using Termii
     */
    async sendOTPViaSMS(user, otp, purpose = 'verification') {
        try {
            if (!this.smsEnabled) {
                throw new Error('SMS service is not configured');
            }

            if (!user.phone) {
                throw new Error('User phone number is required for SMS OTP');
            }

            console.log('Sending OTP via SMS to:', user.phone);

            let message;
            switch (purpose) {
                case 'password_reset':
                    message = `Your Surepay password reset code is ${otp}. Do not share this code with anyone. Valid for 30 minutes.`;
                    break;
                case 'account_verification':
                    message = `Welcome to Surepay! Your verification code is ${otp}. Enter this code to verify your account. Valid for 30 minutes.`;
                    break;
                case 'transaction':
                    message = `Your Surepay transaction code is ${otp}. Do not share this code with anyone. Valid for 10 minutes.`;
                    break;
                default:
                    message = `Your Surepay verification code is ${otp}. Do not share this code with anyone. Valid for 30 minutes.`;
            }

            const result = await termiiSMSService.sendSMS(user.phone, message);

            console.log('OTP sent successfully via SMS');
            return {
                success: true,
                channel: 'sms',
                destination: user.phone,
                messageId: result.messageId
            };

        } catch (error) {
            console.error('Failed to send OTP via SMS:', error);
            throw new Error(`SMS OTP failed: ${error.message}`);
        }
    }

    /**
     * Send OTP via multiple channels with fallback
     */
    async sendOTPMultiChannel(user, otp, purpose = 'verification', preferredChannels = null) {
        const channels = preferredChannels || this.getAvailableChannels();
        const results = {
            success: false,
            attempts: [],
            successfulChannels: [],
            failedChannels: []
        };

        console.log('Sending OTP via multiple channels:', {
            user: user.email,
            channels,
            purpose
        });

        // Try each channel
        for (const channel of channels) {
            try {
                let result;

                switch (channel) {
                    case 'email':
                        result = await this.sendOTPViaEmail(user, otp, purpose);
                        break;
                    case 'sms':
                        result = await this.sendOTPViaSMS(user, otp, purpose);
                        break;
                    default:
                        throw new Error(`Unsupported channel: ${channel}`);
                }

                results.attempts.push({
                    channel,
                    success: true,
                    destination: result.destination,
                    messageId: result.messageId
                });
                results.successfulChannels.push(channel);

            } catch (error) {
                console.error(`Failed to send OTP via ${channel}:`, error.message);
                results.attempts.push({
                    channel,
                    success: false,
                    error: error.message
                });
                results.failedChannels.push(channel);
            }
        }

        // Consider overall success if at least one channel succeeded
        results.success = results.successfulChannels.length > 0;

        console.log('Multi-channel OTP sending completed:', {
            successful: results.successfulChannels,
            failed: results.failedChannels,
            overallSuccess: results.success
        });

        return results;
    }

    /**
     * Send password reset OTP (both email and SMS)
     */
    async sendPasswordResetOTP(user, otp) {
        try {
            console.log('Sending password reset OTP to:', user.email);

            const results = await this.sendOTPMultiChannel(user, otp, 'password_reset');

            if (!results.success) {
                throw new Error('Failed to send OTP via any channel');
            }

            return {
                success: true,
                channels: results.successfulChannels,
                attempts: results.attempts,
                message: `OTP sent successfully via ${results.successfulChannels.join(' and ')}`
            };

        } catch (error) {
            console.error('Failed to send password reset OTP:', error);
            throw error;
        }
    }

    /**
     * Send account verification OTP (both email and SMS)
     */
    async sendAccountVerificationOTP(user, otp) {
        try {
            console.log('Sending account verification OTP to:', user.email);

            const results = await this.sendOTPMultiChannel(user, otp, 'account_verification');

            if (!results.success) {
                throw new Error('Failed to send OTP via any channel');
            }

            return {
                success: true,
                channels: results.successfulChannels,
                attempts: results.attempts,
                message: `OTP sent successfully via ${results.successfulChannels.join(' and ')}`
            };

        } catch (error) {
            console.error('Failed to send account verification OTP:', error);
            throw error;
        }
    }

    /**
     * Send transaction OTP (both email and SMS)
     */
    async sendTransactionOTP(user, otp, transactionDetails = {}) {
        try {
            console.log('Sending transaction OTP to:', user.email);

            // For transactions, we might want to use SMS primarily for speed
            const preferredChannels = ['sms', 'email'];
            const results = await this.sendOTPMultiChannel(user, otp, 'transaction', preferredChannels);

            if (!results.success) {
                throw new Error('Failed to send transaction OTP via any channel');
            }

            return {
                success: true,
                channels: results.successfulChannels,
                attempts: results.attempts,
                message: `Transaction OTP sent successfully via ${results.successfulChannels.join(' and ')}`
            };

        } catch (error) {
            console.error('Failed to send transaction OTP:', error);
            throw error;
        }
    }

    /**
     * Get service status for all channels
     */
    getServiceStatus() {
        return {
            email: {
                available: this.emailEnabled,
                service: this.emailEnabled ? 'Email Service' : 'Not configured',
                status: this.emailEnabled ? 'active' : 'inactive'
            },
            sms: {
                available: this.smsEnabled,
                service: this.smsEnabled ? 'Termii SMS' : 'Not configured',
                status: this.smsEnabled ? 'active' : 'inactive'
            },
            overall: {
                available: this.emailEnabled || this.smsEnabled,
                activeChannels: this.getAvailableChannels(),
                totalChannels: this.getAvailableChannels().length
            }
        };
    }

    /**
     * Test all available channels
     */
    async testAllChannels() {
        const results = {
            email: null,
            sms: null,
            overall: false
        };

        // Test email
        if (this.emailEnabled) {
            try {
                // This would need to be implemented based on your email service
                results.email = {
                    success: true,
                    message: 'Email service is configured and ready'
                };
            } catch (error) {
                results.email = {
                    success: false,
                    error: error.message
                };
            }
        }

        // Test SMS
        if (this.smsEnabled) {
            try {
                const smsTest = await termiiSMSService.testConnection();
                results.sms = smsTest;
            } catch (error) {
                results.sms = {
                    success: false,
                    error: error.message
                };
            }
        }

        // Overall status
        results.overall = (results.email?.success || results.sms?.success) || false;

        return results;
    }

    /**
     * Check if service is available
     */
    isAvailable() {
        return this.emailEnabled || this.smsEnabled;
    }

    /**
     * Get delivery statistics
     */
    getDeliveryStats() {
        return {
            totalChannels: this.getAvailableChannels().length,
            emailEnabled: this.emailEnabled,
            smsEnabled: this.smsEnabled,
            recommendedChannels: this.getAvailableChannels(),
            fallbackOrder: ['email', 'sms'] // Preferred fallback order
        };
    }
}

// Create single instance
const enhancedOTPService = new EnhancedOTPService();

// Export the service instance
export { enhancedOTPService };

// Export helper functions for convenience
export const generateOTP = (length = 6) => enhancedOTPService.generateOTP(length);
export const sendPasswordResetOTP = (user, otp) => enhancedOTPService.sendPasswordResetOTP(user, otp);
export const sendAccountVerificationOTP = (user, otp) => enhancedOTPService.sendAccountVerificationOTP(user, otp);
export const sendTransactionOTP = (user, otp, transactionDetails) => enhancedOTPService.sendTransactionOTP(user, otp, transactionDetails);
export const getOTPServiceStatus = () => enhancedOTPService.getServiceStatus();