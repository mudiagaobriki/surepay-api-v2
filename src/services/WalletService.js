// Enhanced WalletService.js with atomic operations for virtual account credits
import Wallet from '../models/Wallet.js';
import Transaction from '../models/Transaction.js';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';

class WalletService {
  /**
   * Get user wallet, create if it doesn't exist
   * @param {ObjectId} userId - The user ID
   */
  async getOrCreateWallet(userId) {
    try {
      let wallet = await Wallet.findOne({ user: userId });

      if (!wallet) {
        wallet = await Wallet.create({
          user: userId,
          balance: 0,
          currency: 'NGN',
          status: 'active'
        });
      }

      return wallet;
    } catch (error) {
      console.error('Error getting/creating wallet:', error);
      throw error;
    }
  }

  /**
   * ⚠️ ENHANCED: Credit wallet with atomic operations and duplicate prevention
   * @param {ObjectId} userId - The user ID
   * @param {Number} amount - Amount to credit
   * @param {String} type - Transaction type
   * @param {String} reference - Payment reference
   * @param {Object} metadata - Additional transaction details
   */
  async creditWallet(userId, amount, type, reference, metadata = {}) {
    // Start a database session for atomic operations
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      console.log('WalletService: Starting credit operation', {
        userId,
        amount,
        type,
        reference
      });

      // Check if transaction already exists (duplicate prevention)
      const existingTransaction = await Transaction.findOne({ reference }).session(session);

      if (existingTransaction) {
        await session.abortTransaction();
        console.log('Transaction already exists:', reference);
        throw new Error(`Transaction with reference ${reference} already exists`);
      }

      // Get or create wallet
      const wallet = await this.getOrCreateWallet(userId);

      if (wallet.status !== 'active') {
        await session.abortTransaction();
        throw new Error(`Wallet is ${wallet.status}. Cannot process transaction.`);
      }

      // Update wallet balance atomically
      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore + amount;

      // Use findOneAndUpdate with session for atomic update
      const updatedWallet = await Wallet.findOneAndUpdate(
          { user: userId },
          { $inc: { balance: amount } },
          {
            new: true,
            session,
            runValidators: true
          }
      );

      if (!updatedWallet) {
        await session.abortTransaction();
        throw new Error('Failed to update wallet balance');
      }

      console.log('Wallet balance updated:', {
        before: balanceBefore,
        after: updatedWallet.balance,
        credited: amount
      });

      // Create transaction record atomically
      const transactionData = {
        user: userId,
        type,
        amount,
        status: 'completed',
        reference: reference || uuidv4(),
        description: metadata.description || `Wallet credited with ${amount} ${wallet.currency}`,
        metadata: {
          ...metadata,
          creditedAt: new Date(),
          balanceBefore,
          balanceAfter: updatedWallet.balance
        },
        balanceBefore,
        balanceAfter: updatedWallet.balance,
        currency: wallet.currency
      };

      const transaction = await Transaction.create([transactionData], { session });

      console.log('Transaction created:', transaction[0]._id);

      // Commit the transaction
      await session.commitTransaction();

      console.log('✅ Wallet credit completed successfully');

      return {
        success: true,
        balance: updatedWallet.balance,
        transaction: transaction[0],
        credited: amount
      };

    } catch (error) {
      // Rollback on any error
      await session.abortTransaction();
      console.error('Error crediting wallet:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * ⚠️ ENHANCED: Debit wallet with atomic operations
   * @param {ObjectId} userId - The user ID
   * @param {Number} amount - Amount to debit
   * @param {String} type - Transaction type
   * @param {String} reference - Payment reference
   * @param {Object} metadata - Additional transaction details
   */
  async debitWallet(userId, amount, type, reference, metadata = {}) {
    const session = await mongoose.startSession();
    session.startTransaction();

    try {
      console.log('WalletService: Starting debit operation', {
        userId,
        amount,
        type,
        reference
      });

      // Check if transaction already exists
      const existingTransaction = await Transaction.findOne({ reference }).session(session);

      if (existingTransaction) {
        await session.abortTransaction();
        throw new Error(`Transaction with reference ${reference} already exists`);
      }

      // Get wallet
      const wallet = await Wallet.findOne({ user: userId }).session(session);

      if (!wallet) {
        await session.abortTransaction();
        throw new Error('Wallet not found');
      }

      if (wallet.status !== 'active') {
        await session.abortTransaction();
        throw new Error(`Wallet is ${wallet.status}. Cannot process transaction.`);
      }

      if (wallet.balance < amount) {
        await session.abortTransaction();
        throw new Error('Insufficient funds');
      }

      const balanceBefore = wallet.balance;
      const balanceAfter = balanceBefore - amount;

      // Update wallet balance atomically
      const updatedWallet = await Wallet.findOneAndUpdate(
          { user: userId },
          { $inc: { balance: -amount } },
          {
            new: true,
            session,
            runValidators: true
          }
      );

      if (!updatedWallet) {
        await session.abortTransaction();
        throw new Error('Failed to update wallet balance');
      }

      console.log('Wallet balance updated:', {
        before: balanceBefore,
        after: updatedWallet.balance,
        debited: amount
      });

      // Create transaction record
      const transactionData = {
        user: userId,
        type,
        amount: -amount, // Negative for debit
        status: 'completed',
        reference: reference || uuidv4(),
        description: metadata.description || `Wallet debited with ${amount} ${wallet.currency}`,
        metadata: {
          ...metadata,
          debitedAt: new Date(),
          balanceBefore,
          balanceAfter: updatedWallet.balance
        },
        balanceBefore,
        balanceAfter: updatedWallet.balance,
        currency: wallet.currency
      };

      const transaction = await Transaction.create([transactionData], { session });

      // Commit the transaction
      await session.commitTransaction();

      console.log('✅ Wallet debit completed successfully');

      return {
        success: true,
        balance: updatedWallet.balance,
        transaction: transaction[0],
        debited: amount
      };

    } catch (error) {
      await session.abortTransaction();
      console.error('Error debiting wallet:', error);
      throw error;
    } finally {
      await session.endSession();
    }
  }

  /**
   * Get wallet balance
   * @param {ObjectId} userId - The user ID
   */
  async getBalance(userId) {
    try {
      const wallet = await this.getOrCreateWallet(userId);
      return {
        balance: wallet.balance,
        currency: wallet.currency,
        status: wallet.status
      };
    } catch (error) {
      console.error('Error getting wallet balance:', error);
      throw error;
    }
  }

  /**
   * Get user transactions with enhanced filtering
   * @param {ObjectId} userId - The user ID
   * @param {Object} options - Pagination and filter options
   */
  async getTransactions(userId, options = {}) {
    try {
      const {
        page = 1,
        limit = 20,
        type,
        status,
        startDate,
        endDate
      } = options;

      // Build query
      const query = { user: userId };

      if (type) {
        query.type = type;
      }

      if (status) {
        query.status = status;
      }

      if (startDate || endDate) {
        query.createdAt = {};
        if (startDate) {
          query.createdAt.$gte = new Date(startDate);
        }
        if (endDate) {
          query.createdAt.$lte = new Date(endDate);
        }
      }

      const transactions = await Transaction.paginate(query, {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { createdAt: -1 },
        populate: {
          path: 'user',
          select: 'email username firstName lastName'
        }
      });

      return transactions;
    } catch (error) {
      console.error('Error getting transactions:', error);
      throw error;
    }
  }

  /**
   * ⚠️ NEW: Get wallet statistics
   * @param {ObjectId} userId - The user ID
   */
  async getWalletStats(userId) {
    try {
      const [wallet, totalCredits, totalDebits, recentTransactions] = await Promise.all([
        this.getOrCreateWallet(userId),
        Transaction.aggregate([
          { $match: { user: new mongoose.Types.ObjectId(userId), amount: { $gt: 0 } } },
          { $group: { _id: null, total: { $sum: '$amount' }, count: { $sum: 1 } } }
        ]),
        Transaction.aggregate([
          { $match: { user: new mongoose.Types.ObjectId(userId), amount: { $lt: 0 } } },
          { $group: { _id: null, total: { $sum: { $abs: '$amount' } }, count: { $sum: 1 } } }
        ]),
        Transaction.find({ user: userId })
            .sort({ createdAt: -1 })
            .limit(5)
            .select('type amount status createdAt reference')
      ]);

      return {
        balance: wallet.balance,
        currency: wallet.currency,
        status: wallet.status,
        totalCredits: totalCredits[0]?.total || 0,
        totalDebits: totalDebits[0]?.total || 0,
        creditCount: totalCredits[0]?.count || 0,
        debitCount: totalDebits[0]?.count || 0,
        recentTransactions
      };
    } catch (error) {
      console.error('Error getting wallet stats:', error);
      throw error;
    }
  }

  /**
   * ⚠️ NEW: Verify transaction integrity
   * @param {ObjectId} userId - The user ID
   */
  async verifyWalletIntegrity(userId) {
    try {
      const wallet = await Wallet.findOne({ user: userId });
      if (!wallet) {
        throw new Error('Wallet not found');
      }

      // Calculate expected balance from transactions
      const transactions = await Transaction.find({ user: userId, status: 'completed' });
      const calculatedBalance = transactions.reduce((sum, tx) => sum + tx.amount, 0);

      const isIntegrityValid = Math.abs(wallet.balance - calculatedBalance) < 0.01; // Allow for floating point precision

      return {
        walletBalance: wallet.balance,
        calculatedBalance,
        difference: wallet.balance - calculatedBalance,
        isValid: isIntegrityValid,
        transactionCount: transactions.length
      };
    } catch (error) {
      console.error('Error verifying wallet integrity:', error);
      throw error;
    }
  }
}

export default new WalletService();