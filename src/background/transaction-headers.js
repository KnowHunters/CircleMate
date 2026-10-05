import { ClientTransaction } from './vendor/x-client-transaction/transaction.js';
import { getOndemandFileUrl } from './vendor/x-client-transaction/utils.js';
// Public web-client boot assets only. Neither cookies nor transaction IDs are persisted.
export class TransactionHeaders {
  constructor(fetch, homeLoader = null) { this.fetch = fetch; this.homeLoader = homeLoader; this.entries = new Map(); }
  async get(origin, method, path, session) {
    let entry = this.entries.get(origin);
    if (!entry || Date.now() - entry.at > 3600000) {
      entry = { at: Date.now(), promise: this.load(origin, session) }; this.entries.set(origin, entry);
    }
    try { return await (await entry.promise).generateTransactionId(method, path); }
    catch (error) { this.entries.delete(origin); throw error; }
  }
  async load(origin, session) {
    let home; try { home = this.homeLoader ? await this.homeLoader(session) : await this.fetch(origin + '/home', { credentials:'include', signal:AbortSignal.timeout(20000) }); } catch { throw new Error('BOOT_READ_FAILED'); }
    if (!home.ok) throw new Error('X boot data unavailable');
    const html = await home.text(), url = getOndemandFileUrl(html);
    if (!url || !url.startsWith('https://abs.twimg.com/responsive-web/client-web/')) throw new Error('X transaction asset unavailable');
    const asset = await this.fetch(url, { credentials:'omit', signal:AbortSignal.timeout(20000) });
    if (!asset.ok) throw new Error('X transaction asset unavailable');
    try { return new ClientTransaction(html, await asset.text()); } catch { throw new Error('SEED_PARSE_FAILED'); }
  }
}
