// validation/auth.js - Enhanced with biometric validation schemas
import Joi from 'joi';

const passwordSchema = Joi.string()
    .min(8)
    .pattern(/^(?=.*[A-Z])(?=.*[a-z])(?=.*\d)(?=.*[!@#$%^&*()_+\-=\[\]{};':"\\|,.<>\/?]).{8,}$/)
    .required();

// Enhanced identifier schema that accepts email, username, or phone
const identifierSchema = Joi.string()
    .trim()
    .required()
    .custom((value, helpers) => {
      // Check if it's an email
      const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
      // Check if it's a phone number (various formats)
      const phoneRegex = /^(\+?[1-9]\d{0,3})?[0-9]{7,14}$/;
      // Check if it's a username (alphanumeric with some special characters)
      const usernameRegex = /^[a-zA-Z0-9_.-]{3,30}$/;

      if (emailRegex.test(value) || phoneRegex.test(value) || usernameRegex.test(value)) {
        return value;
      }

      return helpers.message('Identifier must be a valid email, phone number, or username');
    });

export const registerSchema = Joi.object({
  email: Joi.string().email().required(),
  username: Joi.string()
      .alphanum()
      .min(3)
      .max(30)
      .pattern(/^[a-zA-Z0-9_.-]+$/)
      .required(),
  password: passwordSchema,
  phone: Joi.string()
      .pattern(/^\+?[1-9]\d{1,14}$/)
      .required(),
  firstName: Joi.string().trim().min(1).max(50),
  lastName: Joi.string().trim().min(1).max(50),
  type: Joi.string().valid("user", "admin").required()
}).unknown(false);

// Enhanced login schema that accepts identifier instead of just email
export const loginSchema = Joi.object({
  email: identifierSchema, // Backend still expects 'email' field but we're using it as identifier
  password: passwordSchema
}).unknown(false);

// Biometric login validation schema
export const biometricLoginSchema = Joi.object({
  identifier: identifierSchema,
  biometricType: Joi.string()
      .valid('Face ID', 'Fingerprint', 'Iris', 'Voice')
      .required(),
  deviceId: Joi.string()
      .trim()
      .min(1)
      .required(),
  biometricData: Joi.string().optional(), // Optional biometric signature/hash
  deviceName: Joi.string().trim().max(100).optional(),
  hardwareLevel: Joi.string()
      .valid('none', 'weak', 'strong')
      .optional()
}).unknown(false);

// Biometric setup validation schema
export const biometricSetupSchema = Joi.object({
  biometricType: Joi.string()
      .valid('Face ID', 'Fingerprint', 'Iris', 'Voice')
      .required(),
  deviceId: Joi.string()
      .trim()
      .min(1)
      .required(),
  deviceName: Joi.string()
      .trim()
      .max(100)
      .optional(),
  biometricData: Joi.string().optional(),
  fallbackBiometricTypes: Joi.array()
      .items(Joi.string().valid('Face ID', 'Fingerprint', 'Iris', 'Voice'))
      .optional(),
  hardwareLevel: Joi.string()
      .valid('none', 'weak', 'strong')
      .optional()
}).unknown(false);

// Biometric eligibility check schema
export const biometricEligibilitySchema = Joi.object({
  identifier: identifierSchema
}).unknown(false);

// Biometric validation schema
export const biometricValidationSchema = Joi.object({
  identifier: identifierSchema,
  biometricType: Joi.string()
      .valid('Face ID', 'Fingerprint', 'Iris', 'Voice')
      .required(),
  deviceId: Joi.string()
      .trim()
      .min(1)
      .required()
}).unknown(false);

export const usernameExistsSchema = Joi.object({
  username: Joi.string().required(),
}).unknown(false);

// Enhanced OTP schema that accepts any identifier
export const otpRequestSchema = Joi.object({
  username: identifierSchema, // Can be email, phone, or username
}).unknown(false);

export const otpVerificationSchema = Joi.object({
  username: identifierSchema,
  otp: Joi.string()
      .length(6)
      .pattern(/^\d{6}$/)
      .required()
}).unknown(false);

// Password reset schema
export const passwordResetSchema = Joi.object({
  resetToken: Joi.string().required(),
  password: passwordSchema
}).unknown(false);

// Account verification schema
export const accountVerificationSchema = Joi.object({
  identifier: identifierSchema,
  verificationType: Joi.string()
      .valid('email', 'phone', 'both')
      .default('email')
}).unknown(false);