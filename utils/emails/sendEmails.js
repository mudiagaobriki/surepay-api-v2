import sendEmail from './emails.js';
import jwt from 'jsonwebtoken';
import fs from 'fs';
import mjml2html from 'mjml';
import Handlebars from 'handlebars';
import {generateAlphanumericOTP} from "../numbers.js";
import path from 'path';

export const sendVerificationEmail = async (
    email, user_id, firstName = '', subject = 'Welcome to Surepay - Verify Your Account', expiresIn = '1h'
) => {
  try {
    console.log('Sending Surepay welcome email to:', email);

    // Create email verification link
    const verificationToken = jwt.sign(
        { email, user_id },
        process.env.JWT_SECRET,
        { expiresIn } // Token expires in 1 hour
    );
    const verifyUrl = `/email/verify/${Buffer.from(verificationToken).toString('base64')}`;
    const verificationUrl = `${process.env.FRONT_END_URL}${verifyUrl}`;

    // Read the Surepay welcome email template
    const source = fs.readFileSync('./utils/emails/templates/hovapayWelcome.mjml', 'utf8');
    const { html: htmlOutput } = mjml2html(source);
    const template = Handlebars.compile(htmlOutput);

    // Prepare template data with Surepay branding
    const templateData = {
      firstName: firstName || 'Valued Customer',
      email,
      url: verificationUrl,
      appLogo: process.env.APP_LOGO_URL || 'https://via.placeholder.com/350x100/0b3d6f/FFFFFF?text=Surepay',
      appName: 'Surepay',
      supportEmail: process.env.SUPPORT_EMAIL || 'support@Surepay.com',
      // Add app store links if you have mobile apps
      googlePlayUrl: process.env.GOOGLE_PLAY_BADGE_URL || '',
      googlePlayLink: process.env.GOOGLE_PLAY_LINK || '',
      appStoreUrl: process.env.APP_STORE_BADGE_URL || '',
      appStoreLink: process.env.APP_STORE_LINK || '',
    };

    console.log('Sending welcome email with data:', {
      email,
      firstName: templateData.firstName,
      hasLogo: !!templateData.appLogo,
      verificationUrl: 'Generated successfully'
    });

    // Send welcome email
    await sendEmail(
        email,
        templateData.firstName,
        'Surepay',
        `Surepay <${process.env.FROM_EMAIL}>`,
        subject,
        '', // Text part (empty since we're using HTML)
        template(templateData)
    );

    console.log('Surepay welcome email sent successfully to:', email);
    return true;

  } catch (error) {
    console.error('Error sending Surepay welcome email:', error);
    throw new Error('Failed to send welcome email: ' + error.message);
  }
};

export const sendPasswordForgotEmail = async (user, resetToken, subject = 'Reset your password') => {
  try {
    // Encode the token for URL safety
    const encodedToken = Buffer.from(resetToken).toString('base64');
    const resetUrl = `${process.env.FRONT_END_URL}/reset-password/${encodedToken}`;

    // Construct the password reset email
    const source = fs.readFileSync('./utils/emails/templates/resetPassword.mjml', 'utf8');
    const { html: htmlOutput } = mjml2html(source);
    const template = Handlebars.compile(htmlOutput);
    const templateData = {
      firstName: user.firstName,
      url: resetUrl,
    };

    // console.log({email: user.email, subject})

    // Send the password reset email
    await sendEmail(
        user.email,
        '',
        process.env.APPLICATION_NAME,
        `${process.env.EMAIL_FROM_NAME} <${process.env.FROM_EMAIL}>`,
        subject,
        '',
        template(templateData)
    );

    return true; // Indicate success
  } catch (err) {
    console.error('Error sending password reset email:', err);
    throw new Error('Failed to send password reset email.');
  }
};

