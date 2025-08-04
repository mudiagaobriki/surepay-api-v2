import { Router } from 'express';
import AdminControllerFactory from '../controller/AdminController.js';

const adminRouter = Router();
const AdminController = AdminControllerFactory;

// User listing with pagination and optional search
adminRouter.get('/all-users/:page/:perPage', AdminController.allUsers);

// Get user details
adminRouter.get('/user/:email', AdminController.selectUserByEmail);
adminRouter.get('/user-by-id/:id', AdminController.selectUserById);

// Modify user
adminRouter.post('/edit-user', AdminController.editUser);

// Delete user
adminRouter.post('/delete-user', AdminController.deleteUser);

export default adminRouter;
