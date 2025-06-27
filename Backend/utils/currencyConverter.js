import { get } from 'axios';

// In-memory cache to store conversion rates for a few hours to avoid excessive API calls.
const ratesCache = {
    // e.g., 'USD-LKR': { rate: 305.50, timestamp: 1678886400000 }
};
const CACHE_DURATION = 4 * 60 * 60 * 1000; // 4 hours in milliseconds

/**
 * Fetches a currency conversion rate, using a cache to improve performance.
 * @param {string} from - The base currency code (e.g., 'USD')
 * @param {string} to - The target currency code (e.g., 'LKR')
 * @returns {Promise<number>} - The conversion rate.
 */
async function getConversionRate(from, to) {
    if (from === to) {
        return 1;
    }

    const apiKey = process.env.EXCHANGERATE_API_KEY;
    if (!apiKey) {
        console.error('ExchangeRate API key is missing. Please add it to the .env file.');
        // Fallback to a default/mock value or throw an error
        throw new Error('Currency conversion service is not configured.');
    }
    
    const cacheKey = `${from}-${to}`;
    const cachedEntry = ratesCache[cacheKey];

    // Check if a valid, non-expired rate exists in the cache
    if (cachedEntry && (Date.now() - cachedEntry.timestamp < CACHE_DURATION)) {
        console.log(`Using cached rate for ${cacheKey}`);
        return cachedEntry.rate;
    }

    console.log(`Fetching new rate for ${cacheKey} from API...`);
    const url = `https://v6.exchangerate-api.com/v6/${apiKey}/pair/${from}/${to}`;

    try {
        const response = await get(url);

        if (response.data && response.data.result === 'success') {
            const rate = response.data.conversion_rate;

            // Store the new rate in the cache
            ratesCache[cacheKey] = {
                rate: rate,
                timestamp: Date.now()
            };

            return rate;
        } else {
            throw new Error(response.data['error-type'] || 'Failed to get conversion data.');
        }
    } catch (error) {
        console.error(`Currency conversion API call failed for ${cacheKey}:`, error.message);
        // If the API fails, you could return the last known cached value if it exists, or throw
        if (cachedEntry) {
            console.warn(`API call failed. Re-using stale cache for ${cacheKey}.`);
            return cachedEntry.rate;
        }
        throw new Error('Could not fetch currency conversion rate.');
    }
}

export default { getConversionRate };