export const sendForgotPasswordOTP = async (email, subject = 'Reset your password') => {
  try {
    // generate six digit alphanumeric otp
    const otp = generateAlphanumericOTP(6);

    // Construct the password reset email
    const source = fs.readFileSync('./utils/emails/templates/resetOTP.mjml', 'utf8');
    const { html: htmlOutput } = mjml2html(source);
    const template = Handlebars.compile(htmlOutput);
    const templateData = {
      otp,
    };

    // console.log({otp})

    // console.log({email: user.email, subject})

    // Send the password reset email
    await sendEmail(
        email,
        '',
        process.env.APPLICATION_NAME,
        `${process.env.EMAIL_FROM_NAME} <${process.env.FROM_EMAIL}>`,
        subject,
        '',
        template(templateData)
    );

    return otp; // Indicate success
  } catch (err) {
    console.error('Error sending password reset email:', err);
    // return false;
    throw new Error('Failed to send password reset email.');
  }
};

/**
 * Send bill payment notification email
 * @param {Object} paymentData - Bill payment data
 * @param {Object} user - User data
 * @param {boolean} isSuccess - Whether the payment was successful
 * @param {Object} additionalData - Additional data like wallet balance, error messages
 */
export const sendBillPaymentEmail = async (paymentData, user, isSuccess, additionalData = {}) => {
  try {
    console.log('=== SENDING BILL PAYMENT EMAIL ===');
    console.log('Email parameters:', {
      userEmail: user.email,
      isSuccess,
      serviceType: paymentData.serviceType,
      amount: paymentData.amount,
      transactionRef: paymentData.transactionRef
    });

    // Choose template based on success status
    const templateName = isSuccess ? 'billPaymentSuccess.mjml' : 'billPaymentFailed.mjml';
    const templatePath = path.resolve(`./utils/emails/templates/${templateName}`);

    const source = fs.readFileSync(templatePath, 'utf8');
    const { html: htmlOutput } = mjml2html(source);
    const template = Handlebars.compile(htmlOutput);

    // Get service image URL based on serviceID
    const serviceImage = getServiceImageUrl(paymentData.serviceID, paymentData.serviceType);

    // Format transaction date
    const transactionDate = new Date().toLocaleString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Africa/Lagos'
    });

    // Prepare template data (simplified - no conditionals needed)
    const templateData = {
      firstName: user.firstName || user.username || 'Customer',
      serviceType: formatServiceType(paymentData.serviceType),
      serviceName: formatServiceName(paymentData.serviceID, paymentData.serviceType),
      serviceImage,
      amount: formatAmount(paymentData.amount),
      phone: paymentData.phone,
      billersCode: paymentData.billersCode,
      transactionRef: paymentData.transactionRef,
      transactionDate,
      walletBalance: additionalData.walletBalance ? formatAmount(additionalData.walletBalance) : null,
      // Success-specific data
      vtpassMessage: additionalData.vtpassMessage || 'Your service has been activated successfully.',
      // Failure-specific data
      errorMessage: additionalData.errorMessage || 'Please try again or contact our support team.',
      // URLs
      transactionHistoryUrl: `${process.env.FRONT_END_URL}/transactions`,
      retryUrl: `${process.env.FRONT_END_URL}/bills`,
      appName: process.env.APPLICATION_NAME || 'Surepay',
      appLogo: process.env.APP_LOGO_URL || 'https://via.placeholder.com/350x100/0b3d6f/FFFFFF?text=' + encodeURIComponent(process.env.APPLICATION_NAME || 'Surepay')
    };

    console.log('Template data prepared:', {
      templateUsed: templateName,
      firstName: templateData.firstName,
      serviceName: templateData.serviceName,
      amount: templateData.amount
    });

    // Determine email subject
    const subject = isSuccess
        ? `✅ ${formatServiceType(paymentData.serviceType)} Payment Successful - ₦${formatAmount(paymentData.amount)}`
        : `❌ ${formatServiceType(paymentData.serviceType)} Payment Failed - ₦${formatAmount(paymentData.amount)}`;

    console.log('Email subject:', subject);

    // Send email
    await sendEmail(
        user.email,
        user.firstName || user.username || '',
        process.env.APPLICATION_NAME || 'Surepay',
        `${process.env.EMAIL_FROM_NAME || 'Surepay'} <${process.env.FROM_EMAIL}>`,
        subject,
        '', // Text part (empty since we're using HTML)
        template(templateData)
    );

    console.log('=== BILL PAYMENT EMAIL SENT SUCCESSFULLY ===');
    console.log('Sent to:', user.email, 'Status in email:', isSuccess ? 'SUCCESS' : 'FAILED');
    return true;

  } catch (error) {
    console.error('=== ERROR SENDING BILL PAYMENT EMAIL ===');
    console.error('Error details:', error);
    throw new Error('Failed to send bill payment email: ' + error.message);
  }
};

