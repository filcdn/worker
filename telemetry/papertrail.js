/** Papertrail logging utility for sending logs to SolarWinds Papertrail */

class PapertrailLogger {
  /**
   * Constructor for PapertrailLogger
   *
   * @class
   * @param {string} apiToken - Papertrail API token
   * @param {string} environment - Environment name (e.g., dev, calibration)
   * @param {string} serviceName - Name of the service for logging
   */
  constructor(apiToken, environment, serviceName) {
    this.apiToken = apiToken
    this.endpoint = 'https://logs.collector.na-01.cloud.solarwinds.com/v1/logs'
    this.environment = environment
    this.serviceName = serviceName

    // Only need to determine if we're in production (calibration environment)
    this.isProduction = this.environment === 'calibration'
  }

  /**
   * Core logging functionality
   *
   * @private
   * @param {string} level - Log level (info, warn, error)
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  async _logCore(level, message, metadata = {}) {
    const logData = {
      time: new Date().toISOString(),
      level,
      message,
      service: this.serviceName,
      environment: this.environment,
      ...metadata,
    }

    // If not in production, just use console methods
    if (!this.isProduction) {
      // Use appropriate console method based on level
      if (level === 'error') {
        console.error(message, metadata)
      } else if (level === 'warn') {
        console.warn(message, metadata)
      } else if (level === 'info') {
        console.info(message, metadata)
      } else {
        console.log(message, metadata)
      }
      return
    }

    try {
      // Send to Papertrail
      const response = await fetch(this.endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/octet-stream',
          Authorization: `Bearer ${this.apiToken}`,
        },
        body: JSON.stringify(logData),
      })

      if (!response.ok) {
        // We do not throw an error here to avoid breaking the logger
        console.error(
          `Failed to send log to Papertrail: ${response.status} ${response.statusText}`,
        )
      }
    } catch (error) {
      // Don't throw errors from the logger itself
      console.error('Error sending log to Papertrail:', error)
    }
  }

  /**
   * Log a message with specified level
   *
   * @param {string} message - Log message
   * @param {Object} metadata - Additional metadata
   */
  log(message, metadata = {}) {
    this._logCore('log', message, metadata)
  }

  /**
   * Log an info message
   *
   * @param {string} message - Log message
   */
  info(message, metadata = {}) {
    this._logCore('info', message, metadata)
  }

  /**
   * Log a warning message
   *
   * @param {string} message - Log message
   */
  warn(message, metadata = {}) {
    this._logCore('warn', message, metadata)
  }

  /**
   * Log an error message
   *
   * @param {unknown} message - Log message
   */
  error(message, metadata = {}) {
    this._logCore(
      'error',
      typeof message === 'string' ? message : JSON.stringify(message),
      metadata,
    )
  }
}

/**
 * Create a logger instance
 *
 * @param {Env} env - Cloudflare Workers environment
 * @returns {PapertrailLogger | Console} Logger instance
 */
const createLogger = (env) => {
  if (!env || !env.PAPERTRAIL_API_TOKEN) {
    console.warn('PAPERTRAIL_API_TOKEN is not set, using console logger')
    return console
  }
  if (!env.ENVIRONMENT) {
    console.warn('ENVIRONMENT is not set, defaulting to "dev"')
  }
  if (!env.SERVICE_NAME) {
    console.warn('SERVICE_NAME is not set, defaulting to "unknown-service"')
  }
  return new PapertrailLogger(
    env.PAPERTRAIL_API_TOKEN,
    env.ENVIRONMENT ?? 'dev',
    env.SERVICE_NAME ?? 'unknown-service',
  )
}

export { createLogger, PapertrailLogger }
