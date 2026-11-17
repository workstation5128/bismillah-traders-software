'use strict';
/** Errors that are safe to show to the user. Anything else is logged and shown generically. */
class AppError extends Error {
  constructor(code, message, fields) {
    super(message);
    this.name = 'AppError';
    this.code = code;
    this.fields = fields || null;
  }
}
const bad = (message, fields) => new AppError('VALIDATION', message, fields);
const denied = (message = 'You do not have permission to do this.') => new AppError('FORBIDDEN', message);
const notFound = (message = 'Record not found.') => new AppError('NOT_FOUND', message);
const conflict = (message) => new AppError('CONFLICT', message);
module.exports = { AppError, bad, denied, notFound, conflict };
