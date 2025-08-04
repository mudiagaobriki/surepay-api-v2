import mongoose from 'mongoose';
import WalletService from '../../utils/WalletService.js';
import Wallet from '../../src/models/Wallet.js';
import Transaction from '../../src/models/Transaction.js';
import {
  createTestUser,
  createTestWallet,
} from '../helpers.js';

describe('WalletService', () => {
  let testUser;

  beforeEach(async () => {
    // Create a test user
    testUser = await createTestUser();
  });

  describe('getOrCreateWallet', () => {
    it('should create a wallet if it does not exist', async () => {
      // Act
      const wallet = await WalletService.getOrCreateWallet(testUser._id);

      // Assert
      expect(wallet).toBeDefined();
      expect(wallet.user.toString()).toBe(testUser._id.toString());
      expect(wallet.balance).toBe(0);
      expect(wallet.currency).toBe('NGN');
      expect(wallet.status).toBe('active');

      // Verify the wallet was saved to the database
      const savedWallet = await Wallet.findOne({ user: testUser._id });
      expect(savedWallet).toBeDefined();
      expect(savedWallet.balance).toBe(0);
    });

    it('should return existing wallet if it exists', async () => {
      // Arrange
      const existingWallet = await createTestWallet(testUser._id, { balance: 500 });

      // Act
      const wallet = await WalletService.getOrCreateWallet(testUser._id);

      // Assert
      expect(wallet).toBeDefined();
      expect(wallet._id.toString()).toBe(existingWallet._id.toString());
      expect(wallet.balance).toBe(500);
    });
  });

  describe('creditWallet', () => {
    it('should credit wallet and create transaction', async () => {
      // Arrange
      const wallet = await createTestWallet(testUser._id, { balance: 1000 });
      const amount = 500;
      const type = 'deposit';
      const reference = 'test-credit-reference';

      // Act
      const result = await WalletService.creditWallet(
        testUser._id,
        amount,
        type,
        reference,
        { source: 'test' }
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.balance).toBe(1500);

      // Verify wallet was updated
      const updatedWallet = await Wallet.findById(wallet._id);
      expect(updatedWallet.balance).toBe(1500);

      // Verify transaction was created
      const transaction = await Transaction.findOne({ reference });
      expect(transaction).toBeDefined();
      expect(transaction.user.toString()).toBe(testUser._id.toString());
      expect(transaction.type).toBe(type);
      expect(transaction.amount).toBe(amount);
      expect(transaction.status).toBe('completed');
      expect(transaction.balanceBefore).toBe(1000);
      expect(transaction.balanceAfter).toBe(1500);
      expect(transaction.metadata).toEqual({ source: 'test' });
    });

    it('should throw error if wallet is not active', async () => {
      // Arrange
      await createTestWallet(testUser._id, { status: 'suspended' });

      // Act & Assert
      await expect(
        WalletService.creditWallet(
          testUser._id,
          500,
          'deposit',
          'test-reference'
        )
      ).rejects.toThrow('Wallet is suspended. Cannot process transaction.');
    });
  });

  describe('debitWallet', () => {
    it('should debit wallet and create transaction', async () => {
      // Arrange
      const wallet = await createTestWallet(testUser._id, { balance: 1000 });
      const amount = 500;
      const type = 'bill_payment';
      const reference = 'test-debit-reference';

      // Act
      const result = await WalletService.debitWallet(
        testUser._id,
        amount,
        type,
        reference,
        { destination: 'test' }
      );

      // Assert
      expect(result).toBeDefined();
      expect(result.success).toBe(true);
      expect(result.balance).toBe(500);

      // Verify wallet was updated
      const updatedWallet = await Wallet.findById(wallet._id);
      expect(updatedWallet.balance).toBe(500);

      // Verify transaction was created
      const transaction = await Transaction.findOne({ reference });
      expect(transaction).toBeDefined();
      expect(transaction.user.toString()).toBe(testUser._id.toString());
      expect(transaction.type).toBe(type);
      expect(transaction.amount).toBe(-amount); // Negative for debit
      expect(transaction.status).toBe('completed');
      expect(transaction.balanceBefore).toBe(1000);
      expect(transaction.balanceAfter).toBe(500);
      expect(transaction.metadata).toEqual({ destination: 'test' });
    });

    it('should throw error if wallet balance is insufficient', async () => {
      // Arrange
      await createTestWallet(testUser._id, { balance: 100 });

      // Act & Assert
      await expect(
        WalletService.debitWallet(
          testUser._id,
          500,
          'bill_payment',
          'test-reference'
        )
      ).rejects.toThrow('Insufficient funds');
    });

    it('should throw error if wallet is not active', async () => {
      // Arrange
      await createTestWallet(testUser._id, { status: 'locked', balance: 1000 });

      // Act & Assert
      await expect(
        WalletService.debitWallet(
          testUser._id,
          500,
          'bill_payment',
          'test-reference'
        )
      ).rejects.toThrow('Wallet is locked. Cannot process transaction.');
    });
  });

  describe('getBalance', () => {
    it('should return wallet balance', async () => {
      // Arrange
      await createTestWallet(testUser._id, { balance: 1500 });

      // Act
      const result = await WalletService.getBalance(testUser._id);

      // Assert
      expect(result).toBeDefined();
      expect(result.balance).toBe(1500);
      expect(result.currency).toBe('NGN');
      expect(result.status).toBe('active');
    });

    it('should create wallet if it does not exist', async () => {
      // Act
      const result = await WalletService.getBalance(testUser._id);

      // Assert
      expect(result).toBeDefined();
      expect(result.balance).toBe(0);
      expect(result.currency).toBe('NGN');
      expect(result.status).toBe('active');

      // Verify wallet was created
      const wallet = await Wallet.findOne({ user: testUser._id });
      expect(wallet).toBeDefined();
    });
  });

  describe('getTransactions', () => {
    it('should return paginated transactions', async () => {
      // Arrange
      // Create multiple transactions
      const wallet = await createTestWallet(testUser._id);
      
      // Create 5 transactions
      for (let i = 0; i < 5; i++) {
        await Transaction.create({
          user: testUser._id,
          type: i % 2 === 0 ? 'deposit' : 'bill_payment',
          amount: i % 2 === 0 ? 100 : -100,
          status: 'completed',
          reference: `test-reference-${i}`,
          description: `Transaction ${i}`,
          balanceBefore: i * 100,
          balanceAfter: (i + 1) * 100,
          currency: 'NGN'
        });
      }

      // Act
      const result = await WalletService.getTransactions(testUser._id, { page: 1, limit: 3 });

      // Assert
      expect(result).toBeDefined();
      expect(result.docs).toHaveLength(3);
      expect(result.totalDocs).toBe(5);
      expect(result.limit).toBe(3);
      expect(result.page).toBe(1);
      expect(result.totalPages).toBe(2);
      expect(result.hasNextPage).toBe(true);
      expect(result.hasPrevPage).toBe(false);
    });

    it('should return empty array if no transactions exist', async () => {
      // Act
      const result = await WalletService.getTransactions(testUser._id);

      // Assert
      expect(result).toBeDefined();
      expect(result.docs).toHaveLength(0);
      expect(result.totalDocs).toBe(0);
    });
  });
});