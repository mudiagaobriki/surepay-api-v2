import { Router } from 'express';
import WalletControllerFactory from '../controller/WalletController.js';
import { authMiddleware } from '../middleware/auth.js';

const walletRouter = Router();
const WalletController = WalletControllerFactory();

// Public endpoints for payment processing
// FIXED: Add specific route for Monnify webhooks (virtual accounts)
walletRouter.post('/webhook/monnify', WalletController.monnifyWebhook);
// Keep generic webhook for other gateways
walletRouter.post('/webhook/:gateway?', WalletController.paymentWebhook);

walletRouter.get('/callback', WalletController.paymentCallback);
walletRouter.get('/banks/:gateway?', WalletController.listBanks);
walletRouter.post('/debug/verify-signature', WalletController.debugSignatureVerification);

// Protected endpoints (authentication required)
walletRouter.use(authMiddleware);

// Wallet management
walletRouter.get('/balance', WalletController.getWalletBalance);
walletRouter.get('/transactions', WalletController.getTransactionHistory);

// Payment and transfers
walletRouter.post('/fund', WalletController.fundWallet);
walletRouter.get('/verify/:reference', WalletController.verifyPayment);
walletRouter.post('/transfer', WalletController.transferFunds);

// Virtual account management
walletRouter.post('/virtual-account', WalletController.createVirtualAccount);
walletRouter.get('/virtual-account', WalletController.getVirtualAccount);

export default walletRouter;