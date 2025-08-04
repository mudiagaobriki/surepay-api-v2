import PaymentService from '../../utils/PaymentService.js';
import PaystackService from '../../utils/PaystackService.js';
import MonnifyService from '../../utils/MonnifyService.js';

// Mock the dependencies
jest.mock('../../utils/PaystackService.js');
jest.mock('../../utils/MonnifyService.js');

describe('PaymentService', () => {
  beforeEach(() => {
    // Clear all mocks
    jest.clearAllMocks();
  });

  describe('initializeTransaction', () => {
    it('should initialize Paystack transaction successfully', async () => {
      // Arrange
      const gateway = 'paystack';
      const data = {
        email: 'test@example.com',
        amount: 1000,
        reference: 'test-reference'
      };
      
      const paystackResponse = {
        status: true,
        message: 'Authorization URL created',
        data: {
          authorization_url: 'https://checkout.paystack.com/test',
          access_code: 'test-access-code',
          reference: 'test-reference'
        }
      };
      
      PaystackService.initializeTransaction.mockResolvedValue(paystackResponse);

      // Act
      const result = await PaymentService.initializeTransaction(gateway, data);

      // Assert
      expect(PaystackService.initializeTransaction).toHaveBeenCalledWith(data);
      expect(result).toEqual({
        success: true,
        message: 'Authorization URL created',
        reference: 'test-reference',
        authorizationUrl: 'https://checkout.paystack.com/test',
        accessCode: 'test-access-code',
        gateway: 'paystack'
      });
    });

    it('should initialize Monnify transaction successfully', async () => {
      // Arrange
      const gateway = 'monnify';
      const data = {
        email: 'test@example.com',
        amount: 1000,
        reference: 'test-reference'
      };
      
      const monnifyResponse = {
        requestSuccessful: true,
        responseMessage: 'Transaction initialized',
        responseBody: {
          paymentReference: 'test-reference',
          checkoutUrl: 'https://checkout.monnify.com/test'
        }
      };
      
      MonnifyService.initializeTransaction.mockResolvedValue(monnifyResponse);

      // Act
      const result = await PaymentService.initializeTransaction(gateway, data);

      // Assert
      expect(MonnifyService.initializeTransaction).toHaveBeenCalledWith(data);
      expect(result).toEqual({
        success: true,
        message: 'Transaction initialized',
        reference: 'test-reference',
        authorizationUrl: 'https://checkout.monnify.com/test',
        gateway: 'monnify'
      });
    });

    it('should throw error for invalid gateway', async () => {
      // Arrange
      const gateway = 'invalid';
      const data = {
        email: 'test@example.com',
        amount: 1000
      };

      // Act & Assert
      await expect(
        PaymentService.initializeTransaction(gateway, data)
      ).rejects.toThrow('Invalid payment gateway selected');
    });
  });

  describe('verifyTransaction', () => {
    it('should verify Paystack transaction successfully', async () => {
      // Arrange
      const gateway = 'paystack';
      const reference = 'test-reference';
      
      const paystackResponse = {
        status: true,
        message: 'Verification successful',
        data: {
          reference: 'test-reference',
          status: 'success',
          amount: 100000, // 1000 NGN in kobo
          paid_at: '2023-05-17T10:00:00.000Z',
          channel: 'card',
          metadata: { custom: 'data' }
        }
      };
      
      PaystackService.verifyTransaction.mockResolvedValue(paystackResponse);

      // Act
      const result = await PaymentService.verifyTransaction(gateway, reference);

      // Assert
      expect(PaystackService.verifyTransaction).toHaveBeenCalledWith(reference);
      expect(result).toEqual({
        success: true,
        message: 'Verification successful',
        reference: 'test-reference',
        status: 'success',
        amount: 1000, // Converted from kobo to naira
        paidAt: '2023-05-17T10:00:00.000Z',
        channel: 'card',
        metadata: { custom: 'data' },
        gateway: 'paystack'
      });
    });

    it('should verify Monnify transaction successfully', async () => {
      // Arrange
      const gateway = 'monnify';
      const reference = 'test-reference';
      
      const monnifyResponse = {
        requestSuccessful: true,
        responseMessage: 'Transaction details retrieved',
        responseBody: {
          paymentReference: 'test-reference',
          paymentStatus: 'PAID',
          amount: 1000,
          paidOn: '2023-05-17T10:00:00.000Z',
          paymentMethod: 'CARD',
          metadata: { custom: 'data' }
        }
      };
      
      MonnifyService.verifyTransaction.mockResolvedValue(monnifyResponse);

      // Act
      const result = await PaymentService.verifyTransaction(gateway, reference);

      // Assert
      expect(MonnifyService.verifyTransaction).toHaveBeenCalledWith(reference);
      expect(result).toEqual({
        success: true,
        message: 'Transaction details retrieved',
        reference: 'test-reference',
        status: 'PAID',
        amount: 1000,
        paidAt: '2023-05-17T10:00:00.000Z',
        channel: 'CARD',
        metadata: { custom: 'data' },
        gateway: 'monnify'
      });
    });

    it('should throw error for invalid gateway', async () => {
      // Arrange
      const gateway = 'invalid';
      const reference = 'test-reference';

      // Act & Assert
      await expect(
        PaymentService.verifyTransaction(gateway, reference)
      ).rejects.toThrow('Invalid payment gateway selected');
    });
  });

  describe('verifyWebhookSignature', () => {
    it('should verify Paystack webhook signature', () => {
      // Arrange
      const gateway = 'paystack';
      const signature = 'test-signature';
      const payload = { event: 'charge.success' };
      
      PaystackService.verifyWebhookSignature.mockReturnValue(true);

      // Act
      const result = PaymentService.verifyWebhookSignature(gateway, signature, payload);

      // Assert
      expect(PaystackService.verifyWebhookSignature).toHaveBeenCalledWith(signature, payload);
      expect(result).toBe(true);
    });

    it('should verify Monnify webhook signature', () => {
      // Arrange
      const gateway = 'monnify';
      const signature = 'test-signature';
      const payload = { eventType: 'SUCCESSFUL_TRANSACTION' };
      
      MonnifyService.verifyWebhookSignature.mockReturnValue(true);

      // Act
      const result = PaymentService.verifyWebhookSignature(gateway, signature, payload);

      // Assert
      expect(MonnifyService.verifyWebhookSignature).toHaveBeenCalledWith(signature, payload);
      expect(result).toBe(true);
    });

    it('should throw error for invalid gateway', () => {
      // Arrange
      const gateway = 'invalid';
      const signature = 'test-signature';
      const payload = {};

      // Act & Assert
      expect(() => {
        PaymentService.verifyWebhookSignature(gateway, signature, payload);
      }).toThrow('Invalid payment gateway selected');
    });
  });

  describe('processWebhookData', () => {
    it('should process Paystack webhook data for successful charge', () => {
      // Arrange
      const gateway = 'paystack';
      const payload = {
        event: 'charge.success',
        data: {
          reference: 'test-reference',
          amount: 100000, // 1000 NGN in kobo
          status: 'success',
          channel: 'card',
          metadata: { custom: 'data' },
          currency: 'NGN',
          paid_at: '2023-05-17T10:00:00.000Z',
          customer: {
            email: 'test@example.com'
          }
        }
      };

      // Act
      const result = PaymentService.processWebhookData(gateway, payload);

      // Assert
      expect(result).toEqual({
        success: true,
        reference: 'test-reference',
        amount: 1000, // Converted from kobo to naira
        status: 'success',
        channel: 'card',
        metadata: { custom: 'data' },
        currency: 'NGN',
        paidAt: '2023-05-17T10:00:00.000Z',
        customer: {
          email: 'test@example.com'
        },
        gateway: 'paystack'
      });
    });

    it('should process Monnify webhook data for successful transaction', () => {
      // Arrange
      const gateway = 'monnify';
      const payload = {
        eventType: 'SUCCESSFUL_TRANSACTION',
        eventData: {
          paymentReference: 'test-reference',
          amountPaid: 1000,
          paymentStatus: 'PAID',
          paymentMethod: 'CARD',
          metaData: { custom: 'data' },
          currencyCode: 'NGN',
          paidOn: '2023-05-17T10:00:00.000Z',
          customer: {
            email: 'test@example.com'
          }
        }
      };

      // Act
      const result = PaymentService.processWebhookData(gateway, payload);

      // Assert
      expect(result).toEqual({
        success: true,
        reference: 'test-reference',
        amount: 1000,
        status: 'PAID',
        channel: 'CARD',
        metadata: { custom: 'data' },
        currency: 'NGN',
        paidAt: '2023-05-17T10:00:00.000Z',
        customer: {
          email: 'test@example.com'
        },
        gateway: 'monnify'
      });
    });

    it('should return failure for unsupported Paystack event', () => {
      // Arrange
      const gateway = 'paystack';
      const payload = {
        event: 'unsupported.event'
      };

      // Act
      const result = PaymentService.processWebhookData(gateway, payload);

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'Unsupported event type'
      });
    });

    it('should return failure for unsupported Monnify event', () => {
      // Arrange
      const gateway = 'monnify';
      const payload = {
        eventType: 'UNSUPPORTED_EVENT'
      };

      // Act
      const result = PaymentService.processWebhookData(gateway, payload);

      // Assert
      expect(result).toEqual({
        success: false,
        message: 'Unsupported event type'
      });
    });

    it('should throw error for invalid gateway', () => {
      // Arrange
      const gateway = 'invalid';
      const payload = {};

      // Act & Assert
      expect(() => {
        PaymentService.processWebhookData(gateway, payload);
      }).toThrow('Invalid payment gateway selected');
    });
  });

  describe('createVirtualAccount', () => {
    it('should create a virtual account successfully', async () => {
      // Arrange
      const data = {
        reference: 'test-reference',
        accountName: 'Test Account',
        email: 'test@example.com'
      };
      
      const monnifyResponse = {
        requestSuccessful: true,
        responseMessage: 'Reserved account created',
        responseBody: {
          accountReference: 'test-reference',
          accounts: [
            {
              bankName: 'Test Bank',
              accountNumber: '0123456789',
              accountName: 'Test Account'
            }
          ]
        }
      };
      
      MonnifyService.reserveAccount.mockResolvedValue(monnifyResponse);

      // Act
      const result = await PaymentService.createVirtualAccount(data);

      // Assert
      expect(MonnifyService.reserveAccount).toHaveBeenCalledWith(data);
      expect(result).toEqual({
        success: true,
        message: 'Reserved account created',
        reference: 'test-reference',
        accounts: [
          {
            bankName: 'Test Bank',
            accountNumber: '0123456789',
            accountName: 'Test Account'
          }
        ]
      });
    });
  });

  describe('listBanks', () => {
    it('should list Paystack banks successfully', async () => {
      // Arrange
      const gateway = 'paystack';
      
      const paystackResponse = {
        status: true,
        message: 'Banks retrieved',
        data: [
          {
            code: '001',
            name: 'Access Bank',
            slug: 'access-bank',
            longcode: '000001'
          }
        ]
      };
      
      PaystackService.listBanks.mockResolvedValue(paystackResponse);

      // Act
      const result = await PaymentService.listBanks(gateway);

      // Assert
      expect(PaystackService.listBanks).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'Banks retrieved',
        banks: [
          {
            code: '001',
            name: 'Access Bank',
            slug: 'access-bank',
            longcode: '000001',
            gateway: 'paystack'
          }
        ]
      });
    });

    it('should list Monnify banks successfully', async () => {
      // Arrange
      const gateway = 'monnify';
      
      const monnifyResponse = {
        requestSuccessful: true,
        responseMessage: 'Banks retrieved',
        responseBody: [
          {
            code: '001',
            name: 'Access Bank',
            shortName: 'Access'
          }
        ]
      };
      
      MonnifyService.listBanks.mockResolvedValue(monnifyResponse);

      // Act
      const result = await PaymentService.listBanks(gateway);

      // Assert
      expect(MonnifyService.listBanks).toHaveBeenCalled();
      expect(result).toEqual({
        success: true,
        message: 'Banks retrieved',
        banks: [
          {
            code: '001',
            name: 'Access Bank',
            shortName: 'Access',
            gateway: 'monnify'
          }
        ]
      });
    });

    it('should throw error for invalid gateway', async () => {
      // Arrange
      const gateway = 'invalid';

      // Act & Assert
      await expect(
        PaymentService.listBanks(gateway)
      ).rejects.toThrow('Invalid payment gateway selected');
    });
  });
});