/**
 * Unit tests for response-helpers utility module
 */

const { 
  sendError, 
  sendSuccess, 
  sendCreated, 
  sendNotFound, 
  sendBadRequest,
  handleDatabaseError 
} = require('../../backend/utils/response-helpers');

describe('Response Helpers Utility', () => {
  let mockRes;

  beforeEach(() => {
    mockRes = {
      status: jest.fn().mockReturnThis(),
      json: jest.fn().mockReturnThis(),
      send: jest.fn().mockReturnThis()
    };
  });

  describe('sendError', () => {
    test('should send error response with default 500 status', () => {
      sendError(mockRes, undefined, 'Test error');
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Test error',
        timestamp: expect.any(String)
      });
    });

    test('should send error response with custom status', () => {
      sendError(mockRes, 404, 'Not found');
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Not found',
        timestamp: expect.any(String)
      });
    });

    test('should include details when provided', () => {
      const details = { code: 'VALIDATION_ERROR' };
      sendError(mockRes, 400, 'Validation failed', details);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: details,
        timestamp: expect.any(String)
      });
    });
  });

  describe('sendSuccess', () => {
    test('should send success response with default 200 status', () => {
      const data = { id: 1, name: 'test' };
      sendSuccess(mockRes, data);
      
      expect(mockRes.status).toHaveBeenCalledWith(200);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: data,
        timestamp: expect.any(String)
      });
    });

    test('should include message when provided', () => {
      const data = { id: 1 };
      sendSuccess(mockRes, data, 'Operation successful');
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: data,
        message: 'Operation successful',
        timestamp: expect.any(String)
      });
    });

    test('should use custom status code', () => {
      sendSuccess(mockRes, null, 'Created', 201);
      
      expect(mockRes.status).toHaveBeenCalledWith(201);
    });
  });

  describe('sendCreated', () => {
    test('should send 201 created response', () => {
      const data = { id: 1, name: 'new item' };
      sendCreated(mockRes, data);
      
      expect(mockRes.status).toHaveBeenCalledWith(201);
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: data,
        message: 'Resource created successfully',
        timestamp: expect.any(String)
      });
    });

    test('should use custom message', () => {
      sendCreated(mockRes, { id: 1 }, 'Feed created');
      
      expect(mockRes.json).toHaveBeenCalledWith({
        success: true,
        data: { id: 1 },
        message: 'Feed created',
        timestamp: expect.any(String)
      });
    });
  });

  describe('sendNotFound', () => {
    test('should send 404 not found response with default message', () => {
      sendNotFound(mockRes);
      
      expect(mockRes.status).toHaveBeenCalledWith(404);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Resource not found',
        timestamp: expect.any(String)
      });
    });

    test('should use custom resource name', () => {
      sendNotFound(mockRes, 'Feed');
      
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Feed not found',
        timestamp: expect.any(String)
      });
    });
  });

  describe('sendBadRequest', () => {
    test('should send 400 bad request response', () => {
      sendBadRequest(mockRes, 'Invalid input');
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Invalid input',
        timestamp: expect.any(String)
      });
    });

    test('should include validation errors', () => {
      const validationErrors = { url: 'URL is required' };
      sendBadRequest(mockRes, 'Validation failed', validationErrors);
      
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Validation failed',
        details: validationErrors,
        timestamp: expect.any(String)
      });
    });
  });

  describe('handleDatabaseError', () => {
    test('should handle generic database errors', () => {
      const error = new Error('Database connection failed');
      handleDatabaseError(mockRes, error, 'fetch users');
      
      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Failed to fetch users',
        details: {
          message: 'Database connection failed',
          code: undefined
        },
        timestamp: expect.any(String)
      });
    });

    test('should handle constraint violations', () => {
      const error = new Error('Constraint violation');
      error.code = 'SQLITE_CONSTRAINT';
      handleDatabaseError(mockRes, error, 'create user');
      
      expect(mockRes.status).toHaveBeenCalledWith(400);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Data constraint violation',
        details: { code: 'SQLITE_CONSTRAINT' },
        timestamp: expect.any(String)
      });
    });

    test('should handle connection errors', () => {
      const error = new Error('Connection refused');
      error.code = 'ECONNREFUSED';
      handleDatabaseError(mockRes, error, 'update record');
      
      expect(mockRes.status).toHaveBeenCalledWith(503);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Database connection failed',
        details: { code: 'ECONNREFUSED' },
        timestamp: expect.any(String)
      });
    });
  });
});