import User from "../models/User.js";
import Profile from "../models/Profile.js";
import Service from "../models/Service.js";
import AuditLog from "../models/AuditLog.js";
import Notification from "../models/Notification.js";
import bcrypt from "bcryptjs";

const allUsers = async (req, res) => {
  try {
    const page = req.params?.page;
    const perPage = req.params?.perPage;
    const q = req.query?.q;

    const options = {
      page: page,
      limit: perPage,
      sort: { createdAt: -1 },
    };

    const query = {
      email: q,
      isDeleted: false,
    };

    if (q && q.length) {
      const users = await User.paginate(query, options);

      if (users) {
        return res.send({
          status: "success",
          data: users,
        });
      } else {
        return res.send({
          status: "error",
          message: "Fetching users with query failed",
        });
      }
    } else {
      const users = await User.paginate({ isDeleted: false }, options);

      if (users) {
        for (const user of users?.docs) {
          user.toObject();
          const profile = await Profile.findOne({ email: user.email });
          user.profile = profile;
        }

        return res.send({
          status: "success",
          data: users,
        });
      } else {
        res.send({
          status: "error",
          message: "Fetching users failed",
        });
      }
    }
  } catch (e) {
    return res.send({
      status: "error",
      message: e.toString(),
    });
  }
};

const selectUserByEmail = async (req, res) => {
  try {
    const { email } = req.params;
    const user = await User.findOne({ email });

    if (!user) {
      return res.send({
        status: "error",
        data: "No user with the specified email",
      });
    }

    res.status(200).send({
      status: "success",
      data: user,
    });
  } catch (err) {
    console.log(err);
  }
};

const editUser = async (req, res) => {
  try {
    const { email, payload } = req.body;
    const user = await User.findOneAndUpdate({ email }, payload, { new: true });

    if (!user) {
      return res.send({
        status: "error",
        data: "No user with the specified email",
      });
    }

    res.status(200).send({
      status: "success",
      data: user,
    });
  } catch (err) {
    console.log(err);
  }
};

const selectUserById = async (req, res) => {
  try {
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) {
      return res.send({
        status: "error",
        data: "No user with that id",
      });
    }

    res.status(200).send({
      status: "success",
      data: user,
    });
  } catch (err) {
    console.log(err);
  }
};

const deleteUser = async (req, res) => {
  try {
    const { email } = req.body;
    const user = await User.find({ email });

    if (!user) {
      return res.status(404).send({
        status: "error",
        msg: "User not found",
      });
    }

    const deletedUser = await User.findOneAndDelete({ email });

    if (deletedUser) {
      return res.send({
        status: "success",
        msg: "User deleted",
      });
    } else {
      return res.send({
        status: "error",
        msg: "User not deleted successfully",
      });
    }
  } catch (e) {
    return res.send({
      status: "error",
      message: e.toString(),
    });
  }
};

const getServices = async (req, res) => {
  try {
    let services = await Service.find({}).sort({ category: 1, displayName: 1 });

    // Seed if empty
    if (services.length === 0) {
      const defaultServices = [
        { name: 'airtime', displayName: 'Airtime', category: 'utilities', description: 'Mobile airtime top-up for all networks', isActive: true },
        { name: 'data', displayName: 'Data Bundle', category: 'utilities', description: 'Mobile data bundles for all networks', isActive: true },
        { name: 'electricity', displayName: 'Electricity', category: 'utilities', description: 'Bill payment for electricity distribution companies', isActive: true },
        { name: 'cable', displayName: 'Cable TV', category: 'lifestyle', description: 'Subscription for DSTV, GOTV, Startimes', isActive: true },
        { name: 'education', displayName: 'Education', category: 'lifestyle', description: 'JAMB, WAEC pins and result checkers', isActive: true },
        { name: 'betting', displayName: 'Sports Betting', category: 'lifestyle', description: 'Fund betting wallets', isActive: true },
        { name: 'flight', displayName: 'Flight Booking', category: 'lifestyle', description: 'Book local and international flights', isActive: true },
        { name: 'international_airtime', displayName: 'Int\'l Airtime', category: 'utilities', description: 'Top up mobile numbers worldwide', isActive: true },
        { name: 'virtual_account', displayName: 'Virtual Account', category: 'financial', description: 'Dedicated virtual accounts for funding', isActive: true },
        { name: 'withdrawals', displayName: 'Withdrawals', category: 'financial', description: 'Bank transfers and withdrawals', isActive: true },
      ];

      services = await Service.insertMany(defaultServices);
    }

    res.status(200).json({
      status: 'success',
      data: services
    });
  } catch (error) {
    console.error('Get services error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch services'
    });
  }
};

