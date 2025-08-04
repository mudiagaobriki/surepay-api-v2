import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import User from '../src/models/User.js';
import Wallet from '../src/models/Wallet.js';
import BillPayment from '../src/models/BillPayment.js';
import Transaction from '../src/models/Transaction.js';
import Payment from '../src/models/Payment.js';
import mongoose from 'mongoose';

/**
 * Create a test user
 * @param {Object} overrides - User data overrides
 * @returns {Promise<Object>} - Created user
 */
export const createTestUser = async (overrides = {}) => {
  const defaultUser = {
    email: `test-${Date.now()}@example.com`,
    username: `testuser-${Date.now()}`,
    phone: `+234${Math.floor(Math.random() * 1000000000)}`,
    password: await bcrypt.hash('TestPassword123!', 10),
    type: 'user',
    verified: true,
    emailVerifiedAt: new Date(),
  };

  const userData = { ...defaultUser, ...overrides };
  return await User.create(userData);
};

/**
 * Create a test wallet
 * @param {string} userId - User ID
 * @param {Object} overrides - Wallet data overrides
 * @returns {Promise<Object>} - Created wallet
 */
export const createTestWallet = async (userId, overrides = {}) => {
  const defaultWallet = {
    user: userId,
    balance: 1000, // 1000 NGN
    currency: 'NGN',
    status: 'active',
  };

  const walletData = { ...defaultWallet, ...overrides };
  return await Wallet.create(walletData);
};

/**
 * Create a test transaction
 * @param {string} userId - User ID
 * @param {Object} overrides - Transaction data overrides
 * @returns {Promise<Object>} - Created transaction
 */
export const createTestTransaction = async (userId, overrides = {}) => {
  const defaultTransaction = {
    user: userId,
    type: 'deposit',
    amount: 500,
    currency: 'NGN',
    status: 'completed',
    reference: `test-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    description: 'Test transaction',
    balanceBefore: 500,
    balanceAfter: 1000,
  };

  const transactionData = { ...defaultTransaction, ...overrides };
  return await Transaction.create(transactionData);
};

/**
 * Create a test payment
 * @param {string} userId - User ID
 * @param {Object} overrides - Payment data overrides
 * @returns {Promise<Object>} - Created payment
 */
export const createTestPayment = async (userId, overrides = {}) => {
  const defaultPayment = {
    user: userId,
    amount: 500,
    currency: 'NGN',
    reference: `pay-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    gateway: 'paystack',
    status: 'pending',
    metadata: { purpose: 'wallet_funding' },
  };

  const paymentData = { ...defaultPayment, ...overrides };
  return await Payment.create(paymentData);
};

/**
 * Create a test bill payment
 * @param {string} userId - User ID
 * @param {Object} overrides - Bill payment data overrides
 * @returns {Promise<Object>} - Created bill payment
 */
