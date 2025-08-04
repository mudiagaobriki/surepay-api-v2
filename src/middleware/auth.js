import jwt from "jsonwebtoken";
import User from "../models/User.js";

const config = process.env;

/**
 * Authentication middleware
 * Verifies JWT token and attaches user data to request
 * @param {Object} req - Request object
 * @param {Object} res - Response object
 * @param {Function} next - Next middleware function
 */
const authMiddleware = async (req, res, next) => {
  // Get token from various sources
  let token = req.body.loginToken ||
      req.query.loginToken ||
      req.headers["x-access-token"];

  // Check Authorization header for Bearer token
  const authHeader = req.headers.authorization;
  if (!token && authHeader && authHeader.startsWith('Bearer ')) {
    token = authHeader.split(' ')[1];
  }

  // If no token found, return error
  if (!token) {
    return res.status(401).json({ message: "Authentication required. Please provide a valid token." });
  }

  try {
    // Verify token
    const decoded = jwt.verify(token, config.JWT_SECRET);

    // Find user by ID (optional, adds extra security)
    const user = await User.findById(decoded.user_id).select('-password -loginToken');

    if (!user) {
      return res.status(401).json({ message: "User not found or token invalid." });
    }

    // Attach user info to request for use in controllers
    req.user = {
      id: user._id.toString(),
      email: user.email,
      ...user._doc
    };

  } catch (err) {
    console.error("Token verification error:", err.message);

    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ message: "Token has expired. Please login again." });
    }

    return res.status(401).json({ message: "Invalid token. Please login again." });
  }

  return next();
};

/**
 * Type-based access control middleware
 * Use after authMiddleware to restrict access based on user type
 * @param {Array} types - Array of allowed user types
 */
const typeMiddleware = (types) => {
  return (req, res, next) => {
    if (!req.user || !req.user.type) {
      return res.status(401).json({ message: "Authentication required" });
    }

    if (!types.includes(req.user.type)) {
      return res.status(403).json({
        message: "You do not have permission to access this resource"
      });
    }

    next();
  };
};

export { authMiddleware, typeMiddleware };