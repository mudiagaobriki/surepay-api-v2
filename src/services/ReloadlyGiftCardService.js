// src/services/ReloadlyGiftCardService.js - WORKING VERSION (since curl works)
import axios from 'axios';
import NodeCache from 'node-cache';

class ReloadlyGiftCardService {
    constructor() {
        // Fixed URLs
        this.authURL = 'https://auth.reloadly.com';
        this.sandboxURL = 'https://giftcards-sandbox.reloadly.com';
        this.productionURL = 'https://giftcards.reloadly.com';

        // Environment
        this.clientId = process.env.RELOADLY_CLIENT_ID;
        this.clientSecret = process.env.RELOADLY_CLIENT_SECRET;
        this.isSandbox = process.env.RELOADLY_SANDBOX === 'true';
        this.debug = process.env.RELOADLY_DEBUG === 'true';

        // Cache
        this.cache = new NodeCache({ stdTTL: 3600, checkperiod: 600 });

        // Config
        this.config = {
            timeout: 15000, // Increased timeout
            maxRetries: 2,
            serviceCharge: parseFloat(process.env.GIFT_CARD_SERVICE_CHARGE) || 2.5,
            usdToNgnRate: parseFloat(process.env.USD_TO_NGN_RATE) || 760
        };

        this.endpoints = {
            countries: '/countries',
            products: '/products',
            orders: '/orders',
            transactions: '/orders/transactions'
        };

        // Validate on startup
        if (!this.clientId || !this.clientSecret) {
            throw new Error('Missing RELOADLY_CLIENT_ID or RELOADLY_CLIENT_SECRET environment variables');
        }

        if (this.debug) {
            console.log('ReloadlyGiftCardService initialized:', {
                authURL: this.authURL,
                apiURL: this.getApiURL(),
                isSandbox: this.isSandbox,
                hasCredentials: !!(this.clientId && this.clientSecret)
            });
        }
    }

    getApiURL() {
        return this.isSandbox ? this.sandboxURL : this.productionURL;
    }

    /**
     * Get specific product details by ID
     */
    async getProductById(productId) {
        try {
            console.log('Fetching product details for ID:', productId);

            const cacheKey = `gift_card_product_${productId}`;
            const cached = this.cache.get(cacheKey);

            if (cached) {
                return { success: true, data: cached };
            }

            const result = await this.makeRequest(`${this.endpoints.products}/${productId}`);

            if (!result.success) {
                return result;
            }

            const product = {
                productId: result.data.productId,
                productName: result.data.productName,
                brand: {
                    brandName: result.data.brand?.brandName || 'Unknown',
                    brandId: result.data.brand?.brandId
                },
                description: result.data.description || result.data.productName,
                category: {
                    name: result.data.category?.name || 'Gift Card'
                },
                country: {
                    isoName: result.data.country?.isoName,
                    name: result.data.country?.name,
                    currencyCode: result.data.country?.currencyCode
                },
                denominationType: result.data.denominationType,
                fixedRecipientDenominations: result.data.fixedRecipientDenominations || [],
                minRecipientDenomination: result.data.minRecipientDenomination,
                maxRecipientDenomination: result.data.maxRecipientDenomination,
                logoUrls: result.data.logoUrls || [],
                redeemInstruction: {
                    concise: result.data.redeemInstruction?.concise || '',
                    verbose: result.data.redeemInstruction?.verbose || ''
                },
                termsAndConditions: result.data.termsAndConditions || '',
                supportsPreOrder: result.data.supportsPreOrder !== false,
                recipientCurrencyCode: result.data.recipientCurrencyCode || 'USD'
            };

            // Cache for 1 hour
            this.cache.set(cacheKey, product, 3600);

            console.log(`Fetched product details for ID: ${productId}`);
            return { success: true, data: product };

        } catch (error) {
            console.error('Error in getProductById:', error);
            return {
                success: false,
                error: { message: error.message }
            };
        }
    }

