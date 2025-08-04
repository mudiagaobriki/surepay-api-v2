import request from 'supertest';
import mongoose from 'mongoose';
import app from '../../app.js';
import User from '../../src/models/User.js';
import Wallet from '../../src/models/Wallet.js';
import Payment from '../../src/models/Payment.js';
import Transaction from '../../src/models/Transaction.js';
import PaymentService from '../../utils/PaymentService.js';
import {
  createTestUser,
  createTestWallet,
  generateToken,
} from '../helpers.js';

// Mock the PaymentService
jest.mock('../../utils/PaymentService.js');

describe('Wallet Controller Integration Tests', () => {
  let testUser;
  let authToken;
  let testWallet;

  beforeEach(async () => {
    // Create a test user
    testUser = await createTestUser();
    
    // Generate auth token
    authToken = generateToken(testUser);
    
    // Create a wallet for the user
    testWallet = await createTestWallet(testUser._id, { balance: 1000 });
    
    // Reset mocks
    jest.clearAllMocks();
  });

  describe('GET /api/wallet/balance', () => {
    it('should return wallet balance for authenticated user', async () => {
      // Act
      const response = await request(app)
        .get('/api/wallet/balance')
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.data).toBeDefined();
      expect(response.body.data.balance).toBe(1000);
      expect(response.body.data.currency).toBe('NGN');
      expect(response.body.data.status).toBe('active');
    });

    it('should return 401 if not authenticated', async () => {
      // Act
      const response = await request(app)
        .get('/api/wallet/balance');

      // Assert
      expect(response.status).toBe(401);
    });
  });

  describe('GET /api/wallet/transactions', () => {
    it('should return paginated transactions for authenticated user', async () => {
      // Arrange
      // Create some transactions
      for (let i = 0; i < 3; i++) {
        await Transaction.create({
          user: testUser._id,
          type: 'deposit',
          amount: 100,
          status: 'completed',
          reference: `test-${i}`,
          description: `Test transaction ${i}`,
          balanceBefore: i * 100,
          balanceAfter: (i + 1) * 100,
          currency: 'NGN'
        });
      }

      // Act
      const response = await request(app)
        .get('/api/wallet/transactions')
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.docs).toBeDefined();
      expect(response.body.docs.length).toBe(3);
      expect(response.body.totalDocs).toBe(3);
      expect(response.body.page).toBe(1);
    });

    it('should return filtered transactions by type', async () => {
      // Arrange
      // Create mixed transactions
      await Transaction.create({
        user: testUser._id,
        type: 'deposit',
        amount: 100,
        status: 'completed',
        reference: 'deposit-1',
        description: 'Deposit',
        balanceBefore: 900,
        balanceAfter: 1000,
        currency: 'NGN'
      });
      
      await Transaction.create({
        user: testUser._id,
        type: 'bill_payment',
        amount: -50,
        status: 'completed',
        reference: 'bill-1',
        description: 'Bill Payment',
        balanceBefore: 1000,
        balanceAfter: 950,
        currency: 'NGN'
      });

      // Act
      const response = await request(app)
        .get('/api/wallet/transactions?type=deposit')
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.docs).toBeDefined();
      expect(response.body.docs.length).toBe(1);
      expect(response.body.docs[0].type).toBe('deposit');
    });

    it('should return empty array if no transactions found', async () => {
      // Act
      const response = await request(app)
        .get('/api/wallet/transactions')
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.docs).toBeDefined();
      expect(response.body.docs.length).toBe(0);
      expect(response.body.totalDocs).toBe(0);
    });
  });

  describe('POST /api/wallet/fund', () => {
    it('should initiate wallet funding with Paystack', async () => {
      // Arrange
      const fundData = {
        amount: 500,
        gateway: 'paystack'
      };
      
      // Mock PaymentService.initializeTransaction
      const mockResponse = {
        success: true,
        message: 'Payment initialized',
        reference: expect.any(String),
        authorizationUrl: 'https://checkout.paystack.com/test',
        gateway: 'paystack'
      };
      
      PaymentService.initializeTransaction.mockResolvedValue(mockResponse);

      // Act
      const response = await request(app)
        .post('/api/wallet/fund')
        .set('Authorization', `Bearer ${authToken}`)
        .send(fundData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Wallet funding initiated');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.reference).toBeDefined();
      expect(response.body.data.amount).toBe(500);
      expect(response.body.data.gateway).toBe('paystack');
      expect(response.body.data.authorizationUrl).toBe('https://checkout.paystack.com/test');
      
      // Verify payment record was created
      const payment = await Payment.findOne({ reference: response.body.data.reference });
      expect(payment).toBeDefined();
      expect(payment.user.toString()).toBe(testUser._id.toString());
      expect(payment.amount).toBe(500);
      expect(payment.gateway).toBe('paystack');
      expect(payment.status).toBe('pending');
    });

    it('should initiate wallet funding with Monnify', async () => {
      // Arrange
      const fundData = {
        amount: 500,
        gateway: 'monnify'
      };
      
      // Mock PaymentService.initializeTransaction
      const mockResponse = {
        success: true,
        message: 'Payment initialized',
        reference: expect.any(String),
        authorizationUrl: 'https://checkout.monnify.com/test',
        gateway: 'monnify'
      };
      
      PaymentService.initializeTransaction.mockResolvedValue(mockResponse);

      // Act
      const response = await request(app)
        .post('/api/wallet/fund')
        .set('Authorization', `Bearer ${authToken}`)
        .send(fundData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Wallet funding initiated');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.reference).toBeDefined();
      expect(response.body.data.amount).toBe(500);
      expect(response.body.data.gateway).toBe('monnify');
      expect(response.body.data.authorizationUrl).toBe('https://checkout.monnify.com/test');
    });

    it('should return 400 for invalid amount', async () => {
      // Arrange
      const fundData = {
        amount: 50, // Less than minimum
        gateway: 'paystack'
      };

      // Act
      const response = await request(app)
        .post('/api/wallet/fund')
        .set('Authorization', `Bearer ${authToken}`)
        .send(fundData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation error');
    });

    it('should return 400 for invalid gateway', async () => {
      // Arrange
      const fundData = {
        amount: 500,
        gateway: 'invalid'
      };

      // Act
      const response = await request(app)
        .post('/api/wallet/fund')
        .set('Authorization', `Bearer ${authToken}`)
        .send(fundData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Validation error');
    });
  });

  describe('GET /api/wallet/verify/:reference', () => {
    it('should verify successful payment and credit wallet', async () => {
      // Arrange
      const reference = `test-${Date.now()}`;
      
      // Create pending payment
      const payment = await Payment.create({
        user: testUser._id,
        amount: 500,
        currency: 'NGN',
        reference,
        gateway: 'paystack',
        status: 'pending',
        walletId: testWallet._id,
      });
      
      // Mock PaymentService.verifyTransaction
      const mockVerification = {
        success: true,
        message: 'Payment verified',
        reference,
        status: 'success',
        amount: 500,
        paidAt: new Date(),
        channel: 'card',
        metadata: {},
        gateway: 'paystack'
      };
      
      PaymentService.verifyTransaction.mockResolvedValue(mockVerification);

      // Act
      const response = await request(app)
        .get(`/api/wallet/verify/${reference}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Payment verified and wallet credited successfully');
      
      // Verify payment was updated
      const updatedPayment = await Payment.findOne({ reference });
      expect(updatedPayment.status).toBe('success');
      expect(updatedPayment.channel).toBe('card');
      expect(updatedPayment.paidAt).toBeDefined();
      
      // Verify wallet was credited
      const updatedWallet = await Wallet.findById(testWallet._id);
      expect(updatedWallet.balance).toBe(1500); // 1000 + 500
      
      // Verify transaction was created
      const transaction = await Transaction.findOne({ reference });
      expect(transaction).toBeDefined();
      expect(transaction.amount).toBe(500);
      expect(transaction.type).toBe('deposit');
      expect(transaction.status).toBe('completed');
    });

    it('should handle failed payment verification', async () => {
      // Arrange
      const reference = `test-${Date.now()}`;
      
      // Create pending payment
      const payment = await Payment.create({
        user: testUser._id,
        amount: 500,
        currency: 'NGN',
        reference,
        gateway: 'paystack',
        status: 'pending',
        walletId: testWallet._id,
      });
      
      // Mock PaymentService.verifyTransaction
      const mockVerification = {
        success: true,
        message: 'Payment failed',
        reference,
        status: 'failed',
        amount: 500,
        metadata: {},
        gateway: 'paystack'
      };
      
      PaymentService.verifyTransaction.mockResolvedValue(mockVerification);

      // Act
      const response = await request(app)
        .get(`/api/wallet/verify/${reference}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Payment verification failed');
      
      // Verify payment was updated
      const updatedPayment = await Payment.findOne({ reference });
      expect(updatedPayment.status).toBe('failed');
      
      // Verify wallet was not credited
      const updatedWallet = await Wallet.findById(testWallet._id);
      expect(updatedWallet.balance).toBe(1000); // Unchanged
      
      // Verify no transaction was created
      const transaction = await Transaction.findOne({ reference });
      expect(transaction).toBeNull();
    });

    it('should return 404 for non-existent payment', async () => {
      // Arrange
      const reference = 'non-existent-reference';

      // Act
      const response = await request(app)
        .get(`/api/wallet/verify/${reference}`)
        .set('Authorization', `Bearer ${authToken}`);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Payment not found');
    });
  });

  describe('POST /api/wallet/transfer', () => {
    let recipientUser;

    beforeEach(async () => {
      // Create recipient user and wallet
      recipientUser = await createTestUser({
        email: 'recipient@example.com',
        username: 'recipient',
        phone: '+2348012345678'
      });
      
      await createTestWallet(recipientUser._id, { balance: 500 });
    });

    it('should transfer funds between users successfully', async () => {
      // Arrange
      const transferData = {
        recipientIdentifier: recipientUser.username,
        amount: 200,
        description: 'Test transfer'
      };

      // Act
      const response = await request(app)
        .post('/api/wallet/transfer')
        .set('Authorization', `Bearer ${authToken}`)
        .send(transferData);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.message).toBe('Transfer successful');
      expect(response.body.data).toBeDefined();
      expect(response.body.data.amount).toBe(200);
      expect(response.body.data.recipient.username).toBe(recipientUser.username);
      
      // Verify sender wallet was debited
      const senderWallet = await Wallet.findOne({ user: testUser._id });
      expect(senderWallet.balance).toBe(800); // 1000 - 200
      
      // Verify recipient wallet was credited
      const recipientWallet = await Wallet.findOne({ user: recipientUser._id });
      expect(recipientWallet.balance).toBe(700); // 500 + 200
      
      // Verify transactions were created
      const senderTransaction = await Transaction.findOne({
        user: testUser._id,
        type: 'transfer',
        amount: -200
      });
      expect(senderTransaction).toBeDefined();
      
      const recipientTransaction = await Transaction.findOne({
        user: recipientUser._id,
        type: 'transfer',
        amount: 200
      });
      expect(recipientTransaction).toBeDefined();
      expect(senderTransaction.reference).toBe(recipientTransaction.reference);
    });

    it('should return 400 for insufficient funds', async () => {
      // Arrange
      const transferData = {
        recipientIdentifier: recipientUser.username,
        amount: 2000, // More than wallet balance
        description: 'Test transfer'
      };

      // Act
      const response = await request(app)
        .post('/api/wallet/transfer')
        .set('Authorization', `Bearer ${authToken}`)
        .send(transferData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Insufficient wallet balance');
      
      // Verify wallets remain unchanged
      const senderWallet = await Wallet.findOne({ user: testUser._id });
      expect(senderWallet.balance).toBe(1000);
      
      const recipientWallet = await Wallet.findOne({ user: recipientUser._id });
      expect(recipientWallet.balance).toBe(500);
    });

    it('should return 404 for non-existent recipient', async () => {
      // Arrange
      const transferData = {
        recipientIdentifier: 'non-existent-user',
        amount: 200,
        description: 'Test transfer'
      };

      // Act
      const response = await request(app)
        .post('/api/wallet/transfer')
        .set('Authorization', `Bearer ${authToken}`)
        .send(transferData);

      // Assert
      expect(response.status).toBe(404);
      expect(response.body.message).toBe('Recipient not found');
    });

    it('should return 400 for self-transfer', async () => {
      // Arrange
      const transferData = {
        recipientIdentifier: testUser.username, // Same as sender
        amount: 200,
        description: 'Test transfer'
      };

      // Act
      const response = await request(app)
        .post('/api/wallet/transfer')
        .set('Authorization', `Bearer ${authToken}`)
        .send(transferData);

      // Assert
      expect(response.status).toBe(400);
      expect(response.body.message).toBe('Cannot transfer to yourself');
    });
  });

  describe('POST /api/wallet/webhook', () => {
    it('should process valid Paystack webhook and credit wallet', async () => {
      // Arrange
      const reference = `test-${Date.now()}`;
      
      // Create pending payment
      const payment = await Payment.create({
        user: testUser._id,
        amount: 500,
        currency: 'NGN',
        reference,
        gateway: 'paystack',
        status: 'pending',
        walletId: testWallet._id,
      });
      
      // Mock webhook verification and processing
      PaymentService.verifyWebhookSignature.mockReturnValue(true);
      
      PaymentService.processWebhookData.mockReturnValue({
        success: true,
        reference,
        amount: 500,
        status: 'success',
        channel: 'card',
        metadata: {},
        currency: 'NGN',
        paidAt: new Date(),
        customer: {
          email: testUser.email
        },
        gateway: 'paystack'
      });
      
      const webhookPayload = {
        event: 'charge.success',
        data: {
          reference,
          amount: 50000, // 500 NGN in kobo
          status: 'success'
        }
      };

      // Act
      const response = await request(app)
        .post('/api/wallet/webhook/paystack')
        .set('x-paystack-signature', 'test-signature')
        .send(webhookPayload);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('success');
      
      // Verify payment was updated
      const updatedPayment = await Payment.findOne({ reference });
      expect(updatedPayment.status).toBe('success');
      
      // Verify wallet was credited
      const updatedWallet = await Wallet.findById(testWallet._id);
      expect(updatedWallet.balance).toBe(1500); // 1000 + 500
    });

    it('should return 200 but not process payment with invalid signature', async () => {
      // Arrange
      const reference = `test-${Date.now()}`;
      
      // Create pending payment
      const payment = await Payment.create({
        user: testUser._id,
        amount: 500,
        currency: 'NGN',
        reference,
        gateway: 'paystack',
        status: 'pending',
        walletId: testWallet._id,
      });
      
      // Mock webhook verification failure
      PaymentService.verifyWebhookSignature.mockReturnValue(false);
      
      const webhookPayload = {
        event: 'charge.success',
        data: {
          reference,
          amount: 50000,
          status: 'success'
        }
      };

      // Act
      const response = await request(app)
        .post('/api/wallet/webhook/paystack')
        .set('x-paystack-signature', 'invalid-signature')
        .send(webhookPayload);

      // Assert
      expect(response.status).toBe(200);
      expect(response.body.status).toBe('error');
      expect(response.body.message).toBe('Invalid signature');
      
      // Verify payment was not updated
      const updatedPayment = await Payment.findOne({ reference });
      expect(updatedPayment.status).toBe('pending');
      
      // Verify wallet was not credited
      const updatedWallet = await Wallet.findById(testWallet._id);
      expect(updatedWallet.balance).toBe(1000); // Unchanged
    });
  });
});