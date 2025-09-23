// src/controller/GiftCardController.js
import GiftCard from '../models/GiftCard.js';
import User from '../models/User.js';
import WalletService from '../services/WalletService.js';
import ReloadlyGiftCardService from '../services/ReloadlyGiftCardService.js';
import { sendTransactionNotificationEmail } from '../../utils/emails/sendEmails.js';
import Joi from 'joi';
import { v4 as uuidv4 } from 'uuid';

/**
 * Gift Card Controller
 * Handles all gift card purchase and management operations
 */
function GiftCardController() {

    /**
     * Generate unique transaction reference for gift cards
     */
    function generateGiftCardReference() {
        const timestamp = Date.now();
        const randomSuffix = Math.random().toString(36).substring(2, 8).toUpperCase();
        return `GC_${timestamp}_${randomSuffix}`;
    }

    /**
     * Get available countries for gift cards
     */
    const getCountries = async (req, res) => {
        try {
            console.log('Fetching available countries for gift cards...');

            const result = await ReloadlyGiftCardService.getCountries();

            if (!result.success) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch countries',
                    error: result.error
                });
            }

            console.log({countries: result.data[0]});

            // Format countries for frontend
            const countries = result.data.map(country => ({
                code: country.code,
                name: country.name,
                flag: country.flag,
                currency: country.currency,
                currencyName: country.currencyName
            })).sort((a, b) => a.name.localeCompare(b.name));

            console.log(countries);

            res.status(200).json({
                success: true,
                message: 'Countries retrieved successfully',
                data: countries,
                meta: {
                    total: countries.length,
                    cached: true,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error fetching gift card countries:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch available countries',
                error: error.message
            });
        }
    };

    /**
     * Get gift card products by country
     */
    const getProductsByCountry = async (req, res) => {
        try {
            const { countryCode } = req.params;
            const { page = 1, size = 50, search } = req.query;

            if (!countryCode) {
                return res.status(400).json({
                    success: false,
                    message: 'Country code is required'
                });
            }

            console.log(`Fetching gift card products for country: ${countryCode}`);

            const filters = {
                countryCode: countryCode.toUpperCase(),
                page: parseInt(page),
                size: parseInt(size)
            };

            if (search) {
                filters.productName = search;
            }

            const result = await ReloadlyGiftCardService.getProductsByCountry(countryCode, {
                page: parseInt(page),
                size: parseInt(size),
                productName: search
            });

            if (!result.success) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to fetch gift card products',
                    error: result.error
                });
            }

            console.log("Prods: ", result?.data?.products[0]);

            // Format products for frontend
            const products = result.data.products?.map(product => ({
                id: product.id,
                name: product.name,
                brand: product.brand,
                description: product.description || "",
                category: product.category?.name || 'Gift Card',
                country: {
                    code: product.country.code,
                    name: product.country.name
                },
                denomination: {
                    type: product?.denomination?.type, // FIXED or RANGE
                    fixedRecipientDenominations: product?.denomination?.fixedRecipientDenominations || [],
                    minRecipientDenomination: product?.denomination?.minRecipientDenomination,
                    maxRecipientDenomination: product?.denomination?.maxRecipientDenomination
                },
                images: {
                    logo: product?.images?.logo || null,
                    banner: product?.images.banner || null
                },
                terms: product.terms || '',
                isActive: product.isActive || false,
                currency: product.currency,
                processingTime: '5-15 minutes'
            })) || [];

            res.status(200).json({
                success: true,
                message: 'Gift card products retrieved successfully',
                data: {
                    products,
                    pagination: {
                        currentPage: result.data.number || 1,
                        totalPages: result.data.totalPages || 1,
                        totalElements: result.data.totalElements || 0,
                        size: result.data.size || size
                    }
                },
                meta: {
                    countryCode: countryCode.toUpperCase(),
                    search: search || null,
                    cached: true,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error fetching gift card products:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch gift card products',
                error: error.message
            });
        }
    };

    /**
     * Get product details by ID
     */
    const getProductById = async (req, res) => {
        try {
            const { productId } = req.params;

            if (!productId) {
                return res.status(400).json({
                    success: false,
                    message: 'Product ID is required'
                });
            }

            console.log(`Fetching gift card product details: ${productId}`);

            const result = await ReloadlyGiftCardService.getProductById(productId);

            if (!result.success) {
                return res.status(404).json({
                    success: false,
                    message: 'Product not found',
                    error: result.error
                });
            }

            const product = result.data;

            const formattedProduct = {
                id: product.productId,
                name: product.productName,
                brand: product.brand.brandName,
                description: product.description,
                category: product.category?.name || 'Gift Card',
                country: {
                    code: product.country.isoName,
                    name: product.country.name,
                    currency: product.country.currencyCode
                },
                denomination: {
                    type: product.denominationType,
                    fixedRecipientDenominations: product.fixedRecipientDenominations || [],
                    minRecipientDenomination: product.minRecipientDenomination,
                    maxRecipientDenomination: product.maxRecipientDenomination
                },
                images: {
                    logo: product.logoUrls?.[0] || null,
                    banner: product.brand?.brandLogoUrls?.[0] || null,
                    all: product.logoUrls || []
                },
                redemption: {
                    instructions: product.redeemInstruction?.concise || '',
                    verboseInstructions: product.redeemInstruction?.verbose || ''
                },
                terms: product.termsAndConditions || '',
                isActive: product.supportsPreOrder || false,
                processingTime: '5-15 minutes',
                currency: product.recipientCurrencyCode
            };

            res.status(200).json({
                success: true,
                message: 'Product details retrieved successfully',
                data: formattedProduct,
                meta: {
                    productId: productId,
                    cached: true,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error fetching product details:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch product details',
                error: error.message
            });
        }
    };

    /**
     * Calculate gift card pricing in Naira
     */
    const calculatePricing = async (req, res) => {
        try {
            const schema = Joi.object({
                productId: Joi.number().required(),
                unitPriceUSD: Joi.number().min(1).max(500).required(),
                quantity: Joi.number().min(1).max(10).default(1)
            });

            const { error, value } = schema.validate(req.body, { abortEarly: false });

            if (error) {
                return res.status(400).json({
                    success: false,
                    message: 'Validation error',
                    details: error.details.map(err => err.message)
                });
            }

            console.log({value})

            // Calculate exchange rate
            const totalAmountUSD = value.unitPriceUSD * value.quantity;
            const exchangeResult = await ReloadlyGiftCardService.calculatePricing(totalAmountUSD);

            if (!exchangeResult.success) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to calculate exchange rate',
                    error: exchangeResult.error
                });
            }

            const serviceChargePercent = parseFloat(process.env.GIFT_CARD_SERVICE_CHARGE || '2.5'); // 2.5% default
            const serviceCharge = Math.ceil((exchangeResult.data.nairaAmount * serviceChargePercent) / 100);
            const totalChargedNGN = exchangeResult.data.nairaAmount + serviceCharge;

            res.status(200).json({
                success: true,
                message: 'Pricing calculated successfully',
                data: {
                    productId: value.productId,
                    quantity: value.quantity,
                    unitPriceUSD: value.unitPriceUSD,
                    totalAmountUSD: totalAmountUSD,
                    exchangeRate: exchangeResult.data.exchangeRate,
                    nairaAmount: exchangeResult.data.nairaAmount,
                    serviceCharge: serviceCharge,
                    serviceChargePercent: serviceChargePercent,
                    totalChargedNGN: totalChargedNGN,
                    breakdown: {
                        giftCardCost: exchangeResult.data.nairaAmount,
                        processingFee: serviceCharge,
                        total: totalChargedNGN
                    }
                },
                meta: {
                    timestamp: new Date().toISOString(),
                    exchangeRateValidUntil: new Date(Date.now() + 10 * 60 * 1000).toISOString() // 10 minutes
                }
            });

        } catch (error) {
            console.error('Error calculating gift card pricing:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to calculate pricing',
                error: error.message
            });
        }
    };

    /**
     * Purchase gift card
     */
    const purchaseGiftCard = async (req, res) => {
        try {
            const schema = Joi.object({
                productId: Joi.number().required(),
                unitPriceUSD: Joi.number().min(1).max(500).required(),
                quantity: Joi.number().min(1).max(10).default(1),
                recipientEmail: Joi.string().email().required(),
                recipientPhone: Joi.object({
                    countryCode: Joi.string().optional(),
                    phoneNumber: Joi.string().optional()
                }).optional(),
                senderName: Joi.string().max(50).optional(),
                personalMessage: Joi.string().max(200).optional(),
                isGift: Joi.boolean().default(false),
                paymentMethod: Joi.string().valid('wallet').default('wallet')
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

            // Get user details
            const user = await User.findById(userId);
            if (!user) {
                return res.status(404).json({
                    success: false,
                    message: 'User not found'
                });
            }

            // Get product details
            const productResult = await ReloadlyGiftCardService.getProductById(value.productId);
            if (!productResult.success) {
                return res.status(404).json({
                    success: false,
                    message: 'Gift card product not found',
                    error: productResult.error
                });
            }

            const product = productResult.data;

            // Calculate total cost
            const totalAmountUSD = value.unitPriceUSD * value.quantity;
            const exchangeResult = await ReloadlyGiftCardService.calculateNairaAmount(totalAmountUSD);

            if (!exchangeResult.success) {
                return res.status(500).json({
                    success: false,
                    message: 'Failed to calculate exchange rate'
                });
            }

            const serviceChargePercent = parseFloat(process.env.GIFT_CARD_SERVICE_CHARGE || '2.5');
            const serviceCharge = Math.ceil((exchangeResult.data.nairaAmount * serviceChargePercent) / 100);
            const totalChargedNGN = exchangeResult.data.nairaAmount + serviceCharge;

            // Check wallet balance
            if (value.paymentMethod === 'wallet') {
                const walletInfo = await WalletService.getBalance(userId);
                console.log('Current wallet balance:', walletInfo.balance);

                if (walletInfo.balance < totalChargedNGN) {
                    return res.status(400).json({
                        success: false,
                        message: 'Insufficient wallet balance',
                        required: totalChargedNGN,
                        available: walletInfo.balance
                    });
                }
            }

            // Generate references
            const transactionRef = generateGiftCardReference();
            const customIdentifier = `${transactionRef}_${Date.now()}`;

            console.log('Processing gift card purchase:', {
                productId: value.productId,
                productName: product.productName,
                quantity: value.quantity,
                totalAmountUSD: totalAmountUSD,
                totalChargedNGN: totalChargedNGN,
                userId: userId,
                transactionRef: transactionRef
            });

            // Create gift card record
            const giftCard = await GiftCard.create({
                user: userId,
                transactionRef,
                customIdentifier,
                productId: value.productId,
                productName: product.productName,
                brand: product.brand.brandName,
                country: {
                    code: product.country.isoName,
                    name: product.country.name
                },
                quantity: value.quantity,
                unitPriceUSD: value.unitPriceUSD,
                totalAmountUSD: totalAmountUSD,
                exchangeRate: exchangeResult.data.exchangeRate,
                totalAmountNGN: exchangeResult.data.nairaAmount,
                serviceCharge: serviceCharge,
                totalChargedNGN: totalChargedNGN,
                recipientEmail: value.recipientEmail,
                recipientPhone: value.recipientPhone,
                senderName: value.senderName || `${user.firstName || user.username} ${user.lastName || ''}`.trim(),
                personalMessage: value.personalMessage,
                isGift: value.isGift,
                paymentMethod: value.paymentMethod,
                status: 'pending',
                metadata: {
                    userAgent: req.headers['user-agent'],
                    ipAddress: req.ip,
                    source: req.headers['x-app-source'] || 'web'
                }
            });

            console.log('Created gift card record:', giftCard._id);

            // Get initial wallet balance for tracking
            let initialWalletBalance = 0;
            let finalWalletBalance = 0;

            if (value.paymentMethod === 'wallet') {
                const walletInfoBefore = await WalletService.getBalance(userId);
                initialWalletBalance = walletInfoBefore.balance;
                console.log('Wallet balance before debit:', initialWalletBalance);

                // Debit wallet
                await WalletService.debitWallet(
                    userId,
                    totalChargedNGN,
                    'bill_payment',
                    transactionRef,
                    {
                        giftCardId: giftCard._id,
                        serviceType: 'gift_card',
                        productName: product.productName,
                        recipientEmail: value.recipientEmail
                    }
                );
                console.log('Wallet debited successfully for amount:', totalChargedNGN);

                // Get updated balance
                const walletInfoAfter = await WalletService.getBalance(userId);
                finalWalletBalance = walletInfoAfter.balance;
                console.log('Wallet balance after debit:', finalWalletBalance);
            }

            let emailSent = false;
            let reloadlyTransactionId = null;

            try {
                console.log('Initiating gift card purchase with Reloadly...');

                // Update status to processing
                giftCard.status = 'processing';
                await giftCard.save();

                // Prepare Reloadly purchase data
                const reloadlyData = {
                    productId: value.productId,
                    quantity: value.quantity,
                    unitPrice: value.unitPriceUSD,
                    customIdentifier: customIdentifier,
                    recipientEmail: value.recipientEmail,
                    senderName: value.senderName || user.email
                };

                // Add recipient phone if provided
                if (value.recipientPhone && value.recipientPhone.phoneNumber) {
                    reloadlyData.recipientPhoneDetails = {
                        countryCode: value.recipientPhone.countryCode || product.country.isoName,
                        phoneNumber: value.recipientPhone.phoneNumber
                    };
                }

                // Purchase from Reloadly
                const purchaseResult = await ReloadlyGiftCardService.purchaseGiftCard(reloadlyData);

                console.log('Reloadly purchase response:', {
                    success: purchaseResult.success,
                    transactionId: purchaseResult.data?.transactionId,
                    status: purchaseResult.data?.status
                });

                // console.log('Reloadly purchase response:', purchaseResult);

                if (purchaseResult.success) {
                    reloadlyTransactionId = purchaseResult.data.transactionId;

                    // Update gift card record with success
                    giftCard.reloadlyTransactionId = reloadlyTransactionId;
                    giftCard.status = 'completed';
                    giftCard.purchasedAt = new Date();
                    giftCard.deliveredAt = new Date();
                    giftCard.reloadlyResponse = purchaseResult.data.fullResponse;

                    // Initially, cards might not be available in purchase response
                    // We'll fetch them later or they'll be delivered via email
                    giftCard.giftCards = []; // Start with empty array

                    await giftCard.save();
                    console.log('Gift card purchase completed successfully');

                    // Try to get card details immediately (they might be available)
                    try {
                        const cardDetailsResult = await ReloadlyGiftCardService.getGiftCardDetails(reloadlyTransactionId);
                        if (cardDetailsResult.success && cardDetailsResult.data.cards && cardDetailsResult.data.cards.length > 0) {
                            console.log('Card details available immediately:', cardDetailsResult.data.cards.length, 'cards');
                            giftCard.giftCards = cardDetailsResult.data.cards.map(card => ({
                                cardNumber: card.cardNumber || card.code,
                                pin: card.pin || card.securityCode,
                                serialNumber: card.serialNumber,
                                expiryDate: card.expiryDate ? new Date(card.expiryDate) : null,
                                instructions: card.instructions || card.redeemInstructions,
                                termsAndConditions: card.termsAndConditions
                            }));
                            await giftCard.save();
                            console.log('Updated gift card with card details');
                        } else {
                            console.log('Card details not immediately available, will be delivered via email');
                        }
                    } catch (detailsError) {
                        console.log('Card details not immediately available:', detailsError.message);
                        // This is not an error - cards might be delivered later via email
                    }

                } else {
                    throw new Error(purchaseResult.message || 'Gift card purchase failed');
                }

                try {
                    console.log('=== GIFT CARD EMAIL SENDING DEBUG ===');
                    console.log('Gift card purchase details:', {
                        recipientEmail: value.recipientEmail,
                        senderEmail: user.email,
                        isGift: value.isGift,
                        senderName: value.senderName,
                        personalMessage: value.personalMessage
                    });

                    const emailData = {
                        transactionRef,
                        serviceType: 'gift_card',
                        amount: totalChargedNGN,
                        status: 'completed',
                        serviceName: product.productName,
                        brand: product.brand.brandName,
                        productName: product.productName,
                        unitPriceUSD: value.unitPriceUSD,
                        totalAmountUSD: totalAmountUSD,
                        quantity: value.quantity,
                        recipientEmail: value.recipientEmail,
                        senderName: value.senderName || `${user.firstName || user.username} ${user.lastName || ''}`.trim(),
                        personalMessage: value.personalMessage,
                        isGift: value.isGift,
                        giftCardDetails: {
                            brand: product.brand.brandName,
                            productName: product.productName,
                            unitPriceUSD: value.unitPriceUSD,
                            totalAmountUSD: totalAmountUSD,
                            quantity: value.quantity,
                            recipientEmail: value.recipientEmail,
                            senderName: value.senderName || `${user.firstName || user.username} ${user.lastName || ''}`.trim(),
                            personalMessage: value.personalMessage,
                            isGift: value.isGift
                        }
                    };

                    console.log('Prepared email data:', emailData);

                    // Send to purchaser
                    console.log('Sending email to purchaser:', user.email);
                    await sendTransactionNotificationEmail(
                        emailData,
                        user,
                        {
                            walletBalance: finalWalletBalance,
                            type: 'gift_card_purchase'
                        }
                    );
                    console.log('Purchaser email sent successfully');

                    // ALWAYS send to recipient if recipientEmail is provided (regardless of isGift flag)
                    // This handles cases where users want to send to themselves or others
                    if (value.recipientEmail && value.recipientEmail.trim() !== '') {
                        console.log('Checking recipient email conditions:', {
                            recipientEmail: value.recipientEmail,
                            senderEmail: user.email,
                            areEmailsDifferent: value.recipientEmail !== user.email,
                            recipientEmailTrimmed: value.recipientEmail.trim()
                        });

                        // Send to recipient if email is different from sender OR if explicitly marked as gift
                        // const shouldSendToRecipient = value.recipientEmail.trim().toLowerCase() !== user.email.toLowerCase() || value.isGift;
                        const shouldSendToRecipient = true;

                        console.log('Should send to recipient:', shouldSendToRecipient);

                        if (shouldSendToRecipient) {
                            console.log('Sending gift notification to recipient:', value.recipientEmail);

                            try {
                                await sendTransactionNotificationEmail(
                                    emailData,
                                    {
                                        email: value.recipientEmail,
                                        firstName: 'Gift Recipient',
                                        username: value.recipientEmail
                                    },
                                    {
                                        type: 'gift_card_received',
                                        isRecipientEmail: true
                                    }
                                );
                                console.log('Recipient email sent successfully to:', value.recipientEmail);
                            } catch (recipientEmailError) {
                                console.error('Failed to send recipient email:', recipientEmailError);
                                // Don't fail the main transaction, just log the error
                            }
                        } else {
                            console.log('Skipping recipient email - same as sender and not marked as gift');
                        }
                    } else {
                        console.log('No recipient email provided or email is empty');
                    }

                    emailSent = true;
                    console.log('=== GIFT CARD EMAIL SENDING COMPLETED ===');

                } catch (emailError) {
                    console.error('=== ERROR IN GIFT CARD EMAIL SENDING ===');
                    console.error('Email error details:', emailError);
                    // Don't fail the transaction if email fails
                }

                // Success response
                res.status(200).json({
                    success: true,
                    message: 'Gift card purchased successfully',
                    data: {
                        transactionRef,
                        reloadlyTransactionId,
                        status: 'completed',
                        productName: product.productName,
                        brand: product.brand.brandName,
                        quantity: value.quantity,
                        totalAmountUSD: totalAmountUSD,
                        totalChargedNGN: totalChargedNGN,
                        recipientEmail: value.recipientEmail,
                        deliveredAt: new Date(),
                        walletBalance: finalWalletBalance,
                        emailSent: emailSent,
                        processingTime: '5-15 minutes'
                    }
                });

            } catch (purchaseError) {
                console.error('Gift card purchase error:', purchaseError.message);

                // Update gift card status to failed
                giftCard.status = 'failed';
                giftCard.errorDetails = {
                    error: purchaseError.message,
                    timestamp: new Date(),
                    step: 'reloadly_purchase'
                };
                await giftCard.save();

                // Refund wallet if payment was debited
                if (value.paymentMethod === 'wallet') {
                    console.log('Processing refund for failed gift card purchase...');

                    await WalletService.creditWallet(
                        userId,
                        totalChargedNGN,
                        'refund',
                        `refund-${transactionRef}`,
                        {
                            giftCardId: giftCard._id,
                            reason: 'Failed gift card purchase'
                        }
                    );

                    console.log('Refund processed for failed gift card purchase');

                    // Update final wallet balance after refund
                    const walletInfoAfterRefund = await WalletService.getBalance(userId);
                    finalWalletBalance = walletInfoAfterRefund.balance;
                    console.log('Wallet balance after refund:', finalWalletBalance);
                }

                // Send failure email notification
                try {
                    await sendTransactionNotificationEmail(
                        {
                            transactionRef,
                            serviceType: 'gift_card',
                            amount: totalChargedNGN,
                            status: 'failed',
                            productName: product.productName,
                            errorMessage: purchaseError.message
                        },
                        user,
                        {
                            walletBalance: finalWalletBalance,
                            isRefunded: value.paymentMethod === 'wallet'
                        }
                    );
                    emailSent = true;
                    console.log('Gift card failure email sent successfully');
                } catch (emailError) {
                    console.error('Error sending failure email:', emailError);
                }

                res.status(500).json({
                    success: false,
                    message: 'Gift card purchase failed',
                    error: purchaseError.message,
                    data: {
                        transactionRef,
                        status: 'failed',
                        walletBalance: finalWalletBalance,
                        isRefunded: value.paymentMethod === 'wallet',
                        emailSent: emailSent
                    }
                });
            }

        } catch (error) {
            console.error('Error processing gift card purchase:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to process gift card purchase',
                error: error.message
            });
        }
    };

    /**
     * Get gift card transaction status
     */
    const getTransactionStatus = async (req, res) => {
        try {
            const { transactionRef } = req.params;

            if (!transactionRef) {
                return res.status(400).json({
                    success: false,
                    message: 'Transaction reference is required'
                });
            }

            console.log('Checking gift card transaction status:', transactionRef);

            const giftCard = await GiftCard.findOne({ transactionRef })
                .populate('user', 'email firstName username');

            if (!giftCard) {
                return res.status(404).json({
                    success: false,
                    message: 'Gift card transaction not found'
                });
            }

            // If transaction is pending, try to get updated status from Reloadly
            if (giftCard.status === 'pending' && giftCard.reloadlyTransactionId) {
                try {
                    const statusResult = await ReloadlyGiftCardService.getTransaction(giftCard.reloadlyTransactionId);

                    if (statusResult.success) {
                        const updatedStatus = statusResult.data.status.toLowerCase();

                        if (updatedStatus !== giftCard.status) {
                            giftCard.status = updatedStatus === 'successful' ? 'completed' : updatedStatus;

                            if (giftCard.status === 'completed') {
                                giftCard.deliveredAt = new Date();

                                // Store gift card details if provided
                                if (statusResult.data.cards && statusResult.data.cards.length > 0) {
                                    giftCard.giftCards = statusResult.data.cards.map(card => ({
                                        cardNumber: card.cardNumber,
                                        pin: card.pin,
                                        serialNumber: card.serialNumber,
                                        expiryDate: card.expiryDate ? new Date(card.expiryDate) : null,
                                        instructions: card.instructions,
                                        termsAndConditions: card.termsAndConditions
                                    }));
                                }
                            }

                            await giftCard.save();
                        }
                    }
                } catch (statusError) {
                    console.error('Error checking Reloadly transaction status:', statusError);
                }
            }

            // Return safe version (without sensitive card details)
            const safeGiftCard = giftCard.toSafeJSON();

            res.status(200).json({
                success: true,
                message: 'Transaction status retrieved successfully',
                data: {
                    ...safeGiftCard,
                    displayStatus: giftCard.displayStatus,
                    canBeRefunded: giftCard.canBeRefunded()
                },
                meta: {
                    transactionType: 'gift_card',
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error checking gift card transaction status:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to check transaction status',
                error: error.message
            });
        }
    };

    /**
     * Get user's gift card history
     */
    const getGiftCardHistory = async (req, res) => {
        try {
            const userId = req.user.id;
            const { page = 1, limit = 10, status, country } = req.query;

            console.log('Fetching gift card history for user:', userId);

            const query = { user: userId };

            // Add filters if provided
            if (status) {
                query.status = status;
            }

            if (country) {
                query['country.code'] = country.toUpperCase();
            }

            const options = {
                page: parseInt(page, 10),
                limit: parseInt(limit, 10),
                sort: { createdAt: -1 },
                populate: {
                    path: 'user',
                    select: 'email firstName username'
                }
            };

            const result = await GiftCard.paginate(query, options);

            // Return safe versions of gift cards
            const safeGiftCards = result.docs.map(giftCard => ({
                ...giftCard.toSafeJSON(),
                displayStatus: giftCard.displayStatus,
                canBeRefunded: giftCard.canBeRefunded()
            }));

            console.log('Gift card history retrieved:', {
                totalDocs: result.totalDocs,
                currentPage: result.page,
                totalPages: result.totalPages
            });

            res.status(200).json({
                success: true,
                message: 'Gift card history retrieved successfully',
                data: safeGiftCards,
                pagination: {
                    totalDocs: result.totalDocs,
                    limit: result.limit,
                    totalPages: result.totalPages,
                    page: result.page,
                    hasPrevPage: result.hasPrevPage,
                    hasNextPage: result.hasNextPage,
                    prevPage: result.prevPage,
                    nextPage: result.nextPage
                },
                meta: {
                    filters: { status, country },
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error fetching gift card history:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch gift card history',
                error: error.message
            });
        }
    };

    /**
     * Get gift card details with sensitive information (for card holder only)
     */
    const getGiftCardDetails = async (req, res) => {
        try {
            const { transactionRef } = req.params;
            const userId = req.user.id;

            if (!transactionRef) {
                return res.status(400).json({
                    success: false,
                    message: 'Transaction reference is required'
                });
            }

            const giftCard = await GiftCard.findOne({
                transactionRef,
                user: userId
            });

            if (!giftCard) {
                return res.status(404).json({
                    success: false,
                    message: 'Gift card not found'
                });
            }

            console.log('giftCard: ', giftCard);

            // Check if transaction was successful
            const isSuccessful = giftCard.reloadlyResponse?.status === 'SUCCESSFUL' || giftCard.status === 'completed';

            if (!isSuccessful) {
                return res.status(400).json({
                    success: false,
                    message: 'Gift card details not available yet',
                    status: giftCard.status,
                    displayStatus: giftCard.displayStatus
                });
            }

            // AUTO-FETCH MISSING CARD DETAILS
            // If we don't have card details and haven't tried fetching recently, try to get them
            const shouldFetchCards = (
                (!giftCard.giftCards || giftCard.giftCards.length === 0) &&
                giftCard.reloadlyTransactionId &&
                (!giftCard.lastCardFetchAttempt ||
                    new Date() - new Date(giftCard.lastCardFetchAttempt) > 2 * 60 * 1000) // 2 minutes since last attempt
            );

            if (shouldFetchCards) {
                console.log('Auto-fetching missing card details for transaction:', giftCard.reloadlyTransactionId);

                try {
                    // Update last attempt timestamp first
                    giftCard.lastCardFetchAttempt = new Date();
                    giftCard.cardFetchAttempts = (giftCard.cardFetchAttempts || 0) + 1;
                    await giftCard.save();

                    const cardDetailsResult = await ReloadlyGiftCardService.getGiftCardDetails(giftCard.reloadlyTransactionId);

                    if (cardDetailsResult.success && cardDetailsResult.data.cards && cardDetailsResult.data.cards.length > 0) {
                        console.log('Successfully auto-fetched card details:', cardDetailsResult.data.cards.length, 'cards');

                        // Store the card details
                        giftCard.giftCards = cardDetailsResult.data.cards.map(card => ({
                            cardNumber: card.cardNumber || card.code || 'N/A',
                            pin: card.pin || card.securityCode || card.accessCode || 'N/A',
                            serialNumber: card.serialNumber || card.serial || null,
                            expiryDate: card.expiryDate ? new Date(card.expiryDate) : null,
                            instructions: card.instructions || card.redeemInstructions || 'Please follow standard redemption process',
                            termsAndConditions: card.termsAndConditions || 'Standard terms apply'
                        }));

                        giftCard.cardDetailsFetched = true;
                        giftCard.cardDetailsFetchedAt = new Date();
                        await giftCard.save();

                        console.log('Card details stored successfully');
                    } else {
                        console.log('Card details not yet available from Reloadly API');
                    }
                } catch (fetchError) {
                    console.error('Error auto-fetching card details:', fetchError.message);
                    // Don't fail the request, just continue with existing data
                }
            }

            // Prepare the response data
            const responseData = {
                transactionRef: giftCard.transactionRef,
                productName: giftCard.productName,
                brand: giftCard.brand,
                quantity: giftCard.quantity,
                status: giftCard.status,
                displayStatus: giftCard.displayStatus || giftCard.status,
                recipientEmail: giftCard.recipientEmail,
                purchasedAt: giftCard.purchasedAt,
                deliveredAt: giftCard.deliveredAt,
                totalAmountUSD: giftCard.totalAmountUSD,
                totalChargedNGN: giftCard.totalChargedNGN
            };

            // Handle card details based on availability
            if (giftCard.giftCards && giftCard.giftCards.length > 0) {
                // Cards are available - return them
                responseData.giftCards = giftCard.giftCards;
                responseData.cardDetailsAvailable = true;
                responseData.expiryWarning = giftCard.giftCards.some(card =>
                    card.expiryDate && new Date(card.expiryDate) < new Date(Date.now() + 30 * 24 * 60 * 60 * 1000)
                );
            } else {
                // Cards not available - provide explanation
                responseData.giftCards = [];
                responseData.cardDetailsAvailable = false;

                // Determine the appropriate message based on fetch attempts
                const maxAttempts = 10; // Stop trying after 10 attempts
                const attemptsMade = giftCard.cardFetchAttempts || 0;

                if (attemptsMade >= maxAttempts) {
                    responseData.cardDeliveryStatus = 'Card details are being delivered via email. Please check your email inbox and spam folder for the gift card information.';
                    responseData.deliveryNote = 'If you still haven\'t received your gift card details, please contact support.';
                } else {
                    responseData.cardDeliveryStatus = 'Your gift card details are being processed and will be available shortly. Please refresh this page in a few minutes.';
                    responseData.deliveryNote = 'Gift cards may take 5-15 minutes to be fully processed after purchase.';
                }

                // Add refresh suggestion for recently purchased cards
                const timeSincePurchase = new Date() - new Date(giftCard.createdAt);
                if (timeSincePurchase < 30 * 60 * 1000) { // Less than 30 minutes old
                    responseData.canRefresh = true;
                    responseData.refreshMessage = 'This is a recent purchase. Try refreshing in a few minutes.';
                }
            }

            res.status(200).json({
                success: true,
                message: 'Gift card details retrieved successfully',
                data: responseData,
                meta: {
                    securityNote: 'Keep your gift card details secure and do not share with others',
                    emailDelivery: !responseData.cardDetailsAvailable ?
                        'Card details are delivered via email. If you haven\'t received them, please check your spam folder or contact support.' :
                        null,
                    fetchAttempts: giftCard.cardFetchAttempts || 0,
                    lastFetchAttempt: giftCard.lastCardFetchAttempt,
                    timestamp: new Date().toISOString()
                }
            });

        } catch (error) {
            console.error('Error fetching gift card details:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to fetch gift card details',
                error: error.message
            });
        }
    };


    const updateMissingCardDetails = async () => {
        try {
            // Find completed gift cards without card details
            const giftCardsWithoutDetails = await GiftCard.find({
                status: 'completed',
                reloadlyTransactionId: { $exists: true },
                $or: [
                    { giftCards: { $exists: false } },
                    { giftCards: { $size: 0 } }
                ]
            });

            console.log(`Found ${giftCardsWithoutDetails.length} gift cards without card details`);

            for (const giftCard of giftCardsWithoutDetails) {
                try {
                    const cardDetailsResult = await ReloadlyGiftCardService.getGiftCardDetails(giftCard.reloadlyTransactionId);
                    if (cardDetailsResult.success && cardDetailsResult.data.cards && cardDetailsResult.data.cards.length > 0) {
                        giftCard.giftCards = cardDetailsResult.data.cards.map(card => ({
                            cardNumber: card.cardNumber || card.code,
                            pin: card.pin || card.securityCode,
                            serialNumber: card.serialNumber,
                            expiryDate: card.expiryDate ? new Date(card.expiryDate) : null,
                            instructions: card.instructions || card.redeemInstructions,
                            termsAndConditions: card.termsAndConditions
                        }));
                        await giftCard.save();
                        console.log(`Updated card details for transaction ${giftCard.transactionRef}`);
                    }
                } catch (error) {
                    console.error(`Error updating card details for ${giftCard.transactionRef}:`, error);
                }
            }
        } catch (error) {
            console.error('Error in updateMissingCardDetails job:', error);
        }
    };


    /**
     * Test Reloadly API connection
     */
    const testReloadlyConnection = async (req, res) => {
        try {
            console.log('Testing Reloadly API connection...');

            const connectionTest = await ReloadlyGiftCardService.testConnection();

            res.status(200).json({
                success: true,
                message: connectionTest.success ? 'Reloadly API connection successful' : 'Reloadly API connection failed',
                data: connectionTest
            });

        } catch (error) {
            console.error('Error testing Reloadly connection:', error);
            res.status(500).json({
                success: false,
                message: 'Failed to test Reloadly connection',
                error: error.message
            });
        }
    };

    return {
        getCountries,
        getProductsByCountry,
        getProductById,
        calculatePricing,
        purchaseGiftCard,
        getTransactionStatus,
        getGiftCardHistory,
        getGiftCardDetails,
        testReloadlyConnection
    };
}

export default GiftCardController;