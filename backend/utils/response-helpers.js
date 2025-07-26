/**
 * Response Helper Utilities
 * 
 * Standardized HTTP response helpers for consistent API responses across the application.
 * Reduces code duplication and ensures consistent error/success response formats.
 */

/**
 * Sends a standardized error response
 * @param {Object} res - Express response object
 * @param {number} statusCode - HTTP status code (default: 500)
 * @param {string} message - Error message
 * @param {Object} details - Optional additional error details
 */
function sendError(res, statusCode = 500, message = 'Internal server error', details = null) {
  const errorResponse = {
    error: message,
    timestamp: new Date().toISOString()
  };
  
  if (details) {
    errorResponse.details = details;
  }
  
  return res.status(statusCode).json(errorResponse);
}

/**
 * Sends a standardized success response
 * @param {Object} res - Express response object
 * @param {*} data - Response data
 * @param {string} message - Optional success message
 * @param {number} statusCode - HTTP status code (default: 200)
 */
function sendSuccess(res, data, message = null, statusCode = 200) {
  const successResponse = {
    success: true,
    data: data,
    timestamp: new Date().toISOString()
  };
  
  if (message) {
    successResponse.message = message;
  }
  
  return res.status(statusCode).json(successResponse);
}

/**
 * Sends a standardized created response (201)
 * @param {Object} res - Express response object
 * @param {*} data - Created resource data
 * @param {string} message - Optional success message
 */
function sendCreated(res, data, message = 'Resource created successfully') {
  return sendSuccess(res, data, message, 201);
}

/**
 * Sends a standardized no content response (204)
 * @param {Object} res - Express response object
 */
function sendNoContent(res) {
  return res.status(204).send();
}

/**
 * Sends a standardized not found response (404)
 * @param {Object} res - Express response object
 * @param {string} resource - Name of the resource not found
 */
function sendNotFound(res, resource = 'Resource') {
  return sendError(res, 404, `${resource} not found`);
}

/**
 * Sends a standardized bad request response (400)
 * @param {Object} res - Express response object
 * @param {string} message - Validation error message
 * @param {Object} validationErrors - Optional validation error details
 */
function sendBadRequest(res, message = 'Bad request', validationErrors = null) {
  return sendError(res, 400, message, validationErrors);
}

/**
 * Sends a standardized unauthorized response (401)
 * @param {Object} res - Express response object
 * @param {string} message - Authorization error message
 */
function sendUnauthorized(res, message = 'Unauthorized access') {
  return sendError(res, 401, message);
}

/**
 * Sends a standardized forbidden response (403)
 * @param {Object} res - Express response object
 * @param {string} message - Forbidden error message
 */
function sendForbidden(res, message = 'Access forbidden') {
  return sendError(res, 403, message);
}

/**
 * Handles database errors with appropriate responses
 * @param {Object} res - Express response object
 * @param {Error} error - Database error object
 * @param {string} operation - Description of the database operation
 */
function handleDatabaseError(res, error, operation = 'database operation') {
  console.error(`Database error during ${operation}:`, error);
  
  // Check for specific database errors
  if (error.code === 'SQLITE_CONSTRAINT') {
    return sendBadRequest(res, 'Data constraint violation', { code: error.code });
  }
  
  if (error.code === 'ENOTFOUND' || error.code === 'ECONNREFUSED') {
    return sendError(res, 503, 'Database connection failed', { code: error.code });
  }
  
  return sendError(res, 500, `Failed to ${operation}`, { 
    message: error.message,
    code: error.code 
  });
}

/**
 * Wraps async route handlers to catch errors automatically
 * @param {Function} fn - Async route handler function
 * @returns {Function} Wrapped function with error handling
 */
function asyncHandler(fn) {
  return (req, res, next) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
}

/**
 * Creates a standardized pagination response
 * @param {Object} res - Express response object
 * @param {Array} data - Paginated data array
 * @param {number} page - Current page number
 * @param {number} limit - Items per page
 * @param {number} total - Total number of items
 */
function sendPaginated(res, data, page = 1, limit = 10, total = 0) {
  const totalPages = Math.ceil(total / limit);
  const hasNextPage = page < totalPages;
  const hasPrevPage = page > 1;
  
  return sendSuccess(res, {
    items: data,
    pagination: {
      page,
      limit,
      total,
      totalPages,
      hasNextPage,
      hasPrevPage
    }
  });
}

module.exports = {
  sendError,
  sendSuccess,
  sendCreated,
  sendNoContent,
  sendNotFound,
  sendBadRequest,
  sendUnauthorized,
  sendForbidden,
  handleDatabaseError,
  asyncHandler,
  sendPaginated
};