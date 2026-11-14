// Compatibility globals for near-api-js in the browser. process.env is the browser
// shim's empty object; server environment variables are never bundled.
import process from 'process/browser';
import { Buffer } from 'buffer';
export { process, Buffer };
