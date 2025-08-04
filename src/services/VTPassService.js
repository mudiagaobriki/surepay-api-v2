// src/services/VTPassService.js - Updated with Third-Party Motor Insurance Support
import axios from 'axios';
import dotenv from 'dotenv';

dotenv.config();

class VTPassService {
  constructor() {
    this.baseURL = process.env.VTPASS_BASE_URL || 'https://sandbox.vtpass.com/api';
    this.apiKey = process.env.VTPASS_API_KEY;
    this.secretKey = process.env.VTPASS_SECRET_KEY;
    this.publicKey = process.env.VTPASS_PUBLIC_KEY;
    this.messagingBaseURL = process.env.VTPASS_MESSAGING_BASE_URL || 'https://messaging.vtpass.com';

    // Network images mapping with fallback URLs
    this.networkImages = {
      'mtn': 'https://sandbox.vtpass.com/resources/products/200X200/MTN-Data.jpg',
      'airtel': 'https://sandbox.vtpass.com/resources/products/200X200/Airtel-Data.jpg',
      'glo': 'https://sandbox.vtpass.com/resources/products/200X200/GLO-Data.jpg',
      'etisalat': 'https://sandbox.vtpass.com/resources/products/200X200/9mobile-Data.jpg',
      '9mobile': 'https://sandbox.vtpass.com/resources/products/200X200/9mobile-Data.jpg',
    };

    // Cache for API responses (24-hour TTL)
    this.cache = {
      categories: { data: null, timestamp: null },
      services: {}, // { category: { data: [], timestamp: number } }
      variations: {}, // { serviceId: { data: {}, timestamp: number } }
      insuranceOptions: {}, // Cache for insurance-specific options
      ttl: 24 * 60 * 60 * 1000, // 24 hours
    };

    // Validate credentials
    if (!this.apiKey || !this.secretKey) {
      console.error('VTPass credentials missing!');
      throw new Error('VTPass API credentials are required');
    }

    console.log('VTPass Service initialized with sandbox credentials');
    console.log('Base URL:', this.baseURL);
    console.log('API Key exists:', !!this.apiKey);
    console.log('Secret Key exists:', !!this.secretKey);
  }

  /**
   * Generate VTPass-compliant request_id
   */
  generateRequestId() {
    const lagosTime = new Date(new Date().getTime() + (1 * 60 * 60 * 1000));

    const year = lagosTime.getFullYear();
    const month = String(lagosTime.getMonth() + 1).padStart(2, '0');
    const day = String(lagosTime.getDate()).padStart(2, '0');
    const hour = String(lagosTime.getHours()).padStart(2, '0');
    const minute = String(lagosTime.getMinutes()).padStart(2, '0');

    const dateTimePart = `${year}${month}${day}${hour}${minute}`;
    const suffix = Math.random().toString(36).substring(2, 10);

    return dateTimePart + suffix;
  }

  /**
   * Validate VTPass request_id format
   */
  validateRequestId(requestId) {
    if (!requestId || typeof requestId !== 'string') {
      return {
        isValid: false,
        errors: ['Request ID must be a string']
      };
    }

    const errors = [];

    // Check minimum length
    if (requestId.length < 12) {
      errors.push(`Length ${requestId.length} too short (minimum 12 characters)`);
    }

    // Check first 12 characters are numeric
    const first12 = requestId.substring(0, 12);
    if (!/^\d{12}$/.test(first12)) {
      errors.push('First 12 characters must be numeric (YYYYMMDDHHII format)');
    }

    // Check remaining characters are alphanumeric
    const remaining = requestId.substring(12);
    if (remaining && !/^[A-Za-z0-9]+$/.test(remaining)) {
      errors.push('Characters after position 12 must be alphanumeric');
    }

    return {
      isValid: errors.length === 0,
      errors: errors,
      first12: first12,
      suffix: remaining,
      length: requestId.length
    };
  }

  /**
   * Get authentication headers for VTPass API
   */
  getHeaders() {
    return {
      'Content-Type': 'application/json',
      'api-key': this.apiKey,
      'secret-key': this.secretKey,
      'Accept': 'application/json',
    };
  }

  /**
   * Get authentication headers for VTPass Messaging API (SMS)
   */
  getMessagingHeaders() {
    return {
      'X-Token': this.publicKey,
      'X-Secret': this.secretKey,
      'Accept': 'application/json',
      'User-Agent': 'Hovapay-SMS-Client/1.0'
    };
  }

  /**
   * Make authenticated request to VTPass
   */
  async makeRequest(endpoint, method = 'GET', data = null) {
    try {
      const config = {
        method,
        url: `${this.baseURL}${endpoint}`,
        headers: this.getHeaders(),
        timeout: 30000, // 30 seconds timeout
      };

      if (data) {
        config.data = data;
      }

      console.log(`VTPass ${method} request to:`, config.url);
      console.log('Request headers:', {
        'Content-Type': config.headers['Content-Type'],
        'api-key': config.headers['api-key'] ? 'present' : 'missing',
        'secret-key': config.headers['secret-key'] ? 'present' : 'missing',
      });

      if (data) {
        console.log('Request payload:', JSON.stringify(data, null, 2));
      }

      const response = await axios(config);

      console.log(`VTPass response status: ${response.status}`);
      console.log('VTPass response:', JSON.stringify(response.data, null, 2));

      return response.data;
    } catch (error) {
      console.error(`VTPass API Error (${endpoint}):`, {
        status: error.response?.status,
        statusText: error.response?.statusText,
        data: error.response?.data,
        message: error.message,
        url: error.config?.url,
        method: error.config?.method
      });

      // Log more details for authentication errors
      if (error.response?.status === 401) {
        console.error('Authentication failed. Please check your VTPass credentials:');
        console.error('API Key:', this.apiKey ? 'Set' : 'Missing');
        console.error('Secret Key:', this.secretKey ? 'Set' : 'Missing');
        console.error('Base URL:', this.baseURL);
      }

      throw error;
    }
  }

  /**
   * Check if cached data is valid
   */
  isCacheValid(cacheEntry) {
    if (!cacheEntry.data || !cacheEntry.timestamp) return false;
    return (Date.now() - cacheEntry.timestamp) < this.cache.ttl;
  }

