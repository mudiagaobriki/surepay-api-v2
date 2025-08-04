import * as Sentry from '@sentry/node';
import * as Tracing from '@sentry/tracing';
import express from 'express';

/**
 * Initialize Sentry
 * @param {express.Application} app - Express application
 */
export const initSentry = (app) => {
  // Only initialize Sentry if DSN is provided
  if (!process.env.SENTRY_DSN) {
    console.warn('Sentry DSN not found in environment variables. Sentry will not be initialized.');
    return;
  }

  Sentry.init({
    dsn: process.env.SENTRY_DSN,
    environment: process.env.NODE_ENV || 'development',
    integrations: [
      // Enable HTTP calls tracing
      new Sentry.Integrations.Http({ tracing: true }),
      // Enable Express.js middleware tracing
      new Tracing.Integrations.Express({ app }),
    ],
    // Set tracesSampleRate to 1.0 to capture 100% of transactions for performance monitoring
    // We recommend adjusting this value in production
    tracesSampleRate: process.env.NODE_ENV === 'production' ? 0.2 : 1.0,
  });

  // The request handler must be the first middleware on the app
  app.use(Sentry.Handlers.requestHandler());

  // TracingHandler creates a trace for every incoming request
  app.use(Sentry.Handlers.tracingHandler());

  console.log(`Sentry initialized for ${process.env.NODE_ENV} environment`);
};

/**
 * Add Sentry error handler to Express app
 * @param {express.Application} app - Express application
 */
export const addSentryErrorHandler = (app) => {
  if (!process.env.SENTRY_DSN) {
    return;
  }

  // The error handler must be before any other error middleware and after all controllers
  app.use(Sentry.Handlers.errorHandler());

  // Optional fallthrough error handler
  app.use((err, req, res, next) => {
    // The error id is attached to `res.sentry` to be returned and optionally displayed to the user
    const eventId = res.sentry;

    console.error('Unhandled error:', err);

    res.status(500).json({
      error: 'Internal server error',
      ...(eventId && { sentryEventId: eventId }),
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    });
  });
};

/**
 * Capture exception with additional context
 * @param {Error} error - The error to capture
 * @param {Object} additionalData - Additional data to include
 * @param {Object} user - User information
 */
export const captureException = (error, additionalData = {}, user = null) => {
  if (!process.env.SENTRY_DSN) {
    console.error('Error (not sent to Sentry):', error);
    console.error('Additional data:', additionalData);
    return;
  }

  Sentry.withScope((scope) => {
    // Add additional data as tags or extra context
    if (additionalData) {
      Object.keys(additionalData).forEach((key) => {
        scope.setExtra(key, additionalData[key]);
      });
    }

    // Set user information if provided
    if (user) {
      scope.setUser({
        id: user.id,
        email: user.email,
        username: user.username,
      });
    }

    Sentry.captureException(error);
  });
};

export default {
  initSentry,
  addSentryErrorHandler,
  captureException,
};