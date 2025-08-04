// services/TermiiSMSService.js - Fixed with Sender ID solutions
import axios from 'axios';
import { generateAlphanumericOTP } from "../../utils/numbers.js";

/**
 * Termii SMS Service for sending OTP codes
 * Documentation: https://developers.termii.com/
 */
class TermiiSMSService {
    constructor() {
        this.baseURL = 'https://api.ng.termii.com/api';
        this.apiKey = process.env.TERMII_API_KEY;
        this.secretKey = process.env.TERMII_SECRET_KEY;
        this.senderId = process.env.TERMII_SENDER_ID || 'N-Alert'; // Use generic sender ID as fallback
        this.channel = process.env.TERMII_CHANNEL || 'generic'; // Use generic channel for unregistered sender IDs
        this.type = process.env.TERMII_TYPE || 'plain';

        // Validate configuration
        if (!this.apiKey) {
            console.error('TERMII_API_KEY is not set in environment variables');
        }
        if (!this.secretKey) {
            console.error('TERMII_SECRET_KEY is not set in environment variables');
        }

        console.log('Termii SMS Service initialized:', {
            hasApiKey: !!this.apiKey,
            hasSecretKey: !!this.secretKey,
            senderId: this.senderId,
            channel: this.channel,
            note: this.senderId === 'N-Alert' ? 'Using generic sender ID' : 'Using custom sender ID'
        });
    }

    /**
     * Generate OTP code
     */
    generateOTP(length = 6) {
        return generateAlphanumericOTP(length);
    }

    /**
     * Send SMS using Termii API with fallback sender IDs
     */
    async sendSMS(to, message) {
        // Try different sender ID options in order of preference
        const senderOptions = [
            { senderId: this.senderId, channel: this.channel }, // User's preferred sender
            // { senderId: 'N-Alert', channel: 'generic' },        // Generic Termii sender
            { senderId: 'Ojaway', channel: 'generic' },         // Termii default
            { senderId: '', channel: 'generic' }                // No sender ID
        ];

        for (let i = 0; i < senderOptions.length; i++) {
            const option = senderOptions[i];

            try {
                console.log(`Attempt ${i + 1}: Trying sender "${option.senderId}" with channel "${option.channel}"`);

                const result = await this.sendSMSWithOptions(to, message, option.senderId, option.channel);

                if (result.success) {
                    console.log(`✅ SMS sent successfully with sender: "${option.senderId}"`);
                    return result;
                }
            } catch (error) {
                console.log(`❌ Attempt ${i + 1} failed:`, error.message);

                // If this is the last attempt, throw the error
                if (i === senderOptions.length - 1) {
                    throw error;
                }

                // Continue to next option
                continue;
            }
        }
    }

