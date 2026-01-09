require('dotenv').config({ path: process.env.ENV_PATH || '/root/NovaCiv/.env' });
const { getDatabase } = require('../server/config/firebase-config');
const db = getDatabase(console);

db.ref('config/features').update({ youtubeUploadEnabled: false })
  .then(() => { console.log('✅ YouTube disabled'); process.exit(0); })
  .catch(e => { console.error('❌ Error:', e.message); console.error(e); process.exit(1); });
