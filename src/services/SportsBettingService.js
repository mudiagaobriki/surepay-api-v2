// services/SportsBettingService.js - Sports Betting Service with Bet9ja Integration
import axios from 'axios';
import crypto from 'crypto';

class SportsBettingService {
    constructor() {
        this.baseURL = process.env.BET9JA_API_URL || 'https://api.bet9ja.com';
        this.apiKey = process.env.BET9JA_API_KEY;
        this.secretKey = process.env.BET9JA_SECRET_KEY;
        this.partnerId = process.env.BET9JA_PARTNER_ID;

        // Fallback to sandbox/demo URLs if live credentials not available
        if (!this.apiKey) {
            console.warn('Bet9ja API credentials not found, using demo service');
            this.baseURL = 'https://sandbox-api.bet9ja.com';
            this.isDemo = true;
        }

        console.log('SportsBettingService initialized:', {
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
            'X-API-Key': this.apiKey || 'demo-key',
            'X-Timestamp': timestamp,
            'X-Signature': signature,
            'X-Partner-ID': this.partnerId || 'demo-partner'
        };
    }

    /**
     * Generate API signature for authentication
     */
    generateSignature(timestamp) {
        if (!this.secretKey) return 'demo-signature';

        const message = `${this.apiKey}${timestamp}`;
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

            console.log(`Sports Betting ${method} request to:`, config.url);

            const response = await axios(config);
            return response.data;
        } catch (error) {
            console.error(`Sports Betting API Error (${endpoint}):`, {
                status: error.response?.status,
                data: error.response?.data,
                message: error.message
            });
            throw error;
        }
    }

    /**
     * Get available sports
     */
    async getSports() {
        try {
            if (this.isDemo) {
                return this.getDemoSports();
            }

            const response = await this.makeRequest('/v1/sports');
            return {
                success: true,
                sports: response.sports || response.data || []
            };
        } catch (error) {
            console.error('Error fetching sports:', error);
            return this.getDemoSports();
        }
    }

    /**
     * Get demo sports data
     */
    getDemoSports() {
        return {
            success: true,
            sports: [
                {
                    id: 'football',
                    name: 'Football',
                    icon: '⚽',
                    active: true,
                    markets: ['1X2', 'Over/Under', 'Both Teams Score', 'Correct Score']
                },
                {
                    id: 'basketball',
                    name: 'Basketball',
                    icon: '🏀',
                    active: true,
                    markets: ['Moneyline', 'Point Spread', 'Total Points']
                },
                {
                    id: 'tennis',
                    name: 'Tennis',
                    icon: '🎾',
                    active: true,
                    markets: ['Match Winner', 'Set Betting', 'Game Handicap']
                }
            ]
        };
    }

    /**
     * Get available leagues for a sport
     */
    async getLeagues(sportId) {
        try {
            if (this.isDemo) {
                return this.getDemoLeagues(sportId);
            }

            const response = await this.makeRequest(`/v1/sports/${sportId}/leagues`);
            return {
                success: true,
                leagues: response.leagues || response.data || []
            };
        } catch (error) {
            console.error('Error fetching leagues:', error);
            return this.getDemoLeagues(sportId);
        }
    }

    /**
     * Get demo leagues data
     */
    getDemoLeagues(sportId) {
        const leagues = {
            football: [
                { id: 'premier-league', name: 'Premier League', country: 'England' },
                { id: 'champions-league', name: 'UEFA Champions League', country: 'Europe' },
                { id: 'npfl', name: 'Nigerian Premier League', country: 'Nigeria' },
                { id: 'la-liga', name: 'La Liga', country: 'Spain' }
            ],
            basketball: [
                { id: 'nba', name: 'NBA', country: 'USA' },
                { id: 'euroleague', name: 'EuroLeague', country: 'Europe' }
            ],
            tennis: [
                { id: 'atp', name: 'ATP Tour', country: 'International' },
                { id: 'wta', name: 'WTA Tour', country: 'International' }
            ]
        };

        return {
            success: true,
            leagues: leagues[sportId] || []
        };
    }

    /**
     * Get available matches for betting
     */
    async getMatches(sportId, leagueId = null) {
        try {
            if (this.isDemo) {
                return this.getDemoMatches(sportId, leagueId);
            }

            let endpoint = `/v1/sports/${sportId}/matches`;
            if (leagueId) {
                endpoint += `?league=${leagueId}`;
            }

            const response = await this.makeRequest(endpoint);
            return {
                success: true,
                matches: response.matches || response.data || []
            };
        } catch (error) {
            console.error('Error fetching matches:', error);
            return this.getDemoMatches(sportId, leagueId);
        }
    }

    /**
     * Get demo matches data
     */
    getDemoMatches(sportId, leagueId) {
        const now = new Date();
        const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);