const toggleService = async (req, res) => {
  try {
    const { id, isActive } = req.body;

    const service = await Service.findByIdAndUpdate(
      id,
      { isActive },
      { new: true }
    );

    if (!service) {
      return res.status(404).json({
        status: 'error',
        message: 'Service not found'
      });
    }

    // Create Audit Log
    if (req.user) {
      await AuditLog.create({
        admin: req.user.userId,
        action: 'TOGGLE_SERVICE',
        target: service.displayName,
        targetModel: 'Service',
        details: `Toggled service ${service.displayName} to ${isActive ? 'Active' : 'Inactive'}`,
        metadata: { serviceId: service._id, previousState: !isActive, newState: isActive },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
      });
    }

    res.status(200).json({
      status: 'success',
      data: service
    });
  } catch (error) {
    console.error('Toggle service error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update service status'
    });
  }
};

const getAuditLogs = async (req, res) => {
  try {
    const { page = 1, limit = 15, search, action, startDate, endDate } = req.query;

    const query = {};

    // Filter by search term
    if (search) {
      query.$or = [
        { details: { $regex: search, $options: 'i' } },
        { target: { $regex: search, $options: 'i' } }
      ];
    }

    // Filter by action
    if (action) {
      query.action = { $regex: action, $options: 'i' };
    }

    // Filter by date range
    if (startDate || endDate) {
      query.createdAt = {};
      if (startDate) query.createdAt.$gte = new Date(startDate);
      if (endDate) query.createdAt.$lte = new Date(endDate);
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: { path: 'admin', select: 'firstName lastName email' }
    };

    const logs = await AuditLog.paginate(query, options);

    res.status(200).json({
      status: 'success',
      data: logs
    });
  } catch (error) {
    console.error('Get audit logs error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch audit logs'
    });
  }
};

const getKYCRequests = async (req, res) => {
  try {
    const { page = 1, limit = 15, status } = req.query;

    // Build query
    const query = {};
    if (status && status !== 'all') {
      // Frontend sends 'submitted' for pending with docs, but backend uses 'pending'
      if (status === 'submitted') {
        query.kycStatus = 'pending';
        query['kycDocuments.0'] = { $exists: true };
      } else {
        query.kycStatus = status;
      }
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { 'kycDocuments.uploadedAt': -1, createdAt: -1 }
    };

    // Find profiles directly as they contain the KYC info
    let profiles = await Profile.paginate(query, options);

    // Seed a dummy request if viewing pending/submitted and empty
    if (profiles.totalDocs === 0 && (status === 'pending' || status === 'submitted')) {
      const user = await User.findOne({ email: 'admin@surepay.com' });
      if (user) {
        await Profile.findOneAndUpdate(
          { email: 'admin@surepay.com' },
          {
            kycStatus: 'pending',
            kycLevel: 1,
            kycDocuments: [{
              type: 'national_id',
              url: 'https://placehold.co/600x400/png?text=National+ID+Front',
              status: 'pending',
              uploadedAt: new Date()
            }]
          },
          { upsert: true, new: true }
        );
        // Refresh query
        profiles = await Profile.paginate(query, options);
      }
    }

    res.status(200).json({
      status: 'success',
      data: profiles.docs,
      pagination: {
        totalDocs: profiles.totalDocs,
        totalPages: profiles.totalPages,
        page: profiles.page,
        limit: profiles.limit
      }
    });
  } catch (error) {
    console.error('Get KYC requests error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch KYC requests'
    });
  }
};

const updateKYCStatus = async (req, res) => {
  try {
    const { userId, status, rejectionReason } = req.body; // userId here is actually profile._id based on frontend

    // Update profile
    const updateData = {
      kycStatus: status === 'approved' ? 'verified' : 'rejected' // Map frontend status to model status
    };

    if (status === 'rejected') {
      updateData.kycRejectionReason = rejectionReason;
    } else {
      updateData.kycLevel = 2; // Upgrade level on approval
      updateData.kycRejectionReason = null;
    }

    const profile = await Profile.findByIdAndUpdate(
      userId,
      updateData,
      { new: true }
    );

    if (!profile) {
      return res.status(404).json({
        status: 'error',
        message: 'Profile not found'
      });
    }

    // Update Documents Status
    if (profile.kycDocuments && profile.kycDocuments.length > 0) {
      profile.kycDocuments.forEach(doc => {
        if (doc.status === 'pending') {
          doc.status = status;
        }
      });
      await profile.save();
    }

    // Create Audit Log
    if (req.user) {
      await AuditLog.create({
        admin: req.user.userId,
        action: 'UPDATE_KYC',
        target: `${profile.firstName} ${profile.lastName}`,
        targetModel: 'Profile',
        details: `Updated KYC status to ${status}`,
        metadata: { profileId: profile._id, status, rejectionReason },
        ipAddress: req.ip || req.connection.remoteAddress,
        userAgent: req.get('User-Agent')
      });
    }

    res.status(200).json({
      status: 'success',
      data: profile
    });
  } catch (error) {
    console.error('Update KYC status error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update KYC status'
    });
  }
};

