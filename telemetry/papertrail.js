/**
 * Papertrail logging utility for sending logs to SolarWinds Papertrail
 */

class PapertrailLogger {
    /**
     * Constructor for PapertrailLogger
     * @param {Object} options - Configuration options
     * @param {string} options.apiToken - Papertrail API token
     * @param {string} options.environment - Environment name (e.g., dev, calibration)
     * @param {string} options.serviceName - Name of the service for logging
     * @constructor
     */
    constructor(options) {
        this.apiToken = options.apiToken;
        this.endpoint = 'https://logs.collector.na-01.cloud.solarwinds.com/v1/logs';
        this.environment = options.environment;
        this.serviceName = options.serviceName;

        // Only need to determine if we're in production (calibration environment)
        this.isProduction = this.environment === 'calibration';
    }

    /**
     * Core logging functionality
     * @param {string} level - Log level (info, warn, error)
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     * @private
     */
    async _logCore(level, message, metadata = {}) {
        const logData = {
            time: new Date().toISOString(),
            level,
            message,
            service: this.serviceName,
            environment: this.environment,
            ...metadata
        };

        // If not in production, just use console methods
        if (!this.isProduction) {
            // Use appropriate console method based on level
            if (level === 'error') {
                console.error(message, metadata);
            } else if (level === 'warn') {
                console.warn(message, metadata);
            } else if(level === 'info') {
                console.info(message, metadata);
            }
            else {
                console.log(message, metadata);
            }
            return;
        }

        // In production but no API token
        if (!this.apiToken ) {
            console.warn('Papertrail API token not configured');
        }

        try {
            // Send to Papertrail
            const response = await fetch(this.endpoint, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/octet-stream',
                    'Authorization': `Bearer ${this.apiToken}`
                },
                body: JSON.stringify(logData)
            });

            if (!response.ok) {
                throw new Error(`Failed to send log: ${response.status} ${response.statusText}`);
            }
        } catch (error) {
            // Don't throw errors from the logger itself
            console.error('Error sending log to Papertrail:', error);
        }
    }

    /**
     * Log a message with specified level
     * @param {string} message - Log message
     * @param {Object} metadata - Additional metadata
     */
    log(message, metadata = {}) {
        this._logCore('log', message, metadata);
    }

    /**
     * Log an info message
     * @param {string} message - Log message
     */
    info(message, metadata = {}) {
        this._logCore('info', message, metadata);
    }

    /**
     * Log a warning message
     * @param {string} message - Log message
     */
    warn(message, metadata = {}) {
        this._logCore('warn', message, metadata);
    }

    /**
     * Log an error message
     * @param {unknown} message - Log message
     */
    error(message, metadata = {}) {
        this._logCore('error', typeof message === 'string'?message: JSON.stringify(message), metadata);
    }

    /**
     * Create a logger instance from environment variables in Cloudflare Workers
     * @param {Env} env - Cloudflare Workers environment
     * @returns {PapertrailLogger} Logger instance
     */
    static fromEnv(env) {
    // The name variable is typically injected by Cloudflare Workers
    // It comes from the name field in wrangler.toml
    const serviceName = env.SERVICE_NAME?? 'unknown-service';
    
    return new PapertrailLogger({
            apiToken: env.PAPERTRAIL_API_TOKEN || '',
            environment: env.ENVIRONMENT || 'dev',
            serviceName: serviceName
    });
    }
}

/**
 * Create a logger instance
 * @param {Env} env - Cloudflare Workers environment
 * @returns {PapertrailLogger} Logger instance
 */
const createLogger = (env ) => {
    return new PapertrailLogger({
        apiToken: env.PAPERTRAIL_API_TOKEN,
        environment: env.ENVIRONMENT,
        serviceName: env.SERVICE_NAME
    })
}

export { createLogger, PapertrailLogger };