  /**
   * Get service categories from VTPass API
   */
  async getServiceCategories() {
    try {
      // Check cache first
      if (this.isCacheValid(this.cache.categories)) {
        console.log('Returning cached service categories');
        return this.cache.categories.data;
      }

      console.log('Fetching service categories from VTPass...');

      // Use the correct VTPass endpoint
      const response = await this.makeRequest('/service-categories');

      // Cache the response
      this.cache.categories = {
        data: response,
        timestamp: Date.now()
      };

      console.log(`Fetched ${response.content?.length || 0} service categories`);
      return response;

    } catch (error) {
      console.error('Error fetching service categories:', error);

      // Return fallback categories if API fails
      const fallbackCategories = {
        response_description: "000",
        content: [
          { identifier: "airtime", name: "Airtime Recharge" },
          { identifier: "data", name: "Data Services" },
          { identifier: "tv-subscription", name: "TV Subscription" },
          { identifier: "electricity-bill", name: "Electricity Bill" },
          { identifier: "education", name: "Education" },
          { identifier: "insurance", name: "Insurance" }, // Updated insurance category
          { identifier: "other-services", name: "Other Merchants/Services" }
        ]
      };

      console.log('Using fallback categories due to API error');
      return fallbackCategories;
    }
  }

  /**
   * Enhanced method to get services with proper image URLs
   */
  async getServices(category) {
    try {
      // Check cache first
      const cacheKey = category;
      if (this.cache.services[cacheKey] && this.isCacheValid(this.cache.services[cacheKey])) {
        console.log(`Returning cached services for ${category}`);
        return this.cache.services[cacheKey].data;
      }

      console.log(`Fetching services for category: ${category}`);

      let response;

      try {
        // Try to get services from VTPass API
        response = await this.makeRequest(`/services?identifier=${category}`);
      } catch (apiError) {
        console.log('VTPass services API failed, using predefined services');
        // Fallback to predefined services with proper images
        response = this.getPredefinedServices(category);
      }

      // Enhance response with proper image URLs
      if (response.content && Array.isArray(response.content)) {
        response.content = response.content.map(service => ({
          ...service,
          image: this.getServiceImageUrl(service.serviceID, service.image)
        }));
      }

      // Cache the response
      if (!this.cache.services[cacheKey]) {
        this.cache.services[cacheKey] = {};
      }
      this.cache.services[cacheKey] = {
        data: response,
        timestamp: Date.now()
      };

      console.log(`Fetched ${response.content?.length || 0} services for ${category}`);
      return response;

    } catch (error) {
      console.error(`Error fetching services for ${category}:`, error);

      // Return predefined services as final fallback
      return this.getPredefinedServices(category);
    }
  }

  /**
   * Get predefined services with working image URLs
   */
  getPredefinedServices(category) {
    const serviceDefinitions = {
      'airtime': [
        {
          serviceID: 'mtn',
          name: 'MTN Airtime',
          image: this.networkImages.mtn,
          category: 'airtime'
        },
        {
          serviceID: 'airtel',
          name: 'Airtel Airtime',
          image: this.networkImages.airtel,
          category: 'airtime'
        },
        {
          serviceID: 'glo',
          name: 'Glo Airtime',
          image: this.networkImages.glo,
          category: 'airtime'
        },
        {
          serviceID: 'etisalat',
          name: '9Mobile Airtime',
          image: this.networkImages.etisalat,
          category: 'airtime'
        }
      ],
      'data': [
        {
          serviceID: 'mtn-data',
          name: 'MTN Data',
          image: this.networkImages.mtn,
          category: 'data'
        },
        {
          serviceID: 'airtel-data',
          name: 'Airtel Data',
          image: this.networkImages.airtel,
          category: 'data'
        },
        {
          serviceID: 'glo-data',
          name: 'Glo Data',
          image: this.networkImages.glo,
          category: 'data'
        },
        {
          serviceID: 'etisalat-data',
          name: '9Mobile Data',
          image: this.networkImages.etisalat,
          category: 'data'
        }
      ],
      'tv-subscription': [
        {
          serviceID: 'dstv',
          name: 'DSTV Subscription',
          image: 'https://logos-world.net/wp-content/uploads/2020/11/DStv-Logo.png',
          category: 'tv-subscription'
        },
        {
          serviceID: 'gotv',
          name: 'GOtv Subscription',
          image: 'https://logos-world.net/wp-content/uploads/2020/11/GOtv-Logo.png',
          category: 'tv-subscription'
        },
        {
          serviceID: 'startimes',
          name: 'Startimes Subscription',
          image: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/StarTimes_logo.svg/320px-StarTimes_logo.svg.png',
          category: 'tv-subscription'
        }
      ],
      'electricity-bill': [
        {
          serviceID: 'ikeja-electric',
          name: 'Ikeja Electric (IKEDC)',
          image: 'https://example.com/images/ikeja-electric.png',
          category: 'electricity-bill'
        },
        {
          serviceID: 'eko-electric',
          name: 'Eko Electric (EKEDC)',
          image: 'https://example.com/images/eko-electric.png',
          category: 'electricity-bill'
        }
      ],
      'insurance': [
        {
          serviceID: 'ui-insure',
          name: 'Third-Party Motor Insurance',
          image: 'https://via.placeholder.com/100x60/007AFF/FFFFFF?text=INSURANCE',
          category: 'insurance',
          description: 'Comprehensive third-party motor vehicle insurance'
        }
      ]
    };

    return {
      response_description: "000",
      content: serviceDefinitions[category] || []
    };
  }

  /**
   * Get proper image URL for a service
   */
  getServiceImageUrl(serviceID, originalImage) {
    // Check if we have a predefined image for network services
    if (this.networkImages[serviceID]) {
      return this.networkImages[serviceID];
    }

    // If original image exists and looks valid, use it
    if (originalImage && originalImage.startsWith('http')) {
      return originalImage;
    }

    // Generate fallback image URL based on service ID
    const fallbackImages = {
      'dstv': 'https://logos-world.net/wp-content/uploads/2020/11/DStv-Logo.png',
      'gotv': 'https://logos-world.net/wp-content/uploads/2020/11/GOtv-Logo.png',
      'startimes': 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0a/StarTimes_logo.svg/320px-StarTimes_logo.svg.png',
      'showmax': 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/78/Showmax_logo.svg/320px-Showmax_logo.svg.png',
      'ui-insure': 'https://via.placeholder.com/100x60/007AFF/FFFFFF?text=INSURANCE'
    };

    return fallbackImages[serviceID] || `https://via.placeholder.com/100x60/007AFF/FFFFFF?text=${serviceID.toUpperCase()}`;
  }

