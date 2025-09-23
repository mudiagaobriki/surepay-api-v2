import twilio from 'twilio';

class TwilioService {
    constructor() {
        this.client = null;
        this.init();
    }

    init() {
        try {
            const accountSid = process.env.TWILIO_ACCOUNT_SID;
            const authToken = process.env.TWILIO_AUTH_TOKEN;

            if (!accountSid || !authToken) {
                console.error('Twilio credentials not found in environment variables');
                return;
            }

            this.client = twilio(accountSid, authToken);
            console.log('Twilio service initialized successfully');
        } catch (error) {
            console.error('Failed to initialize Twilio service:', error);
        }
    }

    /**
     * Send SMS using Twilio
     * @param {string} to - Phone number to send SMS to (in E.164 format)
     * @param {string} message - Message content
     * @returns {Promise<Object>} - Twilio response
     */
    async sendSMS(to, message) {
        if (!this.client) {
            throw new Error('Twilio client not initialized');
        }

        try {
            // Ensure phone number is in E.164 format
            const formattedPhone = this.formatPhoneNumber(to);

            const response = await this.client.messages.create({
                body: message,
                from: process.env.TWILIO_PHONE_NUMBER, // Your Twilio phone number
                to: formattedPhone,
            });

            console.log('SMS sent successfully:', {
                sid: response.sid,
                to: formattedPhone,
                status: response.status
            });

            return {
                success: true,
                messageId: response.sid,
                status: response.status,
                to: formattedPhone
            };
        } catch (error) {
            console.error('Failed to send SMS:', error);
            throw new Error(`SMS delivery failed: ${error.message}`);
        }
    }

    /**
     * Send OTP via SMS
     * @param {string} phoneNumber - Phone number to send OTP to
     * @param {string} otp - OTP code
     * @param {string} appName - Name of the application
     * @returns {Promise<Object>} - Response object
     */
    async sendOTPSMS(phoneNumber, otp, appName = 'Hovapay') {
        const message = `Your ${appName} verification code is: ${otp}. This code will expire in 30 minutes. Do not share this code with anyone for security reasons.`;

        try {
            const result = await this.sendSMS(phoneNumber, message);
            return result;
        } catch (error) {
            console.error('Failed to send OTP SMS:', error);
            throw error;
        }
    }

    /**
     * Send password reset OTP via SMS
     * @param {string} phoneNumber - Phone number to send OTP to
     * @param {string} otp - OTP code
     * @param {string} appName - Name of the application
     * @returns {Promise<Object>} - Response object
     */
    async sendPasswordResetOTPSMS(phoneNumber, otp, appName = 'Hovapay') {
        const message = `${appName} Security Alert: Your password reset verification code is ${otp}. Valid for 30 minutes. If you didn't request this, please contact support immediately.`;

        try {
            const result = await this.sendSMS(phoneNumber, message);
            return result;
        } catch (error) {
            console.error('Failed to send password reset OTP SMS:', error);
            throw error;
        }
    }

    /**
     * Send account verification OTP via SMS
     * @param {string} phoneNumber - Phone number to send OTP to
     * @param {string} otp - OTP code
     * @param {string} appName - Name of the application
     * @returns {Promise<Object>} - Response object
     */
    async sendAccountVerificationOTPSMS(phoneNumber, otp, appName = 'Hovapay') {
        const message = `Welcome to ${appName}! Your phone verification code is: ${otp}. Enter this code to complete your account setup. Valid for 30 minutes.`;

        try {
            const result = await this.sendSMS(phoneNumber, message);
            return result;
        } catch (error) {
            console.error('Failed to send account verification OTP SMS:', error);
            throw error;
        }
    }

    /**
     * Send security alert SMS
     * @param {string} phoneNumber - Phone number to send alert to
     * @param {string} alertMessage - Alert message
     * @param {string} appName - Name of the application
     * @returns {Promise<Object>} - Response object
     */
    async sendSecurityAlertSMS(phoneNumber, alertMessage, appName = 'Hovapay') {
        const message = `${appName} Security Alert: ${alertMessage}. If this wasn't you, please secure your account immediately.`;

        try {
            const result = await this.sendSMS(phoneNumber, message);
            return result;
        } catch (error) {
            console.error('Failed to send security alert SMS:', error);
            throw error;
        }
    }

    /**
     * Format phone number to E.164 format for Nigerian numbers
     * @param {string} phoneNumber - Phone number to format
     * @returns {string} - Formatted phone number
     */
    formatPhoneNumber(phoneNumber) {
        // Remove all non-numeric characters
        let cleanNumber = phoneNumber.replace(/\D/g, '');

        // Handle Nigerian phone numbers
        if (cleanNumber.startsWith('0')) {
            // Remove leading 0 and add +234
            cleanNumber = '+234' + cleanNumber.substring(1);
        } else if (cleanNumber.startsWith('234')) {
            // Add + if missing
            cleanNumber = '+' + cleanNumber;
        } else if (!cleanNumber.startsWith('+')) {
            // Assume it's a Nigerian number without country code
            cleanNumber = '+234' + cleanNumber;
        }

        return cleanNumber;
    }

    /**
     * Validate phone number format
     * @param {string} phoneNumber - Phone number to validate
     * @returns {boolean} - True if valid, false otherwise
     */
    validatePhoneNumber(phoneNumber) {
        // Basic validation for Nigerian phone numbers
        const cleanNumber = phoneNumber.replace(/\D/g, '');

        // Check if it's a valid Nigerian number format
        if (cleanNumber.length === 11 && cleanNumber.startsWith('0')) {
            return true;
        }
        if (cleanNumber.length === 10 && !cleanNumber.startsWith('0')) {
            return true;
        }
        if (cleanNumber.length === 13 && cleanNumber.startsWith('234')) {
            return true;
        }
        if (cleanNumber.length === 14 && cleanNumber.startsWith('+234')) {
            return true;
        }

        return false;
    }

    /**
     * Get message delivery status
     * @param {string} messageId - Twilio message SID
     * @returns {Promise<Object>} - Message status
     */
    async getMessageStatus(messageId) {
        if (!this.client) {
            throw new Error('Twilio client not initialized');
        }

        try {
            const message = await this.client.messages(messageId).fetch();
            return {
                messageId: message.sid,
                status: message.status,
                errorCode: message.errorCode,
                errorMessage: message.errorMessage,
                dateCreated: message.dateCreated,
                dateSent: message.dateSent,
                dateUpdated: message.dateUpdated
            };
        } catch (error) {
            console.error('Failed to fetch message status:', error);
            throw new Error(`Failed to get message status: ${error.message}`);
        }
    }

    /**
     * Check if Twilio service is available
     * @returns {boolean} - True if available, false otherwise
     */
    isAvailable() {
        return this.client !== null;
    }

    /**
     * Test Twilio connection
     * @returns {Promise<boolean>} - True if connection is successful
     */
    async testConnection() {
        if (!this.client) {
            return false;
        }

        try {
            await this.client.api.accounts(process.env.TWILIO_ACCOUNT_SID).fetch();
            return true;
        } catch (error) {
            console.error('Twilio connection test failed:', error);
            return false;
        }
    }
}

// Create singleton instance
const twilioService = new TwilioService();

export default twilioService;