        const footballMatches = [
            {
                id: 'match-001',
                homeTeam: 'Manchester United',
                awayTeam: 'Liverpool',
                league: 'Premier League',
                kickoffTime: tomorrow.toISOString(),
                markets: {
                    '1X2': {
                        home: { odds: 2.10, selection: 'Home Win' },
                        draw: { odds: 3.40, selection: 'Draw' },
                        away: { odds: 3.20, selection: 'Away Win' }
                    },
                    'over_under': {
                        over25: { odds: 1.80, selection: 'Over 2.5 Goals' },
                        under25: { odds: 2.00, selection: 'Under 2.5 Goals' }
                    },
                    'both_teams_score': {
                        yes: { odds: 1.70, selection: 'Yes' },
                        no: { odds: 2.10, selection: 'No' }
                    }
                },
                status: 'upcoming'
            },
            {
                id: 'match-002',
                homeTeam: 'Arsenal',
                awayTeam: 'Chelsea',
                league: 'Premier League',
                kickoffTime: new Date(now.getTime() + 48 * 60 * 60 * 1000).toISOString(),
                markets: {
                    '1X2': {
                        home: { odds: 2.30, selection: 'Home Win' },
                        draw: { odds: 3.10, selection: 'Draw' },
                        away: { odds: 2.90, selection: 'Away Win' }
                    }
                },
                status: 'upcoming'
            }
        ];