  /**
   * Get service variations with caching
   */
  async getVariations(serviceId) {
    try {
      // Check cache first
      const cacheKey = serviceId;
      if (this.cache.variations[cacheKey] && this.isCacheValid(this.cache.variations[cacheKey])) {
        console.log(`Returning cached variations for ${serviceId}`);
        return this.cache.variations[cacheKey].data;
      }

      console.log(`Fetching variations for service: ${serviceId}`);

      const response = await this.makeRequest(`/service-variations?serviceID=${serviceId}`);

      // Cache the response
      this.cache.variations[cacheKey] = {
        data: response,
        timestamp: Date.now()
      };

      console.log(`Fetched variations for ${serviceId}:`, response.content?.ServiceName || serviceId);
      return response;

    } catch (error) {
      console.error(`Error fetching variations for ${serviceId}:`, error);
      throw error;
    }
  }

  /**
   * NEW: Get third-party motor insurance variation codes
   */
  async getInsuranceVariations() {
    try {
      console.log('Fetching third-party motor insurance variations...');
      const response = await this.makeRequest('/service-variations?serviceID=ui-insure');

      console.log('Insurance variations response:', response);
      return response;
    } catch (error) {
      console.error('Error fetching insurance variations:', error);

      // Return fallback variations
      return {
        response_description: "000",
        content: {
          ServiceName: "Third Party Motor Insurance - Universal Insurance",
          serviceID: "ui-insure",
          convinience_fee: "N0.00",
          variations: [
            { variation_code: "1", name: "Private", variation_amount: "3000.00", fixedPrice: "Yes" },
            { variation_code: "2", name: "Commercial", variation_amount: "5000.00", fixedPrice: "Yes" },
            { variation_code: "3", name: "Tricycles", variation_amount: "1500.00", fixedPrice: "Yes" },
            { variation_code: "4", name: "Motorcycle", variation_amount: "3000.00", fixedPrice: "Yes" }
          ]
        }
      };
    }
  }

  /**
   * NEW: Get vehicle color codes for insurance
   */
  async getVehicleColors() {
    try {
      const cacheKey = 'vehicle_colors';
      if (this.cache.insuranceOptions[cacheKey] && this.isCacheValid(this.cache.insuranceOptions[cacheKey])) {
        console.log('Returning cached vehicle colors');
        return this.cache.insuranceOptions[cacheKey].data;
      }

      console.log('Fetching vehicle color codes...');
      const response = await this.makeRequest('/universal-insurance/options/color');

      // Cache the response
      this.cache.insuranceOptions[cacheKey] = {
        data: response,
        timestamp: Date.now()
      };

      return response;
    } catch (error) {
      console.error('Error fetching vehicle colors:', error);

      // Return fallback colors
      return {
        response_description: "000",
        content: [
          { ColourCode: "20", ColourName: "Ash" },
          { ColourCode: "1004", ColourName: "Black" },
          { ColourCode: "1001", ColourName: "White" },
          { ColourCode: "1002", ColourName: "Red" },
          { ColourCode: "1003", ColourName: "Blue" },
          { ColourCode: "1005", ColourName: "Silver" },
          { ColourCode: "1006", ColourName: "Gold" },
          { ColourCode: "1007", ColourName: "Green" }
        ]
      };
    }
  }

  /**
   * NEW: Get engine capacity codes for insurance
   */
  async getEngineCapacities() {
    try {
      const cacheKey = 'engine_capacities';
      if (this.cache.insuranceOptions[cacheKey] && this.isCacheValid(this.cache.insuranceOptions[cacheKey])) {
        console.log('Returning cached engine capacities');
        return this.cache.insuranceOptions[cacheKey].data;
      }

      console.log('Fetching engine capacity codes...');
      const response = await this.makeRequest('/universal-insurance/options/engine-capacity');

      // Cache the response
      this.cache.insuranceOptions[cacheKey] = {
        data: response,
        timestamp: Date.now()
      };

      return response;
    } catch (error) {
      console.error('Error fetching engine capacities:', error);

      // Return fallback capacities
      return {
        response_description: "000",
        content: [
          { CapacityCode: "1", CapacityName: "0.1 - 1.59" },
          { CapacityCode: "2", CapacityName: "1.6 - 2.0" },
          { CapacityCode: "3", CapacityName: "2.1 - 3.0" },
          { CapacityCode: "4", CapacityName: "3.1 - 4.0" },
          { CapacityCode: "5", CapacityName: "4.1 - 5.0" },
          { CapacityCode: "6", CapacityName: "Above 5.0" }
        ]
      };
    }
  }

  /**
   * NEW: Get state codes for insurance
   */
  async getStates() {
    try {
      const cacheKey = 'states';
      if (this.cache.insuranceOptions[cacheKey] && this.isCacheValid(this.cache.insuranceOptions[cacheKey])) {
        console.log('Returning cached states');
        return this.cache.insuranceOptions[cacheKey].data;
      }

      console.log('Fetching state codes...');
      const response = await this.makeRequest('/universal-insurance/options/state');

      // Cache the response
      this.cache.insuranceOptions[cacheKey] = {
        data: response,
        timestamp: Date.now()
      };

      return response;
    } catch (error) {
      console.error('Error fetching states:', error);

      // Return fallback states
      return {
        response_description: "000",
        content: [
          { StateCode: "1", StateName: "Abia" },
          { StateCode: "2", StateName: "Adamawa" },
          { StateCode: "3", StateName: "Akwa Ibom" },
          { StateCode: "4", StateName: "Anambra" },
          { StateCode: "5", StateName: "Bauchi" },
          { StateCode: "6", StateName: "Bayelsa" },
          { StateCode: "7", StateName: "FCT" },
          { StateCode: "25", StateName: "Lagos" },
          { StateCode: "26", StateName: "Nasarawa" },
          { StateCode: "27", StateName: "Niger" },
          { StateCode: "28", StateName: "Ogun" },
          { StateCode: "29", StateName: "Ondo" },
          { StateCode: "30", StateName: "Osun" },
          { StateCode: "31", StateName: "Oyo" },
          { StateCode: "32", StateName: "Plateau" },
          { StateCode: "33", StateName: "Rivers" },
          { StateCode: "34", StateName: "Sokoto" },
          { StateCode: "35", StateName: "Taraba" },
          { StateCode: "36", StateName: "Yobe" },
          { StateCode: "37", StateName: "Zamfara" }
        ]
      };
    }
  }

