// services/PaymentService.js - FINAL VERSION with no double conversion
import PaystackService from './PaystackService.js';
import MonnifyService from './MonnifyService.js';
import crypto from 'crypto';

class PaymentService {
  /**
   * Initialize a payment transaction - FINAL FIX
   * @param {string} gateway - Payment gateway (paystack or monnify)
   * @param {Object} data - Transaction data with amount in NAIRA
   */
  async initializeTransaction(gateway, data) {
    try {
      console.log(`=== INITIALIZING ${gateway.toUpperCase()} TRANSACTION ===`);
      console.log('Input data:', {
        email: data.email,
        amount: data.amount, // Should be in naira
        reference: data.reference,
        gateway
      });

      let response;
      let processedData = { ...data };

      switch (gateway.toLowerCase()) {
        case 'paystack':
          // ⚠️ CRITICAL: Convert naira to kobo ONLY here, ONLY once
          const originalAmount = data.amount;
          const amountInKobo = Math.round(originalAmount * 100); // Round to avoid floating point issues

          processedData.amount = amountInKobo;

          console.log('Paystack amount conversion:', {
            originalNaira: originalAmount,
            convertedKobo: amountInKobo,
            calculation: `${originalAmount} * 100 = ${amountInKobo}`
          });

          // Call PaystackService - it should NOT convert again
          response = await PaystackService.initializeTransaction(processedData);

          console.log('Paystack response:', {
            status: response.status,
            hasData: !!response.data,
            hasAuthUrl: !!response.data?.authorization_url
          });

          return {
            success: response.status === true,
            authorizationUrl: response.data?.authorization_url,
            reference: response.data?.reference,
            accessCode: response.data?.access_code,
            gateway: 'paystack',
            gatewayResponse: response
          };

        case 'monnify':
          // Monnify uses naira directly - NO conversion needed
          console.log('Monnify payload:', {
            amount: processedData.amount, // Keep in naira
            customerEmail: processedData.email,
            paymentReference: processedData.reference
          });

          response = await MonnifyService.initializeTransaction(processedData);

          console.log('Monnify response:', response);

          return {
            success: response.success === true,
            authorizationUrl: response.authorizationUrl,
            reference: response.reference,
            accessCode: response.accessCode,
            gateway: 'monnify',
            gatewayResponse: response
          };

        default:
          throw new Error(`Unsupported payment gateway: ${gateway}`);
      }
    } catch (error) {
      console.error(`${gateway} initializeTransaction error:`, error);
      throw error;
    }
  }

  /**
   * Verify a payment transaction - ENSURE AMOUNT IN NAIRA
   * @param {string} gateway - Payment gateway
   * @param {string} reference - Transaction reference
   * @returns {Object} - Verification result with amount in NAIRA
   */
  async verifyTransaction(gateway, reference) {
    try {
      console.log(`=== VERIFYING ${gateway.toUpperCase()} TRANSACTION ===`);
      console.log('Reference:', reference);

      let response;

      switch (gateway.toLowerCase()) {
        case 'paystack':
          response = await PaystackService.verifyTransaction(reference);

          console.log('Paystack verification response:', {
            status: response.status,
            hasData: !!response.data,
            transactionStatus: response.data?.status,
            amountInKobo: response.data?.amount
          });

          if (response.status === true && response.data) {
            const transactionData = response.data;
            const isSuccessful = transactionData.status === 'success';

            const statusMapping = {
              'success': 'success',
              'failed': 'failed',
              'abandoned': 'failed',
              'cancelled': 'failed',
              'pending': 'pending',
              'ongoing': 'pending',
              'processing': 'pending'
            };

            const mappedStatus = statusMapping[transactionData.status] || 'failed';

            // ⚠️ CRITICAL: Convert kobo back to naira - ONLY place this happens
            const amountInNaira = Math.round(transactionData.amount / 100);

            console.log('Paystack amount conversion (verification):', {
              gatewayAmountKobo: transactionData.amount,
              convertedNaira: amountInNaira,
              calculation: `${transactionData.amount} / 100 = ${amountInNaira}`
            });

            return {
              success: isSuccessful,
              status: mappedStatus,
              reference: transactionData.reference,
              amount: amountInNaira, // ✅ Always return in naira
              channel: transactionData.channel,
              paidAt: transactionData.paid_at ? new Date(transactionData.paid_at) : null,
              gateway: 'paystack',
              customer: transactionData.customer,
              currency: transactionData.currency,
              gatewayResponse: transactionData,
              message: isSuccessful
                  ? 'Transaction verified successfully'
                  : `Transaction ${transactionData.status}`
            };
          } else {
            return {
              success: false,
              status: 'failed',
              reference,
              gateway: 'paystack',
              amount: 0,
              message: response.message || 'Transaction verification failed',
              gatewayResponse: response
            };
          }

        case 'monnify':
          response = await MonnifyService.verifyTransaction(reference);

          console.log('Monnify verification response:', response);

          // ⚠️ FIXED: Handle Monnify response properly
          if (response.success === true) {
            return {
              success: true,
              status: response.status,
              reference: response.reference,
              amount: response.amount, // Already in naira from MonnifyService
              channel: response.channel,
              paidAt: response.paidAt,
              gateway: 'monnify',
              customer: response.customer,
              currency: 'NGN',
              gatewayResponse: response.gatewayResponse,
              message: response.message || 'Transaction verified successfully'
            };
          } else {
            return {
              success: false,
              status: response.status || 'failed',
              reference,
              gateway: 'monnify',
              amount: 0,
              message: response.message || 'Transaction verification failed',
              gatewayResponse: response.gatewayResponse
            };
          }

        default:
          throw new Error(`Unsupported payment gateway: ${gateway}`);
      }
    } catch (error) {
      console.error(`${gateway} verifyTransaction error:`, error);

      return {
        success: false,
        status: 'error',
        reference,
        gateway,
        amount: 0,
        message: error.message || 'Verification failed due to network error',
        error: error.response?.data || error.message
      };
    }
  }

