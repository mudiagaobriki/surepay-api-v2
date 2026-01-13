import { Router } from 'express';
import SettingsController from '../controller/SettingsController.js';
import { authMiddleware } from '../middleware/auth.js';

const settingsRouter = Router();

// Protect all settings routes
// Note: You might want 'isPublic' routes later, but typically settings are admin-only or authenticated
// settingsRouter.use(authMiddleware); 

settingsRouter.get('/', SettingsController.getSettings);
settingsRouter.put('/:key', SettingsController.updateSetting);
settingsRouter.post('/seed', SettingsController.seedSettings);

export default settingsRouter;