  /**
   * NEW: Get LGA codes for a specific state
   */
  async getLGAs(stateCode) {
    try {
      const cacheKey = `lgas_${stateCode}`;
      if (this.cache.insuranceOptions[cacheKey] && this.isCacheValid(this.cache.insuranceOptions[cacheKey])) {
        console.log(`Returning cached LGAs for state ${stateCode}`);
        return this.cache.insuranceOptions[cacheKey].data;
      }

      console.log(`Fetching LGA codes for state: ${stateCode}`);
      const response = await this.makeRequest(`/universal-insurance/options/lga/${stateCode}`);

      // Cache the response
      this.cache.insuranceOptions[cacheKey] = {
        data: response,
        timestamp: Date.now()
      };

      return response;
    } catch (error) {
      console.error(`Error fetching LGAs for state ${stateCode}:`, error);

      // Return fallback LGAs based on state
      const fallbackLGAs = {
        "1": [ // Abia
          { LGACode: "770", LGAName: "Aba", StateCode: "1" },
          { LGACode: "1", LGAName: "Aba North", StateCode: "1" },
          { LGACode: "2", LGAName: "Aba South", StateCode: "1" },
          { LGACode: "3", LGAName: "Arochukwu", StateCode: "1" },
          { LGACode: "4", LGAName: "Bende", StateCode: "1" },
          { LGACode: "5", LGAName: "Ikwuano", StateCode: "1" },
          { LGACode: "6", LGAName: "Isiala Ngwa North", StateCode: "1" },
          { LGACode: "7", LGAName: "Isiala Ngwa South", StateCode: "1" },
          { LGACode: "8", LGAName: "Isuikwuato", StateCode: "1" },
          { LGACode: "9", LGAName: "Obi Ngwa", StateCode: "1" },
          { LGACode: "10", LGAName: "Ohafia", StateCode: "1" },
          { LGACode: "11", LGAName: "Osisioma", StateCode: "1" },
          { LGACode: "12", LGAName: "Ugwunagbo", StateCode: "1" },
          { LGACode: "13", LGAName: "Ukwa East", StateCode: "1" },
          { LGACode: "14", LGAName: "Ukwa West", StateCode: "1" },
          { LGACode: "15", LGAName: "Umuahia North", StateCode: "1" },
          { LGACode: "16", LGAName: "Umuahia South", StateCode: "1" },
          { LGACode: "17", LGAName: "Umu Nneochi", StateCode: "1" }
        ],
        "25": [ // Lagos
          { LGACode: "450", LGAName: "Agege", StateCode: "25" },
          { LGACode: "451", LGAName: "Ajeromi-Ifelodun", StateCode: "25" },
          { LGACode: "452", LGAName: "Alimosho", StateCode: "25" },
          { LGACode: "453", LGAName: "Amuwo-Odofin", StateCode: "25" },
          { LGACode: "454", LGAName: "Apapa", StateCode: "25" },
          { LGACode: "455", LGAName: "Badagry", StateCode: "25" },
          { LGACode: "456", LGAName: "Epe", StateCode: "25" },
          { LGACode: "457", LGAName: "Eti Osa", StateCode: "25" },
          { LGACode: "458", LGAName: "Ibeju-Lekki", StateCode: "25" },
          { LGACode: "459", LGAName: "Ifako-Ijaiye", StateCode: "25" },
          { LGACode: "460", LGAName: "Ikeja", StateCode: "25" },
          { LGACode: "461", LGAName: "Ikorodu", StateCode: "25" },
          { LGACode: "462", LGAName: "Kosofe", StateCode: "25" },
          { LGACode: "463", LGAName: "Lagos Island", StateCode: "25" },
          { LGACode: "464", LGAName: "Lagos Mainland", StateCode: "25" },
          { LGACode: "465", LGAName: "Mushin", StateCode: "25" },
          { LGACode: "466", LGAName: "Ojo", StateCode: "25" },
          { LGACode: "467", LGAName: "Oshodi-Isolo", StateCode: "25" },
          { LGACode: "468", LGAName: "Shomolu", StateCode: "25" },
          { LGACode: "469", LGAName: "Surulere", StateCode: "25" }
        ]
      };

      return {
        response_description: "000",
        content: fallbackLGAs[stateCode] || [
          { LGACode: "999", LGAName: "Default LGA", StateCode: stateCode }
        ]
      };
    }
  }

  /**
   * NEW: Get vehicle make/brand codes
   */
  async getVehicleMakes() {
    try {
      const cacheKey = 'vehicle_makes';
      if (this.cache.insuranceOptions[cacheKey] && this.isCacheValid(this.cache.insuranceOptions[cacheKey])) {
        console.log('Returning cached vehicle makes');
        return this.cache.insuranceOptions[cacheKey].data;
      }

      console.log('Fetching vehicle make codes...');
      const response = await this.makeRequest('/universal-insurance/options/brand');

      // Cache the response
      this.cache.insuranceOptions[cacheKey] = {
        data: response,
        timestamp: Date.now()
      };

      return response;
    } catch (error) {
      console.error('Error fetching vehicle makes:', error);

      // Return fallback makes
      return {
        response_description: "000",
        content: [
          { VehicleMakeCode: "335", VehicleMakeName: "Toyota" },
          { VehicleMakeCode: "1", VehicleMakeName: "Honda" },
          { VehicleMakeCode: "2", VehicleMakeName: "Nissan" },
          { VehicleMakeCode: "3", VehicleMakeName: "Hyundai" },
          { VehicleMakeCode: "4", VehicleMakeName: "Kia" },
          { VehicleMakeCode: "5", VehicleMakeName: "Mercedes-Benz" },
          { VehicleMakeCode: "6", VehicleMakeName: "BMW" },
          { VehicleMakeCode: "7", VehicleMakeName: "Volkswagen" },
          { VehicleMakeCode: "8", VehicleMakeName: "Ford" },
          { VehicleMakeCode: "9", VehicleMakeName: "Peugeot" },
          { VehicleMakeCode: "10", VehicleMakeName: "Mazda" },
          { VehicleMakeCode: "11", VehicleMakeName: "Lexus" },
          { VehicleMakeCode: "12", VehicleMakeName: "Infiniti" },
          { VehicleMakeCode: "13", VehicleMakeName: "Acura" },
          { VehicleMakeCode: "14", VehicleMakeName: "Mitsubishi" },
          { VehicleMakeCode: "15", VehicleMakeName: "Suzuki" },
          { VehicleMakeCode: "16", VehicleMakeName: "Isuzu" },
          { VehicleMakeCode: "17", VehicleMakeName: "Jeep" },
          { VehicleMakeCode: "18", VehicleMakeName: "Land Rover" },
          { VehicleMakeCode: "19", VehicleMakeName: "Volvo" },
          { VehicleMakeCode: "20", VehicleMakeName: "Audi" }
        ]
      };
    }
  }

