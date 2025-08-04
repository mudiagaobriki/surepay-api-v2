// services/paystackService.js - Updated for better integration
import axios from 'axios';
import crypto from 'crypto';

class PaystackService {
  constructor() {
    this.baseUrl = process.env.PAYSTACK_BASE_URL || 'https://api.paystack.co';
    this.secretKey = process.env.PAYSTACK_SECRET_KEY;
    this.publicKey = process.env.PAYSTACK_PUBLIC_KEY;

    if (!this.secretKey) {
      console.warn('⚠️ PAYSTACK_SECRET_KEY not found in environment variables');
    }
  }

  /**
   * Get request headers with authentication
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${this.secretKey}`,
      'Accept': 'application/json'
    };
  }

  /**
   * Initialize a payment transaction
   * @param {Object} data - Transaction data
   */
  async initializeTransaction(data) {
    try {
      console.log('=== PAYSTACK INITIALIZATION ===');
      console.log('Data received:', {
        email: data.email,
        amount: data.amount,
        reference: data.reference
      });

      const secretKey = process.env.PAYSTACK_SECRET_KEY;
      if (!secretKey) {
        throw new Error('PAYSTACK_SECRET_KEY not configured');
      }

      console.log('Using secret key:', secretKey.substring(0, 10) + '...');

      const payload = {
        email: data.email,
        amount: data.amount, // Should be in kobo
        reference: data.reference,
        callback_url: data.callbackUrl,
        channels: ['card', 'bank', 'ussd', 'qr', 'mobile_money', 'bank_transfer'],
        metadata: {
          ...data.metadata,
          cancel_action: data.redirectUrl || data.callbackUrl
        }
      };

      console.log('Paystack payload:', payload);

      const response = await axios.post(
          'https://api.paystack.co/transaction/initialize',
          payload,
          {
            headers: {
              Authorization: `Bearer ${secretKey}`,
              'Content-Type': 'application/json'
            }
          }
      );

      console.log('Paystack response:', {
        status: response.data.status,
        message: response.data.message,
        hasData: !!response.data.data,
        authUrl: response.data.data?.authorization_url?.substring(0, 50) + '...'
      });

      return response.data;
    } catch (error) {
      console.error('Paystack initialization error:', {
        status: error.response?.status,
        message: error.response?.data?.message,
        data: error.response?.data
      });
      throw error;
    }
  }

  /**
   * Verify a payment transaction
   * @param {string} reference - Transaction reference
   */
  async verifyTransaction(reference) {
    try {
      console.log('=== PAYSTACK VERIFICATION ===');
      console.log('Verifying reference:', reference);

      const secretKey = process.env.PAYSTACK_SECRET_KEY;
      const response = await axios.get(
          `https://api.paystack.co/transaction/verify/${reference}`,
          {
            headers: {
              Authorization: `Bearer ${secretKey}`,
              'Content-Type': 'application/json'
            }
          }
      );

      console.log('Paystack verification response:', {
        status: response.data.status,
        transactionStatus: response.data.data?.status,
        amount: response.data.data?.amount,
        reference: response.data.data?.reference,
        gateway_response: response.data.data?.gateway_response
      });

      return response.data;
    } catch (error) {
      console.error('Paystack verification error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * List banks available for transfers
   */
  async listBanks() {
    try {
      const response = await axios.get(
          `${this.baseUrl}/bank`,
          {
            headers: this.getHeaders(),
            timeout: 30000
          }
      );

      return response.data;
    } catch (error) {
      console.error('Paystack list banks error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Resolve account number to get account name
   * @param {string} accountNumber - Account number
   * @param {string} bankCode - Bank code
   */
  async resolveAccountNumber(accountNumber, bankCode) {
    try {
      const response = await axios.get(
          `${this.baseUrl}/bank/resolve?account_number=${accountNumber}&bank_code=${bankCode}`,
          { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error) {
      console.error('Paystack resolve account error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Create a transfer recipient
   * @param {Object} data - Recipient data
   */
  async createTransferRecipient(data) {
    try {
      const payload = {
        type: "nuban",
        name: data.name,
        account_number: data.accountNumber,
        bank_code: data.bankCode,
        currency: data.currency || "NGN"
      };

      const response = await axios.post(
          `${this.baseUrl}/transferrecipient`,
          payload,
          { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error) {
      console.error('Paystack create recipient error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Initiate a transfer
   * @param {Object} data - Transfer data
   */
  async initiateTransfer(data) {
    try {
      const payload = {
        source: "balance",
        reason: data.reason,
        amount: data.amount * 100, // Convert to kobo
        recipient: data.recipientCode
      };

      const response = await axios.post(
          `${this.baseUrl}/transfer`,
          payload,
          { headers: this.getHeaders() }
      );

      return response.data;
    } catch (error) {
      console.error('Paystack initiate transfer error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   * @param {string} signature - Signature from header
   * @param {Object} payload - Request body
   */
  verifyWebhookSignature(signature, payload) {
    try {
      const hash = crypto
          .createHmac('sha512', this.secretKey)
          .update(JSON.stringify(payload))
          .digest('hex');

      return hash === signature;
    } catch (error) {
      console.error('Paystack webhook verification error:', error);
      return false;
    }
  }
}

export default new PaystackService();