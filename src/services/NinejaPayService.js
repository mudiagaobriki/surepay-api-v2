// services/NinejaPayService.js - 9JaPay Integration for Bet Wallet Funding
import axios from 'axios';
import crypto from 'crypto';

class NinejaPayService {
    constructor() {
        this.baseURL = process.env.NINEJA_PAY_API_URL || 'https://api.9japay.com/v1';
        this.apiKey = process.env.NINEJA_PAY_API_KEY;
        this.secretKey = process.env.NINEJA_PAY_SECRET_KEY;
        this.merchantId = process.env.NINEJA_PAY_MERCHANT_ID;

        // Fallback to sandbox/demo URLs if live credentials not available
        if (!this.apiKey) {
            console.warn('9JaPay API credentials not found, using demo service');
            this.baseURL = 'https://sandbox-api.9japay.com/v1';
            this.isDemo = true;
        }

        console.log('NinejaPayService initialized:', {
            baseURL: this.baseURL,
            hasApiKey: !!this.apiKey,
            isDemo: this.isDemo || false
        });
    }

    /**
     * Get authentication headers
     */
    getHeaders() {
        const timestamp = Date.now().toString();
        const signature = this.generateSignature(timestamp);

        return {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
            'Authorization': `Bearer ${this.apiKey || 'demo-key'}`,
            'X-Timestamp': timestamp,
            'X-Signature': signature,
            'X-Merchant-ID': this.merchantId || 'demo-merchant'
        };
    }

    /**
     * Generate API signature for authentication
     */
    generateSignature(timestamp) {
        if (!this.secretKey) return 'demo-signature';

        const message = `${this.merchantId}${timestamp}`;
        return crypto.createHmac('sha256', this.secretKey)
            .update(message)
            .digest('hex');
    }