  /**
   * NEW: Get vehicle model codes for a specific make
   */
  async getVehicleModels(makeCode) {
    try {
      const cacheKey = `vehicle_models_${makeCode}`;
      if (this.cache.insuranceOptions[cacheKey] && this.isCacheValid(this.cache.insuranceOptions[cacheKey])) {
        console.log(`Returning cached vehicle models for make ${makeCode}`);
        return this.cache.insuranceOptions[cacheKey].data;
      }

      console.log(`Fetching vehicle model codes for make: ${makeCode}`);
      const response = await this.makeRequest(`/universal-insurance/options/model/${makeCode}`);

      // Cache the response
      this.cache.insuranceOptions[cacheKey] = {
        data: response,
        timestamp: Date.now()
      };

      return response;
    } catch (error) {
      console.error(`Error fetching vehicle models for make ${makeCode}:`, error);

      // Return fallback models based on make
      const fallbackModels = {
        "335": [ // Toyota
          { VehicleModelCode: "745", VehicleModelName: "Camry", VehicleMakeCode: "335" },
          { VehicleModelCode: "746", VehicleModelName: "Corolla", VehicleMakeCode: "335" },
          { VehicleModelCode: "747", VehicleModelName: "Highlander", VehicleMakeCode: "335" },
          { VehicleModelCode: "748", VehicleModelName: "RAV4", VehicleMakeCode: "335" },
          { VehicleModelCode: "749", VehicleModelName: "Sienna", VehicleMakeCode: "335" },
          { VehicleModelCode: "750", VehicleModelName: "Prius", VehicleMakeCode: "335" },
          { VehicleModelCode: "751", VehicleModelName: "Avalon", VehicleMakeCode: "335" },
          { VehicleModelCode: "752", VehicleModelName: "Venza", VehicleMakeCode: "335" }
        ],
        "1": [ // Honda
          { VehicleModelCode: "1", VehicleModelName: "Accord", VehicleMakeCode: "1" },
          { VehicleModelCode: "2", VehicleModelName: "Civic", VehicleMakeCode: "1" },
          { VehicleModelCode: "3", VehicleModelName: "CR-V", VehicleMakeCode: "1" },
          { VehicleModelCode: "4", VehicleModelName: "Pilot", VehicleMakeCode: "1" },
          { VehicleModelCode: "5", VehicleModelName: "Odyssey", VehicleMakeCode: "1" },
          { VehicleModelCode: "6", VehicleModelName: "Fit", VehicleMakeCode: "1" }
        ]
      };

      return {
        response_description: "000",
        content: fallbackModels[makeCode] || [
          { VehicleModelCode: "999", VehicleModelName: "Default Model", VehicleMakeCode: makeCode }
        ]
      };
    }
  }

  /**
   * Verify customer details
   */
  async verifyCustomer(serviceID, billersCode, type = null) {
    try {
      const payload = {
        serviceID,
        billersCode,
      };

      if (type) {
        payload.type = type;
      }

      console.log('Verifying customer:', { serviceID, billersCode: '***masked***', type });

      const response = await this.makeRequest('/merchant-verify', 'POST', payload);
      return response;
    } catch (error) {
      console.error('Error verifying customer:', error);
      throw error;
    }
  }

  /**
   * Send SMS using VTPass SMS DND API (more reliable)
   */
  async sendSMS(smsData) {
    console.log('Sending SMS with VTPass Messaging DND route:', {
      ...smsData,
      recipients: smsData.recipients ? '***masked***' : undefined,
    });

    const { sender, recipients, message, responseType = 'json' } = smsData;

    if (!sender || !recipients || !message) {
      throw new Error('Missing required SMS fields: sender, recipients, message');
    }

    try {
      console.log("SMS payload being sent to VTPass:", {
        sender,
        recipients: '***masked***',
        messageLength: message.length,
        responseType
      });

      // Use GET method for DND route as per VTPass documentation
      const params = new URLSearchParams({
        sender: sender.substring(0, 11), // Ensure sender is max 11 characters
        recipient: recipients, // Multiple recipients separated by commas
        message: message.substring(0, 160), // Ensure message is max 160 characters
        responsetype: responseType
      });

      const config = {
        method: 'GET',
        url: `${this.messagingBaseURL}/api/sms/dnd-route?${params.toString()}`,
        headers: this.getMessagingHeaders(),
        timeout: 30000, // 30 seconds timeout
      };

      console.log('SMS request config:', {
        url: config.url.replace(/recipient=[^&]+/, 'recipient=***masked***'),
        method: config.method,
        headers: {
          'Content-Type': config.headers['Content-Type'],
          'X-Token': config.headers['X-Token'] ? 'present' : 'missing',
          'X-Secret': config.headers['X-Secret'] ? 'present' : 'missing',
        }
      });

      const response = await axios(config);
      console.log('VTPass SMS response:', response.data);

      // Parse the response based on response type
      let parsedResponse;
      if (responseType === 'json' && typeof response.data === 'object') {
        parsedResponse = response.data;
      } else if (responseType === 'json' && typeof response.data === 'string') {
        try {
          parsedResponse = JSON.parse(response.data);
        } catch (parseError) {
          // If JSON parsing fails, treat as text response
          parsedResponse = this.parseTextSMSResponse(response.data);
        }
      } else {
        // Parse text response
        parsedResponse = this.parseTextSMSResponse(response.data);
      }

      console.log('Parsed SMS response:', parsedResponse);
      return parsedResponse;

    } catch (error) {
      console.error('VTPass SMS API failed:', error.response?.data || error.message);

      // Provide more specific error messages
      if (error.response?.status === 401) {
        throw new Error('VTPass SMS authentication failed. Please check messaging API credentials.');
      } else if (error.response?.status === 400) {
        throw new Error(`Invalid SMS request: ${error.response?.data?.message || 'Bad request'}`);
      } else if (error.response?.status === 404) {
        throw new Error('VTPass SMS service endpoint not found. Please contact support.');
      } else if (error.response?.status === 422) {
        throw new Error(`SMS validation failed: ${error.response?.data?.message || 'Invalid data'}`);
      } else if (error.response?.status >= 500) {
        throw new Error('VTPass SMS service temporarily unavailable. Please try again later.');
      }

      throw error;
    }
  }

