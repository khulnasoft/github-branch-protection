/**
 * @license
 * ISC License
 * 
 * Copyright (c) 2023 KhulnaSoft, Ltd
 * 
 * Permission to use, copy, modify, and/or distribute this software for any
 * purpose with or without fee is hereby granted, provided that the above
 * copyright notice and this permission notice appear in all copies.
 * 
 * THE SOFTWARE IS PROVIDED "AS IS" AND THE AUTHOR DISCLAIMS ALL WARRANTIES
 * WITH REGARD TO THIS SOFTWARE INCLUDING ALL IMPLIED WARRANTIES OF
 * MERCHANTABILITY AND FITNESS. IN NO EVENT SHALL THE AUTHOR BE LIABLE FOR
 * ANY SPECIAL, DIRECT, INDIRECT, OR CONSEQUENTIAL DAMAGES OR ANY DAMAGES
 * WHATSOEVER RESULTING FROM LOSS OF USE, DATA OR PROFITS, WHETHER IN AN
 * ACTION OF CONTRACT, NEGLIGENCE OR OTHER TORTIOUS ACTION, ARISING OUT OF
 * OR IN CONNECTION WITH THE USE OR PERFORMANCE OF THIS SOFTWARE.
 */

const winston = require('winston');
const { format, transports } = winston;

/**
 * Logger utility module providing different log levels and formatter
 */
class Logger {
  constructor() {
    this.verbose = false;
    
    // Define custom formats
    const customFormats = format.combine(
      format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
      // Redact sensitive information
      format.printf(info => {
        let message = info.message;
        
        // Sanitize GitHub tokens from logs
        if (typeof message === 'string') {
          message = message
            .replace(/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED_TOKEN]')
            .replace(/github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g, '[REDACTED_TOKEN]')
            .replace(/Bearer [a-zA-Z0-9._-]+/g, 'Bearer [REDACTED]');
        }
        
        // Format the log message
        return `${info.timestamp} [${info.level.toUpperCase()}]: ${message}`;
      })
    );
    
    // Create the winston logger
    this.logger = winston.createLogger({
      level: 'info',
      format: customFormats,
      transports: [
        // Console transport
        new transports.Console(),
        // File transport for all logs
        new transports.File({ 
          filename: 'github-branch-protection.log',
          level: 'info'
        }),
        // Separate file for errors
        new transports.File({ 
          filename: 'github-branch-protection-error.log', 
          level: 'error' 
        })
      ]
    });
  }

  /**
   * Sets verbose mode on or off
   * @param {boolean} isVerbose - Whether to enable verbose logging
   */
  setVerbose(isVerbose) {
    this.verbose = !!isVerbose;
    this.logger.level = this.verbose ? 'debug' : 'info';
  }

  /**
   * Log a debug message (only in verbose mode)
   * @param {string} message - Message to log
   * @param {any} [meta] - Additional metadata
   */
  debug(message, meta) {
    if (this.verbose) {
      this.logger.debug(message, meta);
      
      // Also log to console if it's a readable message
      if (typeof message === 'string') {
        console.debug(`\x1b[36m[DEBUG]\x1b[0m ${message}`);
      }
    }
  }

  /**
   * Log an informational message
   * @param {string} message - Message to log
   * @param {any} [meta] - Additional metadata
   */
  info(message, meta) {
    this.logger.info(message, meta);
    
    // Also log to console for user feedback
    if (typeof message === 'string') {
      console.log(message);
    }
  }

  /**
   * Log a warning message
   * @param {string} message - Message to log
   * @param {any} [meta] - Additional metadata
   */
  warn(message, meta) {
    this.logger.warn(message, meta);
    
    // Also log to console with yellow color
    if (typeof message === 'string') {
      console.warn(`\x1b[33m[WARNING]\x1b[0m ${message}`);
    } else {
      console.warn(message);
    }
  }

  /**
   * Log an error message
   * @param {string} message - Message to log
   * @param {any} [error] - Error object or additional metadata
   */
  error(message, error) {
    // If error object is provided, extract and sanitize it
    let sanitizedError = error;
    
    if (error && typeof error === 'object') {
      // Create a sanitized copy of the error
      sanitizedError = {
        name: error.name,
        message: error.message,
        status: error.status,
        code: error.code
      };
      
      // Sanitize any tokens from error message
      if (sanitizedError.message && typeof sanitizedError.message === 'string') {
        sanitizedError.message = sanitizedError.message
          .replace(/ghp_[a-zA-Z0-9]{36}/g, '[REDACTED_TOKEN]')
          .replace(/github_pat_[a-zA-Z0-9]{22}_[a-zA-Z0-9]{59}/g, '[REDACTED_TOKEN]')
          .replace(/Bearer [a-zA-Z0-9._-]+/g, 'Bearer [REDACTED]');
      }
    }
    
    this.logger.error(message, sanitizedError);
    
    // Also log to console with red color
    if (typeof message === 'string') {
      console.error(`\x1b[31m[ERROR]\x1b[0m ${message}`);
      if (sanitizedError) {
        console.error(sanitizedError);
      }
    } else {
      console.error(message);
    }
  }
}

// Export a singleton instance
module.exports = new Logger();