  /**
   * Create a virtual account
   */
  async createVirtualAccount(data) {
    try {
      console.log('Creating virtual account with data:', data);

      const response = await MonnifyService.reserveAccount(data);

      console.log('MonnifyService.reserveAccount response:', {
        success: response.success,
        hasAccounts: !!response.accounts,
        accountCount: response.accounts?.length
      });

      if (!response.success) {
        throw new Error(response.message || 'Failed to create virtual account');
      }

      return {
        success: true,
        reference: response.reference,
        accounts: response.accounts,
        status: response.status || 'ACTIVE',
        reservationReference: response.reservationReference,
        customerEmail: response.customerEmail,
        customerName: response.customerName
      };
    } catch (error) {
      console.error('PaymentService createVirtualAccount error:', error);
      throw error;
    }
  }

  /**
   * Get virtual account details
   */
  async getVirtualAccount(accountReference) {
    try {
      return await MonnifyService.getReservedAccount(accountReference);
    } catch (error) {
      console.error('PaymentService getVirtualAccount error:', error);
      throw error;
    }
  }

  /**
   * List banks for a gateway
   */
  async listBanks(gateway) {
    try {
      switch (gateway.toLowerCase()) {
        case 'paystack':
          const paystackResponse = await PaystackService.listBanks();
          return {
            success: paystackResponse.status === true,
            banks: paystackResponse.data || []
          };

        case 'monnify':
          return await MonnifyService.listBanks();

        default:
          throw new Error(`Unsupported payment gateway: ${gateway}`);
      }
    } catch (error) {
      console.error(`${gateway} listBanks error:`, error);
      throw error;
    }
  }

  /**
   * Verify webhook signature
   */
  // verifyWebhookSignature(gateway, signature, payload) {
  //   try {
  //     console.log(`Verifying ${gateway} webhook signature`);
  //
  //     switch (gateway.toLowerCase()) {
  //       case 'paystack':
  //         const paystackSecret = process.env.PAYSTACK_SECRET_KEY;
  //         if (!paystackSecret || !signature) {
  //           console.error('Missing Paystack secret key or signature');
  //           return false;
  //         }
  //
  //         const hash = crypto.createHmac('sha512', paystackSecret)
  //             .update(JSON.stringify(payload))
  //             .digest('hex');
  //         const isValid = hash === signature;
  //
  //         console.log('Paystack signature verification:', {
  //           provided: signature?.substring(0, 10) + '...',
  //           computed: hash?.substring(0, 10) + '...',
  //           isValid
  //         });
  //
  //         return isValid;
  //
  //       case 'monnify':
  //         return MonnifyService.verifyWebhookSignature(signature, payload);
  //
  //       default:
  //         console.error(`Unsupported gateway for webhook: ${gateway}`);
  //         return false;
  //     }
  //   } catch (error) {
  //     console.error(`${gateway} webhook verification error:`, error);
  //     return false;
  //   }
  // }