  /**
   * Parse VTPass text SMS response into JSON format
   */
  parseTextSMSResponse(textResponse) {
    console.log('Parsing text SMS response:', textResponse);

    // VTPass text format: TG00-MESSAGE PROCESSED:0000|2347061933309|1623425963075808467849264|SENT|MESSAGE SENT TO PROVIDER|MTNNG|NIGERIA |999|0000-00-00 00:00:00
    const parts = textResponse.split(':');

    if (parts.length >= 2) {
      const responseCode = parts[0]; // e.g., "TG00-MESSAGE PROCESSED"
      const details = parts[1].split('|');

      const isSuccess = responseCode.includes('TG00') || responseCode.includes('MESSAGE PROCESSED');

      return {
        responseCode: responseCode,
        response: isSuccess ? 'MESSAGE PROCESSED' : 'MESSAGE FAILED',
        success: isSuccess,
        batchId: details[2] || Date.now().toString(),
        sentDate: new Date().toISOString(),
        messages: [{
          statusCode: details[0] || '0000',
          recipient: details[1] || '',
          messageId: details[2] || '',
          status: details[3] || (isSuccess ? 'SENT' : 'FAILED'),
          description: details[4] || (isSuccess ? 'MESSAGE SENT TO PROVIDER' : 'MESSAGE FAILED'),
          network: details[5] || '',
          country: details[6] || '',
          deliveryCode: details[7] || '999',
          deliveryDate: details[8] || '0000-00-00 00:00:00'
        }]
      };
    }

    // Fallback for unexpected format
    const isSuccess = textResponse.toLowerCase().includes('success') ||
        textResponse.toLowerCase().includes('sent') ||
        textResponse.includes('TG00');

    return {
      responseCode: isSuccess ? 'TG00' : 'TG99',
      response: isSuccess ? 'MESSAGE PROCESSED' : 'MESSAGE FAILED',
      success: isSuccess,
      batchId: Date.now().toString(),
      sentDate: new Date().toISOString(),
      rawResponse: textResponse,
      messages: [{
        statusCode: isSuccess ? '0000' : '9999',
        status: isSuccess ? 'SENT' : 'FAILED',
        description: textResponse
      }]
    };
  }

  /**
   * NEW: Get SMS unit balance using correct VTPass endpoint
   */
  async getSMSBalance() {
    try {
      console.log('Checking VTPass SMS unit balance...');

      const config = {
        method: 'GET',
        url: `${this.messagingBaseURL}/api/sms/balance`,
        headers: this.getMessagingHeaders(),
        timeout: 15000,
      };

      console.log('SMS balance request:', {
        url: config.url,
        headers: {
          'X-Token': config.headers['X-Token'] ? 'present' : 'missing',
          'X-Secret': config.headers['X-Secret'] ? 'present' : 'missing',
        }
      });

      const response = await axios(config);
      console.log('VTPass SMS balance response:', response.data);

      // Parse the response which might be in text format
      let balanceData;
      if (typeof response.data === 'string') {
        // Try to parse text response
        const balanceMatch = response.data.match(/(\d+(?:\.\d+)?)/);
        const balance = balanceMatch ? parseFloat(balanceMatch[1]) : 0;

        balanceData = {
          balance: balance,
          units: Math.floor(balance / 4), // Assuming ₦4 per unit
          currency: 'NGN',
          rawResponse: response.data
        };
      } else {
        // JSON response
        balanceData = {
          balance: response.data.balance || 0,
          units: response.data.units || Math.floor((response.data.balance || 0) / 4),
          currency: response.data.currency || 'NGN',
          ...response.data
        };
      }

      return {
        success: true,
        message: 'SMS balance retrieved successfully',
        data: balanceData
      };

    } catch (error) {
      console.error('Error fetching SMS balance:', error);

      // Return a default response if balance check fails
      return {
        success: false,
        message: 'Unable to fetch SMS balance',
        data: {
          balance: 0,
          units: 0,
          currency: 'NGN'
        },
        error: error.message
      };
    }
  }


