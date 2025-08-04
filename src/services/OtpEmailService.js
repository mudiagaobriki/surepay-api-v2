import {generateAlphanumericOTP} from "../../utils/numbers.js";
import mjml2html from "mjml";
import fs from "fs";
import path from "path";
import sendEmail from "../../utils/emails/emails.js";
import Handlebars from 'handlebars';

/**
 * Simple OTP Email Service - handles OTP emails using existing infrastructure
 */
class OTPEmailService {
    /**
     * Generate OTP code
     */
    generateOTP(length = 6) {
        return generateAlphanumericOTP(length);
    }

    /**
     * Load MJML template with variables
     */
    async loadTemplate(templateName, variables = {}) {
        try {
            const templatePath = path.resolve(`./utils/emails/templates/${templateName}.mjml`);
            const source = fs.readFileSync(templatePath, 'utf8');
            const { html: htmlOutput } = mjml2html(source);
            const template = Handlebars.compile(htmlOutput);

            return template(variables);
        } catch (error) {
            console.error(`Failed to load template ${templateName}:`, error);
            throw new Error(`Template loading failed: ${error.message}`);
        }
    }

    /**
     * Send password reset OTP email
     */
    async sendPasswordResetOTP(user, otp) {
        try {
            console.log('Sending password reset OTP to:', user.email);

            const html = await this.loadTemplate('resetOTP', {
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
                `${process.env.EMAIL_FROM_NAME || 'Surrepay'} <${process.env.FROM_EMAIL}>`,
                '🔐 Surepay Password Reset - Verification Required',
                '',
                html
            );

            console.log('Password reset OTP sent successfully');
            return true;
        } catch (error) {
            console.error('Failed to send password reset OTP:', error);
            throw error;
        }
    }

    /**
     * Send account verification OTP email
     */
    async sendAccountVerificationOTP(user, otp) {
        try {
            console.log('Sending account verification OTP to:', user.email);

            // Use resetOTP template as fallback if accountVerificationOTP doesn't exist
            let templateName = 'resetOTP';

            const html = await this.loadTemplate(templateName, {
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
                appName: process.env.APPLICATION_NAME || 'Surepay',
                supportEmail: process.env.SUPPORT_EMAIL || 'support@surepay.com'
            });

            await sendEmail(
                user.email,
                user.firstName || '',
                process.env.APPLICATION_NAME || 'Surepay',
                `${process.env.EMAIL_FROM_NAME || 'Surepay'} <${process.env.FROM_EMAIL}>`,
                '📱 Surepay Account Verification - Enter Your Code',
                '',
                html
            );

            console.log('Account verification OTP sent successfully');
            return true;
        } catch (error) {
            console.error('Failed to send account verification OTP:', error);
            throw error;
        }
    }

    /**
     * Check if service is available
     */
    isAvailable() {
        return !!process.env.FROM_EMAIL;
    }
}

// Create single instance
const otpEmailService = new OTPEmailService();

// ==================== EXPORT THE SERVICE ====================

// Export the service instance for direct use
export { otpEmailService };

// Export a few simple helper functions for convenience
export const generateOTP = (length = 6) => otpEmailService.generateOTP(length);
