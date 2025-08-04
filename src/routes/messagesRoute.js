import { Router } from 'express';
import SMSControllerFactory from '../controller/MessagingController.js';

const messageRouter = Router();
const SMSController = SMSControllerFactory;

// Define routes for SMS functionality
messageRouter.post('/new', SMSController.newMessage);

export default messageRouter;