  /**
   * ⚠️ CRITICAL FIX: Enhanced webhook signature verification
   */
  verifyWebhookSignature(gateway, signature, payload) {
    try {
      console.log(`PaymentService: Verifying ${gateway} webhook signature`);
      console.log('Signature received:', signature);

      if (!signature) {
        console.error('No signature provided');
        return false;
      }

      if (gateway === 'paystack') {
        return this.verifyPaystackWebhook(signature, payload);
      } else if (gateway === 'monnify') {
        return this.verifyMonnifyWebhook(signature, payload);
      } else {
        console.error(`Unsupported gateway for webhook: ${gateway}`);
        return false;
      }
    } catch (error) {
      console.error(`PaymentService: Webhook verification error for ${gateway}:`, error);
      return false;
    }
  }

  /**
   * ⚠️ FIXED: Verify Paystack webhook signature
   */
  verifyPaystackWebhook(signature, payload) {
    try {
      const secretKey = process.env.PAYSTACK_SECRET_KEY;

      if (!secretKey) {
        console.error('Paystack secret key not configured');
        return false;
      }

      console.log('Using Paystack secret key:', secretKey ? 'SET' : 'NOT SET');
      console.log('Payload type:', typeof payload);
      console.log('Payload preview:', JSON.stringify(payload).substring(0, 200) + '...');

      // ⚠️ CRITICAL: Ensure payload is stringified consistently
      let payloadString;
      if (typeof payload === 'string') {
        payloadString = payload;
      } else if (typeof payload === 'object') {
        // Use JSON.stringify without spaces for consistency
        payloadString = JSON.stringify(payload);
      } else {
        payloadString = String(payload);
      }

      console.log('Payload string length:', payloadString.length);
      console.log('Payload string preview:', payloadString.substring(0, 100) + '...');

      // Generate expected signature using the same method as the client
      const expectedSignature = crypto
          .createHmac('sha512', secretKey)
          .update(payloadString)
          .digest('hex');

      console.log('Expected Paystack signature:', expectedSignature);
      console.log('Received signature:', signature);
      console.log('Signature lengths - Expected:', expectedSignature.length, 'Received:', signature.length);

      // ⚠️ CRITICAL: Handle both with and without 'sha512=' prefix
      const cleanReceivedSignature = signature.startsWith('sha512=')
          ? signature.replace('sha512=', '')
          : signature;

      const cleanExpectedSignature = expectedSignature;

      console.log('Clean expected signature:', cleanExpectedSignature);
      console.log('Clean received signature:', cleanReceivedSignature);

      // Compare signatures (case-insensitive for safety)
      const isValid = cleanExpectedSignature.toLowerCase() === cleanReceivedSignature.toLowerCase();

      if (!isValid) {
        console.error('❌ Paystack webhook signature mismatch');
        console.error('Expected (clean):', cleanExpectedSignature);
        console.error('Received (clean):', cleanReceivedSignature);

        // Debug: Try alternative payload formatting
        const alternativePayload = JSON.stringify(payload, null, 0); // No spacing
        const alternativeSignature = crypto
            .createHmac('sha512', secretKey)
            .update(alternativePayload)
            .digest('hex');
        console.log('Alternative signature attempt:', alternativeSignature);

        // Check if alternative matches
        if (alternativeSignature.toLowerCase() === cleanReceivedSignature.toLowerCase()) {
          console.log('✅ Alternative signature matched!');
          return true;
        }
      } else {
        console.log('✅ Paystack webhook signature verified successfully');
      }

      return isValid;
    } catch (error) {
      console.error('❌ Paystack webhook verification error:', error);
      return false;
    }
  }