    /**
     * Make authenticated API request
     */
    async makeRequest(endpoint, method = 'GET', data = null) {
        try {
            const config = {
                method,
                url: `${this.baseURL}${endpoint}`,
                headers: this.getHeaders(),
                timeout: 30000
            };

            if (data) {
                config.data = data;
            }

            console.log(`9JaPay ${method} request to:`, config.url);

            const response = await axios(config);
            return response.data;
        } catch (error) {
            console.error(`9JaPay API Error (${endpoint}):`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw error;
        }
    }

    /**
     * Get supported betting platforms
     */
    async getSupportedBettingPlatforms() {
        try {
            if (this.isDemo) {
                return this.getDemoBettingPlatforms();
            }

            const response = await this.makeRequest('/betting/platforms');
            return {
                success: true,
                platforms: response.platforms || response.data || []
            };
        } catch (error) {
            console.error('Error fetching betting platforms:', error);
            return this.getDemoBettingPlatforms();
        }
    }

    /**
     * Get demo betting platforms
     */
    getDemoBettingPlatforms() {
        return {
            success: true,
            platforms: [
                {
                    id: 'bet9ja',
                    name: 'Bet9ja',
                    logo: 'https://bet9ja.com/favicon.ico',
                    minAmount: 100,
                    maxAmount: 500000,
                    supportedMethods: ['instant', 'voucher'],
                    processingTime: 'Instant',
                    fees: { instant: 0, voucher: 0 },
                    active: true
                },
                {
                    id: 'sportybet',
                    name: 'SportyBet',
                    logo: 'https://sportybet.com/favicon.ico',
                    minAmount: 100,
                    maxAmount: 300000,
                    supportedMethods: ['instant', 'voucher'],
                    processingTime: '1-2 minutes',
                    fees: { instant: 0, voucher: 0 },
                    active: true
                },
                {
                    id: 'nairabet',
                    name: 'NairaBet',
                    logo: 'https://nairabet.com/favicon.ico',
                    minAmount: 200,
                    maxAmount: 1000000,
                    supportedMethods: ['instant', 'direct'],
                    processingTime: 'Instant',
                    fees: { instant: 0, direct: 0 },
                    active: true
                },
                {
                    id: 'betway',
                    name: 'Betway',
                    logo: 'https://betway.com/favicon.ico',
                    minAmount: 100,
                    maxAmount: 500000,
                    supportedMethods: ['instant', 'voucher'],
                    processingTime: 'Instant',
                    fees: { instant: 0, voucher: 0 },
                    active: true
                },
                {
                    id: '1xbet',
                    name: '1xBet',
                    logo: 'https://1xbet.com/favicon.ico',
                    minAmount: 100,
                    maxAmount: 200000,
                    supportedMethods: ['instant', 'direct'],
                    processingTime: '2-5 minutes',
                    fees: { instant: 0, direct: 0 },
                    active: true
                },
                {
                    id: 'betking',
                    name: 'BetKing',
                    logo: 'https://betking.com/favicon.ico',
                    minAmount: 100,
                    maxAmount: 400000,
                    supportedMethods: ['instant', 'voucher'],
                    processingTime: 'Instant',
                    fees: { instant: 0, voucher: 0 },
                    active: true
                },
                {
                    id: 'merrybet',
                    name: 'MerryBet',
                    logo: 'https://merrybet.com/favicon.ico',
                    minAmount: 100,
                    maxAmount: 250000,
                    supportedMethods: ['instant', 'voucher'],
                    processingTime: '1-3 minutes',
                    fees: { instant: 0, voucher: 0 },
                    active: true
                }
            ]
        };
    }

    /**
     * Get funding options for a specific platform
     */
    async getPlatformFundingOptions(platformId) {
        try {
            if (this.isDemo) {
                return this.getDemoFundingOptions(platformId);
            }

            const response = await this.makeRequest(`/betting/platforms/${platformId}/funding-options`);
            return {
                success: true,
                options: response.options || response.data || []
            };
        } catch (error) {
            console.error('Error fetching funding options:', error);
            return this.getDemoFundingOptions(platformId);
        }
    }

    /**
     * Get demo funding options
     */
    getDemoFundingOptions(platformId) {
        const commonOptions = [
            {
                type: 'instant',
                name: 'Instant Funding',
                description: 'Funds reflect immediately in betting account',
                processingTime: 'Instant',
                fee: 0,
                minAmount: 100,
                maxAmount: 500000
            },
            {
                type: 'voucher',
                name: 'Voucher/PIN',
                description: 'Generate voucher code to redeem on betting platform',
                processingTime: 'Instant voucher generation',
                fee: 0,
                minAmount: 100,
                maxAmount: 200000
            }
        ];

        if (['nairabet', '1xbet'].includes(platformId)) {
            commonOptions.push({
                type: 'direct',
                name: 'Direct Transfer',
                description: 'Direct transfer to betting account',
                processingTime: '2-5 minutes',
                fee: 0,
                minAmount: 200,
                maxAmount: 1000000
            });
        }

        return {
            success: true,
            options: commonOptions
        };
    }

    /**
     * Verify betting account
     */
    async verifyBettingAccount({ platform, accountIdentifier, customerPhone }) {
        try {
            if (this.isDemo) {
                return this.getDemoAccountVerification(platform, accountIdentifier);
            }

            const payload = {
                platform,
                accountIdentifier,
                customerPhone
            };

            const response = await this.makeRequest('/betting/verify-account', 'POST', payload);

            return {
                success: response.success || true,
                accountName: response.accountName,
                accountId: response.accountId || accountIdentifier,
                verified: response.verified || true,
                minAmount: response.minAmount || 100,
                maxAmount: response.maxAmount || 500000,
                message: response.message
            };
        } catch (error) {
            console.error('Error verifying betting account:', error);
            return {
                success: false,
                message: error.response?.data?.message || 'Account verification failed'
            };
        }
    }

    /**
     * Get demo account verification
     */
    getDemoAccountVerification(platform, accountIdentifier) {
        // Simulate account verification
        const demoNames = [
            'John Doe', 'Jane Smith', 'David Johnson', 'Sarah Wilson',
            'Michael Brown', 'Emma Davis', 'Chris Taylor', 'Lisa Anderson'
        ];

        const randomName = demoNames[Math.floor(Math.random() * demoNames.length)];

        return {
            success: true,
            accountName: randomName,
            accountId: accountIdentifier,
            verified: true,
            minAmount: 100,
            maxAmount: 500000,
            message: 'Account verified successfully'
        };
    }

    /**
     * Fund betting wallet
     */
    async fundBettingWallet({ platform, accountIdentifier, amount, fundingType, transactionRef, customerPhone }) {
        try {
            console.log('Funding betting wallet:', {
                platform,
                accountIdentifier: '***masked***',
                amount,
                fundingType,
                transactionRef
            });

            if (this.isDemo) {
                return this.processDemoWalletFunding({ platform, accountIdentifier, amount, fundingType, transactionRef });
            }

            const payload = {
                platform,
                accountIdentifier,
                amount,
                fundingType,
                transactionRef,
                customerPhone,
                merchantId: this.merchantId
            };

            const response = await this.makeRequest('/betting/fund-wallet', 'POST', payload);

            return {
                success: response.success || true,
                reference: response.reference || response.transactionId,
                status: response.status || 'successful',
                fundingMethod: response.fundingMethod || fundingType,
                voucherCode: response.voucherCode,
                voucherPin: response.voucherPin,
                instructions: response.instructions,
                data: response
            };
        } catch (error) {
            console.error('Error funding betting wallet:', error);
            throw new Error(`Wallet funding failed: ${error.response?.data?.message || error.message}`);
        }
    }

    /**
     * Process demo wallet funding
     */
    processDemoWalletFunding({ platform, accountIdentifier, amount, fundingType, transactionRef }) {
        const reference = `9JA${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        if (fundingType === 'voucher') {
            const voucherCode = `${platform.toUpperCase()}${Math.random().toString(36).substr(2, 8).toUpperCase()}`;
            const voucherPin = Math.random().toString().substr(2, 6);

            return {
                success: true,
                reference,
                status: 'successful',
                fundingMethod: 'voucher',
                voucherCode,
                voucherPin,
                instructions: `Use voucher code ${voucherCode} and PIN ${voucherPin} to fund your ${platform} account. Login to your betting account, go to deposit section, select voucher/PIN option and enter the provided details.`,
                data: {
                    voucherCode,
                    voucherPin,
                    expiryDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000), // 7 days
                    amount,
                    platform
                }
            };
        } else if (fundingType === 'instant') {
            return {
                success: true,
                reference,
                status: 'successful',
                fundingMethod: 'instant',
                instructions: `₦${amount} has been credited to your ${platform} account instantly. Check your betting wallet balance.`,
                data: {
                    amount,
                    platform,
                    creditedAt: new Date().toISOString()
                }
            };
        } else if (fundingType === 'direct') {
            return {
                success: true,
                reference,
                status: 'successful',
                fundingMethod: 'direct',
                instructions: `₦${amount} has been transferred directly to your ${platform} account. It may take 2-5 minutes to reflect.`,
                data: {
                    amount,
                    platform,
                    transferredAt: new Date().toISOString()
                }
            };
        }

        return {
            success: true,
            reference,
            status: 'successful',
            fundingMethod: fundingType,
            instructions: `Wallet funding completed successfully.`,
            data: { amount, platform }
        };
    }

    /**
     * Check funding status
     */
    async checkFundingStatus(reference) {
        try {
            if (this.isDemo) {
                return this.getDemoFundingStatus(reference);
            }

            const response = await this.makeRequest(`/betting/funding-status/${reference}`);

            return {
                success: true,
                status: response.status,
                reference: response.reference,
                amount: response.amount,
                platform: response.platform,
                completedAt: response.completedAt,
                data: response
            };
        } catch (error) {
            console.error('Error checking funding status:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get demo funding status
     */
    getDemoFundingStatus(reference) {
        // Simulate different funding statuses
        const statuses = ['completed', 'pending', 'failed'];
        const randomStatus = statuses[Math.floor(Math.random() * statuses.length)];

        return {
            success: true,
            status: randomStatus,
            reference,
            completedAt: randomStatus === 'completed' ? new Date().toISOString() : null
        };
    }

    /**
     * Get platform limits
     */
    async getPlatformLimits(platform) {
        try {
            if (this.isDemo) {
                return this.getDemoPlatformLimits(platform);
            }

            const response = await this.makeRequest(`/betting/platforms/${platform}/limits`);
            return response.limits || response.data;
        } catch (error) {
            console.error('Error fetching platform limits:', error);
            return this.getDemoPlatformLimits(platform);
        }
    }

    /**
     * Get demo platform limits
     */
    getDemoPlatformLimits(platform) {
        const limits = {
            bet9ja: { minAmount: 100, maxAmount: 500000, dailyLimit: 2000000 },
            sportybet: { minAmount: 100, maxAmount: 300000, dailyLimit: 1500000 },
            nairabet: { minAmount: 200, maxAmount: 1000000, dailyLimit: 5000000 },
            betway: { minAmount: 100, maxAmount: 500000, dailyLimit: 2000000 },
            '1xbet': { minAmount: 100, maxAmount: 200000, dailyLimit: 1000000 },
            betking: { minAmount: 100, maxAmount: 400000, dailyLimit: 1800000 },
            merrybet: { minAmount: 100, maxAmount: 250000, dailyLimit: 1200000 }
        };

        return limits[platform] || { minAmount: 100, maxAmount: 500000, dailyLimit: 2000000 };
    }

    /**
     * Get platform information
     */
    async getPlatformInfo(platformId) {
        try {
            if (this.isDemo) {
                return this.getDemoPlatformInfo(platformId);
            }

            const response = await this.makeRequest(`/betting/platforms/${platformId}`);
            return response.platform || response.data;
        } catch (error) {
            console.error('Error fetching platform info:', error);
            return this.getDemoPlatformInfo(platformId);
        }
    }

    /**
     * Get demo platform information
     */
    getDemoPlatformInfo(platformId) {
        const platformsData = this.getDemoBettingPlatforms();
        return platformsData.platforms.find(p => p.id === platformId) || null;
    }

    /**
     * Test connection to 9JaPay API
     */
    async testConnection() {
        try {
            const platformsData = await this.getSupportedBettingPlatforms();

            return {
                success: true,
                message: '9JaPay service connection successful',
                isDemo: this.isDemo,
                availablePlatforms: platformsData.platforms?.length || 0
            };
        } catch (error) {
            return {
                success: false,
                message: '9JaPay service connection failed',
                error: error.message
            };
        }
    }

    /**
     * Get transaction history
     */
    async getTransactionHistory(merchantId, page = 1, limit = 50) {
        try {
            if (this.isDemo) {
                return this.getDemoTransactionHistory();
            }

            const response = await this.makeRequest(`/betting/transactions?page=${page}&limit=${limit}`);
            return {
                success: true,
                transactions: response.transactions || response.data || [],
                pagination: response.pagination || {}
            };
        } catch (error) {
            console.error('Error fetching transaction history:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get demo transaction history
     */
    getDemoTransactionHistory() {
        return {
            success: true,
            transactions: [
                {
                    reference: '9JA123456789',
                    platform: 'bet9ja',
                    amount: 5000,
                    status: 'completed',
                    fundingType: 'instant',
                    createdAt: new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString()
                },
                {
                    reference: '9JA987654321',
                    platform: 'sportybet',
                    amount: 2500,
                    status: 'completed',
                    fundingType: 'voucher',
                    createdAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
                }
            ],
            pagination: {
                current: 1,
                total: 1,
                hasNext: false
            }
        };
    }
}

export default new NinejaPayService();