// src/controller/BillPaymentController.js - Updated with Third-Party Motor Insurance Support
import BillPayment from '../models/BillPayment.js';
import User from '../models/User.js';
import VTPassService from '../services/VTPassService.js';
import WalletService from '../services/WalletService.js';
import {
  sendVerificationEmail,
  sendPasswordForgotEmail,
  sendForgotPasswordOTP,
  sendBillPaymentEmail,
  sendTransactionNotificationEmail
} from '../../utils/emails/sendEmails.js';
import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';
import {termiiSMSService} from "../services/TermiiService.js";

/**
 * Generate VTPass-compliant request_id
 * Format: YYYYMMDDHHII + random suffix (Lagos timezone GMT+1)
 * Requirements:
 * - MUST BE 12 CHARACTERS OR MORE
 * - FIRST 12 CHARACTERS MUST BE NUMERIC
 * - FIRST 12 CHARACTERS MUST BE TODAY'S DATE + TIME
 * - Format: YYYYMMDDHHII (Year-Month-Day-Hour-Minute)
 */
function generateVTPassRequestId() {
  // Get current time in Lagos timezone (GMT+1)
  const lagosTime = new Date(new Date().getTime() + (1 * 60 * 60 * 1000));

  // Format: YYYYMMDDHHII
  const year = lagosTime.getFullYear();
  const month = String(lagosTime.getMonth() + 1).padStart(2, '0');
  const day = String(lagosTime.getDate()).padStart(2, '0');
  const hour = String(lagosTime.getHours()).padStart(2, '0');
  const minute = String(lagosTime.getMinutes()).padStart(2, '0');

  // First 12 characters (required format)
  const dateTimePart = `${year}${month}${day}${hour}${minute}`;

  // Add random alphanumeric suffix (8 characters)
  const suffix = Math.random().toString(36).substring(2, 10);

  const requestId = dateTimePart + suffix;

  console.log('Generated VTPass request_id:', {
    full: requestId,
    dateTimePart: dateTimePart,
    suffix: suffix,
    length: requestId.length
  });

  return requestId;
}

function isVTPassPaymentSuccessful(paymentResponse) {
  console.log('=== Analyzing VTPass Payment Response ===');
  console.log('response_description:', paymentResponse.response_description);
  console.log('code:', paymentResponse.code);
  console.log('transaction status:', paymentResponse.content?.transactions?.status);

  // Based on your actual VTPass response, check for success indicators
  const isSuccess =
      paymentResponse.code === '000' ||                                    // ✅ This is what VTPass sends
      paymentResponse.response_description === 'TRANSACTION SUCCESSFUL' || // ✅ Alternative check
      paymentResponse.content?.transactions?.status === 'delivered' ||     // ✅ Transaction status
      paymentResponse.content?.transactions?.status === 'successful';      // ✅ Alternative status

  console.log('Success determination:', {
    codeIs000: paymentResponse.code === '000',
    responseIsSuccessful: paymentResponse.response_description === 'TRANSACTION SUCCESSFUL',
    statusIsDelivered: paymentResponse.content?.transactions?.status === 'delivered',
    finalResult: isSuccess
  });

  return isSuccess;
}

