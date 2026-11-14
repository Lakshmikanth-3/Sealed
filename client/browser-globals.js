// Compatibility globals for the wallet SDK only. process.env is the browser
// shim's empty object; server environment variables are never bundled.
import process from 'process/browser';
import { Buffer } from 'buffer';
export { process, Buffer };