export const createTestBillPayment = async (userId, overrides = {}) => {
  const defaultBillPayment = {
    user: userId,
    serviceType: 'airtime',
    serviceID: 'mtn',
    amount: 100,
    phone: '+2348012345678',
    status: 'pending',
    transactionRef: `bill-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
    paymentMethod: 'wallet',
  };

  const billPaymentData = { ...defaultBillPayment, ...overrides };
  return await BillPayment.create(billPaymentData);
};

/**
 * Generate a valid JWT token for a user
 * @param {Object} user - User object
 * @returns {string} - JWT token
 */
export const generateToken = (user) => {
  return jwt.sign(
    { user_id: user._id, email: user.email },
    process.env.JWT_SECRET,
    { expiresIn: '2h' }
  );
};

/**
 * Create auth headers with token
 * @param {string} token - JWT token
 * @returns {Object} - Auth headers
 */
export const authHeader = (token) => {
  return {
    'Authorization': `Bearer ${token}`,
    'Content-Type': 'application/json',
  };
};

/**
 * Mock response object for controller testing
 * @returns {Object} - Mock response object
 */
export const mockResponse = () => {
  const res = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  res.send = jest.fn().mockReturnValue(res);
  res.redirect = jest.fn().mockReturnValue(res);
  return res;
};

/**
 * Mock request object for controller testing
 * @param {Object} overrides - Request object overrides
 * @returns {Object} - Mock request object
 */
export const mockRequest = (overrides = {}) => {
  const req = {
    body: {},
    params: {},
    query: {},
    headers: {},
    user: { id: new mongoose.Types.ObjectId().toString() },
    ...overrides,
  };
  return req;
};

/**
 * Mock PaymentService for testing
 */
export const mockPaymentService = () => {
  return {
    initializeTransaction: jest.fn().mockImplementation((gateway, data) => {
      return Promise.resolve({
        success: true,
        message: 'Payment initialized',
        reference: data.reference,
        authorizationUrl: 'https://checkout.paystack.com/test',
        gateway,
      });
    }),
    
    verifyTransaction: jest.fn().mockImplementation((gateway, reference) => {
      return Promise.resolve({
        success: true,
        message: 'Payment verified',
        reference,
        status: 'success',
        amount: 500,
        paidAt: new Date(),
        channel: 'card',
        metadata: {},
        gateway,
      });
    }),
    
    verifyWebhookSignature: jest.fn().mockReturnValue(true),
    
    processWebhookData: jest.fn().mockImplementation((gateway, payload) => {
      return {
        success: true,
        reference: payload.reference || 'test-reference',
        amount: payload.amount || 500,
        status: 'success',
        channel: 'card',
        metadata: {},
        currency: 'NGN',
        paidAt: new Date(),
        customer: {
          email: 'test@example.com',
        },
        gateway,
      };
    }),
    
    createVirtualAccount: jest.fn().mockImplementation((data) => {
      return Promise.resolve({
        success: true,
        message: 'Virtual account created',
        reference: data.reference,
        accounts: [
          {
            bankName: 'Test Bank',
            accountNumber: '0123456789',
            accountName: 'Test Account',
          },
        ],
      });
    }),
    
    listBanks: jest.fn().mockImplementation((gateway) => {
      return Promise.resolve({
        success: true,
        message: 'Banks retrieved',
        banks: [
          {
            code: '001',
            name: 'Test Bank',
            gateway,
          },
        ],
      });
    }),
  };
};

/**
 * Mock VTPassService for testing
 */
export const mockVTPassService = () => {
  return {
    getServiceCategories: jest.fn().mockResolvedValue({
      response_description: 'Categories retrieved',
      content: {
        categories: ['airtime', 'data', 'electricity', 'cable'],
      },
    }),
    
    getServices: jest.fn().mockResolvedValue({
      response_description: 'Services retrieved',
      content: {
        services: [
          { serviceID: 'mtn', name: 'MTN Airtime' },
          { serviceID: 'glo', name: 'Glo Airtime' },
        ],
      },
    }),
    
    getVariations: jest.fn().mockResolvedValue({
      response_description: 'Variations retrieved',
      content: {
        variations: [
          { variation_code: 'mtn-10', name: 'MTN 10 NGN', amount: 10 },
          { variation_code: 'mtn-100', name: 'MTN 100 NGN', amount: 100 },
        ],
      },
    }),
    
    verifyCustomer: jest.fn().mockResolvedValue({
      response_description: 'Customer verified',
      content: {
        customer_name: 'Test Customer',
      },
    }),
    
    payBill: jest.fn().mockResolvedValue({
      code: '000',
      response_description: 'Payment successful',
      purchased_code: 'TXN123456',
      requestId: 'REQ123456',
    }),
    
    queryTransaction: jest.fn().mockResolvedValue({
      code: '000',
      response_description: 'Transaction successful',
      content: {
        transactions: {
          status: 'delivered',
        },
      },
    }),
  };
};

/**
 * Mock WalletService for testing
 */
export const mockWalletService = () => {
  return {
    getOrCreateWallet: jest.fn().mockImplementation((userId) => {
      return Promise.resolve({
        _id: new mongoose.Types.ObjectId(),
        user: userId,
        balance: 1000,
        currency: 'NGN',
        status: 'active',
      });
    }),
    
    creditWallet: jest.fn().mockImplementation((userId, amount) => {
      return Promise.resolve({
        success: true,
        balance: 1000 + amount,
      });
    }),
    
    debitWallet: jest.fn().mockImplementation((userId, amount) => {
      return Promise.resolve({
        success: true,
        balance: 1000 - amount,
      });
    }),
    
    getBalance: jest.fn().mockResolvedValue({
      balance: 1000,
      currency: 'NGN',
      status: 'active',
    }),
    
    getTransactions: jest.fn().mockResolvedValue({
      docs: [],
      totalDocs: 0,
      limit: 10,
      page: 1,
      totalPages: 0,
      hasNextPage: false,
      hasPrevPage: false,
    }),
  };
};

export default {
  createTestUser,
  createTestWallet,
  createTestTransaction,
  createTestPayment,
  createTestBillPayment,
  generateToken,
  authHeader,
  mockResponse,
  mockRequest,
  mockPaymentService,
  mockVTPassService,
  mockWalletService,
};