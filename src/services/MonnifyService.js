// services/monnifyService.js - FIXED VERSION with proper verification
import axios from 'axios';
import crypto from 'crypto';

class MonnifyService {
  constructor() {
    this.baseUrl = process.env.MONNIFY_BASE_URL || 'https://sandbox.monnify.com';
    this.apiKey = process.env.MONNIFY_API_KEY;
    this.secretKey = process.env.MONNIFY_SECRET_KEY;
    this.contractCode = process.env.MONNIFY_CONTRACT_CODE;
  }

  /**
   * Get authentication token - Fixed version
   */
  async getAuthToken() {
    try {
      const credentials = `${this.apiKey}:${this.secretKey}`;
      const encodedCredentials = Buffer.from(credentials).toString('base64');

      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/api/v1/auth/login`,
        headers: {
          'Authorization': `Basic ${encodedCredentials}`,
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        timeout: 30000
      });

      if (!response.data.requestSuccessful) {
        throw new Error(`Auth failed: ${response.data.responseMessage}`);
      }

      return response.data.responseBody.accessToken;
    } catch (error) {
      console.error('Monnify auth error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });
      throw new Error(`Monnify authentication failed: ${error.response?.data?.responseMessage || error.message}`);
    }
  }

  /**
   * Get request headers with authentication token
   */
  async getHeaders() {
    const token = await this.getAuthToken();
    return {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
      'Authorization': `Bearer ${token}`
    };
  }

  /**
   * Initialize a payment transaction
   */
  async initializeTransaction(data) {
    try {
      const headers = await this.getHeaders();

      const payload = {
        amount: data.amount, // Amount should be in naira for Monnify
        customerName: data.customerName,
        customerEmail: data.email,
        paymentReference: data.reference,
        paymentDescription: data.description || 'Wallet funding',
        currencyCode: data.currency || 'NGN',
        contractCode: this.contractCode,
        redirectUrl: data.redirectUrl,
        paymentMethods: data.paymentMethods || ["CARD", "ACCOUNT_TRANSFER", "USSD"],
        metadata: data.metadata || {}
      };

      console.log('Monnify initialize payload:', payload);

      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/api/v1/merchant/transactions/init-transaction`,
        headers,
        data: payload,
        timeout: 30000
      });

      console.log('Monnify initialize response:', {
        status: response.status,
        requestSuccessful: response.data.requestSuccessful,
        responseMessage: response.data.responseMessage
      });

      if (!response.data.requestSuccessful) {
        throw new Error(`Transaction init failed: ${response.data.responseMessage}`);
      }