    /**
     * Calculate Naira amount from USD (for backward compatibility)
     */
    async calculateNairaAmount(usdAmount) {
        try {
            if (usdAmount <= 0) {
                throw new Error('Invalid USD amount');
            }

            const exchangeRate = this.config.usdToNgnRate;
            const nairaAmount = Math.ceil(usdAmount * exchangeRate);

            return {
                success: true,
                data: {
                    usdAmount: parseFloat(usdAmount.toFixed(2)),
                    nairaAmount: nairaAmount,
                    exchangeRate: exchangeRate,
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error('Error calculating naira amount:', error);
            return {
                success: false,
                error: { message: error.message }
            };
        }
    }

    /**
     * Purchase gift card - Updated to match controller expectations
     */
    async purchaseGiftCard(orderData) {
        try {
            const {
                productId,
                quantity = 1,
                unitPrice,
                customIdentifier = `order_${Date.now()}`,
                recipientEmail,
                senderName = '',
                recipientPhoneDetails = null
            } = orderData;

            console.log('Processing gift card purchase:', {
                productId,
                quantity,
                unitPrice,
                recipientEmail
            });

            // Validate required fields
            if (!productId || !unitPrice || !recipientEmail) {
                throw new Error('Missing required fields: productId, unitPrice, and recipientEmail are required');
            }

            const payload = {
                productId: parseInt(productId),
                countryCode: 'NG', // Default sender country
                quantity: parseInt(quantity),
                unitPrice: parseFloat(unitPrice),
                customIdentifier,
                recipientEmail: recipientEmail.trim()
            };

            if (senderName) payload.senderName = senderName.trim();
            if (recipientPhoneDetails) payload.recipientPhoneDetails = recipientPhoneDetails;

            const result = await this.makeRequest(this.endpoints.orders, 'POST', payload);

            if (result.success) {
                console.log('Gift card purchase successful:', result.data);

                return {
                    success: true,
                    data: {
                        transactionId: result.data.transactionId,
                        status: result.data.status,
                        amount: result.data.amount,
                        currencyCode: result.data.currencyCode,
                        recipientEmail: result.data.recipientEmail,
                        customIdentifier: result.data.customIdentifier,
                        // Note: Reloadly doesn't return card details in purchase response
                        // Cards will be available later via transaction status endpoint
                        cards: [], // Empty for now, will be populated later
                        createdTime: result.data.transactionCreatedTime || new Date().toISOString(),
                        // Store the full response for later reference
                        fullResponse: result.data
                    }
                };
            }

            return result;

        } catch (error) {
            console.error('Gift card purchase error:', error);
            return {
                success: false,
                message: 'Failed to purchase gift card',
                error: error.message
            };
        }
    }

    /**
     * Get transaction details
     */
    async getTransaction(transactionId) {
        try {
            console.log('Fetching transaction details for:', transactionId);

            const result = await this.makeRequest(`${this.endpoints.transactions}/${transactionId}`);

            if (result.success) {
                return {
                    success: true,
                    data: {
                        transactionId: result.data.transactionId,
                        status: result.data.status,
                        amount: result.data.amount,
                        currencyCode: result.data.currencyCode,
                        recipientEmail: result.data.recipientEmail,
                        cards: result.data.cards || [],
                        createdTime: result.data.createdTime,
                        customIdentifier: result.data.customIdentifier
                    }
                };
            }

            return result;

        } catch (error) {
            console.error('Error getting transaction details:', error);
            return {
                success: false,
                error: { message: error.message }
            };
        }
    }

    async getGiftCardDetails(transactionId) {
        try {
            console.log('Fetching gift card details for transaction:', transactionId);

            // Try the transaction endpoint first
            const result = await this.makeRequest(`${this.endpoints.transactions}/${transactionId}`);

            if (result.success && result.data) {
                const transaction = result.data;

                // Extract card details if available
                let cards = [];

                // Check if cards are in the response
                if (transaction.cards && Array.isArray(transaction.cards)) {
                    cards = transaction.cards;
                }
                // Some APIs might have different structure
                else if (transaction.giftCards && Array.isArray(transaction.giftCards)) {
                    cards = transaction.giftCards;
                }
                // Check if it's embedded in product details
                else if (transaction.product && transaction.product.cards) {
                    cards = transaction.product.cards;
                }

                return {
                    success: true,
                    data: {
                        transactionId: transaction.transactionId,
                        status: transaction.status,
                        cards: cards,
                        recipientEmail: transaction.recipientEmail,
                        amount: transaction.amount,
                        createdTime: transaction.transactionCreatedTime || transaction.createdTime
                    }
                };
            }

            return result;

        } catch (error) {
            console.error('Error getting gift card details:', error);
            return {
                success: false,
                error: { message: error.message }
            };
        }
    }

    /**
     * Validate order data
     */
    validateOrder(orderData) {
        const errors = [];

        if (!orderData.productId) errors.push('Product ID is required');
        if (!orderData.countryCode) errors.push('Country code is required');
        if (!orderData.unitPrice || orderData.unitPrice <= 0) errors.push('Valid unit price is required');
        if (!orderData.recipientEmail) errors.push('Recipient email is required');

        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (orderData.recipientEmail && !emailRegex.test(orderData.recipientEmail)) {
            errors.push('Invalid email format');
        }

        if (orderData.quantity && (orderData.quantity < 1 || orderData.quantity > 10)) {
            errors.push('Quantity must be between 1 and 10');
        }

        if (orderData.unitPrice && orderData.unitPrice > 500) {
            errors.push('Unit price cannot exceed $500');
        }

        return { isValid: errors.length === 0, errors };
    }

    /**
     * Get access token - FIXED VERSION
     */
    async getAccessToken() {
        const cacheKey = 'reloadly_access_token';
        let token = this.cache.get(cacheKey);

        if (token) {
            if (this.debug) console.log('Using cached token');
            return token;
        }

        try {
            if (this.debug) {
                console.log('Requesting new access token...');
                console.log('Auth URL:', `${this.authURL}/oauth/token`);
                console.log('Audience:', this.getApiURL());
            }

            // Exact same format that worked in your curl
            const payload = {
                client_id: this.clientId,
                client_secret: this.clientSecret,
                grant_type: 'client_credentials',
                audience: this.getApiURL()
            };

            const startTime = Date.now();

            const response = await axios.post(`${this.authURL}/oauth/token`, payload, {
                headers: {
                    'Content-Type': 'application/json',
                    'Accept': 'application/json'
                },
                timeout: this.config.timeout
            });

            const duration = Date.now() - startTime;

            if (this.debug) {
                console.log(`✅ Token request completed in ${duration}ms`);
                console.log('Response status:', response.status);
            }

            if (!response.data.access_token) {
                throw new Error('No access token in response');
            }

            token = response.data.access_token;

            // Cache for 90% of expiry time
            const expiresIn = Math.floor((response.data.expires_in || 3600) * 0.9);
            this.cache.set(cacheKey, token, expiresIn);

            if (this.debug) {
                console.log('✅ Access token cached for', expiresIn, 'seconds');
            }

            return token;

        } catch (error) {
            console.error('❌ Token request failed:');
            console.error('Error type:', error.constructor.name);
            console.error('Error code:', error.code);
            console.error('Status:', error.response?.status);
            console.error('Response:', error.response?.data);

            // Clear any cached token on error
            this.cache.del(cacheKey);

            // Provide specific error messages
            if (error.code === 'ECONNABORTED') {
                throw new Error(`Authentication request timed out after ${this.config.timeout}ms. Check your internet connection.`);
            } else if (error.response?.status === 401) {
                throw new Error('Invalid credentials. Check your RELOADLY_CLIENT_ID and RELOADLY_CLIENT_SECRET.');
            } else if (error.response?.status === 403) {
                throw new Error('Access denied. Your account may not have Gift Cards API access enabled.');
            } else {
                throw new Error(`Authentication failed: ${error.response?.data?.message || error.message}`);
            }
        }
    }

    /**
     * Make authenticated API request - IMPROVED VERSION
     */
    async makeRequest(endpoint, method = 'GET', data = null, params = {}) {
        for (let attempt = 1; attempt <= this.config.maxRetries; attempt++) {
            try {
                if (this.debug) {
                    console.log(`Making ${method} request to ${endpoint} (attempt ${attempt})`);
                }

                const token = await this.getAccessToken();

                const config = {
                    method,
                    url: `${this.getApiURL()}${endpoint}`,
                    headers: {
                        'Authorization': `Bearer ${token}`,
                        'Accept': 'application/com.reloadly.giftcards-v1+json',
                        'Content-Type': 'application/json'
                    },
                    params,
                    timeout: this.config.timeout
                };

                if (data && ['POST', 'PUT', 'PATCH'].includes(method.toUpperCase())) {
                    config.data = data;
                    config.headers['Content-Type'] = 'application/json';
                }

                const startTime = Date.now();
                const response = await axios(config);
                const duration = Date.now() - startTime;

                if (this.debug) {
                    console.log(`✅ API request completed in ${duration}ms`);
                }

                return {
                    success: true,
                    data: response.data
                };

            } catch (error) {
                const isLastAttempt = attempt === this.config.maxRetries;

                if (this.debug) {
                    console.log(`❌ API request failed (attempt ${attempt}/${this.config.maxRetries})`);
                    console.log('Error:', error.response?.status, error.response?.statusText);
                }

                // If token expired, clear cache and retry
                if (error.response?.status === 401 && !isLastAttempt) {
                    console.log('Token expired, clearing cache and retrying...');
                    this.cache.del('reloadly_access_token');
                    continue;
                }

                // If this is the last attempt, return the error
                if (isLastAttempt) {
                    return {
                        success: false,
                        error: error.response?.data || { message: error.message },
                        status: error.response?.status || 500
                    };
                }
            }
        }
    }

    /**
     * Get countries - SIMPLIFIED VERSION
     */
    async getCountries() {
        try {
            console.log('Fetching countries...');

            const cacheKey = 'gift_card_countries';
            const cached = this.cache.get(cacheKey);

            if (cached) {
                console.log('Returning cached countries');
                return { success: true, data: cached };
            }

            const result = await this.makeRequest('/countries');

            if (!result.success) {
                console.error('Failed to fetch countries:', result.error);
                return result;
            }

            if (!Array.isArray(result.data)) {
                console.error('Invalid countries response format:', typeof result.data);
                return {
                    success: false,
                    error: { message: 'Invalid response format from countries API' }
                };
            }

            // Transform countries data
            const countries = result.data.map(country => ({
                code: country.isoName,
                name: country.name,
                flag: country.flagUrl || null,
                currency: country.currencyCode || 'USD',
                currencyName: country.currencyName || 'US Dollar'
            }));

            // Cache for 4 hours
            this.cache.set(cacheKey, countries, 14400);

            console.log(`✅ Fetched ${countries.length} countries`);
            return { success: true, data: countries };

        } catch (error) {
            console.error('Error in getCountries:', error);
            return {
                success: false,
                error: { message: error.message }
            };
        }
    }

    /**
     * Get products by country
     */
    async getProductsByCountry(countryCode, filters = {}) {
        try {
            const { page = 1, size = 50, productName = '' } = filters;

            console.log(`Fetching products for ${countryCode}`);

            const cacheKey = `products_${countryCode}_${page}_${size}_${productName}`;
            const cached = this.cache.get(cacheKey);

            if (cached) {
                return { success: true, data: cached };
            }

            const endpoint = `/countries/${countryCode.toUpperCase()}/products`;
            const params = {};

            if (productName) params.productName = productName;
            if (page > 1) params.page = page;
            if (size !== 50) params.size = size;

            const result = await this.makeRequest(endpoint, 'GET', null, params);

            if (!result.success) {
                return result;
            }

            if (!Array.isArray(result.data)) {
                return {
                    success: false,
                    error: { message: 'Invalid products response format' }
                };
            }

            const products = {
                products: result.data.map(product => ({
                    id: product.productId,
                    name: product.productName,
                    brand: product.brand?.brandName || 'Unknown',
                    brandId: product.brand?.brandId,
                    country: {
                        code: product.country?.isoName || countryCode,
                        name: product.country?.name || 'Unknown'
                    },
                    denomination: {
                        type: product.denominationType,
                        fixedRecipientDenominations: product.fixedRecipientDenominations || [],
                        minRecipientDenomination: product.minRecipientDenomination,
                        maxRecipientDenomination: product.maxRecipientDenomination
                    },
                    images: {
                        logo: product.logoUrls?.[0] || null,
                        banner: product.brand?.brandLogoUrls?.[0] || null
                    },
                    terms: product.redeemInstruction?.concise || '',
                    currency: product.recipientCurrencyCode || 'USD',
                    discountPercentage: product.discountPercentage || 0,
                    senderFee: product.senderFee || 0,
                    isActive: true
                })),
                pagination: {
                    currentPage: page,
                    totalElements: result.data.length,
                    size: result.data.length
                }
            };

            // Cache for 2 hours
            this.cache.set(cacheKey, products, 7200);

            console.log(`✅ Fetched ${products.products.length} products for ${countryCode}`);
            return { success: true, data: products };

        } catch (error) {
            console.error('Error in getProductsByCountry:', error);
            return {
                success: false,
                error: { message: error.message }
            };
        }
    }

    /**
     * Calculate pricing
     */
    /**
     * Calculate pricing - Updated to match controller expectations
     */
    async calculatePricing(totalAmountUSD) {
        try {
            if (totalAmountUSD <= 0) {
                throw new Error('Invalid amount');
            }

            const exchangeRate = this.config.usdToNgnRate;
            const nairaAmount = Math.ceil(totalAmountUSD * exchangeRate);

            return {
                success: true,
                data: {
                    usdAmount: parseFloat(totalAmountUSD.toFixed(2)),
                    nairaAmount: nairaAmount,
                    exchangeRate: exchangeRate,
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error('Error calculating pricing:', error);
            return {
                success: false,
                error: { message: error.message }
            };
        }
    }


    /**
     * Test connection - IMPROVED VERSION
     */
    async testConnection() {
        try {
            console.log('🔧 Testing Reloadly connection...');

            const startTime = Date.now();

            // Step 1: Test authentication
            console.log('Step 1: Testing authentication...');
            const token = await this.getAccessToken();

            if (!token) {
                return {
                    success: false,
                    message: 'Failed to get access token'
                };
            }

            console.log('✅ Authentication successful');

            // Step 2: Test API call
            console.log('Step 2: Testing API call...');
            const countriesResult = await this.getCountries();

            if (!countriesResult.success) {
                return {
                    success: false,
                    message: 'Authentication worked but API call failed',
                    error: countriesResult.error
                };
            }

            const totalDuration = Date.now() - startTime;
            const countriesCount = countriesResult.data.length;

            console.log(`✅ Connection test completed in ${totalDuration}ms`);

            return {
                success: true,
                message: 'Reloadly API connection working properly',
                data: {
                    authenticated: true,
                    countriesCount,
                    environment: this.isSandbox ? 'sandbox' : 'production',
                    authUrl: this.authURL,
                    apiUrl: this.getApiURL(),
                    duration: totalDuration,
                    timestamp: new Date().toISOString()
                }
            };

        } catch (error) {
            console.error('❌ Connection test failed:', error);
            return {
                success: false,
                message: 'Connection test failed',
                error: error.message
            };
        }
    }

    /**
     * Clear cache
     */
    clearCache() {
        this.cache.flushAll();
        return {
            success: true,
            message: 'Cache cleared successfully'
        };
    }

    /**
     * Get service info
     */
    getServiceInfo() {
        return {
            success: true,
            data: {
                service: 'ReloadlyGiftCardService',
                environment: this.isSandbox ? 'sandbox' : 'production',
                authUrl: this.authURL,
                apiUrl: this.getApiURL(),
                config: this.config,
                cacheStats: {
                    keys: this.cache.keys(),
                    stats: this.cache.getStats()
                }
            }
        };
    }
}

export default new ReloadlyGiftCardService();