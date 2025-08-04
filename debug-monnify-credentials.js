// debug-monnify-credentials.js
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

console.log('🔍 Debugging Monnify Credentials...');
console.log('-----------------------------------');

console.log('Environment Variables:');
console.log('NODE_ENV:', process.env.NODE_ENV);
console.log('MONNIFY_BASE_URL:', process.env.MONNIFY_BASE_URL);
console.log('MONNIFY_API_KEY exists:', !!process.env.MONNIFY_API_KEY);
console.log('MONNIFY_SECRET_KEY exists:', !!process.env.MONNIFY_SECRET_KEY);
console.log('MONNIFY_CONTRACT_CODE exists:', !!process.env.MONNIFY_CONTRACT_CODE);

if (process.env.MONNIFY_API_KEY) {
    console.log('MONNIFY_API_KEY preview:', process.env.MONNIFY_API_KEY.substring(0, 10) + '...');
}

if (process.env.MONNIFY_SECRET_KEY) {
    console.log('MONNIFY_SECRET_KEY preview:', process.env.MONNIFY_SECRET_KEY.substring(0, 10) + '...');
}

if (process.env.MONNIFY_CONTRACT_CODE) {
    console.log('MONNIFY_CONTRACT_CODE preview:', process.env.MONNIFY_CONTRACT_CODE.substring(0, 10) + '...');
}

console.log('-----------------------------------');

// Test Basic Auth encoding
if (process.env.MONNIFY_API_KEY && process.env.MONNIFY_SECRET_KEY) {
    const credentials = `${process.env.MONNIFY_API_KEY}:${process.env.MONNIFY_SECRET_KEY}`;
    const encoded = Buffer.from(credentials).toString('base64');
    console.log('Basic Auth Header preview:', encoded.substring(0, 20) + '...');
} else {
    console.log('❌ Missing API key or secret key!');
}