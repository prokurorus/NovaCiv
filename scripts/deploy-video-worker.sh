cd /root/NovaCiv || { echo "❌ /root/NovaCiv not found"; exit 1; }

# убедимся, что .env есть
ls -la .env || { echo "❌ .env not found"; exit 1; }

# зависимости
npm ci

# создать config/features (если уже есть — пропустит)
node scripts/setup-firebase-config.js

# проверка чтения флагов
node -e "require('dotenv').config({path:'/root/NovaCiv/.env'}); const {getDatabase}=require('./server/config/firebase-config'); const db=getDatabase(console); db.ref('config/features').once('value').then(s=>{console.log('features:',s.val()); process.exit(0);}).catch(e=>{console.error(e); process.exit(1);});"

# перезапуск воркера
pm2 restart nova-video --update-env || pm2 start server/video-worker.js --name nova-video
pm2 save

# показать логи
pm2 logs nova-video --lines 120
