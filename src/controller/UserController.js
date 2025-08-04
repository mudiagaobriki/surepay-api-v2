import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';

import User from '../models/User.js';
import {registerSchema, loginSchema, usernameExistsSchema} from '../validation/auth.js';
import {
  sendVerificationEmail,
  sendPasswordForgotEmail, sendForgotPasswordOTP
} from '../../utils/emails/sendEmails.js';
import {formatPhoneNumber,isPhoneNumber, getPhoneVariations, normalizePhoneNumber, capitalize, checkIfUserIsLoggedIn} from "../../utils/func.js";
import { otpEmailService, generateOTP } from '../services/OtpEmailService.js';
import {sendPasswordResetOTP} from "../services/EnhancedOtpService.js";

function UserController() {
  const register = async (req, res) => {
    try {
      const { error, value } = registerSchema.validate(req.body, { abortEarly: false });
      if (error) {
        return res.status(400).json({
          message: 'Validation error',
          details: error.details.map(err => err.message),
        });
      }

      const { email, password, phone, firstName } = value;

      var oldUser = await User.findOne({ email });
      if (oldUser) {
        return res.status(409).json({ message: 'User with this email exists.' });
      }

      oldUser = await User.findOne({ phone });
      if (oldUser) {
        return res.status(409).json({ message: 'User with this phone number exists.' });
      }

      const encryptedPassword = await bcrypt.hash(password, 10);

      const user = await User.create({
        ...value,
        password: encryptedPassword,
      });

      const loginToken = jwt.sign(
          { user_id: user._id, email },
          process.env.JWT_SECRET,
          { expiresIn: '2h' }
      );

      user.loginToken = loginToken;
      await user.save();

      await sendVerificationEmail(email, user?._id, firstName);

      const userResponse = user.toObject();
      delete userResponse.password;
      delete userResponse.loginToken;

      res.status(201).json({
        message: 'User registered successfully',
        user: userResponse,
      });
    } catch (err) {
      console.error('Registration error:', err);
      res.status(500).json({ message: 'An error occurred during registration. Please try again later.' });
    }
  };

  const isUsernameExists = async (req, res) => {
    try {
      const { error, value } = usernameExistsSchema.validate(req.body, { abortEarly: false });
      if (error) {
        return res.status(400).json({
          message: 'Validation error',
          details: error.details.map(err => err.message),
        });
      }

      const { username } = value;

      var oldUser = await User.findOne({ username });
      if (oldUser) {
        return res.status(409).json({ message: 'User with this username exists.' });
      }

      res.status(201).json({
        message: 'Username good to go',
      });
    } catch (err) {
      console.error('Username validation error:', err);
      res.status(500).json({ message: 'An error occurred during username validation. Please try again later.' });
    }
  };

  const login = async (req, res) => {
    try {
      console.log("Login request body: ", req.body);
      const { error, value } = loginSchema.validate(req.body, { abortEarly: false });
      if (error) {
        return res.status(400).json({
          message: 'Validation error',
          details: error.details.map(err => err.message),
        });
      }

      let identifier = value?.email; // This is actually our identifier (email/username/phone)
      const password = value?.password;

      console.log("Original identifier:", identifier);

      // Build comprehensive query for all possible matches
      let query = {};

      if (isPhoneNumber(identifier)) {
        // If it looks like a phone number, get all possible variations
        const phoneVariations = getPhoneVariations(identifier);
        console.log("Phone variations to search:", phoneVariations);

        query = {
          $or: [
            // Search all phone variations
            ...phoneVariations.map(variation => ({ phone: variation })),
            // Also include as email/username in case user stored it differently
            { email: identifier },
            { username: identifier }
          ]
        };
      } else {
        // If it's not a phone number, search as email/username
        // Also try to format it in case it's a phone number in disguise
        const formattedIdentifier = formatPhoneNumber(identifier);

        query = {
          $or: [
            { email: identifier },
            { username: identifier },
            { phone: identifier },
            // Include formatted version if different
            ...(formattedIdentifier !== identifier ? [
              { email: formattedIdentifier },
              { username: formattedIdentifier },
              { phone: formattedIdentifier }
            ] : [])
          ]
        };
      }

      console.log("Login query:", JSON.stringify(query, null, 2));

      const user = await User.findOne(query).select('+password');

      if (!user) {
        console.log("No user found with identifier:", identifier);
        return res.status(401).json({
          message: 'Invalid credentials. Please check your email, username, or phone number and try again.'
        });
      }

      console.log("User found:", {
        id: user._id,
        email: user.email,
        username: user.username,
        phone: user.phone
      });

      const isPasswordValid = await bcrypt.compare(password, user.password);
      if (!isPasswordValid) {
        // Increment failed login attempts but don't save yet
        user.failedLoginAttempts = (user.failedLoginAttempts || 0) + 1;

        // Lock account after 5 failed attempts for 30 minutes
        if (user.failedLoginAttempts >= 5) {
          user.accountLockedUntil = Date.now() + 30 * 60 * 1000; // 30 minutes
        }

        // Save failed attempt
        await user.save();

        return res.status(401).json({
          message: 'Invalid credentials. Please check your password and try again.'
        });
      }

      // Check if account is locked
      if (user.isAccountLocked()) {
        return res.status(423).json({
          message: 'Account is temporarily locked due to multiple failed login attempts. Please try again later.',
          lockoutUntil: user.accountLockedUntil
        });
      }

      // Prepare successful login updates
      const loginToken = jwt.sign(
          { user_id: user._id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: '2h' }
      );

      // Update all login-related fields in memory
      user.loginToken = loginToken;
      user.failedLoginAttempts = 0;
      user.accountLockedUntil = undefined;
      user.lastLoginAt = Date.now();
      user.lastLoginIP = req.ip;
      user.lastActiveAt = Date.now();

      // Save everything in one operation
      await user.save();

      const userResponse = user.toObject();
      delete userResponse.password;
      delete userResponse.loginToken;

      console.log("Login successful for user:", user.email);

      res.status(200).json({
        message: 'Login successful',
        user: userResponse,
        token: loginToken,
      });
    } catch (err) {
      console.error('Login error:', err);
      res.status(500).json({ message: 'An error occurred during login. Please try again later.' });
    }
  };

  // New biometric login endpoint
  const biometricLogin = async (req, res) => {
    try {
      const { identifier, biometricType, deviceId, biometricData } = req.body;

      console.log("Biometric login request:", { identifier, biometricType, deviceId });

      if (!identifier || !biometricType || !deviceId) {
        return res.status(400).json({
          message: 'Identifier, biometric type, and device ID are required',
        });
      }

      console.log("Original identifier for biometric login:", identifier);

      // Build comprehensive query for biometric login
      let query = {};

      if (isPhoneNumber(identifier)) {
        // If it looks like a phone number, get all possible variations
        const phoneVariations = getPhoneVariations(identifier);
        console.log("Biometric phone variations to search:", phoneVariations);

        query = {
          $or: [
            // Search all phone variations
            ...phoneVariations.map(variation => ({ phone: variation })),
            // Also include as email/username
            { email: identifier },
            { username: identifier }
          ]
        };
      } else {
        // If it's not a phone number, search as email/username
        const formattedIdentifier = formatPhoneNumber(identifier);

        query = {
          $or: [
            { email: identifier },
            { username: identifier },
            { phone: identifier },
            // Include formatted version if different
            ...(formattedIdentifier !== identifier ? [
              { email: formattedIdentifier },
              { username: formattedIdentifier },
              { phone: formattedIdentifier }
            ] : [])
          ]
        };
      }

      console.log("Biometric login query:", JSON.stringify(query, null, 2));

      // Find user by identifier
      const user = await User.findOne(query);

      if (!user) {
        console.log("No user found for biometric login with identifier:", identifier);
        return res.status(404).json({
          message: 'User not found. Please check your credentials.'
        });
      }

      console.log("User found for biometric login:", {
        id: user._id,
        email: user.email,
        username: user.username,
        phone: user.phone,
        biometricSignIn: user.biometricSignIn
      });

      // Check if user has biometric sign-in enabled
      if (!user.biometricSignIn) {
        return res.status(403).json({
          message: 'Biometric sign-in is not enabled for this account. Please use password login and enable biometric authentication in settings.',
        });
      }

      // Check if biometric is locked due to failures
      if (user.isBiometricLocked()) {
        const lockoutMinutes = Math.ceil((user.biometricLockoutUntil - new Date()) / 60000);
        return res.status(429).json({
          message: `Biometric authentication is temporarily locked. Try again in ${lockoutMinutes} minutes.`,
          lockout: true,
          lockoutUntil: user.biometricLockoutUntil
        });
      }

      // Verify biometric type matches user's configured type
      if (user.biometricType !== biometricType && !user.fallbackBiometricTypes?.includes(biometricType)) {
        return res.status(400).json({
          message: `Biometric type ${biometricType} is not configured for this account.`,
        });
      }

      // Check if device is enrolled (optional, for enhanced security)
      const enrolledDevice = user.enrolledDevices?.find(device =>
          device.deviceId === deviceId && device.isActive
      );

      if (!enrolledDevice && user.enrolledDevices?.length > 0) {
        // If user has enrolled devices but this device isn't enrolled, require enrollment
        return res.status(403).json({
          message: 'This device is not enrolled for biometric authentication. Please use password login to enroll this device.',
          requiresEnrollment: true
        });
      }

      // Record successful biometric attempt (without saving)
      user.recordBiometricAttempt(
          'signin',
          biometricType,
          true, // success
          deviceId,
          null, // no failure reason
          req.ip
      );

      // Update device last used timestamp if enrolled
      if (enrolledDevice) {
        enrolledDevice.lastUsed = new Date();
      }

      // Generate login token
      const loginToken = jwt.sign(
          { user_id: user._id, email: user.email },
          process.env.JWT_SECRET,
          { expiresIn: '2h' }
      );

      // Set the login token
      user.loginToken = loginToken;
      user.lastLoginAt = Date.now();
      user.lastLoginIP = req.ip;
      user.lastActiveAt = Date.now();

      // Save everything in one operation to avoid parallel save error
      await user.save();

      const userResponse = user.toObject();
      delete userResponse.password;
      delete userResponse.loginToken;

      console.log("Biometric login successful for user:", user.email);

      res.status(200).json({
        message: 'Biometric login successful',
        user: userResponse,
        token: loginToken,
      });

    } catch (err) {
      console.error('Biometric login error:', err);

      // If we have user context, record the failed attempt
      if (req.body?.identifier) {
        try {
          // Use the same query logic for finding user in error case
          let identifier = req.body.identifier;
          let query = {};

          if (isPhoneNumber(identifier)) {
            const phoneVariations = getPhoneVariations(identifier);
            query = {
              $or: [
                ...phoneVariations.map(variation => ({ phone: variation })),
                { email: identifier },
                { username: identifier }
              ]
            };
          } else {
            const formattedIdentifier = formatPhoneNumber(identifier);
            query = {
              $or: [
                { email: identifier },
                { username: identifier },
                { phone: identifier },
                ...(formattedIdentifier !== identifier ? [
                  { email: formattedIdentifier },
                  { username: formattedIdentifier },
                  { phone: formattedIdentifier }
                ] : [])
              ]
            };
          }

          const user = await User.findOne(query);

          if (user) {
            // Record failed attempt and save in one operation
            user.recordBiometricAttempt(
                'signin',
                req.body?.biometricType || 'unknown',
                false, // failure
                req.body?.deviceId || 'unknown',
                err.message,
                req.ip
            );

            // Save once with all changes
            await user.save();
          }
        } catch (recordError) {
          console.error('Error recording failed biometric attempt:', recordError);
        }
      }

      res.status(500).json({
        message: 'An error occurred during biometric authentication. Please try again or use password login.'
      });
    }
  };


  // Check if user is eligible for biometric login
  const checkBiometricEligibility = async (req, res) => {
    try {
      const { identifier } = req.body;

      if (!identifier) {
        return res.status(400).json({
          message: 'Identifier is required',
        });
      }

      console.log("Checking biometric eligibility for:", identifier);

      // Build comprehensive query for eligibility check
      let query = {};

      if (isPhoneNumber(identifier)) {
        const phoneVariations = getPhoneVariations(identifier);
        console.log("Eligibility phone variations:", phoneVariations);

        query = {
          $or: [
            ...phoneVariations.map(variation => ({ phone: variation })),
            { email: identifier },
            { username: identifier }
          ]
        };
      } else {
        const formattedIdentifier = formatPhoneNumber(identifier);
        query = {
          $or: [
            { email: identifier },
            { username: identifier },
            { phone: identifier },
            ...(formattedIdentifier !== identifier ? [
              { email: formattedIdentifier },
              { username: formattedIdentifier },
              { phone: formattedIdentifier }
            ] : [])
          ]
        };
      }

      console.log("Eligibility query:", JSON.stringify(query, null, 2));

      const user = await User.findOne(query).select('biometricSignIn biometricType biometricFailureCount biometricLockoutUntil');

      if (!user) {
        console.log("No user found for eligibility check:", identifier);
        return res.status(200).json({
          eligible: false,
          reason: 'User not found'
        });
      }

      console.log("User found for eligibility:", {
        id: user._id,
        biometricSignIn: user.biometricSignIn,
        biometricType: user.biometricType
      });

      if (!user.biometricSignIn) {
        return res.status(200).json({
          eligible: false,
          reason: 'Biometric sign-in not enabled'
        });
      }

      if (user.isBiometricLocked()) {
        const lockoutMinutes = Math.ceil((user.biometricLockoutUntil - new Date()) / 60000);
        return res.status(200).json({
          eligible: false,
          reason: `Biometric authentication locked for ${lockoutMinutes} minutes`
        });
      }

      res.status(200).json({
        eligible: true,
        biometricType: user.biometricType,
        failureCount: user.biometricFailureCount || 0
      });

    } catch (err) {
      console.error('Check biometric eligibility error:', err);
      res.status(500).json({
        message: 'Error checking biometric eligibility',
      });
    }
  };

  // Setup biometric authentication
  const setupBiometricAuth = async (req, res) => {
    try {
      const userId = req.user?.id;
      const { biometricType, deviceId, deviceName, biometricData } = req.body;

      if (!userId) {
        return res.status(401).json({
          message: 'Authentication required',
        });
      }

      if (!biometricType || !deviceId) {
        return res.status(400).json({
          message: 'Biometric type and device ID are required',
        });
      }

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          message: 'User not found',
        });
      }

      // Update user's biometric settings (all in memory first)
      user.biometricSignIn = true;
      user.biometricType = biometricType;
      user.biometricLastUsed = new Date();
      user.biometricFailureCount = 0;

      // Enroll the device (without saving)
      user.enrollDevice({
        deviceId,
        deviceName: deviceName || 'Unknown Device',
        biometricTypes: [biometricType],
        hardwareLevel: 'strong' // This should come from the client
      });

      // Save everything in one operation
      await user.save();

      res.status(200).json({
        message: 'Biometric authentication setup successful',
        success: true
      });

    } catch (err) {
      console.error('Setup biometric auth error:', err);
      res.status(500).json({
        message: 'Failed to setup biometric authentication',
      });
    }
  };

  // Validate biometric data (optional, for enhanced security)
  const validateBiometricAuth = async (req, res) => {
    try {
      const { identifier, biometricType, deviceId } = req.body;

      if (!identifier || !biometricType || !deviceId) {
        return res.status(400).json({
          message: 'Identifier, biometric type, and device ID are required',
        });
      }

      const formattedIdentifier = formatPhoneNumber(identifier);

      const user = await User.findOne({
        $or: [
          { email: formattedIdentifier },
          { username: formattedIdentifier },
          { phone: formattedIdentifier }
        ]
      });

      if (!user) {
        return res.status(200).json({
          valid: false,
          reason: 'User not found'
        });
      }

      if (!user.biometricSignIn) {
        return res.status(200).json({
          valid: false,
          reason: 'Biometric authentication not enabled'
        });
      }

      if (user.biometricType !== biometricType && !user.fallbackBiometricTypes?.includes(biometricType)) {
        return res.status(200).json({
          valid: false,
          reason: 'Biometric type not configured'
        });
      }

      res.status(200).json({
        valid: true,
        user: {
          firstName: user.firstName,
          lastName: user.lastName,
          email: user.email,
          biometricType: user.biometricType
        }
      });

    } catch (err) {
      console.error('Validate biometric auth error:', err);
      res.status(500).json({
        message: 'Error validating biometric authentication',
      });
    }
  };

  const verifyUser = async (req, res) => {
    const { verifyToken } = req.params;

    if (!verifyToken) {
      return res.status(400).json({ message: 'Verification token is required.' });
    }

    try {
      const decodedToken = Buffer.from(verifyToken, 'base64').toString('utf8');
      const decoded = jwt.verify(decodedToken, process.env.JWT_SECRET);

      if (!decoded?.email) {
        return res.status(400).json({ message: 'Invalid verification token.' });
      }

      let user = await User.findOne({ email: decoded.email });

      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      if (user.verified) {
        return res.status(200).json({ message: 'User is already verified.' });
      }

      user.verified = true
      user.save()

      res.status(200).json({
        message: 'Email verified successfully.',
        user: {
          email: user.email,
          verified: user.verified,
          emailVerifiedAt: user.emailVerifiedAt,
        },
      });
    } catch (err) {
      console.error('Verification error:', err);

      if (err.name === 'TokenExpiredError') {
        return res.status(400).json({ message: 'Verification link has expired.' });
      }
      if (err.name === 'JsonWebTokenError') {
        return res.status(400).json({ message: 'Invalid verification link.' });
      }

      res.status(500).json({ message: 'An error occurred during verification. Please try again later.' });
    }
  };

  const resendVerificationLink = async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    try {
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      if (user.verified) {
        return res.status(400).json({ message: 'User is already verified.' });
      }

      await sendVerificationEmail(user.email, user._id, user.firstName);

      res.status(200).json({
        message: 'Verification email sent successfully.',
      });
    } catch (err) {
      console.error('Resend verification error:', err);
      res.status(500).json({ message: 'An error occurred while resending the verification email. Please try again later.' });
    }
  };

  const forgotPassword = async (req, res) => {
    const { email } = req.body;

    if (!email) {
      return res.status(400).json({ message: 'Email is required.' });
    }

    try {
      const user = await User.findOne({ email });

      if (!user) {
        return res.status(404).json({ message: 'Email not registered. Please create an account.' });
      }

      const resetToken = jwt.sign(
          { email: user.email, user_id: user._id },
          process.env.JWT_SECRET,
          { expiresIn: '1h' }
      );

      await sendPasswordForgotEmail(user, resetToken);

      res.status(200).json({ message: 'Password reset email sent successfully.' });
    } catch (err) {
      console.error('Forgot password error:', err);
      res.status(500).json({ message: 'An error occurred while processing your request. Please try again later.' });
    }
  };

  const sendForgotPwdOTP = async (req, res) => {
    try {
      const { error, value } = usernameExistsSchema.validate(req.body, { abortEarly: false });
      if (error) {
        return res.status(400).json({
          message: 'Validation error',
          details: error.details.map(err => err.message),
        });
      }

      let username = value?.username;

      // format the input in case a phone number was used, so it will be the right format
      console.log({username1: username})
      username = formatPhoneNumber(username);
      console.log({username2: username})

      let query = {};
      if (username) {
        query = {
          $or: [
            { username },
            { email: username },
            { phone: username }
          ]
        };
      }

      console.log({query})

      const user = await User.findOne(query);

      if (!user) {
        return res.status(401).json({ message: 'Invalid email or username or phone number.' });
      }

      console.log({user})

      const otp = await sendForgotPasswordOTP(user?.email);

      user.otpCode = otp
      user.save()

      res.status(200).json({
        message: 'Email sent successful',
      });
    } catch (err) {
      console.error('Error sending OTP:', err);
      res.status(500).json({ message: 'An error occurred while sending OTP to user email. Please try again later.' });
    }
  };

  const verifyResetOTP = async (req, res) => {
    try {
      // Validate input
      const { username, otp } = req.body;

      if (!username || !otp) {
        return res.status(400).json({
          message: 'Username and OTP are required.'
        });
      }

      // Format username in case it's a phone number
      const formattedUsername = formatPhoneNumber(username);

      // Create query to find user by username, email, or phone
      const query = {
        $or: [
          { username: formattedUsername },
          { email: formattedUsername },
          { phone: formattedUsername }
        ]
      };

      // Find the user and explicitly select the otpCode field
      const user = await User.findOne(query).select('+otpCode');

      if (!user) {
        return res.status(404).json({
          message: 'User not found. Please check your information and try again.'
        });
      }

      console.log('User found:', {
        userId: user._id,
        hasOtpCode: !!user.otpCode,
        receivedOtp: otp,
        storedOtp: user.otpCode
      });

      // Check if OTP exists
      if (!user.otpCode) {
        return res.status(400).json({
          message: 'No OTP found. Please request a new verification code.'
        });
      }

      // Verify the OTP
      if (user.otpCode !== otp) {
        return res.status(401).json({
          message: 'Invalid OTP. Please try again or request a new code.'
        });
      }

      // Calculate time difference to check if OTP is expired (30 minutes validity)
      const updatedAt = new Date(user.updatedAt).getTime();
      const currentTime = new Date().getTime();
      const timeDifference = (currentTime - updatedAt) / (1000 * 60); // Convert to minutes

      if (timeDifference > 30) {
        return res.status(401).json({
          message: 'OTP has expired. Please request a new code.'
        });
      }

      // Generate a reset token that will be used for the actual password reset
      const resetToken = jwt.sign(
          { email: user.email, user_id: user._id },
          process.env.JWT_SECRET,
          { expiresIn: '30m' }
      );

      // Clear the OTP after successful verification
      user.otpCode = null;
      await user.save();

      console.log('OTP verified successfully for user:', user._id);

      // Return success with the reset token for the next step
      res.status(200).json({
        message: 'OTP verified successfully.',
        resetToken: Buffer.from(resetToken).toString('base64')
      });

    } catch (err) {
      console.error('OTP verification error:', err);
      res.status(500).json({
        message: 'An error occurred during OTP verification. Please try again later.'
      });
    }
  };

  const resetPassword = async (req, res) => {
    const { password, resetToken } = req.body;

    if (!resetToken || !password) {
      return res.status(400).json({ message: 'Reset token and new password are required.' });
    }

    try {
      const decodedToken = Buffer.from(resetToken, 'base64').toString('utf8');
      const decoded = jwt.verify(decodedToken, process.env.JWT_SECRET);

      if (!decoded?.email) {
        return res.status(400).json({ message: 'Invalid reset token.' });
      }

      const hashedPassword = await bcrypt.hash(password, 10);

      const user = await User.findOneAndUpdate(
          { email: decoded.email },
          { password: hashedPassword },
          { new: true }
      );

      if (!user) {
        return res.status(404).json({ message: 'User not found.' });
      }

      res.status(200).json({ message: 'Password reset successfully.' });
    } catch (err) {
      console.error('Reset password error:', err);

      if (err.name === 'TokenExpiredError') {
        return res.status(400).json({ message: 'Reset token has expired. Please request a new one.' });
      }
      if (err.name === 'JsonWebTokenError') {
        return res.status(400).json({ message: 'Invalid reset token.' });
      }

      res.status(500).json({ message: 'An error occurred while resetting the password. Please try again later.' });
    }
  };

  const resetPassword2 = async (req, res) => {
    const { email, password } = req.body;

    try {
      const filter = { email };
      const update = { password: bcrypt.hashSync(password, 10) };

      const user = await User.findOneAndUpdate(filter, update);
      const updatedUser = await User.findOne(filter);

      if (updatedUser) {
        res.send({ status: 'success', msg: 'Password reset successful.' });
      } else {
        res.send({ status: 'failed', msg: 'Password reset failed. Please try again.' });
      }
    } catch (err) {
      console.log('Error: ', err);
      res.status(500).json({ message: 'An internal error occurred.' });
    }
  };

  // const sendForgotPwdOTPEnhanced = async (req, res) => {
  //   try {
  //     const { error, value } = usernameExistsSchema.validate(req.body, { abortEarly: false });
  //     if (error) {
  //       return res.status(400).json({
  //         message: 'Validation error',
  //         details: error.details.map(err => err.message),
  //       });
  //     }
  //
  //     let username = value?.username;
  //     username = formatPhoneNumber(username);
  //
  //     // Find user
  //     const user = await User.findOne({
  //       $or: [
  //         { username },
  //         { email: username },
  //         { phone: username }
  //       ]
  //     });
  //
  //     if (!user) {
  //       return res.status(404).json({
  //         message: 'No account found with this email, username, or phone number.'
  //       });
  //     }
  //
  //     // Generate OTP and send email
  //     const otp = generateOTP(6);
  //     await otpEmailService.sendPasswordResetOTP(user, otp);
  //
  //     // Store OTP in database
  //     user.otpCode = otp;
  //     user.otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  //     user.otpPurpose = 'password_reset';
  //     user.otpAttempts = 0;
  //     await user.save();
  //
  //     res.status(200).json({
  //       message: 'Verification code sent successfully via email',
  //       expiresAt: user.otpExpiresAt
  //     });
  //
  //   } catch (err) {
  //     console.error('Error sending OTP:', err);
  //     res.status(500).json({
  //       message: 'An error occurred while sending the verification code.'
  //     });
  //   }
  // };
  //
  // const verifyResetOTPEnhanced = async (req, res) => {
  //   try {
  //     const { username, otp } = req.body;
  //
  //     if (!username || !otp) {
  //       return res.status(400).json({
  //         message: 'Username and verification code are required.'
  //       });
  //     }
  //
  //     const formattedUsername = formatPhoneNumber(username);
  //
  //     // Find user
  //     const user = await User.findOne({
  //       $or: [
  //         { email: formattedUsername },
  //         { phone: formattedUsername },
  //         { username: formattedUsername }
  //       ]
  //     }).select('+otpCode');
  //
  //     if (!user) {
  //       return res.status(404).json({
  //         message: 'User not found.'
  //       });
  //     }
  //
  //     // Check lockout
  //     if (user.otpLockoutUntil && user.otpLockoutUntil > new Date()) {
  //       const lockoutMinutes = Math.ceil((user.otpLockoutUntil - new Date()) / 60000);
  //       return res.status(429).json({
  //         message: `Account temporarily locked. Try again in ${lockoutMinutes} minutes.`,
  //         lockout: true
  //       });
  //     }
  //
  //     // Check if OTP exists and is valid
  //     if (!user.otpCode) {
  //       return res.status(400).json({
  //         message: 'No verification code found. Please request a new code.'
  //       });
  //     }
  //
  //     if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
  //       user.otpCode = null;
  //       user.otpExpiresAt = null;
  //       await user.save();
  //       return res.status(400).json({
  //         message: 'Verification code has expired. Please request a new code.'
  //       });
  //     }
  //
  //     // Verify OTP
  //     if (user.otpCode !== otp) {
  //       user.otpAttempts = (user.otpAttempts || 0) + 1;
  //
  //       if (user.otpAttempts >= 5) {
  //         user.otpLockoutUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
  //         user.otpCode = null;
  //         await user.save();
  //         return res.status(429).json({
  //           message: 'Too many failed attempts. Account locked for 1 hour.',
  //           lockout: true
  //         });
  //       }
  //
  //       await user.save();
  //       return res.status(401).json({
  //         message: `Invalid verification code. ${5 - user.otpAttempts} attempts remaining.`,
  //         attemptsRemaining: 5 - user.otpAttempts
  //       });
  //     }
  //
  //     // Success - clear OTP and generate reset token
  //     user.otpCode = null;
  //     user.otpExpiresAt = null;
  //     user.otpAttempts = 0;
  //     user.otpLockoutUntil = null;
  //     await user.save();
  //
  //     const resetToken = jwt.sign(
  //         { email: user.email, user_id: user._id },
  //         process.env.JWT_SECRET,
  //         { expiresIn: '30m' }
  //     );
  //
  //     res.status(200).json({
  //       message: 'Verification code confirmed successfully.',
  //       resetToken: Buffer.from(resetToken).toString('base64')
  //     });
  //
  //   } catch (err) {
  //     console.error('OTP verification error:', err);
  //     res.status(500).json({
  //       message: 'An error occurred during verification.'
  //     });
  //   }
  // };
  //
  // const sendAccountVerificationOTP = async (req, res) => {
  //   try {
  //     const { identifier } = req.body;
  //
  //     if (!identifier) {
  //       return res.status(400).json({
  //         message: 'Identifier is required',
  //       });
  //     }
  //
  //     const formattedIdentifier = formatPhoneNumber(identifier);
  //
  //     const user = await User.findOne({
  //       $or: [
  //         { email: formattedIdentifier },
  //         { username: formattedIdentifier },
  //         { phone: formattedIdentifier }
  //       ]
  //     });
  //
  //     if (!user) {
  //       return res.status(404).json({
  //         message: 'User not found',
  //       });
  //     }
  //
  //     if (user.verified) {
  //       return res.status(400).json({
  //         message: 'Account is already verified',
  //       });
  //     }
  //
  //     // Generate OTP and send email
  //     const otp = generateOTP(6);
  //     await otpEmailService.sendAccountVerificationOTP(user, otp);
  //
  //     // Store OTP in database
  //     user.otpCode = otp;
  //     user.otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
  //     user.otpPurpose = 'account_verification';
  //     user.otpAttempts = 0;
  //     await user.save();
  //
  //     res.status(200).json({
  //       message: 'Verification code sent successfully',
  //       channels: {
  //         email: true,
  //         sms: false
  //       },
  //       expiresAt: user.otpExpiresAt
  //     });
  //
  //   } catch (err) {
  //     console.error('Error sending account verification OTP:', err);
  //     res.status(500).json({
  //       message: 'Failed to send verification code',
  //     });
  //   }
  // };

  const getOTPServiceStatus = async (req, res) => {
    try {
      // This would typically check the status of your OTP services
      // For now, we'll return a static response
      res.status(200).json({
        message: 'OTP service status retrieved successfully',
        services: {
          email: {
            available: true,
            service: 'SendGrid' // or whatever email service you're using
          },
          sms: {
            available: false, // Update based on your SMS service
            service: 'None'
          }
        }
      });
    } catch (err) {
      console.error('Error getting OTP service status:', err);
      res.status(500).json({
        message: 'Failed to get OTP service status',
      });
    }
  };

  const logout = async (req, res) => {
    try {
      const { email } = req.query;

      if (!email) {
        return res.status(400).json({
          status: 'failed',
          msg: 'Email is required'
        });
      }

      // Find and update user to clear login token
      const user = await User.findOneAndUpdate(
          { email: email },
          {
            loginToken: null,
            lastActiveAt: new Date()
          },
          { new: true }
      );

      if (!user) {
        return res.status(404).json({
          status: 'failed',
          msg: 'User not found'
        });
      }

      res.status(200).json({
        status: 'success',
        msg: 'Logout successful'
      });

    } catch (err) {
      console.error('Logout error:', err);
      res.status(500).json({
        status: 'failed',
        msg: 'An error occurred during logout'
      });
    }
  };

  /**
   * Enhanced forgot password OTP - sends to both email and SMS
   */
  const sendForgotPwdOTPEnhanced = async (req, res) => {
    try {
      const { error, value } = usernameExistsSchema.validate(req.body, { abortEarly: false });
      if (error) {
        return res.status(400).json({
          message: 'Validation error',
          details: error.details.map(err => err.message),
        });
      }

      let username = value?.username;
      username = formatPhoneNumber(username);

      // Find user
      const user = await User.findOne({
        $or: [
          { username },
          { email: username },
          { phone: username }
        ]
      });

      if (!user) {
        return res.status(404).json({
          message: 'No account found with this email, username, or phone number.'
        });
      }

      // Generate OTP and send via both channels
      const otp = generateOTP(6);

      try {
        const result = await sendPasswordResetOTP(user, otp);

        // Store OTP in database
        user.otpCode = otp;
        user.otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        user.otpPurpose = 'password_reset';
        user.otpAttempts = 0;
        await user.save();

        res.status(200).json({
          message: result.message,
          channels: result.channels,
          expiresAt: user.otpExpiresAt,
          deliveryStatus: {
            email: result.channels.includes('email'),
            sms: result.channels.includes('sms'),
            totalChannels: result.channels.length
          }
        });

      } catch (sendError) {
        console.error('Failed to send OTP:', sendError);

        // Check if we have any fallback options
        const serviceStatus = getOTPServiceStatus();
        const availableChannels = Object.keys(serviceStatus).filter(channel =>
            serviceStatus[channel].available && channel !== 'overall'
        );

        if (availableChannels.length === 0) {
          return res.status(500).json({
            message: 'No OTP delivery channels are available. Please contact support.',
            serviceStatus
          });
        }

        return res.status(500).json({
          message: 'Failed to send OTP via available channels',
          error: sendError.message,
          availableChannels
        });
      }

    } catch (err) {
      console.error('Error in enhanced forgot password OTP:', err);
      res.status(500).json({
        message: 'An error occurred while sending the verification code.'
      });
    }
  };

  /**
   * Enhanced verify reset OTP - works with both email and SMS
   */
  const verifyResetOTPEnhanced = async (req, res) => {
    try {
      const { username, otp } = req.body;

      if (!username || !otp) {
        return res.status(400).json({
          message: 'Username and verification code are required.'
        });
      }

      const formattedUsername = formatPhoneNumber(username);

      // Find user
      const user = await User.findOne({
        $or: [
          { email: formattedUsername },
          { phone: formattedUsername },
          { username: formattedUsername }
        ]
      }).select('+otpCode');

      if (!user) {
        return res.status(404).json({
          message: 'User not found.'
        });
      }

      // Check lockout
      if (user.otpLockoutUntil && user.otpLockoutUntil > new Date()) {
        const lockoutMinutes = Math.ceil((user.otpLockoutUntil - new Date()) / 60000);
        return res.status(429).json({
          message: `Account temporarily locked. Try again in ${lockoutMinutes} minutes.`,
          lockout: true
        });
      }

      // Check if OTP exists and is valid
      if (!user.otpCode) {
        return res.status(400).json({
          message: 'No verification code found. Please request a new code.'
        });
      }

      if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
        user.otpCode = null;
        user.otpExpiresAt = null;
        await user.save();
        return res.status(400).json({
          message: 'Verification code has expired. Please request a new code.'
        });
      }

      // Verify OTP
      if (user.otpCode !== otp) {
        user.otpAttempts = (user.otpAttempts || 0) + 1;

        if (user.otpAttempts >= 5) {
          user.otpLockoutUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
          user.otpCode = null;
          await user.save();
          return res.status(429).json({
            message: 'Too many failed attempts. Account locked for 1 hour.',
            lockout: true
          });
        }

        await user.save();
        return res.status(401).json({
          message: `Invalid verification code. ${5 - user.otpAttempts} attempts remaining.`,
          attemptsRemaining: 5 - user.otpAttempts
        });
      }

      // Success - clear OTP and generate reset token
      user.otpCode = null;
      user.otpExpiresAt = null;
      user.otpAttempts = 0;
      user.otpLockoutUntil = null;
      await user.save();

      const resetToken = jwt.sign(
          { email: user.email, user_id: user._id },
          process.env.JWT_SECRET,
          { expiresIn: '30m' }
      );

      res.status(200).json({
        message: 'Verification code confirmed successfully.',
        resetToken: Buffer.from(resetToken).toString('base64')
      });

    } catch (err) {
      console.error('OTP verification error:', err);
      res.status(500).json({
        message: 'An error occurred during verification.'
      });
    }
  };

  /**
   * Enhanced account verification OTP - sends to both email and SMS
   */
  const sendAccountVerificationOTP = async (req, res) => {
    try {
      const { identifier } = req.body;

      if (!identifier) {
        return res.status(400).json({
          message: 'Identifier is required',
        });
      }

      const formattedIdentifier = formatPhoneNumber(identifier);

      const user = await User.findOne({
        $or: [
          { email: formattedIdentifier },
          { username: formattedIdentifier },
          { phone: formattedIdentifier }
        ]
      });

      if (!user) {
        return res.status(404).json({
          message: 'User not found',
        });
      }

      if (user.verified) {
        return res.status(400).json({
          message: 'Account is already verified',
        });
      }

      // Generate OTP and send via both channels
      const otp = generateOTP(6);

      try {
        const result = await sendAccountVerificationOTP(user, otp);

        // Store OTP in database
        user.otpCode = otp;
        user.otpExpiresAt = new Date(Date.now() + 30 * 60 * 1000); // 30 minutes
        user.otpPurpose = 'account_verification';
        user.otpAttempts = 0;
        await user.save();

        res.status(200).json({
          message: result.message,
          channels: result.channels,
          expiresAt: user.otpExpiresAt,
          deliveryStatus: {
            email: result.channels.includes('email'),
            sms: result.channels.includes('sms'),
            totalChannels: result.channels.length
          }
        });

      } catch (sendError) {
        console.error('Failed to send account verification OTP:', sendError);

        const serviceStatus = getOTPServiceStatus();
        const availableChannels = Object.keys(serviceStatus).filter(channel =>
            serviceStatus[channel].available && channel !== 'overall'
        );

        if (availableChannels.length === 0) {
          return res.status(500).json({
            message: 'No OTP delivery channels are available. Please contact support.',
            serviceStatus
          });
        }

        return res.status(500).json({
          message: 'Failed to send verification code via available channels',
          error: sendError.message,
          availableChannels
        });
      }

    } catch (err) {
      console.error('Error sending account verification OTP:', err);
      res.status(500).json({
        message: 'Failed to send verification code',
      });
    }
  };

  /**
   * Enhanced OTP service status - shows both email and SMS availability
   */
  const getOTPServiceStatusEnhanced = async (req, res) => {
    try {
      const serviceStatus = getOTPServiceStatus();

      // Test connections if requested
      const testConnections = req.query.test === 'true';
      let connectionTests = null;

      if (testConnections) {
        connectionTests = await enhancedOTPService.testAllChannels();
      }

      res.status(200).json({
        message: 'OTP service status retrieved successfully',
        services: serviceStatus,
        summary: {
          totalAvailableChannels: serviceStatus.overall.totalChannels,
          activeChannels: serviceStatus.overall.activeChannels,
          emailAvailable: serviceStatus.email.available,
          smsAvailable: serviceStatus.sms.available,
          hasBackup: serviceStatus.overall.totalChannels > 1
        },
        connectionTests
      });
    } catch (err) {
      console.error('Error getting OTP service status:', err);
      res.status(500).json({
        message: 'Failed to get OTP service status',
      });
    }
  };

  /**
   * Verify account verification OTP - works with both email and SMS
   */
  const verifyAccountVerificationOTP = async (req, res) => {
    try {
      const { identifier, otp } = req.body;

      if (!identifier || !otp) {
        return res.status(400).json({
          message: 'Identifier and verification code are required.'
        });
      }

      const formattedIdentifier = formatPhoneNumber(identifier);

      // Find user
      const user = await User.findOne({
        $or: [
          { email: formattedIdentifier },
          { phone: formattedIdentifier },
          { username: formattedIdentifier }
        ]
      }).select('+otpCode');

      if (!user) {
        return res.status(404).json({
          message: 'User not found.'
        });
      }

      if (user.verified) {
        return res.status(400).json({
          message: 'Account is already verified.'
        });
      }

      // Check lockout
      if (user.otpLockoutUntil && user.otpLockoutUntil > new Date()) {
        const lockoutMinutes = Math.ceil((user.otpLockoutUntil - new Date()) / 60000);
        return res.status(429).json({
          message: `Account temporarily locked. Try again in ${lockoutMinutes} minutes.`,
          lockout: true
        });
      }

      // Check if OTP exists and is valid
      if (!user.otpCode) {
        return res.status(400).json({
          message: 'No verification code found. Please request a new code.'
        });
      }

      if (user.otpExpiresAt && user.otpExpiresAt < new Date()) {
        user.otpCode = null;
        user.otpExpiresAt = null;
        await user.save();
        return res.status(400).json({
          message: 'Verification code has expired. Please request a new code.'
        });
      }

      // Verify OTP
      if (user.otpCode !== otp) {
        user.otpAttempts = (user.otpAttempts || 0) + 1;

        if (user.otpAttempts >= 5) {
          user.otpLockoutUntil = new Date(Date.now() + 60 * 60 * 1000); // 1 hour
          user.otpCode = null;
          await user.save();
          return res.status(429).json({
            message: 'Too many failed attempts. Account locked for 1 hour.',
            lockout: true
          });
        }

        await user.save();
        return res.status(401).json({
          message: `Invalid verification code. ${5 - user.otpAttempts} attempts remaining.`,
          attemptsRemaining: 5 - user.otpAttempts
        });
      }

      // Success - verify account and clear OTP
      user.verified = true;
      user.emailVerifiedAt = new Date();
      user.otpCode = null;
      user.otpExpiresAt = null;
      user.otpAttempts = 0;
      user.otpLockoutUntil = null;
      await user.save();

      res.status(200).json({
        message: 'Account verified successfully.',
        user: {
          email: user.email,
          verified: user.verified,
          emailVerifiedAt: user.emailVerifiedAt,
        }
      });

    } catch (err) {
      console.error('Account verification error:', err);
      res.status(500).json({
        message: 'An error occurred during account verification.'
      });
    }
  };

  return {
    register,
    login,
    biometricLogin,
    checkBiometricEligibility,
    setupBiometricAuth,
    validateBiometricAuth,
    verifyUser,
    resendVerificationLink,
    forgotPassword,
    resetPassword,
    resetPassword2,
    isUsernameExists,
    sendForgotPwdOTP,
    verifyResetOTP,
    sendForgotPwdOTPEnhanced,
    verifyResetOTPEnhanced,
    sendAccountVerificationOTP,
    getOTPServiceStatus,
    logout,
    getOTPServiceStatusEnhanced,
    verifyAccountVerificationOTP
  };
}

export default UserController;