    /**
     * Send SMS with specific sender ID and channel
     */
    async sendSMSWithOptions(to, message, senderId, channel) {
        try {
            console.log('Sending SMS via Termii:', {
                to,
                message: message.substring(0, 50) + '...',
                senderId,
                channel
            });

            // Format phone number (remove +234 or 0 prefix and add 234)
            const formattedPhone = this.formatPhoneNumber(to);

            const payload = {
                to: formattedPhone,
                sms: message,
                type: this.type,
                channel: channel,
                api_key: this.apiKey,
            };

            // Only add 'from' field if senderId is not empty
            if (senderId && senderId.trim() !== '') {
                payload.from = senderId;
            }
            else{
                payload.from = "Ojaway";
            }

            console.log('Termii API payload:', {
                ...payload,
                api_key: '***' // Hide API key in logs
            });

            const response = await axios.post(`${this.baseURL}/sms/send`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 30000 // 30 seconds timeout
            });

            console.log('Termii SMS response:', response.data);

            if (response.data.code === 'ok' || response.data.code === 200) {
                return {
                    success: true,
                    messageId: response.data.message_id,
                    data: response.data,
                    usedSender: senderId,
                    usedChannel: channel
                };
            } else {
                throw new Error(response.data.message || `SMS sending failed with code: ${response.data.code}`);
            }

        } catch (error) {
            console.error('Termii SMS error:', error.response?.data || error.message);

            // Provide specific error messages for common issues
            let errorMessage = error.response?.data?.message || error.message || 'Failed to send SMS';

            if (errorMessage.includes('ApplicationSenderId not found')) {
                errorMessage = `Sender ID "${senderId}" not registered. Trying alternative sender...`;
            } else if (errorMessage.includes('Insufficient wallet balance')) {
                errorMessage = 'Insufficient Termii account balance. Please top up your account.';
            } else if (errorMessage.includes('Invalid phone number')) {
                errorMessage = `Invalid phone number format: ${to}`;
            }

            throw new Error(errorMessage);
        }
    }

    /**
     * Send OTP SMS using Termii Token API (recommended for OTP)
     */
    async sendOTPToken(to, pinPlaceholder = '< 1234 >', messageText = null) {
        try {
            console.log('Sending OTP token via Termii:', { to });

            const formattedPhone = this.formatPhoneNumber(to);

            const payload = {
                api_key: this.apiKey,
                message_type: 'NUMERIC',
                to: formattedPhone,
                from: this.senderId,
                channel: this.channel,
                pin_attempts: 3,
                pin_time_to_live: 30, // 30 minutes
                pin_length: 6,
                pin_placeholder: pinPlaceholder,
                message_text: messageText || `Your verification code is ${pinPlaceholder}. Do not share this code with anyone. Valid for 30 minutes.`,
                pin_type: 'NUMERIC'
            };

            const response = await axios.post(`${this.baseURL}/sms/otp/send`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 30000
            });

            console.log('Termii OTP token response:', response.data);

            if (response.data.code === 'ok') {
                return {
                    success: true,
                    pinId: response.data.pin_id,
                    to: response.data.to,
                    smsStatus: response.data.sms_status,
                    data: response.data
                };
            } else {
                throw new Error(response.data.message || 'OTP sending failed');
            }

        } catch (error) {
            console.error('Termii OTP token error:', error.response?.data || error.message);

            throw new Error(
                error.response?.data?.message ||
                error.message ||
                'Failed to send OTP token'
            );
        }
    }

    /**
     * Verify OTP token using Termii API
     */
    async verifyOTPToken(pinId, pin) {
        try {
            console.log('Verifying OTP token via Termii:', { pinId, pin });

            const payload = {
                api_key: this.apiKey,
                pin_id: pinId,
                pin: pin
            };

            const response = await axios.post(`${this.baseURL}/sms/otp/verify`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                },
                timeout: 30000
            });

            console.log('Termii OTP verification response:', response.data);

            return {
                success: response.data.verified === true,
                verified: response.data.verified,
                msisdn: response.data.msisdn,
                data: response.data
            };

        } catch (error) {
            console.error('Termii OTP verification error:', error.response?.data || error.message);

            throw new Error(
                error.response?.data?.message ||
                error.message ||
                'Failed to verify OTP'
            );
        }
    }

    /**
     * Send password reset OTP
     */
    async sendPasswordResetOTP(user, otp) {
        try {
            console.log('Sending password reset OTP via SMS to:', user.phone);

            if (!user.phone) {
                throw new Error('User phone number is required for SMS OTP');
            }

            const message = `Your password reset code is ${otp}. Do not share this code with anyone. Valid for 30 minutes. -${this.senderId}`;
            // if ()

            const result = await this.sendSMS(user.phone, message);

            console.log('Password reset OTP sent successfully via SMS');
            return result;

        } catch (error) {
            console.error('Failed to send password reset OTP via SMS:', error);
            throw error;
        }
    }

    /**
     * Send account verification OTP
     */
    async sendAccountVerificationOTP(user, otp) {
        try {
            console.log('Sending account verification OTP via SMS to:', user.phone);

            if (!user.phone) {
                throw new Error('User phone number is required for SMS OTP');
            }

            const message = `Welcome! Your verification code is ${otp}. Enter this code to verify your account. Valid for 30 minutes.`;

            const result = await this.sendSMS(user.phone, message);

            console.log('Account verification OTP sent successfully via SMS');
            return result;

        } catch (error) {
            console.error('Failed to send account verification OTP via SMS:', error);
            throw error;
        }
    }

    /**
     * Send transaction OTP
     */
    async sendTransactionOTP(user, otp, transactionDetails) {
        try {
            console.log('Sending transaction OTP via SMS to:', user.phone);

            if (!user.phone) {
                throw new Error('User phone number is required for SMS OTP');
            }

            const amount = transactionDetails?.amount ? `₦${transactionDetails.amount.toLocaleString()}` : '';
            const service = transactionDetails?.service || 'transaction';

            const message = `Your ${service} OTP is ${otp}. Amount: ${amount}. Do not share this code. Valid for 10 minutes.`;

            const result = await this.sendSMS(user.phone, message);

            console.log('Transaction OTP sent successfully via SMS');
            return result;

        } catch (error) {
            console.error('Failed to send transaction OTP via SMS:', error);
            throw error;
        }
    }

    /**
     * Check SMS delivery status
     */
    async getDeliveryStatus(messageId) {
        try {
            const response = await axios.get(`${this.baseURL}/sms/inbox?api_key=${this.apiKey}&message_id=${messageId}`, {
                timeout: 30000
            });

            return {
                success: true,
                status: response.data.status,
                data: response.data
            };

        } catch (error) {
            console.error('Failed to get delivery status:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get account balance
     */
    async getBalance() {
        try {
            const response = await axios.get(`${this.baseURL}/get-balance?api_key=${this.apiKey}`, {
                timeout: 30000
            });

            console.log('Termii balance response:', response.data);

            return {
                success: true,
                balance: response.data.balance,
                currency: response.data.currency,
                user: response.data.user
            };

        } catch (error) {
            console.error('Failed to get Termii balance:', error.response?.data || error.message);
            throw new Error('Failed to get account balance');
        }
    }

    /**
     * Format phone number for Termii API
     */
    formatPhoneNumber(phone) {
        if (!phone) return '';

        // Remove all non-digit characters
        let formatted = phone.replace(/\D/g, '');

        // Remove leading zeros
        formatted = formatted.replace(/^0+/, '');

        // Remove country code if present
        if (formatted.startsWith('234')) {
            formatted = formatted.substring(3);
        }

        // Add Nigeria country code
        formatted = '234' + formatted;

        console.log('Formatted phone number:', { original: phone, formatted });

        return formatted;
    }

    /**
     * Check if service is available
     */
    isAvailable() {
        return !!this.apiKey;
    }

    /**
     * Test connection to Termii API
     */
    async testConnection() {
        try {
            const balance = await this.getBalance();
            return {
                success: true,
                message: 'Termii connection successful',
                balance: balance.balance,
                currency: balance.currency
            };
        } catch (error) {
            return {
                success: false,
                message: 'Termii connection failed',
                error: error.message
            };
        }
    }

    /**
     * Get registered sender IDs for your account
     */
    async getRegisteredSenderIds() {
        try {
            const response = await axios.get(`${this.baseURL}/sender-id?api_key=${this.apiKey}`, {
                timeout: 30000
            });

            console.log('Registered sender IDs:', response.data);
            return response.data;

        } catch (error) {
            console.error('Failed to get sender IDs:', error.response?.data || error.message);
            return {
                success: false,
                error: error.message
            };
        }
    }
}

// Create single instance
const termiiSMSService = new TermiiSMSService();

// Export the service instance
export { termiiSMSService };

// Export helper functions
export const generateOTP = (length = 6) => termiiSMSService.generateOTP(length);
export const sendSMS = (to, message) => termiiSMSService.sendSMS(to, message);
export const sendOTPToken = (to, pinPlaceholder, messageText) => termiiSMSService.sendOTPToken(to, pinPlaceholder, messageText);
export const verifyOTPToken = (pinId, pin) => termiiSMSService.verifyOTPToken(pinId, pin);