/**
 * Get service image URL based on service ID and type
 */
function getServiceImageUrl(serviceID, serviceType) {
  const serviceImages = {
    'mtn': 'https://sandbox.vtpass.com/resources/products/200X200/MTN-Airtime.jpg',
    'airtel': 'https://sandbox.vtpass.com/resources/products/200X200/Airtel-Airtime.jpg',
    'glo': 'https://sandbox.vtpass.com/resources/products/200X200/GLO-Airtime.jpg',
    'etisalat': 'https://sandbox.vtpass.com/resources/products/200X200/9mobile-Airtime.jpg',
    '9mobile': 'https://sandbox.vtpass.com/resources/products/200X200/9mobile-Airtime.jpg',
    "foreign-airtime": "https://sandbox.vtpass.com/resources/products/200X200/Foreign-Airtime.jpg",

    // Data services
    'mtn-data': 'https://sandbox.vtpass.com/resources/products/200X200/MTN-Data.jpg',
    'airtel-data': 'https://sandbox.vtpass.com/resources/products/200X200/Airtel-Data.jpg',
    'glo-data': 'https://sandbox.vtpass.com/resources/products/200X200/GLO-Data.jpg',
    'glo-sme-data': 'https://sandbox.vtpass.com/resources/products/200X200/GLO-Data.jpg',
    'etisalat-data': 'https://sandbox.vtpass.com/resources/products/200X200/9mobile-Data.jpg',
    '9mobile-data': 'https://sandbox.vtpass.com/resources/products/200X200/9mobile-Data.jpg',
    "smile-direct": "https://sandbox.vtpass.com/resources/products/200X200/Smile-Payment.jpg",
    "spectranet": "https://sandbox.vtpass.com/resources/products/200X200/Spectranet.jpg",

    // TV Subscriptions
    'dstv': 'https://sandbox.vtpass.com/resources/products/200X200/Pay-DSTV-Subscription.jpg',
    'gotv': 'https://sandbox.vtpass.com/resources/products/200X200/Gotv-Payment.jpg',
    'startimes': 'https://sandbox.vtpass.com/resources/products/200X200/Startimes-Subscription.jpg',
    'showmax': 'https://sandbox.vtpass.com/resources/products/200X200/ShowMax.jpg',

    // Electricity
    'ikeja-electric': 'https://sandbox.vtpass.com/resources/products/200X200/Ikeja-Electric-Payment-PHCN.jpg',
    'eko-electric': 'https://sandbox.vtpass.com/resources/products/200X200/Eko-Electric-Payment-PHCN.jpg',
    'abuja-electric': 'https://sandbox.vtpass.com/resources/products/200X200/Abuja-Electric.jpg',
    'kano-electric': 'https://sandbox.vtpass.com/resources/products/200X200/Kano-Electric.jpg',
    'portharcourt-electric': 'https://sandbox.vtpass.com/resources/products/200X200/Port-Harcourt-Electric.jpg',
    'jos-electric': 'https://sandbox.vtpass.com/resources/products/200X200/Jos-Electric-JED.jpg',
    'kaduna-electric': 'https://sandbox.vtpass.com/resources/products/200X200/Kaduna-Electric-KAEDCO.jpg',
    'enugu-electric': 'https://sandbox.vtpass.com/resources/products/200X200/Enugu-Electric-EEDC.jpg',
    'ibadan-electric': 'https://sandbox.vtpass.com/resources/products/200X200/IBEDC-Ibadan-Electricity-Distribution-Company.jpg',
    'benin-electric': 'https://sandbox.vtpass.com/resources/products/200X200/Benin-Electricity-BEDC.jpg',
    'aba-electric': 'https://sandbox.vtpass.com/resources/products/200X200/Aba-Electric-Payment-ABEDC.jpg',
    'yola-electric': 'https://sandbox.vtpass.com/resources/products/200X200/Yola-Electric-Payment-IKEDC.jpg',

    // Education
    'waec': 'https://sandbox.vtpass.com/resources/products/200X200/WAEC-Result-Checker-PIN.jpg',
    'waec-registration': 'https://sandbox.vtpass.com/resources/products/200X200/WAEC-Registration-PIN.jpg',
    'jamb': 'https://sandbox.vtpass.com/resources/products/200X200/JAMB-PIN-VENDING-(UTME-&-Direct-Entry).jpg',

    // Insurance
    'ui-insure': "https://sandbox.vtpass.com/resources/products/200X200/Third-Party-Motor-Insurance-Universal-Insurance.jpg",

    // Other Services
    'sms-clone': 'https://sandbox.vtpass.com/resources/products/200X200/SMSclone.com.jpg',
  };

  // Return specific image if found, otherwise generate a fallback
  return serviceImages[serviceID] || generateFallbackImage(serviceID, serviceType);
}

