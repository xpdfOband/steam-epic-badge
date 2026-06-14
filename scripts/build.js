const fs = require('fs');
const path = require('path');

/**
 * 复制文件到构建目录
 * @param {string} src - 源路径
 * @param {string} dest - 目标路径
 */
function copyFile(src, dest) {
  const destDir = path.dirname(dest);
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }
  fs.copyFileSync(src, dest);
}

/**
 * 复制目录到构建目录
 * @param {string} srcDir - 源目录
 * @param {string} destDir - 目标目录
 */
function copyDirectory(srcDir, destDir) {
  if (!fs.existsSync(destDir)) {
    fs.mkdirSync(destDir, { recursive: true });
  }

  const entries = fs.readdirSync(srcDir, { withFileTypes: true });

  for (const entry of entries) {
    const srcPath = path.join(srcDir, entry.name);
    const destPath = path.join(destDir, entry.name);

    if (entry.isDirectory()) {
      copyDirectory(srcPath, destPath);
    } else {
      copyFile(srcPath, destPath);
    }
  }
}

/**
 * 主构建函数
 */
function build() {
  const rootDir = path.join(__dirname, '..');
  const distDir = path.join(rootDir, 'dist');

  console.log('Starting build...');

  // 清理 dist 目录
  if (fs.existsSync(distDir)) {
    fs.rmSync(distDir, { recursive: true });
  }
  fs.mkdirSync(distDir, { recursive: true });

  // 需要复制的文件和目录
  const filesToCopy = [
    'manifest.json',
    'background.js',
    'content.js',
    'content.css',
    'popup.html',
    'popup.js',
    'popup.css'
  ];

  const dirsToCopy = [
    'utils',
    'data',
    'icons'
  ];

  // 复制文件
  for (const file of filesToCopy) {
    const srcPath = path.join(rootDir, file);
    if (fs.existsSync(srcPath)) {
      copyFile(srcPath, path.join(distDir, file));
      console.log(`Copied: ${file}`);
    }
  }

  // 复制目录
  for (const dir of dirsToCopy) {
    const srcPath = path.join(rootDir, dir);
    if (fs.existsSync(srcPath)) {
      copyDirectory(srcPath, path.join(distDir, dir));
      console.log(`Copied directory: ${dir}`);
    }
  }

  console.log('Build completed successfully!');
}

// 执行构建
build();
