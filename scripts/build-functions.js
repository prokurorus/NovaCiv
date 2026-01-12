const esbuild = require('esbuild');
const path = require('path');
const fs = require('fs');
const { execSync } = require('child_process');

const functionsDir = path.join(__dirname, '..', 'netlify', 'functions');
const outputDir = path.join(__dirname, '..', '.netlify-functions-build');

// Создаём директорию для бандлов
if (!fs.existsSync(outputDir)) {
  fs.mkdirSync(outputDir, { recursive: true });
}

const functions = ['ops-run-now', 'fetch-news', 'news-cron'];

async function buildFunction(functionName) {
  const entryPoint = path.join(functionsDir, `${functionName}.js`);
  const outfile = path.join(outputDir, `${functionName}.js`);
  
  try {
    await esbuild.build({
      entryPoints: [entryPoint],
      bundle: true,
      platform: 'node',
      target: 'node18',
      format: 'cjs',
      outfile: outfile,
      external: ['ffmpeg-static', 'openai'],
    });
    
    console.log(`✓ ${functionName} bundled`);
    return true;
  } catch (error) {
    console.error(`✗ ${functionName} bundling failed:`, error.message);
    return false;
  }
}

async function checkFunction(functionName) {
  const outfile = path.join(outputDir, `${functionName}.js`);
  
  if (!fs.existsSync(outfile)) {
    console.error(`✗ ${functionName} bundle not found`);
    return false;
  }
  
  try {
    execSync(`node --check "${outfile}"`, { stdio: 'pipe' });
    console.log(`✓ ${functionName} syntax check passed`);
    return true;
  } catch (e) {
    console.error(`✗ ${functionName} syntax check failed`);
    return false;
  }
}

async function main() {
  console.log('Building Netlify Functions...\n');
  
  let allBuilt = true;
  for (const func of functions) {
    const built = await buildFunction(func);
    if (!built) allBuilt = false;
  }
  
  if (!allBuilt) {
    console.error('\n✗ Some functions failed to build');
    process.exit(1);
  }
  
  console.log('\nChecking syntax...\n');
  
  let allChecked = true;
  for (const func of functions) {
    const checked = await checkFunction(func);
    if (!checked) allChecked = false;
  }
  
  if (!allChecked) {
    console.error('\n✗ Some functions failed syntax check');
    process.exit(1);
  }
  
  console.log('\n✓ All functions built and checked successfully');
}

main().catch((error) => {
  console.error('Fatal error:', error);
  process.exit(1);
});