/**
 * Generate fallback image URL for services without specific images
 */
function generateFallbackImage(serviceID, serviceType) {
  const colors = {
    'airtime': '0b3d6f',
    'data': '28a745',
    'cable': 'dc3545',
    'electricity': 'ffc107',
    'education': '6f42c1',
    'insurance': '20c997'
  };

  const color = colors[serviceType] || '0b3d6f';
  const text = serviceID.toUpperCase().replace(/-/g, ' ');

  return `https://via.placeholder.com/200x150/${color}/FFFFFF?text=${encodeURIComponent(text)}`;
}

/**
 * Format service type for display
 */
function formatServiceType(serviceType) {
  const typeMap = {
    'airtime': 'Airtime',
    'data': 'Data',
    'cable': 'Cable TV',
    'electricity': 'Electricity',
    'education': 'Education',
    'insurance': 'Insurance',
    'utility': 'Utility'
  };

  return typeMap[serviceType] || serviceType.charAt(0).toUpperCase() + serviceType.slice(1);
}

/**
 * Format service name for display
 */
function formatServiceName(serviceID, serviceType) {
  const serviceNames = {
    // Airtime
    'mtn': 'MTN Airtime',
    'airtel': 'Airtel Airtime',
    'glo': 'Glo Airtime',
    'etisalat': '9Mobile Airtime',
    '9mobile': '9Mobile Airtime',

    // Data
    'mtn-data': 'MTN Data',
    'airtel-data': 'Airtel Data',
    'glo-data': 'Glo Data',
    'etisalat-data': '9Mobile Data',

    // TV
    'dstv': 'DSTV Subscription',
    'gotv': 'GOtv Subscription',
    'startimes': 'Startimes Subscription',
    'showmax': 'Showmax Subscription',

    // Electricity
    'ikeja-electric': 'Ikeja Electric (IKEDC)',
    'eko-electric': 'Eko Electric (EKEDC)',

    // Education
    'waec': 'WAEC Registration',
    'jamb': 'JAMB Registration'
  };

  return serviceNames[serviceID] || `${serviceID.toUpperCase()} ${formatServiceType(serviceType)}`;
}

/**
 * Format amount with proper number formatting
 */
function formatAmount(amount) {
  return new Intl.NumberFormat('en-NG', {
    minimumFractionDigits: 0,
    maximumFractionDigits: 2
  }).format(amount);
}

/**
 * Send transaction history update email (for wallet transactions)
 * @param {Object} transactionData - Transaction data
 * @param {Object} user - User data
 */