  /**
   * Process bill payment - Enhanced with insurance support
   */
  async payBill(paymentData) {
    console.log('Processing payment with VTPass:', {
      ...paymentData,
      phone: paymentData.phone ? '***masked***' : undefined,
      billersCode: paymentData.billersCode ? '***masked***' : undefined,
      email: paymentData.email ? '***masked***' : undefined
    });

    let { request_id, serviceID, amount, phone } = paymentData;

    if (!serviceID || !amount || !phone) {
      throw new Error('Missing required payment fields: serviceID, amount, phone');
    }

    // Handle SMS services differently
    if (serviceID === 'bulk-sms') {
      return await this.processBulkSMSPayment(paymentData);
    } else if (serviceID === 'sms-units') {
      return await this.processSMSUnitsPayment(paymentData);
    }

    // Generate VTPass-compliant request_id if not provided
    if (!request_id) {
      request_id = this.generateRequestId();
      console.log('Generated VTPass-compliant request_id:', request_id);
    } else {
      // Validate existing request_id
      const validation = this.validateRequestId(request_id);
      if (!validation.isValid) {
        console.warn('Invalid request_id format:', validation.errors);
        // Generate a new compliant one
        request_id = this.generateRequestId();
        console.log('Replaced with VTPass-compliant request_id:', request_id);
      }
    }

    // Format phone number for VTPass
    function formatPhoneForVTPass(phone) {
      let cleaned = phone.toString().replace(/[^\d+]/g, '');

      // If it's international format, keep it
      if (cleaned.startsWith('+234')) {
        return cleaned;
      }

      // If it's 234xxxxxxxxx, add +
      if (cleaned.startsWith('234') && cleaned.length === 13) {
        return '+' + cleaned;
      }

      // If it's 8xxxxxxxx, 7xxxxxxxx, 9xxxxxxxx (10 digits), add 0
      if (/^[789]\d{9}$/.test(cleaned)) {
        return '0' + cleaned;
      }

      // If it already starts with 0, keep it
      if (cleaned.startsWith('0')) {
        return cleaned;
      }

      // Default: add 0 if it looks like a 10-digit number
      if (cleaned.length === 10) {
        return '0' + cleaned;
      }

      return cleaned;
    }

    const formattedPhone = formatPhoneForVTPass(phone);

    const payload = {
      request_id,
      serviceID,
      amount: Number(amount),
      phone: formattedPhone,
    };

    // Handle different service types
    if (serviceID === 'ui-insure') {
      // Third-party motor insurance requires additional fields
      const requiredInsuranceFields = [
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
        'email',
        'variation_code' // This is REQUIRED for insurance
      ];

      // Add all insurance-specific fields
      requiredInsuranceFields.forEach(field => {
        if (paymentData[field] !== undefined) {
          payload[field] = paymentData[field];
        }
      });

      // Ensure billersCode matches Plate_Number for insurance
      payload.billersCode = paymentData.Plate_Number || paymentData.billersCode;

      console.log('Third-party motor insurance payload prepared:', {
        ...payload,
        phone: '***masked***',
        email: '***masked***',
        Insured_Name: '***masked***',
        hasVariationCode: !!payload.variation_code,
        variationCodeType: typeof payload.variation_code,
        variationCodeValue: payload.variation_code
      });
    } else {
      // Regular service payment
      if (paymentData.billersCode) {
        payload.billersCode = paymentData.billersCode;
      }

      if (paymentData.variation_code) {
        payload.variation_code = paymentData.variation_code;
      }
    }

    try {
      console.log("Final payload being sent to VTPass:", {
        ...payload,
        phone: '***masked***',
        email: payload.email ? '***masked***' : undefined,
        Insured_Name: payload.Insured_Name ? '***masked***' : undefined
      });

      const response = await this.makeRequest('/pay', 'POST', payload);
      console.log('VTPass payment response:', response.response_description || response.code);

      // For insurance, include certificate information in response
      if (serviceID === 'ui-insure' && response.certUrl) {
        response.certificateUrl = response.certUrl;
        response.certificateDownload = response.purchased_code;
      }

      return response;
    } catch (error) {
      console.error('VTPass payment failed:', error.response?.data || error.message);

      // Provide more specific error messages
      if (error.response?.status === 401) {
        throw new Error('VTPass authentication failed. Please check API credentials.');
      } else if (error.response?.status === 400) {
        throw new Error(`Invalid payment request: ${error.response?.data || 'Bad request'}`);
      } else if (error.response?.status === 422) {
        throw new Error(`Payment validation failed: ${error.response?.data || 'Invalid data'}`);
      } else if (error.response?.status >= 500) {
        throw new Error('VTPass service temporarily unavailable. Please try again later.');
      }

      throw error;
    }
  }

  /**
   * NEW: Process bulk SMS payment using DND route
   */
  async processBulkSMSPayment(paymentData) {
    console.log('Processing bulk SMS payment with DND route...');

    const { recipients, message, sender = 'Surepay', amount } = paymentData;

    if (!recipients || !message) {
      throw new Error('Missing required SMS fields: recipients, message');
    }

    try {
      // Format recipients (remove duplicates and validate)
      const recipientNumbers = recipients
          .split(/[,\n]/)
          .map(num => num.trim())
          .filter(num => num && /^[0-9]{11}$/.test(num))
          .filter((num, index, arr) => arr.indexOf(num) === index); // Remove duplicates

      if (recipientNumbers.length === 0) {
        throw new Error('No valid phone numbers found in recipients list');
      }

      const recipientString = recipientNumbers.join(',');

      // Send SMS using VTPass messaging DND API
      const smsResponse = await this.sendSMS({
        sender: sender.substring(0, 11), // Sender ID max 11 characters
        recipients: recipientString,
        message: message.substring(0, 160), // Limit message to 160 characters
        responseType: 'json'
      });

      console.log('Bulk SMS sent successfully:', smsResponse);

      // Check if the SMS was successful
      const isSuccess = smsResponse.success ||
          smsResponse.responseCode?.includes('TG00') ||
          smsResponse.response?.includes('MESSAGE PROCESSED');

      if (!isSuccess) {
        throw new Error(smsResponse.messages?.[0]?.description || 'SMS sending failed');
      }

      // Return success response in VTPass format
      return {
        response_description: 'TRANSACTION SUCCESSFUL',
        code: '000',
        content: {
          transactions: {
            status: 'delivered',
            transactionId: smsResponse.batchId || smsResponse.messageId || Date.now().toString(),
            product_name: 'Bulk SMS',
            unique_element: recipientNumbers.length,
            unit_price: 4,
            quantity: recipientNumbers.length
          }
        },
        purchased_code: smsResponse.batchId || smsResponse.messageId,
        smsDetails: {
          recipientCount: recipientNumbers.length,
          messageLength: message.length,
          batchId: smsResponse.batchId || smsResponse.messageId,
          sentDate: smsResponse.sentDate || new Date().toISOString(),
          responseCode: smsResponse.responseCode,
          messages: smsResponse.messages || []
        }
      };

    } catch (error) {
      console.error('Bulk SMS processing failed:', error);

      // Return failure response in VTPass format
      return {
        response_description: 'TRANSACTION FAILED',
        code: '099',
        content: {
          transactions: {
            status: 'failed',
            transactionId: Date.now().toString(),
            product_name: 'Bulk SMS'
          }
        },
        error: error.message,
        smsDetails: {
          recipientCount: 0,
          messageLength: message.length,
          error: error.message
        }
      };
    }
  }