  /**
   * ⚠️ FIXED: Verify Monnify webhook signature
   */
  verifyMonnifyWebhook(signature, payload) {
    try {
      const secretKey = process.env.MONNIFY_SECRET_KEY;

      if (!secretKey) {
        console.error('Monnify secret key not configured');
        return false;
      }

      console.log('Using Monnify secret key:', secretKey ? 'SET' : 'NOT SET');
      console.log('Monnify payload type:', typeof payload);

      // ⚠️ CRITICAL: Ensure payload is stringified consistently
      let payloadString;
      if (typeof payload === 'string') {
        payloadString = payload;
      } else if (typeof payload === 'object') {
        payloadString = JSON.stringify(payload);
      } else {
        payloadString = String(payload);
      }

      console.log('Monnify payload string preview:', payloadString.substring(0, 100) + '...');

      // Generate expected signature
      const expectedSignature = crypto
          .createHmac('sha512', secretKey)
          .update(payloadString)
          .digest('hex');

      console.log('Expected Monnify signature:', expectedSignature);
      console.log('Received Monnify signature:', signature);

      // Handle potential prefixes
      const cleanReceivedSignature = signature.startsWith('sha512=')
          ? signature.replace('sha512=', '')
          : signature;

      // Compare signatures
      const isValid = expectedSignature.toLowerCase() === cleanReceivedSignature.toLowerCase();

      if (!isValid) {
        console.error('❌ Monnify webhook signature mismatch');
        console.error('Expected:', expectedSignature);
        console.error('Received:', cleanReceivedSignature);

        // Try the MonnifyService verification as backup
        try {
          const monnifyServiceResult = MonnifyService.verifyWebhookSignature(signature, payload);
          console.log('MonnifyService verification result:', monnifyServiceResult);
          return monnifyServiceResult;
        } catch (serviceError) {
          console.error('MonnifyService verification also failed:', serviceError);
        }
      } else {
        console.log('✅ Monnify webhook signature verified successfully');
      }

      return isValid;
    } catch (error) {
      console.error('❌ Monnify webhook verification error:', error);
      return false;
    }
  }