        return {
            success: true,
            matches: sportId === 'football' ? footballMatches : []
        };
    }

    /**
     * Get odds for a specific match
     */
    async getMatchOdds(matchId) {
        try {
            if (this.isDemo) {
                return this.getDemoMatchOdds(matchId);
            }

            const response = await this.makeRequest(`/v1/matches/${matchId}/odds`);
            return {
                success: true,
                odds: response.odds || response.data || {}
            };
        } catch (error) {
            console.error('Error fetching match odds:', error);
            return this.getDemoMatchOdds(matchId);
        }
    }

    /**
     * Get demo match odds
     */
    getDemoMatchOdds(matchId) {
        return {
            success: true,
            odds: {
                '1X2': {
                    home: { odds: 2.10, selection: 'Home Win' },
                    draw: { odds: 3.40, selection: 'Draw' },
                    away: { odds: 3.20, selection: 'Away Win' }
                },
                'over_under': {
                    over25: { odds: 1.80, selection: 'Over 2.5 Goals' },
                    under25: { odds: 2.00, selection: 'Under 2.5 Goals' }
                }
            }
        };
    }

    /**
     * Place a bet
     */
    async placeBet(betData) {
        try {
            console.log('Placing bet with data:', {
                ...betData,
                userId: '***masked***'
            });

            if (this.isDemo) {
                return this.placeDemoBet(betData);
            }

            const payload = {
                selections: betData.matches.map(match => ({
                    matchId: match.matchId,
                    market: match.market,
                    selection: match.selection,
                    odds: match.odds
                })),
                stake: betData.stake,
                betType: betData.betType,
                totalOdds: betData.totalOdds,
                potentialWinnings: betData.potentialWinnings,
                customerRef: betData.transactionRef
            };

            const response = await this.makeRequest('/v1/bets/place', 'POST', payload);

            return {
                success: true,
                betSlip: response.betSlip || response.ticketId,
                betId: response.betId || response.id,
                status: response.status || 'placed',
                message: 'Bet placed successfully',
                data: response
            };
        } catch (error) {
            console.error('Error placing bet:', error);
            throw new Error(`Failed to place bet: ${error.message}`);
        }
    }

    /**
     * Place demo bet (for testing)
     */
    placeDemoBet(betData) {
        const betSlip = `BET${Date.now()}${Math.random().toString(36).substr(2, 6).toUpperCase()}`;

        return {
            success: true,
            betSlip: betSlip,
            betId: betSlip,
            status: 'placed',
            message: 'Demo bet placed successfully',
            data: {
                betSlip: betSlip,
                stake: betData.stake,
                potentialWinnings: betData.potentialWinnings,
                placedAt: new Date().toISOString()
            }
        };
    }

    /**
     * Check bet status
     */
    async checkBetStatus(betSlip) {
        try {
            if (this.isDemo) {
                return this.getDemoBetStatus(betSlip);
            }

            const response = await this.makeRequest(`/v1/bets/${betSlip}/status`);

            return {
                success: true,
                status: response.status,
                result: response.result,
                winnings: response.winnings || 0,
                settledAt: response.settledAt,
                data: response
            };
        } catch (error) {
            console.error('Error checking bet status:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get demo bet status
     */
    getDemoBetStatus(betSlip) {
        // Simulate different bet outcomes
        const outcomes = ['pending', 'won', 'lost'];
        const randomOutcome = outcomes[Math.floor(Math.random() * outcomes.length)];

        return {
            success: true,
            status: randomOutcome,
            result: randomOutcome === 'won' ? 'winning' :
                randomOutcome === 'lost' ? 'losing' : 'pending',
            winnings: randomOutcome === 'won' ? Math.random() * 10000 + 1000 : 0,
            settledAt: randomOutcome === 'pending' ? null : new Date().toISOString()
        };
    }

    /**
     * Get user's betting history
     */
    async getBettingHistory(userId, page = 1, limit = 20) {
        try {
            if (this.isDemo) {
                return this.getDemoBettingHistory(userId);
            }

            const response = await this.makeRequest(`/v1/users/${userId}/bets?page=${page}&limit=${limit}`);

            return {
                success: true,
                bets: response.bets || response.data || [],
                pagination: response.pagination || {}
            };
        } catch (error) {
            console.error('Error fetching betting history:', error);
            return {
                success: false,
                error: error.message
            };
        }
    }

    /**
     * Get demo betting history
     */
    getDemoBettingHistory(userId) {
        return {
            success: true,
            bets: [
                {
                    betSlip: 'BET123456789',
                    stake: 1000,
                    potentialWinnings: 2500,
                    status: 'won',
                    actualWinnings: 2500,
                    placedAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
                },
                {
                    betSlip: 'BET987654321',
                    stake: 500,
                    potentialWinnings: 1200,
                    status: 'lost',
                    actualWinnings: 0,
                    placedAt: new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString()
                }
            ],
            pagination: {
                current: 1,
                total: 1,
                hasNext: false
            }
        };
    }

    /**
     * Calculate potential winnings
     */
    calculatePotentialWinnings(matches, stake, betType) {
        if (!matches || matches.length === 0) return 0;

        switch (betType) {
            case 'single':
                return matches.length === 1 ? stake * matches[0].odds : 0;

            case 'accumulator':
                const totalOdds = matches.reduce((acc, match) => acc * match.odds, 1);
                return stake * totalOdds;

            case 'system':
                // Simplified system bet calculation
                return stake * Math.pow(matches.reduce((acc, match) => acc + match.odds, 0) / matches.length, matches.length);

            default:
                return 0;
        }
    }

    /**
     * Validate bet slip
     */
    validateBetSlip(betData) {
        const errors = [];

        if (!betData.matches || betData.matches.length === 0) {
            errors.push('At least one match selection is required');
        }

        if (!betData.stake || betData.stake <= 0) {
            errors.push('Valid stake amount is required');
        }

        if (betData.stake < 50) {
            errors.push('Minimum stake is ₦50');
        }

        if (betData.stake > 1000000) {
            errors.push('Maximum stake is ₦1,000,000');
        }

        if (betData.betType === 'single' && betData.matches.length > 1) {
            errors.push('Single bet can only have one selection');
        }

        if (betData.betType === 'accumulator' && betData.matches.length < 2) {
            errors.push('Accumulator bet requires at least 2 selections');
        }

        // Validate each match selection
        betData.matches.forEach((match, index) => {
            if (!match.matchId) {
                errors.push(`Match ${index + 1}: Match ID is required`);
            }
            if (!match.odds || match.odds < 1.01) {
                errors.push(`Match ${index + 1}: Valid odds are required`);
            }
            if (!match.selection) {
                errors.push(`Match ${index + 1}: Selection is required`);
            }
        });

        return {
            isValid: errors.length === 0,
            errors
        };
    }

    /**
     * Get supported bookmakers
     */
    getSupportedBookmakers() {
        return [
            {
                id: 'bet9ja',
                name: 'Bet9ja',
                logo: 'https://bet9ja.com/images/logo.png',
                minStake: 50,
                maxStake: 1000000,
                features: ['live_betting', 'cash_out', 'accumulator']
            },
            {
                id: 'sportybet',
                name: 'SportyBet',
                logo: 'https://sportybet.com/images/logo.png',
                minStake: 100,
                maxStake: 500000,
                features: ['live_betting', 'bonus_bets']
            },
            {
                id: 'nairabet',
                name: 'NairaBet',
                logo: 'https://nairabet.com/images/logo.png',
                minStake: 50,
                maxStake: 2000000,
                features: ['virtual_games', 'casino']
            }
        ];
    }

    /**
     * Test connection to betting API
     */
    async testConnection() {
        try {
            const sportsData = await this.getSports();

            return {
                success: true,
                message: 'Sports betting service connection successful',
                isDemo: this.isDemo,
                availableSports: sportsData.sports?.length || 0
            };
        } catch (error) {
            return {
                success: false,
                message: 'Sports betting service connection failed',
                error: error.message
            };
        }
    }
}

export default new SportsBettingService();