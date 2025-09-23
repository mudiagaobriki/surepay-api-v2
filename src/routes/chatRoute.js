// src/routes/chatRoute.js
import { Router } from 'express';
import ChatControllerFactory from '../controller/ChatController.js';
import { authMiddleware } from '../middleware/auth.js';

const chatRouter = Router();
const ChatController = ChatControllerFactory();

// Get the message history for a specific conversation
chatRouter.get('/history/:conversationId', authMiddleware, ChatController.getConversationHistory);

export default chatRouter;