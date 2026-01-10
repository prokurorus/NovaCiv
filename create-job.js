require('dotenv').config({ path: process.env.ENV_PATH || '/root/NovaCiv/.env' });
const { getDatabase } = require('./server/config/firebase-config');
const db = getDatabase(console);

const job = {
  createdAt: Date.now(),
  language: 'en',
  title: 'NovaCiv test upload (YT)',
  topic: 'Test upload to YouTube',
  caption: 'NovaCiv — https://novaciv.space',
  script: 'NovaCiv is a digital civilization without rulers. Decisions are made openly by citizens. Visit novaciv.space.',
  targets: ['youtube','telegram'],
  status: 'pending'
};

db.ref('videoJobs').push(job).then(ref => {
  console.log('✅ job created:', ref.key);
  process.exit(0);
}).catch(e => { console.error('❌', e); process.exit(1); });
