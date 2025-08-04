import { Router } from 'express';
import WhatsappControllerFactory from '../../utils/twilio/Whatsapp.js';

const whatsappRouter = Router();
const WhatsappController = WhatsappControllerFactory();

// Send a new WhatsApp message
whatsappRouter.post('/new-message', WhatsappController.sendWhatsAppMessages);

export default whatsappRouter;
