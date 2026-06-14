const fs = require('fs');
const path = require('path');

/**
 * 从 manifest.json 读取版本号
 * @returns {string} 当前版本号
 */
function getVersion() {
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  return manifest.version;
}

/**
 * 更新版本号
 * @param {string} type - 版本类型：major, minor, patch
 * @returns {string} 新版本号
 */
function bumpVersion(type = 'patch') {
  const manifestPath = path.join(__dirname, '..', 'manifest.json');
  const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
  const [major, minor, patch] = manifest.version.split('.').map(Number);

  let newVersion;
  switch (type) {
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
    default:
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
  }

  manifest.version = newVersion;
  fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));

  console.log(`Version bumped to ${newVersion}`);
  return newVersion;
}

/**
 * 生成 CHANGELOG 条目
 * @param {string} version - 版本号
 */
function generateChangelog(version) {
  const date = new Date().toISOString().split('T')[0];
  const changelogPath = path.join(__dirname, '..', 'CHANGELOG.md');

  let changelog = '';
  if (fs.existsSync(changelogPath)) {
    changelog = fs.readFileSync(changelogPath, 'utf8');
  }

  const newEntry = `## [${version}] - ${date}

### Added
-

### Changed
-

### Fixed
-

`;

  changelog = newEntry + changelog;
  fs.writeFileSync(changelogPath, changelog);

  console.log(`CHANGELOG updated for version ${version}`);
}

// 命令行接口
const command = process.argv[2];
const versionType = process.argv[3] || 'patch';

switch (command) {
  case 'get':
    console.log(getVersion());
    break;
  case 'bump':
    const newVersion = bumpVersion(versionType);
    generateChangelog(newVersion);
    break;
  default:
    console.log('Usage:');
    console.log('  node scripts/version.js get');
    console.log('  node scripts/version.js bump [major|minor|patch]');
}