export const sendTransactionNotificationEmail = async (transactionData, user, options = {}) => {
  try {
    console.log('Sending transaction notification email:', {
      email: user.email,
      type: transactionData.type || transactionData.serviceType,
      amount: transactionData.amount,
      serviceType: transactionData.serviceType
    });

    // Handle gift card transactions
    if (transactionData.serviceType === 'gift_card') {
      return await sendGiftCardNotificationEmail(
          {
            brand: transactionData.serviceName || transactionData.brand || 'Gift Card',
            productName: transactionData.productName || transactionData.serviceName || 'Digital Gift Card',
            unitPriceUSD: transactionData.unitPriceUSD || transactionData.giftCardDetails?.unitPriceUSD || 25,
            quantity: transactionData.quantity || transactionData.giftCardDetails?.quantity || 1,
            totalValueUSD: transactionData.totalAmountUSD || transactionData.giftCardDetails?.totalAmountUSD || transactionData.unitPriceUSD || 25,
            totalAmountNGN: transactionData.amount,
            recipientEmail: transactionData.recipientEmail || transactionData.giftCardDetails?.recipientEmail || user.email,
            senderName: transactionData.senderName || transactionData.giftCardDetails?.senderName || user.firstName || user.username,
            personalMessage: transactionData.personalMessage || transactionData.giftCardDetails?.personalMessage,
            isGift: transactionData.isGift || transactionData.giftCardDetails?.isGift || false,
            transactionRef: transactionData.transactionRef || transactionData.reference
          },
          user,
          {
            walletBalance: options.walletBalance,
            isRecipientEmail: options.type === 'gift_card_received'
          }
      );
    }

    // Handle bill payment transactions
    if (transactionData.serviceType && transactionData.serviceType !== 'gift_card' &&
        ['airtime', 'data', 'cable', 'electricity', 'education', 'insurance'].includes(transactionData.serviceType)) {

      const isSuccess = transactionData.status === 'completed' || transactionData.status === 'successful';

      return await sendBillPaymentEmail(
          {
            serviceType: transactionData.serviceType,
            serviceID: transactionData.serviceID,
            amount: transactionData.amount,
            phone: transactionData.phone,
            billersCode: transactionData.billersCode || transactionData.customerID,
            transactionRef: transactionData.transactionRef || transactionData.reference
          },
          user,
          isSuccess,
          {
            walletBalance: options.walletBalance,
            vtpassMessage: transactionData.responseData?.response_description_text,
            errorMessage: transactionData.errorDetails?.error || transactionData.responseData?.error
          }
      );
    }

    // Handle wallet transactions (your existing logic)
    const transaction = transactionData; // For backward compatibility
    const isCredit = transaction.amount > 0;
    const transactionType = formatTransactionType(transaction.type);

    // Prepare template data for wallet transactions
    const templateData = {
      firstName: user.firstName || user.username || 'Customer',
      isSuccess: transaction.status === 'completed',
      serviceType: transactionType,
      serviceName: `Wallet ${isCredit ? 'Credit' : 'Debit'}`,
      serviceImage: `https://via.placeholder.com/200x150/${isCredit ? '28a745' : 'dc3545'}/FFFFFF?text=WALLET`,
      amount: formatAmount(Math.abs(transaction.amount)),
      transactionRef: transaction.reference || transaction.transactionRef,
      transactionDate: new Date(transaction.createdAt).toLocaleString('en-NG', {
        year: 'numeric',
        month: 'long',
        day: 'numeric',
        hour: '2-digit',
        minute: '2-digit',
        hour12: true,
        timeZone: 'Africa/Lagos'
      }),
      walletBalance: formatAmount(transaction.balanceAfter || options.walletBalance || 0),
      transactionHistoryUrl: `${process.env.FRONT_END_URL}/transactions`,
      appName: process.env.APPLICATION_NAME || 'Surepay',
      appLogo: process.env.APP_LOGO_URL || 'https://via.placeholder.com/350x100/0b3d6f/FFFFFF?text=' + encodeURIComponent(process.env.APPLICATION_NAME || 'Surepay')
    };

    const subject = isCredit
        ? `💰 Wallet Credited - ₦${formatAmount(Math.abs(transaction.amount))}`
        : `💸 Wallet Debited - ₦${formatAmount(Math.abs(transaction.amount))}`;

    // Read template and send email
    const templatePath = path.resolve('./utils/emails/templates/walletFunded.mjml');
    const source = fs.readFileSync(templatePath, 'utf8');
    const { html: htmlOutput } = mjml2html(source);
    const template = Handlebars.compile(htmlOutput);

    await sendEmail(
        user.email,
        user.firstName || user.username || '',
        process.env.APPLICATION_NAME || 'Surepay',
        `${process.env.EMAIL_FROM_NAME} <${process.env.FROM_EMAIL}>`,
        subject,
        '',
        template(templateData)
    );

    console.log('Transaction notification email sent successfully to:', user.email);
    return true;

  } catch (error) {
    console.error('Error sending transaction notification email:', error);
    throw new Error('Failed to send transaction notification email: ' + error.message);
  }
};