  /**
   * NEW: Process SMS units payment (credits SMS balance)
   */
  async processSMSUnitsPayment(paymentData) {
    console.log('Processing SMS units payment...');

    const { amount } = paymentData;
    const units = Math.floor(amount / 4); // ₦4 per unit

    // In a real implementation, you would credit the user's SMS balance
    // For now, we'll simulate a successful response
    return {
      response_description: 'TRANSACTION SUCCESSFUL',
      code: '000',
      content: {
        transactions: {
          status: 'delivered',
          transactionId: this.generateRequestId(),
          product_name: 'SMS Units',
          unique_element: units,
          unit_price: 4,
          quantity: units
        }
      },
      purchased_code: `SMS_UNITS_${units}`,
      unitsDetails: {
        unitsPurchased: units,
        unitPrice: 4,
        totalAmount: amount
      }
    };
  }

  /**
   * Query transaction status
   */
  async queryTransaction(requestId) {
    try {
      const payload = { request_id: requestId };
      console.log('Querying transaction status:', requestId);

      const response = await this.makeRequest('/requery', 'POST', payload);

      // For insurance transactions, include certificate information
      if (response.certUrl) {
        response.certificateUrl = response.certUrl;
        response.certificateDownload = response.purchased_code;
      }

      return response;
    } catch (error) {
      console.error('Error querying transaction:', error);
      throw error;
    }
  }

  /**
   * Test VTPass connectivity and credentials
   */
  async testConnection() {
    try {
      console.log('Testing VTPass connection...');
      console.log('Using credentials:');
      console.log('API Key:', this.apiKey ? `${this.apiKey.substring(0, 8)}...` : 'NOT SET');
      console.log('Secret Key:', this.secretKey ? `${this.secretKey.substring(0, 8)}...` : 'NOT SET');
      console.log('Base URL:', this.baseURL);

      // Test with service categories endpoint
      const response = await this.makeRequest('/service-categories');

      if (response && response.response_description === '000') {
        console.log('VTPass connection test successful');
        return {
          success: true,
          message: 'Connection successful',
          categoriesCount: response.content?.length || 0,
          data: response
        };
      } else {
        throw new Error('Invalid response from VTPass');
      }
    } catch (error) {
      console.error('VTPass connection test failed:', error.message);
      return {
        success: false,
        error: error.message,
        details: error.response?.data,
        status: error.response?.status
      };
    }
  }

  /**
   * Test SMS API connectivity using DND route
   */
  async testSMSConnection() {
    try {
      console.log('Testing VTPass SMS connection with DND route...');

      // Test with a small SMS to a test number
      const testSMS = {
        sender: 'TEST',
        recipients: '08011111111', // VTPass test number
        message: 'Test message from Surepay',
        responseType: 'json'
      };

      const smsResponse = await this.sendSMS(testSMS);

      console.log('VTPass SMS connection test successful');
      return {
        success: true,
        message: 'SMS connection successful',
        testResponse: smsResponse,
        endpoint: 'DND Route',
        credentials: {
          publicKey: this.publicKey ? 'Set' : 'Missing',
          secretKey: this.secretKey ? 'Set' : 'Missing'
        }
      };
    } catch (error) {
      console.error('VTPass SMS connection test failed:', error.message);
      return {
        success: false,
        error: error.message,
        details: error.response?.data,
        status: error.response?.status,
        endpoint: 'DND Route Failed'
      };
    }
  }

  /**
   * Clear cache for specific category or all cache
   */
  clearCache(category = null) {
    if (category) {
      if (this.cache.services[category]) {
        delete this.cache.services[category];
        console.log(`Cache cleared for category: ${category}`);
      }
    } else {
      this.cache.categories = { data: null, timestamp: null };
      this.cache.services = {};
      this.cache.variations = {};
      this.cache.insuranceOptions = {};
      console.log('All cache cleared');
    }
  }

  /**
   * Force refresh cache
   */
  async refreshCache() {
    console.log('Force refreshing VTPass cache...');
    this.clearCache();

    try {
      // Refresh categories
      const categories = await this.getServiceCategories();

      // Refresh services for each category
      const refreshPromises = categories.content.map(async (category) => {
        try {
          await this.getServices(category.identifier);
        } catch (error) {
          console.error(`Failed to refresh services for ${category.identifier}:`, error.message);
        }
      });

      await Promise.all(refreshPromises);

      // Refresh insurance options
      try {
        await this.getStates();
        await this.getVehicleMakes();
        await this.getVehicleColors();
        await this.getEngineCapacities();
        await this.getInsuranceVariations();
      } catch (error) {
        console.error('Failed to refresh insurance options:', error.message);
      }

      console.log('Cache refresh completed');
      return {
        success: true,
        categoriesCount: categories.content.length,
        timestamp: new Date().toISOString()
      };
    } catch (error) {
      console.error('Cache refresh failed:', error);
      return {
        success: false,
        error: error.message,
        timestamp: new Date().toISOString()
      };
    }
  }

  /**
   * Get cache statistics
   */
  getCacheInfo() {
    const categoriesValid = this.isCacheValid(this.cache.categories);
    const servicesCount = Object.keys(this.cache.services).length;
    const variationsCount = Object.keys(this.cache.variations).length;
    const insuranceOptionsCount = Object.keys(this.cache.insuranceOptions).length;

    return {
      categories: {
        cached: !!this.cache.categories.data,
        valid: categoriesValid,
        timestamp: this.cache.categories.timestamp
      },
      services: {
        categoriesCount: servicesCount,
        cached: servicesCount > 0
      },
      variations: {
        count: variationsCount,
        cached: variationsCount > 0
      },
      insuranceOptions: {
        count: insuranceOptionsCount,
        cached: insuranceOptionsCount > 0
      },
      overall: {
        hasValidCache: categoriesValid && servicesCount > 0,
        lastActivity: Math.max(
            this.cache.categories.timestamp || 0,
            ...Object.values(this.cache.services).map(s => s.timestamp || 0),
            ...Object.values(this.cache.insuranceOptions).map(s => s.timestamp || 0)
        )
      }
    };
  }
}

export default new VTPassService();