// controller/ProfileController.js - Clean Enhanced Profile Controller with Biometric Management
import Profile from '../models/Profile.js';
import User from '../models/User.js';
import bcrypt from 'bcryptjs';
import cloudinary from '../../config/cloudinary.js';

function ProfileController() {

  // ==================== UTILITY FUNCTIONS ====================

  // Helper function to calculate biometric security score
  const calculateBiometricSecurityScore = (user) => {
    let score = 0;

    // Base score for having biometrics enabled
    if (user.biometricSignIn) score += 20;
    if (user.biometricTransactions) score += 20;

    // Hardware level scoring
    if (user.biometricHardwareLevel === 'strong') score += 30;
    else if (user.biometricHardwareLevel === 'weak') score += 15;

    // Primary biometric type scoring
    if (user.biometricType === 'Face ID') score += 15;
    else if (user.biometricType === 'Fingerprint') score += 10;
    else if (user.biometricType === 'Iris') score += 20;

    // Fallback methods add security
    score += Math.min((user.fallbackBiometricTypes?.length || 0) * 5, 15);

    // Reduce score for recent failures
    score -= Math.min((user.biometricFailureCount || 0) * 2, 20);

    return Math.max(0, Math.min(100, score));
  };

  // ==================== CORE PROFILE METHODS ====================

  const getUserProfile = async (req, res) => {
    try {
      console.log('Get user profile with enhanced biometric data...');

      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Authentication required. User ID not found in token.',
        });
      }

      // Get user data with biometric information
      let user;
      try {
        user = await User.findById(userId)
            .select('+pin -password -loginToken -__v')
            .lean();
      } catch (dbError) {
        console.error('Database error finding user:', dbError);
        return res.status(400).json({
          status: 'error',
          message: 'Invalid user ID format',
        });
      }

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      // Get profile data
      let profile = null;
      try {
        profile = await Profile.findOne({ email: user.email })
            .select('-__v')
            .lean();
      } catch (profileError) {
        console.error('Error finding profile:', profileError);
      }

      // If no profile exists, create a basic one
      if (!profile) {
        try {
          const profileData = {
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            email: user.email,
            phone: user.phone || '',
          };

          profile = await Profile.create(profileData);
        } catch (createError) {
          console.error('Error creating profile:', createError);
          profile = {
            firstName: user.firstName || '',
            lastName: user.lastName || '',
            email: user.email,
            phone: user.phone || '',
          };
        }
      }

      // Combine user and profile data with enhanced biometric info
      const combinedData = {
        // User fields
        _id: user._id,
        email: user.email,
        username: user.username,
        phone: user.phone,
        verified: user.verified,
        phoneVerified: user.phoneVerified,
        emailVerifiedAt: user.emailVerifiedAt,
        phoneVerifiedAt: user.phoneVerifiedAt,
        is2faEnabled: user.is2faEnabled,
        typeOf2fa: user.typeOf2fa,
        status: user.status,
        type: user.type,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,

        // Profile fields
        firstName: profile.firstName || user.firstName || '',
        lastName: profile.lastName || user.lastName || '',
        otherNames: profile.otherNames || '',
        country: profile.country || user.country || 'NG',
        countryCode: profile.countryCode || '',
        gender: profile.gender || '',
        dateOfBirth: profile.dateOfBirth || '',
        altPhone: profile.altPhone || '',
        city: profile.city || '',
        address: profile.address || '',
        zip: profile.zip || '',
        imageUrl: profile.imageUrl || '',
        otherImages: profile.otherImages || [],
        maritalStatus: profile.maritalStatus || '',
        marriageAnniversary: profile.marriageAnniversary || '',
        nextOfKin: profile.nextOfKin || '',
        nextOfKinContact: profile.nextOfKinContact || '',

        // Enhanced biometric security fields
        hasTransactionPin: !!user.pin,
        biometricSignIn: user.biometricSignIn || false,
        biometricTransactions: user.biometricTransactions || false,
        biometricType: user.biometricType || 'none',
        fallbackBiometricTypes: user.fallbackBiometricTypes || [],
        biometricHardwareLevel: user.biometricHardwareLevel || 'none',
        biometricLastUsed: user.biometricLastUsed || null,
        biometricFailureCount: user.biometricFailureCount || 0,

        // KYC and Account fields
        kycStatus: user.kycStatus || 'pending',
        kycLevel: user.kycLevel || 0,
        accountTier: user.accountTier || 'basic',

        // Settings with defaults
        privacySettings: user.privacySettings || {
          profileVisibility: 'private',
          emailNotifications: true,
          smsNotifications: true,
          transactionNotifications: true,
          marketingEmails: false
        },
        walletSettings: user.walletSettings || {
          autoTopUp: false,
          autoTopUpAmount: 0,
          autoTopUpThreshold: 0,
          transactionLimit: {
            daily: 50000,
            monthly: 500000
          }
        },

        // Additional computed fields
        fullName: `${profile.firstName || user.firstName || ''} ${profile.lastName || user.lastName || ''}`.trim(),
        isProfileComplete: !!(
            (profile.firstName || user.firstName) &&
            (profile.lastName || user.lastName) &&
            user.email &&
            user.phone &&
            user.verified
        ),
        biometricSecurityScore: calculateBiometricSecurityScore(user)
      };

      res.status(200).json({
        status: 'success',
        message: 'Profile retrieved successfully',
        data: combinedData,
      });

    } catch (err) {
      console.error('Get user profile error:', err);
      res.status(500).json({
        status: 'error',
        message: 'An error occurred while retrieving the profile.',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  };

  const editProfile = async (req, res) => {
    try {
      const { id, payload } = req.body;

      if (!id) {
        return res.status(400).json({
          status: 'error',
          message: 'Profile ID is required',
        });
      }

      if (!payload || Object.keys(payload).length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No data provided for update',
        });
      }

      // Enhanced validation
      if (payload.firstName && payload.firstName.trim() === '') {
        return res.status(400).json({
          status: 'error',
          message: 'First name cannot be empty',
        });
      }

      if (payload.email && !payload.email.includes('@')) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid email format',
        });
      }

      // Check if email is already taken by another user
      if (payload.email) {
        const existingUser = await User.findOne({
          email: payload.email.toLowerCase().trim(),
          _id: { $ne: id }
        });

        if (existingUser) {
          return res.status(409).json({
            status: 'error',
            message: 'Email is already taken by another user',
          });
        }
      }

      // Check if phone is already taken by another user
      if (payload.phone) {
        const existingUser = await User.findOne({
          phone: payload.phone.trim(),
          _id: { $ne: id }
        });

        if (existingUser) {
          return res.status(409).json({
            status: 'error',
            message: 'Phone number is already taken by another user',
          });
        }
      }

      // Clean payload data
      const cleanPayload = {};
      Object.keys(payload).forEach(key => {
        if (payload[key] !== null && payload[key] !== undefined) {
          if (typeof payload[key] === 'string') {
            cleanPayload[key] = payload[key].trim();
          } else {
            cleanPayload[key] = payload[key];
          }
        }
      });

      // Update user profile in User collection if relevant fields changed
      if (cleanPayload.email || cleanPayload.phone || cleanPayload.firstName || cleanPayload.lastName) {
        const userUpdate = {};
        if (cleanPayload.email) userUpdate.email = cleanPayload.email.toLowerCase();
        if (cleanPayload.phone) userUpdate.phone = cleanPayload.phone;
        if (cleanPayload.firstName) userUpdate.firstName = cleanPayload.firstName;
        if (cleanPayload.lastName) userUpdate.lastName = cleanPayload.lastName;

        await User.findByIdAndUpdate(id, userUpdate, { new: true });
      }

      // Update or create profile
      let profile = await Profile.findOne({
        $or: [
          { email: cleanPayload.email },
          { _id: id }
        ]
      });

      if (profile) {
        profile = await Profile.findOneAndUpdate(
            { _id: profile._id },
            cleanPayload,
            { new: true, runValidators: true }
        );
      } else {
        // Create new profile if it doesn't exist
        const user = await User.findById(id);
        profile = await Profile.create({
          ...cleanPayload,
          email: cleanPayload.email || user?.email,
        });
      }

      if (!profile) {
        return res.status(404).json({
          status: 'error',
          message: 'Profile not found',
        });
      }

      res.status(200).json({
        status: 'success',
        message: 'Profile updated successfully',
        data: profile,
      });
    } catch (err) {
      console.error('Profile update error:', err);
      return res.status(500).json({
        status: 'error',
        message: err?.toString() || 'Internal server error',
      });
    }
  };

  const uploadProfileImage = async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      if (!req.file) {
        return res.status(400).json({
          status: 'error',
          message: 'No image file provided',
        });
      }

      // Validate file type
      if (!req.file.mimetype.startsWith('image/')) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid file type. Only images are allowed.',
        });
      }

      // Get user to check for existing profile image
      const user = await User.findById(userId);
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      // Get existing profile
      let profile = await Profile.findOne({ email: user.email });
      let oldImagePublicId = null;

      // Extract public_id from existing image URL if it exists
      if (profile?.imageUrl && profile.imageUrl.includes('cloudinary.com')) {
        try {
          const urlParts = profile.imageUrl.split('/');
          const uploadIndex = urlParts.findIndex(part => part === 'upload');
          if (uploadIndex !== -1 && urlParts[uploadIndex + 2]) {
            const publicIdWithFormat = urlParts.slice(uploadIndex + 2).join('/');
            oldImagePublicId = publicIdWithFormat.split('.')[0];
          }
        } catch (urlParseError) {
          console.warn('Could not parse existing image URL:', urlParseError);
        }
      }

      // Upload new image to Cloudinary
      const uploadResult = await new Promise((resolve, reject) => {
        cloudinary.uploader.upload_stream(
            {
              folder: 'hovapay/profile_images',
              public_id: `user_${userId}_${Date.now()}`,
              transformation: [
                { width: 400, height: 400, crop: 'fill', gravity: 'face' },
                { quality: 'auto', fetch_format: 'auto' }
              ],
              overwrite: true,
              invalidate: true,
              resource_type: 'image'
            },
            (error, result) => {
              if (error) {
                console.error('Cloudinary upload error:', error);
                reject(error);
              } else {
                resolve(result);
              }
            }
        ).end(req.file.buffer);
      });

      if (!uploadResult || !uploadResult.secure_url) {
        return res.status(500).json({
          status: 'error',
          message: 'Failed to upload image to cloud storage',
        });
      }

      // Update or create profile with new image URL
      if (!profile) {
        profile = await Profile.create({
          email: user.email,
          firstName: user.firstName || '',
          lastName: user.lastName || '',
          phone: user.phone || '',
          imageUrl: uploadResult.secure_url,
        });
      } else {
        profile = await Profile.findOneAndUpdate(
            { email: user.email },
            { imageUrl: uploadResult.secure_url },
            { new: true }
        );
      }

      // Delete old image from Cloudinary if it exists
      if (oldImagePublicId) {
        try {
          await cloudinary.uploader.destroy(oldImagePublicId);
          console.log('Old profile image deleted:', oldImagePublicId);
        } catch (deleteError) {
          console.warn('Failed to delete old image:', deleteError);
        }
      }

      res.status(200).json({
        status: 'success',
        message: 'Profile image uploaded successfully',
        data: {
          imageUrl: uploadResult.secure_url,
          public_id: uploadResult.public_id,
          width: uploadResult.width,
          height: uploadResult.height,
          profile,
        },
      });
    } catch (err) {
      console.error('Image upload error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to upload image. Please try again.',
        error: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  };

  // ==================== TRANSACTION PIN METHODS ====================

  const setTransactionPin = async (req, res) => {
    try {
      const userId = req.user?.id;
      const { pin } = req.body;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      if (!pin || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({
          status: 'error',
          message: 'PIN must be exactly 4 digits',
        });
      }

      // Check if user already has a PIN
      const user = await User.findById(userId).select('+pin');
      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      if (user.pin) {
        return res.status(400).json({
          status: 'error',
          message: 'Transaction PIN already exists. Use change PIN instead.',
        });
      }

      // Hash the PIN
      const hashedPin = await bcrypt.hash(pin, 10);

      // Update user with new PIN
      await User.findByIdAndUpdate(
          userId,
          {
            pin: hashedPin,
            pinCreatedAt: new Date()
          },
          { new: true }
      );

      res.status(200).json({
        status: 'success',
        message: 'Transaction PIN set successfully',
      });
    } catch (err) {
      console.error('Set PIN error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to set transaction PIN',
      });
    }
  };

  const changeTransactionPin = async (req, res) => {
    try {
      const userId = req.user?.id;
      const { currentPin, newPin } = req.body;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      if (!currentPin || !newPin) {
        return res.status(400).json({
          status: 'error',
          message: 'Current PIN and new PIN are required',
        });
      }

      if (!/^\d{4}$/.test(newPin)) {
        return res.status(400).json({
          status: 'error',
          message: 'New PIN must be exactly 4 digits',
        });
      }

      if (currentPin === newPin) {
        return res.status(400).json({
          status: 'error',
          message: 'New PIN must be different from current PIN',
        });
      }

      // Get user and verify current PIN
      const user = await User.findById(userId).select('+pin');

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      if (!user.pin) {
        return res.status(400).json({
          status: 'error',
          message: 'No transaction PIN found. Please set a PIN first.',
        });
      }

      const isPinValid = await bcrypt.compare(currentPin, user.pin);
      if (!isPinValid) {
        return res.status(401).json({
          status: 'error',
          message: 'Current PIN is incorrect',
        });
      }

      // Hash new PIN
      const hashedNewPin = await bcrypt.hash(newPin, 10);

      // Update user with new PIN
      await User.findByIdAndUpdate(
          userId,
          {
            pin: hashedNewPin,
            pinUpdatedAt: new Date()
          },
          { new: true }
      );

      res.status(200).json({
        status: 'success',
        message: 'Transaction PIN changed successfully',
      });
    } catch (err) {
      console.error('Change PIN error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to change transaction PIN',
      });
    }
  };

  const verifyTransactionPin = async (req, res) => {
    try {
      const userId = req.user?.id;
      const { pin } = req.body;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      if (!pin || !/^\d{4}$/.test(pin)) {
        return res.status(400).json({
          status: 'error',
          message: 'PIN must be exactly 4 digits',
        });
      }

      // Get user and verify PIN
      const user = await User.findById(userId).select('+pin');

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      if (!user.pin) {
        return res.status(400).json({
          status: 'error',
          message: 'No transaction PIN found',
        });
      }

      const isPinValid = await bcrypt.compare(pin, user.pin);

      if (!isPinValid) {
        return res.status(401).json({
          status: 'error',
          message: 'Invalid transaction PIN',
        });
      }

      res.status(200).json({
        status: 'success',
        message: 'Transaction PIN verified successfully',
      });
    } catch (err) {
      console.error('Verify PIN error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to verify transaction PIN',
      });
    }
  };

  // ==================== ENHANCED BIOMETRIC METHODS ====================

  const toggleBiometricSetting = async (req, res) => {
    try {
      const userId = req.user?.id;
      const {
        setting,
        enabled,
        biometricType,
        fallbackBiometricTypes,
        biometricHardwareLevel
      } = req.body;

      console.log('Toggle biometric setting request:', {
        userId,
        setting,
        enabled,
        biometricType,
        fallbackBiometricTypes,
        biometricHardwareLevel
      });

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      if (!['biometricSignIn', 'biometricTransactions'].includes(setting)) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid biometric setting',
        });
      }

      // For biometric transactions, ensure user has a transaction PIN
      if (setting === 'biometricTransactions' && enabled) {
        const user = await User.findById(userId).select('+pin');
        if (!user.pin) {
          return res.status(400).json({
            status: 'error',
            message: 'Transaction PIN is required before enabling biometric transactions',
          });
        }
      }

      // Prepare comprehensive update data
      const updateData = {
        [setting]: enabled,
        biometricLastUsed: enabled ? new Date() : null,
      };

      // Update biometric information when enabling
      if (enabled) {
        if (biometricType && biometricType !== 'none') {
          updateData.biometricType = biometricType;
        }

        if (fallbackBiometricTypes && Array.isArray(fallbackBiometricTypes)) {
          updateData.fallbackBiometricTypes = fallbackBiometricTypes;
        }

        if (biometricHardwareLevel && biometricHardwareLevel !== 'none') {
          updateData.biometricHardwareLevel = biometricHardwareLevel;
        }

        // Reset failure count when successfully enabling
        updateData.biometricFailureCount = 0;

        console.log('Enabling biometric with data:', updateData);
      } else {
        // When disabling, optionally clear biometric data or keep for re-enabling
        console.log('Disabling biometric setting:', setting);
      }

      // Update user with new biometric settings
      const user = await User.findByIdAndUpdate(
          userId,
          updateData,
          { new: true }
      ).select('-password -loginToken -pin');

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      console.log('Biometric setting updated successfully');

      res.status(200).json({
        status: 'success',
        message: `${setting} ${enabled ? 'enabled' : 'disabled'} successfully`,
        data: {
          biometricSignIn: user.biometricSignIn,
          biometricTransactions: user.biometricTransactions,
          biometricType: user.biometricType,
          fallbackBiometricTypes: user.fallbackBiometricTypes,
          biometricHardwareLevel: user.biometricHardwareLevel,
          biometricSecurityScore: calculateBiometricSecurityScore(user)
        },
      });
    } catch (err) {
      console.error('Toggle biometric error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update biometric setting',
        details: process.env.NODE_ENV === 'development' ? err.message : undefined
      });
    }
  };

  const recordBiometricAttempt = async (req, res) => {
    try {
      const userId = req.user?.id;
      const { success, biometricType, failureReason } = req.body;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      const updateData = {
        biometricLastUsed: new Date(),
      };

      if (success) {
        // Reset failure count on successful authentication
        updateData.biometricFailureCount = 0;
        updateData.biometricType = biometricType || updateData.biometricType;
      } else {
        // Increment failure count on failed authentication
        const user = await User.findById(userId).select('biometricFailureCount');
        updateData.biometricFailureCount = (user.biometricFailureCount || 0) + 1;

        // Disable biometric if too many failures (security measure)
        if (updateData.biometricFailureCount >= 5) {
          updateData.biometricSignIn = false;
          updateData.biometricTransactions = false;

          console.log(`Disabling biometric due to ${updateData.biometricFailureCount} failures for user ${userId}`);
        }
      }

      await User.findByIdAndUpdate(userId, updateData, { new: true });

      res.status(200).json({
        status: 'success',
        message: success ? 'Biometric attempt recorded successfully' : 'Biometric failure recorded',
        data: {
          failureCount: updateData.biometricFailureCount,
          disabled: updateData.biometricFailureCount >= 5
        }
      });

    } catch (err) {
      console.error('Record biometric attempt error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to record biometric attempt',
      });
    }
  };

  const getBiometricStatus = async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      const user = await User.findById(userId).select(
          'biometricSignIn biometricTransactions biometricType fallbackBiometricTypes biometricHardwareLevel biometricLastUsed biometricFailureCount'
      );

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      const biometricStatus = {
        isEnabled: user.biometricSignIn || user.biometricTransactions,
        signInEnabled: user.biometricSignIn || false,
        transactionsEnabled: user.biometricTransactions || false,
        primaryType: user.biometricType || 'none',
        fallbackTypes: user.fallbackBiometricTypes || [],
        hardwareLevel: user.biometricHardwareLevel || 'none',
        lastUsed: user.biometricLastUsed,
        failureCount: user.biometricFailureCount || 0,
        securityScore: calculateBiometricSecurityScore(user),
        isLocked: (user.biometricFailureCount || 0) >= 5
      };

      res.status(200).json({
        status: 'success',
        message: 'Biometric status retrieved successfully',
        data: biometricStatus,
      });

    } catch (err) {
      console.error('Get biometric status error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get biometric status',
      });
    }
  };

  const resetBiometricSettings = async (req, res) => {
    try {
      const userId = req.user?.id;
      const { pin, adminReset } = req.body;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      const user = await User.findById(userId).select('+pin');

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      // Verify PIN for security (unless admin reset)
      if (!adminReset) {
        if (!pin || !user.pin) {
          return res.status(400).json({
            status: 'error',
            message: 'Transaction PIN is required to reset biometric settings',
          });
        }

        const isPinValid = await bcrypt.compare(pin, user.pin);
        if (!isPinValid) {
          return res.status(401).json({
            status: 'error',
            message: 'Invalid transaction PIN',
          });
        }
      }

      // Reset all biometric settings
      const resetData = {
        biometricSignIn: false,
        biometricTransactions: false,
        biometricType: 'none',
        fallbackBiometricTypes: [],
        biometricHardwareLevel: 'none',
        biometricFailureCount: 0,
        biometricLastUsed: null
      };

      await User.findByIdAndUpdate(userId, resetData, { new: true });

      console.log(`Biometric settings reset for user ${userId}`);

      res.status(200).json({
        status: 'success',
        message: 'Biometric settings reset successfully',
        data: resetData
      });

    } catch (err) {
      console.error('Reset biometric settings error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to reset biometric settings',
      });
    }
  };

  const getSecurityOverview = async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      const user = await User.findById(userId).select('+pin');

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      const recommendations = [];
      let securityScore = 0;

      // Check PIN
      const pinSet = !!user.pin;
      if (pinSet) {
        securityScore += 25;
      } else {
        recommendations.push('Set up a transaction PIN for secure payments');
      }

      // Check biometrics
      const biometricEnabled = user.biometricSignIn || user.biometricTransactions;
      if (biometricEnabled) {
        securityScore += 30;
        if (user.biometricHardwareLevel === 'strong') {
          securityScore += 15;
        }
      } else {
        recommendations.push('Enable biometric authentication for enhanced security');
      }

      // Check 2FA
      const twoFactorEnabled = user.is2faEnabled;
      if (twoFactorEnabled) {
        securityScore += 20;
      } else {
        recommendations.push('Enable two-factor authentication');
      }

      // Check email verification
      if (user.verified) {
        securityScore += 10;
      } else {
        recommendations.push('Verify your email address');
      }

      // Additional security checks
      if (user.biometricFailureCount > 0) {
        recommendations.push('Review failed biometric authentication attempts');
      }

      if (!user.phoneVerified) {
        recommendations.push('Verify your phone number for account recovery');
      }

      const overview = {
        pinSet,
        biometricEnabled,
        twoFactorEnabled,
        securityScore: Math.min(100, securityScore),
        recommendations,
        biometricCapabilities: {
          primaryType: user.biometricType || 'none',
          fallbackTypes: user.fallbackBiometricTypes || [],
          hardwareLevel: user.biometricHardwareLevel || 'none',
          failureCount: user.biometricFailureCount || 0,
          securityScore: calculateBiometricSecurityScore(user)
        },
        lastSecurityUpdate: user.passwordChangedAt || user.createdAt,
        accountAge: Math.floor((Date.now() - new Date(user.createdAt).getTime()) / (1000 * 60 * 60 * 24))
      };

      res.status(200).json({
        status: 'success',
        message: 'Security overview retrieved successfully',
        data: overview,
      });

    } catch (err) {
      console.error('Get security overview error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get security overview',
      });
    }
  };

  // ==================== ADDITIONAL BIOMETRIC METHODS ====================

  const getBiometricHistory = async (req, res) => {
    try {
      const userId = req.user?.id;
      const { limit = 20 } = req.query;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      const user = await User.findById(userId).select('biometricHistory');

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      const history = user.biometricHistory || [];
      const limitedHistory = history
          .sort((a, b) => new Date(b.timestamp) - new Date(a.timestamp))
          .slice(0, parseInt(limit));

      res.status(200).json({
        status: 'success',
        message: 'Biometric history retrieved successfully',
        data: limitedHistory,
      });

    } catch (err) {
      console.error('Get biometric history error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get biometric history',
      });
    }
  };

  const enrollBiometricDevice = async (req, res) => {
    try {
      const userId = req.user?.id;
      const { deviceId, deviceName, biometricTypes, hardwareLevel } = req.body;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      if (!deviceId || !biometricTypes || !Array.isArray(biometricTypes)) {
        return res.status(400).json({
          status: 'error',
          message: 'Device ID and biometric types are required',
        });
      }

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      // Initialize enrolledDevices array if it doesn't exist
      if (!user.enrolledDevices) {
        user.enrolledDevices = [];
      }

      // Check if device already exists
      const existingDeviceIndex = user.enrolledDevices.findIndex(d => d.deviceId === deviceId);

      if (existingDeviceIndex !== -1) {
        // Update existing device
        user.enrolledDevices[existingDeviceIndex] = {
          ...user.enrolledDevices[existingDeviceIndex],
          deviceName: deviceName || user.enrolledDevices[existingDeviceIndex].deviceName,
          biometricTypes,
          lastUsed: new Date(),
          isActive: true,
          hardwareLevel: hardwareLevel || 'none'
        };
      } else {
        // Add new device
        user.enrolledDevices.push({
          deviceId,
          deviceName: deviceName || 'Unknown Device',
          biometricTypes,
          enrolledAt: new Date(),
          lastUsed: new Date(),
          isActive: true,
          hardwareLevel: hardwareLevel || 'none'
        });
      }

      await user.save();

      res.status(200).json({
        status: 'success',
        message: 'Device enrolled successfully',
        data: {
          deviceId,
          deviceName,
          biometricTypes,
          hardwareLevel
        }
      });

    } catch (err) {
      console.error('Enroll biometric device error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to enroll device',
      });
    }
  };

  const removeBiometricDevice = async (req, res) => {
    try {
      const userId = req.user?.id;
      const { deviceId } = req.body;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      if (!deviceId) {
        return res.status(400).json({
          status: 'error',
          message: 'Device ID is required',
        });
      }

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      if (!user.enrolledDevices) {
        return res.status(404).json({
          status: 'error',
          message: 'No enrolled devices found',
        });
      }

      // Remove device from enrolled devices
      const initialLength = user.enrolledDevices.length;
      user.enrolledDevices = user.enrolledDevices.filter(d => d.deviceId !== deviceId);

      if (user.enrolledDevices.length === initialLength) {
        return res.status(404).json({
          status: 'error',
          message: 'Device not found in enrolled devices',
        });
      }

      await user.save();

      res.status(200).json({
        status: 'success',
        message: 'Device removed successfully',
        data: { deviceId }
      });

    } catch (err) {
      console.error('Remove biometric device error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to remove device',
      });
    }
  };

  const getBiometricDevices = async (req, res) => {
    try {
      const userId = req.user?.id;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      const user = await User.findById(userId).select('enrolledDevices');

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      const devices = user.enrolledDevices || [];

      // Sort devices by last used (most recent first)
      const sortedDevices = devices.sort((a, b) => {
        if (!a.lastUsed) return 1;
        if (!b.lastUsed) return -1;
        return new Date(b.lastUsed) - new Date(a.lastUsed);
      });

      res.status(200).json({
        status: 'success',
        message: 'Enrolled devices retrieved successfully',
        data: sortedDevices,
      });

    } catch (err) {
      console.error('Get biometric devices error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to get enrolled devices',
      });
    }
  };

  const updateSecurityPreferences = async (req, res) => {
    try {
      const userId = req.user?.id;
      const {
        biometricNotifications,
        securityAlerts,
        loginNotifications,
        emailNotifications,
        smsNotifications,
        transactionNotifications,
        marketingEmails
      } = req.body;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      const updateData = {};

      // Update privacy settings
      if (typeof biometricNotifications === 'boolean') {
        updateData['privacySettings.biometricNotifications'] = biometricNotifications;
      }

      if (typeof securityAlerts === 'boolean') {
        updateData['privacySettings.securityAlerts'] = securityAlerts;
      }

      if (typeof loginNotifications === 'boolean') {
        updateData['privacySettings.loginNotifications'] = loginNotifications;
      }

      if (typeof emailNotifications === 'boolean') {
        updateData['privacySettings.emailNotifications'] = emailNotifications;
      }

      if (typeof smsNotifications === 'boolean') {
        updateData['privacySettings.smsNotifications'] = smsNotifications;
      }

      if (typeof transactionNotifications === 'boolean') {
        updateData['privacySettings.transactionNotifications'] = transactionNotifications;
      }

      if (typeof marketingEmails === 'boolean') {
        updateData['privacySettings.marketingEmails'] = marketingEmails;
      }

      if (Object.keys(updateData).length === 0) {
        return res.status(400).json({
          status: 'error',
          message: 'No valid preferences provided',
        });
      }

      const user = await User.findByIdAndUpdate(
          userId,
          updateData,
          { new: true }
      ).select('privacySettings');

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      res.status(200).json({
        status: 'success',
        message: 'Security preferences updated successfully',
        data: user.privacySettings,
      });

    } catch (err) {
      console.error('Update security preferences error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to update security preferences',
      });
    }
  };

  const testBiometricAuth = async (req, res) => {
    try {
      const userId = req.user?.id;
      const { biometricType } = req.body;

      if (!userId) {
        return res.status(401).json({
          status: 'error',
          message: 'Unauthorized',
        });
      }

      const user = await User.findById(userId);

      if (!user) {
        return res.status(404).json({
          status: 'error',
          message: 'User not found',
        });
      }

      // Record the test attempt in biometric history
      if (!user.biometricHistory) {
        user.biometricHistory = [];
      }

      user.biometricHistory.push({
        timestamp: new Date(),
        type: 'settings',
        method: biometricType || 'unknown',
        success: true, // Assume test is successful if we reach this point
        deviceId: req.headers['device-id'] || 'unknown',
        failureReason: null,
        ipAddress: req.ip
      });

      // Keep only last 50 entries
      if (user.biometricHistory.length > 50) {
        user.biometricHistory = user.biometricHistory.slice(-50);
      }

      // Update last used timestamp
      user.biometricLastUsed = new Date();

      await user.save();

      res.status(200).json({
        status: 'success',
        message: 'Biometric test completed successfully',
        data: {
          biometricType,
          timestamp: new Date(),
        }
      });

    } catch (err) {
      console.error('Test biometric auth error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to test biometric authentication',
      });
    }
  };

  // ==================== LEGACY PROFILE METHODS ====================

  const newProfile = async (req, res) => {
    try {
      const {
        firstName,
        lastName,
        otherNames,
        country,
        email,
        countryCode,
        gender,
        dateOfBirth,
        phone,
        altPhone,
        city,
        address,
        zip,
        imageUrl,
        otherImages,
        type,
        maritalStatus,
        marriageAnniversary,
        nextOfKin,
        nextOfKinContact,
      } = req.body;

      // Enhanced validation
      if (!firstName || firstName.trim() === '') {
        return res.status(400).json({
          status: 'error',
          message: 'First name is required.'
        });
      }

      if (!email || !email.includes('@')) {
        return res.status(400).json({
          status: 'error',
          message: 'Valid email is required.'
        });
      }

      // Check if profile already exists for this email
      const existingProfile = await Profile.findOne({ email: email.toLowerCase().trim() });
      if (existingProfile) {
        return res.status(409).json({
          status: 'error',
          message: 'Profile already exists for this email.'
        });
      }

      const payload = {
        firstName: firstName.trim(),
        lastName: lastName?.trim() || '',
        otherNames: otherNames?.trim() || '',
        country: country?.trim() || '',
        countryCode: countryCode?.trim() || '',
        gender: gender?.trim() || '',
        dateOfBirth: dateOfBirth?.trim() || '',
        phone: phone?.trim() || '',
        altPhone: altPhone?.trim() || '',
        city: city?.trim() || '',
        address: address?.trim() || '',
        zip: zip?.trim() || '',
        imageUrl: imageUrl?.trim() || '',
        otherImages: otherImages || [],
        type: type?.trim() || '',
        maritalStatus: maritalStatus?.trim() || '',
        marriageAnniversary: marriageAnniversary?.trim() || '',
        email: email.toLowerCase().trim(),
        nextOfKin: nextOfKin?.trim() || '',
        nextOfKinContact: nextOfKinContact?.trim() || '',
      };

      const profile = await Profile.create(payload);

      return res.status(201).json({
        status: 'success',
        msg: 'Profile created successfully.',
        data: profile,
      });
    } catch (err) {
      console.error('Create profile error:', err);
      return res.status(500).json({
        status: 'error',
        message: err?.toString() || 'Internal server error',
        statusCode: 500,
      });
    }
  };

  const allProfiles = async (req, res) => {
    try {
      const page = parseInt(req.params?.page) || 1;
      const perPage = parseInt(req.params?.perPage) || 10;
      const q = req.query?.q;

      // Validate pagination parameters
      if (page < 1 || perPage < 1 || perPage > 100) {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid pagination parameters'
        });
      }

      const options = {
        page,
        limit: perPage,
        sort: { createdAt: -1 },
        select: '-__v',
      };

      let query = {};

      if (q && q.length > 0) {
        const searchRegex = { $regex: q.trim(), $options: 'i' };
        query = {
          $or: [
            { firstName: searchRegex },
            { lastName: searchRegex },
            { email: searchRegex },
            { phone: searchRegex },
            { city: searchRegex },
          ]
        };
      }

      const profiles = await Profile.paginate(query, options);

      return res.status(200).json({
        status: 'success',
        data: profiles,
      });
    } catch (e) {
      console.error('Get all profiles error:', e);
      return res.status(500).json({
        status: 'error',
        message: e.toString(),
      });
    }
  };

  const selectProfile = async (req, res) => {
    try {
      const { id } = req.params;

      if (!id) {
        return res.status(400).json({
          status: 'error',
          message: 'Profile ID is required'
        });
      }

      const profile = await Profile.findById(id).select('-__v');

      if (!profile) {
        return res.status(404).json({
          status: 'error',
          data: 'No profile with that id',
        });
      }

      res.status(200).send({
        status: 'success',
        data: profile,
      });
    } catch (err) {
      console.error('Get profile error:', err);

      if (err.name === 'CastError') {
        return res.status(400).json({
          status: 'error',
          message: 'Invalid profile ID format',
        });
      }

      res.status(500).send({
        status: 'error',
        message: 'An error occurred while retrieving the profile.',
      });
    }
  };

  const deleteProfile = async (req, res) => {
    try {
      const { id } = req.params;
      const userId = req.user?.id;

      // Check if user is authorized to delete this profile
      if (id !== userId && req.user?.type !== 'admin') {
        return res.status(403).json({
          status: 'error',
          message: 'Unauthorized to delete this profile',
        });
      }

      // Get user profile to delete image from Cloudinary
      const user = await User.findById(id);
      if (user) {
        const profile = await Profile.findOne({ email: user.email });

        // Delete profile image from Cloudinary if it exists
        if (profile?.imageUrl && profile.imageUrl.includes('cloudinary.com')) {
          try {
            const urlParts = profile.imageUrl.split('/');
            const uploadIndex = urlParts.findIndex(part => part === 'upload');
            if (uploadIndex !== -1 && urlParts[uploadIndex + 2]) {
              const publicIdWithFormat = urlParts.slice(uploadIndex + 2).join('/');
              const publicId = publicIdWithFormat.split('.')[0];

              await cloudinary.uploader.destroy(publicId);
            }
          } catch (deleteError) {
            console.warn('Failed to delete profile image:', deleteError);
          }
        }

        // Delete the profile document
        await Profile.findOneAndDelete({ email: user.email });
      }

      // Soft delete - mark as deleted instead of actually deleting
      await User.findByIdAndUpdate(
          id,
          {
            isDeleted: true,
            loginToken: null,
            deletedAt: new Date()
          },
          { new: true }
      );

      res.status(200).json({
        status: 'success',
        message: 'Profile deleted successfully',
      });
    } catch (err) {
      console.error('Delete profile error:', err);
      res.status(500).json({
        status: 'error',
        message: 'Failed to delete profile',
      });
    }
  };

  return {
    // Core profile methods
    newProfile,
    selectProfile,
    editProfile,
    allProfiles,
    getUserProfile,
    uploadProfileImage,
    deleteProfile,

    // Transaction PIN methods
    setTransactionPin,
    changeTransactionPin,
    verifyTransactionPin,

    // Enhanced biometric methods
    toggleBiometricSetting,
    recordBiometricAttempt,
    getBiometricStatus,
    resetBiometricSettings,
    getBiometricHistory,
    testBiometricAuth,

    // Device management methods
    enrollBiometricDevice,
    removeBiometricDevice,
    getBiometricDevices,

    // Security methods
    getSecurityOverview,
    updateSecurityPreferences,
  };

}

export default ProfileController;