const getAdminNotifications = async (req, res) => {
  try {
    const { page = 1, limit = 15 } = req.query;

    // Auto-seed if empty (for admin specifically)
    const count = await Notification.countDocuments({ recipient: 'admin' });
    if (count === 0) {
      await Notification.create({
        recipient: 'admin',
        type: 'info',
        title: 'Welcome to Notification Center',
        message: 'This is where you can view system alerts and broadcast messages to users.',
        target: 'all',
        createdBy: req.user?.userId
      });
    }

    const options = {
      page: parseInt(page),
      limit: parseInt(limit),
      sort: { createdAt: -1 },
      populate: { path: 'createdBy', select: 'firstName lastName email' }
    };

    // Fetch all notifications created by admins or system alerts for admins
    // For this context, we'll fetch everything stored in 'notifications' collection as 'admin' notifications
    // or notifications intended for 'admin' recipient.
    // The frontend seems to treat this as a "History" of sent broadcasts + System Alerts.
    const notifications = await Notification.paginate({}, options);

    res.status(200).json({
      status: 'success',
      data: notifications.docs,
      pagination: {
        totalDocs: notifications.totalDocs,
        totalPages: notifications.totalPages,
        page: notifications.page,
        limit: notifications.limit
      }
    });
  } catch (error) {
    console.error('Get notifications error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch notifications'
    });
  }
};

const createNotification = async (req, res) => {
  try {
    const { title, message, type, target } = req.body;

    const notification = await Notification.create({
      recipient: 'admin', // Stored as admin history
      title,
      message,
      type,
      target,
      createdBy: req.user?.userId
    });

    // Audit Log
    if (req.user) {
      await AuditLog.create({
        admin: req.user.userId,
        action: 'CREATE_NOTIFICATION',
        target: title,
        targetModel: 'Notification',
        details: `Created broadcast notification: ${title}`,
        metadata: { notificationId: notification._id, target },
        ipAddress: req.ip,
        userAgent: req.get('User-Agent')
      });
    }

    res.status(201).json({
      status: 'success',
      data: notification
    });
  } catch (error) {
    console.error('Create notification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to create notification'
    });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    await Notification.findByIdAndDelete(id);

    res.status(200).json({
      status: 'success',
      message: 'Notification deleted'
    });
  } catch (error) {
    console.error('Delete notification error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to delete notification'
    });
  }
};

const updateProfile = async (req, res) => {
  try {
    const { firstName, lastName, phone, email } = req.body;
    const userId = req.user.userId;

    // Check if email is already taken by another user
    if (email) {
      const existingUser = await User.findOne({ email, _id: { $ne: userId } });
      if (existingUser) {
        return res.status(400).json({
          status: 'error',
          message: 'Email already in use'
        });
      }
    }

    const updatedUser = await User.findByIdAndUpdate(
      userId,
      { firstName, lastName, phone, email },
      { new: true, runValidators: true }
    ).select('-password');

    if (!updatedUser) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: updatedUser,
      message: 'Profile updated successfully'
    });
  } catch (error) {
    console.error('Update profile error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to update profile'
    });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword } = req.body;
    const userId = req.user.userId;

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    // Verify current password
    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      return res.status(400).json({
        status: 'error',
        message: 'Incorrect current password'
      });
    }

    // Hash new password
    const salt = await bcrypt.genSalt(10);
    const hashedPassword = await bcrypt.hash(newPassword, salt);

    user.password = hashedPassword;
    await user.save();

    // Log the change
    await AuditLog.create({
      admin: userId,
      action: 'CHANGE_PASSWORD',
      target: 'Self',
      targetModel: 'User',
      details: 'Changed account password',
      metadata: {},
      ipAddress: req.ip,
      userAgent: req.get('User-Agent')
    });

    res.status(200).json({
      status: 'success',
      message: 'Password changed successfully'
    });
  } catch (error) {
    console.error('Change password error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to change password'
    });
  }
};

const getMe = async (req, res) => {
  try {
    const userId = req.user.userId;

    const user = await User.findById(userId).select('-password');

    if (!user) {
      return res.status(404).json({
        status: 'error',
        message: 'User not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: user
    });
  } catch (error) {
    console.error('Get me error:', error);
    res.status(500).json({
      status: 'error',
      message: 'Failed to fetch user details'
    });
  }
};

export default {
  allUsers,
  deleteUser,
  selectUserByEmail,
  selectUserById,
  editUser,
  getServices,
  toggleService,
  getAuditLogs,
  getKYCRequests,
  updateKYCStatus,
  getAdminNotifications,
  createNotification,
  deleteNotification,
  updateProfile,
  changePassword,
  getMe
};