function BillPaymentController() {
  /**
   * Get service categories from VTPass
   */
  const getServiceCategories = async (req, res) => {
    try {
      console.log('Fetching service categories from VTPass...');
      const categories = await VTPassService.getServiceCategories();

      // Add cache info for debugging
      const cacheInfo = VTPassService.getCacheInfo();

      res.status(200).json({
        ...categories,
        meta: {
          cached: cacheInfo.categories.cached,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching service categories:', error);
      res.status(500).json({
        message: 'Failed to fetch service categories',
        error: error.message
      });
    }
  };

  /**
   * Get services by category from VTPass
   */
  const getServicesByCategory = async (req, res) => {
    try {
      const { category } = req.params;

      if (!category) {
        return res.status(400).json({ message: 'Category is required' });
      }

      console.log(`Fetching services for category: ${category}`);
      const services = await VTPassService.getServices(category);

      res.status(200).json({
        ...services,
        meta: {
          category,
          count: services.content?.length || 0,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error(`Error fetching ${req.params.category} services:`, error);
      res.status(500).json({
        message: `Failed to fetch ${req.params.category} services`,
        error: error.message
      });
    }
  };

  /**
   * Get service variations from VTPass
   */
  const getServiceVariations = async (req, res) => {
    try {
      const { serviceId } = req.params;

      if (!serviceId) {
        return res.status(400).json({ message: 'Service ID is required' });
      }

      console.log(`Fetching variations for service: ${serviceId}`);
      const variations = await VTPassService.getVariations(serviceId);

      res.status(200).json({
        ...variations,
        meta: {
          serviceId,
          hasVariations: variations.content?.variations?.length > 0,
          variationCount: variations.content?.variations?.length || 0,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error(`Error fetching variations for ${req.params.serviceId}:`, error);
      res.status(500).json({
        message: 'Failed to fetch service variations',
        error: error.message
      });
    }
  };

  /**
   * NEW: Get third-party motor insurance variations
   */
  const getInsuranceVariations = async (req, res) => {
    try {
      console.log('Fetching third-party motor insurance variations...');
      const variations = await VTPassService.getInsuranceVariations();

      res.status(200).json({
        ...variations,
        meta: {
          serviceId: 'ui-insure',
          hasVariations: variations.content?.variations?.length > 0,
          variationCount: variations.content?.variations?.length || 0,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching insurance variations:', error);
      res.status(500).json({
        message: 'Failed to fetch insurance variations',
        error: error.message
      });
    }
  };

  /**
   * NEW: Get vehicle colors for insurance
   */
  const getVehicleColors = async (req, res) => {
    try {
      console.log('Fetching vehicle colors...');
      const colors = await VTPassService.getVehicleColors();

      res.status(200).json({
        ...colors,
        meta: {
          count: colors.content?.length || 0,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching vehicle colors:', error);
      res.status(500).json({
        message: 'Failed to fetch vehicle colors',
        error: error.message
      });
    }
  };

  /**
   * NEW: Get engine capacities for insurance
   */
  const getEngineCapacities = async (req, res) => {
    try {
      console.log('Fetching engine capacities...');
      const capacities = await VTPassService.getEngineCapacities();

      res.status(200).json({
        ...capacities,
        meta: {
          count: capacities.content?.length || 0,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching engine capacities:', error);
      res.status(500).json({
        message: 'Failed to fetch engine capacities',
        error: error.message
      });
    }
  };

  /**
   * NEW: Get states for insurance
   */
  const getStates = async (req, res) => {
    try {
      console.log('Fetching states...');
      const states = await VTPassService.getStates();

      res.status(200).json({
        ...states,
        meta: {
          count: states.content?.length || 0,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching states:', error);
      res.status(500).json({
        message: 'Failed to fetch states',
        error: error.message
      });
    }
  };

  /**
   * NEW: Get LGAs for a specific state
   */
  const getLGAs = async (req, res) => {
    try {
      const { stateCode } = req.params;

      if (!stateCode) {
        return res.status(400).json({ message: 'State code is required' });
      }

      console.log(`Fetching LGAs for state: ${stateCode}`);
      const lgas = await VTPassService.getLGAs(stateCode);

      res.status(200).json({
        ...lgas,
        meta: {
          stateCode,
          count: lgas.content?.length || 0,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error(`Error fetching LGAs for state ${req.params.stateCode}:`, error);
      res.status(500).json({
        message: 'Failed to fetch LGAs',
        error: error.message
      });
    }
  };

  /**
   * NEW: Get vehicle makes for insurance
   */
  const getVehicleMakes = async (req, res) => {
    try {
      console.log('Fetching vehicle makes...');
      const makes = await VTPassService.getVehicleMakes();

      res.status(200).json({
        ...makes,
        meta: {
          count: makes.content?.length || 0,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching vehicle makes:', error);
      res.status(500).json({
        message: 'Failed to fetch vehicle makes',
        error: error.message
      });
    }
  };

  /**
   * NEW: Get vehicle models for a specific make
   */
  const getVehicleModels = async (req, res) => {
    try {
      const { makeCode } = req.params;

      if (!makeCode) {
        return res.status(400).json({ message: 'Make code is required' });
      }

      console.log(`Fetching vehicle models for make: ${makeCode}`);
      const models = await VTPassService.getVehicleModels(makeCode);

      res.status(200).json({
        ...models,
        meta: {
          makeCode,
          count: models.content?.length || 0,
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error(`Error fetching vehicle models for make ${req.params.makeCode}:`, error);
      res.status(500).json({
        message: 'Failed to fetch vehicle models',
        error: error.message
      });
    }
  };

  /**
   * Verify customer details
   */
  const verifyCustomer = async (req, res) => {
    try {
      const schema = Joi.object({
        serviceID: Joi.string().required(),
        billersCode: Joi.string().required(),
        type: Joi.string().optional()
      });

      const { error, value } = schema.validate(req.body, { abortEarly: false });

      if (error) {
        return res.status(400).json({
          message: 'Validation error',
          details: error.details.map(err => err.message)
        });
      }

      const { serviceID, billersCode, type } = value;
      const verification = await VTPassService.verifyCustomer(serviceID, billersCode, type);

      res.status(200).json(verification);
    } catch (error) {
      console.error('Error verifying customer:', error);
      res.status(500).json({
        message: 'Failed to verify customer',
        error: error.message
      });
    }
  };

  /**
   * NEW: Get SMS unit balance
   */
  const getSMSBalance = async (req, res) => {
    try {
      console.log('Fetching SMS unit balance...');
      const balance = await VTPassService.getSMSBalance();

      res.status(200).json({
        success: true,
        message: 'SMS balance retrieved successfully',
        data: balance,
        meta: {
          timestamp: new Date().toISOString()
        }
      });
    } catch (error) {
      console.error('Error fetching SMS balance:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to fetch SMS balance',
        error: error.message
      });
    }
  };

  /**
   * NEW: Send bulk SMS
   */
  const sendBulkSMS = async (req, res) => {
    try {
      const schema = Joi.object({
        recipients: Joi.string()
            .required()
            .custom((value, helpers) => {
              const numbers = value.split(/[,\n]/).map(num => num.trim()).filter(num => num);
              const validNumbers = numbers.filter(num => /^[0-9]{11}$/.test(num));
              if (validNumbers.length === 0) {
                return helpers.error('any.invalid');
              }
              return value;
            }, 'phone number validation'),
        message: Joi.string()
            .min(1)
            .max(160)
            .required(),
        sender: Joi.string()
            .max(11)
            .optional()
            .default('Surepay'),
        amount: Joi.number()
            .positive()
            .required(),
        paymentMethod: Joi.string()
            .valid('wallet')
            .default('wallet')
      });

      const { error, value } = schema.validate(req.body, { abortEarly: false });

      if (error) {
        return res.status(400).json({
          message: 'Validation error',
          details: error.details.map(err => err.message)
        });
      }

      console.log('Processing bulk SMS request:', {
        recipientsLength: value.recipients.length,
        messageLength: value.message.length,
        amount: value.amount,
        userId: req.user.id
      });

      const userId = req.user.id;

      // Get user details for email
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          message: 'User not found'
        });
      }

      // Calculate recipients count
      const recipientNumbers = value.recipients
          .split(/[,\n]/)
          .map(num => num.trim())
          .filter(num => num && /^[0-9]{11}$/.test(num))
          .filter((num, index, arr) => arr.indexOf(num) === index); // Remove duplicates

      const recipientCount = recipientNumbers.length;
      const messagePages = Math.ceil(value.message.length / 160) || 1;
      const totalUnits = recipientCount * messagePages;
      const expectedCost = totalUnits * 4; // ₦4 per SMS unit

      console.log('SMS calculation:', {
        recipientCount,
        messageLength: value.message.length,
        messagePages,
        totalUnits,
        expectedCost,
        providedAmount: value.amount
      });

      // Validate amount matches expected cost
      if (Math.abs(value.amount - expectedCost) > 1) {
        return res.status(400).json({
          message: 'Amount mismatch',
          expected: expectedCost,
          provided: value.amount,
          calculation: {
            recipients: recipientCount,
            messagePages,
            totalUnits,
            unitPrice: 4
          }
        });
      }

      // Check wallet balance
      if (value.paymentMethod === 'wallet') {
        const walletInfo = await WalletService.getBalance(userId);
        console.log('Current wallet balance:', walletInfo.balance);

        if (walletInfo.balance < value.amount) {
          return res.status(400).json({
            message: 'Insufficient wallet balance',
            required: value.amount,
            available: walletInfo.balance
          });
        }
      }

      // Generate transaction reference
      const transactionRef = generateVTPassRequestId();
      console.log('Generated transaction reference:', transactionRef);

      // Create bill payment record
      const billPayment = await BillPayment.create({
        user: userId,
        serviceType: 'sms',
        serviceID: 'bulk-sms',
        billersCode: `${recipientCount}_recipients`,
        variation_code: 'bulk-sms',
        amount: value.amount,
        phone: `${recipientCount} recipients`,
        status: 'pending',
        transactionRef,
        paymentMethod: value.paymentMethod
      });

      console.log('Created bill payment record:', billPayment._id);

      // Get initial wallet balance for email
      let initialWalletBalance = 0;
      let finalWalletBalance = 0;

      if (value.paymentMethod === 'wallet') {
        const walletInfoBefore = await WalletService.getBalance(userId);
        initialWalletBalance = walletInfoBefore.balance;
        console.log('Wallet balance before debit:', initialWalletBalance);

        // Debit wallet
        await WalletService.debitWallet(
            userId,
            value.amount,
            'bill_payment',
            transactionRef,
            { billPaymentId: billPayment._id, serviceType: 'bulk-sms' }
        );
        console.log('Wallet debited successfully for amount:', value.amount);

        // Get updated balance
        const walletInfoAfter = await WalletService.getBalance(userId);
        finalWalletBalance = walletInfoAfter.balance;
        console.log('Wallet balance after debit:', finalWalletBalance);
      }

      let emailSent = false;
      let errorMessage = '';

      try {
        console.log('Initiating bulk SMS sending...');

        // use Termii to send instead of VT Pass for now
        const result = await termiiSMSService.sendBulkSMSWithOptions(recipientNumbers.join(','), value.message)

        // // Prepare SMS payload
        // const smsPayload = {
        //   request_id: transactionRef,
        //   serviceID: 'bulk-sms',
        //   amount: value.amount,
        //   phone: recipientNumbers.join(','),
        //   recipients: value.recipients,
        //   message: value.message,
        //   sender: value.sender
        // };
        //
        // // Process SMS with VTPass
        // const smsResponse = await VTPassService.payBill(smsPayload);

        if (result.success){
          console.log('SMS response received:', result);
        }
        // console.log('SMS response received:', {
        //   responseCode: smsResponse.response_description || smsResponse.code,
        //   hasContent: !!smsResponse.content,
        //   hasSMSDetails: !!smsResponse.smsDetails
        // });

        // // Update bill payment record
        // billPayment.vtpassRef = smsResponse.purchased_code || smsResponse.batchId || transactionRef;
        // const isSuccess = isVTPassPaymentSuccessful(smsResponse);
        // billPayment.status = isSuccess ? 'completed' : 'failed';
        // billPayment.responseData = smsResponse;
        // await billPayment.save();

        // Update bill payment record
        billPayment.vtpassRef = transactionRef;
        const isSuccess = isVTPassPaymentSuccessful(result.success);
        billPayment.status = isSuccess ? 'completed' : 'failed';
        billPayment.responseData = result;
        await billPayment.save();

        console.log('Bill payment status updated:', {
          status: billPayment.status,
          isSuccess: isSuccess,
          vtpassRef: billPayment.vtpassRef
        });

        // Handle failed payment - refund wallet
        if (billPayment.status === 'failed' && value.paymentMethod === 'wallet') {
          console.log('Processing refund for failed SMS...');

          await WalletService.creditWallet(
              userId,
              value.amount,
              'refund',
              `refund-${transactionRef}`,
              { billPaymentId: billPayment._id, reason: 'Failed SMS' }
          );

          console.log('Refund processed for failed SMS');

          // Update final wallet balance after refund
          const walletInfoAfterRefund = await WalletService.getBalance(userId);
          finalWalletBalance = walletInfoAfterRefund.balance;
          console.log('Wallet balance after refund:', finalWalletBalance);
        }

        // Send email notification
        console.log('Sending SMS payment email notification...');

        try {
          await sendBillPaymentEmail(
              {
                serviceType: 'sms',
                serviceID: 'bulk-sms',
                amount: value.amount,
                phone: `${recipientCount} recipients`,
                billersCode: `${recipientCount}_recipients`,
                transactionRef,
                recipientCount,
                messageLength: value.message.length
              },
              user,
              isSuccess,
              {
                walletBalance: finalWalletBalance,
                vtpassMessage: isSuccess ? `SMS sent to ${recipientCount} recipients successfully.` : null,
                errorMessage: !isSuccess ? errorMessage : null,
                isRefunded: !isSuccess && value.paymentMethod === 'wallet'
              }
          );
          emailSent = true;
          console.log('SMS payment email sent successfully to:', user.email);
        } catch (emailError) {
          console.error('Error sending SMS payment email:', emailError);
          // Don't fail the transaction if email fails
        }

        // Success response
        res.status(200).json({
          message: billPayment.status === 'completed' ? 'SMS sent successfully' : 'SMS sending failed',
          success: billPayment.status === 'completed',
          data: {
            transactionRef,
            status: billPayment.status,
            amount: value.amount,
            serviceID: 'bulk-sms',
            serviceType: 'sms',
            walletBalance: finalWalletBalance,
            vtpassResponse: result,
            // vtpassResponse: {
            //   code: smsResponse.response_description || smsResponse.code,
            //   message: smsResponse.content?.transactions?.status || 'Processing',
            //   batchId: smsResponse.batchId || smsResponse.purchased_code
            // },
            emailSent,
            notifications: {
              emailSent,
              emailAddress: user.email
            },
            smsDetails: {
              recipientCount,
              messageLength: value.message.length,
              totalUnits,
              // batchId: smsResponse.batchId,
              // sentDate: smsResponse.sentDate
              sentDate: new Date().toISOString(),
            }
          }
        });

      } catch (smsError) {
        console.error('SMS API error:', smsError.message);

        // Update bill payment status
        billPayment.status = 'failed';
        billPayment.responseData = { error: smsError.message };
        await billPayment.save();

        errorMessage = smsError.message || 'SMS service temporarily unavailable. Please try again.';

        // Refund wallet
        if (value.paymentMethod === 'wallet') {
          console.log('Processing refund due to SMS error...');

          await WalletService.creditWallet(
              userId,
              value.amount,
              'refund',
              `refund-${transactionRef}`,
              { billPaymentId: billPayment._id, reason: 'SMS API error' }
          );

          // Update final wallet balance after refund
          const walletInfoAfterRefund = await WalletService.getBalance(userId);
          finalWalletBalance = walletInfoAfterRefund.balance;
          console.log('Wallet balance after error refund:', finalWalletBalance);
        }

        // Send failure email notification
        console.log('Sending SMS failure email notification...');

        try {
          await sendBillPaymentEmail(
              {
                serviceType: 'sms',
                serviceID: 'bulk-sms',
                amount: value.amount,
                phone: `${recipientCount} recipients`,
                billersCode: `${recipientCount}_recipients`,
                transactionRef,
                recipientCount,
                messageLength: value.message.length
              },
              user,
              false,
              {
                walletBalance: finalWalletBalance,
                errorMessage,
                isRefunded: value.paymentMethod === 'wallet'
              }
          );
          emailSent = true;
          console.log('SMS failure email sent successfully to:', user.email);
        } catch (emailError) {
          console.error('Error sending SMS failure email:', emailError);
        }

        res.status(500).json({
          message: 'SMS sending failed',
          error: smsError.message,
          success: false,
          data: {
            transactionRef,
            status: 'failed',
            walletBalance: finalWalletBalance,
            isRefunded: value.paymentMethod === 'wallet',
            emailSent,
            notifications: {
              emailSent,
              emailAddress: user.email
            }
          }
        });
      }

    } catch (error) {
      console.error('Error processing bulk SMS:', error);
      res.status(500).json({
        message: 'Failed to process bulk SMS',
        error: error.message,
        success: false
      });
    }
  };

  /**
   * NEW: Purchase SMS units
   */
  const purchaseSMSUnits = async (req, res) => {
    try {
      const schema = Joi.object({
        units: Joi.number()
            .integer()
            .min(1)
            .required(),
        amount: Joi.number()
            .positive()
            .required(),
        paymentMethod: Joi.string()
            .valid('wallet')
            .default('wallet')
      });

      const { error, value } = schema.validate(req.body, { abortEarly: false });

      if (error) {
        return res.status(400).json({
          message: 'Validation error',
          details: error.details.map(err => err.message)
        });
      }

      const expectedCost = value.units * 4; // ₦4 per SMS unit

      // Validate amount matches expected cost
      if (Math.abs(value.amount - expectedCost) > 1) {
        return res.status(400).json({
          message: 'Amount mismatch',
          expected: expectedCost,
          provided: value.amount,
          unitPrice: 4
        });
      }

      console.log('Processing SMS units purchase:', {
        units: value.units,
        amount: value.amount,
        userId: req.user.id
      });

      const userId = req.user.id;

      // Get user details
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          message: 'User not found'
        });
      }

      // Check wallet balance
      if (value.paymentMethod === 'wallet') {
        const walletInfo = await WalletService.getBalance(userId);
        console.log('Current wallet balance:', walletInfo.balance);

        if (walletInfo.balance < value.amount) {
          return res.status(400).json({
            message: 'Insufficient wallet balance',
            required: value.amount,
            available: walletInfo.balance
          });
        }
      }

      // Generate transaction reference
      const transactionRef = generateVTPassRequestId();

      // Create bill payment record
      const billPayment = await BillPayment.create({
        user: userId,
        serviceType: 'sms',
        serviceID: 'sms-units',
        billersCode: `${value.units}_units`,
        variation_code: 'sms-units',
        amount: value.amount,
        phone: user.phone || '08000000000',
        status: 'pending',
        transactionRef,
        paymentMethod: value.paymentMethod
      });

      // Debit wallet
      if (value.paymentMethod === 'wallet') {
        await WalletService.debitWallet(
            userId,
            value.amount,
            'bill_payment',
            transactionRef,
            { billPaymentId: billPayment._id, serviceType: 'sms-units' }
        );
      }

      try {
        // Process SMS units purchase
        const unitsPayload = {
          request_id: transactionRef,
          serviceID: 'sms-units',
          amount: value.amount,
          phone: user.phone || '08000000000',
          units: value.units
        };

        const unitsResponse = await VTPassService.payBill(unitsPayload);

        // Update bill payment record
        billPayment.vtpassRef = unitsResponse.purchased_code || transactionRef;
        billPayment.status = 'completed'; // SMS units purchase is always successful
        billPayment.responseData = unitsResponse;
        await billPayment.save();

        // Get final wallet balance
        const walletInfo = await WalletService.getBalance(userId);

        res.status(200).json({
          message: 'SMS units purchased successfully',
          success: true,
          data: {
            transactionRef,
            status: 'completed',
            amount: value.amount,
            serviceID: 'sms-units',
            serviceType: 'sms',
            walletBalance: walletInfo.balance,
            unitsDetails: {
              unitsPurchased: value.units,
              unitPrice: 4,
              totalAmount: value.amount
            }
          }
        });

      } catch (error) {
        console.error('SMS units purchase error:', error);

        // Update status and refund
        billPayment.status = 'failed';
        await billPayment.save();

        if (value.paymentMethod === 'wallet') {
          await WalletService.creditWallet(
              userId,
              value.amount,
              'refund',
              `refund-${transactionRef}`,
              { billPaymentId: billPayment._id, reason: 'SMS units purchase failed' }
          );
        }

        res.status(500).json({
          message: 'SMS units purchase failed',
          error: error.message,
          success: false
        });
      }

    } catch (error) {
      console.error('Error processing SMS units purchase:', error);
      res.status(500).json({
        message: 'Failed to process SMS units purchase',
        error: error.message,
        success: false
      });
    }
  };

  /**
   * NEW: Test SMS API connection
   */
  const testSMSConnection = async (req, res) => {
    try {
      console.log('Testing VTPass SMS API connection...');
      const connectionTest = await VTPassService.testSMSConnection();

      res.status(200).json({
        message: connectionTest.success ? 'SMS API connection successful' : 'SMS API connection failed',
        data: connectionTest
      });
    } catch (error) {
      console.error('Error testing SMS connection:', error);
      res.status(500).json({
        message: 'Failed to test SMS connection',
        error: error.message
      });
    }
  };

  /**
   * Process bill payment with comprehensive email notifications
   * Updated to support SMS services
   */
  const payBill = async (req, res) => {
    try {
      // Define airtime services
      const airtimeServices = ['mtn', 'glo', 'etisalat', 'airtel', '9mobile', 'airtime'];

      // Enhanced validation schema for SMS and insurance
      const baseSchema = {
        request_id: Joi.string().optional(),
        serviceID: Joi.string().required(),
        billersCode: Joi.string().when('serviceID', {
          is: Joi.string().valid(...airtimeServices, 'bulk-sms', 'sms-units'),
          then: Joi.optional(),
          otherwise: Joi.required()
        }),
        amount: Joi.number().positive().required(),
        phone: Joi.string().required(),
        variation_code: Joi.string().when('serviceID', {
          is: Joi.string().valid(...airtimeServices),
          then: Joi.optional(),
          otherwise: Joi.required()
        }),
        paymentMethod: Joi.string().valid('wallet').default('wallet'),

        // SMS-specific fields (will be mapped to existing schema fields)
        recipients: Joi.string().when('serviceID', {
          is: 'bulk-sms',
          then: Joi.string().required(),
          otherwise: Joi.optional()
        }),
        message: Joi.string().when('serviceID', {
          is: 'bulk-sms',
          then: Joi.string().required().max(160),
          otherwise: Joi.optional()
        }),
        sender: Joi.string().when('serviceID', {
          is: 'bulk-sms',
          then: Joi.string().optional().max(11),
          otherwise: Joi.optional()
        })
      };

      // Add insurance-specific fields for third-party motor insurance
      const insuranceFields = {
        Insured_Name: Joi.string().when('serviceID', {
          is: 'ui-insure',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        engine_capacity: Joi.string().when('serviceID', {
          is: 'ui-insure',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        Chasis_Number: Joi.string().when('serviceID', {
          is: 'ui-insure',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        Plate_Number: Joi.string().when('serviceID', {
          is: 'ui-insure',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        vehicle_make: Joi.string().when('serviceID', {
          is: 'ui-insure',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        vehicle_color: Joi.string().when('serviceID', {
          is: 'ui-insure',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        vehicle_model: Joi.string().when('serviceID', {
          is: 'ui-insure',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        YearofMake: Joi.string().when('serviceID', {
          is: 'ui-insure',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        state: Joi.string().when('serviceID', {
          is: 'ui-insure',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        lga: Joi.string().when('serviceID', {
          is: 'ui-insure',
          then: Joi.required(),
          otherwise: Joi.optional()
        }),
        email: Joi.string().email().when('serviceID', {
          is: 'ui-insure',
          then: Joi.required(),
          otherwise: Joi.optional()
        })
      };

      const schema = Joi.object({ ...baseSchema, ...insuranceFields });

      const { error, value } = schema.validate(req.body, { abortEarly: false });

      if (error) {
        return res.status(400).json({
          message: 'Validation error',
          details: error.details.map(err => err.message)
        });
      }

      console.log('Processing bill payment:', {
        serviceID: value.serviceID,
        amount: value.amount,
        userId: req.user.id,
        isInsurance: value.serviceID === 'ui-insure',
        isSMS: value.serviceID === 'bulk-sms' || value.serviceID === 'sms-units'
      });

      const userId = req.user.id;

      // Get user details for email
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          message: 'User not found'
        });
      }

      console.log('User found for bill payment:', {
        userId: user._id,
        email: user.email,
        username: user.username
      });

      // Determine service type
      let serviceType = "utility";
      if (airtimeServices.includes(value.serviceID)) {
        serviceType = "airtime";
      } else if (value.serviceID.includes('data')) {
        serviceType = "data";
      } else if (value.serviceID.includes('elect')) {
        serviceType = "electricity";
      } else if (['dstv', 'gotv', 'startimes', 'showmax'].includes(value.serviceID) || value.serviceID.includes('tv')) {
        serviceType = "cable";
      } else if (['waec', 'jamb'].some(edu => value.serviceID.includes(edu))) {
        serviceType = "education";
      } else if (value.serviceID === 'ui-insure' || value.serviceID.includes('insurance')) {
        serviceType = "insurance";
      } else if (value.serviceID === 'bulk-sms' || value.serviceID === 'sms-units') {
        serviceType = "sms";
      }

      console.log('Determined service type:', serviceType);

      // Check wallet balance
      if (value.paymentMethod === 'wallet') {
        const walletInfo = await WalletService.getBalance(userId);
        console.log('Current wallet balance:', walletInfo.balance);

        if (walletInfo.balance < value.amount) {
          return res.status(400).json({
            message: 'Insufficient wallet balance',
            required: value.amount,
            available: walletInfo.balance
          });
        }
      }

      // Generate transaction reference
      const transactionRef = value.request_id || generateVTPassRequestId();
      console.log('Generated transaction reference:', transactionRef);

      // Handle SMS services with proper field mapping
      let billersCode = value.billersCode;
      let phone = value.phone;
      let additionalData = {};

      if (value.serviceID === 'bulk-sms') {
        // For bulk SMS, map fields to schema-compatible values
        const recipientNumbers = value.recipients
            .split(/[,\n]/)
            .map(num => num.trim())
            .filter(num => num && /^[0-9]{11}$/.test(num));

        billersCode = value.sender || 'Surepay'; // Use sender as billersCode
        phone = `${recipientNumbers.length} recipients`; // Summary for phone field

        // Store SMS-specific data in additionalData for responseData
        additionalData = {
          recipients: value.recipients,
          message: value.message,
          sender: value.sender || 'Surepay',
          recipientCount: recipientNumbers.length,
          messageLength: value.message.length
        };
      } else if (value.serviceID === 'sms-units') {
        // For SMS units purchase
        const units = Math.floor(value.amount / 4); // Calculate units from amount
        billersCode = `${units}_units`;
        phone = user.phone || '08000000000';

        additionalData = {
          units: units,
          unitPrice: 4
        };
      } else if (value.serviceID === 'ui-insure') {
        // For insurance, use existing logic
        billersCode = value.Plate_Number;
        additionalData = {
          insuredName: value.Insured_Name,
          plateNumber: value.Plate_Number,
          vehicleMake: value.vehicle_make,
          vehicleModel: value.vehicle_model,
          yearOfMake: value.YearofMake
        };
      }

      // Create bill payment record with mapped fields
      const billPayment = await BillPayment.create({
        user: userId,
        serviceType,
        serviceID: value.serviceID,
        billersCode: billersCode,
        variation_code: value.variation_code || value.serviceID,
        amount: value.amount,
        phone: phone,
        status: 'pending',
        transactionRef,
        paymentMethod: value.paymentMethod,
        responseData: { initialData: additionalData } // Store additional data here
      });

      console.log('Created bill payment record:', billPayment._id);

      // Prepare VTPass payload with all original fields for processing
      const paymentPayload = {
        request_id: transactionRef,
        serviceID: value.serviceID,
        amount: value.amount,
        phone: value.phone.replace(/^\+234|^0/, ''),
      };

      // Add fields based on service type
      if (value.serviceID === 'bulk-sms') {
        // Add SMS-specific fields for VTPass processing
        paymentPayload.recipients = value.recipients;
        paymentPayload.message = value.message;
        paymentPayload.sender = value.sender || 'Surepay';
      } else if (value.serviceID === 'sms-units') {
        // Add units-specific fields
        paymentPayload.units = additionalData.units;
      } else if (value.serviceID === 'ui-insure') {
        // Add insurance-specific fields
        const insuranceFields = [
          'variation_code',
          'Insured_Name',
          'engine_capacity',
          'Chasis_Number',
          'Plate_Number',
          'vehicle_make',
          'vehicle_color',
          'vehicle_model',
          'YearofMake',
          'state',
          'lga',
          'email'
        ];

        insuranceFields.forEach(field => {
          if (value[field] !== undefined && value[field] !== null) {
            paymentPayload[field] = value[field];
          }
        });

        paymentPayload.billersCode = value.Plate_Number;
      } else {
        // Add optional fields for non-airtime services
        if (!airtimeServices.includes(value.serviceID)) {
          if (value.billersCode) {
            paymentPayload.billersCode = value.billersCode;
          }
          if (value.variation_code) {
            paymentPayload.variation_code = value.variation_code;
          }
        }
      }

      // Continue with existing payment processing logic...
      // (The rest of the payment processing remains the same)

      // Get initial wallet balance for email
      let initialWalletBalance = 0;
      let finalWalletBalance = 0;

      if (value.paymentMethod === 'wallet') {
        const walletInfoBefore = await WalletService.getBalance(userId);
        initialWalletBalance = walletInfoBefore.balance;
        console.log('Wallet balance before debit:', initialWalletBalance);

        // Debit wallet
        await WalletService.debitWallet(
            userId,
            value.amount,
            'bill_payment',
            transactionRef,
            { billPaymentId: billPayment._id }
        );
        console.log('Wallet debited successfully for amount:', value.amount);

        // Get updated balance
        const walletInfoAfter = await WalletService.getBalance(userId);
        finalWalletBalance = walletInfoAfter.balance;
        console.log('Wallet balance after debit:', finalWalletBalance);
      }

      let emailSent = false;
      let vtpassMessage = '';
      let errorMessage = '';
      let certificateUrl = '';

      try {
        console.log('Initiating VTPass payment...');

        // Process payment with VTPass
        const paymentResponse = await VTPassService.payBill(paymentPayload);
        console.log('VTPass response received:', {
          responseCode: paymentResponse.response_description || paymentResponse.code,
          hasContent: !!paymentResponse.content,
          hasTransactions: !!paymentResponse.content?.transactions,
          hasCertificate: !!(paymentResponse.certUrl || paymentResponse.certificateUrl),
          hasSMSDetails: !!paymentResponse.smsDetails
        });

        // Update bill payment record
        billPayment.vtpassRef = paymentResponse.purchased_code || paymentResponse.requestId || paymentResponse.content?.transactions?.transactionId;
        const isSuccess = isVTPassPaymentSuccessful(paymentResponse);
        billPayment.status = isSuccess ? 'completed' : 'failed';
        billPayment.responseData = { ...billPayment.responseData, vtpassResponse: paymentResponse };
        await billPayment.save();

        console.log('Bill payment status updated:', {
          status: billPayment.status,
          isSuccess: isSuccess,
          vtpassRef: billPayment.vtpassRef,
          transactionId: paymentResponse.content?.transactions?.transactionId
        });

        // Extract certificate URL for insurance
        if (value.serviceID === 'ui-insure' && isSuccess) {
          certificateUrl = paymentResponse.certUrl || paymentResponse.certificateUrl || paymentResponse.purchased_code;
          console.log('Insurance certificate URL:', certificateUrl ? 'Available' : 'Not available');
        }

        // Prepare email data
        if (isSuccess) {
          if (value.serviceID === 'bulk-sms') {
            vtpassMessage = `SMS sent to ${additionalData.recipientCount} recipients successfully.`;
          } else if (value.serviceID === 'sms-units') {
            vtpassMessage = `${additionalData.units} SMS units have been added to your account.`;
          } else if (value.serviceID === 'ui-insure') {
            vtpassMessage = 'Insurance policy has been activated successfully.';
          } else {
            vtpassMessage = paymentResponse.content?.transactions?.status ||
                paymentResponse.response_description_text ||
                'Your service has been activated successfully.';
          }
          console.log('Success message for email:', vtpassMessage);
        } else {
          errorMessage = paymentResponse.response_description_text ||
              paymentResponse.content?.errors ||
              'Transaction could not be completed. Please try again.';
          console.log('Error message for email:', errorMessage);
        }

        // Handle failed payment - refund wallet
        if (billPayment.status === 'failed' && value.paymentMethod === 'wallet') {
          console.log('Processing refund for failed payment...');

          await WalletService.creditWallet(
              userId,
              value.amount,
              'refund',
              `refund-${transactionRef}`,
              { billPaymentId: billPayment._id, reason: 'Failed payment' }
          );

          console.log('Refund processed for failed payment');

          // Update final wallet balance after refund
          const walletInfoAfterRefund = await WalletService.getBalance(userId);
          finalWalletBalance = walletInfoAfterRefund.balance;
          console.log('Wallet balance after refund:', finalWalletBalance);
        }

        // Send email notification
        console.log('Sending bill payment email notification...');

        try {
          await sendBillPaymentEmail(
              {
                serviceType,
                serviceID: value.serviceID,
                amount: value.amount,
                phone: phone,
                billersCode: billersCode,
                transactionRef,
                // Service-specific fields
                ...additionalData,
                certificateUrl: certificateUrl
              },
              user,
              isSuccess,
              {
                walletBalance: finalWalletBalance,
                vtpassMessage: isSuccess ? vtpassMessage : null,
                errorMessage: !isSuccess ? errorMessage : null,
                isRefunded: !isSuccess && value.paymentMethod === 'wallet',
                certificateUrl: certificateUrl
              }
          );
          emailSent = true;
          console.log('Bill payment email sent successfully to:', user.email, 'with status:', isSuccess ? 'SUCCESS' : 'FAILED');
        } catch (emailError) {
          console.error('Error sending bill payment email:', emailError);
          // Don't fail the transaction if email fails
        }

        // Success response
        res.status(200).json({
          message: billPayment.status === 'completed' ? 'Payment successful' : 'Payment failed',
          success: billPayment.status === 'completed',
          data: {
            transactionRef,
            status: billPayment.status,
            amount: value.amount,
            serviceID: value.serviceID,
            serviceType,
            walletBalance: finalWalletBalance,
            vtpassResponse: {
              code: paymentResponse.response_description || paymentResponse.code,
              message: paymentResponse.content?.transactions?.status || 'Processing',
              transactionId: paymentResponse.content?.transactions?.transactionId,
              certificateUrl: certificateUrl,
              batchId: paymentResponse.smsDetails?.batchId
            },
            emailSent,
            notifications: {
              emailSent,
              emailAddress: user.email
            },
            // Service-specific response data
            ...(value.serviceID === 'ui-insure' && {
              insurance: {
                plateNumber: value.Plate_Number,
                insuredName: value.Insured_Name,
                certificateUrl: certificateUrl,
                hasCertificate: !!certificateUrl
              }
            }),
            ...(value.serviceID === 'bulk-sms' && {
              smsDetails: {
                recipientCount: additionalData.recipientCount,
                messageLength: additionalData.messageLength,
                batchId: paymentResponse.smsDetails?.batchId,
                sentDate: paymentResponse.smsDetails?.sentDate
              }
            }),
            ...(value.serviceID === 'sms-units' && {
              unitsDetails: {
                unitsPurchased: additionalData.units,
                unitPrice: additionalData.unitPrice,
                totalAmount: value.amount
              }
            })
          }
        });

      } catch (vtpassError) {
        console.error('VTPass API error:', vtpassError.message);

        // Update bill payment status
        billPayment.status = 'failed';
        billPayment.responseData = { ...billPayment.responseData, error: vtpassError.message };
        await billPayment.save();

        errorMessage = vtpassError.message || 'Service temporarily unavailable. Please try again.';

        // Refund wallet
        if (value.paymentMethod === 'wallet') {
          console.log('Processing refund due to VTPass error...');

          await WalletService.creditWallet(
              userId,
              value.amount,
              'refund',
              `refund-${transactionRef}`,
              { billPaymentId: billPayment._id, reason: 'VTPass API error' }
          );

          // Update final wallet balance after refund
          const walletInfoAfterRefund = await WalletService.getBalance(userId);
          finalWalletBalance = walletInfoAfterRefund.balance;
          console.log('Wallet balance after error refund:', finalWalletBalance);
        }

        // Send failure email notification
        console.log('Sending failure email notification...');

        try {
          await sendBillPaymentEmail(
              {
                serviceType,
                serviceID: value.serviceID,
                amount: value.amount,
                phone: phone,
                billersCode: billersCode,
                transactionRef,
                ...additionalData
              },
              user,
              false,
              {
                walletBalance: finalWalletBalance,
                errorMessage,
                isRefunded: value.paymentMethod === 'wallet'
              }
          );
          emailSent = true;
          console.log('Failure email sent successfully to:', user.email, 'with status: FAILED');
        } catch (emailError) {
          console.error('Error sending failure email:', emailError);
        }

        res.status(500).json({
          message: 'Payment processing failed',
          error: vtpassError.message,
          success: false,
          data: {
            transactionRef,
            status: 'failed',
            walletBalance: finalWalletBalance,
            isRefunded: value.paymentMethod === 'wallet',
            emailSent,
            notifications: {
              emailSent,
              emailAddress: user.email
            }
          }
        });
      }

    } catch (error) {
      console.error('Error processing bill payment:', error);
      res.status(500).json({
        message: 'Failed to process bill payment',
        error: error.message,
        success: false
      });
    }
  };

  /**
   * Get payment transaction status with email notifications for status changes
   */
  const getTransactionStatus = async (req, res) => {
    try {
      const { transactionRef } = req.params;

      if (!transactionRef) {
        return res.status(400).json({ message: 'Transaction reference is required' });
      }

      console.log('Checking enhanced transaction status for:', transactionRef);

      // First check regular bill payments
      let transaction = await BillPayment.findOne({ transactionRef }).populate('user', 'email firstName username');
      let transactionType = 'bill_payment';

      // If not found in bill payments, check bet wallet funding
      if (!transaction) {
        const BetWalletFunding = require('../models/BetWalletFunding'); // Adjust import path
        transaction = await BetWalletFunding.findOne({ transactionRef }).populate('user', 'email firstName username');
        if (transaction) {
          transactionType = 'bet_wallet_funding';
        }
      }

      // If still not found, check sports betting
      if (!transaction) {
        const SportsBet = require('../models/SportsBet'); // Adjust import path
        transaction = await SportsBet.findOne({ transactionRef }).populate('user', 'email firstName username');
        if (transaction) {
          transactionType = 'sports_betting';
        }
      }

      // Check flight bookings
      if (!transaction) {
        const FlightBooking = require('../models/FlightBooking'); // Adjust import path
        transaction = await FlightBooking.findOne({ transactionRef }).populate('user', 'email firstName username');
        if (transaction) {
          transactionType = 'flight_booking';
        }
      }

      // Check international airtime
      if (!transaction) {
        const InternationalAirtime = require('../models/InternationalAirtime'); // Adjust import path
        transaction = await InternationalAirtime.findOne({ transactionRef }).populate('user', 'email firstName username');
        if (transaction) {
          transactionType = 'international_airtime';
        }
      }

      if (!transaction) {
        return res.status(404).json({ message: 'Transaction not found' });
      }

      console.log('Transaction found:', {
        id: transaction._id,
        status: transaction.status,
        amount: transaction.amount || transaction.stake || transaction.totalAmount || transaction.nairaEquivalent,
        type: transactionType
      });

      // Handle status checking based on transaction type
      if (transaction.status === 'pending') {
        console.log('Transaction is pending, querying for status updates...');

        try {
          if (transactionType === 'bet_wallet_funding') {
            // Check with 9JaPay for bet wallet funding
            if (transaction.ninejaPayRef) {
              const NinejaPayService = require('../services/NinejaPayService'); // Adjust import path
              const statusResult = await NinejaPayService.checkFundingStatus(transaction.ninejaPayRef);

              if (statusResult.success && statusResult.status !== transaction.status) {
                transaction.status = statusResult.status;
                if (statusResult.status === 'completed') {
                  transaction.completedAt = new Date();
                }
                await transaction.save();
              }
            }
          } else if (transactionType === 'bill_payment') {
            // Check with VTPass for regular bill payments
            const VTPassService = require('../services/VTPassService'); // Adjust import path
            const statusResponse = await VTPassService.queryTransaction(transactionRef);

            transaction.status = statusResponse.response_description === '000' || statusResponse.code === '000' ? 'completed' : 'failed';
            transaction.responseData = { ...transaction.responseData, requery: statusResponse };
            await transaction.save();

            // Handle refund for failed payments
            if (transaction.status === 'failed' && transaction.paymentMethod === 'wallet') {
              const WalletService = require('../services/WalletService'); // Adjust import path
              await WalletService.creditWallet(
                  transaction.user._id,
                  transaction.amount,
                  'refund',
                  `refund-${transactionRef}`,
                  { billPaymentId: transaction._id, reason: 'Failed payment' }
              );
            }
          }
          // Add other transaction type status checks as needed
        } catch (statusError) {
          console.error('Error checking transaction status:', statusError);
        }
      }

      // Format response based on transaction type
      let responseData = { ...transaction.toObject() };

      if (transactionType === 'bet_wallet_funding') {
        // Normalize bet wallet fields for receipt compatibility
        responseData.serviceType = 'bet_wallet_funding';
        responseData.serviceID = transaction.platform;
        responseData.phone = transaction.customerPhone || '';
        responseData.billersCode = transaction.accountIdentifier;
        responseData.amount = transaction.amount;
      } else if (transactionType === 'sports_betting') {
        // Normalize sports betting fields
        responseData.serviceType = 'sports_betting';
        responseData.serviceID = transaction.bookmaker;
        responseData.amount = transaction.stake;
      } else if (transactionType === 'flight_booking') {
        // Normalize flight booking fields
        responseData.serviceType = 'flight_booking';
        responseData.serviceID = 'flight';
        responseData.amount = transaction.totalAmount;
      } else if (transactionType === 'international_airtime') {
        // Normalize international airtime fields
        responseData.serviceType = 'international_airtime';
        responseData.serviceID = 'foreign-airtime';
        responseData.amount = transaction.nairaEquivalent;
        responseData.phone = transaction.phoneNumber;
      }

      res.status(200).json({
        data: responseData,
        meta: {
          transactionType,
          enhanced: true
        }
      });
    } catch (error) {
      console.error('Error checking enhanced transaction status:', error);
      res.status(500).json({
        message: 'Failed to check transaction status',
        error: error.message
      });
    }
  };

  /**
   * Get user payment history
   */
  const getPaymentHistory = async (req, res) => {
    try {
      const userId = req.user.id;
      const { page = 1, limit = 10, serviceType } = req.query;

      console.log('Fetching payment history for user:', userId);

      const query = { user: userId };

      if (serviceType) {
        query.serviceType = serviceType;
        console.log('Filtering by service type:', serviceType);
      }

      const options = {
        page: parseInt(page, 10),
        limit: parseInt(limit, 10),
        sort: { createdAt: -1 },
      };

      const payments = await BillPayment.paginate(query, options);

      console.log('Payment history retrieved:', {
        totalPayments: payments.totalDocs,
        currentPage: payments.page,
        totalPages: payments.totalPages
      });

      res.status(200).json(payments);
    } catch (error) {
      console.error('Error fetching payment history:', error);
      res.status(500).json({
        message: 'Failed to fetch payment history',
        error: error.message
      });
    }
  };

  // ... (rest of the existing methods remain the same)
  /**
   * Refresh VTPass cache
   */
  const refreshServices = async (req, res) => {
    try {
      console.log('Refreshing VTPass services cache...');
      const result = await VTPassService.refreshCache();

      res.status(200).json({
        message: result.success ? 'Cache refreshed successfully' : 'Cache refresh failed',
        data: result
      });
    } catch (error) {
      console.error('Error refreshing services cache:', error);
      res.status(500).json({
        message: 'Failed to refresh services cache',
        error: error.message
      });
    }
  };

  /**
   * Get cache information
   */
  const getCacheInfo = async (req, res) => {
    try {
      const cacheInfo = VTPassService.getCacheInfo();
      res.status(200).json({
        message: 'Cache information retrieved',
        data: cacheInfo
      });
    } catch (error) {
      console.error('Error getting cache info:', error);
      res.status(500).json({
        message: 'Failed to get cache information',
        error: error.message
      });
    }
  };

  /**
   * Test VTPass connection
   */
  const testVTPassConnection = async (req, res) => {
    try {
      const connectionTest = await VTPassService.testConnection();
      res.status(200).json({
        message: connectionTest.success ? 'VTPass connection successful' : 'VTPass connection failed',
        data: connectionTest
      });
    } catch (error) {
      console.error('Error testing VTPass connection:', error);
      res.status(500).json({
        message: 'Failed to test VTPass connection',
        error: error.message
      });
    }
  };


  /**
   * Test VTPass credentials and connection
   */
  const testVTPassCredentials = async (req, res) => {
    try {
      console.log('=== VTPass Credentials Test ===');


      // Check environment variables
      const apiKey = process.env.VTPASS_API_KEY;
      const secretKey = process.env.VTPASS_SECRET_KEY;
      const baseUrl = process.env.VTPASS_BASE_URL;


      console.log('Environment Check:');
      console.log('Base URL:', baseUrl);
      console.log('API Key:', apiKey ? 'SET' : 'NOT SET');
      console.log('Secret Key:', secretKey ? 'SET' : 'NOT SET');


      if (!apiKey || !secretKey) {
        return res.status(400).json({
          success: false,
          message: 'VTPass credentials not configured',
          details: {
            apiKey: !!apiKey,
            secretKey: !!secretKey,
            baseUrl: !!baseUrl
          }
        });
      }


      // Test basic connection
      const connectionTest = await VTPassService.testConnection();


      if (connectionTest.success) {
        res.status(200).json({
          success: true,
          message: 'VTPass credentials are valid and working',
          data: {
            connectionTest,
            credentials: {
              apiKey: `${apiKey.substring(0, 8)}...`,
              secretKey: `${secretKey.substring(0, 8)}...`,
              baseUrl
            }
          }
        });
      } else {
        res.status(401).json({
          success: false,
          message: 'VTPass authentication failed',
          error: connectionTest.error,
          details: connectionTest.details
        });
      }


    } catch (error) {
      console.error('Error testing VTPass credentials:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to test VTPass credentials',
        error: error.message
      });
    }
  };


  /**
   * Test which VTPass services are whitelisted on your account
   */
  const testAvailableServices = async (req, res) => {
    try {
      console.log('=== Testing VTPass Service Availability ===');


      const testResults = {
        timestamp: new Date().toISOString(),
        tests: [],
        whitelistedServices: [],
        blockedServices: [],
        recommendations: []
      };


      // List of services to test with small amounts
      const servicesToTest = [
        { serviceID: 'mtn', name: 'MTN Airtime', amount: 50, phone: '8138885831' },
        { serviceID: 'airtel', name: 'Airtel Airtime', amount: 50, phone: '8138885831' },
        { serviceID: 'glo', name: 'Glo Airtime', amount: 50, phone: '8138885831' },
        { serviceID: 'etisalat', name: '9Mobile Airtime', amount: 50, phone: '8138885831' },
        { serviceID: 'mtn-data', name: 'MTN Data', amount: 100, phone: '8138885831' },
        { serviceID: 'airtel-data', name: 'Airtel Data', amount: 100, phone: '8138885831' },
        { serviceID: 'dstv', name: 'DSTV', amount: 2000, billersCode: '1234567890' },
        { serviceID: 'gotv', name: 'GOtv', amount: 1000, billersCode: '1234567890' },
      ];


      console.log(`Testing ${servicesToTest.length} services...`);


      // Test each service with a small transaction
      for (const service of servicesToTest) {
        try {
          console.log(`Testing ${service.name}...`);


          const testPayload = {
            request_id: generateVTPassRequestId(),
            serviceID: service.serviceID,
            amount: service.amount,
            phone: service.phone
          };


          // Add billersCode for non-airtime services
          if (service.billersCode) {
            testPayload.billersCode = service.billersCode;
          }


          const response = await VTPassService.makeRequest('/pay', 'POST', testPayload);


          const testResult = {
            serviceID: service.serviceID,
            name: service.name,
            tested: true,
            whitelisted: false,
            responseCode: response.code || response.response_description,
            message: response.response_description || 'Unknown response',
            details: response
          };


          // Analyze response
          if (response.code === '000' || response.response_description === '000') {
            testResult.whitelisted = true;
            testResult.status = 'AVAILABLE';
            testResults.whitelistedServices.push(service.serviceID);
          } else if (response.code === '028' || response.response_description?.includes('NOT WHITELISTED')) {
            testResult.status = 'NOT WHITELISTED';
            testResult.whitelisted = false;
            testResults.blockedServices.push(service.serviceID);
          } else if (response.code === '015' || response.response_description?.includes('INVALID')) {
            testResult.status = 'INVALID PARAMETERS';
            testResult.note = 'Service might be available but test parameters were invalid';
          } else {
            testResult.status = 'UNKNOWN ERROR';
            testResult.note = 'Unexpected response - check manually';
          }


          testResults.tests.push(testResult);


          // Small delay between tests
          await new Promise(resolve => setTimeout(resolve, 1000));


        } catch (error) {
          console.error(`Error testing ${service.name}:`, error.message);


          testResults.tests.push({
            serviceID: service.serviceID,
            name: service.name,
            tested: false,
            error: error.message,
            status: 'TEST FAILED'
          });
        }
      }


      // Generate recommendations
      if (testResults.whitelistedServices.length > 0) {
        testResults.recommendations.push(`✅ Available services: ${testResults.whitelistedServices.join(', ')}`);
        testResults.recommendations.push('💡 Use these services for testing your integration');
      }


      if (testResults.blockedServices.length > 0) {
        testResults.recommendations.push(`❌ Blocked services: ${testResults.blockedServices.join(', ')}`);
        testResults.recommendations.push('📧 Contact VTPass support to whitelist these services');
        testResults.recommendations.push('📞 Call: 09087482377 or Email: support@vtpass.com');
        testResults.recommendations.push('💬 Message: "Please whitelist [service names] on my sandbox account for API testing"');
      }


      if (testResults.whitelistedServices.length === 0) {
        testResults.recommendations.push('❌ No services appear to be whitelisted');
        testResults.recommendations.push('📧 Contact VTPass support immediately to enable sandbox testing');
        testResults.recommendations.push('📝 Include your sandbox account details and mention you need API access');
      }


      console.log('Service availability test completed');


      res.status(200).json({
        success: true,
        message: 'Service availability test completed',
        summary: {
          totalTested: servicesToTest.length,
          available: testResults.whitelistedServices.length,
          blocked: testResults.blockedServices.length,
          failed: testResults.tests.filter(t => !t.tested).length
        },
        ...testResults
      });


    } catch (error) {
      console.error('Service availability test failed:', error);
      res.status(500).json({
        success: false,
        message: 'Service availability test failed',
        error: error.message
      });
    }
  };


  /**
   * Get current VTPass wallet balance
   */
  const getVTPassBalance = async (req, res) => {
    try {
      console.log('Checking VTPass wallet balance...');


      const response = await VTPassService.makeRequest('/balance', 'POST', {});


      res.status(200).json({
        success: true,
        message: 'VTPass balance retrieved',
        balance: response.contents?.balance || 0,
        data: response
      });


    } catch (error) {
      console.error('Error getting VTPass balance:', error);
      res.status(500).json({
        success: false,
        message: 'Failed to get VTPass balance',
        error: error.message
      });
    }
  };


  /**
   * Contact information for VTPass support
   */
  const getVTPassSupport = async (req, res) => {
    res.status(200).json({
      success: true,
      message: 'VTPass support contact information',
      support: {
        email: 'support@vtpass.com',
        phone: '09087482377',
        address: '21A Muyibat Oyefusi Crescent, Omole Phase One, Ikeja, Lagos, Nigeria',
        documentation: 'https://www.vtpass.com/documentation/',
        sandbox: 'https://sandbox.vtpass.com/',
        live: 'https://vtpass.com/'
      },
      requestTemplate: {
        subject: 'Sandbox API Service Whitelist Request',
        message: `Hello VTPass Support,


I am developing an application using your API and need to test bill payment services on the sandbox environment.


Account Details:
- Sandbox Email: [YOUR_EMAIL]
- API Key: [FIRST_8_CHARS_OF_YOUR_API_KEY]...


Services to Whitelist:
- MTN Airtime (serviceID: mtn)
- Airtel Airtime (serviceID: airtel)
- Glo Airtime (serviceID: glo)
- 9Mobile Airtime (serviceID: etisalat)
- MTN Data (serviceID: mtn-data)
- [Add other services you need]


Please enable these services on my sandbox account for API testing.


Thank you.`
      }
    });
  };


  /**
   * Comprehensive VTPass diagnostic tool to fix the 016 error
   */
  const diagnoseVTPassIssues = async (req, res) => {
    try {
      console.log('=== VTPass Diagnostic Tool ===');


      const diagnostics = {
        timestamp: new Date().toISOString(),
        walletBalance: null,
        authTest: null,
        serviceTest: null,
        testTransactions: [],
        recommendations: []
      };


      // 1. Check VTPass wallet balance
      try {
        console.log('1. Checking VTPass wallet balance...');
        const balanceResponse = await VTPassService.makeRequest('/balance', 'POST', {});
        diagnostics.walletBalance = {
          success: true,
          balance: balanceResponse.contents?.balance || 0,
          data: balanceResponse
        };


        if (diagnostics.walletBalance.balance < 1000) {
          diagnostics.recommendations.push('⚠️ VTPass wallet balance is low. Contact support to top up your sandbox wallet.');
        } else {
          diagnostics.recommendations.push('✅ VTPass wallet balance is sufficient');
        }
      } catch (balanceError) {
        diagnostics.walletBalance = {
          success: false,
          error: balanceError.message
        };
        diagnostics.recommendations.push('❌ Could not check VTPass wallet balance. Check authentication.');
      }


      // 2. Test authentication with service categories
      try {
        console.log('2. Testing authentication...');
        const categoriesResponse = await VTPassService.getServiceCategories();
        diagnostics.authTest = {
          success: true,
          categoriesCount: categoriesResponse.content?.length || 0
        };
        diagnostics.recommendations.push('✅ Authentication is working');
      } catch (authError) {
        diagnostics.authTest = {
          success: false,
          error: authError.message
        };
        diagnostics.recommendations.push('❌ Authentication failed. Check your API credentials.');
      }


      // 3. Test different amounts to see if it's amount-related
      const testAmounts = [50, 100, 200];


      for (const amount of testAmounts) {
        try {
          console.log(`3. Testing transaction with amount: ₦${amount}`);


          const testPayload = {
            request_id: generateVTPassRequestId(),
            serviceID: 'mtn',
            amount: amount,
            phone: '8011111111'
          };


          const testResponse = await VTPassService.makeRequest('/pay', 'POST', testPayload);


          const testResult = {
            amount: amount,
            success: testResponse.code === '000',
            code: testResponse.code,
            status: testResponse.content?.transactions?.status,
            response_description: testResponse.response_description,
            transactionId: testResponse.content?.transactions?.transactionId
          };


          diagnostics.testTransactions.push(testResult);


          // Small delay between tests
          await new Promise(resolve => setTimeout(resolve, 2000));


        } catch (testError) {
          diagnostics.testTransactions.push({
            amount: amount,
            success: false,
            error: testError.message
          });
        }
      }


      // 4. Analyze results and provide recommendations
      const successfulTests = diagnostics.testTransactions.filter(t => t.success);
      const failedTests = diagnostics.testTransactions.filter(t => !t.success && !t.error);


      if (successfulTests.length > 0) {
        diagnostics.recommendations.push(`✅ ${successfulTests.length} test(s) passed - service is working`);
        diagnostics.recommendations.push(`💡 Working amounts: ₦${successfulTests.map(t => t.amount).join(', ')}`);
      }


      if (failedTests.length > 0) {
        const failureCodes = [...new Set(failedTests.map(t => t.code))];
        diagnostics.recommendations.push(`❌ ${failedTests.length} test(s) failed with codes: ${failureCodes.join(', ')}`);


        if (failureCodes.includes('016')) {
          diagnostics.recommendations.push('🔧 Error 016 solutions:');
          diagnostics.recommendations.push('   • Contact VTPass support to fully whitelist MTN airtime');
          diagnostics.recommendations.push('   • Request sandbox wallet top-up');
          diagnostics.recommendations.push('   • Verify account status and API permissions');
        }
      }


      // 5. Generate specific action plan
      const actionPlan = [
        '📧 Contact VTPass Support:',
        '   Email: support@vtpass.com',
        '   Phone: 09087482377',
        '',
        '📝 Request Template:',
        '   "Hi VTPass Support,',
        '   ',
        '   I\'m getting error code 016 (TRANSACTION FAILED) in sandbox mode.',
        '   ',
        '   Account Email: [YOUR_SANDBOX_EMAIL]',
        '   API Key: [FIRST_8_CHARS]...',
        '   ',
        '   Please:',
        '   1. Fully whitelist MTN airtime service',
        '   2. Top up my sandbox wallet',
        '   3. Confirm my account has proper API permissions',
        '   ',
        '   Test number used: 08011111111',
        '   Error code: 016',
        '   ',
        '   Thank you."'
      ];


      diagnostics.actionPlan = actionPlan;


      // 6. Check for common issues
      const commonIssues = [];


      if (diagnostics.walletBalance?.balance === 0) {
        commonIssues.push('Empty sandbox wallet');
      }


      if (!diagnostics.authTest?.success) {
        commonIssues.push('Authentication failure');
      }


      if (diagnostics.testTransactions.every(t => !t.success)) {
        commonIssues.push('All test transactions failing');
      }


      diagnostics.commonIssues = commonIssues;


      res.status(200).json({
        success: true,
        message: 'VTPass diagnostic completed',
        diagnostics,
        summary: {
          walletOk: diagnostics.walletBalance?.success && diagnostics.walletBalance?.balance > 0,
          authOk: diagnostics.authTest?.success,
          transactionsOk: successfulTests.length > 0,
          overallHealthy: diagnostics.walletBalance?.success && diagnostics.authTest?.success && successfulTests.length > 0
        }
      });


    } catch (error) {
      console.error('Diagnostic tool error:', error);
      res.status(500).json({
        success: false,
        message: 'Diagnostic tool failed',
        error: error.message
      });
    }
  };


  return {
    getServiceCategories,
    getServicesByCategory,
    getServiceVariations,
    verifyCustomer,
    getSMSBalance,
    sendBulkSMS,
    purchaseSMSUnits,
    testSMSConnection,
    payBill,
    getTransactionStatus,
    getPaymentHistory,
    refreshServices,
    getCacheInfo,
    testVTPassConnection,
    testVTPassCredentials,
    testAvailableServices,
    getVTPassBalance,
    getVTPassSupport,
    diagnoseVTPassIssues,
    getInsuranceVariations,
    getVehicleColors,
    getEngineCapacities,
    getStates,
    getLGAs,
    getVehicleMakes,
    getVehicleModels,
  };
}

export default BillPaymentController;