import jwt from 'jsonwebtoken';
const { verify } = jwt;
import moment from 'moment';
// import env from "../../env";
import User from '../src/models/User.js';
import http  from './axios.js';

import fs from 'fs';
import fsExtra from 'fs-extra';

import dotenv from 'dotenv';
dotenv.config();

const capitalize = (string) => string.charAt(0).toUpperCase() + string.slice(1).toLowerCase();

const checkIfUserIsLoggedIn = async (http) => {
    const bearerHeader = http.req.headers['authorization'];
    if (bearerHeader) {
        const bearer = bearerHeader.split(' ');
        const bearerToken = bearer[1];

        try {
            const decoded = verify(bearerToken);
            if (decoded) {
                const findUserByID = await User.findById(decoded.id);

                if (findUserByID) {
                    return findUserByID.id().toString();
                }

                return false;
            }

            return false;
        } catch (e) {
            return false;
        }
    }
};

const isNumeric = str => /^[+-]?\d+(\.\d+)?$/.test(str);

/**
 * Enhanced phone number formatting function
 * Handles both local and international formats for Nigerian numbers
 * @param {string} input - The input string (could be phone, email, or username)
 * @returns {string} - Formatted input
 */
const formatPhoneNumber = (input) => {
    if (!input || typeof input !== 'string') {
        return input;
    }

    // Remove all spaces and trim
    const cleaned = input.trim().replace(/\s+/g, '');

    // If it doesn't look like a phone number, return as is
    if (!/^[\d+\-().]+$/.test(cleaned)) {
        return input;
    }

    // Remove common phone number separators
    const digitsOnly = cleaned.replace(/[\-().]/g, '');

    // Handle different phone number formats
    if (digitsOnly.startsWith('+234')) {
        // International format: +234XXXXXXXXXX
        if (digitsOnly.length === 14) {
            return digitsOnly; // Already in correct format
        }
    } else if (digitsOnly.startsWith('234')) {
        // Without + but with country code: 234XXXXXXXXXX
        if (digitsOnly.length === 13) {
            return '+' + digitsOnly;
        }
    } else if (digitsOnly.startsWith('0')) {
        // Local format: 0XXXXXXXXXX
        if (digitsOnly.length === 11) {
            return '+234' + digitsOnly.substring(1);
        }
    } else if (digitsOnly.length === 10) {
        // Without leading 0: XXXXXXXXXX
        return '+234' + digitsOnly;
    }

    // If none of the above patterns match, return original input
    return input;
};

/**
 * Get all possible phone number variations for database query
 * @param {string} phoneInput - The phone input from user
 * @returns {Array<string>} - Array of possible phone number formats
 */
const getPhoneVariations = (phoneInput) => {
    if (!phoneInput || typeof phoneInput !== 'string') {
        return [phoneInput];
    }

    const cleaned = phoneInput.trim().replace(/[\s\-().]/g, '');
    const variations = new Set([phoneInput]); // Include original input

    // If it doesn't look like a phone number, return original
    if (!/^[\d+]+$/.test(cleaned)) {
        return [phoneInput];
    }

    const digitsOnly = cleaned.replace(/\+/g, '');

    if (digitsOnly.startsWith('234') && digitsOnly.length === 13) {
        // Input: 234XXXXXXXXXX
        const withoutCountryCode = '0' + digitsOnly.substring(3);
        const withPlus = '+' + digitsOnly;

        variations.add(withoutCountryCode); // 0XXXXXXXXXX
        variations.add(withPlus); // +234XXXXXXXXXX
        variations.add(digitsOnly); // 234XXXXXXXXXX
    } else if (digitsOnly.startsWith('0') && digitsOnly.length === 11) {
        // Input: 0XXXXXXXXXX
        const withoutZero = digitsOnly.substring(1);
        const withCountryCode = '234' + withoutZero;
        const withPlusCountryCode = '+234' + withoutZero;

        variations.add(withoutZero); // XXXXXXXXXX
        variations.add(withCountryCode); // 234XXXXXXXXXX
        variations.add(withPlusCountryCode); // +234XXXXXXXXXX
    } else if (digitsOnly.length === 10) {
        // Input: XXXXXXXXXX
        const withZero = '0' + digitsOnly;
        const withCountryCode = '234' + digitsOnly;
        const withPlusCountryCode = '+234' + digitsOnly;

        variations.add(withZero); // 0XXXXXXXXXX
        variations.add(withCountryCode); // 234XXXXXXXXXX
        variations.add(withPlusCountryCode); // +234XXXXXXXXXX
    }

    return Array.from(variations);
};

/**
 * Check if input looks like a phone number
 * @param {string} input - The input to check
 * @returns {boolean} - True if it looks like a phone number
 */
const isPhoneNumber = (input) => {
    if (!input || typeof input !== 'string') {
        return false;
    }

    const cleaned = input.trim().replace(/[\s\-().]/g, '');
    const digitsOnly = cleaned.replace(/\+/g, '');

    // Check for Nigerian phone number patterns
    return (
        // +234XXXXXXXXXX (14 chars with +)
        (cleaned.startsWith('+234') && cleaned.length === 14) ||
        // 234XXXXXXXXXX (13 chars)
        (digitsOnly.startsWith('234') && digitsOnly.length === 13) ||
        // 0XXXXXXXXXX (11 chars)
        (digitsOnly.startsWith('0') && digitsOnly.length === 11) ||
        // XXXXXXXXXX (10 chars)
        (digitsOnly.length === 10 && !digitsOnly.startsWith('0'))
    );
};

/**
 * Normalize phone number to standard international format
 * @param {string} phone - Phone number to normalize
 * @returns {string} - Normalized phone number in +234XXXXXXXXXX format
 */
const normalizePhoneNumber = (phone) => {
    if (!phone || typeof phone !== 'string') {
        return phone;
    }

    const cleaned = phone.trim().replace(/[\s\-().]/g, '');
    const digitsOnly = cleaned.replace(/\+/g, '');

    if (digitsOnly.startsWith('234') && digitsOnly.length === 13) {
        return '+' + digitsOnly;
    } else if (digitsOnly.startsWith('0') && digitsOnly.length === 11) {
        return '+234' + digitsOnly.substring(1);
    } else if (digitsOnly.length === 10) {
        return '+234' + digitsOnly;
    }

    return phone; // Return original if no pattern matches
};

export {
    capitalize,
    checkIfUserIsLoggedIn,
    formatPhoneNumber,
    isPhoneNumber,
    getPhoneVariations,
    normalizePhoneNumber,
};
