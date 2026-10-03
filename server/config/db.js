import dns from 'node:dns';
import mongoose from 'mongoose';

// A "mongodb+srv://" address needs a DNS SRV lookup. Some machines hand Node a local DNS server
// (a VPN, Docker or WSL adapter) that refuses it, even though the same lookup works everywhere else.
// If that happens we retry once with public resolvers. DNS_SERVERS=1.1.1.1,8.8.8.8 forces a choice.
const DNS_ERRORS = ['ECONNREFUSED', 'ETIMEOUT', 'ENOTFOUND', 'ESERVFAIL', 'ETIMEDOUT'];
const isSrvLookupError = (e) => e?.syscall === 'querySrv' || (DNS_ERRORS.includes(e?.code) && /querySrv/.test(String(e?.message)));

export async function connectDB(uri) {
  if (!uri) throw new Error('MONGO_URI is not set');
  if (process.env.DNS_SERVERS) dns.setServers(process.env.DNS_SERVERS.split(',').map((s) => s.trim()).filter(Boolean));
  try {
    await mongoose.connect(uri);
  } catch (e) {
    if (!uri.startsWith('mongodb+srv://') || !isSrvLookupError(e)) throw e;
    console.warn(`DNS SRV lookup failed with the system resolver (${e.code}). Retrying with public DNS (1.1.1.1, 8.8.8.8)...`);
    dns.setServers(['1.1.1.1', '8.8.8.8']);
    await mongoose.disconnect().catch(() => {});
    await mongoose.connect(uri);
  }
  return mongoose.connection;
}