  /**
   * ⚠️ CRITICAL FIX: Process webhook data consistently
   */
  processWebhookData(gateway, rawData) {
    try {
      console.log(`PaymentService: Processing ${gateway} webhook data`);

      if (gateway === 'paystack') {
        return this.processPaystackWebhook(rawData);
      } else if (gateway === 'monnify') {
        return this.processMonnifyWebhook(rawData);
      } else {
        return {
          success: false,
          message: `Unsupported gateway: ${gateway}`
        };
      }
    } catch (error) {
      console.error(`PaymentService: Webhook processing error for ${gateway}:`, error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Process Paystack webhook data
   */
  processPaystackWebhook(data) {
    try {
      if (data.event === 'charge.success') {
        const transaction = data.data;

        return {
          success: true,
          reference: transaction.reference,
          amount: transaction.amount / 100, // Convert from kobo to naira
          status: transaction.status,
          channel: transaction.channel || 'paystack',
          paidAt: transaction.paid_at ? new Date(transaction.paid_at) : new Date(),
          gateway: 'paystack',
          customer: transaction.customer,
          metadata: transaction.metadata
        };
      } else {
        return {
          success: false,
          message: `Unhandled Paystack event: ${data.event}`
        };
      }
    } catch (error) {
      console.error('Paystack webhook processing error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * Process Monnify webhook data
   */
  processMonnifyWebhook(data) {
    try {
      if (data.eventType === 'SUCCESSFUL_TRANSACTION') {
        const eventData = data.eventData;

        return {
          success: true,
          reference: eventData.paymentReference,
          amount: eventData.amountPaid, // Already in naira
          status: 'success',
          channel: 'bank_transfer',
          paidAt: eventData.paidOn ? new Date(eventData.paidOn) : new Date(),
          gateway: 'monnify',
          accountNumber: eventData.destinationAccountNumber,
          senderName: eventData.customerName,
          senderAccount: eventData.sourceAccountNumber,
          senderBank: eventData.sourceBankName
        };
      } else {
        return {
          success: false,
          message: `Unhandled Monnify event: ${data.eventType}`
        };
      }
    } catch (error) {
      console.error('Monnify webhook processing error:', error);
      return {
        success: false,
        message: error.message
      };
    }
  }

  /**
   * ⚠️ NEW: Enhanced webhook handler for virtual account credits
   */
  // async handleVirtualAccountCredit(webhookData) {
  //   try {
  //     console.log('PaymentService: Handling virtual account credit');
  //
  //     const { amount, reference, accountNumber, senderName, senderAccount, senderBank } = webhookData;
  //
  //     // Import required models dynamically to avoid circular dependencies
  //     const { default: VirtualAccount } = await import('../models/VirtualAccount.js');
  //     const { default: WalletService } = await import('./WalletService.js');
  //     const { default: Transaction } = await import('../models/Transaction.js');
  //     const { sendTransactionNotificationEmail } = await import('../../utils/emails/sendEmails.js');
  //
  //     // Find virtual account by account number
  //     const virtualAccount = await VirtualAccount.findOne({
  //       'accounts.accountNumber': accountNumber
  //     }).populate('user', 'email firstName username');
  //
  //     if (!virtualAccount) {
  //       console.error('Virtual account not found for:', accountNumber);
  //       throw new Error('Virtual account not found');
  //     }
  //
  //     console.log('Virtual account found for user:', virtualAccount.user._id);
  //
  //     // Check if transaction already exists to prevent duplicates
  //     const existingTransaction = await Transaction.findOne({
  //       reference: reference
  //     });
  //
  //     if (existingTransaction) {
  //       console.log('Transaction already processed:', reference);
  //       return {
  //         success: true,
  //         message: 'Transaction already processed',
  //         transactionId: existingTransaction._id
  //       };
  //     }
  //
  //     // Credit the user's wallet
  //     console.log('Crediting wallet:', {
  //       userId: virtualAccount.user._id,
  //       amount: amount,
  //       reference: reference
  //     });
  //
  //     const creditResult = await WalletService.creditWallet(
  //         virtualAccount.user._id,
  //         amount,
  //         'virtual_account_credit',
  //         reference,
  //         {
  //           virtualAccountNumber: accountNumber,
  //           senderName: senderName,
  //           senderAccount: senderAccount,
  //           senderBank: senderBank,
  //           description: `Bank transfer from ${senderName}`,
  //           gateway: 'monnify'
  //         }
  //     );
  //
  //     console.log('Wallet credited successfully');
  //
  //     // Find the created transaction for email notification
  //     const transactionCreated = await Transaction.findOne({
  //       reference: reference
  //     });
  //
  //     // Send email notification
  //     if (transactionCreated && virtualAccount.user) {
  //       try {
  //         await sendTransactionNotificationEmail(transactionCreated, virtualAccount.user);
  //         console.log('Virtual account credit email sent successfully');
  //       } catch (emailError) {
  //         console.error('Error sending virtual account credit email:', emailError);
  //         // Don't fail the credit process if email fails
  //       }
  //     }
  //
  //     return {
  //       success: true,
  //       message: 'Virtual account credited successfully',
  //       amount: amount,
  //       userId: virtualAccount.user._id,
  //       transactionId: transactionCreated?._id
  //     };
  //
  //   } catch (error) {
  //     console.error('PaymentService: Virtual account credit error:', error);
  //     throw error;
  //   }
  // }

  async handleVirtualAccountCredit(webhookData) {
    try {
      console.log('PaymentService: Handling virtual account credit');

      const { amount, reference, accountNumber, senderName, senderAccount, senderBank } = webhookData;

      // Import required models dynamically to avoid circular dependencies
      const { default: VirtualAccount } = await import('../models/VirtualAccount.js');
      const { default: WalletService } = await import('./WalletService.js');
      const { default: Transaction } = await import('../models/Transaction.js');
      const { sendTransactionNotificationEmail } = await import('../../utils/emails/sendEmails.js');

      // Find virtual account by account number with retry logic
      let virtualAccount = null;
      let retryCount = 0;
      const maxRetries = 3;

      while (!virtualAccount && retryCount < maxRetries) {
        try {
          virtualAccount = await VirtualAccount.findOne({
            'accounts.accountNumber': accountNumber
          }).populate('user', 'email firstName username');

          if (!virtualAccount) {
            retryCount++;
            console.log(`Virtual account not found, retry ${retryCount}/${maxRetries}`);
            if (retryCount < maxRetries) {
              await new Promise(resolve => setTimeout(resolve, 1000));
            }
          }
        } catch (dbError) {
          console.error(`Database error on retry ${retryCount}:`, dbError);
          retryCount++;
          if (retryCount < maxRetries) {
            await new Promise(resolve => setTimeout(resolve, 1000));
          }
        }
      }

      if (!virtualAccount) {
        console.error('Virtual account not found after retries for:', accountNumber);
        throw new Error('Virtual account not found');
      }

      console.log('Virtual account found for user:', virtualAccount.user._id);

      // Check if transaction already exists to prevent duplicates
      const existingTransaction = await Transaction.findOne({
        reference: reference
      });

      if (existingTransaction) {
        console.log('Transaction already processed:', reference);
        return {
          success: true,
          message: 'Transaction already processed',
          transactionId: existingTransaction._id
        };
      }

      // Credit the user's wallet using WalletService
      console.log('Crediting wallet:', {
        userId: virtualAccount.user._id,
        amount: amount,
        reference: reference
      });

      const creditResult = await WalletService.creditWallet(
          virtualAccount.user._id,
          amount,
          'virtual_account_credit',
          reference,
          {
            virtualAccountNumber: accountNumber,
            senderName: senderName,
            senderAccount: senderAccount,
            senderBank: senderBank,
            description: `Bank transfer from ${senderName}`,
            gateway: 'monnify',
            productType: 'RESERVED_ACCOUNT',
            processedAt: new Date()
          }
      );

      console.log('Wallet credited successfully');

      // Find the created transaction for email notification
      const transactionCreated = await Transaction.findOne({
        reference: reference
      });

      // Send email notification
      if (transactionCreated && virtualAccount.user) {
        try {
          await sendTransactionNotificationEmail(transactionCreated, virtualAccount.user);
          console.log('Virtual account credit email sent successfully');
        } catch (emailError) {
          console.error('Error sending virtual account credit email:', emailError);
          // Don't fail the credit process if email fails
        }
      }

      return {
        success: true,
        message: 'Virtual account credited successfully',
        amount: amount,
        userId: virtualAccount.user._id,
        transactionId: transactionCreated?._id
      };

    } catch (error) {
      console.error('PaymentService: Virtual account credit error:', error);
      throw error;
    }
  }

  /**
   * Process webhook data with proper amount handling
   */
  // processWebhookData(gateway, payload) {
  //   try {
  //     console.log(`Processing ${gateway} webhook data:`, {
  //       event: payload.event || payload.eventType,
  //       hasData: !!(payload.data || payload.eventData)
  //     });
  //
  //     switch (gateway.toLowerCase()) {
  //       case 'paystack':
  //         if (payload.event === 'charge.success') {
  //           const data = payload.data;
  //           return {
  //             success: true,
  //             reference: data.reference,
  //             amount: Math.round(data.amount / 100), // Convert kobo to naira
  //             channel: data.channel,
  //             paidAt: new Date(data.paid_at),
  //             customer: data.customer,
  //             gateway: 'paystack',
  //             eventType: payload.event
  //           };
  //         }
  //
  //         if (payload.event === 'charge.failed') {
  //           return {
  //             success: false,
  //             reference: payload.data.reference,
  //             message: 'Payment failed',
  //             gateway: 'paystack',
  //             eventType: payload.event
  //           };
  //         }
  //
  //         break;
  //
  //       case 'monnify':
  //         if (payload.eventType === 'SUCCESSFUL_TRANSACTION') {
  //           const eventData = payload.eventData;
  //           return {
  //             success: true,
  //             reference: eventData.paymentReference,
  //             amount: eventData.amountPaid, // Already in naira
  //             channel: eventData.paymentMethod,
  //             paidAt: new Date(eventData.paidOn),
  //             customer: { email: eventData.customer?.email },
  //             gateway: 'monnify',
  //             eventType: payload.eventType
  //           };
  //         }
  //         break;
  //
  //       default:
  //         return {
  //           success: false,
  //           message: `Unsupported gateway: ${gateway}`,
  //           eventType: payload.event || payload.eventType
  //         };
  //     }
  //
  //     return {
  //       success: false,
  //       message: 'Unhandled webhook event',
  //       eventType: payload.event || payload.eventType
  //     };
  //   } catch (error) {
  //     console.error('PaymentService processWebhookData error:', error);
  //     return {
  //       success: false,
  //       message: error.message,
  //       eventType: payload.event || payload.eventType
  //     };
  //   }
  // }
}

export default new PaymentService();