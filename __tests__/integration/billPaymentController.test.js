import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app.js';
import User from '../../src/models/User.js';
import Wallet from '../../src/models/Wallet.js';
import BillPayment from '../../src/models/BillPayment.js';
import Transaction from '../../src/models/Transaction.js';
import VTPassService from '../../utils/VTPassService.js';
import WalletService from '../../utils/WalletService.js';
import {
  createTestUser,
  createTestWallet,
  generateToken,
} from '../helpers.js';

// Mock the VTPassService
jest.mock('../../utils/VTPassService.js');

// Mock WalletService specific methods
jest.mock('../../utils/WalletService.js', () => {
  const originalModule = jest.requireActual('../../utils/WalletService.js');
  
  return {
    ...originalModule,
    debitWallet: jest.fn(),
    creditWallet: jest.fn()
  };
});

describe('Bill Payment Controller Integration Tests', () => {
  let testUser;
  let authToken;
  let testWallet;

  beforeEach(async () => {
    // Create a test user
    testUser = await createTestUser();
    
    // Generate auth token
    authToken = generateToken(testUser);
    
    // Create a wallet for the user
    testWallet = await createTestWallet(testUser._id, { balance: 5000 });
    
    // Reset mocks
    jest.clearAllMocks();
    
    // Setup default mocks
    VTPassService.getServiceCategories.mockResolvedValue({
      response_description: 'Categories retrieved',
      content: {
        categories: ['airtime', 'data', 'electricity', 'cable']
      }
    });
    
    VTPassService.getServices.mockResolvedValue({
      response_description: 'Services retrieved',
      content: {
        services: [
          { serviceID: 'mtn', name: 'MTN Airtime' },
          { serviceID: 'glo', name: 'Glo Airtime' },
          { serviceID: 'airtel', name: 'Airtel Airtime' },
          { serviceID: 'etisalat', name: '9mobile Airtime' }
        ]
      }
    });
    
    VTPassService.getVariations.mockResolvedValue({
      response_description: 'Variations retrieved',
      content: {
        variations: [
          { variation_code: 'mtn-data-1', name: 'MTN 1GB', amount: 300 },
          { variation_code: 'mtn-data-2', name: 'MTN 2GB', amount: 500 }
        ]
      }
    });
    
    VTPassService.verifyCustomer.mockResolvedValue({
      response_description: 'Customer verified',
      content: {
        customer_name: 'Test Customer'
      }
    });
    
    WalletService.debitWallet.mockResolvedValue({
      success: true,
      balance: 4500 // 5000 - 500
    });
    
    WalletService.creditWallet.mockResolvedValue({
      success: true,
      balance: 5000 // Refunded
    });
  });

  describe('GET /api/bills/services/categories', () => {
    it('should return service categories', async () => {
      // Act
      const response = await request(app)
        .get('/api/bills/services/categories');

      // Assert
      expect(response.status).toBe(200);
      expect(VTPassService.getServiceCategories).toHaveBeenCalled();
      expect(response.body).toEqual({
        response_description: 'Categories retrieved',
        content: {
          categories: ['airtime', 'data', 'electricity', 'cable']
        }
      });
    });

    it('should handle errors from VTPass', async () => {
      // Arrange
      VTPassService.getServiceCategories.mockRejectedValue(new Error('VTPass error'));

      // Act
      const response = await request(app)
        .get('/api/bills/services/categories');

      // Assert
      expect(response.status).toBe(500);
      expect(response.body.message).toBe('Failed to fetch service categories');
    });
  });

  describe('GET /api/bills/services/:category', () => {
    it('should return services for a category', async () => {
      // Act
      const response = await request(app)
        .get('/api/bills/services/airtime');

      // Assert
      expect(response.status).toBe(200);
      expect(VTPassService.getServices).toHaveBeenCalledWith('airtime');
      expect(response.body).toEqual({
        response_description: 'Services retrieved',
        content: {
          services: [
            { serviceID: 'mtn', name: 'MTN Airtime' },
            { serviceID: 'glo', name: 'Glo Airtime' },
            { serviceID: 'airtel', name: 'Airtel Airtime' },
            { serviceID: 'etisalat', name: '9mobile Airtime' }
          ]
        }
      });
    });

    it('should return 400 if category is missing', async () => {
      // Act
      const response = await request(app)
        .get('/api/bills/services/');

      // Assert
      expect(response.status).toBe(404); // Express default for missing route
    });
  });

  describe('GET /api/bills/services/variations/:serviceId', () => {
    it('should return variations for a service', async () => {
      // Act
      const response = await request(app)
        .get('/api/bills/services/variations/mtn-data');

      // Assert
      expect(response.status).toBe(200);
      expect(VTPassService.getVariations).toHaveBeenCalledWith('mtn-data');
      expect(response.body).toEqual({
        response_description: 'Variations retrieved',
        content: {
          variations: [
            { variation_code: 'mtn-data-1', name: 'MTN 1GB', amount: 300 },
            { variation_code: 'mtn-data-2', name: 'MTN 2GB', amount: 500 }
          ]
        }
      });
    });
  });

  describe('POST /api/bills/verify', () => {
    it('should verify customer details', async () => {
      // Arrange
      const verifyData = {
        serviceID: 'ikeja-electric',
        billersCode: '1234567890',
        type: 'prepaid'
      };

      // Act
      const response = await request(app)
        .post('/api/bills/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send(verifyData);

      // Assert
      expect(response.status).toBe(200);
      expect(VTPassService.verifyCustomer).toHaveBeenCalledWith(
        'ikeja-electric',
        '1234567890',
        'prepaid'
      );
      expect(response.body).toEqual({
        response_description: 'Customer verified',
        content: {
          customer_name: 'Test Customer'
        }
      });
    });

    it('should return 400 for validation errors', async () => {
      // Arrange
      const verifyData = {
        // Missing required fields
      };

      // Act
      const response = await request(app)
        .post('/api/bills/verify')
        .set('Authorization', `Bearer ${authToken}`)
        .send(verifyData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation error');
    });
  });

  describe('POST /api/bills/pay', () => {
    it('should process airtime payment successfully', async () => {
      // Arrange
      const paymentData = {
        serviceID: 'mtn',
        amount: 500,
        phone: '+2348012345678'
      };
      
      VTPassService.payBill.mockResolvedValue({
        code: '000',
        response_description: 'Payment successful',
        purchased_code: 'VTPASS123456',
        requestId: 'REQ123456'
      });

      // Act
      const response = await request(app)
        .post('/api/bills/pay')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Payment successful');
      
      // Verify wallet was debited
      expect(WalletService.debitWallet).toHaveBeenCalledWith(
        testUser.id,
        500,
        'bill_payment',
        expect.any(String),
        expect.objectContaining({ billPaymentId: expect.any(mongoose.Types.ObjectId) })
      );
      
      // Verify bill payment record was created
      const billPayment = await BillPayment.findOne({
        user: testUser._id,
        serviceID: 'mtn',
        amount: 500
      });
      
      expect(billPayment).toBeDefined();
      expect(billPayment.status).toBe('completed');
      expect(billPayment.vtpassRef).toBe('VTPASS123456');
    });

    it('should process data bundle payment successfully', async () => {
      // Arrange
      const paymentData = {
        serviceID: 'mtn-data',
        billersCode: '08012345678',
        variation_code: 'mtn-data-2',
        amount: 500,
        phone: '+2348012345678'
      };
      
      VTPassService.payBill.mockResolvedValue({
        code: '000',
        response_description: 'Payment successful',
        purchased_code: 'VTPASS123456',
        requestId: 'REQ123456'
      });

      // Act
      const response = await request(app)
        .post('/api/bills/pay')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Payment successful');
      
      // Verify VTPassService.payBill was called correctly
      expect(VTPassService.payBill).toHaveBeenCalledWith(
        expect.objectContaining({
          serviceID: 'mtn-data',
          billersCode: '08012345678',
          variation_code: 'mtn-data-2',
          amount: 500,
          phone: '+2348012345678',
          request_id: expect.any(String)
        })
      );
    });

    it('should handle payment failure and refund wallet', async () => {
      // Arrange
      const paymentData = {
        serviceID: 'mtn',
        amount: 500,
        phone: '+2348012345678'
      };
      
      // Mock payment failure response
      VTPassService.payBill.mockResolvedValue({
        code: '400',
        response_description: 'Payment failed',
        requestId: 'REQ123456'
      });

      // Act
      const response = await request(app)
        .post('/api/bills/pay')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Payment failed');
      
      // Verify wallet was debited
      expect(WalletService.debitWallet).toHaveBeenCalled();
      
      // Verify wallet was refunded
      expect(WalletService.creditWallet).toHaveBeenCalledWith(
        testUser.id,
        500,
        'refund',
        expect.stringContaining('refund-'),
        expect.objectContaining({ 
          billPaymentId: expect.any(mongoose.Types.ObjectId), 
          reason: 'Failed payment' 
        })
      );
      
      // Verify bill payment record status
      const billPayment = await BillPayment.findOne({
        user: testUser._id,
        serviceID: 'mtn',
        amount: 500
      });
      
      expect(billPayment).toBeDefined();
      expect(billPayment.status).toBe('failed');
    });

    it('should return 400 for insufficient wallet balance', async () => {
      // Arrange
      const paymentData = {
        serviceID: 'mtn',
        amount: 10000, // More than wallet balance
        phone: '+2348012345678'
      };
      
      // Mock getBalance to return lower amount
      const getBalanceOriginal = WalletService.getBalance;
      WalletService.getBalance = jest.fn().mockResolvedValue({
        balance: 5000,
        currency: 'NGN',
        status: 'active'
      });

      // Act
      const response = await request(app)
        .post('/api/bills/pay')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Insufficient wallet balance');
      
      // Verify wallet was not debited
      expect(WalletService.debitWallet).not.toHaveBeenCalled();
      
      // Restore original function
      WalletService.getBalance = getBalanceOriginal;
    });

    it('should return 400 for validation errors', async () => {
      // Arrange
      const paymentData = {
        serviceID: 'dstv', // Not airtime, requires billersCode and variation_code
        amount: 500,
        phone: '+2348012345678'
        // Missing billersCode and variation_code
      };

      // Act
      const response = await request(app)
        .post('/api/bills/pay')
        .set('Authorization', `Bearer ${authToken}`)
        .send(paymentData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation error');
    });
  });

  describe('GET /api/bills/transactions/:transactionRef', () => {
    it('should return transaction status', async () => {
      // Arrange
      const transactionRef = `txn-${Date.now()}`;
      
      // Create a bill payment record
      const billPayment = await BillPayment.create({
        user: testUser._id,
        serviceType: 'airtime',
        serviceID: 'mtn',
        amount: 500,
        phone: '+2348012345678',
        status: 'pending',
        transactionRef,
        paymentMethod: 'wallet'
      });
      
      // Mock VTPass transaction query
      VTPassService.queryTransaction.mockResolvedValue({
        code: '000',
        response_description: 'Transaction successful',
        content: {
          transactions: {
            status: 'delivered'
          }
        }
      });

      // Act
      const response = await request(app)
        .get(`/api/bills/transactions/${transactionRef}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      
      // Verify bill payment status was updated
      const updatedBillPayment = await BillPayment.findById(billPayment._id);
      expect(updatedBillPayment.status).toBe('completed');
    });

    it('should return 404 for non-existent transaction', async () => {
      // Arrange
      const transactionRef = 'non-existent-ref';

      // Act
      const response = await request(app)
        .get(`/api/bills/transactions/${transactionRef}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Transaction not found');
    });
  });

  describe('GET /api/bills/history', () => {
    it('should return paginated payment history', async () => {
      // Arrange
      // Create some bill payments
      const payments = [];
      for (let i = 0; i < 3; i++) {
        payments.push(await BillPayment.create({
          user: testUser._id,
          serviceType: i % 2 === 0 ? 'airtime' : 'data',
          serviceID: i % 2 === 0 ? 'mtn' : 'mtn-data',
          amount: (i + 1) * 100,
          phone: '+2348012345678',
          status: 'completed',
          transactionRef: `txn-${i}`,
          paymentMethod: 'wallet'
        }));
      }

      // Act
      const response = await request(app)
        .get('/api/bills/history')
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.docs).toBeDefined();
      expect(response.body.docs.length).toBe(3);
      expect(response.body.totalDocs).toBe(3);
    });

    it('should filter history by serviceType', async () => {
      // Arrange
      // Create mixed bill payments
      await BillPayment.create({
        user: testUser._id,
        serviceType: 'airtime',
        serviceID: 'mtn',
        amount: 100,
        phone: '+2348012345678',
        status: 'completed',
        transactionRef: 'txn-airtime',
        paymentMethod: 'wallet'
      });
      
      await BillPayment.create({
        user: testUser._id,
        serviceType: 'data',
        serviceID: 'mtn-data',
        amount: 200,
        phone: '+2348012345678',
        status: 'completed',
        transactionRef: 'txn-data',
        paymentMethod: 'wallet'
      });

      // Act
      const response = await request(app)
        .get('/api/bills/history?serviceType=airtime')
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.docs).toBeDefined();
      expect(response.body.docs.length).toBe(1);
      expect(response.body.docs[0].serviceType).toBe('airtime');
    });

    it('should return empty array if no payment history found', async () => {
      // Act
      const response = await request(app)
        .get('/api/bills/history')
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.docs).toBeDefined();
      expect(response.body.docs.length).toBe(0);
      expect(response.body.totalDocs).toBe(0);
    });
  });
});