export const sendGiftCardNotificationEmail = async (giftCardData, user, options = {}) => {
  try {
    console.log('=== SENDING GIFT CARD NOTIFICATION EMAIL ===');
    console.log('Email parameters:', {
      userEmail: user.email,
      isRecipientEmail: options.isRecipientEmail,
      giftCardBrand: giftCardData.brand,
      totalValueUSD: giftCardData.totalValueUSD,
      transactionRef: giftCardData.transactionRef,
      emailType: options.type
    });

    // Validate required data
    if (!user.email) {
      throw new Error('User email is required');
    }

    if (!giftCardData.brand) {
      throw new Error('Gift card brand is required');
    }

    // Choose template based on email type
    const templateName = options.isRecipientEmail ? 'giftCardReceived.mjml' : 'giftCardPurchase.mjml';
    const templatePath = path.resolve(`./utils/emails/templates/${templateName}`);

    console.log('Template path:', templatePath);

    // For now, if template doesn't exist, use bill payment template as fallback
    let source;
    let usingFallback = false;
    try {
      source = fs.readFileSync(templatePath, 'utf8');
      console.log('Using custom gift card template:', templateName);
    } catch (err) {
      console.log(`Gift card template ${templateName} not found, using bill payment template as fallback`);
      const fallbackPath = path.resolve('./utils/emails/templates/billPaymentSuccess.mjml');
      source = fs.readFileSync(fallbackPath, 'utf8');
      usingFallback = true;
    }

    const { html: htmlOutput } = mjml2html(source);
    const template = Handlebars.compile(htmlOutput);

    // Get gift card brand image
    const giftCardImage = getGiftCardBrandImage(giftCardData.brand);

    // Format transaction date
    const transactionDate = new Date().toLocaleString('en-NG', {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
      hour12: true,
      timeZone: 'Africa/Lagos'
    });

    // Prepare template data compatible with existing templates
    const templateData = {
      // User info
      firstName: user.firstName || user.username || 'Customer',

      // Service details (formatted for existing bill payment template)
      serviceType: options.isRecipientEmail ? 'Gift Card Received' : 'Gift Card Purchase',
      serviceName: `${giftCardData.brand} Gift Card`,
      serviceImage: giftCardImage,

      // Amount details
      amount: formatAmount(giftCardData.totalAmountNGN),

      // Transaction details
      transactionRef: giftCardData.transactionRef,
      transactionDate,
      phone: '', // Not applicable for gift cards
      billersCode: giftCardData.recipientEmail, // Use recipient email as identifier

      // Wallet info
      walletBalance: options.walletBalance ? formatAmount(options.walletBalance) : null,

      // Gift card specific data (for custom templates when available)
      giftCardBrand: giftCardData.brand,
      giftCardProduct: giftCardData.productName,
      giftCardValueUSD: giftCardData.unitPriceUSD,
      giftCardQuantity: giftCardData.quantity,
      giftCardQuantityDisplay: giftCardData.quantity > 1,
      totalGiftCardValueUSD: giftCardData.totalValueUSD,
      giftCardImage,
      recipientEmail: giftCardData.recipientEmail,
      isGift: giftCardData.isGift,
      senderName: giftCardData.senderName,
      personalMessage: giftCardData.personalMessage,
      amountCharged: formatAmount(giftCardData.totalAmountNGN),

      // URLs
      transactionHistoryUrl: `${process.env.FRONT_END_URL}/transactions`,
      buyMoreUrl: `${process.env.FRONT_END_URL}/bills/gift-cards`,
      retryUrl: `${process.env.FRONT_END_URL}/bills/gift-cards`,

      // App branding
      appName: process.env.APPLICATION_NAME || 'Surepay',
      appLogo: process.env.APP_LOGO_URL || 'https://via.placeholder.com/350x100/0b3d6f/FFFFFF?text=' + encodeURIComponent(process.env.APPLICATION_NAME || 'Surepay')
    };

    console.log('Template data prepared:', {
      templateUsed: templateName,
      usingFallback,
      firstName: templateData.firstName,
      serviceName: templateData.serviceName,
      amount: templateData.amount,
      recipientEmail: templateData.recipientEmail,
      isRecipient: options.isRecipientEmail
    });

    // Determine email subject
    const subject = options.isRecipientEmail
        ? `🎁 You've received a ${giftCardData.brand} Gift Card worth $${giftCardData.totalValueUSD}!`
        : `✅ Gift Card Purchase Successful - ${giftCardData.brand} ($${giftCardData.totalValueUSD})`;

    console.log('Email subject:', subject);
    console.log('Sending to:', user.email);

    // Validate email configuration
    if (!process.env.FROM_EMAIL) {
      throw new Error('FROM_EMAIL environment variable not set');
    }

    // Send email
    const emailResult = await sendEmail(
        user.email,
        user.firstName || user.username || '',
        process.env.APPLICATION_NAME || 'Surepay',
        `${process.env.EMAIL_FROM_NAME || 'Surepay'} <${process.env.FROM_EMAIL}>`,
        subject,
        '', // Text part (empty since we're using HTML)
        template(templateData)
    );

    console.log('Email send result:', emailResult);
    console.log('=== GIFT CARD EMAIL SENT SUCCESSFULLY ===');
    console.log('Sent to:', user.email, 'Type:', options.isRecipientEmail ? 'RECIPIENT' : 'PURCHASER');
    return true;

  } catch (error) {
    console.error('=== ERROR SENDING GIFT CARD EMAIL ===');
    console.error('Error details:', error);
    console.error('Stack trace:', error.stack);
    throw new Error('Failed to send gift card email: ' + error.message);
  }
};

