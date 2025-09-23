// Enhanced WalletController with email notifications for key sections
import WalletService from '../services/WalletService.js';
import PaymentService from '../services/PaymentService.js';
import Payment from '../models/Payment.js';
import Transaction from '../models/Transaction.js';
import VirtualAccount from '../models/VirtualAccount.js';
import User from '../models/User.js';
import { sendTransactionNotificationEmail } from '../../utils/emails/sendEmails.js';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';
import mongoose from 'mongoose';

function WalletController() {
  /**
   * Get wallet balance
   */
  const getWalletBalance = async (req, res) => {
    try {
      const userId = req.user.id;
      const walletInfo = await WalletService.getBalance(userId);

      res.status(200).json({
        data: walletInfo
      });
    } catch (error) {
      console.error('Error fetching wallet balance:', error);
      res.status(500).json({
        message: 'Failed to fetch wallet balance',
        error: error.message
      });
    }
  };

  /**
   * Get transaction history
   */
  const getTransactionHistory = async (req, res) => {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10, type } = req.query;

      const query = { user: userId };

      if (type) {
        query.type = type;
      }

      const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { createdAt: -1 }
      };

      const transactions = await Transaction.paginate(query, options);

      res.status(200).json(transactions);
    } catch (error) {
      console.error('Error fetching transaction history:', error);
      res.status(500).json({
        message: 'Failed to fetch transaction history',
        error: error.message
      });
    }
  };

  /**
   * Fund wallet with payment gateway - FIXED AMOUNT CONVERSION
   */
  const fundWallet = async (req, res) => {
    try {
      const schema = Joi.object({
        amount: Joi.number().min(100).max(1000000).required(),
        gateway: Joi.string().valid('paystack', 'monnify').required(),
        callbackUrl: Joi.string().uri().optional(),
        redirectUrl: Joi.string().uri().optional()
      });

      const { error, value } = schema.validate(req.body, { abortEarly: false });

      if (error) {
        return res.status(400).json({
          success: false,
          message: 'Validation error',
          details: error.details.map(err => err.message)
        });
      }

      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Generate unique reference - shortened to 16 chars, alphanumeric, starts with letter
      const reference = `h${(Date.now() + Math.random() * 1000000).toString(36).substring(0, 15)}`;

      console.log('Funding wallet:', {
        userId,
        amount: value.amount,
        gateway: value.gateway,
        reference
      });

      // Get or create wallet
      const wallet = await WalletService.getOrCreateWallet(userId);

      // Create payment record - STORE AMOUNT IN NAIRA
      const payment = await Payment.create({
        user: userId,
        amount: value.amount, // Store in naira (e.g., 1000)
        currency: 'NGN',
        reference,
        gateway: value.gateway,
        status: 'pending',
        walletId: wallet._id,
        metadata: {
          purpose: 'wallet_funding',
          userAgent: req.headers['user-agent'],
          ipAddress: req.ip
        }
      });

      // Prepare payment data for gateway
      const baseUrl = process.env.APP_URL || 'https://yourdomain.com';
      const frontendUrl = process.env.FRONTEND_URL || 'https://yourapp.com';

      const callbackUrl = value.callbackUrl || `${baseUrl}/api/wallet/callback`;
      const redirectUrl = value.redirectUrl || `${frontendUrl}/wallet/success`;

      // ⚠️ CRITICAL FIX: Let PaymentService handle amount conversion
      const paymentData = {
        email: user.email,
        amount: value.amount, // Pass amount in NAIRA - let PaymentService convert to kobo for Paystack
        reference,
        callbackUrl,
        redirectUrl,
        customerName: user.username || user.firstName || user.email.split('@')[0],
        description: `Wallet funding - ${formatCurrency(value.amount)}`,
        metadata: {
          userId: userId,
          paymentId: payment._id.toString(),
          walletId: wallet._id.toString(),
          purpose: 'wallet_funding',
          custom_fields: [
            {
              display_name: "Purpose",
              variable_name: "purpose",
              value: "wallet_funding"
            }
          ]
        }
      };

      console.log('Payment data:', paymentData);

      console.log('Initializing payment with gateway:', value.gateway);

      // Initialize transaction with payment gateway
      const initResponse = await PaymentService.initializeTransaction(
          value.gateway,
          paymentData
      );

      console.log('Gateway initialization response:', {
        success: initResponse.success,
        hasUrl: !!initResponse.authorizationUrl,
        reference: initResponse.reference,
        error: initResponse.error
      });

      if (!initResponse.success) {
        payment.status = 'failed';
        payment.gatewayResponse = initResponse;
        await payment.save();

        return res.status(400).json({
          success: false,
          message: 'Failed to initialize payment with gateway',
          error: initResponse.message || initResponse.gatewayResponse?.message || 'Gateway error',
          details: initResponse
        });
      }

      // Update payment record with gateway response
      payment.paymentUrl = initResponse.authorizationUrl;
      payment.gatewayReference = initResponse.reference || reference;
      payment.gatewayResponse = initResponse.gatewayResponse || initResponse;
      await payment.save();

      console.log('Payment record updated:', payment._id);

      res.status(200).json({
        success: true,
        message: 'Wallet funding initiated successfully',
        data: {
          reference,
          amount: value.amount, // Return amount in naira
          gateway: value.gateway,
          authorizationUrl: initResponse.authorizationUrl,
          paymentUrl: initResponse.authorizationUrl,
          accessCode: initResponse.accessCode
        }
      });

    } catch (error) {
      console.error('Error initiating wallet funding:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to initiate wallet funding',
        error: error.message
      });
    }
  };

  /**
   * Verify payment and credit wallet - ENHANCED WITH EMAIL NOTIFICATIONS
   */
  const verifyPayment = async (req, res) => {
    try {
      const { reference } = req.params;

      if (!reference) {
        return res.status(400).json({
          success: false,
          message: 'Payment reference is required'
        });
      }

      console.log('=== PAYMENT VERIFICATION START ===');
      console.log('Verifying payment reference:', reference);

      // Find payment record
      const payment = await Payment.findOne({
        $or: [
          { reference },
          { gatewayReference: reference }
        ]
      }).populate('user', 'email firstName username');

      if (!payment) {
        console.log('Payment not found for reference:', reference);
        return res.status(404).json({
          success: false,
          message: 'Payment not found',
          data: {
            status: 'not_found',
            reference
          }
        });
      }

      console.log('Payment found:', {
        id: payment._id,
        status: payment.status,
        amount: payment.amount, // This should be in naira
        gateway: payment.gateway,
        walletCredited: payment.walletCredited
      });

      // If payment is already successful and wallet credited, return success
      if (payment.status === 'success' && payment.walletCredited) {
        console.log('Payment already verified and processed');
        return res.status(200).json({
          success: true,
          message: 'Payment already verified and processed',
          data: {
            status: payment.status,
            amount: payment.amount,
            reference: payment.reference,
            gateway: payment.gateway,
            paidAt: payment.paidAt
          }
        });
      }

      // Verify payment with gateway
      console.log('Verifying with gateway:', payment.gateway);

      let verificationResult;
      try {
        verificationResult = await PaymentService.verifyTransaction(
            payment.gateway,
            payment.gatewayReference || payment.reference
        );

        console.log('Gateway verification result:', {
          success: verificationResult.success,
          status: verificationResult.status,
          amount: verificationResult.amount, // PaymentService returns this in naira
          reference: verificationResult.reference,
          message: verificationResult.message
        });
      } catch (verificationError) {
        console.error('Gateway verification error:', verificationError);

        return res.status(500).json({
          success: false,
          message: 'Payment verification failed',
          error: verificationError.message,
          data: {
            status: 'verification_error',
            reference: payment.reference,
            gateway: payment.gateway
          }
        });
      }

      // Handle verification result
      if (!verificationResult.success) {
        console.log('Verification failed:', verificationResult.message);

        payment.status = 'failed';
        payment.gatewayResponse = {
          ...payment.gatewayResponse,
          verification: verificationResult,
          verificationFailedAt: new Date()
        };
        await payment.save();

        return res.status(200).json({
          success: false,
          message: verificationResult.message || 'Payment verification failed',
          data: {
            status: 'failed',
            amount: payment.amount,
            reference: payment.reference,
            gateway: payment.gateway,
            error: verificationResult.message
          }
        });
      }

      // ⚠️ CRITICAL FIX: Compare amounts properly
      // Both payment.amount and verificationResult.amount should be in naira now
      const expectedAmount = payment.amount; // In naira from database
      const verifiedAmount = verificationResult.amount; // In naira from PaymentService

      console.log('Amount verification:', {
        expected: expectedAmount,
        verified: verifiedAmount,
        gateway: payment.gateway,
        match: Math.abs(verifiedAmount - expectedAmount) <= 1
      });

      if (Math.abs(verifiedAmount - expectedAmount) > 1) {
        console.error('Amount mismatch:', { expected: expectedAmount, verified: verifiedAmount });

        payment.status = 'failed';
        payment.gatewayResponse = {
          ...payment.gatewayResponse,
          verification: verificationResult,
          amountMismatch: { expected: expectedAmount, verified: verifiedAmount }
        };
        await payment.save();

        return res.status(400).json({
          success: false,
          message: 'Payment amount verification failed',
          data: {
            status: 'amount_mismatch',
            reference: payment.reference
          }
        });
      }

      // Update payment record with successful verification
      payment.status = verificationResult.status === 'success' ? 'success' : 'failed';
      payment.gatewayResponse = {
        ...payment.gatewayResponse,
        verification: verificationResult
      };
      payment.channel = verificationResult.channel;
      payment.paidAt = verificationResult.paidAt ? new Date(verificationResult.paidAt) : new Date();
      payment.verifiedAt = new Date();
      await payment.save();

      console.log('Payment record updated with verification result');

      let emailSent = false;
      let transactionCreated = null;

      // Credit wallet if payment is successful and not already credited
      if (payment.status === 'success' && !payment.walletCredited) {
        console.log('Crediting wallet:', {
          userId: payment.user._id,
          amount: payment.amount, // In naira
          reference: payment.reference
        });

        try {
          // Check if transaction already exists before crediting
          const existingTransaction = await Transaction.findOne({
            reference: payment.reference
          });

          if (existingTransaction) {
            console.log('Transaction already exists, marking payment as credited');
            payment.walletCredited = true;
            payment.walletCreditedAt = new Date();
            await payment.save();
            transactionCreated = existingTransaction;
          } else {
            const creditResult = await WalletService.creditWallet(
                payment.user._id,
                payment.amount, // Credit the naira amount
                'deposit',
                payment.reference,
                {
                  paymentId: payment._id,
                  gateway: payment.gateway,
                  channel: payment.channel,
                  description: `Wallet funded via ${payment.gateway}`,
                  gatewayReference: payment.gatewayReference,
                  verifiedAt: payment.verifiedAt
                }
            );

            payment.walletCredited = true;
            payment.walletCreditedAt = new Date();
            await payment.save();

            // Find the created transaction for email
            transactionCreated = await Transaction.findOne({
              reference: payment.reference
            });

            console.log('Wallet credited successfully');
          }

          // Send email notification for successful wallet funding
          if (transactionCreated && payment.user) {
            try {
              await sendTransactionNotificationEmail(transactionCreated, payment.user);
              emailSent = true;
              console.log('Wallet funding email sent successfully');
            } catch (emailError) {
              console.error('Error sending wallet funding email:', emailError);
              // Don't fail the transaction if email fails
            }
          }

        } catch (walletError) {
          console.error('Error crediting wallet:', walletError);

          // If it's a duplicate key error, mark as credited since it means the transaction exists
          if (walletError.code === 11000 && walletError.keyPattern?.reference) {
            console.log('Duplicate transaction detected, marking as credited');
            payment.walletCredited = true;
            payment.walletCreditedAt = new Date();
            await payment.save();
          } else {
            return res.status(500).json({
              success: false,
              message: 'Payment verified but wallet credit failed',
              error: walletError.message,
              data: {
                status: 'credit_failed',
                reference: payment.reference,
                paymentStatus: payment.status
              }
            });
          }
        }
      }

      console.log('=== PAYMENT VERIFICATION COMPLETE ===');

      // Return success response
      res.status(200).json({
        success: true,
        message: payment.status === 'success'
            ? 'Payment verified and wallet credited successfully'
            : 'Payment verification completed',
        data: {
          status: payment.status,
          amount: payment.amount, // Return amount in naira
          reference: payment.reference,
          gateway: payment.gateway,
          channel: payment.channel,
          paidAt: payment.paidAt,
          walletCredited: payment.walletCredited,
          emailSent
        }
      });

    } catch (error) {
      console.error('Error verifying payment:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to verify payment',
        error: error.message,
        data: {
          status: 'server_error',
          reference: req.params.reference
        }
      });
    }
  };

  /**
   * Enhanced payment callback handler with email notifications
   */
  const paymentCallback = async (req, res) => {
    try {
      console.log('Payment callback received:', req.query);

      const { reference, trxref, tx_ref } = req.query;
      const paymentReference = reference || trxref || tx_ref;

      if (!paymentReference) {
        console.error('No payment reference in callback');
        return res.redirect(`${process.env.FRONTEND_URL}/wallet/error?message=Invalid payment reference`);
      }

      console.log('Processing callback for reference:', paymentReference);

      // Find payment record with user details
      const payment = await Payment.findOne({
        $or: [
          { reference: paymentReference },
          { gatewayReference: paymentReference }
        ]
      }).populate('user', 'email firstName username');

      if (!payment) {
        console.error('Payment not found for callback reference:', paymentReference);
        return res.redirect(`${process.env.FRONTEND_URL}/wallet/error?message=Payment not found`);
      }

      let emailSent = false;

      // Verify payment if not already successful
      if (payment.status !== 'success') {
        console.log('Verifying payment in callback');

        const verificationResult = await PaymentService.verifyTransaction(
            payment.gateway,
            payment.gatewayReference || payment.reference
        );

        // Update payment record
        payment.status = verificationResult.status === 'success' ? 'success' : 'failed';
        payment.gatewayResponse = {
          ...payment.gatewayResponse,
          verification: verificationResult,
          callbackProcessedAt: new Date()
        };
        payment.channel = verificationResult.channel;
        payment.paidAt = verificationResult.paidAt ? new Date(verificationResult.paidAt) : new Date();
        payment.verifiedAt = new Date();
        await payment.save();

        // Credit wallet if payment is successful and not already credited
        if (payment.status === 'success' && !payment.walletCredited) {
          console.log('Crediting wallet in callback');

          try {
            // Check if transaction already exists before crediting
            const existingTransaction = await Transaction.findOne({
              reference: payment.reference
            });

            let transactionCreated = null;

            if (existingTransaction) {
              console.log('Transaction already exists in callback, marking payment as credited');
              payment.walletCredited = true;
              payment.walletCreditedAt = new Date();
              await payment.save();
              transactionCreated = existingTransaction;
            } else {
              await WalletService.creditWallet(
                  payment.user._id,
                  payment.amount,
                  'deposit',
                  payment.reference,
                  {
                    paymentId: payment._id,
                    gateway: payment.gateway,
                    channel: payment.channel,
                    description: `Wallet funded via ${payment.gateway} (callback)`
                  }
              );

              payment.walletCredited = true;
              payment.walletCreditedAt = new Date();
              await payment.save();

              // Find the created transaction for email
              transactionCreated = await Transaction.findOne({
                reference: payment.reference
              });

              console.log('Wallet credited in callback');
            }

            // Send email notification
            if (transactionCreated && payment.user) {
              try {
                await sendTransactionNotificationEmail(transactionCreated, payment.user);
                emailSent = true;
                console.log('Wallet funding email sent successfully in callback');
              } catch (emailError) {
                console.error('Error sending wallet funding email in callback:', emailError);
              }
            }

          } catch (walletError) {
            // Handle duplicate key error gracefully
            if (walletError.code === 11000 && walletError.keyPattern?.reference) {
              console.log('Duplicate transaction detected in callback, marking as credited');
              payment.walletCredited = true;
              payment.walletCreditedAt = new Date();
              await payment.save();
            } else {
              console.error('Error crediting wallet in callback:', walletError);
            }
          }
        }
      }

      // Redirect based on payment status
      if (payment.status === 'success') {
        return res.redirect(`${process.env.FRONTEND_URL}/wallet/success?reference=${paymentReference}&amount=${payment.amount}&emailSent=${emailSent}`);
      } else {
        return res.redirect(`${process.env.FRONTEND_URL}/wallet/error?reference=${paymentReference}&message=Payment failed`);
      }
    } catch (error) {
      console.error('Error processing payment callback:', error);
      return res.redirect(`${process.env.FRONTEND_URL}/wallet/error?message=Error processing payment`);
    }
  };

  /**
   * Handle Monnify webhooks for virtual account funding with email notifications
   */
  // const monnifyWebhook = async (req, res) => {
  //   try {
  //     console.log('Monnify webhook received:', req.body);
  //
  //     // Get signature from headers
  //     const signature = req.headers['monnify-signature'];
  //
  //     // Verify webhook signature
  //     const isValid = PaymentService.verifyWebhookSignature('monnify', signature, req.body);
  //
  //     if (!isValid) {
  //       console.error('Invalid Monnify webhook signature');
  //       return res.status(200).json({ status: 'error', message: 'Invalid signature' });
  //     }
  //
  //     const { eventType, eventData } = req.body;
  //
  //     // Handle successful transaction (virtual account credit)
  //     if (eventType === 'SUCCESSFUL_TRANSACTION') {
  //       console.log('Processing virtual account credit:', eventData);
  //
  //       // Find virtual account by account number
  //       const virtualAccount = await VirtualAccount.findOne({
  //         'accounts.accountNumber': eventData.destinationAccountNumber
  //       }).populate('user', 'email firstName username');
  //
  //       if (!virtualAccount) {
  //         console.error('Virtual account not found for:', eventData.destinationAccountNumber);
  //         return res.status(200).json({ status: 'error', message: 'Virtual account not found' });
  //       }
  //
  //       // Check if transaction already exists
  //       const existingTransaction = await Transaction.findOne({
  //         reference: eventData.paymentReference
  //       });
  //
  //       if (!existingTransaction) {
  //         // Credit the user's wallet
  //         const creditResult = await WalletService.creditWallet(
  //             virtualAccount.user._id,
  //             eventData.amountPaid,
  //             'virtual_account_credit',
  //             eventData.paymentReference,
  //             {
  //               virtualAccountNumber: eventData.destinationAccountNumber,
  //               senderName: eventData.customerName,
  //               senderAccount: eventData.sourceAccountNumber,
  //               senderBank: eventData.sourceBankName,
  //               description: `Bank transfer from ${eventData.customerName}`,
  //               gateway: 'monnify'
  //             }
  //         );
  //
  //         console.log('Virtual account credit successful:', {
  //           userId: virtualAccount.user._id,
  //           amount: eventData.amountPaid,
  //           reference: eventData.paymentReference
  //         });
  //
  //         // Send email notification for virtual account credit
  //         try {
  //           const transactionCreated = await Transaction.findOne({
  //             reference: eventData.paymentReference
  //           });
  //
  //           if (transactionCreated && virtualAccount.user) {
  //             await sendTransactionNotificationEmail(transactionCreated, virtualAccount.user);
  //             console.log('Virtual account credit email sent successfully');
  //           }
  //         } catch (emailError) {
  //           console.error('Error sending virtual account credit email:', emailError);
  //           // Don't fail the webhook processing if email fails
  //         }
  //       } else {
  //         console.log('Virtual account transaction already processed:', eventData.paymentReference);
  //       }
  //     }
  //
  //     // Always return 200 to acknowledge receipt
  //     return res.status(200).json({ status: 'success', message: 'Webhook processed successfully' });
  //
  //   } catch (error) {
  //     console.error('Error processing Monnify webhook:', error);
  //     return res.status(200).json({ status: 'error', message: 'Error processing webhook' });
  //   }
  // };

  /**
   * ⚠️ ENHANCED: Handle Monnify webhooks for virtual account funding with guaranteed credit
   */
  /**
   * FIXED: Handle Monnify webhooks for virtual account funding
   * This handles both regular payments AND virtual account transfers
   */
  // const monnifyWebhook = async (req, res) => {
  //   try {
  //     console.log('=== MONNIFY WEBHOOK RECEIVED ===');
  //     console.log('Headers:', JSON.stringify(req.headers, null, 2));
  //     console.log('Body:', JSON.stringify(req.body, null, 2));
  //
  //     // Get signature from headers
  //     const signature = req.headers['monnify-signature'];
  //
  //     if (!signature) {
  //       console.error('No Monnify signature provided');
  //       return res.status(200).json({
  //         status: 'error',
  //         message: 'No signature provided'
  //       });
  //     }
  //
  //     // Verify webhook signature using PaymentService
  //     const isValid = PaymentService.verifyWebhookSignature('monnify', signature, req.body);
  //
  //     if (!isValid) {
  //       console.error('Invalid Monnify webhook signature');
  //       return res.status(200).json({
  //         status: 'error',
  //         message: 'Invalid signature'
  //       });
  //     }
  //
  //     console.log('✅ Monnify webhook signature verified successfully');
  //
  //     const { eventType, eventData } = req.body;
  //
  //     // Handle successful transactions
  //     if (eventType === 'SUCCESSFUL_TRANSACTION') {
  //       console.log('Processing transaction:', {
  //         reference: eventData.paymentReference,
  //         amount: eventData.amountPaid,
  //         accountNumber: eventData.destinationAccountInformation?.accountNumber,
  //         productType: eventData.product?.type
  //       });
  //
  //       // CRITICAL FIX: Determine if this is a virtual account credit or regular payment
  //       const isVirtualAccountCredit = eventData.product?.type === 'RESERVED_ACCOUNT';
  //
  //       if (isVirtualAccountCredit) {
  //         // Handle virtual account credit (no Payment record expected)
  //         console.log('🏦 Processing virtual account credit');
  //         return await handleVirtualAccountCredit(eventData, res);
  //       } else {
  //         // Handle regular payment (Payment record should exist)
  //         console.log('💳 Processing regular payment');
  //         return await handleRegularPayment(eventData, res);
  //       }
  //     }
  //
  //     // Handle other event types
  //     else if (eventType === 'FAILED_TRANSACTION') {
  //       console.log('Received failed transaction webhook:', eventData.paymentReference);
  //       return res.status(200).json({
  //         status: 'success',
  //         message: 'Failed transaction webhook processed'
  //       });
  //     }
  //
  //     // Handle unknown event types
  //     else {
  //       console.log('Received unknown Monnify event type:', eventType);
  //       return res.status(200).json({
  //         status: 'success',
  //         message: `Unknown event type: ${eventType}`
  //       });
  //     }
  //
  //   } catch (error) {
  //     console.error('❌ Error processing Monnify webhook:', error);
  //     return res.status(200).json({
  //       status: 'error',
  //       message: 'Error processing webhook',
  //       error: error.message,
  //       processed: true
  //     });
  //   }
  // };

  const monnifyWebhook = async (req, res) => {
        try {
          console.log('=== MONNIFY WEBHOOK RECEIVED ===');
          console.log('DEBUG: Using FIXED monnifyWebhook function');
          console.log('Headers:', JSON.stringify(req.headers, null, 2));
          console.log('Body:', JSON.stringify(req.body, null, 2));

          // Get signature from headers
          const signature = req.headers['monnify-signature'];

          if (!signature) {
            console.error('No Monnify signature provided');
            return res.status(200).json({
              status: 'error',
              message: 'No signature provided'
            });
          }

          // Verify webhook signature using PaymentService
          const isValid = PaymentService.verifyWebhookSignature('monnify', signature, req.body);

          if (!isValid) {
            console.error('Invalid Monnify webhook signature');
            return res.status(200).json({
              status: 'error',
              message: 'Invalid signature'
            });
          }

          console.log('✅ Monnify webhook signature verified successfully');

          const { eventType, eventData } = req.body;

          // Handle successful transactions
          if (eventType === 'SUCCESSFUL_TRANSACTION') {
            console.log('Processing transaction:', {
              reference: eventData.paymentReference,
              amount: eventData.amountPaid,
              accountNumber: eventData.destinationAccountInformation?.accountNumber,
              productType: eventData.product?.type
            });

            // CRITICAL: Check if this is a virtual account credit
            const isVirtualAccountCredit = eventData.product?.type === 'RESERVED_ACCOUNT';

            if (isVirtualAccountCredit) {
              console.log('🏦 Processing VIRTUAL ACCOUNT CREDIT');

              const accountNumber = eventData.destinationAccountInformation?.accountNumber;

              if (!accountNumber) {
                console.error('No destination account number in virtual account credit');
                return res.status(200).json({
                  status: 'error',
                  message: 'No destination account number'
                });
              }

              // Find virtual account by account number
              const virtualAccount = await VirtualAccount.findOne({
                'accounts.accountNumber': accountNumber
              }).populate('user', 'email firstName username');

              if (!virtualAccount) {
                console.error('Virtual account not found for:', accountNumber);
                return res.status(200).json({
                  status: 'error',
                  message: 'Virtual account not found',
                  processed: true
                });
              }

              console.log('✅ Virtual account found for user:', virtualAccount.user._id);

              // Check if transaction already exists
              const existingTransaction = await Transaction.findOne({
                reference: eventData.paymentReference
              });

              if (existingTransaction) {
                console.log('Transaction already processed:', eventData.paymentReference);
                return res.status(200).json({
                  status: 'success',
                  message: 'Transaction already processed',
                  transactionId: existingTransaction._id
                });
              }

              // Use database session for atomicity
              const session = await mongoose.startSession();
              session.startTransaction();

              try {
                console.log('Crediting wallet for virtual account:', {
                  userId: virtualAccount.user._id,
                  amount: eventData.amountPaid,
                  reference: eventData.paymentReference
                });

                await WalletService.creditWallet(
                    virtualAccount.user._id,
                    eventData.amountPaid,
                    'virtual_account_credit',
                    eventData.paymentReference,
                    {
                      virtualAccountNumber: accountNumber,
                      senderName: eventData.paymentSourceInformation?.[0]?.accountName || 'Unknown',
                      senderAccount: eventData.paymentSourceInformation?.[0]?.accountNumber,
                      senderBank: eventData.paymentSourceInformation?.[0]?.bankName,
                      description: `Bank transfer from ${eventData.paymentSourceInformation?.[0]?.accountName || 'Unknown'}`,
                      gateway: 'monnify',
                      webhookEventType: eventType,
                      webhookData: eventData,
                      processedAt: new Date()
                    }
                );

                await session.commitTransaction();
                console.log('✅ Virtual account credit successful');

                // Send email notification (outside of transaction)
                const transactionCreated = await Transaction.findOne({
                  reference: eventData.paymentReference
                });

                if (transactionCreated && virtualAccount.user) {
                  try {
                    await sendTransactionNotificationEmail(transactionCreated, virtualAccount.user);
                    console.log('✅ Virtual account credit email sent successfully');
                  } catch (emailError) {
                    console.error('Error sending virtual account credit email:', emailError);
                  }
                }

                return res.status(200).json({
                  status: 'success',
                  message: 'Virtual account credited successfully',
                  data: {
                    userId: virtualAccount.user._id,
                    amount: eventData.amountPaid,
                    reference: eventData.paymentReference,
                    transactionId: transactionCreated?._id
                  }
                });

              } catch (creditError) {
                await session.abortTransaction();
                console.error('Error crediting virtual account wallet:', creditError);

                // Handle duplicate key error gracefully
                if (creditError.code === 11000 && creditError.keyPattern?.reference) {
                  console.log('Duplicate transaction detected, likely already processed');
                  return res.status(200).json({
                    status: 'success',
                    message: 'Transaction already processed (duplicate)',
                    processed: true
                  });
                }

                return res.status(200).json({
                  status: 'error',
                  message: 'Failed to credit wallet',
                  error: creditError.message,
                  processed: true
                });
              } finally {
                await session.endSession();
              }

            } else {
              console.log('💳 Processing REGULAR PAYMENT');

              // Handle regular payment (Payment record should exist)
              const payment = await Payment.findOne({
                $or: [
                  { reference: eventData.paymentReference },
                  { gatewayReference: eventData.paymentReference }
                ]
              }).populate('user', 'email firstName username');

              if (!payment) {
                console.error('Payment not found for reference:', eventData.paymentReference);
                return res.status(200).json({
                  status: 'error',
                  message: 'Payment not found',
                  processed: true
                });
              }

              console.log('Payment found:', payment._id);

              // Update payment status if not already successful
              if (payment.status !== 'success') {
                payment.status = 'success';
                payment.gatewayResponse = {
                  ...payment.gatewayResponse,
                  webhook: eventData,
                  webhookProcessedAt: new Date()
                };
                payment.paidAt = new Date(eventData.paidOn);
                payment.verifiedAt = new Date();
                await payment.save();
              }

              // Credit wallet if not already credited
              if (payment.status === 'success' && !payment.walletCredited) {
                try {
                  await WalletService.creditWallet(
                      payment.user._id,
                      payment.amount,
                      'deposit',
                      payment.reference,
                      {
                        paymentId: payment._id,
                        gateway: 'monnify',
                        description: 'Wallet funding via Monnify (webhook)'
                      }
                  );

                  payment.walletCredited = true;
                  payment.walletCreditedAt = new Date();
                  await payment.save();

                  // Send email notification
                  const transactionCreated = await Transaction.findOne({
                    reference: payment.reference
                  });

                  if (transactionCreated && payment.user) {
                    try {
                      await sendTransactionNotificationEmail(transactionCreated, payment.user);
                      console.log('✅ Payment success email sent');
                    } catch (emailError) {
                      console.error('Error sending payment email:', emailError);
                    }
                  }

                } catch (walletError) {
                  if (walletError.code === 11000 && walletError.keyPattern?.reference) {
                    console.log('Transaction already exists, marking as credited');
                    payment.walletCredited = true;
                    payment.walletCreditedAt = new Date();
                    await payment.save();
                  } else {
                    throw walletError;
                  }
                }
              }

              return res.status(200).json({
                status: 'success',
                message: 'Regular payment processed successfully',
                paymentId: payment._id
              });
            }
          }

          // Handle other event types
          else if (eventType === 'FAILED_TRANSACTION') {
            console.log('Received failed transaction webhook:', eventData.paymentReference);
            return res.status(200).json({
              status: 'success',
              message: 'Failed transaction webhook processed'
            });
          }

          // Handle unknown event types
          else {
            console.log('Received unknown Monnify event type:', eventType);
            return res.status(200).json({
              status: 'success',
              message: `Unknown event type: ${eventType}`
            });
          }

        } catch (error) {
          console.error('❌ Error processing Monnify webhook:', error);
          return res.status(200).json({
            status: 'error',
            message: 'Error processing webhook',
            error: error.message,
            processed: true
          });
        }
      };

  /**
   * Handle virtual account credit (bank transfers to virtual accounts)
   */
  async function handleVirtualAccountCredit(eventData, res) {
    try {
      const accountNumber = eventData.destinationAccountInformation?.accountNumber;

      if (!accountNumber) {
        console.error('No destination account number in virtual account credit');
        return res.status(200).json({
          status: 'error',
          message: 'No destination account number'
        });
      }

      // Find virtual account by account number
      const virtualAccount = await VirtualAccount.findOne({
        'accounts.accountNumber': accountNumber
      }).populate('user', 'email firstName username');

      if (!virtualAccount) {
        console.error('Virtual account not found for:', accountNumber);
        return res.status(200).json({
          status: 'error',
          message: 'Virtual account not found',
          processed: true
        });
      }

      console.log('✅ Virtual account found for user:', virtualAccount.user._id);

      // Check if transaction already exists
      const existingTransaction = await Transaction.findOne({
        reference: eventData.paymentReference
      });

      if (existingTransaction) {
        console.log('Transaction already processed:', eventData.paymentReference);
        return res.status(200).json({
          status: 'success',
          message: 'Transaction already processed',
          transactionId: existingTransaction._id
        });
      }

      // Use PaymentService to handle virtual account credit
      const creditResult = await PaymentService.handleVirtualAccountCredit({
        amount: eventData.amountPaid,
        reference: eventData.paymentReference,
        accountNumber: accountNumber,
        senderName: eventData.paymentSourceInformation?.[0]?.accountName || 'Unknown',
        senderAccount: eventData.paymentSourceInformation?.[0]?.accountNumber,
        senderBank: eventData.paymentSourceInformation?.[0]?.bankName
      });

      if (creditResult.success) {
        console.log('✅ Virtual account credit successful');
        return res.status(200).json({
          status: 'success',
          message: 'Virtual account credited successfully',
          data: creditResult
        });
      } else {
        throw new Error(creditResult.message || 'Failed to credit virtual account');
      }

    } catch (error) {
      console.error('❌ Error processing virtual account credit:', error);
      return res.status(200).json({
        status: 'error',
        message: 'Failed to process virtual account credit',
        error: error.message,
        processed: true
      });
    }
  }

  /**
   * Handle regular payment (initiated through payment gateway)
   */
  async function handleRegularPayment(eventData, res) {
    try {
      // Find payment by reference
      const payment = await Payment.findOne({
        $or: [
          { reference: eventData.paymentReference },
          { gatewayReference: eventData.paymentReference }
        ]
      }).populate('user', 'email firstName username');

      if (!payment) {
        console.error('Payment not found for reference:', eventData.paymentReference);
        return res.status(200).json({
          status: 'error',
          message: 'Payment not found',
          processed: true
        });
      }

      console.log('Payment found:', payment._id);

      // Update payment status if not already successful
      if (payment.status !== 'success') {
        payment.status = 'success';
        payment.gatewayResponse = {
          ...payment.gatewayResponse,
          webhook: eventData,
          webhookProcessedAt: new Date()
        };
        payment.paidAt = new Date(eventData.paidOn);
        payment.verifiedAt = new Date();
        await payment.save();
      }

      // Credit wallet if not already credited
      if (payment.status === 'success' && !payment.walletCredited) {
        try {
          await WalletService.creditWallet(
              payment.user._id,
              payment.amount,
              'deposit',
              payment.reference,
              {
                paymentId: payment._id,
                gateway: 'monnify',
                description: 'Wallet funding via Monnify (webhook)'
              }
          );

          payment.walletCredited = true;
          payment.walletCreditedAt = new Date();
          await payment.save();

          // Send email notification
          const transactionCreated = await Transaction.findOne({
            reference: payment.reference
          });

          if (transactionCreated && payment.user) {
            try {
              await sendTransactionNotificationEmail(transactionCreated, payment.user);
              console.log('✅ Payment success email sent');
            } catch (emailError) {
              console.error('Error sending payment email:', emailError);
            }
          }

        } catch (walletError) {
          if (walletError.code === 11000 && walletError.keyPattern?.reference) {
            console.log('Transaction already exists, marking as credited');
            payment.walletCredited = true;
            payment.walletCreditedAt = new Date();
            await payment.save();
          } else {
            throw walletError;
          }
        }
      }

      return res.status(200).json({
        status: 'success',
        message: 'Regular payment processed successfully',
        paymentId: payment._id
      });

    } catch (error) {
      console.error('❌ Error processing regular payment:', error);
      return res.status(200).json({
        status: 'error',
        message: 'Failed to process regular payment',
        error: error.message,
        processed: true
      });
    }
  }

  /**
   * Enhanced payment webhook handler with email notifications
   */
  const paymentWebhook = async (req, res) => {
    try {
      console.log('=== WEBHOOK RECEIVED ===');
      console.log('Headers:', req.headers);
      console.log('Body:', req.body);

      // Get gateway from request path or header
      const gateway = req.params.gateway || req.query.gateway || 'paystack';

      // Get signature from headers
      let signature = '';
      if (gateway === 'paystack') {
        signature = req.headers['x-paystack-signature'];
      } else if (gateway === 'monnify') {
        signature = req.headers['monnify-signature'];
      }

      console.log('Gateway:', gateway);
      console.log('Signature:', signature);

      // Verify webhook signature
      const isValid = PaymentService.verifyWebhookSignature(gateway, signature, req.body);

      if (!isValid) {
        console.error('Invalid webhook signature');
        return res.status(200).json({ status: 'error', message: 'Invalid signature' });
      }

      console.log('Webhook signature valid');

      // Process webhook data
      const webhookData = PaymentService.processWebhookData(gateway, req.body);

      if (!webhookData.success) {
        console.error('Webhook data processing failed:', webhookData.message);
        return res.status(200).json({ status: 'error', message: webhookData.message });
      }

      console.log('Webhook data processed:', webhookData);

      // Handle successful payment
      const isSuccessEvent = (gateway === 'paystack' && req.body.event === 'charge.success') ||
          (gateway === 'monnify' && req.body.eventType === 'SUCCESSFUL_TRANSACTION');

      if (isSuccessEvent) {
        console.log('Processing successful payment webhook');

        // Find payment by reference with user details
        const payment = await Payment.findOne({
          $or: [
            { reference: webhookData.reference },
            { gatewayReference: webhookData.reference }
          ]
        }).populate('user', 'email firstName username');

        if (!payment) {
          console.error(`Payment with reference ${webhookData.reference} not found`);
          return res.status(200).json({ status: 'error', message: 'Payment not found' });
        }

        console.log('Payment found for webhook:', payment._id);

        // Update payment status if not already successful
        if (payment.status !== 'success') {
          payment.status = 'success';
          payment.gatewayResponse = {
            ...payment.gatewayResponse,
            webhook: webhookData,
            webhookProcessedAt: new Date()
          };
          payment.channel = webhookData.channel;
          payment.paidAt = webhookData.paidAt ? new Date(webhookData.paidAt) : new Date();
          payment.verifiedAt = new Date();
          await payment.save();

          console.log('Payment status updated to success via webhook');
        }

        // Credit wallet if not already credited
        if (payment.status === 'success' && !payment.walletCredited) {
          console.log('Crediting wallet via webhook');

          try {
            // Check if transaction already exists before crediting
            const existingTransaction = await Transaction.findOne({
              reference: payment.reference
            });

            let transactionCreated = null;

            if (existingTransaction) {
              console.log('Transaction already exists via webhook, marking payment as credited');
              payment.walletCredited = true;
              payment.walletCreditedAt = new Date();
              await payment.save();
              transactionCreated = existingTransaction;
            } else {
              await WalletService.creditWallet(
                  payment.user._id,
                  payment.amount,
                  'deposit',
                  payment.reference,
                  {
                    paymentId: payment._id,
                    gateway: payment.gateway,
                    channel: payment.channel,
                    description: `Wallet funded via ${payment.gateway} (webhook)`
                  }
              );

              payment.walletCredited = true;
              payment.walletCreditedAt = new Date();
              await payment.save();

              // Find the created transaction for email
              transactionCreated = await Transaction.findOne({
                reference: payment.reference
              });

              console.log('Wallet credited via webhook');
            }

            // Send email notification
            if (transactionCreated && payment.user) {
              try {
                await sendTransactionNotificationEmail(transactionCreated, payment.user);
                console.log('Wallet funding email sent successfully via webhook');
              } catch (emailError) {
                console.error('Error sending wallet funding email via webhook:', emailError);
              }
            }

          } catch (walletError) {
            // Handle duplicate key error gracefully
            if (walletError.code === 11000 && walletError.keyPattern?.reference) {
              console.log('Duplicate transaction detected via webhook, marking as credited');
              payment.walletCredited = true;
              payment.walletCreditedAt = new Date();
              await payment.save();
            } else {
              console.error('Error crediting wallet via webhook:', walletError);
            }
          }
        }
      }

      console.log('=== WEBHOOK PROCESSED SUCCESSFULLY ===');
      return res.status(200).json({ status: 'success', message: 'Webhook processed successfully' });
    } catch (error) {
      console.error('Error processing payment webhook:', error);
      return res.status(200).json({ status: 'error', message: 'Error processing webhook' });
    }
  };

  /**
   * Transfer funds between users with email notifications
   */
  const transferFunds = async (req, res) => {
    try {
      const schema = Joi.object({
        recipientIdentifier: Joi.string().required().description('Username, email, or phone of recipient'),
        amount: Joi.number().min(100).required(),
        description: Joi.string()
      });

      const { error, value } = schema.validate(req.body, { abortEarly: false });

      if (error) {
        return res.status(400).json({
          message: 'Validation error',
          details: error.details.map(err => err.message)
        });
      }

      const senderId = req.user.id;

      // Get sender details
      const sender = await User.findById(senderId);
      if (!sender) {
        return res.status(404).json({ message: 'Sender not found' });
      }

      // Check wallet balance
      const walletInfo = await WalletService.getBalance(senderId);
      if (walletInfo.balance < value.amount) {
        return res.status(400).json({ message: 'Insufficient wallet balance' });
      }

      // Find recipient user by username, email, or phone
      const recipient = await User.findOne({
        $or: [
          { username: value.recipientIdentifier },
          { email: value.recipientIdentifier },
          { phone: value.recipientIdentifier }
        ]
      });

      if (!recipient) {
        return res.status(404).json({ message: 'Recipient not found' });
      }

      if (recipient._id.toString() === senderId) {
        return res.status(400).json({ message: 'Cannot transfer to yourself' });
      }

      // Generate transfer reference
      const transferRef = `t${(Date.now() + Math.random() * 1000000).toString(36).substring(0, 15)}`;

      let senderTransaction = null;
      let recipientTransaction = null;

      // Debit sender
      await WalletService.debitWallet(
          senderId,
          value.amount,
          'transfer',
          transferRef,
          {
            recipientId: recipient._id,
            description: value.description || 'Wallet transfer'
          }
      );

      // Get sender transaction for email
      senderTransaction = await Transaction.findOne({
        reference: transferRef,
        user: senderId
      });

      // Credit recipient
      await WalletService.creditWallet(
          recipient._id,
          value.amount,
          'transfer',
          transferRef,
          {
            senderId,
            description: value.description || 'Wallet transfer'
          }
      );

      // Get recipient transaction for email
      recipientTransaction = await Transaction.findOne({
        reference: transferRef,
        user: recipient._id
      });

      // Send email notifications to both sender and recipient
      let senderEmailSent = false;
      let recipientEmailSent = false;

      try {
        if (senderTransaction) {
          await sendTransactionNotificationEmail(senderTransaction, sender);
          senderEmailSent = true;
          console.log('Transfer debit email sent to sender');
        }
      } catch (emailError) {
        console.error('Error sending transfer email to sender:', emailError);
      }

      try {
        if (recipientTransaction) {
          await sendTransactionNotificationEmail(recipientTransaction, recipient);
          recipientEmailSent = true;
          console.log('Transfer credit email sent to recipient');
        }
      } catch (emailError) {
        console.error('Error sending transfer email to recipient:', emailError);
      }

      res.status(200).json({
        message: 'Transfer successful',
        data: {
          amount: value.amount,
          recipient: {
            id: recipient._id,
            username: recipient.username || recipient.email
          },
          reference: transferRef,
          emailNotifications: {
            senderEmailSent,
            recipientEmailSent
          }
        }
      });
    } catch (error) {
      console.error('Error processing transfer:', error);
      res.status(500).json({
        message: 'Failed to process transfer',
        error: error.message
      });
    }
  };

  // Helper function
  const formatCurrency = (amount) => {
    return new Intl.NumberFormat('en-NG', {
      style: 'currency',
      currency: 'NGN',
      minimumFractionDigits: 0,
    }).format(amount);
  };

  /**
   * Create virtual account for a user - Fixed version
   */
  const createVirtualAccount = async (req, res) => {
    try {
      const userId = req.user.id;
      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          success: false,
          message: 'User not found'
        });
      }

      // Check if user already has a virtual account
      let virtualAccount = await VirtualAccount.findOne({ user: userId });

      if (virtualAccount && virtualAccount.status === 'active') {
        return res.status(200).json({
          success: true,
          message: 'Virtual account already exists',
          data: {
            accountReference: virtualAccount.accountReference,
            accounts: virtualAccount.accounts,
            status: virtualAccount.status,
            createdAt: virtualAccount.createdAt
          }
        });
      }

      // Generate unique account reference
      const accountReference = `va-${userId}-${Date.now()}`;

      console.log('Creating virtual account for user:', userId);
      console.log('Account reference:', accountReference);

      // Create virtual account with Monnify
      const accountData = {
        accountName: user.username || `${user.email.split('@')[0]}`.substring(0, 10), // Limit length
        email: user.email,
        customerName: user.username || user.email.split('@')[0],
        reference: accountReference,
        currency: 'NGN'
      };

      console.log('Calling PaymentService.createVirtualAccount with:', accountData);

      const response = await PaymentService.createVirtualAccount(accountData);

      console.log('PaymentService response:', response);

      if (!response.success) {
        throw new Error('Failed to create virtual account with payment service');
      }

      // Save or update virtual account details
      if (!virtualAccount) {
        virtualAccount = new VirtualAccount({
          user: userId,
          accountReference: response.reference,
          accounts: response.accounts,
          status: 'active',
          metadata: {
            reservationReference: response.reservationReference,
            customerEmail: response.customerEmail,
            customerName: response.customerName
          }
        });
      } else {
        virtualAccount.accountReference = response.reference;
        virtualAccount.accounts = response.accounts;
        virtualAccount.status = 'active';
        virtualAccount.metadata = {
          reservationReference: response.reservationReference,
          customerEmail: response.customerEmail,
          customerName: response.customerName
        };
      }

      await virtualAccount.save();

      console.log('Virtual account saved to database:', virtualAccount._id);

      // Return the first account details for the mobile app
      const primaryAccount = virtualAccount.accounts[0];

      res.status(200).json({
        success: true,
        message: 'Virtual account created successfully',
        data: {
          accountNumber: primaryAccount.accountNumber,
          accountName: primaryAccount.accountName,
          bankName: primaryAccount.bankName,
          bankCode: primaryAccount.bankCode,
          currency: 'NGN',
          status: virtualAccount.status,
          accountReference: virtualAccount.accountReference,
          createdAt: virtualAccount.createdAt
        }
      });

    } catch (error) {
      console.error('Error creating virtual account:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to create virtual account',
        error: error.message
      });
    }
  };

  /**
   * Get user's virtual account - Updated
   */
  const getVirtualAccount = async (req, res) => {
    try {
      const userId = req.user.id;

      const virtualAccount = await VirtualAccount.findOne({ user: userId });

      if (!virtualAccount) {
        return res.status(404).json({
          success: false,
          message: 'Virtual account not found'
        });
      }

      // Return the first account details for the mobile app
      const primaryAccount = virtualAccount.accounts[0];

      res.status(200).json({
        success: true,
        data: {
          accountNumber: primaryAccount.accountNumber,
          accountName: primaryAccount.accountName,
          bankName: primaryAccount.bankName,
          bankCode: primaryAccount.bankCode,
          currency: 'NGN',
          status: virtualAccount.status,
          accountReference: virtualAccount.accountReference,
          createdAt: virtualAccount.createdAt
        }
      });
    } catch (error) {
      console.error('Error fetching virtual account:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch virtual account',
        error: error.message
      });
    }
  };

  /**
   * List available banks for gateway
   */
  const listBanks = async (req, res) => {
    try {
      const { gateway = 'paystack' } = req.params;

      const banks = await PaymentService.listBanks(gateway);

      res.status(200).json(banks);
    } catch (error) {
      console.error('Error fetching banks:', error);
      res.status(500).json({
        message: 'Failed to fetch banks',
        error: error.message
      });
    }
  };

  /**
   * ⚠️ DEBUG ENDPOINT: Test signature verification (REMOVE IN PRODUCTION)
   */
  const debugSignatureVerification = async (req, res) => {
    try {
      console.log('🔍 DEBUG: Signature verification test');
      console.log('Headers:', req.headers);
      console.log('Body:', req.body);

      const signature = req.headers['x-paystack-signature'] || req.headers['monnify-signature'];
      const gateway = req.query.gateway || 'paystack';

      console.log('Gateway:', gateway);
      console.log('Signature:', signature);
      console.log('Payload type:', typeof req.body);
      console.log('Payload:', JSON.stringify(req.body));

      // Test signature verification
      const isValid = PaymentService.verifyWebhookSignature(gateway, signature, req.body);

      console.log('Signature verification result:', isValid);

      // Test different payload formats
      const payloadTests = [
        { name: 'Original req.body', payload: req.body },
        { name: 'JSON.stringify(req.body)', payload: JSON.stringify(req.body) },
        { name: 'JSON.stringify(req.body, null, 0)', payload: JSON.stringify(req.body, null, 0) }
      ];

      const testResults = {};

      for (const test of payloadTests) {
        try {
          const testSignature = crypto
              .createHmac('sha512', process.env.PAYSTACK_SECRET_KEY)
              .update(typeof test.payload === 'string' ? test.payload : JSON.stringify(test.payload))
              .digest('hex');

          testResults[test.name] = {
            signature: testSignature,
            matches: testSignature === signature
          };
        } catch (error) {
          testResults[test.name] = { error: error.message };
        }
      }

      const debugInfo = {
        success: true,
        receivedSignature: signature,
        gateway: gateway,
        originalVerificationResult: isValid,
        environment: {
          paystackSecretSet: !!process.env.PAYSTACK_SECRET_KEY,
          monnifySecretSet: !!process.env.MONNIFY_SECRET_KEY,
          nodeEnv: process.env.NODE_ENV
        },
        payloadInfo: {
          type: typeof req.body,
          isObject: typeof req.body === 'object',
          stringLength: JSON.stringify(req.body).length,
          preview: JSON.stringify(req.body).substring(0, 200)
        },
        signatureTests: testResults
      };

      console.log('Debug info:', debugInfo);

      res.status(200).json(debugInfo);

    } catch (error) {
      console.error('Debug endpoint error:', error);
      res.status(500).json({
        success: false,
        error: error.message,
        stack: error.stack
      });
    }
  };

  return {
    getWalletBalance,
    getTransactionHistory,
    fundWallet,
    verifyPayment,
    paymentCallback,
    paymentWebhook,
    createVirtualAccount,
    getVirtualAccount,
    listBanks,
    transferFunds,
    monnifyWebhook,
    debugSignatureVerification,
  };
}

export default WalletController;