      return {
        success: true,
        authorizationUrl: response.data.responseBody.checkoutUrl,
        reference: response.data.responseBody.paymentReference,
        gatewayResponse: response.data.responseBody
      };
    } catch (error) {
      console.error('Monnify initialize transaction error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Verify a payment transaction - FIXED VERSION
   */
  async verifyTransaction(reference) {
    try {
      console.log('=== MONNIFY VERIFY TRANSACTION ===');
      console.log('Reference:', reference);

      const headers = await this.getHeaders();

      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/api/v1/merchant/transactions/query?paymentReference=${reference}`,
        headers,
        timeout: 30000
      });

      console.log('Monnify verify response:', {
        status: response.status,
        requestSuccessful: response.data.requestSuccessful,
        responseMessage: response.data.responseMessage
      });

      if (!response.data.requestSuccessful) {
        return {
          success: false,
          status: 'failed',
          message: response.data.responseMessage || 'Transaction verification failed',
          reference: reference
        };
      }

      const transaction = response.data.responseBody;
      console.log('Monnify transaction data:', {
        paymentStatus: transaction.paymentStatus,
        amountPaid: transaction.amountPaid,
        paymentReference: transaction.paymentReference,
        paymentMethod: transaction.paymentMethod
      });

      // ⚠️ CRITICAL: Proper status mapping for Monnify
      const isSuccess = transaction.paymentStatus === 'PAID';
      const isPending = transaction.paymentStatus === 'PENDING';
      const isFailed = transaction.paymentStatus === 'FAILED' || transaction.paymentStatus === 'CANCELLED';

      return {
        success: isSuccess,
        status: isSuccess ? 'success' : (isPending ? 'pending' : 'failed'),
        reference: transaction.paymentReference,
        amount: transaction.amountPaid || 0, // Amount is already in naira from Monnify
        channel: transaction.paymentMethod || 'monnify',
        paidAt: transaction.paidOn ? new Date(transaction.paidOn) : null,
        gateway: 'monnify',
        gatewayResponse: transaction,
        message: isSuccess ? 'Payment verified successfully' :
            isPending ? 'Payment is still pending' :
                'Payment failed or was cancelled'
      };
    } catch (error) {
      console.error('Monnify verify transaction error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });

      return {
        success: false,
        status: 'error',
        message: error.response?.data?.responseMessage || error.message || 'Verification failed',
        reference: reference
      };
    }
  }

  /**
   * Create a reserved account for a user - Fixed version
   */
  async reserveAccount(data) {
    try {
      const headers = await this.getHeaders();

      const payload = {
        accountReference: data.reference,
        accountName: data.accountName,
        currencyCode: data.currency || 'NGN',
        contractCode: this.contractCode,
        customerEmail: data.email,
        customerName: data.customerName,
        getAllAvailableBanks: false,
        preferredBanks: ["035", "058", "011"] // Access Bank, GTBank, First Bank
      };

      console.log('Creating virtual account with reference:', data.reference);

      const response = await axios({
        method: 'POST',
        url: `${this.baseUrl}/api/v2/bank-transfer/reserved-accounts`,
        headers,
        data: payload,
        timeout: 60000
      });

      console.log('Monnify virtual account response:', {
        status: response.status,
        requestSuccessful: response.data.requestSuccessful,
        responseMessage: response.data.responseMessage
      });

      if (!response.data.requestSuccessful) {
        throw new Error(`Reserve account failed: ${response.data.responseMessage}`);
      }

      const accountData = response.data.responseBody;

      return {
        success: true,
        reference: accountData.accountReference,
        accounts: accountData.accounts.map(acc => ({
          bankName: acc.bankName,
          accountNumber: acc.accountNumber,
          accountName: acc.accountName,
          bankCode: acc.bankCode
        })),
        accountReference: accountData.accountReference,
        customerEmail: accountData.customerEmail,
        customerName: accountData.customerName,
        status: accountData.status || 'ACTIVE',
        reservationReference: accountData.reservationReference
      };

    } catch (error) {
      console.error('Monnify reserve account error:', {
        status: error.response?.status,
        data: error.response?.data,
        message: error.message
      });

      if (error.response?.status === 401) {
        throw new Error('Invalid Monnify credentials. Please check your API key and secret.');
      } else if (error.response?.status === 400) {
        throw new Error(`Invalid request: ${error.response.data?.responseMessage || 'Bad request'}`);
      } else {
        throw new Error(`Failed to create virtual account: ${error.response?.data?.responseMessage || error.message}`);
      }
    }
  }

  /**
   * Get a reserved account details
   */
  async getReservedAccount(accountReference) {
    try {
      const headers = await this.getHeaders();

      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/api/v2/bank-transfer/reserved-accounts/${accountReference}`,
        headers,
        timeout: 30000
      });

      if (!response.data.requestSuccessful) {
        throw new Error(`Get account failed: ${response.data.responseMessage}`);
      }

      return response.data;
    } catch (error) {
      console.error('Monnify get reserved account error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * List all banks
   */
  async listBanks() {
    try {
      const headers = await this.getHeaders();

      const response = await axios({
        method: 'GET',
        url: `${this.baseUrl}/api/v1/banks`,
        headers,
        timeout: 30000
      });

      if (!response.data.requestSuccessful) {
        throw new Error(`List banks failed: ${response.data.responseMessage}`);
      }

      return {
        success: true,
        banks: response.data.responseBody
      };
    } catch (error) {
      console.error('Monnify list banks error:', error.response?.data || error.message);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  verifyWebhookSignature(signature, payload) {
    try {
      const payloadString = typeof payload === 'object'
          ? JSON.stringify(payload)
          : payload;

      const hash = crypto
          .createHmac('sha512', this.secretKey)
          .update(payloadString)
          .digest('hex');

      return hash === signature;
    } catch (error) {
      console.error('Monnify webhook verification error:', error);
      return false;
    }
  }
}

export default new MonnifyService();