/**
 * Get gift card brand image URL
 */
function getGiftCardBrandImage(brand) {
  const brandImages = {
    'amazon': 'https://via.placeholder.com/200x150/FF9900/FFFFFF?text=AMAZON',
    'itunes': 'https://via.placeholder.com/200x150/000000/FFFFFF?text=ITUNES',
    'google play': 'https://via.placeholder.com/200x150/34A853/FFFFFF?text=GOOGLE+PLAY',
    'visa': 'https://via.placeholder.com/200x150/1434CB/FFFFFF?text=VISA',
    'mastercard': 'https://via.placeholder.com/200x150/EB001B/FFFFFF?text=MASTERCARD',
    'steam': 'https://via.placeholder.com/200x150/1B2838/FFFFFF?text=STEAM',
    'xbox': 'https://via.placeholder.com/200x150/107C10/FFFFFF?text=XBOX',
    'netflix': 'https://via.placeholder.com/200x150/E50914/FFFFFF?text=NETFLIX',
  };

  const brandLower = brand.toLowerCase();

  // Check for exact or partial matches
  for (const [key, value] of Object.entries(brandImages)) {
    if (brandLower.includes(key) || key.includes(brandLower)) {
      return value;
    }
  }

  // Default fallback
  const encodedBrand = encodeURIComponent(brand.toUpperCase());
  return `https://via.placeholder.com/200x150/8B5CF6/FFFFFF?text=${encodedBrand}`;
}

/**
 * Format transaction type for display
 */
function formatTransactionType(type) {
  const typeMap = {
    'deposit': 'Deposit',
    'withdrawal': 'Withdrawal',
    'bill_payment': 'Bill Payment',
    'refund': 'Refund',
    'transfer': 'Transfer',
    'virtual_account_credit': 'Bank Transfer'
  };

  return typeMap[type] || type.charAt(0).toUpperCase() + type.slice(1);
}